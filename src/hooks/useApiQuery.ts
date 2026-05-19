import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchCachedJson, type CachedJsonFetchOptions } from '../lib/apiFetch';

export interface UseApiQueryOptions<T> extends CachedJsonFetchOptions {
  onError?: (error: Error) => void;
  onSuccess?: (data: T) => void;
  enabled?: boolean;
}

export interface UseApiQueryResult<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/**
 * Unified hook for fetching and caching API data.
 * Replaces repetitive useState/useEffect patterns across components.
 *
 * @example
 * const { data, loading, error, refetch } = useApiQuery<VideoIdea[]>(
 *   '/api/user/saved-ideas',
 *   { ttlMs: 5 * 60 * 1000 }
 * );
 */
export function useApiQuery<T>(
  url: string | null,
  options: UseApiQueryOptions<T> = {}
): UseApiQueryResult<T> {
  const {
    onError,
    onSuccess,
    enabled = true,
    ...fetchOptions
  } = options;

  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const requestIdRef = useRef(0);

  const fetchData = useCallback(async () => {
    if (!url || !enabled) {
      return;
    }

    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);

    try {
      const response = await fetchCachedJson<T>(url, fetchOptions);

      // Ignore stale requests
      if (requestId !== requestIdRef.current) {
        return;
      }

      if (!response.ok) {
        const errorData = response.data as any;
        const errorMessage = typeof errorData?.error === 'string' ? errorData.error : `HTTP ${response.status}`;
        const err = new Error(errorMessage);
        setError(err);
        onError?.(err);
        return;
      }

      setData(response.data || null);
      setError(null);
      onSuccess?.(response.data || (null as any));
    } catch (err) {
      // Ignore stale requests
      if (requestId !== requestIdRef.current) {
        return;
      }

      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      onError?.(error);
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [url, enabled, fetchOptions, onError, onSuccess]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}
