import type { VercelRequest, VercelResponse } from '@vercel/node';
import fs from 'node:fs';
import * as pathModule from 'node:path';
import { OAuth2Client } from 'google-auth-library';
import { GoogleGenAI, Type } from '@google/genai';
import youtubedl from 'youtube-dl-exec';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const APP_URL = process.env.APP_URL || 'http://localhost:3000';
const REDIRECT_URI = `${APP_URL}/auth/google/callback`;
const SHORTS_MAX_SECONDS = 61;
const LONG_FORM_MIN_SECONDS = 120;
const THUMBNAIL_AUTH_COOKIE = 'tube_vision_thumbnail_authorizations';
const THUMBNAIL_AUTH_MAX_ITEMS = 40;

function isMissingConfigValue(value?: string): boolean {
  if (!value || !value.trim()) return true;
  const normalized = value.trim().toLowerCase();
  return (
    normalized.includes('your_google_client') ||
    normalized.includes('placeholder') ||
    normalized.includes('changeme')
  );
}

const OAUTH_MISSING_VARS = [
  ['GOOGLE_CLIENT_ID', GOOGLE_CLIENT_ID],
  ['GOOGLE_CLIENT_SECRET', GOOGLE_CLIENT_SECRET],
]
  .filter(([, value]) => isMissingConfigValue(value as string))
  .map(([name]) => name);

const COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const COOKIE_BASE_OPTIONS = APP_URL.startsWith('https://')
  ? `Path=/; HttpOnly; SameSite=None; Secure; Max-Age=${COOKIE_MAX_AGE_SECONDS}`
  : `Path=/; HttpOnly; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE_SECONDS}`;

function createOAuthClient() {
  return new OAuth2Client(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, REDIRECT_URI);
}

const oauth2Client = createOAuthClient();

/**
 * Get Gemini API key from request header (BYOK model)
 * Never logs, persists, or echoes the key
 */
function getGeminiKeyFromRequest(req: VercelRequest): string {
  const apiKey = req.headers['x-gemini-key'] as string;
  
  if (!apiKey || !apiKey.trim()) {
    throw new Error('Gemini API key required. Please configure your key in Settings.');
  }
  
  return apiKey.trim();
}

function toNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

const COACH_ALERT_CACHE_TTL_MS = 20 * 60 * 1000;
const COACH_ALERT_LOOKBACK_DAYS = 90;
const COACH_STOP_WORDS = new Set([
  'about', 'after', 'again', 'also', 'another', 'because', 'before', 'being', 'could', 'every', 'first',
  'from', 'have', 'history', 'into', 'just', 'make', 'more', 'most', 'next', 'other', 'over', 'part',
  'really', 'should', 'some', 'than', 'that', 'their', 'there', 'these', 'they', 'this', 'those', 'through',
  'today', 'video', 'videos', 'what', 'when', 'where', 'which', 'while', 'with', 'your', 'youtube', 'why',
]);
const coachInsightAlertCache = new Map<string, { expiresAt: number; payload: any }>();

type CoachVideoSignal = {
  id: string;
  title: string;
  publishedAt: string;
  publishedAtMs: number;
  views: number;
  likes: number;
  comments: number;
  retentionPct: number | null;
  signalScore: number;
  tokens: string[];
};

type CoachTopicInsight = {
  topicToken: string;
  topicLabel: string;
  recent: CoachVideoSignal[];
  baseline: CoachVideoSignal[];
  liftPercent: number;
  retentionLiftPercent: number | null;
  usesRetention: boolean;
};

function average(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function toTopicLabel(token: string): string {
  return token
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function extractTopicTokens(title: string): string[] {
  const normalized = String(title || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 4 && !COACH_STOP_WORDS.has(token));

  return [...new Set(normalized)].slice(0, 8);
}

function buildFallbackIdeas(topicLabel: string, channelTitle: string): string[] {
  const audience = channelTitle?.trim() || 'your audience';
  return [
    `${topicLabel} myths your viewers still believe in 2026`,
    `${topicLabel}: 3 mistakes ${audience} should avoid this week`,
    `Beginner-to-advanced ${topicLabel} roadmap in one video`,
  ];
}

function pickBestTopicInsight(signals: CoachVideoSignal[]): CoachTopicInsight | null {
  if (signals.length < 6) return null;

  const recentWindow = signals.slice(0, 12);
  const candidateTokens = new Set(recentWindow.flatMap((signal) => signal.tokens));
  let best: CoachTopicInsight | null = null;
  let bestComparisonLift = Number.NEGATIVE_INFINITY;

  for (const token of candidateTokens) {
    const recentMatches = recentWindow.filter((signal) => signal.tokens.includes(token)).slice(0, 3);
    if (recentMatches.length < 3) continue;

    const baselineMatches = signals
      .filter((signal) => signal.tokens.includes(token) && !recentMatches.some((item) => item.id === signal.id))
      .slice(0, 3);

    let baseline = baselineMatches;
    if (baseline.length < 3) {
      baseline = signals
        .filter((signal) => !recentMatches.some((item) => item.id === signal.id))
        .slice(0, 3);
    }
    if (baseline.length < 3) continue;

    const recentSignalAverage = average(recentMatches.map((signal) => signal.signalScore));
    const baselineSignalAverage = average(baseline.map((signal) => signal.signalScore));
    if (baselineSignalAverage <= 0) continue;

    const liftPercent = ((recentSignalAverage - baselineSignalAverage) / baselineSignalAverage) * 100;

    const recentRetentionValues = recentMatches
      .map((signal) => signal.retentionPct)
      .filter((value): value is number => typeof value === 'number' && value > 0);
    const baselineRetentionValues = baseline
      .map((signal) => signal.retentionPct)
      .filter((value): value is number => typeof value === 'number' && value > 0);

    let retentionLiftPercent: number | null = null;
    let usesRetention = false;

    if (recentRetentionValues.length >= 2 && baselineRetentionValues.length >= 2) {
      const recentRetentionAverage = average(recentRetentionValues);
      const baselineRetentionAverage = average(baselineRetentionValues);
      if (baselineRetentionAverage > 0) {
        retentionLiftPercent = ((recentRetentionAverage - baselineRetentionAverage) / baselineRetentionAverage) * 100;
        usesRetention = true;
      }
    }

    const comparisonLift = usesRetention && retentionLiftPercent !== null ? retentionLiftPercent : liftPercent;
    if (comparisonLift > bestComparisonLift) {
      bestComparisonLift = comparisonLift;
      best = {
        topicToken: token,
        topicLabel: toTopicLabel(token),
        recent: recentMatches,
        baseline,
        liftPercent,
        retentionLiftPercent,
        usesRetention,
      };
    }
  }

  if (!best) return null;

  const bestLift = best.usesRetention && best.retentionLiftPercent !== null
    ? best.retentionLiftPercent
    : best.liftPercent;

  if (bestLift >= 5) {
    return best;
  }

  const fallbackRecent = signals.slice(0, 3);
  const fallbackBaseline = signals.slice(3, 6);
  if (fallbackRecent.length < 3 || fallbackBaseline.length < 3) {
    return null;
  }

  const fallbackToken = fallbackRecent.flatMap((signal) => signal.tokens)[0] || 'content';
  const fallbackRecentAvg = average(fallbackRecent.map((signal) => signal.signalScore));
  const fallbackBaselineAvg = average(fallbackBaseline.map((signal) => signal.signalScore));
  if (fallbackBaselineAvg <= 0) {
    return null;
  }

  const fallbackLift = ((fallbackRecentAvg - fallbackBaselineAvg) / fallbackBaselineAvg) * 100;
  if (fallbackLift < 5) {
    return null;
  }

  return {
    topicToken: fallbackToken,
    topicLabel: toTopicLabel(fallbackToken),
    recent: fallbackRecent,
    baseline: fallbackBaseline,
    liftPercent: fallbackLift,
    retentionLiftPercent: null,
    usesRetention: false,
  };
}

function parseISODurationToSeconds(duration: string): number {
  if (!duration) return 0;
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;

  const hours = Number(match[1] || 0);
  const minutes = Number(match[2] || 0);
  const seconds = Number(match[3] || 0);
  return hours * 3600 + minutes * 60 + seconds;
}

function formatDurationLabel(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function readJsonBody(req: VercelRequest): any {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return req.body;
}

type ThumbnailAuthorizationCookieItem = {
  ownershipKey: string;
  videoId: string;
  videoTitle: string;
  currentThumbnailUrl: string;
  proposedTextOverlay: string;
  titleTreatment: string;
  layoutDescription: string;
  colorDirection: string;
  thumbnailImagePrompt: string;
  projectedCtrLiftPercent: number;
  swapPriority: number;
  status: string;
  approvedAt: string;
};

function getThumbnailOwnershipKey(userData: any): string {
  if (userData?.channel?.id) {
    return `channel:${userData.channel.id}`;
  }
  if (userData?.id) {
    return `user:${userData.id}`;
  }
  return 'anonymous';
}

function readThumbnailAuthorizationsFromCookies(req: VercelRequest): ThumbnailAuthorizationCookieItem[] {
  const cookies = req.headers.cookie || '';
  const queueCookie = getCookieValue(cookies, THUMBNAIL_AUTH_COOKIE);
  if (!queueCookie) {
    return [];
  }

  try {
    const parsed = JSON.parse(decodeURIComponent(queueCookie));
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed;
  } catch {
    return [];
  }
}

function setThumbnailAuthorizationsCookie(res: VercelResponse, queue: ThumbnailAuthorizationCookieItem[]) {
  const bounded = queue.slice(-THUMBNAIL_AUTH_MAX_ITEMS);
  const cookieValue = encodeURIComponent(JSON.stringify(bounded));
  res.setHeader('Set-Cookie', `${THUMBNAIL_AUTH_COOKIE}=${cookieValue}; ${COOKIE_BASE_OPTIONS}`);
}

function getCookieValue(cookieHeader: string, name: string): string | null {
  const prefix = `${name}=`;
  for (const chunk of cookieHeader.split(';')) {
    const trimmed = chunk.trim();
    if (trimmed.startsWith(prefix)) {
      return trimmed.slice(prefix.length);
    }
  }
  return null;
}

function readAccountsFromCookies(req: VercelRequest) {
  const cookies = req.headers.cookie || '';
  const accountsCookie = getCookieValue(cookies, 'tube_vision_accounts');
  const activeCookie = getCookieValue(cookies, 'tube_vision_active');

  if (!accountsCookie) {
    return { accounts: [] as any[], activeIndex: 0 };
  }

  try {
    const accounts = JSON.parse(decodeURIComponent(accountsCookie));
    let activeIndex = activeCookie ? parseInt(activeCookie, 10) : 0;
    if (!Number.isInteger(activeIndex) || activeIndex < 0 || activeIndex >= accounts.length) {
      activeIndex = 0;
    }
    return { accounts, activeIndex };
  } catch {
    return { accounts: [] as any[], activeIndex: 0 };
  }
}

async function getAuthHeaderForAccount(userData: any) {
  const refreshToken = userData?.tokens?.refresh_token;
  const fallbackAccessToken = userData?.tokens?.access_token;

  if (refreshToken) {
    const client = createOAuthClient();
    client.setCredentials({ refresh_token: refreshToken });
    const token = (await client.getAccessToken())?.token;
    if (token) {
      return { Authorization: `Bearer ${token}` };
    }
  }

  if (fallbackAccessToken) {
    return { Authorization: `Bearer ${fallbackAccessToken}` };
  }

  throw new Error('No OAuth token available for active account');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const path = Array.isArray(req.query?.path) ? req.query.path.join('/') : req.query?.path || '';

  // Config endpoint
  if (path === 'api/auth/config') {
    return res.json({
      appUrl: APP_URL,
      redirectUri: REDIRECT_URI,
      nodeEnv: process.env.NODE_ENV || 'development',
      hasClientId: Boolean(GOOGLE_CLIENT_ID),
      hasClientSecret: Boolean(GOOGLE_CLIENT_SECRET),
      missingVars: OAUTH_MISSING_VARS,
    });
  }

  // OAuth URL generator
  if (path === 'api/auth/google/url') {
    console.log(`[Auth URL Request] REDIRECT_URI: ${REDIRECT_URI}`);

    if (OAUTH_MISSING_VARS.length > 0) {
      console.error(`[Auth Error] Missing OAuth vars: ${OAUTH_MISSING_VARS.join(', ')}`);
      return res.status(500).json({
        error: 'Google OAuth credentials not configured',
        missingEnv: OAUTH_MISSING_VARS,
      });
    }

    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: [
        'https://www.googleapis.com/auth/youtube.readonly',
        'https://www.googleapis.com/auth/yt-analytics.readonly',
        'https://www.googleapis.com/auth/userinfo.profile',
      ],
      prompt: 'consent',
    });
    console.log(`[Auth URL Generated] URL contains redirect_uri: ${url.includes(REDIRECT_URI)}`);
    return res.json({ url });
  }

  // OAuth entry point for marketing site and direct YouTube auth flow
  if (path === 'auth/youtube') {
    console.log(`[YouTube Auth Entry] Initiating OAuth flow`);
    
    if (OAUTH_MISSING_VARS.length > 0) {
      console.error(`[Auth Error] Missing OAuth vars: ${OAUTH_MISSING_VARS.join(', ')}`);
      return res.status(500).send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Configuration Error</title>
            <style>
              body {
                font-family: system-ui, sans-serif;
                display: flex;
                align-items: center;
                justify-content: center;
                min-height: 100vh;
                margin: 0;
                background: #f5f5f5;
              }
              .container {
                background: white;
                padding: 32px;
                border-radius: 8px;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
                max-width: 500px;
                text-align: center;
              }
              h1 { color: #d32f2f; margin: 0 0 16px 0; }
              p { color: #666; margin: 0; }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>Configuration Error</h1>
              <p>Google OAuth credentials are not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.</p>
            </div>
          </body>
        </html>
      `);
    }

    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: [
        'https://www.googleapis.com/auth/youtube.readonly',
        'https://www.googleapis.com/auth/yt-analytics.readonly',
        'https://www.googleapis.com/auth/userinfo.profile',
      ],
      prompt: 'consent',
    });
    
    console.log(`[YouTube Auth Entry] Redirecting to Google OAuth`);
    return res.redirect(307, url);
  }

  // OAuth callback
  if (path === 'auth/google/callback' || path === 'api/auth/google/callback') {
    const { code } = req.query;

    if (!code) {
      return res.status(400).send('No code provided');
    }

    try {
      const { tokens } = await oauth2Client.getToken(code as string);
      oauth2Client.setCredentials(tokens);

      // Fetch user profile and channel info
      const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      const userInfo = await userInfoResponse.json();

      const youtubeResponse = await fetch(
        'https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true',
        {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        }
      );
      const youtubeData = await youtubeResponse.json();
      const channel = youtubeData.items?.[0];

      const { accounts } = readAccountsFromCookies(req);
      const existingAccount = accounts.find((acc: any) => {
        if (channel?.id && acc.channel?.id) {
          return acc.channel.id === channel.id;
        }
        return acc.id === userInfo.id;
      });

      // Store refresh token only to keep cookie small enough for multi-account support.
      const compactTokens = tokens.refresh_token
        ? { refresh_token: tokens.refresh_token }
        : existingAccount?.tokens?.refresh_token
          ? { refresh_token: existingAccount.tokens.refresh_token }
          : tokens.access_token
            ? { access_token: tokens.access_token }
            : null;

      if (!compactTokens) {
        return res.status(400).send('Google did not return a usable OAuth token.');
      }

      const newUserData = {
        id: userInfo.id,
        name: userInfo.name,
        picture: userInfo.picture,
        tokens: compactTokens,
        channel: channel
          ? {
              id: channel.id,
              title: channel.snippet.title,
              description: (channel.snippet.description || '').slice(0, 300),
              thumbnails: channel.snippet.thumbnails?.default
                ? { default: channel.snippet.thumbnails.default }
                : channel.snippet.thumbnails,
              statistics: {
                subscriberCount: channel.statistics?.subscriberCount || '0',
                viewCount: channel.statistics?.viewCount || '0',
                videoCount: channel.statistics?.videoCount || '0',
              },
            }
          : null,
      };

      console.log('[OAuth Callback] Existing accounts count:', accounts.length);
      console.log('[OAuth Callback] New channel ID:', newUserData.channel?.id || 'NO_CHANNEL');
      const existingIds = accounts.map((a: any) => a.channel?.id || 'NO_CHANNEL').join(', ');
      console.log('[OAuth Callback] Existing channel IDs:', existingIds);

      // Deduplicate by channel ID when available so one Google login can keep multiple channels.
      const updatedAccounts = accounts.filter((acc: any) => {
        if (newUserData.channel && acc.channel) {
          const isDuplicate = acc.channel.id === newUserData.channel.id;
          console.log('[OAuth Callback] Comparing channels - old=' + acc.channel.id + ' new=' + newUserData.channel.id + ' duplicate=' + isDuplicate);
          return !isDuplicate;
        }
        if (!newUserData.channel && !acc.channel) {
          const isDuplicate = acc.id === newUserData.id;
          console.log('[OAuth Callback] Comparing user IDs - duplicate=' + isDuplicate);
          return !isDuplicate;
        }
        console.log('[OAuth Callback] Mixed channel/no-channel - keeping both');
        return true;
      });
      updatedAccounts.unshift(newUserData);
      
      console.log('[OAuth Callback] Final account count after dedup:', updatedAccounts.length);
      console.log('[OAuth Callback] Final channel IDs:', updatedAccounts.map((a: any) => a.channel?.id || 'NO_CHANNEL').join(', '));

      // Keep account list bounded to prevent cookie bloat.
      const boundedAccounts = updatedAccounts.slice(0, 5);

      console.log('[OAuth Callback] Bounded account count:', boundedAccounts.length);
      
      // Store all accounts and set the active account index
      const cookieValue = encodeURIComponent(JSON.stringify(boundedAccounts));
      console.log('[OAuth Callback] Cookie value length:', cookieValue.length);
      
      res.setHeader('Set-Cookie', [
        `tube_vision_accounts=${cookieValue}; ${COOKIE_BASE_OPTIONS}`,
        `tube_vision_active=0; ${COOKIE_BASE_OPTIONS}`
      ]);
      
      console.log('[OAuth Callback] Cookies set successfully');

      return res.send(`
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8">
            <title>Authentication Successful</title>
            <style>
              body {
                margin: 0;
                padding: 20px;
                font-family: system-ui, -apple-system, sans-serif;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                display: flex;
                align-items: center;
                justify-content: center;
                min-height: 100vh;
                text-align: center;
              }
              .container {
                background: rgba(255, 255, 255, 0.1);
                border-radius: 12px;
                padding: 32px;
                backdrop-filter: blur(10px);
              }
              h1 { margin: 0 0 12px 0; font-size: 24px; }
              p { margin: 0; opacity: 0.9; }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>✓ Authentication Successful</h1>
              <p>Closing this window...</p>
            </div>
            <script>
              (function() {
                function closeWindow() {
                  if (window.opener) {
                    try {
                      window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, window.location.origin);
                    } catch (e) {
                      console.error('Failed to post message:', e);
                    }
                    window.close();
                    setTimeout(function() { window.close(); }, 100);
                    setTimeout(function() {
                      if (!window.closed) {
                        window.location.href = '/';
                      }
                    }, 1000);
                  } else {
                    window.location.href = '/';
                  }
                }
                closeWindow();
                if (document.readyState === 'loading') {
                  document.addEventListener('DOMContentLoaded', closeWindow);
                }
              })();
            </script>
          </body>
        </html>
      `);
    } catch (error) {
      console.error('OAuth error:', error);
      return res.status(500).send('Authentication failed');
    }
  }

  // Get user channel data
  if (path === 'api/user/channel') {
    const { accounts, activeIndex } = readAccountsFromCookies(req);
    if (accounts.length === 0) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const userData = accounts[activeIndex];
      
      if (!userData) {
        return res.status(401).json({ error: 'No active account' });
      }
      
      const { tokens, ...safeUser } = userData;
      return res.json(safeUser);
    } catch (error) {
      return res.status(401).json({ error: 'Invalid session' });
    }
  }

  // Daily AI script placeholder
  if (path === 'api/script/daily-placeholder') {
    const { accounts, activeIndex } = readAccountsFromCookies(req);
    if (accounts.length === 0) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const userData = accounts[activeIndex];
      if (!userData || !userData.channel) {
        return res.status(400).json({ error: 'No channel connected' });
      }

      const authHeader = await getAuthHeaderForAccount(userData);
      const dateKey = new Date().toISOString().slice(0, 10);
      const channelTitle = userData.channel.title || 'your niche';
      const channelDescription = String(userData.channel.description || '').slice(0, 700);

      let recentTitles: string[] = [];
      try {
        const recentResponse = await fetch(
          'https://www.googleapis.com/youtube/v3/search?part=snippet&forMine=true&type=video&maxResults=6&order=date',
          { headers: authHeader }
        );
        const recentData = await recentResponse.json();
        recentTitles = (recentData.items || [])
          .map((item: any) => item?.snippet?.title)
          .filter((title: unknown) => typeof title === 'string' && title.trim().length > 0)
          .slice(0, 6);
      } catch (fetchError) {
        console.error('Fetch recent videos for placeholder error:', fetchError);
      }

      try {
        if (!req.headers['x-gemini-key']) {
          throw new Error('Missing GEMINI_API_KEY');
        }

        const ai = new GoogleGenAI({ apiKey: getGeminiKeyFromRequest(req) });
        const prompt = `You are helping a YouTube creator start a new script draft.
Return exactly one concise topic placeholder (max 100 characters) tailored to this channel.
It should feel fresh for date ${dateKey} and be specific enough to spark a script.
Do not include quotes or numbering.

Channel title: ${channelTitle}
Channel description: ${channelDescription || 'No description'}
Recent videos: ${recentTitles.join(' | ') || 'No recent titles'}`;

        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                placeholder: { type: Type.STRING },
              },
              required: ['placeholder'],
            },
          },
        });

        const parsed = JSON.parse(response.text || '{}');
        const placeholder = String(parsed.placeholder || '').trim();

        if (!placeholder) {
          throw new Error('Placeholder was empty');
        }

        return res.json({
          placeholder,
          dateKey,
          channelId: userData.channel.id,
          source: 'ai',
        });
      } catch (error) {
        console.error('Generate daily script placeholder error:', error);

        const fallbackTopic = recentTitles[0] || channelTitle;
        return res.json({
          placeholder: `e.g., ${fallbackTopic}`,
          dateKey,
          channelId: userData.channel.id,
          source: 'fallback',
        });
      }
    } catch (error) {
      console.error('Daily script placeholder route error:', error);
      return res.status(500).json({ error: 'Failed to generate daily script placeholder' });
    }
  }

  // Proactive AI coaching insight alert
  if (path === 'api/coach/insight-alert') {
    const { accounts, activeIndex } = readAccountsFromCookies(req);
    if (accounts.length === 0) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const userData = accounts[activeIndex];
      if (!userData || !userData.channel?.id) {
        return res.status(400).json({ error: 'No channel connected' });
      }

      const channelId = String(userData.channel.id);
      const cachedAlert = coachInsightAlertCache.get(channelId);
      if (cachedAlert && cachedAlert.expiresAt > Date.now()) {
        return res.json({ ...cachedAlert.payload, cached: true });
      }

      const authHeader = await getAuthHeaderForAccount(userData);

      const searchResponse = await fetch(
        'https://www.googleapis.com/youtube/v3/search?part=snippet&forMine=true&type=video&maxResults=30&order=date',
        { headers: authHeader }
      );

      if (!searchResponse.ok) {
        const errorPayload = await searchResponse.json().catch(() => ({}));
        return res.status(searchResponse.status).json({
          error: errorPayload?.error?.message || 'Failed to fetch videos for insight analysis',
        });
      }

      const searchData = await searchResponse.json();
      const videoIds = (searchData.items || [])
        .map((item: any) => item?.id?.videoId)
        .filter((id: unknown) => typeof id === 'string' && id.trim())
        .slice(0, 30)
        .join(',');

      if (!videoIds) {
        return res.json({
          generatedAt: new Date().toISOString(),
          analysisWindowDays: COACH_ALERT_LOOKBACK_DAYS,
          cached: false,
          alert: null,
          message: 'Not enough video data for proactive insights yet.',
        });
      }

      const videosResponse = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${videoIds}`,
        { headers: authHeader }
      );

      if (!videosResponse.ok) {
        const errorPayload = await videosResponse.json().catch(() => ({}));
        return res.status(videosResponse.status).json({
          error: errorPayload?.error?.message || 'Failed to fetch detailed video data',
        });
      }

      const videosData = await videosResponse.json();
      const videos = Array.isArray(videosData.items) ? videosData.items : [];

      if (videos.length < 6) {
        return res.json({
          generatedAt: new Date().toISOString(),
          analysisWindowDays: COACH_ALERT_LOOKBACK_DAYS,
          cached: false,
          alert: null,
          message: 'Need at least 6 videos before proactive insight alerts can be generated.',
        });
      }

      const retentionByVideoId: Record<string, number> = {};

      try {
        const endDate = new Date().toISOString().slice(0, 10);
        const startDate = new Date(Date.now() - COACH_ALERT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000)
          .toISOString()
          .slice(0, 10);

        const analyticsResponse = await fetch(
          `https://youtubeanalytics.googleapis.com/v2/reports?ids=channel==MINE&startDate=${startDate}&endDate=${endDate}&metrics=views,averageViewPercentage&dimensions=video&sort=-views&maxResults=200`,
          { headers: authHeader }
        );

        if (analyticsResponse.ok) {
          const analyticsData = await analyticsResponse.json();
          const headers = Array.isArray(analyticsData.columnHeaders) ? analyticsData.columnHeaders : [];
          const rows = Array.isArray(analyticsData.rows) ? analyticsData.rows : [];

          const videoIndex = headers.findIndex((header: any) => header?.name === 'video');
          const retentionIndex = headers.findIndex((header: any) => header?.name === 'averageViewPercentage');

          if (videoIndex >= 0 && retentionIndex >= 0) {
            for (const row of rows) {
              const videoId = String(row?.[videoIndex] || '');
              const retentionValue = toNumber(row?.[retentionIndex]);
              if (videoId && retentionValue > 0) {
                retentionByVideoId[videoId] = retentionValue;
              }
            }
          }
        }
      } catch (analyticsError) {
        console.log('Coach insight analytics fallback to retention-proxy signals', analyticsError);
      }

      const now = Date.now();
      const signals: CoachVideoSignal[] = videos
        .map((video: any) => {
          const id = String(video?.id || '').trim();
          const title = String(video?.snippet?.title || '').trim();
          const publishedAt = String(video?.snippet?.publishedAt || '');
          const publishedAtMs = new Date(publishedAt).getTime();

          if (!id || !title || !Number.isFinite(publishedAtMs)) {
            return null;
          }

          const views = toNumber(video?.statistics?.viewCount);
          const likes = toNumber(video?.statistics?.likeCount);
          const comments = toNumber(video?.statistics?.commentCount);
          const retentionPct = typeof retentionByVideoId[id] === 'number' ? retentionByVideoId[id] : null;

          const ageDays = Math.max(1, (now - publishedAtMs) / (24 * 60 * 60 * 1000));
          const viewsPerDay = views / ageDays;
          const engagementRate = views > 0 ? ((likes + comments) / views) * 100 : 0;
          const signalScore = retentionPct !== null
            ? retentionPct
            : engagementRate * 8 + Math.log10(viewsPerDay + 1) * 14;

          return {
            id,
            title,
            publishedAt,
            publishedAtMs,
            views,
            likes,
            comments,
            retentionPct,
            signalScore,
            tokens: extractTopicTokens(title),
          };
        })
        .filter((signal: CoachVideoSignal | null): signal is CoachVideoSignal => Boolean(signal))
        .sort((a, b) => b.publishedAtMs - a.publishedAtMs)
        .slice(0, 24);

      const topicInsight = pickBestTopicInsight(signals);
      if (!topicInsight) {
        return res.json({
          generatedAt: new Date().toISOString(),
          analysisWindowDays: COACH_ALERT_LOOKBACK_DAYS,
          cached: false,
          alert: null,
          message: 'No strong positive trend detected yet. Keep publishing and check back soon.',
        });
      }

      const liftRaw = topicInsight.usesRetention && topicInsight.retentionLiftPercent !== null
        ? topicInsight.retentionLiftPercent
        : topicInsight.liftPercent;
      const liftPercent = Math.max(5, Math.round(liftRaw));
      const signalType = topicInsight.usesRetention ? 'retention' : 'retention-proxy';
      const channelTitle = String(userData.channel?.title || 'your channel').trim();

      let headline = `Your last 3 videos on ${topicInsight.topicLabel} had ${liftPercent}% higher retention signals.`;
      let summary = `This pattern indicates audience momentum. Double down on ${topicInsight.topicLabel} with follow-up angles while this interest is hot.`;
      let ideas = buildFallbackIdeas(topicInsight.topicLabel, channelTitle);

      if (req.headers['x-gemini-key']) {
        try {
          const ai = new GoogleGenAI({ apiKey: getGeminiKeyFromRequest(req) });
          const prompt = `You are generating a proactive YouTube coaching alert.

Important identity rule:
- VidVision is the app name, not the creator name.
- Creator channel name is "${channelTitle}".
- Never call the creator or audience "VidVision" or "VidVisionaries" unless channel name exactly matches VidVision.

Trend data:
- Topic with strongest positive momentum: ${topicInsight.topicLabel}
- Lift over baseline: ${liftPercent}%
- Signal type: ${signalType}
- Most recent 3 matching videos: ${topicInsight.recent.map((video) => video.title).join(' | ')}

Return JSON with:
1) headline: one sentence like "Your last 3 videos on X had Y% higher retention..."
2) summary: 1-2 short sentences that explain why this matters now
3) ideas: exactly 3 concrete video ideas to double down.`;

          const aiResponse = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  headline: { type: Type.STRING },
                  summary: { type: Type.STRING },
                  ideas: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                },
                required: ['headline', 'summary', 'ideas'],
              },
            },
          });

          const parsed = JSON.parse(aiResponse.text || '{}');
          const parsedHeadline = String(parsed?.headline || '').trim();
          const parsedSummary = String(parsed?.summary || '').trim();
          const parsedIdeas = Array.isArray(parsed?.ideas)
            ? parsed.ideas.map((idea: unknown) => String(idea || '').trim()).filter(Boolean)
            : [];

          if (parsedHeadline) {
            headline = parsedHeadline;
          }
          if (parsedSummary) {
            summary = parsedSummary;
          }
          if (parsedIdeas.length >= 3) {
            ideas = parsedIdeas.slice(0, 3);
          }
        } catch (aiError) {
          console.error('Coach insight AI generation error:', aiError);
        }
      }

      const alertId = `${channelId}:${topicInsight.topicToken}:${topicInsight.recent[0]?.id || Date.now()}`;
      const payload = {
        generatedAt: new Date().toISOString(),
        analysisWindowDays: COACH_ALERT_LOOKBACK_DAYS,
        cached: false,
        alert: {
          id: alertId,
          topic: topicInsight.topicLabel,
          liftPercent,
          signalType,
          headline,
          summary,
          ideas: ideas.slice(0, 3),
          supportingVideos: topicInsight.recent.map((video) => ({
            id: video.id,
            title: video.title,
            publishedAt: video.publishedAt,
            views: video.views,
            retentionPct: video.retentionPct,
          })),
        },
      };

      coachInsightAlertCache.set(channelId, {
        expiresAt: Date.now() + COACH_ALERT_CACHE_TTL_MS,
        payload,
      });

      return res.json(payload);
    } catch (error) {
      console.error('Coach insight alert error:', error);
      return res.status(500).json({ error: 'Failed to generate insight alert' });
    }
  }

  // Get all accounts
  if (path === 'api/user/accounts') {
    const { accounts, activeIndex } = readAccountsFromCookies(req);
    if (accounts.length === 0) {
      return res.json({ accounts: [], activeIndex: 0 });
    }

    try {
      // Send accounts without tokens for security
      const safeAccounts = accounts.map((acc: any) => {
        const { tokens, ...safe } = acc;
        return safe;
      });
      
      return res.json({ accounts: safeAccounts, activeIndex });
    } catch (error) {
      return res.json({ accounts: [], activeIndex: 0 });
    }
  }

  // Switch active account
  if (path === 'api/user/switch' && req.method === 'POST') {
    const { accounts } = readAccountsFromCookies(req);
    if (accounts.length === 0) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const body = req.body || {};
      const newIndex = body.index;
      
      if (typeof newIndex !== 'number') {
        return res.status(400).json({ error: 'Invalid index' });
      }

      if (newIndex < 0 || newIndex >= accounts.length) {
        return res.status(400).json({ error: 'Index out of range' });
      }

      res.setHeader('Set-Cookie', `tube_vision_active=${newIndex}; ${COOKIE_BASE_OPTIONS}`);
      
      return res.json({ success: true, activeIndex: newIndex });
    } catch (error) {
      return res.status(500).json({ error: 'Failed to switch account' });
    }
  }

  // Remove an account
  if (path === 'api/user/remove' && req.method === 'POST') {
    const state = readAccountsFromCookies(req);
    let accounts = state.accounts;
    let activeIndex = state.activeIndex;
    if (accounts.length === 0) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const body = req.body || {};
      const removeIndex = body.index;
      
      if (typeof removeIndex !== 'number') {
        return res.status(400).json({ error: 'Invalid index' });
      }

      if (removeIndex < 0 || removeIndex >= accounts.length) {
        return res.status(400).json({ error: 'Index out of range' });
      }

      // Remove the account
      accounts.splice(removeIndex, 1);

      // Adjust active index if necessary
      if (activeIndex >= accounts.length) {
        activeIndex = Math.max(0, accounts.length - 1);
      } else if (activeIndex > removeIndex) {
        activeIndex--;
      }

      if (accounts.length === 0) {
        // Clear cookies if no accounts left
        res.setHeader('Set-Cookie', [
          APP_URL.startsWith('https://')
            ? 'tube_vision_accounts=; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=0'
            : 'tube_vision_accounts=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0',
          APP_URL.startsWith('https://')
            ? 'tube_vision_active=; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=0'
            : 'tube_vision_active=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0'
        ]);
      } else {
        const cookieValue = encodeURIComponent(JSON.stringify(accounts));
        res.setHeader('Set-Cookie', [
          `tube_vision_accounts=${cookieValue}; ${COOKIE_BASE_OPTIONS}`,
          `tube_vision_active=${activeIndex}; ${COOKIE_BASE_OPTIONS}`
        ]);
      }
      
      return res.json({ success: true, activeIndex });
    } catch (error) {
      return res.status(500).json({ error: 'Failed to remove account' });
    }
  }

  // Get user videos
  if (path === 'api/user/videos') {
    const { accounts, activeIndex } = readAccountsFromCookies(req);
    if (accounts.length === 0) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const userData = accounts[activeIndex];
      
      if (!userData) {
        return res.status(401).json({ error: 'No active account' });
      }

      const authHeader = await getAuthHeaderForAccount(userData);
      
      const response = await fetch(
        'https://www.googleapis.com/youtube/v3/search?part=snippet&forMine=true&type=video&maxResults=50&order=date',
        { headers: authHeader }
      );
      const data = await response.json();
      
      // Fetch detailed statistics for each video
      const videoIds = data.items?.map((item: any) => item.id.videoId).join(',');
      if (videoIds) {
        const statsResponse = await fetch(
          `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${videoIds}`,
          { headers: authHeader }
        );
        const statsData = await statsResponse.json();
        return res.json(statsData.items);
      }
      
      return res.json([]);
    } catch (error) {
      console.error('Fetch videos error:', error);
      return res.status(500).json({ error: 'Failed to fetch videos' });
    }
  }

  // Update video title
  if (path.match(/^api\/user\/videos\/[^/]+\/title$/) && req.method === 'PUT') {
    const { accounts, activeIndex } = readAccountsFromCookies(req);
    if (accounts.length === 0) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const videoId = path.split('/')[3];
    const body = readJsonBody(req);
    const { title } = body;

    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Title is required' });
    }

    try {
      const userData = accounts[activeIndex];
      
      if (!userData) {
        return res.status(401).json({ error: 'No active account' });
      }

      const authHeader = await getAuthHeaderForAccount(userData);

      // First, get the current video details
      const getResponse = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}`,
        { headers: authHeader }
      );

      if (!getResponse.ok) {
        const errorData = await getResponse.json().catch(() => ({}));
        console.error('YouTube get video error:', errorData);
        return res.status(getResponse.status).json({ 
          error: errorData.error?.message || 'Failed to fetch video details' 
        });
      }

      const getData = await getResponse.json();
      if (!getData.items || getData.items.length === 0) {
        return res.status(404).json({ error: 'Video not found' });
      }

      const video = getData.items[0];
      
      // Update the video with new title
      const updatePayload = {
        id: videoId,
        snippet: {
          ...video.snippet,
          title: title.trim(),
          categoryId: video.snippet.categoryId,
        }
      };

      const updateResponse = await fetch(
        'https://www.googleapis.com/youtube/v3/videos?part=snippet',
        {
          method: 'PUT',
          headers: {
            ...authHeader,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(updatePayload),
        }
      );

      if (!updateResponse.ok) {
        const errorData = await updateResponse.json().catch(() => ({}));
        console.error('YouTube update video error:', errorData);
        return res.status(updateResponse.status).json({ 
          error: errorData.error?.message || 'Failed to update video title' 
        });
      }

      const updateData = await updateResponse.json();
      return res.json({ success: true, video: updateData });
    } catch (error) {
      console.error('Update video title error:', error);
      return res.status(500).json({ error: 'Failed to update video title' });
    }
  }

  // Bulk update video descriptions
  if (path === 'api/user/videos/bulk/description' && req.method === 'PUT') {
    const { accounts, activeIndex } = readAccountsFromCookies(req);
    if (accounts.length === 0) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const body = readJsonBody(req);
    const { videoIds, description, findReplace } = body;

    if (!videoIds || !Array.isArray(videoIds) || videoIds.length === 0) {
      return res.status(400).json({ error: 'Video IDs array is required' });
    }

    if (!description && !findReplace) {
      return res.status(400).json({ error: 'Either description or findReplace is required' });
    }

    const userData = accounts[activeIndex];
    if (!userData) {
      return res.status(401).json({ error: 'No active account' });
    }

    const authHeader = await getAuthHeaderForAccount(userData);
    const results = { success: [], failed: [] };

    for (const videoId of videoIds) {
      try {
        const getResponse = await fetch(
          `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}`,
          { headers: authHeader }
        );

        if (!getResponse.ok) {
          results.failed.push({ videoId, error: 'Failed to fetch video' });
          continue;
        }

        const getData = await getResponse.json();
        if (!getData.items || getData.items.length === 0) {
          results.failed.push({ videoId, error: 'Video not found' });
          continue;
        }

        const video = getData.items[0];
        let newDescription = description;

        // Apply find/replace if specified
        if (findReplace && findReplace.find && video.snippet.description) {
          newDescription = video.snippet.description.replace(
            new RegExp(findReplace.find, 'g'),
            findReplace.replace
          );
        }

        const updatePayload = {
          id: videoId,
          snippet: {
            ...video.snippet,
            description: newDescription || video.snippet.description,
            categoryId: video.snippet.categoryId,
          }
        };

        const updateResponse = await fetch(
          'https://www.googleapis.com/youtube/v3/videos?part=snippet',
          {
            method: 'PUT',
            headers: {
              ...authHeader,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(updatePayload),
          }
        );

        if (updateResponse.ok) {
          results.success.push(videoId);
        } else {
          const errorData = await updateResponse.json().catch(() => ({}));
          results.failed.push({ videoId, error: errorData.error?.message || 'Update failed' });
        }
      } catch (error: any) {
        results.failed.push({ videoId, error: error.message });
      }
    }

    return res.json(results);
  }

  // Bulk update video tags
  if (path === 'api/user/videos/bulk/tags' && req.method === 'PUT') {
    const { accounts, activeIndex } = readAccountsFromCookies(req);
    if (accounts.length === 0) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const body = readJsonBody(req);
    const { videoIds, tags, mode } = body;

    if (!videoIds || !Array.isArray(videoIds) || videoIds.length === 0) {
      return res.status(400).json({ error: 'Video IDs array is required' });
    }

    if (!tags || !Array.isArray(tags) || tags.length === 0) {
      return res.status(400).json({ error: 'Tags array is required' });
    }

    const updateMode = mode || 'replace'; // 'replace', 'append', 'prepend'
    const userData = accounts[activeIndex];
    if (!userData) {
      return res.status(401).json({ error: 'No active account' });
    }

    const authHeader = await getAuthHeaderForAccount(userData);
    const results = { success: [], failed: [] };

    for (const videoId of videoIds) {
      try {
        const getResponse = await fetch(
          `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}`,
          { headers: authHeader }
        );

        if (!getResponse.ok) {
          results.failed.push({ videoId, error: 'Failed to fetch video' });
          continue;
        }

        const getData = await getResponse.json();
        if (!getData.items || getData.items.length === 0) {
          results.failed.push({ videoId, error: 'Video not found' });
          continue;
        }

        const video = getData.items[0];
        let newTags = tags;

        if (updateMode === 'append') {
          newTags = [...(video.snippet.tags || []), ...tags];
        } else if (updateMode === 'prepend') {
          newTags = [...tags, ...(video.snippet.tags || [])];
        }
        // 'replace' mode uses tags as-is

        // Remove duplicates and limit to 500 tags (YouTube limit)
        newTags = [...new Set(newTags)].slice(0, 500);

        const updatePayload = {
          id: videoId,
          snippet: {
            ...video.snippet,
            tags: newTags,
            categoryId: video.snippet.categoryId,
          }
        };

        const updateResponse = await fetch(
          'https://www.googleapis.com/youtube/v3/videos?part=snippet',
          {
            method: 'PUT',
            headers: {
              ...authHeader,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(updatePayload),
          }
        );

        if (updateResponse.ok) {
          results.success.push(videoId);
        } else {
          const errorData = await updateResponse.json().catch(() => ({}));
          results.failed.push({ videoId, error: errorData.error?.message || 'Update failed' });
        }
      } catch (error: any) {
        results.failed.push({ videoId, error: error.message });
      }
    }

    return res.json(results);
  }

  // Get user analytics
  if (path === 'api/user/analytics') {
    const { accounts, activeIndex } = readAccountsFromCookies(req);
    if (accounts.length === 0) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const userData = accounts[activeIndex];
      
      if (!userData) {
        return res.status(401).json({ error: 'No active account' });
      }
      
      const endDate = new Date().toISOString().split('T')[0];
      const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const yesterdayDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const authHeader = await getAuthHeaderForAccount(userData);

      // Fetch daily analytics (always works)
      const reportsResponse = await fetch(
        `https://youtubeanalytics.googleapis.com/v2/reports?ids=channel==MINE&startDate=${startDate}&endDate=${endDate}&metrics=views,subscribersGained,subscribersLost,estimatedMinutesWatched&dimensions=day&sort=day`,
        { headers: authHeader }
      );
      const reportsData = await reportsResponse.json();

      if (reportsData.error) {
        console.error('YouTube Analytics API error:', reportsData.error);
        return res.status(403).json({
          error: reportsData.error.message || 'YouTube Analytics API error',
          code: reportsData.error.code,
          details: reportsData.error,
        });
      }

      // Try to fetch hourly data (may not be available for all channels)
      let hourlyData = { rows: [] };
      let todayHourlyData = { rows: [] };
      let yesterdayHourlyData = { rows: [] };

      try {
        const [hourlyResponse, todayHourlyResponse, yesterdayHourlyResponse] = await Promise.all([
          fetch(
            `https://youtubeanalytics.googleapis.com/v2/reports?ids=channel==MINE&startDate=${startDate}&endDate=${endDate}&metrics=views&dimensions=hour&sort=hour`,
            { headers: authHeader }
          ),
          fetch(
            `https://youtubeanalytics.googleapis.com/v2/reports?ids=channel==MINE&startDate=${endDate}&endDate=${endDate}&metrics=views&dimensions=hour&sort=hour`,
            { headers: authHeader }
          ),
          fetch(
            `https://youtubeanalytics.googleapis.com/v2/reports?ids=channel==MINE&startDate=${yesterdayDate}&endDate=${yesterdayDate}&metrics=views&dimensions=hour&sort=hour`,
            { headers: authHeader }
          ),
        ]);

        const hourlyJson = await hourlyResponse.json();
        const todayHourlyJson = await todayHourlyResponse.json();
        const yesterdayHourlyJson = await yesterdayHourlyResponse.json();

        // Only use hourly data if no errors
        if (!hourlyJson.error) hourlyData = hourlyJson;
        if (!todayHourlyJson.error) todayHourlyData = todayHourlyJson;
        if (!yesterdayHourlyJson.error) yesterdayHourlyData = yesterdayHourlyJson;
      } catch (hourlyError) {
        console.log('Hourly analytics not available, continuing with daily data only');
      }

      return res.json({
        daily: reportsData,
        hourly: hourlyData,
        todayHourly: todayHourlyData,
        yesterdayHourly: yesterdayHourlyData,
      });
    } catch (error) {
      console.error('Fetch analytics error:', error);
      return res.status(500).json({ error: 'Failed to fetch analytics' });
    }
  }

  // Best posting time recommendation
  if (path === 'api/user/best-posting-time') {
    const { accounts, activeIndex } = readAccountsFromCookies(req);
    if (accounts.length === 0) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const userData = accounts[activeIndex];
      if (!userData) {
        return res.status(401).json({ error: 'No active account' });
      }

      const authHeader = await getAuthHeaderForAccount(userData);

      const searchResponse = await fetch(
        'https://www.googleapis.com/youtube/v3/search?part=snippet&forMine=true&type=video&maxResults=50&order=date',
        { headers: authHeader }
      );
      const searchData = await searchResponse.json();

      const videoIds = searchData.items?.map((item: any) => item.id.videoId).filter(Boolean).join(',');
      if (!videoIds) {
        return res.json({
          bestHour: null,
          bestDay: null,
          confidence: 'low',
          message: 'Not enough video data to analyze posting patterns',
        });
      }

      const videosResponse = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${videoIds}`,
        { headers: authHeader }
      );
      const videosData = await videosResponse.json();
      const videos = videosData.items || [];

      if (videos.length < 5) {
        return res.json({
          bestHour: null,
          bestDay: null,
          confidence: 'low',
          message: 'Need at least 5 videos to analyze posting patterns',
        });
      }

      const hourlyPerformance: Record<number, { totalViews: number; totalEngagement: number; count: number; avgViewsPerDay: number }> = {};
      const dailyPerformance: Record<number, { totalViews: number; totalEngagement: number; count: number; avgViewsPerDay: number }> = {};
      const now = Date.now();

      for (const video of videos) {
        const publishedAt = new Date(video.snippet?.publishedAt || '');
        if (Number.isNaN(publishedAt.getTime())) {
          continue;
        }

        const hour = publishedAt.getUTCHours();
        const day = publishedAt.getUTCDay();

        const viewCount = toNumber(video.statistics?.viewCount);
        const likeCount = toNumber(video.statistics?.likeCount);
        const commentCount = toNumber(video.statistics?.commentCount);
        const engagement = likeCount + commentCount;
        const ageDays = Math.max(1, (now - publishedAt.getTime()) / (24 * 60 * 60 * 1000));
        const viewsPerDay = viewCount / ageDays;

        if (!hourlyPerformance[hour]) {
          hourlyPerformance[hour] = { totalViews: 0, totalEngagement: 0, count: 0, avgViewsPerDay: 0 };
        }
        hourlyPerformance[hour].totalViews += viewCount;
        hourlyPerformance[hour].totalEngagement += engagement;
        hourlyPerformance[hour].avgViewsPerDay += viewsPerDay;
        hourlyPerformance[hour].count += 1;

        if (!dailyPerformance[day]) {
          dailyPerformance[day] = { totalViews: 0, totalEngagement: 0, count: 0, avgViewsPerDay: 0 };
        }
        dailyPerformance[day].totalViews += viewCount;
        dailyPerformance[day].totalEngagement += engagement;
        dailyPerformance[day].avgViewsPerDay += viewsPerDay;
        dailyPerformance[day].count += 1;
      }

      const hourlyEntries = Object.entries(hourlyPerformance);
      const dailyEntries = Object.entries(dailyPerformance);
      if (hourlyEntries.length === 0 || dailyEntries.length === 0) {
        return res.json({
          bestHour: null,
          bestDay: null,
          confidence: 'low',
          message: 'Not enough valid publishing data to analyze patterns',
        });
      }

      let bestHour = 0;
      let bestHourScore = 0;
      for (const [hour, data] of hourlyEntries) {
        const score = data.avgViewsPerDay / data.count;
        if (score > bestHourScore) {
          bestHourScore = score;
          bestHour = parseInt(hour, 10);
        }
      }

      let bestDay = 0;
      let bestDayScore = 0;
      for (const [day, data] of dailyEntries) {
        const score = data.avgViewsPerDay / data.count;
        if (score > bestDayScore) {
          bestDayScore = score;
          bestDay = parseInt(day, 10);
        }
      }

      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const uniqueHours = hourlyEntries.length;
      let confidence: 'low' | 'medium' | 'high' = 'low';
      if (videos.length >= 20 && uniqueHours >= 5) {
        confidence = 'high';
      } else if (videos.length >= 10 && uniqueHours >= 3) {
        confidence = 'medium';
      }

      return res.json({
        bestHour,
        bestHourFormatted: `${String(bestHour).padStart(2, '0')}:00 UTC`,
        bestDay: dayNames[bestDay],
        bestDayIndex: bestDay,
        confidence,
        videosAnalyzed: videos.length,
        aiInsight: `Based on your recent uploads, ${dayNames[bestDay]} around ${String(bestHour).padStart(2, '0')}:00 UTC tends to drive the strongest daily view velocity.`,
        hourlyBreakdown: hourlyEntries
          .map(([hour, data]) => ({
            hour: parseInt(hour, 10),
            avgViewsPerDay: Math.round(data.avgViewsPerDay / data.count),
            videoCount: data.count,
          }))
          .sort((a, b) => b.avgViewsPerDay - a.avgViewsPerDay),
      });
    } catch (error) {
      console.error('Best posting time analysis error:', error);
      return res.status(500).json({ error: 'Failed to analyze best posting time' });
    }
  }

  // Thumbnail authorization queue
  if (path === 'api/thumbnails/authorizations') {
    const { accounts, activeIndex } = readAccountsFromCookies(req);
    if (accounts.length === 0) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const userData = accounts[activeIndex];
    if (!userData) {
      return res.status(401).json({ error: 'No active account' });
    }

    const ownershipKey = getThumbnailOwnershipKey(userData);
    const queue = readThumbnailAuthorizationsFromCookies(req)
      .filter((item) => item.ownershipKey === ownershipKey)
      .map(({ ownershipKey: _ownershipKey, ...item }) => item);

    return res.json(queue);
  }

  if (path === 'api/thumbnails/authorize' && req.method === 'POST') {
    const { accounts, activeIndex } = readAccountsFromCookies(req);
    if (accounts.length === 0) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const userData = accounts[activeIndex];
    if (!userData) {
      return res.status(401).json({ error: 'No active account' });
    }

    const {
      videoId,
      videoTitle,
      currentThumbnailUrl,
      proposedTextOverlay,
      titleTreatment,
      layoutDescription,
      colorDirection,
      thumbnailImagePrompt,
      projectedCtrLiftPercent,
      swapPriority,
      status,
    } = readJsonBody(req) || {};

    if (!videoId || !videoTitle) {
      return res.status(400).json({ error: 'videoId and videoTitle are required' });
    }

    const ownershipKey = getThumbnailOwnershipKey(userData);
    const queue = readThumbnailAuthorizationsFromCookies(req);
    const existingIndex = queue.findIndex(
      (item) => item.ownershipKey === ownershipKey && item.videoId === videoId
    );

    const payload: ThumbnailAuthorizationCookieItem = {
      ownershipKey,
      videoId,
      videoTitle,
      currentThumbnailUrl: currentThumbnailUrl || '',
      proposedTextOverlay: proposedTextOverlay || '',
      titleTreatment: titleTreatment || '',
      layoutDescription: layoutDescription || '',
      colorDirection: colorDirection || '',
      thumbnailImagePrompt: thumbnailImagePrompt || '',
      projectedCtrLiftPercent: toNumber(projectedCtrLiftPercent),
      swapPriority: toNumber(swapPriority || 50),
      status: status === 'applied' ? 'applied' : 'authorized',
      approvedAt: new Date().toISOString(),
    };

    if (existingIndex >= 0) {
      queue[existingIndex] = payload;
    } else {
      queue.push(payload);
    }

    setThumbnailAuthorizationsCookie(res, queue);

    const accountQueue = queue
      .filter((item) => item.ownershipKey === ownershipKey)
      .map(({ ownershipKey: _ownershipKey, ...item }) => item);

    const { ownershipKey: _removed, ...safePayload } = payload;
    return res.json({ success: true, item: safePayload, count: accountQueue.length, queue: accountQueue });
  }

  if (path === 'api/thumbnails/authorize/clear' && req.method === 'POST') {
    const { accounts, activeIndex } = readAccountsFromCookies(req);
    if (accounts.length === 0) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const userData = accounts[activeIndex];
    if (!userData) {
      return res.status(401).json({ error: 'No active account' });
    }

    const ownershipKey = getThumbnailOwnershipKey(userData);
    const queue = readThumbnailAuthorizationsFromCookies(req).filter(
      (item) => item.ownershipKey !== ownershipKey
    );

    setThumbnailAuthorizationsCookie(res, queue);
    return res.json({ success: true, count: 0, queue: [] });
  }

  // Shorts source videos from connected channel
  if (path === 'api/shorts/my-long-videos') {
    const { accounts, activeIndex } = readAccountsFromCookies(req);
    if (accounts.length === 0) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const userData = accounts[activeIndex];
      if (!userData) {
        return res.status(401).json({ error: 'No active account' });
      }

      const authHeader = await getAuthHeaderForAccount(userData);

      const searchResponse = await fetch(
        'https://www.googleapis.com/youtube/v3/search?part=snippet&forMine=true&type=video&maxResults=50&order=date',
        { headers: authHeader }
      );

      if (!searchResponse.ok) {
        const errorData = await searchResponse.json().catch(() => ({}));
        console.error('YouTube search API error:', errorData);
        return res.status(502).json({ error: 'Failed to fetch your channel videos from YouTube' });
      }

      const searchData = await searchResponse.json();
      const videoIds = searchData.items
        ?.map((item: any) => item.id?.videoId)
        .filter(Boolean)
        .join(',');

      if (!videoIds) {
        return res.json([]);
      }

      const videosResponse = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${videoIds}`,
        { headers: authHeader }
      );

      if (!videosResponse.ok) {
        const errorData = await videosResponse.json().catch(() => ({}));
        console.error('YouTube videos API error:', errorData);
        return res.status(502).json({ error: 'Failed to fetch video details from YouTube' });
      }

      const videosData = await videosResponse.json();

      const longFormVideos = (videosData.items || [])
        .map((video: any) => {
          const durationSeconds = parseISODurationToSeconds(video.contentDetails?.duration || '');
          return {
            id: video.id,
            title: video.snippet?.title || 'Untitled',
            description: video.snippet?.description || '',
            thumbnail:
              video.snippet?.thumbnails?.high?.url ||
              video.snippet?.thumbnails?.medium?.url ||
              video.snippet?.thumbnails?.default?.url ||
              '',
            publishedAt: video.snippet?.publishedAt,
            viewCount: toNumber(video.statistics?.viewCount),
            likeCount: toNumber(video.statistics?.likeCount),
            commentCount: toNumber(video.statistics?.commentCount),
            durationSeconds,
            durationLabel: formatDurationLabel(durationSeconds),
            youtubeUrl: `https://www.youtube.com/watch?v=${video.id}`,
          };
        })
        .filter((video: any) => video.durationSeconds >= LONG_FORM_MIN_SECONDS)
        .sort(
          (a: any, b: any) =>
            new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime()
        );

      return res.json(longFormVideos);
    } catch (error) {
      console.error('Fetch long-form videos error:', error);
      return res.status(500).json({ error: 'Failed to fetch long-form videos' });
    }
  }

  // Viral Clip Analyzer Endpoint (parity with local server)
  if (path === 'api/analyze' && req.method === 'POST') {
    if (!req.headers['x-gemini-key']) {
      return res.status(500).json({
        error: 'Gemini API key required. Please add your key in Settings → API Keys.',
      });
    }

    const body = readJsonBody(req) || {};
    const requestedVideoId = String(body.videoId || '').trim();
    const requestedYoutubeUrl = String(body.youtubeUrl || '').trim();

    let sourceUrl = '';
    if (requestedVideoId) {
      sourceUrl = `https://www.youtube.com/watch?v=${requestedVideoId}`;
    } else if (requestedYoutubeUrl) {
      sourceUrl = requestedYoutubeUrl;
    } else {
      return res.status(400).json({
        error: 'No video source provided. Use a YouTube URL or connected channel video.',
      });
    }

    const tempFilename = `analyze-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp4`;
    const tempVideoPath = pathModule.join('/tmp', tempFilename);

    try {
      if (requestedVideoId) {
        const { accounts, activeIndex } = readAccountsFromCookies(req);
        if (accounts.length === 0) {
          return res.status(401).json({ error: 'Not authenticated' });
        }

        const userData = accounts[activeIndex];
        if (!userData) {
          return res.status(401).json({ error: 'No active account' });
        }
      }

      await youtubedl(sourceUrl, {
        output: tempVideoPath,
        format: 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
        noCheckCertificates: true,
        noWarnings: true,
        preferFreeFormats: true,
        addHeader: [
          'referer:https://www.google.com/',
          'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        ],
      } as any);

      const ai = new GoogleGenAI({ apiKey: getGeminiKeyFromRequest(req) });
      const uploadResult = await ai.files.upload({
        file: tempVideoPath,
        config: { mimeType: 'video/mp4' },
      });

      let uploadedFile = await ai.files.get({ name: uploadResult.name });
      while (uploadedFile.state === 'PROCESSING') {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        uploadedFile = await ai.files.get({ name: uploadResult.name });
      }

      if (uploadedFile.state === 'FAILED') {
        throw new Error('Video processing failed in Gemini');
      }

      const systemInstruction = `
You are an expert Video Content Strategist and Viral Editor. Your goal is to analyze long-form videos to identify the most high-impact, standalone segments for social media (TikTok, Reels, YouTube Shorts).

### Analysis Framework
For every video provided, evaluate segments based on:
1. **The Hook (0-3s):** Does it start with a high-stakes statement, a surprising fact, or an emotional peak?
2. **Retentiveness:** Is the point made clearly and concisely without needing the full context of the video?
3. **Emotional Resonance:** Does it provoke curiosity, anger, inspiration, or laughter?
4. **Intrinsic Value:** Does the viewer learn something or feel something by the end of the 60-second clip?

### Tasks
1. **Segment Extraction:** Identify exactly 5 distinct clips.
2. **Timestamps:** Provide precise [MM:SS] to [MM:SS] markers.
3. **Virality Scoring:** Rate each clip 1-100 and explain why.
4. **Social Copy:** Write a "scroll-stopping" headline and 3 relevant hashtags for each clip.
5. **Editing Suggestions:** Suggest where to add B-roll, zoom-ins for emphasis, or specific text overlays.
`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          { fileData: { fileUri: uploadResult.uri, mimeType: uploadResult.mimeType } },
          { text: 'Analyze this video and find 5 viral clips.' },
        ],
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                clipNumber: { type: Type.INTEGER },
                title: { type: Type.STRING },
                startTime: { type: Type.STRING, description: 'MM:SS' },
                endTime: { type: Type.STRING, description: 'MM:SS' },
                duration: { type: Type.INTEGER, description: 'Duration in seconds' },
                score: { type: Type.INTEGER, description: 'Score out of 100' },
                rationale: { type: Type.STRING },
                hookText: { type: Type.STRING },
                visualEditNotes: { type: Type.STRING },
                headline: { type: Type.STRING },
                hashtags: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
              },
              required: [
                'clipNumber',
                'title',
                'startTime',
                'endTime',
                'duration',
                'score',
                'rationale',
                'hookText',
                'visualEditNotes',
                'headline',
                'hashtags',
              ],
            },
          },
        },
      });

      const clips = JSON.parse(response.text || '[]');
      return res.json({
        clips,
        videoUrl: null,
      });
    } catch (error: any) {
      console.error('Analyze route error:', error);
      return res.status(500).json({ error: error?.message || 'Failed to analyze video' });
    } finally {
      if (fs.existsSync(tempVideoPath)) {
        try {
          fs.unlinkSync(tempVideoPath);
        } catch {
          // Ignore temp cleanup failures in serverless runtime.
        }
      }
    }
  }

  if (path === 'api/shorts/niche-high-performers') {
    const { accounts, activeIndex } = readAccountsFromCookies(req);
    if (accounts.length === 0) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const rawQuery = Array.isArray(req.query?.q) ? req.query.q[0] : req.query?.q;
    const query = String(rawQuery || '').trim();
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    try {
      const userData = accounts[activeIndex];
      if (!userData) {
        return res.status(401).json({ error: 'No active account' });
      }

      const authHeader = await getAuthHeaderForAccount(userData);

      const searchResponse = await fetch(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoDuration=short&maxResults=25&order=viewCount&q=${encodeURIComponent(query)}`,
        { headers: authHeader }
      );

      if (!searchResponse.ok) {
        const errorData = await searchResponse.json().catch(() => ({}));
        console.error('YouTube niche search API error:', errorData);
        return res.status(502).json({ error: 'Failed to search niche Shorts on YouTube' });
      }

      const searchData = await searchResponse.json();
      const videoIds = searchData.items
        ?.map((item: any) => item.id?.videoId)
        .filter(Boolean)
        .join(',');

      if (!videoIds) {
        return res.json([]);
      }

      const videosResponse = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${videoIds}`,
        { headers: authHeader }
      );

      if (!videosResponse.ok) {
        const errorData = await videosResponse.json().catch(() => ({}));
        console.error('YouTube videos details API error:', errorData);
        return res.status(502).json({ error: 'Failed to fetch niche Shorts details from YouTube' });
      }

      const videosData = await videosResponse.json();
      const now = Date.now();

      const performers = (videosData.items || [])
        .map((video: any) => {
          const durationSeconds = parseISODurationToSeconds(video.contentDetails?.duration || '');
          const viewCount = toNumber(video.statistics?.viewCount);
          const likeCount = toNumber(video.statistics?.likeCount);
          const commentCount = toNumber(video.statistics?.commentCount);
          const publishedAt = video.snippet?.publishedAt || new Date().toISOString();
          const ageDays = Math.max(1, (now - new Date(publishedAt).getTime()) / (24 * 60 * 60 * 1000));
          const viewsPerDay = Math.round(viewCount / ageDays);
          const engagementRate =
            viewCount > 0 ? Number((((likeCount + commentCount) / viewCount) * 100).toFixed(2)) : 0;

          return {
            id: video.id,
            title: video.snippet?.title || 'Untitled',
            description: video.snippet?.description || '',
            thumbnail:
              video.snippet?.thumbnails?.high?.url ||
              video.snippet?.thumbnails?.medium?.url ||
              video.snippet?.thumbnails?.default?.url ||
              '',
            channelTitle: video.snippet?.channelTitle || 'Unknown Channel',
            publishedAt,
            durationSeconds,
            durationLabel: formatDurationLabel(durationSeconds),
            viewCount,
            likeCount,
            commentCount,
            viewsPerDay,
            engagementRate,
            youtubeUrl: `https://www.youtube.com/watch?v=${video.id}`,
          };
        })
        .filter((video: any) => video.durationSeconds <= SHORTS_MAX_SECONDS)
        .sort((a: any, b: any) => {
          if (b.viewsPerDay !== a.viewsPerDay) return b.viewsPerDay - a.viewsPerDay;
          return b.viewCount - a.viewCount;
        })
        .slice(0, 12);

      return res.json(performers);
    } catch (error) {
      console.error('Fetch niche shorts error:', error);
      return res.status(500).json({ error: 'Failed to fetch high-performing Shorts' });
    }
  }

  if (path === 'api/shorts/remix-plan' && req.method === 'POST') {
    const { accounts, activeIndex } = readAccountsFromCookies(req);
    if (accounts.length === 0) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const userData = accounts[activeIndex];
    if (!userData) {
      return res.status(401).json({ error: 'No active account' });
    }

    const body = readJsonBody(req) || {};
    const niche = body.niche;
    const source = body.source;

    if (!source?.title) {
      return res.status(400).json({ error: 'Source short data is required' });
    }

    if (!req.headers['x-gemini-key']) {
      return res.status(500).json({ error: 'Missing GEMINI_API_KEY on server' });
    }

    try {
      const ai = new GoogleGenAI({ apiKey: getGeminiKeyFromRequest(req) });
      const prompt = `Build an original YouTube Shorts remix plan for this niche and reference short.

Niche: ${niche || 'General'}
Source title: ${source.title}
Source channel: ${source.channelTitle || 'Unknown'}
Source url: ${source.youtubeUrl || 'N/A'}
Source views: ${source.viewCount || 0}
Source description: ${source.description || ''}

Goals:
- Keep the concept inspiration but avoid copying wording/structure line-by-line.
- Deliver a remix that can be produced from original footage by the creator.
- Optimize for YouTube Shorts retention and replay value.

Return concise, practical recommendations.`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              remixAngle: { type: Type.STRING },
              hook: { type: Type.STRING },
              titleOptions: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              beatByBeatPlan: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              shotIdeas: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              scriptTemplate: { type: Type.STRING },
              cta: { type: Type.STRING },
              hashtagPack: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              originalityGuardrails: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
            },
            required: [
              'remixAngle',
              'hook',
              'titleOptions',
              'beatByBeatPlan',
              'shotIdeas',
              'scriptTemplate',
              'cta',
              'hashtagPack',
              'originalityGuardrails',
            ],
          },
        },
      });

      const parsed = JSON.parse(response.text || '{}');
      return res.json(parsed);
    } catch (error) {
      console.error('Remix plan generation error:', error);
      return res.status(500).json({ error: 'Failed to generate remix plan' });
    }
  }

  // Discover competitors
  if (path === 'api/competitors/discover') {
    const { accounts, activeIndex } = readAccountsFromCookies(req);
    if (accounts.length === 0) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const userData = accounts[activeIndex];
      if (!userData?.channel) {
        return res.status(400).json({ error: 'No channel connected' });
      }

      const authHeader = await getAuthHeaderForAccount(userData);

      const myVideosResponse = await fetch(
        'https://www.googleapis.com/youtube/v3/search?part=snippet&forMine=true&type=video&maxResults=10&order=date',
        { headers: authHeader }
      );
      const myVideosData = await myVideosResponse.json();
      const myVideoIds = myVideosData.items?.map((item: any) => item.id.videoId).join(',');

      if (!myVideoIds) {
        return res.json({
          message: 'Not enough video data to discover competitors',
          suggestions: [],
        });
      }

      const myStatsResponse = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${myVideoIds}`,
        { headers: authHeader }
      );
      const myStatsData = await myStatsResponse.json();
      const myVideos = myStatsData.items || [];

      if (myVideos.length === 0) {
        return res.json({
          message: 'Not enough video data to discover competitors',
          suggestions: [],
        });
      }

      let searchQueries: string[] = [];
      let nicheDescription = '';

      const videoTitles = myVideos.map((v: any) => v.snippet.title);
      const videoTags = myVideos.flatMap((v: any) => v.snippet.tags || []);
      const channelDescription = userData.channel.description || '';

      if (req.headers['x-gemini-key']) {
        try {
          const ai = new GoogleGenAI({ apiKey: getGeminiKeyFromRequest(req) });

          const prompt = `Analyze this YouTube channel and identify its niche and optimal competitor search queries.

Channel: ${userData.channel.title}
Description: ${channelDescription}
Recent Video Titles: ${videoTitles.join(', ')}
Common Tags: ${videoTags.slice(0, 20).join(', ')}

Generate:
1. A concise niche description (2-3 words)
2. 3-5 search queries to find similar successful channels in this niche
3. Make queries specific enough to find real competitors, not just related topics

Return as JSON.`;

          const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  niche: { type: Type.STRING },
                  searchQueries: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                },
                required: ['niche', 'searchQueries'],
              },
            },
          });

          const aiResult = JSON.parse(response.text || '{}');
          nicheDescription = aiResult.niche || 'Your Niche';
          searchQueries = aiResult.searchQueries || [];
        } catch (aiError) {
          console.error('AI niche analysis error:', aiError);
          const topTags = videoTags.slice(0, 5);
          searchQueries = topTags.length > 0 ? topTags : [userData.channel.title];
        }
      } else {
        const topTags = videoTags.slice(0, 3);
        searchQueries = topTags.length > 0 ? topTags : [userData.channel.title];
      }

      const competitorChannels = new Map();
      const myChannelId = userData.channel.id;

      for (const query of searchQueries.slice(0, 3)) {
        try {
          const searchResponse = await fetch(
            `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${encodeURIComponent(query)}&maxResults=10&order=relevance`,
            { headers: authHeader }
          );
          const searchData = await searchResponse.json();

          if (searchData.items) {
            for (const item of searchData.items) {
              const channelId = item.id.channelId;
              if (channelId === myChannelId) continue;
              if (!competitorChannels.has(channelId)) {
                competitorChannels.set(channelId, item);
              }
            }
          }
        } catch (searchError) {
          console.error(`Search error for query "${query}":`, searchError);
        }
      }

      const channelIds = Array.from(competitorChannels.keys()).slice(0, 12);
      if (channelIds.length === 0) {
        return res.json({
          niche: nicheDescription,
          message: 'No competing channels found',
          suggestions: [],
        });
      }

      const channelsStatsResponse = await fetch(
        `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id=${channelIds.join(',')}`,
        { headers: authHeader }
      );
      const channelsStatsData = await channelsStatsResponse.json();

      const rankedChannels = (channelsStatsData.items || [])
        .filter((channel: any) => {
          const subs = parseInt(channel.statistics.subscriberCount || '0');
          const mySubs = parseInt(userData.channel.statistics?.subscriberCount || '0');
          return subs >= mySubs * 0.5 && subs <= mySubs * 5;
        })
        .sort((a: any, b: any) => parseInt(b.statistics.subscriberCount) - parseInt(a.statistics.subscriberCount))
        .slice(0, 8)
        .map((channel: any) => ({
          id: channel.id,
          title: channel.snippet.title,
          description: channel.snippet.description,
          thumbnails: channel.snippet.thumbnails,
          statistics: channel.statistics,
          matchScore: 'high',
        }));

      return res.json({
        niche: nicheDescription || 'Your Niche',
        suggestions: rankedChannels,
        message:
          rankedChannels.length > 0
            ? `Found ${rankedChannels.length} competing channels in your niche`
            : 'No direct competitors found in your size range',
      });
    } catch (error) {
      console.error('Discover competitors error:', error);
      return res.status(500).json({ error: 'Failed to discover competitors' });
    }
  }

  // Search competitors
  if (path === 'api/competitors/search') {
    const { accounts, activeIndex } = readAccountsFromCookies(req);
    if (accounts.length === 0) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const userData = accounts[activeIndex];
      const authHeader = await getAuthHeaderForAccount(userData);
      const { q } = req.query;

      const response = await fetch(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${q}&maxResults=5`,
        { headers: authHeader }
      );
      const data = await response.json();
      return res.json(data.items || []);
    } catch (error) {
      console.error('Search competitors error:', error);
      return res.status(500).json({ error: 'Failed to search competitors' });
    }
  }

  // Get competitor videos
  if (path === 'api/competitors/videos') {
    const { accounts, activeIndex } = readAccountsFromCookies(req);
    if (accounts.length === 0) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const userData = accounts[activeIndex];
      const authHeader = await getAuthHeaderForAccount(userData);
      const { channelId } = req.query;

      const channelResponse = await fetch(
        `https://www.googleapis.com/youtube/v3/channels?part=contentDetails,statistics,snippet&id=${channelId}`,
        { headers: authHeader }
      );
      const channelData = await channelResponse.json();
      const channel = channelData.items?.[0];
      const uploadsPlaylistId = channel?.contentDetails?.relatedPlaylists?.uploads;

      if (!uploadsPlaylistId) {
        return res.status(404).json({ error: 'Uploads playlist not found' });
      }

      const playlistResponse = await fetch(
        `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId=${uploadsPlaylistId}&maxResults=20`,
        { headers: authHeader }
      );
      const playlistData = await playlistResponse.json();
      const videoIds = playlistData.items?.map((item: any) => item.contentDetails.videoId).join(',');

      if (videoIds) {
        const statsResponse = await fetch(
          `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${videoIds}`,
          { headers: authHeader }
        );
        const statsData = await statsResponse.json();
        const sortedVideos = (statsData.items || []).sort(
          (a: any, b: any) => parseInt(b.statistics.viewCount) - parseInt(a.statistics.viewCount)
        );

        return res.json({
          channel: {
            title: channel.snippet.title,
            description: channel.snippet.description,
            thumbnails: channel.snippet.thumbnails,
            statistics: channel.statistics,
          },
          videos: sortedVideos,
        });
      }

      return res.json({ channel: channel.snippet, videos: [] });
    } catch (error) {
      console.error('Fetch competitor videos error:', error);
      return res.status(500).json({ error: 'Failed to fetch competitor videos' });
    }
  }

  // Logout
  if (path === 'api/auth/logout') {
    res.setHeader('Set-Cookie', [
      APP_URL.startsWith('https://')
        ? 'tube_vision_accounts=; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=0'
        : 'tube_vision_accounts=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0',
      APP_URL.startsWith('https://')
        ? 'tube_vision_active=; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=0'
        : 'tube_vision_active=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0'
    ]);
    return res.json({ success: true });
  }

  // Channel Snapshots - Growth Momentum (Vercel stub endpoints)
  // Note: Full snapshot persistence with SQLite only available on local dev server
  // Vercel returns current metrics without historical data
  if (path === 'api/snapshots/save' && req.method === 'POST') {
    // Vercel doesn't persist data between function invocations
    // Local dev server uses better-sqlite3 for snapshots
    return res.json({ 
      success: false,
      message: 'Snapshot persistence only available on local dev server. Use npm run dev for full snapshot features.'
    });
  }

  if (path === 'api/snapshots/history' && req.method === 'GET') {
    // Return empty snapshots for Vercel deployment
    return res.json({
      snapshots: [],
      count: 0,
      period: 'N/A',
      startDate: null,
      endDate: null,
      note: 'Snapshot history only available on local dev server. Use npm run dev for Growth Momentum chart.'
    });
  }

  if (path === 'api/snapshots/momentum' && req.method === 'GET') {
    // Return placeholder momentum data for Vercel
    return res.json({
      momentum: {
        week: null,
        month: null,
        quarter: null
      },
      currentMetrics: {},
      note: 'Growth momentum tracking only available on local dev server. Use npm run dev for full features.'
    });
  }

  // Gemini API Key Validation Endpoint (BYOK)
  if (path === 'api/gemini/validate' && req.method === 'POST') {
    try {
      const apiKey = getGeminiKeyFromRequest(req);
      const ai = new GoogleGenAI({ apiKey });
      
      // Lightweight test request
      await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: 'Say "test successful" in exactly 2 words.',
        config: {
          maxOutputTokens: 10,
        },
      });
      
      return res.json({ valid: true, message: 'API key is valid' });
    } catch (error: any) {
      console.error('API key validation error:', error.message);
      
      const errorStr = String(error).toLowerCase();
      if (errorStr.includes('api key not valid') || errorStr.includes('unauthorized') || errorStr.includes('401')) {
        return res.status(401).json({ valid: false, error: 'Invalid API key' });
      } else if (errorStr.includes('rate limit') || errorStr.includes('429')) {
        return res.status(429).json({ valid: false, error: 'Rate limited' });
      } else if (errorStr.includes('quota')) {
        return res.status(429).json({ valid: false, error: 'Quota exceeded' });
      } else {
        return res.status(500).json({ valid: false, error: 'Validation failed' });
      }
    }
  }

  // Default response for unknown paths
  return res.status(404).json({ error: 'Not found', path });
}
