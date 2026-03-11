/**
 * OAuth Callback Handler Component
 * 
 * This component handles the OAuth redirect after Google sign-in.
 * Place this at the /auth/callback route in your app.
 * 
 * Usage:
 * ```tsx
 * // In your App.tsx, conditionally render based on path
 * if (window.location.pathname === '/auth/callback') {
 *   return <AuthCallback />;
 * }
 * ```
 */

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

type VerifyOtpType = 'signup' | 'invite' | 'magiclink' | 'recovery' | 'email' | 'email_change';

function parseVerifyOtpType(rawType: string | null): VerifyOtpType | null {
  if (!rawType) {
    return null;
  }

  const normalized = rawType.trim().toLowerCase();
  if (
    normalized === 'signup' ||
    normalized === 'invite' ||
    normalized === 'magiclink' ||
    normalized === 'recovery' ||
    normalized === 'email' ||
    normalized === 'email_change'
  ) {
    return normalized;
  }

  return null;
}

export function AuthCallback() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    let subscription: { unsubscribe: () => void } | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let completed = false;

    const sleep = (ms: number) =>
      new Promise<void>((resolve) => {
        setTimeout(resolve, ms);
      });

    const withTimeout = async <T,>(promise: Promise<T>, ms: number): Promise<T | null> => {
      let timer: ReturnType<typeof setTimeout> | null = null;
      try {
        const timeoutPromise = new Promise<null>((resolve) => {
          timer = setTimeout(() => resolve(null), ms);
        });

        return await Promise.race([promise, timeoutPromise]);
      } finally {
        if (timer) {
          clearTimeout(timer);
        }
      }
    };

    const finalizeYouTubeAccount = async (accessToken?: string | null) => {
      if (!accessToken) {
        return;
      }

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        try {
          await fetch('/api/auth/finalize-youtube', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
            credentials: 'include',
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timeout);
        }
      } catch (finalizeError) {
        // Do not block sign-in completion if finalization fails temporarily.
        console.error('Finalize YouTube account error:', finalizeError);
      }
    };

    const finishRedirect = () => {
      if (!mounted || completed) {
        return;
      }

      completed = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      const searchParams = new URLSearchParams(window.location.search);
      const shouldResumeYouTubeConnect = searchParams.get('connect_youtube') === '1';
      const next = searchParams.get('next');

      if (shouldResumeYouTubeConnect) {
        const redirectUrl = new URL('/', window.location.origin);
        redirectUrl.searchParams.set('connect_youtube', '1');
        if (next) {
          redirectUrl.searchParams.set('next', next);
        }
        window.location.replace(redirectUrl.toString());
        return;
      }

      const nextUrl = next
        ? (() => {
            try {
              return decodeURIComponent(next);
            } catch {
              return next;
            }
          })()
        : '/';
      window.location.replace(nextUrl);
    };

    const setAuthError = (message: string) => {
      if (!mounted || completed) {
        return;
      }

      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      setError(message);
    };

    const waitForSessionAccessToken = async (maxWaitMs = 12000): Promise<string | null> => {
      const deadline = Date.now() + maxWaitMs;

      while (mounted && !completed && Date.now() < deadline) {
        const { data, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) {
          console.error('Session lookup error during callback:', sessionError);
        }

        const token = data.session?.access_token;
        if (token) {
          return token;
        }

        await sleep(300);
      }

      return null;
    };

    const run = async () => {
      try {
        let accessTokenFromEvent: string | null = null;

        timeoutId = setTimeout(() => {
          if (mounted && !completed) {
            setError('Authentication timeout - please try again');
          }
        }, 25000);

        const { data } = supabase.auth.onAuthStateChange((_event, session) => {
          if (!mounted || completed) {
            return;
          }

          if (session?.access_token) {
            accessTokenFromEvent = session.access_token;
          }
        });
        subscription = data.subscription;

        const searchParams = new URLSearchParams(window.location.search);
        const errorDescription = searchParams.get('error_description');
        if (errorDescription) {
          setAuthError(`Authentication failed: ${errorDescription}`);
          return;
        }

        const hashValue = window.location.hash.startsWith('#')
          ? window.location.hash.slice(1)
          : window.location.hash;
        const hashParams = new URLSearchParams(hashValue);
        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');
        const authCode = searchParams.get('code');
        const tokenHash = searchParams.get('token_hash');
        const otpType = parseVerifyOtpType(searchParams.get('type'));

        // Flow 1: Magic-link hash tokens.
        if (accessToken && refreshToken) {
          const setSessionResult = await withTimeout(
            supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            }),
            10000,
          );

          if (setSessionResult?.error) {
            setAuthError(`Authentication failed: ${setSessionResult.error.message}`);
            return;
          }
        } else if (authCode) {
          // Flow 2: PKCE code exchange.
          const exchangeResult = await withTimeout(
            supabase.auth.exchangeCodeForSession(authCode),
            10000,
          );

          if (exchangeResult?.error) {
            setAuthError(`Authentication failed: ${exchangeResult.error.message}`);
            return;
          }
        } else if (tokenHash && otpType) {
          // Flow 3: token_hash verification links.
          const otpResult = await withTimeout(
            supabase.auth.verifyOtp({
              token_hash: tokenHash,
              type: otpType,
            }),
            10000,
          );

          if (otpResult?.error) {
            setAuthError(`Authentication failed: ${otpResult.error.message}`);
            return;
          }
        }

        const activeAccessToken = accessTokenFromEvent || await waitForSessionAccessToken();
        if (!activeAccessToken) {
          setAuthError('Authentication timeout - please try again');
          return;
        }

        await finalizeYouTubeAccount(activeAccessToken);
        finishRedirect();
      } catch (err) {
        console.error('Auth callback exception:', err);
        if (mounted) {
          setError('An unexpected error occurred during authentication');
        }
      }
    };

    void run();

    return () => {
      mounted = false;
      if (subscription) {
        subscription.unsubscribe();
      }
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, []);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="max-w-md w-full space-y-8 p-8">
          <div className="text-center">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
              Authentication Error
            </h2>
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
            <button
              onClick={() => window.location.href = '/'}
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Return to Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="text-center">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        <p className="mt-4 text-lg text-gray-600 dark:text-gray-400">
          Completing authentication...
        </p>
      </div>
    </div>
  );
}
