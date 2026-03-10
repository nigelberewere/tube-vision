# Supabase Migration Guide - Phase 1

This guide outlines the steps to migrate Vid-Vision from cookie-based authentication and local SQLite storage to Supabase for production scalability.

## 📋 Overview

**What's changing:**
- ❌ Cookie-based account management (`tube_vision_accounts`) → ✅ Supabase Auth + Database
- ❌ Local SQLite (`better-sqlite3`) → ✅ Supabase PostgreSQL
- ❌ Local file uploads (`uploads/` folder) → ✅ Supabase Storage
- ❌ Client-side state only → ✅ Server-side verified sessions

**What's staying the same:**
- YouTube OAuth flow (still uses Google OAuth)
- Gemini API integration (BYOK model)
- All existing features and UI

---

## 🚀 Quick Start

### Step 1: Create Supabase Project

1. Go to [https://supabase.com](https://supabase.com) and create a free account
2. Create a new project:
   - Choose a **Project name**: `vid-vision-production`
   - Set a **Database Password** (save this securely!)
   - Select a **Region** (choose one close to your users)
3. Wait 2-3 minutes for the project to provision

### Step 2: Run Database Migration

1. In your Supabase dashboard, go to **SQL Editor**
2. Click **New Query**
3. Copy the entire contents of `supabase-migration.sql`
4. Paste into the SQL editor and click **Run**
5. Verify tables were created: Go to **Table Editor** → You should see:
   - `profiles`
   - `youtube_accounts`
   - `saved_content`
   - `channel_snapshots`

### Step 3: Configure Environment Variables

1. In Supabase dashboard, go to **Settings** → **API**
2. Copy these values to your `.env.local` file:

```bash
# Frontend (Vite)
VITE_SUPABASE_URL="https://your-project-ref.supabase.co"
VITE_SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

# Backend (Node.js)
SUPABASE_URL="https://your-project-ref.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

⚠️ **WARNING**: The `SUPABASE_SERVICE_ROLE_KEY` is highly sensitive - it bypasses all Row Level Security. Never commit it to version control or expose it to the client!

### Step 4: Configure Google OAuth Redirect

1. Go to **Authentication** → **Providers** in Supabase
2. Enable **Google** provider
3. Add your Google OAuth credentials from Google Cloud Console:
   - **Client ID**: Your existing `GOOGLE_CLIENT_ID`
   - **Client Secret**: Your existing `GOOGLE_CLIENT_SECRET`
4. In **Redirect URLs**, add:
   ```
   https://your-project-ref.supabase.co/auth/v1/callback
   ```
5. In Google Cloud Console, update **Authorized redirect URIs** to include:
   ```
   https://your-project-ref.supabase.co/auth/v1/callback
   http://localhost:5173/auth/callback (for local development)
   ```

### Step 5: Test the Setup

1. Start your dev server: `npm run dev`
2. Open the app in your browser
3. Click "Sign In" - you should be redirected to Google OAuth
4. After authentication, check:
   - Supabase Dashboard → **Authentication** → **Users** (you should see your account)
   - **Table Editor** → `profiles` (your profile should be created automatically)

---

## 📊 Database Schema

### `profiles` Table
Stores user profile data and primary YouTube channel selection.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key (references auth.users) |
| `full_name` | TEXT | User's full name from Google |
| `avatar_url` | TEXT | Profile picture URL |
| `channel_id` | TEXT | Active YouTube channel ID |
| `created_at` | TIMESTAMPTZ | Account creation timestamp |
| `updated_at` | TIMESTAMPTZ | Last update timestamp |

### `youtube_accounts` Table
Stores multiple YouTube channel connections per user (replaces cookie storage).

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `user_id` | UUID | References profiles(id) |
| `google_id` | TEXT | Google account ID |
| `channel_id` | TEXT | YouTube channel ID (unique) |
| `channel_title` | TEXT | Channel name |
| `access_token` | TEXT | OAuth access token (encrypted in transit) |
| `refresh_token` | TEXT | OAuth refresh token (encrypted in transit) |
| `expires_at` | TIMESTAMPTZ | Token expiration time |
| `statistics` | JSONB | Channel stats (subscribers, views, etc.) |

### `saved_content` Table
Stores user-generated content (scripts, AI history, etc.).

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `user_id` | UUID | References profiles(id) |
| `content_type` | TEXT | Type: script, coach_history, thumbnail, etc. |
| `title` | TEXT | Optional title |
| `data` | JSONB | Flexible JSON data |
| `created_at` | TIMESTAMPTZ | Creation timestamp |

### `channel_snapshots` Table
Stores daily channel growth metrics (replaces local SQLite).

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `user_id` | UUID | References profiles(id) |
| `channel_id` | TEXT | YouTube channel ID |
| `snapshot_date` | DATE | Snapshot date (unique per channel) |
| `subscribers` | INTEGER | Subscriber count |
| `video_count` | INTEGER | Total videos |
| `total_views` | BIGINT | Total channel views |
| `estimated_daily_views` | INTEGER | Daily view estimate |

---

## 🔐 Security: Row Level Security (RLS)

All tables have RLS policies enabled to ensure users can only access their own data:

- **Profiles**: Users can view/update their own profile only
- **YouTube Accounts**: Users can manage their own linked channels only
- **Saved Content**: Users can CRUD their own saved content only
- **Channel Snapshots**: Users can view snapshots for their linked channels only

**Storage Buckets** also have RLS:
- **video-uploads**: Users can upload/view/delete files in their own folder (`user_id/`)
- **thumbnails**: Users can upload/view/delete files in their own folder (`user_id/`)

---

## 🔄 Migration Checklist

### Phase 1: Foundation (Current)
- [x] Install `@supabase/supabase-js`
- [x] Create Supabase client utilities (`src/lib/supabase.ts`, `supabaseServer.ts`)
- [x] Create database schema (`supabase-migration.sql`)
- [x] Create auth context and hooks (`src/lib/supabaseAuth.tsx`)
- [x] Create OAuth callback component (`src/components/AuthCallback.tsx`)
- [x] Update environment variables (`.env.example`)

### Phase 2: Auth Migration (Next)
- [x] Wrap `App.tsx` with `<AuthProvider>`
- [ ] Replace cookie-based auth checks with `useAuth()` hook
- [ ] Update server.ts to use `verifyUser(req)` instead of cookie parsing
- [ ] Update api/route.ts to use `verifyUser(req)` instead of cookie parsing
- [ ] Remove `tube_vision_accounts` cookie logic
- [ ] Test OAuth flow end-to-end

Phase 2 kickoff status:
- `AuthProvider` is now mounted in `src/main.tsx`.
- `/auth/callback` is now routed to `AuthCallback` in `src/App.tsx`.
- `src/App.tsx` now uses `useAuth()` for hybrid auth gating during migration.

### Phase 3: Data Migration
- [ ] Replace YouTube account cookie storage with Supabase `youtube_accounts` table
- [ ] Migrate local SQLite snapshots to `channel_snapshots` table
- [ ] Replace localStorage usage with `saved_content` table
- [ ] Update all API endpoints to query Supabase instead of cookies/SQLite

### Phase 4: Storage Migration
- [ ] Replace `fs.writeFile` in video uploads with Supabase Storage
- [ ] Update `/api/analyze` endpoint to use Supabase Storage URLs
- [ ] Update thumbnail saving to use Supabase Storage
- [ ] Remove local `uploads/` folder dependency

### Phase 5: Testing & Deployment
- [ ] Test all features with Supabase backend
- [ ] Verify RLS policies (try accessing other users' data - should fail)
- [ ] Test token refresh flow for YouTube API
- [ ] Deploy to Vercel/production
- [ ] Monitor for errors in Supabase logs

---

## 💡 Code Examples

### Frontend: Using Auth Context

```tsx
// In App.tsx
import { AuthProvider } from './lib/supabaseAuth';

function App() {
  return (
    <AuthProvider>
      <YourAppContent />
    </AuthProvider>
  );
}
```

```tsx
// In any component
import { useAuth } from './lib/supabaseAuth';

function Dashboard() {
  const { user, profile, activeChannel, signOut } = useAuth();

  if (!user) {
    return <LoginPrompt />;
  }

  return (
    <div>
      <h1>Welcome {profile?.full_name}!</h1>
      <p>Active Channel: {activeChannel?.channel_title}</p>
      <button onClick={signOut}>Sign Out</button>
    </div>
  );
}
```

### Backend: Verify User in API Route

**Before (Cookie-based):**
```typescript
app.post('/api/analyze', async (req, res) => {
  const cookieAccounts = req.cookies.tube_vision_accounts || '[]';
  const accounts = JSON.parse(cookieAccounts);
  const activeAccount = accounts[0];
  // ... use activeAccount
});
```

**After (Supabase):**
```typescript
import { verifyUser, getUserYouTubeAccount } from './supabaseServer';

app.post('/api/analyze', async (req, res) => {
  const user = await verifyUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const account = await getUserYouTubeAccount(user.id);
  if (!account) {
    return res.status(400).json({ error: 'No YouTube account linked' });
  }

  // ... use account.access_token, account.channel_id, etc.
});
```

### Frontend: Attach Auth Token to Requests

```typescript
import { supabase } from './lib/supabase';

async function makeAuthenticatedRequest(endpoint: string, body: any) {
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session) {
    throw new Error('Not authenticated');
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(body),
  });

  return response.json();
}
```

### Upload to Supabase Storage

**Before (Local filesystem):**
```typescript
const uploadPath = path.join('uploads', filename);
fs.writeFileSync(uploadPath, buffer);
```

**After (Supabase Storage):**
```typescript
const { data, error } = await supabaseServer.storage
  .from('video-uploads')
  .upload(`${userId}/${filename}`, buffer, {
    contentType: 'video/mp4',
    upsert: true,
  });

if (error) throw error;

// Get public URL
const { data: { publicUrl } } = supabaseServer.storage
  .from('video-uploads')
  .getPublicUrl(`${userId}/${filename}`);
```

---

## 🐛 Troubleshooting

### "User not found" errors
- Verify the `Authorization` header is being sent from the frontend
- Check Supabase logs: Dashboard → **Logs** → **Auth**
- Ensure `SUPABASE_SERVICE_ROLE_KEY` is set on the server

### "RLS policy violation" errors
- This is normal! It means RLS is working
- Make sure you're using the correct `user_id` in queries
- For server operations that need to bypass RLS, use `supabaseServer` (service role client)

### "Storage bucket not found" errors
- Re-run the storage bucket creation SQL in `supabase-migration.sql`
- Check Dashboard → **Storage** to verify buckets exist

### OAuth redirect loop
- Check that `redirectTo` URL in `signInWithOAuth()` matches your actual domain
- Verify Google Cloud Console has the correct redirect URI configured
- Clear cookies and try again

---

## 📚 Resources

- [Supabase Documentation](https://supabase.com/docs)
- [Supabase Auth with React](https://supabase.com/docs/guides/auth/quickstarts/react)
- [Row Level Security Guide](https://supabase.com/docs/guides/auth/row-level-security)
- [Supabase Storage](https://supabase.com/docs/guides/storage)
- [YouTube Data API](https://developers.google.com/youtube/v3)

---

## 🎯 Next Steps

1. Run the SQL migration in Supabase
2. Configure environment variables
3. Test auth flow locally
4. Begin Phase 2: Migrate cookie-based auth to Supabase Auth
5. Update one API endpoint at a time to use Supabase

**Questions?** Check existing code in:
- `src/lib/supabase.ts` - Frontend client
- `supabaseServer.ts` - Backend client
- `src/lib/supabaseAuth.tsx` - Auth hooks
- `supabase-migration.sql` - Database schema
