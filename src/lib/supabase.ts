/**
 * Supabase Client for Browser/Frontend
 * 
 * This file provides the Supabase client for use in React components.
 * It handles authentication state and database queries from the browser.
 * 
 * Usage:
 * ```typescript
 * import { supabase } from '@/lib/supabase';
 * 
 * // Sign in
 * const { data, error } = await supabase.auth.signInWithOAuth({ provider: 'google' });
 * 
 * // Query data
 * const { data: profiles } = await supabase.from('profiles').select('*');
 * ```
 */

import { createClient } from '@supabase/supabase-js';

// Environment variables for Supabase connection
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '⚠️ Supabase environment variables not configured.\n' +
    'Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env.local file.\n' +
    'Get these from: https://app.supabase.com/project/_/settings/api'
  );
}

/**
 * Supabase client instance
 * 
 * This client is configured with:
 * - Auto-refresh of auth tokens
 * - Persistent auth state in localStorage
 * - PKCE flow for OAuth (enhanced security)
 */
export const supabase = createClient(
  supabaseUrl || 'https://invalid.supabase.co',
  supabaseAnonKey || 'missing-supabase-anon-key',
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      storage: typeof window !== 'undefined' ? window.localStorage : undefined,
      flowType: 'pkce', // More secure than implicit flow
    },
  }
);

/**
 * Global fetch interceptor for internal API requests.
 * Automatically injects the active Supabase Auth token, bridging
 * legacy backend routes with the Supabase Auth system to prevent
 * disconnected user issues.
 */
if (typeof window !== 'undefined') {
  const originalFetch = window.fetch;
  window.fetch = async (...args) => {
    const [resource, config] = args;
    
    let isInternalApi = false;
    if (typeof resource === 'string') {
      isInternalApi = resource.startsWith('/api/');
    } else if (resource instanceof URL) {
      isInternalApi = resource.pathname.startsWith('/api/');
    } else if (resource instanceof Request) {
      const url = resource.url.startsWith('/') ? resource.url : new URL(resource.url, window.location.origin).pathname;
      isInternalApi = url.startsWith('/api/');
    }

    if (isInternalApi) {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
          const newHeaders = new Headers(config?.headers || (resource instanceof Request ? resource.headers : undefined));
          if (!newHeaders.has('Authorization') && !newHeaders.has('authorization')) {
            newHeaders.set('Authorization', `Bearer ${session.access_token}`);
            // If the original resource was a Request object, we don't want to override its other 
            // properties by passing a generic config, but it's okay for our current codebase.
            return originalFetch(resource, {
              ...config,
              headers: newHeaders
            });
          }
        }
      } catch (error) {
        console.error('Failed to inject Supabase Auth token:', error);
      }
    }

    return originalFetch(...args);
  };
}

/**
 * Database types for type-safe queries
 * 
 * TODO: Generate these types from Supabase CLI:
 * ```bash
 * npx supabase gen types typescript --project-id YOUR_PROJECT_ID > src/lib/database.types.ts
 * ```
 */
export type Profile = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  channel_id: string | null;
  created_at: string;
  updated_at: string;
};

export type YouTubeAccount = {
  id: string;
  user_id: string;
  google_id: string;
  channel_id: string;
  channel_title: string;
  channel_thumbnail: string | null;
  access_token: string;
  refresh_token: string;
  expires_at: string | null;
  statistics: Record<string, any> | null;
  created_at: string;
  updated_at: string;
};

export type SavedContent = {
  id: string;
  user_id: string;
  content_type: 'script' | 'coach_history' | 'thumbnail' | 'keyword_research' | 'competitor_analysis';
  title: string | null;
  data: Record<string, any>;
  created_at: string;
  updated_at: string;
};

/**
 * Helper: Get current user session
 */
export async function getCurrentUser() {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) {
    console.error('Error getting session:', error);
    return null;
  }
  return session?.user ?? null;
}

/**
 * Helper: Get user profile
 */
export async function getUserProfile(userId?: string) {
  const user = userId || (await getCurrentUser())?.id;
  if (!user) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user)
    .single();

  if (error) {
    console.error('Error fetching profile:', error);
    return null;
  }

  return data as Profile;
}

/**
 * Helper: Get user's YouTube accounts
 */
export async function getYouTubeAccounts(userId?: string) {
  const user = userId || (await getCurrentUser())?.id;
  if (!user) return [];

  const { data, error } = await supabase
    .from('youtube_accounts')
    .select('*')
    .eq('user_id', user)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching YouTube accounts:', error);
    return [];
  }

  return data as YouTubeAccount[];
}

/**
 * Helper: Get active YouTube account (primary channel)
 */
export async function getActiveYouTubeAccount(userId?: string) {
  const profile = await getUserProfile(userId);
  if (!profile?.channel_id) return null;

  const { data, error } = await supabase
    .from('youtube_accounts')
    .select('*')
    .eq('channel_id', profile.channel_id)
    .single();

  if (error) {
    console.error('Error fetching active YouTube account:', error);
    return null;
  }

  return data as YouTubeAccount;
}

/**
 * Helper: Save content (scripts, AI coach history, etc.)
 */
export async function saveContent(
  contentType: SavedContent['content_type'],
  data: Record<string, any>,
  title?: string
) {
  const user = await getCurrentUser();
  if (!user) throw new Error('User not authenticated');

  const { data: savedData, error } = await supabase
    .from('saved_content')
    .insert({
      user_id: user.id,
      content_type: contentType,
      title,
      data,
    })
    .select()
    .single();

  if (error) throw error;
  return savedData as SavedContent;
}

/**
 * Helper: Get saved content by type
 */
export async function getSavedContent(
  contentType: SavedContent['content_type'],
  userId?: string
) {
  const user = userId || (await getCurrentUser())?.id;
  if (!user) return [];

  const { data, error } = await supabase
    .from('saved_content')
    .select('*')
    .eq('user_id', user)
    .eq('content_type', contentType)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching saved content:', error);
    return [];
  }

  return data as SavedContent[];
}

/**
 * Helper: Sign out user
 */
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) {
    console.error('Error signing out:', error);
    throw error;
  }
}

// Singleton title used by fetchSingletonContent / upsertSingletonContent for blob-style storage.
const SINGLETON_TITLE = '__singleton__';

/**
 * Helper: Fetch a single "singleton" content blob for a given content type.
 * Returns null if the user is not authenticated or no row exists.
 */
export async function fetchSingletonContent(
  contentType: SavedContent['content_type'],
  title: string = SINGLETON_TITLE,
): Promise<SavedContent | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('saved_content')
    .select('*')
    .eq('user_id', user.id)
    .eq('content_type', contentType)
    .eq('title', title)
    .maybeSingle();

  if (error) {
    console.error('Error fetching singleton content:', error);
    return null;
  }

  return data as SavedContent | null;
}

/**
 * Helper: Upsert a singleton blob row for a given content type.
 * Creates the row on first call; updates it on subsequent calls.
 * Silently no-ops when the user is not authenticated.
 */
export async function upsertSingletonContent(
  contentType: SavedContent['content_type'],
  data: Record<string, any>,
  title: string = SINGLETON_TITLE,
): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const existing = await fetchSingletonContent(contentType, title);

  if (existing) {
    await supabase
      .from('saved_content')
      .update({ data, updated_at: new Date().toISOString() })
      .eq('id', existing.id);
  } else {
    await supabase
      .from('saved_content')
      .insert({ user_id: user.id, content_type: contentType, title, data });
  }
}
