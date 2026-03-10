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

export function AuthCallback() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Handle the OAuth callback
    const handleCallback = async () => {
      try {
        // Supabase automatically handles the token exchange
        const { data, error: authError } = await supabase.auth.getSession();

        if (authError) {
          console.error('Auth callback error:', authError);
          setError(authError.message);
          return;
        }

        if (data.session) {
          console.log('Authentication successful!');

          const searchParams = new URLSearchParams(window.location.search);
          const shouldResumeYouTubeConnect = searchParams.get('connect_youtube') === '1';
          const next = searchParams.get('next');

          if (shouldResumeYouTubeConnect) {
            const redirectUrl = new URL('/', window.location.origin);
            redirectUrl.searchParams.set('connect_youtube', '1');
            if (next) {
              redirectUrl.searchParams.set('next', next);
            }
            window.location.href = redirectUrl.toString();
            return;
          }

          window.location.href = '/';
        } else {
          setError('No session found after authentication');
        }
      } catch (err) {
        console.error('Exception in auth callback:', err);
        setError('An unexpected error occurred during authentication');
      }
    };

    handleCallback();
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
