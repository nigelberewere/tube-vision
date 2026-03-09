# Tube Vision Marketing Site ↔ Dashboard Integration Guide

This document outlines how the marketing website seamlessly integrates with the Tube Vision dashboard.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     Tube Vision Ecosystem                        │
├───────────────────────────┬─────────────────────────────────────┤
│  Marketing Website        │        Main Dashboard               │
│  (React + Vite)           │     (React + Express/Vercel)        │
│  Port 5173 (dev)          │        Port 3000 (dev)              │
│  tubevision.com           │   tubevision.vercel.app             │
│                           │                                     │
│ • Land users              │ • Core application                  │
│ • Explain features        │ • YouTube OAuth                     │
│ • Show pricing            │ • AI tools (Scripts, SEO, etc.)    │
│ • Onboard creators        │ • Analytics & insights              │
│ • Route to dashboard      │ • BYOK Gemini integration           │
└───────────────────────────┴─────────────────────────────────────┘
        │                              │
        └──────────────────┬───────────┘
                           │
                    CTA Redirect Flow
                    /auth/youtube
```

## Environment Configuration

### Root `./env.local`
```
VITE_DASHBOARD_URL=http://localhost:3000          # Dev
VITE_DASHBOARD_URL=https://tubevision.vercel.app  # Production
```

### Marketing Site `./marketing-website/.env.local`
```
VITE_DASHBOARD_URL=http://localhost:3000          # Dev
VITE_DASHBOARD_URL=https://tubevision.vercel.app  # Production
```

## User Journey

### 1. User Lands on Marketing Site
- URL: `tubevision.com` or `marketing.tubevision.com`
- Sees hero, features, pricing, social proof
- Theme automatically syncs with browser preference

### 2. User Clicks "Get Started" or "Connect YouTube"
- Button calls `openDashboardAuth()` → redirects to `${VITE_DASHBOARD_URL}/auth/youtube`
- Dashboard receives OAuth request at `/auth/youtube` endpoint

### 3. Dashboard OAuth Flow (server.ts or api/route.ts)
- Redirects to Google OAuth consent screen
- User authorizes YouTube access
- Callback redirects to `POST /auth/google/callback`
- Dashboard establishes session with user's YouTube account info

### 4. Authenticated User in Dashboard
- User can now use all features (SEO, Scripts, Analytics, etc.)
- Session stored in cookies or Supabase auth

### 5. Optional: User Returns to Marketing Site
- Can disconnect and learn more, but session persists in dashboard

## CTA Redirect Points

All CTAs in the marketing site use the same redirect pattern:

```typescript
// In App.tsx and component props
const openDashboardAuth = () => {
  window.location.href = `${DASHBOARD_URL}/auth/youtube`;
};
```

This ensures users always start the OAuth flow from the dashboard itself, not from the marketing site.

### CTA Locations:
- **Navigation**: "Get Started" button → `/auth/youtube`
- **Hero**: "Connect YouTube" button → `/auth/youtube`
- **Hero**: "View Features" button → scrolls to features (internal)
- **Pricing**: "Get Started Free" button → `/auth/youtube`
- **Pricing**: "Contact Sales" link → email
- **CTA Section**: "Get Started Free" button → `/auth/youtube`

## Theme System Integration

Both projects use the same theme storage key and approach:

```typescript
// Shared across both projects
const THEME_STORAGE_KEY = "tube_vision_theme";

// localStorage now contains:
// { "tube_vision_theme": "dark" | "light" }
```

This allows users to have consistent theme preference even if they bounce between marketing site and dashboard.

## API & OAuth Endpoint Parity

### Dashboard Backend (server.ts)
- `/auth/youtube` → Google OAuth redirect
- `/auth/google/callback` → OAuth callback handler
- `/api/user/accounts` → List connected YouTube accounts
- `/api/user/switch` → Switch between accounts
- `/api/user/remove` → Remove an account
- All Gemini-powered endpoints (SEO, Scripts, AI Coach, etc.)

### Vercel Production (api/route.ts)
**CRITICAL**: All endpoints from server.ts MUST be mirrored in api/route.ts to avoid production 404s.

Configuration in `vercel.json`:
```json
{
  "rewrites": [
    {
      "source": "/api/(.*)",
      "destination": "/api/route?path=api/$1"
    },
    {
      "source": "/auth/(.*)",
      "destination": "/api/route?path=auth/$1"
    }
  ]
}
```

**Verification Checklist**:
- [ ] `/auth/youtube` exists in both server.ts and api/route.ts
- [ ] `/api/user/accounts` implemented in both
- [ ] All studio endpoints (shorts, thumbnails, etc.) in both
- [ ] Gemini API key handling identical in both
- [ ] Error responses match between implementations

## Development Workflow

### Running Both Projects Locally

**Terminal 1: Dashboard**
```bash
cd ~/projects/vid-vision
npm install
npm run dev
# Runs on http://localhost:3000
```

**Terminal 2: Marketing Site**
```bash
cd ~/projects/vid-vision/marketing-website
npm install
npm run dev
# Runs on http://localhost:5173
```

**Test CTA Flow**:
1. Open `http://localhost:5173` (marketing site)
2. Click "Get Started"
3. Should redirect to `http://localhost:3000/auth/youtube`
4. Complete OAuth flow

### .env Configuration for Local Dev
```
# In root .env.local
VITE_DASHBOARD_URL=http://localhost:3000

# In marketing-website/.env.local
VITE_DASHBOARD_URL=http://localhost:3000
```

## Deployment Strategy

### Option A: Separate Vercel Projects (Recommended)

**Marketing Site**: `tubevision.com` or `marketing.tubevision.com`
- Built from `marketing-website/` folder
- Points to dashboard via `VITE_DASHBOARD_URL` env var
- No backend, fully static

**Dashboard**: `app.tubevision.com` or `tubevision-app.vercel.app`
- Built from root folder
- Includes api/route.ts for backend
- Handles OAuth and all AI features

### Option B: Same Vercel Project, Different Routes

Not recommended due to vercel.json complexity, but possible:
- `/` → Marketing site (static)
- `/app/*` → Dashboard (dynamic)
- `/api/*` → Backend (serverless function)

### Deployment Checklist

- [ ] Dashboard deployed to https://app.tubevision.com
- [ ] Marketing site deployed to https://tubevision.com
- [ ] `VITE_DASHBOARD_URL=https://app.tubevision.com` set in marketing site env
- [ ] Google OAuth redirect URI includes both domains
- [ ] CORS configured if on different domains
- [ ] Favicon.svg accessible from both projects
- [ ] Theme key consistent (tube_vision_theme)
- [ ] Email links work (hello@tubevision.ai)

## Environment Variables Reference

### Dashboard (root)
```
APP_URL=https://tubevision.vercel.app
VITE_DASHBOARD_URL=http://localhost:3000  # For local dev
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
VITE_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

### Marketing Site
```
VITE_DASHBOARD_URL=http://localhost:3000  # Points to dashboard
```

## API Response & Error Handling

### OAuth Error Handling
If `/auth/youtube` fails (missing credentials, network, etc.):
- User sees error modal with actionable message
- Can retry or contact support
- No cross-site tracking issues

### Fallback URLs
```typescript
// If VITE_DASHBOARD_URL is not set:
const dashboardUrl = import.meta.env.VITE_DASHBOARD_URL || "http://localhost:3000";

// Development: http://localhost:3000
// Production: https://app.tubevision.com
```

## Common Issues & Solutions

### 1. Marketing Site CTAs Not Working
**Problem**: Buttons do nothing or 404
**Solution**:
- Verify `VITE_DASHBOARD_URL` is set in marketing-site/.env.local
- Check dashboard is running on expected URL
- Verify `/auth/youtube` endpoint exists in dashboard

### 2. OAuth Redirect Loop
**Problem**: User stuck between marketing site and dashboard
**Solution**:
- Check Google OAuth redirect URI whitelisted for both domains
- Ensure session storage not corrupted (clear localStorage)
- Verify CORS headers if on different domains

### 3. Theme Not Persisting
**Problem**: Light/dark mode resets
**Solution**:
- Check localStorage key is "tube_vision_theme" (case-sensitive)
- Verify theme class applied to <html> element
- Check for localStorage permission issues in privacy mode

### 4. Favicon Missing
**Problem**: Favicon doesn't show
**Solution**:
- Ensure favicon.svg in public/ folder
- Check vercel.json rewrite rule: `/favicon.ico` → `/favicon.svg`
- Clear browser cache

## Future Integrations

### Blog/Docs Integration
- Consider embedding docs or blog on marketing site
- Or link to Notion/GitHub wiki
- Update DOCS_URL in config.ts

### Email Notifications
- Marketing site sign-up / waitlist
- Welcome email with onboarding
- Use Resend or SendGrid

### Analytics & Tracking
- Add Plausible or Mixpanel to marketing site
- Track CTR on "Get Started" buttons
- Monitor funnel from marketing → dashboard signup → first feature use

### Dashboard Back-Link
- Add "Visit Marketing Site" link in dashboard
- Or footer with company info
- Helps users share platform with others

## Summary

✅ **Marketing site and dashboard are fully integrated**:
1. Users land on marketing site
2. Click CTA → redirected to dashboard OAuth
3. Complete OAuth flow in dashboard
4. Full app access
5. Same theme preference across both
6. Consistent branding and messaging

The marketing-website folder is production-ready and can be deployed independently or as part of the same Vercel project.
