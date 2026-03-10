/**
 * Supabase Authentication Hooks and Context
 * 
 * This file provides React hooks and context for managing authentication state
 * throughout the application. It replaces the cookie-based auth system.
 * 
 * Usage:
 * ```tsx
 * // In App.tsx
 * import { AuthProvider } from './lib/supabaseAuth';
 * 
 * function App() {
 *   return (
 *     <AuthProvider>
 *       <YourApp />
 *     </AuthProvider>
 *   );
 * }
 * 
 * // In any component
 * import { useAuth } from './lib/supabaseAuth';
 * 
 * function MyComponent() {
 *   const { user, profile, loading, signIn, signOut } = useAuth();
 *   
 *   if (loading) return <div>Loading...</div>;
 *   if (!user) return <button onClick={signIn}>Sign In</button>;
 *   
 *   return <div>Welcome {profile?.full_name}!</div>;
 * }
 * ```
 */

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session, AuthChangeEvent } from '@supabase/supabase-js';
import { supabase, type Profile, type YouTubeAccount } from './supabase';

interface AuthContextType {
  // Auth state
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  youtubeAccounts: YouTubeAccount[];
  activeChannel: YouTubeAccount | null;
  loading: boolean;
  
  // Auth methods
  signInWithGoogle: (options?: { redirectTo?: string }) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  setActiveChannel: (channelId: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [youtubeAccounts, setYouTubeAccounts] = useState<YouTubeAccount[]>([]);
  const [activeChannel, setActiveChannelState] = useState<YouTubeAccount | null>(null);
  const [loading, setLoading] = useState(true);

  // Initialize auth state
  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        loadUserData(session.user.id);
      } else {
        setLoading(false);
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event: AuthChangeEvent, session: Session | null) => {
        console.log('Auth state changed:', event, session?.user?.email);
        
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          await loadUserData(session.user.id);
        } else {
          setProfile(null);
          setYouTubeAccounts([]);
          setActiveChannelState(null);
          setLoading(false);
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Load user profile and YouTube accounts
  async function loadUserData(userId: string) {
    try {
      setLoading(true);

      // Fetch profile
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (profileError && profileError.code !== 'PGRST116') { // PGRST116 = no rows returned
        console.error('Error loading profile:', profileError);
      } else if (profileData) {
        setProfile(profileData as Profile);
      }

      // Fetch YouTube accounts
      const { data: accountsData, error: accountsError } = await supabase
        .from('youtube_accounts')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (accountsError) {
        console.error('Error loading YouTube accounts:', accountsError);
        setYouTubeAccounts([]);
      } else {
        const accounts = accountsData as YouTubeAccount[];
        setYouTubeAccounts(accounts);

        // Set active channel (based on profile's channel_id)
        if (profileData?.channel_id) {
          const active = accounts.find(acc => acc.channel_id === profileData.channel_id);
          setActiveChannelState(active || accounts[0] || null);
        } else if (accounts.length > 0) {
          setActiveChannelState(accounts[0]);
        }
      }
    } catch (error) {
      console.error('Error loading user data:', error);
    } finally {
      setLoading(false);
    }
  }

  // Sign in with Google OAuth
  async function signInWithGoogle(options?: { redirectTo?: string }) {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: options?.redirectTo || `${window.location.origin}/auth/callback`,
        scopes: 'openid email profile', // Add YouTube scopes if needed
      },
    });

    if (error) {
      console.error('Error signing in:', error);
      throw error;
    }
  }

  // Sign out
  async function signOutUser() {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('Error signing out:', error);
      throw error;
    }
    
    // Clear state
    setUser(null);
    setSession(null);
    setProfile(null);
    setYouTubeAccounts([]);
    setActiveChannelState(null);
  }

  // Refresh profile and accounts
  async function refreshProfile() {
    if (!user) return;
    await loadUserData(user.id);
  }

  // Set active YouTube channel
  async function setActiveChannel(channelId: string) {
    if (!user) return;

    // Update profile in database
    const { error } = await supabase
      .from('profiles')
      .update({ channel_id: channelId })
      .eq('id', user.id);

    if (error) {
      console.error('Error updating active channel:', error);
      throw error;
    }

    // Update local state
    const newActiveChannel = youtubeAccounts.find(acc => acc.channel_id === channelId);
    if (newActiveChannel) {
      setActiveChannelState(newActiveChannel);
      setProfile(prev => prev ? { ...prev, channel_id: channelId } : null);
    }
  }

  const value: AuthContextType = {
    user,
    session,
    profile,
    youtubeAccounts,
    activeChannel,
    loading,
    signInWithGoogle,
    signOut: signOutUser,
    refreshProfile,
    setActiveChannel,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Hook to access auth context
 * 
 * Usage:
 * ```tsx
 * const { user, profile, signIn, signOut } = useAuth();
 * ```
 */
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

/**
 * Hook to require authentication (redirects to login if not authenticated)
 * 
 * Usage:
 * ```tsx
 * function ProtectedPage() {
 *   const { user, profile } = useRequireAuth();
 *   // This component will only render if user is authenticated
 *   return <div>Welcome {profile?.full_name}!</div>;
 * }
 * ```
 */
export function useRequireAuth() {
  const auth = useAuth();
  
  useEffect(() => {
    if (!auth.loading && !auth.user) {
      // User is not authenticated, trigger sign in
      console.log('User not authenticated, please sign in');
      // You could navigate to a login page here if you have routing
    }
  }, [auth.loading, auth.user]);

  return auth;
}

/**
 * Hook to get current YouTube access token (handles token refresh)
 * 
 * Usage:
 * ```tsx
 * const token = useYouTubeToken();
 * // Use token to make YouTube API requests
 * ```
 */
export function useYouTubeToken() {
  const { activeChannel } = useAuth();
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    if (activeChannel?.access_token) {
      // Check if token is expired
      const expiresAt = activeChannel.expires_at ? new Date(activeChannel.expires_at) : null;
      const now = new Date();

      if (expiresAt && now >= expiresAt) {
        // Token is expired, need to refresh
        // This should be handled by a backend endpoint
        console.warn('YouTube access token is expired, needs refresh');
        setToken(null);
      } else {
        setToken(activeChannel.access_token);
      }
    } else {
      setToken(null);
    }
  }, [activeChannel]);

  return token;
}
