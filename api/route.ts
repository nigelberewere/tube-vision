import type { VercelRequest, VercelResponse } from '@vercel/node';
import { OAuth2Client } from 'google-auth-library';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const APP_URL = process.env.APP_URL || 'http://localhost:3000';
const REDIRECT_URI = `${APP_URL}/auth/google/callback`;

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

function toNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
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

      // Deduplicate by channel ID when available so one Google login can keep multiple channels.
      const updatedAccounts = accounts.filter((acc: any) => {
        if (newUserData.channel && acc.channel) {
          return acc.channel.id !== newUserData.channel.id;
        }
        if (!newUserData.channel && !acc.channel) {
          return acc.id !== newUserData.id;
        }
        return true;
      });
      updatedAccounts.unshift(newUserData);

      // Keep account list bounded to prevent cookie bloat.
      const boundedAccounts = updatedAccounts.slice(0, 5);

      // Store all accounts and set the active account index
      const cookieValue = encodeURIComponent(JSON.stringify(boundedAccounts));
      
      res.setHeader('Set-Cookie', [
        `tube_vision_accounts=${cookieValue}; ${COOKIE_BASE_OPTIONS}`,
        `tube_vision_active=0; ${COOKIE_BASE_OPTIONS}`
      ]);

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

  // Default response for unknown paths
  return res.status(404).json({ error: 'Not found', path });
}
