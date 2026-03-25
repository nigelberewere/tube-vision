/**
 * Fetch wrapper for AI-powered API endpoints
 * 
 * Automatically injects X-Gemini-Key header for backend AI processing
 * while maintaining security (key never logged or persisted server-side)
 */

import { loadGeminiKey } from './geminiKeyStorage';

type CachedFetchEntry<T> = {
  expiresAt: number;
  promise?: Promise<T>;
  value?: T;
};

type CachedJsonFetchOptions = RequestInit & {
  ttlMs?: number;
  cacheKey?: string;
  bypassCache?: boolean;
};

type CachedJsonResponse<T> = {
  ok: boolean;
  status: number;
  data: T | null;
  response: Response;
};

const jsonResponseCache = new Map<string, CachedFetchEntry<CachedJsonResponse<unknown>>>();

function buildCacheKey(url: string, options: CachedJsonFetchOptions): string {
  const method = (options.method || 'GET').toUpperCase();
  const headers = new Headers(options.headers || {});
  const authorization = headers.get('Authorization') || headers.get('X-Supabase-Auth') || '';
  return options.cacheKey || `${method}:${url}:${authorization}`;
}

export function invalidateApiCache(match?: string | RegExp): void {
  if (!match) {
    jsonResponseCache.clear();
    return;
  }

  for (const key of jsonResponseCache.keys()) {
    if (typeof match === 'string' ? key.includes(match) : match.test(key)) {
      jsonResponseCache.delete(key);
    }
  }
}

export async function fetchCachedJson<T = unknown>(
  url: string,
  options: CachedJsonFetchOptions = {},
): Promise<CachedJsonResponse<T>> {
  const method = (options.method || 'GET').toUpperCase();
  const ttlMs = Math.max(0, options.ttlMs || 0);
  const shouldCache = method === 'GET' && ttlMs > 0 && !options.bypassCache;

  if (!shouldCache) {
    const response = await fetch(url, options);
    const data = await response.clone().json().catch(() => null);
    return { ok: response.ok, status: response.status, data, response };
  }

  const cacheKey = buildCacheKey(url, options);
  const now = Date.now();
  const cached = jsonResponseCache.get(cacheKey);

  if (cached?.value && cached.expiresAt > now) {
    return cached.value as CachedJsonResponse<T>;
  }

  if (cached?.promise) {
    return cached.promise as Promise<CachedJsonResponse<T>>;
  }

  const fetchPromise = fetch(url, options)
    .then(async (response) => {
      const data = await response.clone().json().catch(() => null);
      const result: CachedJsonResponse<T> = {
        ok: response.ok,
        status: response.status,
        data,
        response,
      };

      if (response.ok) {
        jsonResponseCache.set(cacheKey, {
          value: result as CachedJsonResponse<unknown>,
          expiresAt: Date.now() + ttlMs,
        });
      } else {
        jsonResponseCache.delete(cacheKey);
      }

      return result;
    })
    .catch((error) => {
      jsonResponseCache.delete(cacheKey);
      throw error;
    });

  jsonResponseCache.set(cacheKey, {
    promise: fetchPromise as Promise<CachedJsonResponse<unknown>>,
    expiresAt: now + ttlMs,
  });

  return fetchPromise;
}

/**
 * Fetch wrapper that adds BYOK header for AI endpoints
 */
export async function fetchWithAI(url: string, options: RequestInit = {}): Promise<Response> {
  const apiKey = await loadGeminiKey();
  
  if (!apiKey) {
    throw new Error('Gemini API key required. Please add your key in Settings → API Keys.');
  }
  
  // Add Gemini API key header (safe for backend AI processing)
  const headers = new Headers(options.headers);
  headers.set('X-Gemini-Key', apiKey);
  
  return fetch(url, {
    ...options,
    headers,
  });
}

/**
 * Check if URL is an AI-powered endpoint
 */
function isAIEndpoint(url: string): boolean {
  const aiEndpoints = [
    '/api/analyze',
    '/api/script/daily-placeholder',
    '/api/coach/insight-alert',
    '/api/shorts/remix-plan',
    '/api/user/best-posting-time',
    '/api/gemini/validate',
  ];
  
  return aiEndpoints.some(endpoint => url.includes(endpoint));
}

/**
 * Smart fetch that auto-detects AI endpoints and adds header
 */
export async function smartFetch(url: string, options: RequestInit = {}): Promise<Response> {
  if (isAIEndpoint(url)) {
    return fetchWithAI(url, options);
  }
  
  return fetch(url, options);
}
