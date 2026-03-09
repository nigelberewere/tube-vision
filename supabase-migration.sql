-- ============================================================================
-- Vid-Vision Supabase Database Schema Migration
-- ============================================================================
-- 
-- This migration creates the necessary tables and storage buckets for the
-- Vid-Vision application, replacing cookie-based auth and local SQLite storage.
--
-- Run this SQL in the Supabase SQL Editor:
-- https://app.supabase.com/project/_/sql/new
--
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. PROFILES TABLE
-- ----------------------------------------------------------------------------
-- Stores user profile information and primary YouTube channel selection
-- Extends Supabase's built-in auth.users table

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  avatar_url TEXT,
  channel_id TEXT, -- Primary YouTube channel (from youtube_accounts table)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can read their own profile
CREATE POLICY "Users can view own profile"
  ON public.profiles
  FOR SELECT
  USING (auth.uid() = id);

-- RLS Policy: Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id);

-- RLS Policy: Users can insert their own profile
CREATE POLICY "Users can insert own profile"
  ON public.profiles
  FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Trigger: Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at_profiles
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Trigger: Auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ----------------------------------------------------------------------------
-- 2. YOUTUBE_ACCOUNTS TABLE
-- ----------------------------------------------------------------------------
-- Stores multiple YouTube channel connections per user
-- Replaces the tube_vision_accounts cookie

CREATE TABLE IF NOT EXISTS public.youtube_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  google_id TEXT NOT NULL, -- Google account ID (from OAuth)
  channel_id TEXT NOT NULL UNIQUE, -- YouTube channel ID
  channel_title TEXT NOT NULL,
  channel_description TEXT,
  channel_thumbnail TEXT,
  custom_url TEXT,
  
  -- OAuth tokens (sensitive - ensure proper RLS policies)
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ,
  
  -- Channel statistics (JSON field for flexibility)
  statistics JSONB DEFAULT '{}'::jsonb,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Ensure one channel per user (no duplicates)
  UNIQUE(user_id, channel_id)
);

-- Indexes for performance
CREATE INDEX idx_youtube_accounts_user_id ON public.youtube_accounts(user_id);
CREATE INDEX idx_youtube_accounts_channel_id ON public.youtube_accounts(channel_id);

-- Enable Row Level Security
ALTER TABLE public.youtube_accounts ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view their own YouTube accounts
CREATE POLICY "Users can view own YouTube accounts"
  ON public.youtube_accounts
  FOR SELECT
  USING (auth.uid() = user_id);

-- RLS Policy: Users can insert their own YouTube accounts
CREATE POLICY "Users can insert own YouTube accounts"
  ON public.youtube_accounts
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- RLS Policy: Users can update their own YouTube accounts
CREATE POLICY "Users can update own YouTube accounts"
  ON public.youtube_accounts
  FOR UPDATE
  USING (auth.uid() = user_id);

-- RLS Policy: Users can delete their own YouTube accounts
CREATE POLICY "Users can delete own YouTube accounts"
  ON public.youtube_accounts
  FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger: Auto-update updated_at timestamp
CREATE TRIGGER set_updated_at_youtube_accounts
  BEFORE UPDATE ON public.youtube_accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ----------------------------------------------------------------------------
-- 3. SAVED_CONTENT TABLE
-- ----------------------------------------------------------------------------
-- Stores user-generated content: scripts, AI coach history, thumbnails, etc.
-- Replaces localStorage and cookie-based content storage

CREATE TABLE IF NOT EXISTS public.saved_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content_type TEXT NOT NULL CHECK (content_type IN (
    'script',
    'coach_history',
    'thumbnail',
    'keyword_research',
    'competitor_analysis',
    'viral_clip',
    'voice_over'
  )),
  title TEXT,
  data JSONB NOT NULL DEFAULT '{}'::jsonb, -- Flexible JSON storage for any content type
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_saved_content_user_id ON public.saved_content(user_id);
CREATE INDEX idx_saved_content_type ON public.saved_content(content_type);
CREATE INDEX idx_saved_content_created_at ON public.saved_content(created_at DESC);

-- Enable Row Level Security
ALTER TABLE public.saved_content ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view their own saved content
CREATE POLICY "Users can view own saved content"
  ON public.saved_content
  FOR SELECT
  USING (auth.uid() = user_id);

-- RLS Policy: Users can insert their own saved content
CREATE POLICY "Users can insert own saved content"
  ON public.saved_content
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- RLS Policy: Users can update their own saved content
CREATE POLICY "Users can update own saved content"
  ON public.saved_content
  FOR UPDATE
  USING (auth.uid() = user_id);

-- RLS Policy: Users can delete their own saved content
CREATE POLICY "Users can delete own saved content"
  ON public.saved_content
  FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger: Auto-update updated_at timestamp
CREATE TRIGGER set_updated_at_saved_content
  BEFORE UPDATE ON public.saved_content
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ----------------------------------------------------------------------------
-- 4. CHANNEL_SNAPSHOTS TABLE
-- ----------------------------------------------------------------------------
-- Stores daily channel growth metrics (replaces local SQLite snapshots)

CREATE TABLE IF NOT EXISTS public.channel_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel_id TEXT NOT NULL,
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  
  -- Metrics
  subscribers INTEGER NOT NULL,
  video_count INTEGER NOT NULL,
  total_views BIGINT NOT NULL,
  estimated_daily_views INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- One snapshot per channel per day
  UNIQUE(channel_id, snapshot_date)
);

-- Indexes for performance
CREATE INDEX idx_channel_snapshots_user_id ON public.channel_snapshots(user_id);
CREATE INDEX idx_channel_snapshots_channel_id ON public.channel_snapshots(channel_id);
CREATE INDEX idx_channel_snapshots_date ON public.channel_snapshots(snapshot_date DESC);

-- Enable Row Level Security
ALTER TABLE public.channel_snapshots ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view snapshots for their channels
CREATE POLICY "Users can view own channel snapshots"
  ON public.channel_snapshots
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.youtube_accounts
      WHERE youtube_accounts.user_id = auth.uid()
      AND youtube_accounts.channel_id = channel_snapshots.channel_id
    )
  );

-- RLS Policy: Users can insert snapshots for their channels
CREATE POLICY "Users can insert own channel snapshots"
  ON public.channel_snapshots
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.youtube_accounts
      WHERE youtube_accounts.user_id = auth.uid()
      AND youtube_accounts.channel_id = channel_snapshots.channel_id
    )
  );

-- ----------------------------------------------------------------------------
-- 5. STORAGE BUCKETS
-- ----------------------------------------------------------------------------
-- Create storage buckets for user uploads (replaces local uploads/ folder)

-- Create bucket for video uploads
INSERT INTO storage.buckets (id, name, public)
VALUES ('video-uploads', 'video-uploads', false)
ON CONFLICT (id) DO NOTHING;

-- RLS Policy: Users can upload videos
CREATE POLICY "Users can upload videos"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'video-uploads' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- RLS Policy: Users can view their own videos
CREATE POLICY "Users can view own videos"
  ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'video-uploads' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- RLS Policy: Users can delete their own videos
CREATE POLICY "Users can delete own videos"
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'video-uploads' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- Create bucket for thumbnail uploads
INSERT INTO storage.buckets (id, name, public)
VALUES ('thumbnails', 'thumbnails', false)
ON CONFLICT (id) DO NOTHING;

-- RLS Policy: Users can upload thumbnails
CREATE POLICY "Users can upload thumbnails"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'thumbnails' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- RLS Policy: Users can view their own thumbnails
CREATE POLICY "Users can view own thumbnails"
  ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'thumbnails' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- RLS Policy: Users can delete their own thumbnails
CREATE POLICY "Users can delete own thumbnails"
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'thumbnails' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- ----------------------------------------------------------------------------
-- 6. HELPER FUNCTIONS
-- ----------------------------------------------------------------------------

-- Function: Get user's active YouTube account
CREATE OR REPLACE FUNCTION public.get_active_youtube_account(user_uuid UUID)
RETURNS TABLE (
  id UUID,
  channel_id TEXT,
  channel_title TEXT,
  access_token TEXT,
  statistics JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ya.id,
    ya.channel_id,
    ya.channel_title,
    ya.access_token,
    ya.statistics
  FROM public.youtube_accounts ya
  INNER JOIN public.profiles p ON p.channel_id = ya.channel_id
  WHERE p.id = user_uuid
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Calculate channel growth metrics
CREATE OR REPLACE FUNCTION public.get_channel_growth(
  p_channel_id TEXT,
  p_days INTEGER DEFAULT 30
)
RETURNS TABLE (
  date DATE,
  subscribers INTEGER,
  subscriber_growth INTEGER,
  total_views BIGINT,
  daily_views INTEGER
) AS $$
BEGIN
  RETURN QUERY
  WITH daily_metrics AS (
    SELECT 
      snapshot_date,
      subscribers,
      LAG(subscribers) OVER (ORDER BY snapshot_date) as prev_subscribers,
      total_views,
      estimated_daily_views
    FROM public.channel_snapshots
    WHERE channel_id = p_channel_id
      AND snapshot_date >= CURRENT_DATE - p_days
    ORDER BY snapshot_date ASC
  )
  SELECT 
    snapshot_date::DATE as date,
    subscribers,
    COALESCE(subscribers - prev_subscribers, 0)::INTEGER as subscriber_growth,
    total_views,
    estimated_daily_views as daily_views
  FROM daily_metrics;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- 
-- Next steps:
-- 1. Run this SQL in your Supabase SQL Editor
-- 2. Update your .env file with SUPABASE_URL and SUPABASE_ANON_KEY
-- 3. Test the connection in your application
-- 4. Migrate existing user data (if any)
--
-- ============================================================================
