import type { VercelRequest } from '@vercel/node';
import { createHmac } from 'node:crypto';

export type SupabaseProfileRow = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  channel_id: string | null;
};

export type SupabaseYouTubeAccountRow = {
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

export type UnifiedAccountState = {
  accounts: any[];
  activeIndex: number;
  source: 'supabase' | 'cookie';
};

export type CoachVideoSignal = {
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

export type CoachTopicInsight = {
  topicToken: string;
  topicLabel: string;
  recent: CoachVideoSignal[];
  baseline: CoachVideoSignal[];
  liftPercent: number;
  retentionLiftPercent: number | null;
  usesRetention: boolean;
};

export const COACH_ALERT_CACHE_TTL_MS = 20 * 60 * 1000;
export const COACH_ALERT_LOOKBACK_DAYS = 90;
export const coachInsightAlertCache = new Map<string, { expiresAt: number; payload: any }>();

const COACH_STOP_WORDS = new Set([
  'about',
  'after',
  'again',
  'also',
  'another',
  'because',
  'before',
  'being',
  'could',
  'every',
  'first',
  'from',
  'have',
  'history',
  'into',
  'just',
  'make',
  'more',
  'most',
  'next',
  'other',
  'over',
  'part',
  'really',
  'should',
  'some',
  'than',
  'that',
  'their',
  'there',
  'these',
  'they',
  'this',
  'those',
  'through',
  'today',
  'video',
  'videos',
  'what',
  'when',
  'where',
  'which',
  'while',
  'with',
  'your',
  'youtube',
  'why',
]);

const YOUTUBE_DATA_API_CACHE_TABLE = 'youtube_api_cache';
const YOUTUBE_DATA_CACHE_VERSION = 'v1';
const YOUTUBE_DATA_CACHE_SCOPE_HEADER = 'x-vidvision-cache-scope';
const YOUTUBE_DATA_CACHE_PATCH_FLAG = '__vidvision_youtube_cache_patch_v1__';
const YOUTUBE_DATA_CACHE_DEFAULT_TTL_SECONDS = 180;
const YOUTUBE_DATA_CACHE_PRUNE_INTERVAL_MS = 15 * 60 * 1000;

type YouTubeDataCacheRow = {
  response_json: unknown;
  status_code: number | null;
  expires_at: string;
};

type SupabaseServerLike = {
  from: (table: string) => any;
} | null;

export function isMissingConfigValue(value?: string): boolean {
  if (!value || !value.trim()) return true;
  const normalized = value.trim().toLowerCase();
  return (
    normalized.includes('your_google_client') ||
    normalized.includes('placeholder') ||
    normalized.includes('changeme')
  );
}

export function getGeminiKeyFromRequest(req: VercelRequest): string {
  const apiKey = req.headers['x-gemini-key'] as string;

  if (!apiKey || !apiKey.trim()) {
    throw new Error('Gemini API key required. Please configure your key in Settings.');
  }

  return apiKey.trim();
}

export function toNumber(value: unknown): number {
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

export function extractYouTubeError(errorPayload: any, fallbackMessage: string, fallbackStatus = 500) {
  const code = Number(errorPayload?.error?.code) || Number(fallbackStatus) || 500;
  const status = typeof errorPayload?.error?.status === 'string' ? errorPayload.error.status : null;
  const reason =
    typeof errorPayload?.error?.errors?.[0]?.reason === 'string' ? errorPayload.error.errors[0].reason : null;
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

export function mapSupabaseAccountToLegacyUser(
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

export function extractTopicTokens(title: string): string[] {
  const normalized = String(title || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 4 && !COACH_STOP_WORDS.has(token));

  return [...new Set(normalized)].slice(0, 8);
}

export function buildFallbackIdeas(topicLabel: string, channelTitle: string): string[] {
  const audience = channelTitle?.trim() || 'your audience';
  return [
    `${topicLabel} myths your viewers still believe in 2026`,
    `${topicLabel}: 3 mistakes ${audience} should avoid this week`,
    `Beginner-to-advanced ${topicLabel} roadmap in one video`,
  ];
}

export function pickBestTopicInsight(signals: CoachVideoSignal[]): CoachTopicInsight | null {
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

  const bestLift =
    best.usesRetention && best.retentionLiftPercent !== null ? best.retentionLiftPercent : best.liftPercent;

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

export function parseISODurationToSeconds(duration: string): number {
  if (!duration) return 0;
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;

  const hours = Number(match[1] || 0);
  const minutes = Number(match[2] || 0);
  const seconds = Number(match[3] || 0);
  return hours * 3600 + minutes * 60 + seconds;
}

export function formatDurationLabel(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function parseMaxResults(rawValue: unknown, fallback = 50): number {
  const raw = Array.isArray(rawValue) ? rawValue[0] : rawValue;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(50, Math.max(1, Math.floor(parsed)));
}

export function normalizeYouTubeSearchQuery(rawValue: unknown): string {
  return String(rawValue || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

export function normalizeYouTubeSearchQueries(queries: unknown[], limit = 5): string[] {
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

function deriveYouTubeDataCacheScope(headers: Headers, cacheSecret: string): string {
  const explicitScope = headers.get(YOUTUBE_DATA_CACHE_SCOPE_HEADER)?.trim();
  if (explicitScope) {
    return explicitScope.slice(0, 128);
  }

  const authorization = headers.get('authorization')?.trim();
  if (authorization?.startsWith('Bearer ')) {
    const token = authorization.slice('Bearer '.length).trim();
    if (token) {
      const tokenHash = createHmac('sha256', cacheSecret).update(token).digest('hex').slice(0, 20);
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

export function installYouTubeDataApiCacheFetch(params: {
  supabaseServer: SupabaseServerLike;
  cacheSecret: string;
}) {
  let youtubeDataCacheAvailable = Boolean(params.supabaseServer);
  let youtubeDataCacheMissingTableWarned = false;
  let lastYouTubeDataCachePruneAt = 0;

  const handleYouTubeDataCacheError = (error: any, operation: 'read' | 'write' | 'prune') => {
    const code = String(error?.code || '');
    const message = String(error?.message || '').toLowerCase();
    const missingTable =
      code === '42P01' || (message.includes('youtube_api_cache') && message.includes('does not exist'));

    if (missingTable) {
      youtubeDataCacheAvailable = false;
      if (!youtubeDataCacheMissingTableWarned) {
        youtubeDataCacheMissingTableWarned = true;
        console.warn(
          '[YouTube Cache] Supabase table "youtube_api_cache" is missing. Run the latest SQL migration to enable cache hits.',
        );
      }
      return;
    }

    if (operation !== 'read') {
      console.warn(`[YouTube Cache] ${operation} failed:`, error?.message || error);
    }
  };

  const readYouTubeDataCache = async (cacheKey: string): Promise<YouTubeDataCacheRow | null> => {
    if (!youtubeDataCacheAvailable || !params.supabaseServer) {
      return null;
    }

    const { data, error } = await params.supabaseServer
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
  };

  const maybePruneYouTubeDataCache = async () => {
    if (!youtubeDataCacheAvailable || !params.supabaseServer) {
      return;
    }

    const now = Date.now();
    if (now - lastYouTubeDataCachePruneAt < YOUTUBE_DATA_CACHE_PRUNE_INTERVAL_MS) {
      return;
    }
    lastYouTubeDataCachePruneAt = now;

    const { error } = await params.supabaseServer
      .from(YOUTUBE_DATA_API_CACHE_TABLE)
      .delete()
      .lt('expires_at', new Date(now).toISOString());

    if (error) {
      handleYouTubeDataCacheError(error, 'prune');
    }
  };

  const writeYouTubeDataCache = async (entry: {
    cacheKey: string;
    cacheScope: string;
    endpoint: string;
    responseJson: unknown;
    statusCode: number;
    ttlSeconds: number;
  }) => {
    if (!youtubeDataCacheAvailable || !params.supabaseServer) {
      return;
    }

    const ttlSeconds = Math.max(
      30,
      Math.min(3600, Number(entry.ttlSeconds) || YOUTUBE_DATA_CACHE_DEFAULT_TTL_SECONDS),
    );
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

    const { error } = await params.supabaseServer
      .from(YOUTUBE_DATA_API_CACHE_TABLE)
      .upsert(
        {
          cache_key: entry.cacheKey,
          cache_scope: entry.cacheScope,
          endpoint: entry.endpoint,
          response_json: entry.responseJson,
          status_code: entry.statusCode,
          expires_at: expiresAt,
        },
        { onConflict: 'cache_key' },
      );

    if (error) {
      handleYouTubeDataCacheError(error, 'write');
      return;
    }

    await maybePruneYouTubeDataCache();
  };

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

    const cacheScope = deriveYouTubeDataCacheScope(headers, params.cacheSecret);
    const normalizedUrl = normalizeYouTubeDataApiUrl(rawUrl);
    const cacheKey = createHmac('sha256', params.cacheSecret)
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
