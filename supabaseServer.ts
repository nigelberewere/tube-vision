/**
 * Supabase Server Client for Node.js/Express
 * 
 * This file provides the Supabase client for use in server-side endpoints (server.ts).
 * It handles authentication verification and database queries from the backend.
 * 
 * Usage:
 * ```typescript
 * import { supabaseServer, verifyUser } from './supabaseServer';
 * 
 * // Verify user from request
 * app.post('/api/data', async (req, res) => {
 *   const user = await verifyUser(req);
 *   if (!user) return res.status(401).json({ error: 'Unauthorized' });
 *   
 *   const { data } = await supabaseServer.from('profiles').select('*').eq('id', user.id);
 *   res.json(data);
 * });
 * ```
 */

import { createClient } from '@supabase/supabase-js';
import { Request } from 'express';

// Environment variables for Supabase connection
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseServiceKey) {
  console.warn(
    '⚠️ Supabase server environment variables not configured.\n' +
    'Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to your .env file.\n' +
    'Get these from: https://app.supabase.com/project/_/settings/api\n' +
    'Note: Use SERVICE_ROLE_KEY for server-side operations (keep it secret!)'
  );
}

/**
 * Supabase server client instance with service role key
 * 
 * WARNING: This client has elevated privileges and bypasses Row Level Security (RLS).
 * Only use this in server-side code, never expose to the client.
 */
export const supabaseServer = createClient(
  supabaseUrl || 'https://invalid.supabase.co',
  supabaseServiceKey || 'missing-supabase-service-key',
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

/**
 * Create a Supabase client for a specific user
 * 
 * This respects Row Level Security (RLS) policies by setting the auth context.
 * Use this when you want RLS to filter results based on the user.
 * 
 * @param accessToken - User's JWT access token from the Authorization header
 */
export function createUserClient(accessToken: string) {
  return createClient(
    supabaseUrl || 'https://invalid.supabase.co',
    supabaseServiceKey || 'missing-supabase-service-key',
    {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}

/**
 * Extract JWT token from request headers
 * 
 * Supports multiple header formats:
 * - Authorization: Bearer <token>
 * - X-Supabase-Auth: <token>
 */
export function getTokenFromRequest(req: Request): string | null {
  const authHeader = req.headers.authorization;
  const supabaseAuthHeader = req.headers['x-supabase-auth'] as string;

  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  if (supabaseAuthHeader) {
    return supabaseAuthHeader;
  }

  return null;
}

/**
 * Verify user from request and return user object
 * 
 * This checks the JWT token in the Authorization header and verifies it with Supabase.
 * Returns null if the token is invalid or missing.
 */
export async function verifyUser(req: Request) {
  const token = getTokenFromRequest(req);
  if (!token) {
    return null;
  }

  try {
    const { data: { user }, error } = await supabaseServer.auth.getUser(token);
    
    if (error || !user) {
      console.error('Error verifying user:', error);
      return null;
    }

    return user;
  } catch (error) {
    console.error('Exception verifying user:', error);
    return null;
  }
}

/**
 * Middleware: Require authentication for protected routes
 * 
 * Usage:
 * ```typescript
 * app.get('/api/protected', requireAuth, async (req, res) => {
 *   const user = (req as any).user;
 *   res.json({ userId: user.id });
 * });
 * ```
 */
export async function requireAuth(req: Request, res: any, next: any) {
  const user = await verifyUser(req);
  
  if (!user) {
    return res.status(401).json({ 
      error: 'Unauthorized',
      message: 'Valid authentication required. Please sign in.'
    });
  }

  // Attach user to request object
  (req as any).user = user;
  next();
}

/**
 * Helper: Get YouTube account for user
 */
export async function getUserYouTubeAccount(userId: string, channelId?: string) {
  let query = supabaseServer
    .from('youtube_accounts')
    .select('*')
    .eq('user_id', userId);

  if (channelId) {
    query = query.eq('channel_id', channelId);
  }

  const { data, error } = await query.single();

  if (error) {
    console.error('Error fetching YouTube account:', error);
    return null;
  }

  return data;
}

/**
 * Helper: Refresh YouTube access token using refresh token
 * 
 * This function handles the OAuth token refresh flow.
 * Call this when a YouTube API request returns 401 (token expired).
 */
export async function refreshYouTubeToken(accountId: string) {
  const { data: account, error: fetchError } = await supabaseServer
    .from('youtube_accounts')
    .select('refresh_token')
    .eq('id', accountId)
    .single();

  if (fetchError || !account?.refresh_token) {
    throw new Error('YouTube account not found or missing refresh token');
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID || '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
      refresh_token: account.refresh_token,
      grant_type: 'refresh_token',
    }),
  });

  const tokens = await response.json();

  if (!response.ok) {
    throw new Error(`Failed to refresh token: ${tokens.error_description || tokens.error}`);
  }

  // Update the access token in the database
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  const { error: updateError } = await supabaseServer
    .from('youtube_accounts')
    .update({
      access_token: tokens.access_token,
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq('id', accountId);

  if (updateError) {
    throw new Error('Failed to update access token in database');
  }

  return tokens.access_token;
}
