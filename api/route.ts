import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHmac } from 'node:crypto';
import fs from 'node:fs';
import * as pathModule from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { OAuth2Client } from 'google-auth-library';
import { GoogleGenAI, Type } from '@google/genai';
import youtubedl from 'youtube-dl-exec';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const DEFAULT_PRODUCTION_APP_URL = 'https://app.janso.studio';
const APP_URL = process.env.APP_URL?.trim() || (IS_PRODUCTION ? DEFAULT_PRODUCTION_APP_URL : 'http://localhost:3000');
const REDIRECT_URI = `${APP_URL}/auth/google/callback`;
const SHORTS_MAX_SECONDS = 61;
const LONG_FORM_MIN_SECONDS = 120;
const THUMBNAIL_AUTH_COOKIE = 'tube_vision_thumbnail_authorizations';
const THUMBNAIL_AUTH_MAX_ITEMS = 40;
const OAUTH_STATE_SECRET = process.env.SESSION_SECRET || 'tube-vision-secret';
const OAUTH_STATE_MAX_AGE_MS = 10 * 60 * 1000;
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabaseServer = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  : null;

const YOUTUBE_DATA_API_CACHE_TABLE = 'youtube_api_cache';
const YOUTUBE_DATA_CACHE_VERSION = 'v1';
const YOUTUBE_DATA_CACHE_SCOPE_HEADER = 'x-vidvision-cache-scope';
const YOUTUBE_DATA_CACHE_PATCH_FLAG = '__vidvision_youtube_cache_patch_v1__';
const YOUTUBE_DATA_CACHE_SECRET = process.env.YOUTUBE_CACHE_SECRET || OAUTH_STATE_SECRET;
const YOUTUBE_DATA_CACHE_DEFAULT_TTL_SECONDS = 180;
const YOUTUBE_DATA_CACHE_PRUNE_INTERVAL_MS = 15 * 60 * 1000;

let youtubeDataCacheAvailable = Boolean(supabaseServer);
let youtubeDataCacheMissingTableWarned = false;
let lastYouTubeDataCachePruneAt = 0;

type YouTubeDataCacheRow = {
  response_json: unknown;
  status_code: number | null;
  expires_at: string;
};

function isYouTubeDataApiUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    return (
      (url.hostname === 'www.googleapis.com' && url.pathname.startsWith('/youtube/v3/')) ||
      (url.hostname === 'youtubeanalytics.googleapis.com' && url.pathname.startsWith('/v2/'))
    );
  } catch {
    return false;
  }
}

function normalizeYouTubeDataApiUrl(rawUrl: string): string {
  const url = new URL(rawUrl);
  const sortedEntries = [...url.searchParams.entries()].sort(([aKey, aValue], [bKey, bValue]) => {
    if (aKey === bKey) {
      return aValue.localeCompare(bValue);
    }
    return aKey.localeCompare(bKey);
  });

  url.search = '';
  for (const [key, value] of sortedEntries) {
    url.searchParams.append(key, value);
  }

  return `${url.origin}${url.pathname}${url.search}`;
}

function deriveYouTubeDataCacheTtlSeconds(rawUrl: string): number {
  try {
    const url = new URL(rawUrl);

    if (url.hostname === 'youtubeanalytics.googleapis.com') {
      return 600;
    }

    const endpoint = url.pathname.split('/').pop() || '';

    if (endpoint === 'commentThreads') return 300;
    if (endpoint === 'search') return 3600;
    if (endpoint === 'playlistItems') return 900;
    if (endpoint === 'videos') return 900;
    if (endpoint === 'channels') return 1800;
  } catch {
    // Ignore parse issues and use the default TTL.
  }

  return YOUTUBE_DATA_CACHE_DEFAULT_TTL_SECONDS;
}

function resolveFetchRequestMeta(input: RequestInfo | URL, init?: RequestInit) {
  const hasRequestInput = typeof Request !== 'undefined' && input instanceof Request;

  if (hasRequestInput) {
    const requestInput = input as Request;
    return {
      rawUrl: requestInput.url,
      method: (init?.method || requestInput.method || 'GET').toUpperCase(),
      headers: new Headers(init?.headers || requestInput.headers),
    };
  }

  return {
    rawUrl: String(input),
    method: (init?.method || 'GET').toUpperCase(),
    headers: new Headers(init?.headers || {}),
  };
}

function deriveYouTubeDataCacheScope(headers: Headers): string {
  const explicitScope = headers.get(YOUTUBE_DATA_CACHE_SCOPE_HEADER)?.trim();
  if (explicitScope) {
    return explicitScope.slice(0, 128);
  }

  const authorization = headers.get('authorization')?.trim();
  if (authorization?.startsWith('Bearer ')) {
    const token = authorization.slice('Bearer '.length).trim();
    if (token) {
      const tokenHash = createHmac('sha256', YOUTUBE_DATA_CACHE_SECRET)
        .update(token)
        .digest('hex')
        .slice(0, 20);
      return `token:${tokenHash}`;
    }
  }

  return 'shared';
}

function cloneInitWithoutInternalCacheHeaders(init?: RequestInit): RequestInit | undefined {
  if (!init) {
    return init;
  }

  const sanitizedHeaders = new Headers(init.headers || {});
  sanitizedHeaders.delete(YOUTUBE_DATA_CACHE_SCOPE_HEADER);

  return {
    ...init,
    headers: sanitizedHeaders,
  };
}

function handleYouTubeDataCacheError(error: any, operation: 'read' | 'write' | 'prune') {
  const code = String(error?.code || '');
  const message = String(error?.message || '').toLowerCase();
  const missingTable = code === '42P01' || (message.includes('youtube_api_cache') && message.includes('does not exist'));

  if (missingTable) {
    youtubeDataCacheAvailable = false;
    if (!youtubeDataCacheMissingTableWarned) {
      youtubeDataCacheMissingTableWarned = true;
      console.warn(
        '[YouTube Cache] Supabase table "youtube_api_cache" is missing. Run the latest SQL migration to enable cache hits.'
      );
    }
    return;
  }

  if (operation !== 'read') {
    console.warn(`[YouTube Cache] ${operation} failed:`, error?.message || error);
  }
}

async function readYouTubeDataCache(cacheKey: string): Promise<YouTubeDataCacheRow | null> {
  if (!youtubeDataCacheAvailable || !supabaseServer) {
    return null;
  }

  const { data, error } = await supabaseServer
    .from(YOUTUBE_DATA_API_CACHE_TABLE)
    .select('response_json,status_code,expires_at')
    .eq('cache_key', cacheKey)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (error) {
    handleYouTubeDataCacheError(error, 'read');
    return null;
  }

  return (data as YouTubeDataCacheRow | null) || null;
}

async function maybePruneYouTubeDataCache() {
  if (!youtubeDataCacheAvailable || !supabaseServer) {
    return;
  }

  const now = Date.now();
  if (now - lastYouTubeDataCachePruneAt < YOUTUBE_DATA_CACHE_PRUNE_INTERVAL_MS) {
    return;
  }
  lastYouTubeDataCachePruneAt = now;

  const { error } = await supabaseServer
    .from(YOUTUBE_DATA_API_CACHE_TABLE)
    .delete()
    .lt('expires_at', new Date(now).toISOString());

  if (error) {
    handleYouTubeDataCacheError(error, 'prune');
  }
}

async function writeYouTubeDataCache(params: {
  cacheKey: string;
  cacheScope: string;
  endpoint: string;
  responseJson: unknown;
  statusCode: number;
  ttlSeconds: number;
}) {
  if (!youtubeDataCacheAvailable || !supabaseServer) {
    return;
  }

  const ttlSeconds = Math.max(30, Math.min(3600, Number(params.ttlSeconds) || YOUTUBE_DATA_CACHE_DEFAULT_TTL_SECONDS));
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

  const { error } = await supabaseServer
    .from(YOUTUBE_DATA_API_CACHE_TABLE)
    .upsert(
      {
        cache_key: params.cacheKey,
        cache_scope: params.cacheScope,
        endpoint: params.endpoint,
        response_json: params.responseJson,
        status_code: params.statusCode,
        expires_at: expiresAt,
      },
      { onConflict: 'cache_key' },
    );

  if (error) {
    handleYouTubeDataCacheError(error, 'write');
    return;
  }

  await maybePruneYouTubeDataCache();
}

function installYouTubeDataApiCacheFetch() {
  const globalCacheState = globalThis as Record<string, unknown>;
  if (globalCacheState[YOUTUBE_DATA_CACHE_PATCH_FLAG]) {
    return;
  }
  globalCacheState[YOUTUBE_DATA_CACHE_PATCH_FLAG] = true;

  const rawFetch = globalThis.fetch.bind(globalThis);

  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const { rawUrl, method, headers } = resolveFetchRequestMeta(input, init);

    if (!youtubeDataCacheAvailable || method !== 'GET' || !isYouTubeDataApiUrl(rawUrl)) {
      return rawFetch(input, init);
    }

    const cacheScope = deriveYouTubeDataCacheScope(headers);
    const normalizedUrl = normalizeYouTubeDataApiUrl(rawUrl);
    const cacheKey = createHmac('sha256', YOUTUBE_DATA_CACHE_SECRET)
      .update(`${YOUTUBE_DATA_CACHE_VERSION}:${cacheScope}:${normalizedUrl}`)
      .digest('hex');

    const cached = await readYouTubeDataCache(cacheKey);
    if (cached) {
      return new Response(JSON.stringify(cached.response_json), {
        status: Number(cached.status_code) || 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'X-VidVision-Cache': 'HIT',
        },
      });
    }

    const response = await rawFetch(input, cloneInitWithoutInternalCacheHeaders(init));
    if (!response.ok) {
      return response;
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.toLowerCase().includes('application/json')) {
      return response;
    }

    const parsedJson = await response.clone().json().catch(() => null);
    if (parsedJson === null || typeof parsedJson === 'undefined') {
      return response;
    }

    const ttlSeconds = deriveYouTubeDataCacheTtlSeconds(rawUrl);
    await writeYouTubeDataCache({
      cacheKey,
      cacheScope,
      endpoint: new URL(rawUrl).pathname,
      responseJson: parsedJson,
      statusCode: response.status,
      ttlSeconds,
    });

    return response;
  };
}

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
const PENDING_ACCOUNT_COOKIE = 'tube_vision_pending_account';
const COOKIE_BASE_OPTIONS = APP_URL.startsWith('https://')
  ? `Path=/; HttpOnly; SameSite=None; Secure; Max-Age=${COOKIE_MAX_AGE_SECONDS}`
  : `Path=/; HttpOnly; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE_SECONDS}`;
const CLEAR_COOKIE_BASE_OPTIONS = APP_URL.startsWith('https://')
  ? 'Path=/; HttpOnly; SameSite=None; Secure; Max-Age=0'
  : 'Path=/; HttpOnly; SameSite=Lax; Max-Age=0';

function signOAuthState(payload: { redirectTo: string; supabaseUserId: string | null; issuedAt: number }) {
  return createHmac('sha256', OAUTH_STATE_SECRET)
    .update(JSON.stringify(payload))
    .digest('base64url');
}

function normalizePostAuthRedirect(rawValue: unknown): string {
  if (typeof rawValue !== 'string' || !rawValue.trim()) {
    return APP_URL;
  }

  try {
    const appOrigin = new URL(APP_URL).origin;
    const candidate = new URL(rawValue.trim(), appOrigin);
    if (candidate.origin !== appOrigin) {
      return APP_URL;
    }
    return `${candidate.origin}${candidate.pathname}${candidate.search}${candidate.hash}`;
  } catch {
    return APP_URL;
  }
}

function buildYouTubeAuthBridgeUrl(rawNext: unknown): string {
  const bridgeUrl = new URL(APP_URL);
  bridgeUrl.searchParams.set('connect_youtube', '1');

  const normalizedNext = normalizePostAuthRedirect(rawNext);
  if (normalizedNext !== APP_URL) {
    bridgeUrl.searchParams.set('next', normalizedNext);
  }

  return bridgeUrl.toString();
}

function encodeOAuthState(redirectTo: string, supabaseUserId: string | null = null): string {
  const payload = {
    redirectTo: normalizePostAuthRedirect(redirectTo),
    supabaseUserId,
    issuedAt: Date.now(),
  };

  return Buffer.from(
    JSON.stringify({
      ...payload,
      signature: signOAuthState(payload),
    }),
    'utf8',
  ).toString('base64url');
}

function decodeOAuthState(rawState: unknown): { redirectTo: string; supabaseUserId: string | null } {
  if (typeof rawState !== 'string' || !rawState.trim()) {
    return { redirectTo: APP_URL, supabaseUserId: null };
  }

  try {
    const parsed = JSON.parse(Buffer.from(rawState, 'base64url').toString('utf8'));
    const redirectTo = normalizePostAuthRedirect(parsed?.redirectTo);
    const supabaseUserId =
      typeof parsed?.supabaseUserId === 'string' && parsed.supabaseUserId.trim()
        ? parsed.supabaseUserId.trim()
        : null;
    const issuedAt = Number(parsed?.issuedAt);
    const signature = typeof parsed?.signature === 'string' ? parsed.signature : '';

    if (!signature || !Number.isFinite(issuedAt)) {
      return { redirectTo, supabaseUserId: null };
    }

    const expectedSignature = signOAuthState({ redirectTo, supabaseUserId, issuedAt });
    const isFresh = Math.abs(Date.now() - issuedAt) <= OAUTH_STATE_MAX_AGE_MS;

    return {
      redirectTo,
      supabaseUserId: signature === expectedSignature && isFresh ? supabaseUserId : null,
    };
  } catch {
    return { redirectTo: APP_URL, supabaseUserId: null };
  }
}

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

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}

function sanitizeUpstreamMessage(rawMessage: unknown, fallbackMessage: string): string {
  const text = typeof rawMessage === 'string' && rawMessage.trim() ? rawMessage : fallbackMessage;
  const decoded = decodeHtmlEntities(text);
  const stripped = decoded.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return stripped || fallbackMessage;
}

function extractYouTubeError(errorPayload: any, fallbackMessage: string, fallbackStatus = 500) {
  const code = Number(errorPayload?.error?.code) || Number(fallbackStatus) || 500;
  const status = typeof errorPayload?.error?.status === 'string' ? errorPayload.error.status : null;
  const reason = typeof errorPayload?.error?.errors?.[0]?.reason === 'string' ? errorPayload.error.errors[0].reason : null;
  const message = sanitizeUpstreamMessage(
    errorPayload?.error?.message || errorPayload?.error_description,
    fallbackMessage,
  );

  return {
    httpStatus: code,
    code,
    status,
    reason,
    message,
    isQuotaExceeded: Boolean(reason && /quota/i.test(reason)) || /quota/i.test(message),
  };
}

type SupabaseProfileRow = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  channel_id: string | null;
};

type SupabaseYouTubeAccountRow = {
  id: string;
  user_id: string;
  google_id: string;
  channel_id: string;
  channel_title: string;
  channel_description: string | null;
  channel_thumbnail: string | null;
  statistics: Record<string, unknown> | null;
  access_token?: string | null;
  refresh_token?: string | null;
  expires_at?: string | null;
};

type UnifiedAccountState = {
  accounts: any[];
  activeIndex: number;
  source: 'supabase' | 'cookie';
};

function normalizeChannelStatistics(rawStatistics: unknown) {
  const stats =
    rawStatistics && typeof rawStatistics === 'object'
      ? (rawStatistics as Record<string, unknown>)
      : {};

  return {
    subscriberCount: String(toNumber(stats.subscriberCount ?? stats.subscribers ?? 0)),
    videoCount: String(toNumber(stats.videoCount ?? stats.videos ?? 0)),
    viewCount: String(toNumber(stats.viewCount ?? stats.totalViews ?? 0)),
  };
}

function mapSupabaseAccountToLegacyUser(
  profile: SupabaseProfileRow | null,
  account: SupabaseYouTubeAccountRow,
) {
  const thumbnailUrl = account.channel_thumbnail || profile?.avatar_url || '';

  const baseUser = {
    id: account.google_id || profile?.id || account.channel_id,
    name: profile?.full_name || account.channel_title || 'Creator',
    picture: profile?.avatar_url || thumbnailUrl,
    channel: {
      id: account.channel_id,
      title: account.channel_title,
      description: account.channel_description || '',
      thumbnails: thumbnailUrl ? { default: { url: thumbnailUrl } } : {},
      statistics: normalizeChannelStatistics(account.statistics),
    },
  };

  if (account.access_token || account.refresh_token) {
    return {
      ...baseUser,
      tokens: {
        access_token: account.access_token || undefined,
        refresh_token: account.refresh_token || undefined,
        expiry_date: account.expires_at ? new Date(account.expires_at).getTime() : undefined,
      },
    };
  }

  return baseUser;
}

function getTokenFromRequest(req: VercelRequest): string | null {
  const authHeader = req.headers.authorization;
  const authValue = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  if (authValue?.startsWith('Bearer ')) {
    return authValue.slice(7);
  }

  const supabaseAuthHeader = req.headers['x-supabase-auth'];
  const supabaseAuthValue = Array.isArray(supabaseAuthHeader)
    ? supabaseAuthHeader[0]
    : supabaseAuthHeader;

  return typeof supabaseAuthValue === 'string' && supabaseAuthValue.trim()
    ? supabaseAuthValue.trim()
    : null;
}

async function verifySupabaseUser(req: VercelRequest) {
  if (!supabaseServer) {
    return null;
  }

  const token = getTokenFromRequest(req);
  if (!token) {
    return null;
  }

  try {
    const { data: { user }, error } = await supabaseServer.auth.getUser(token);
    if (error || !user) {
      return null;
    }
    return user;
  } catch {
    return null;
  }
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

function readPendingAccountFromCookies(req: VercelRequest) {
  const cookies = req.headers.cookie || '';
  const pendingCookie = getCookieValue(cookies, PENDING_ACCOUNT_COOKIE);
  if (!pendingCookie) {
    return null;
  }

  try {
    return JSON.parse(decodeURIComponent(pendingCookie));
  } catch {
    return null;
  }
}

async function resolveAccessTokenFromLegacyTokens(tokens: any): Promise<string | null> {
  const directAccessToken =
    typeof tokens?.access_token === 'string' && tokens.access_token.trim()
      ? tokens.access_token.trim()
      : null;

  if (directAccessToken) {
    return directAccessToken;
  }

  const refreshToken =
    typeof tokens?.refresh_token === 'string' && tokens.refresh_token.trim()
      ? tokens.refresh_token.trim()
      : null;

  if (!refreshToken) {
    return null;
  }

  try {
    const client = createOAuthClient();
    client.setCredentials({ refresh_token: refreshToken });
    const refreshedToken = (await client.getAccessToken())?.token;
    return refreshedToken || null;
  } catch (error) {
    console.error('Failed to refresh access token from legacy account payload:', error);
    return null;
  }
}

async function persistLegacyAccountToSupabase(
  supabaseUserId: string,
  legacyAccount: any,
) {
  const channel = legacyAccount?.channel;
  if (!channel?.id) {
    return false;
  }

  const accessToken = await resolveAccessTokenFromLegacyTokens(legacyAccount?.tokens || {});
  if (!accessToken) {
    return false;
  }

  const refreshToken =
    typeof legacyAccount?.tokens?.refresh_token === 'string'
      ? legacyAccount.tokens.refresh_token
      : '';

  const expiryDate = Number(legacyAccount?.tokens?.expiry_date);

  await persistYouTubeAccountToSupabase(
    supabaseUserId,
    {
      id: legacyAccount?.id,
      name: legacyAccount?.name,
      picture: legacyAccount?.picture,
    },
    {
      id: channel.id,
      snippet: {
        title: channel.title,
        description: channel.description,
        thumbnails: channel.thumbnails,
      },
      statistics: channel.statistics,
    },
    {
      access_token: accessToken,
      refresh_token: refreshToken,
      expiry_date: Number.isFinite(expiryDate) ? expiryDate : undefined,
    },
  );

  return true;
}

async function getUnifiedAccountsAndActiveIndex(req: VercelRequest): Promise<UnifiedAccountState> {
  const cookieState = readAccountsFromCookies(req);
  const fallbackState: UnifiedAccountState = {
    accounts: cookieState.accounts,
    activeIndex: cookieState.activeIndex,
    source: 'cookie',
  };

  const authUser = await verifySupabaseUser(req);
  if (!authUser || !supabaseServer) {
    return fallbackState;
  }

  try {
    const [{ data: profile, error: profileError }, { data: rawAccounts, error: accountsError }] = await Promise.all([
      supabaseServer
        .from('profiles')
        .select('id, full_name, avatar_url, channel_id')
        .eq('id', authUser.id)
        .maybeSingle(),
      supabaseServer
        .from('youtube_accounts')
        .select('id, user_id, google_id, channel_id, channel_title, channel_description, channel_thumbnail, statistics')
        .eq('user_id', authUser.id)
        .order('created_at', { ascending: false }),
    ]);

    if (profileError && profileError.code !== 'PGRST116') {
      console.error('Supabase profile fetch error:', profileError);
    }

    if (accountsError) {
      console.error('Supabase accounts fetch error:', accountsError);
      return fallbackState;
    }

    const accounts = (rawAccounts || []).map((account) =>
      mapSupabaseAccountToLegacyUser(
        (profile as SupabaseProfileRow | null) || null,
        account as SupabaseYouTubeAccountRow,
      ),
    );

    if (accounts.length === 0) {
      return fallbackState;
    }

    let activeIndex = 0;
    if (profile?.channel_id) {
      const matchedIndex = accounts.findIndex((account) => account.channel?.id === profile.channel_id);
      if (matchedIndex >= 0) {
        activeIndex = matchedIndex;
      }
    }

    return {
      accounts,
      activeIndex,
      source: 'supabase',
    };
  } catch (error) {
    console.error('Supabase account state error:', error);
    return fallbackState;
  }
}

async function getActiveYouTubeUser(req: VercelRequest) {
  const authUser = await verifySupabaseUser(req);
  if (authUser && supabaseServer) {
    try {
      const [{ data: profile, error: profileError }, { data: rawAccounts, error: accountsError }] = await Promise.all([
        supabaseServer
          .from('profiles')
          .select('id, full_name, avatar_url, channel_id')
          .eq('id', authUser.id)
          .maybeSingle(),
        supabaseServer
          .from('youtube_accounts')
          .select('id, user_id, google_id, channel_id, channel_title, channel_description, channel_thumbnail, statistics, access_token, refresh_token, expires_at')
          .eq('user_id', authUser.id)
          .order('created_at', { ascending: false }),
      ]);

      if (profileError && profileError.code !== 'PGRST116') {
        console.error('Supabase active profile fetch error:', profileError);
      }

      if (!accountsError && (rawAccounts || []).length > 0) {
        const accounts = (rawAccounts || []) as SupabaseYouTubeAccountRow[];
        const selectedAccount = profile?.channel_id
          ? accounts.find((account) => account.channel_id === profile.channel_id) || accounts[0]
          : accounts[0];

        if (selectedAccount) {
          return mapSupabaseAccountToLegacyUser(
            (profile as SupabaseProfileRow | null) || null,
            selectedAccount,
          );
        }
      } else if (accountsError) {
        console.error('Supabase active account fetch error:', accountsError);
      }
    } catch (error) {
      console.error('Supabase active account resolution error:', error);
    }
  }

  const { accounts, activeIndex } = readAccountsFromCookies(req);
  return accounts[activeIndex] || null;
}

async function persistYouTubeAccountToSupabase(
  supabaseUserId: string | null,
  userInfo: any,
  channel: any,
  tokens: any,
) {
  if (!supabaseUserId || !channel?.id || !supabaseServer) {
    return;
  }

  try {
    const { data: existingAccount, error: existingAccountError } = await supabaseServer
      .from('youtube_accounts')
      .select('id, refresh_token')
      .eq('channel_id', channel.id)
      .maybeSingle();

    if (existingAccountError && existingAccountError.code !== 'PGRST116') {
      console.error('Supabase existing account fetch error:', existingAccountError);
    }

    const refreshToken = tokens.refresh_token || existingAccount?.refresh_token || '';
    if (!tokens.access_token) {
      console.warn('Skipping Supabase YouTube account persistence because OAuth access token is missing.');
      return;
    }

    if (!refreshToken) {
      console.warn('Persisting Supabase YouTube account without refresh token; reconnect may be required after access token expiry.');
    }

    const channelThumbnail =
      channel.snippet?.thumbnails?.default?.url ||
      channel.snippet?.thumbnails?.medium?.url ||
      channel.snippet?.thumbnails?.high?.url ||
      null;

    const expiresAt = tokens.expiry_date
      ? new Date(tokens.expiry_date).toISOString()
      : Number.isFinite(Number(tokens.expires_in))
        ? new Date(Date.now() + Number(tokens.expires_in) * 1000).toISOString()
        : null;

    const accountPayload = {
      user_id: supabaseUserId,
      google_id: String(userInfo?.id || supabaseUserId),
      channel_id: channel.id,
      channel_title: channel.snippet?.title || 'Untitled Channel',
      channel_description: channel.snippet?.description || null,
      channel_thumbnail: channelThumbnail,
      access_token: tokens.access_token,
      refresh_token: refreshToken,
      expires_at: expiresAt,
      statistics: {
        subscriberCount: String(channel.statistics?.subscriberCount || '0'),
        viewCount: String(channel.statistics?.viewCount || '0'),
        videoCount: String(channel.statistics?.videoCount || '0'),
      },
    };

    const upsertAccount = async (onConflict: string) =>
      supabaseServer
        .from('youtube_accounts')
        .upsert(accountPayload, { onConflict });

    let accountResult = await upsertAccount('channel_id');
    if (accountResult.error) {
      const code = String((accountResult.error as any)?.code || '');
      const message = String((accountResult.error as any)?.message || '').toLowerCase();
      const conflictTargetMissing =
        code === '42P10' ||
        message.includes('no unique or exclusion constraint matching the on conflict specification');

      if (conflictTargetMissing) {
        // Backward-compatible fallback for installations that use a composite unique key.
        accountResult = await upsertAccount('user_id,channel_id');
      }
    }

    const [profileResult] = await Promise.all([
      supabaseServer
        .from('profiles')
        .upsert(
          {
            id: supabaseUserId,
            full_name: userInfo?.name || null,
            avatar_url: userInfo?.picture || null,
            channel_id: channel.id,
          },
          { onConflict: 'id' },
        ),
    ]);

    if (profileResult.error) {
      console.error('Supabase profile upsert error:', profileResult.error);
    }

    if (accountResult.error) {
      console.error('Supabase YouTube account upsert error:', accountResult.error);
    }
  } catch (error) {
    console.error('Supabase OAuth persistence error:', error);
  }
}

async function getAuthHeaderForAccount(userData: any) {
  const refreshToken = userData?.tokens?.refresh_token;
  const fallbackAccessToken = userData?.tokens?.access_token;
  const rawCacheScope = String(userData?.channel?.id || userData?.id || '').trim();
  const cacheScopeHeader = rawCacheScope ? { 'X-VidVision-Cache-Scope': `channel:${rawCacheScope}` } : {};

  if (refreshToken) {
    const client = createOAuthClient();
    client.setCredentials({ refresh_token: refreshToken });
    const token = (await client.getAccessToken())?.token;
    if (token) {
      return { Authorization: `Bearer ${token}`, ...cacheScopeHeader };
    }
  }

  if (fallbackAccessToken) {
    return { Authorization: `Bearer ${fallbackAccessToken}`, ...cacheScopeHeader };
  }

  throw new Error('No OAuth token available for active account');
}

function parseMaxResults(rawValue: unknown, fallback = 50): number {
  const raw = Array.isArray(rawValue) ? rawValue[0] : rawValue;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(50, Math.max(1, Math.floor(parsed)));
}

function normalizeYouTubeSearchQuery(rawValue: unknown): string {
  return String(rawValue || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizeYouTubeSearchQueries(queries: unknown[], limit = 5): string[] {
  const deduped = new Set<string>();
  const normalized: string[] = [];

  for (const query of queries) {
    const cleanQuery = normalizeYouTubeSearchQuery(query);
    if (!cleanQuery || deduped.has(cleanQuery)) continue;
    deduped.add(cleanQuery);
    normalized.push(cleanQuery);
    if (normalized.length >= limit) break;
  }

  return normalized;
}

type MineVideoSeed = {
  videoId: string;
  title: string;
};

async function fetchMineVideoSeeds(
  authHeader: Record<string, string>,
  maxResults: number,
): Promise<
  | { ok: true; seeds: MineVideoSeed[] }
  | { ok: false; step: 'channels' | 'playlistItems'; upstream: ReturnType<typeof extractYouTubeError> }
> {
  const boundedMaxResults = Math.min(50, Math.max(1, Math.floor(maxResults)));

  const channelResponse = await fetch(
    'https://www.googleapis.com/youtube/v3/channels?part=contentDetails&mine=true',
    { headers: authHeader },
  );
  const channelData = await channelResponse.json().catch(() => ({}));

  if (!channelResponse.ok || channelData?.error) {
    return {
      ok: false,
      step: 'channels',
      upstream: extractYouTubeError(
        channelData,
        'Failed to fetch channel uploads playlist from YouTube',
        channelResponse.status,
      ),
    };
  }

  const uploadsPlaylistId = channelData?.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploadsPlaylistId) {
    return { ok: true, seeds: [] };
  }

  const playlistResponse = await fetch(
    `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId=${encodeURIComponent(uploadsPlaylistId)}&maxResults=${boundedMaxResults}`,
    { headers: authHeader },
  );
  const playlistData = await playlistResponse.json().catch(() => ({}));

  if (!playlistResponse.ok || playlistData?.error) {
    return {
      ok: false,
      step: 'playlistItems',
      upstream: extractYouTubeError(
        playlistData,
        'Failed to fetch uploaded videos from YouTube',
        playlistResponse.status,
      ),
    };
  }

  const seeds = (playlistData.items || [])
    .map((item: any) => ({
      videoId: String(item?.contentDetails?.videoId || '').trim(),
      title: String(item?.snippet?.title || '').trim(),
    }))
    .filter((item: MineVideoSeed) => Boolean(item.videoId));

  return { ok: true, seeds };
}

installYouTubeDataApiCacheFetch();

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const path = Array.isArray(req.query?.path) ? req.query.path.join('/') : req.query?.path || '';

  // Supabase browser callback should resolve to SPA; forward query params to app root if this route intercepts it.
  if (path === 'auth/callback') {
    const redirectUrl = new URL(APP_URL);

    for (const [key, value] of Object.entries(req.query || {})) {
      if (key === 'path') continue;

      if (Array.isArray(value)) {
        value.forEach((entry) => redirectUrl.searchParams.append(key, String(entry)));
      } else if (typeof value !== 'undefined') {
        redirectUrl.searchParams.set(key, String(value));
      }
    }

    return res.redirect(307, redirectUrl.toString());
  }

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

  if (path === 'api/auth/finalize-youtube' && req.method === 'POST') {
    const authUser = await verifySupabaseUser(req);
    if (!authUser) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const pendingAccount = readPendingAccountFromCookies(req);
      const { accounts, activeIndex } = readAccountsFromCookies(req);
      const activeAccount = accounts[activeIndex] || accounts[0] || null;
      const accountToPersist = pendingAccount || activeAccount;

      if (!accountToPersist) {
        return res.status(200).json({ success: true, persisted: false, reason: 'No pending account data' });
      }

      const persisted = await persistLegacyAccountToSupabase(authUser.id, accountToPersist);

      res.setHeader('Set-Cookie', `${PENDING_ACCOUNT_COOKIE}=; ${CLEAR_COOKIE_BASE_OPTIONS}`);
      return res.json({ success: true, persisted });
    } catch (error) {
      console.error('Finalize YouTube auth error:', error);
      return res.status(500).json({ error: 'Failed to finalize YouTube account' });
    }
  }

  // OAuth URL generator
  if (path === 'api/auth/google/url') {
    console.log(`[Auth URL Request] REDIRECT_URI: ${REDIRECT_URI}`);
    const postAuthRedirect = normalizePostAuthRedirect(Array.isArray(req.query.next) ? req.query.next[0] : req.query.next);

    if (OAUTH_MISSING_VARS.length > 0) {
      console.error(`[Auth Error] Missing OAuth vars: ${OAUTH_MISSING_VARS.join(', ')}`);
      return res.status(500).json({
        error: 'Google OAuth credentials not configured',
        missingEnv: OAUTH_MISSING_VARS,
      });
    }

    const authUser = await verifySupabaseUser(req);
    if (!authUser) {
      return res.status(401).json({
        error: 'Supabase sign-in required before connecting YouTube.',
      });
    }

    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: [
        'https://www.googleapis.com/auth/youtube.readonly',
        'https://www.googleapis.com/auth/yt-analytics.readonly',
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile',
      ],
      prompt: 'consent',
      state: encodeOAuthState(postAuthRedirect, authUser?.id || null),
    });
    console.log(`[Auth URL Generated] URL contains redirect_uri: ${url.includes(REDIRECT_URI)}`);
    return res.json({ url });
  }

  // OAuth entry point for marketing site and direct YouTube auth flow
  if (path === 'auth/youtube') {
    console.log(`[YouTube Auth Entry] Redirecting to Supabase auth bridge`);
    const postAuthRedirect = normalizePostAuthRedirect(Array.isArray(req.query.next) ? req.query.next[0] : req.query.next);
    
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

    // Direct Google OAuth with identity + YouTube scopes in a single request.
    // Using our redirect_uri means the consent screen shows app.janso.studio.
    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: [
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile',
        'https://www.googleapis.com/auth/youtube.readonly',
        'https://www.googleapis.com/auth/yt-analytics.readonly',
      ],
      prompt: 'consent',
      state: encodeOAuthState(postAuthRedirect, null),
    });
    console.log(`[YouTube Auth Entry] Redirecting to Google OAuth with combined scopes`);
    return res.redirect(307, url);
  }

  // OAuth callback
  if (path === 'auth/google/callback' || path === 'api/auth/google/callback') {
    const { code } = req.query;
    const { redirectTo: postAuthRedirect, supabaseUserId } = decodeOAuthState(
      Array.isArray(req.query.state) ? req.query.state[0] : req.query.state,
    );

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

      if (!userInfo.email) {
        return res.status(400).send('Google did not return an email address. Please try again.');
      }

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

      // Store refresh token when available, else keep a short-lived access token fallback.
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

      const boundedAccounts = updatedAccounts.slice(0, 5);
      const cookieValue = encodeURIComponent(JSON.stringify(boundedAccounts));
      const pendingAccountValue = encodeURIComponent(JSON.stringify(newUserData));

      res.setHeader('Set-Cookie', [
        `tube_vision_accounts=${cookieValue}; ${COOKIE_BASE_OPTIONS}`,
        `tube_vision_active=0; ${COOKIE_BASE_OPTIONS}`,
        `${PENDING_ACCOUNT_COOKIE}=${pendingAccountValue}; ${COOKIE_BASE_OPTIONS}`,
      ]);

      if (!supabaseUserId) {
        // Combined flow (from /auth/youtube): create/find Supabase user via admin magic link,
        // persist the YouTube account, then redirect to establish the browser session.
        if (!supabaseServer) {
          return res.status(500).send('Authentication error - server not configured.');
        }
        const { data: linkData, error: linkError } = await supabaseServer.auth.admin.generateLink({
          type: 'magiclink',
          email: userInfo.email,
          options: {
            data: {
              full_name: userInfo.name || null,
              avatar_url: userInfo.picture || null,
            },
            redirectTo: `${APP_URL}/auth/callback`,
          },
        });

        if (linkError || !linkData?.properties?.action_link || !linkData?.user?.id) {
          console.error('[OAuth Callback] Failed to generate magic link:', linkError);
          return res.status(500).send('Authentication error - could not create your account. Please try again.');
        }

        await persistYouTubeAccountToSupabase(linkData.user.id, userInfo, channel, tokens);
        console.log(`[OAuth Callback] Combined flow: magic link generated for ${userInfo.email}`);
        return res.redirect(307, linkData.properties.action_link);
      }

      await persistYouTubeAccountToSupabase(supabaseUserId, userInfo, channel, tokens);

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
                        window.location.href = ${JSON.stringify(postAuthRedirect)};
                      }
                    }, 1000);
                  } else {
                    window.location.href = ${JSON.stringify(postAuthRedirect)};
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
    const { accounts, activeIndex } = await getUnifiedAccountsAndActiveIndex(req);
    const userData = accounts[activeIndex];
    if (!userData) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const { tokens, ...safeUser } = userData;
      return res.json(safeUser);
    } catch (error) {
      return res.status(401).json({ error: 'Invalid session' });
    }
  }

  // Daily AI script placeholder
  if (path === 'api/script/daily-placeholder') {
    const userData = await getActiveYouTubeUser(req);
    if (!userData) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      if (!userData || !userData.channel) {
        return res.status(400).json({ error: 'No channel connected' });
      }

      const authHeader = await getAuthHeaderForAccount(userData);
      const dateKey = new Date().toISOString().slice(0, 10);
      const channelTitle = userData.channel.title || 'your niche';
      const channelDescription = String(userData.channel.description || '').slice(0, 700);

      let recentTitles: string[] = [];
      try {
        const recentSeedResult = await fetchMineVideoSeeds(authHeader, 6);
        if (recentSeedResult.ok) {
          recentTitles = recentSeedResult.seeds
            .map((item) => item.title)
            .filter((title) => title.length > 0)
            .slice(0, 6);
        }
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
    const userData = await getActiveYouTubeUser(req);
    if (!userData) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      if (!userData || !userData.channel?.id) {
        return res.status(400).json({ error: 'No channel connected' });
      }

      const channelId = String(userData.channel.id);
      const cachedAlert = coachInsightAlertCache.get(channelId);
      if (cachedAlert && cachedAlert.expiresAt > Date.now()) {
        return res.json({ ...cachedAlert.payload, cached: true });
      }

      const authHeader = await getAuthHeaderForAccount(userData);
      const recentSeedResult = await fetchMineVideoSeeds(authHeader, 30);
      if (recentSeedResult.ok === false) {
        const errorResult = recentSeedResult as { ok: false; step: 'channels' | 'playlistItems'; upstream: ReturnType<typeof extractYouTubeError> };
        return res.status(errorResult.upstream.httpStatus).json({
          error: errorResult.upstream.message,
          upstream: {
            source: 'youtube',
            step: errorResult.step,
            code: errorResult.upstream.code,
            status: errorResult.upstream.status,
            reason: errorResult.upstream.reason,
            message: errorResult.upstream.message,
            isQuotaExceeded: errorResult.upstream.isQuotaExceeded,
          },
        });
      }

      const videoIds = recentSeedResult.seeds
        .map((item) => item.videoId)
        .filter(Boolean)
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
        `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${videoIds}`,
        { headers: authHeader }
      );

      if (!videosResponse.ok) {
        const errorPayload = await videosResponse.json().catch(() => ({}));
        const upstream = extractYouTubeError(
          errorPayload,
          'Failed to fetch detailed video data',
          videosResponse.status,
        );

        return res.status(videosResponse.status).json({
          error: upstream.message,
          upstream: {
            source: 'youtube',
            step: 'videos',
            code: upstream.code,
            status: upstream.status,
            reason: upstream.reason,
            message: upstream.message,
            isQuotaExceeded: upstream.isQuotaExceeded,
          },
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
- Janso Studio is the app name, not the creator name.
- Creator channel name is "${channelTitle}".
- Never call the creator or audience "Janso Studio" unless the channel name exactly matches Janso Studio.

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
    const { accounts, activeIndex } = await getUnifiedAccountsAndActiveIndex(req);

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
    const authUser = await verifySupabaseUser(req);
    if (authUser && supabaseServer) {
      try {
        const { data: supabaseAccounts, error: fetchError } = await supabaseServer
          .from('youtube_accounts')
          .select('id, channel_id')
          .eq('user_id', authUser.id)
          .order('created_at', { ascending: false });

        if (fetchError) {
          console.error('Supabase switch fetch error:', fetchError);
        } else if ((supabaseAccounts || []).length > 0) {
          const body = readJsonBody(req);
          const newIndex = Number(body.index);

          if (!Number.isInteger(newIndex)) {
            return res.status(400).json({ error: 'Invalid index' });
          }

          if (newIndex < 0 || newIndex >= supabaseAccounts.length) {
            return res.status(400).json({ error: 'Index out of range' });
          }

          const selectedAccount = supabaseAccounts[newIndex];
          const { error: updateError } = await supabaseServer
            .from('profiles')
            .upsert({ id: authUser.id, channel_id: selectedAccount.channel_id }, { onConflict: 'id' });

          if (updateError) {
            console.error('Supabase switch profile update error:', updateError);
            return res.status(500).json({ error: 'Failed to switch account' });
          }

          return res.json({ success: true, activeIndex: newIndex });
        }
      } catch (error) {
        console.error('Supabase switch error:', error);
      }
    }

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
    const authUser = await verifySupabaseUser(req);
    if (authUser && supabaseServer) {
      try {
        const [{ data: profile }, { data: supabaseAccounts, error: fetchError }] = await Promise.all([
          supabaseServer
            .from('profiles')
            .select('channel_id')
            .eq('id', authUser.id)
            .maybeSingle(),
          supabaseServer
            .from('youtube_accounts')
            .select('id, channel_id')
            .eq('user_id', authUser.id)
            .order('created_at', { ascending: false }),
        ]);

        if (fetchError) {
          console.error('Supabase remove fetch error:', fetchError);
        } else if ((supabaseAccounts || []).length > 0) {
          const body = readJsonBody(req);
          const removeIndex = Number(body.index);

          if (!Number.isInteger(removeIndex)) {
            return res.status(400).json({ error: 'Invalid index' });
          }

          if (removeIndex < 0 || removeIndex >= supabaseAccounts.length) {
            return res.status(400).json({ error: 'Index out of range' });
          }

          const accountToRemove = supabaseAccounts[removeIndex];
          const { error: deleteError } = await supabaseServer
            .from('youtube_accounts')
            .delete()
            .eq('id', accountToRemove.id)
            .eq('user_id', authUser.id);

          if (deleteError) {
            console.error('Supabase remove delete error:', deleteError);
            return res.status(500).json({ error: 'Failed to remove account' });
          }

          const previousActiveIndex = profile?.channel_id
            ? supabaseAccounts.findIndex((account) => account.channel_id === profile.channel_id)
            : 0;
          const activeIndex = previousActiveIndex >= 0 ? previousActiveIndex : 0;
          const remainingAccounts = supabaseAccounts.filter((_, idx) => idx !== removeIndex);

          let nextActiveIndex = activeIndex;
          if (remainingAccounts.length === 0) {
            nextActiveIndex = 0;
          } else if (activeIndex === removeIndex) {
            nextActiveIndex = Math.max(0, removeIndex - 1);
          } else if (activeIndex > removeIndex) {
            nextActiveIndex = activeIndex - 1;
          }

          const nextChannelId = remainingAccounts[nextActiveIndex]?.channel_id || null;
          const { error: profileUpdateError } = await supabaseServer
            .from('profiles')
            .upsert({ id: authUser.id, channel_id: nextChannelId }, { onConflict: 'id' });

          if (profileUpdateError) {
            console.error('Supabase remove profile update error:', profileUpdateError);
            return res.status(500).json({ error: 'Failed to remove account' });
          }

          return res.json({ success: true, activeIndex: nextActiveIndex });
        }
      } catch (error) {
        console.error('Supabase remove error:', error);
      }
    }

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
    const userData = await getActiveYouTubeUser(req);
    if (!userData) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const maxResults = parseMaxResults(req.query?.maxResults, 50);
      const authHeader = await getAuthHeaderForAccount(userData);

      const recentSeedResult = await fetchMineVideoSeeds(authHeader, maxResults);
      if (recentSeedResult.ok === false) {
        const errorResult = recentSeedResult as { ok: false; step: 'channels' | 'playlistItems'; upstream: ReturnType<typeof extractYouTubeError> };
        return res.status(errorResult.upstream.httpStatus).json({
          error: errorResult.upstream.message,
          upstream: {
            source: 'youtube',
            step: errorResult.step,
            code: errorResult.upstream.code,
            status: errorResult.upstream.status,
            reason: errorResult.upstream.reason,
            message: errorResult.upstream.message,
            isQuotaExceeded: errorResult.upstream.isQuotaExceeded,
          },
        });
      }

      const videoIds = recentSeedResult.seeds
        .map((item) => item.videoId)
        .filter(Boolean)
        .join(',');

      if (!videoIds) {
        return res.json([]);
      }

      const statsResponse = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${videoIds}`,
        { headers: authHeader }
      );
      const statsData = await statsResponse.json().catch(() => ({}));

      if (!statsResponse.ok || statsData?.error) {
        const upstream = extractYouTubeError(
          statsData,
          'Failed to fetch video details from YouTube',
          statsResponse.status,
        );
        return res.status(upstream.httpStatus).json({
          error: upstream.message,
          upstream: {
            source: 'youtube',
            step: 'videos',
            code: upstream.code,
            status: upstream.status,
            reason: upstream.reason,
            message: upstream.message,
            isQuotaExceeded: upstream.isQuotaExceeded,
          },
        });
      }

      return res.json(statsData.items || []);
    } catch (error) {
      console.error('Fetch videos error:', error);
      return res.status(500).json({ error: 'Failed to fetch videos' });
    }
  }

  if (path === 'api/comments/fetch') {
    const userData = await getActiveYouTubeUser(req);
    if (!userData) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const videoId = Array.isArray(req.query.videoId) ? req.query.videoId[0] : req.query.videoId;
    if (!videoId || typeof videoId !== 'string') {
      return res.status(400).json({ error: 'videoId is required' });
    }

    try {
      const authHeader = await getAuthHeaderForAccount(userData);
      const commentsResponse = await fetch(
        `https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&videoId=${encodeURIComponent(videoId)}&maxResults=100&order=relevance&textFormat=plainText`,
        { headers: authHeader }
      );

      const commentsData = await commentsResponse.json();
      if (!commentsResponse.ok || commentsData?.error) {
        const statusCode = Number(commentsData?.error?.code) || commentsResponse.status || 500;
        return res.status(statusCode).json({
          error: commentsData?.error?.message || 'Failed to fetch comments',
        });
      }

      const comments = (commentsData.items || [])
        .map((item: any) => {
          const topLevel = item?.snippet?.topLevelComment?.snippet;
          if (!topLevel?.textDisplay) {
            return null;
          }

          return {
            id: item?.id,
            textDisplay: topLevel.textDisplay,
            authorDisplayName: topLevel.authorDisplayName,
            likeCount: Number(topLevel.likeCount || 0),
            publishedAt: topLevel.publishedAt,
          };
        })
        .filter(Boolean);

      return res.json({
        comments,
        totalComments: commentsData?.pageInfo?.totalResults || comments.length,
      });
    } catch (error) {
      console.error('Fetch comments error:', error);
      return res.status(500).json({ error: 'Failed to fetch comments' });
    }
  }

  // Update video title
  if (path.match(/^api\/user\/videos\/[^/]+\/title$/) && req.method === 'PUT') {
    const userData = await getActiveYouTubeUser(req);
    if (!userData) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const videoId = path.split('/')[3];
    const body = readJsonBody(req);
    const { title } = body;

    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Title is required' });
    }

    try {
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
    const userData = await getActiveYouTubeUser(req);
    if (!userData) {
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
    const userData = await getActiveYouTubeUser(req);
    if (!userData) {
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
    const userData = await getActiveYouTubeUser(req);
    if (!userData) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
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
    const userData = await getActiveYouTubeUser(req);
    if (!userData) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const authHeader = await getAuthHeaderForAccount(userData);

      const recentSeedResult = await fetchMineVideoSeeds(authHeader, 50);
      if (recentSeedResult.ok === false) {
        const { upstream, step } = recentSeedResult;
        return res.status(upstream.httpStatus).json({
          error: upstream.message,
          upstream: {
            source: 'youtube',
            step: step,
            code: upstream.code,
            status: upstream.status,
            reason: upstream.reason,
            message: upstream.message,
            isQuotaExceeded: upstream.isQuotaExceeded,
          },
        });
      }

      const videoIds = recentSeedResult.seeds.map((item) => item.videoId).filter(Boolean).join(',');
      if (!videoIds) {
        return res.json({
          bestHour: null,
          bestDay: null,
          confidence: 'low',
          message: 'Not enough video data to analyze posting patterns',
        });
      }

      const videosResponse = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${videoIds}`,
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
    const userData = await getActiveYouTubeUser(req);
    if (!userData) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const ownershipKey = getThumbnailOwnershipKey(userData);
    const queue = readThumbnailAuthorizationsFromCookies(req)
      .filter((item) => item.ownershipKey === ownershipKey)
      .map(({ ownershipKey: _ownershipKey, ...item }) => item);

    return res.json(queue);
  }

  if (path === 'api/thumbnails/authorize' && req.method === 'POST') {
    const userData = await getActiveYouTubeUser(req);
    if (!userData) {
      return res.status(401).json({ error: 'Not authenticated' });
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
    const userData = await getActiveYouTubeUser(req);
    if (!userData) {
      return res.status(401).json({ error: 'Not authenticated' });
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
    const userData = await getActiveYouTubeUser(req);
    if (!userData) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const authHeader = await getAuthHeaderForAccount(userData);

      const recentSeedResult = await fetchMineVideoSeeds(authHeader, 50);
      if (recentSeedResult.ok === false) {
        const { upstream, step } = recentSeedResult;
        return res.status(upstream.httpStatus).json({
          error: upstream.message,
          upstream: {
            source: 'youtube',
            step: step,
            code: upstream.code,
            status: upstream.status,
            reason: upstream.reason,
            message: upstream.message,
            isQuotaExceeded: upstream.isQuotaExceeded,
          },
        });
      }

      const videoIds = recentSeedResult.seeds
        .map((item) => item.videoId)
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
        const upstream = extractYouTubeError(
          errorData,
          'Failed to fetch video details from YouTube',
          videosResponse.status,
        );

        return res.status(upstream.httpStatus).json({
          error: upstream.message,
          upstream: {
            source: 'youtube',
            step: 'videos',
            code: upstream.code,
            status: upstream.status,
            reason: upstream.reason,
            message: upstream.message,
            isQuotaExceeded: upstream.isQuotaExceeded,
          },
        });
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
        const userData = await getActiveYouTubeUser(req);
        if (!userData || !userData.tokens) {
          return res.status(401).json({ error: 'Not authenticated' });
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
    const userData = await getActiveYouTubeUser(req);
    if (!userData) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const rawQuery = Array.isArray(req.query?.q) ? req.query.q[0] : req.query?.q;
    const query = normalizeYouTubeSearchQuery(rawQuery);
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    try {
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
    const userData = await getActiveYouTubeUser(req);
    if (!userData) {
      return res.status(401).json({ error: 'Not authenticated' });
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
    const userData = await getActiveYouTubeUser(req);
    if (!userData) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      if (!userData?.channel) {
        return res.status(400).json({ error: 'No channel connected' });
      }

      const authHeader = await getAuthHeaderForAccount(userData);

      const recentSeedResult = await fetchMineVideoSeeds(authHeader, 10);
      if (recentSeedResult.ok === false) {
        const { upstream } = recentSeedResult;
        return res.status(upstream.httpStatus).json({
          error: upstream.message,
          upstream: upstream,
        });
      }

      const myVideoIds = recentSeedResult.seeds.map((item) => item.videoId).filter(Boolean).join(',');

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
      const myStatsData = await myStatsResponse.json().catch(() => ({}));

      if (!myStatsResponse.ok || myStatsData?.error) {
        const statusCode = Number(myStatsData?.error?.code) || myStatsResponse.status || 500;
        return res.status(statusCode).json({
          error: myStatsData?.error?.message || 'Failed to fetch video stats from YouTube',
          upstream: myStatsData?.error || null,
        });
      }

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
      const normalizedSearchQueries = normalizeYouTubeSearchQueries(searchQueries, 3);

      if (normalizedSearchQueries.length === 0) {
        const fallbackQuery = normalizeYouTubeSearchQuery(userData.channel.title || nicheDescription);
        if (fallbackQuery) {
          normalizedSearchQueries.push(fallbackQuery);
        }
      }

      const collectCompetitorsForQuery = async (searchQuery: string) => {
        try {
          const searchResponse = await fetch(
            `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${encodeURIComponent(searchQuery)}&maxResults=10&order=relevance`,
            { headers: authHeader }
          );
          const searchData = await searchResponse.json().catch(() => ({}));

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
          console.error(`Search error for query "${searchQuery}":`, searchError);
        }
      };

      for (const searchQuery of normalizedSearchQueries.slice(0, 2)) {
        await collectCompetitorsForQuery(searchQuery);
      }

      if (competitorChannels.size < 6 && normalizedSearchQueries.length > 2) {
        await collectCompetitorsForQuery(normalizedSearchQueries[2]);
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
      const channelsStatsData = await channelsStatsResponse.json().catch(() => ({}));

      if (!channelsStatsResponse.ok || channelsStatsData?.error) {
        const statusCode = Number(channelsStatsData?.error?.code) || channelsStatsResponse.status || 500;
        return res.status(statusCode).json({
          error: channelsStatsData?.error?.message || 'Failed to fetch competitor channel stats from YouTube',
          upstream: channelsStatsData?.error || null,
        });
      }

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

  // Search collaborators (used by Collaboration Engine)
  if (path === 'api/collaborators/search' && req.method === 'POST') {
    const userData = await getActiveYouTubeUser(req);
    if (!userData) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const body = readJsonBody(req) || {};
      const niche = normalizeYouTubeSearchQuery(body.niche);
      const minSubscribers = Math.max(0, toNumber(body.minSubscribers));
      const rawMaxSubscribers = toNumber(body.maxSubscribers || Number.MAX_SAFE_INTEGER);
      const maxSubscribers = Math.max(minSubscribers, rawMaxSubscribers);
      const maxResults = Math.min(Math.max(toNumber(body.maxResults || 15), 1), 25);

      if (!niche) {
        return res.status(400).json({ error: 'niche is required' });
      }

      const authHeader = await getAuthHeaderForAccount(userData);
      const searchResponse = await fetch(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${encodeURIComponent(niche)}&maxResults=${Math.min(maxResults * 2, 50)}&order=relevance`,
        { headers: authHeader }
      );
      const searchData = await searchResponse.json().catch(() => ({}));

      if (!searchResponse.ok || searchData?.error) {
        const statusCode = Number(searchData?.error?.code) || searchResponse.status || 500;
        return res.status(statusCode).json({
          error: searchData?.error?.message || 'Failed to search collaborator channels on YouTube',
          upstream: searchData?.error || null,
        });
      }

      const channelIds = Array.from(
        new Set(
          (searchData.items || [])
            .map((item: any) => item?.snippet?.channelId || item?.id?.channelId)
            .filter(Boolean)
        )
      ).slice(0, 50);

      if (channelIds.length === 0) {
        return res.json({ creators: [] });
      }

      const channelsResponse = await fetch(
        `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id=${channelIds.join(',')}`,
        { headers: authHeader }
      );
      const channelsData = await channelsResponse.json().catch(() => ({}));

      if (!channelsResponse.ok || channelsData?.error) {
        const statusCode = Number(channelsData?.error?.code) || channelsResponse.status || 500;
        return res.status(statusCode).json({
          error: channelsData?.error?.message || 'Failed to load collaborator channel stats',
          upstream: channelsData?.error || null,
        });
      }

      const creators = (channelsData.items || [])
        .filter((channel: any) => {
          const subscribers = toNumber(channel?.statistics?.subscriberCount);
          return subscribers >= minSubscribers && subscribers <= maxSubscribers;
        })
        .slice(0, maxResults)
        .map((channel: any) => ({
          id: channel.id,
          title: channel?.snippet?.title || 'Untitled Channel',
          description: channel?.snippet?.description || '',
          customUrl: channel?.snippet?.customUrl || undefined,
          thumbnails: channel?.snippet?.thumbnails || {},
          statistics: {
            subscriberCount: String(channel?.statistics?.subscriberCount || '0'),
            videoCount: String(channel?.statistics?.videoCount || '0'),
            viewCount: String(channel?.statistics?.viewCount || '0'),
          },
        }));

      return res.json({ creators });
    } catch (error) {
      console.error('Search collaborators error:', error);
      return res.status(500).json({ error: 'Failed to search collaborators' });
    }
  }

  if (path === 'api/collaborators/videos') {
    const userData = await getActiveYouTubeUser(req);
    if (!userData) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const rawChannelId = Array.isArray(req.query.channelId) ? req.query.channelId[0] : req.query.channelId;
    const channelId = typeof rawChannelId === 'string' ? rawChannelId : '';
    if (!channelId) {
      return res.status(400).json({ error: 'channelId is required' });
    }

    try {
      const authHeader = await getAuthHeaderForAccount(userData);

      const channelResponse = await fetch(
        `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=${encodeURIComponent(channelId)}`,
        { headers: authHeader }
      );
      const channelData = await channelResponse.json().catch(() => ({}));

      if (!channelResponse.ok || channelData?.error) {
        const statusCode = Number(channelData?.error?.code) || channelResponse.status || 500;
        return res.status(statusCode).json({
          error: channelData?.error?.message || 'Failed to fetch collaborator channel details',
          upstream: channelData?.error || null,
        });
      }

      const uploadsPlaylistId = channelData?.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
      if (!uploadsPlaylistId) {
        return res.json({ videos: [] });
      }

      const playlistResponse = await fetch(
        `https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&playlistId=${uploadsPlaylistId}&maxResults=12`,
        { headers: authHeader }
      );
      const playlistData = await playlistResponse.json().catch(() => ({}));

      if (!playlistResponse.ok || playlistData?.error) {
        const statusCode = Number(playlistData?.error?.code) || playlistResponse.status || 500;
        return res.status(statusCode).json({
          error: playlistData?.error?.message || 'Failed to fetch collaborator uploads playlist',
          upstream: playlistData?.error || null,
        });
      }

      const videoIds = (playlistData.items || [])
        .map((item: any) => item?.contentDetails?.videoId)
        .filter(Boolean)
        .join(',');

      if (!videoIds) {
        return res.json({ videos: [] });
      }

      const videosResponse = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${videoIds}`,
        { headers: authHeader }
      );
      const videosData = await videosResponse.json().catch(() => ({}));

      if (!videosResponse.ok || videosData?.error) {
        const statusCode = Number(videosData?.error?.code) || videosResponse.status || 500;
        return res.status(statusCode).json({
          error: videosData?.error?.message || 'Failed to fetch collaborator video stats',
          upstream: videosData?.error || null,
        });
      }

      const videos = (videosData.items || []).map((video: any) => ({
        id: video.id,
        title: video?.snippet?.title || 'Untitled',
        viewCount: toNumber(video?.statistics?.viewCount),
        publishedAt: video?.snippet?.publishedAt || null,
      }));

      return res.json({ videos });
    } catch (error) {
      console.error('Fetch collaborator videos error:', error);
      return res.status(500).json({ error: 'Failed to fetch collaborator videos' });
    }
  }

  // Search competitors
  if (path === 'api/competitors/search') {
    const userData = await getActiveYouTubeUser(req);
    if (!userData) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const rawQuery = Array.isArray(req.query.q) ? req.query.q[0] : req.query.q;
    const query = normalizeYouTubeSearchQuery(rawQuery);
    if (!query) {
      return res.status(400).json({ error: 'q is required' });
    }

    try {
      const authHeader = await getAuthHeaderForAccount(userData);

      const response = await fetch(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${encodeURIComponent(query)}&maxResults=5`,
        { headers: authHeader }
      );
      const data = await response.json().catch(() => ({}));

      if (!response.ok || data?.error) {
        const statusCode = Number(data?.error?.code) || response.status || 500;
        return res.status(statusCode).json({
          error: data?.error?.message || 'Failed to search competitor channels on YouTube',
          upstream: data?.error || null,
        });
      }

      return res.json(data.items || []);
    } catch (error) {
      console.error('Search competitors error:', error);
      return res.status(500).json({ error: 'Failed to search competitors' });
    }
  }

  // Get competitor videos
  if (path === 'api/competitors/videos') {
    const userData = await getActiveYouTubeUser(req);
    if (!userData) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const rawChannelId = Array.isArray(req.query.channelId) ? req.query.channelId[0] : req.query.channelId;
    const channelId = typeof rawChannelId === 'string' ? rawChannelId : '';
    if (!channelId) {
      return res.status(400).json({ error: 'channelId is required' });
    }

    try {
      const authHeader = await getAuthHeaderForAccount(userData);

      const channelResponse = await fetch(
        `https://www.googleapis.com/youtube/v3/channels?part=contentDetails,statistics,snippet&id=${encodeURIComponent(channelId)}`,
        { headers: authHeader }
      );
      const channelData = await channelResponse.json().catch(() => ({}));

      if (!channelResponse.ok || channelData?.error) {
        const statusCode = Number(channelData?.error?.code) || channelResponse.status || 500;
        return res.status(statusCode).json({
          error: channelData?.error?.message || 'Failed to fetch competitor channel details',
          upstream: channelData?.error || null,
        });
      }

      const channel = channelData.items?.[0];
      if (!channel) {
        return res.status(404).json({ error: 'Channel not found' });
      }

      const uploadsPlaylistId = channel?.contentDetails?.relatedPlaylists?.uploads;

      if (!uploadsPlaylistId) {
        return res.status(404).json({ error: 'Uploads playlist not found' });
      }

      const playlistResponse = await fetch(
        `https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&playlistId=${uploadsPlaylistId}&maxResults=20`,
        { headers: authHeader }
      );
      const playlistData = await playlistResponse.json().catch(() => ({}));

      if (!playlistResponse.ok || playlistData?.error) {
        const statusCode = Number(playlistData?.error?.code) || playlistResponse.status || 500;
        return res.status(statusCode).json({
          error: playlistData?.error?.message || 'Failed to fetch competitor uploads playlist',
          upstream: playlistData?.error || null,
        });
      }

      const videoIds = (playlistData.items || [])
        .map((item: any) => item?.contentDetails?.videoId)
        .filter(Boolean)
        .join(',');

      const rawCustomUrl = channel.snippet?.customUrl;
      const normalizedCustomUrl = rawCustomUrl
        ? String(rawCustomUrl).replace(/^https?:\/\/(www\.)?youtube\.com\//i, '')
        : '';
      const channelPath = normalizedCustomUrl
        ? normalizedCustomUrl.startsWith('@') ||
          normalizedCustomUrl.startsWith('c/') ||
          normalizedCustomUrl.startsWith('user/') ||
          normalizedCustomUrl.startsWith('channel/')
          ? normalizedCustomUrl
          : `@${normalizedCustomUrl}`
        : channel.id
          ? `channel/${channel.id}`
          : '';
      const channelUrl = channelPath ? `https://www.youtube.com/${channelPath}` : undefined;

      if (videoIds) {
        const statsResponse = await fetch(
          `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${videoIds}`,
          { headers: authHeader }
        );
        const statsData = await statsResponse.json().catch(() => ({}));

        if (!statsResponse.ok || statsData?.error) {
          const statusCode = Number(statsData?.error?.code) || statsResponse.status || 500;
          return res.status(statusCode).json({
            error: statsData?.error?.message || 'Failed to fetch competitor video stats',
            upstream: statsData?.error || null,
          });
        }

        const sortedVideos = (statsData.items || []).sort(
          (a: any, b: any) => parseInt(b.statistics.viewCount) - parseInt(a.statistics.viewCount)
        );

        return res.json({
          channel: {
            id: channel.id,
            title: channel.snippet.title,
            description: channel.snippet.description,
            thumbnails: channel.snippet.thumbnails,
            customUrl: rawCustomUrl,
            channelUrl,
            statistics: channel.statistics,
          },
          videos: sortedVideos,
        });
      }

      return res.json({
        channel: {
          id: channel.id,
          title: channel.snippet.title,
          description: channel.snippet.description,
          thumbnails: channel.snippet.thumbnails,
          customUrl: rawCustomUrl,
          channelUrl,
          statistics: channel.statistics,
        },
        videos: [],
      });
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
        : 'tube_vision_active=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0',
      APP_URL.startsWith('https://')
        ? `${PENDING_ACCOUNT_COOKIE}=; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=0`
        : `${PENDING_ACCOUNT_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
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

