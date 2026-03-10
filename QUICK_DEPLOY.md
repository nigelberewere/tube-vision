# 🚀 Janso Studio - Quick Deployment Reference

## One-Page Production Deployment Guide

### Prerequisites Checklist
- [ ] Cloudflare account created
- [ ] Supabase production project ready
- [ ] Google OAuth credentials (production)
- [ ] Custom domain registered (janso.studio)
- [ ] Node 20.11.0+ installed locally

---

## 🔧 Local Setup (First Time)

```bash
# 1. Install dependencies
npm install

# 2. Create local environment file
cp .env.example .env.local

# 3. Fill in credentials in .env.local:
#    - GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
#    - SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
#    - SESSION_SECRET (generate: openssl rand -base64 32)

# 4. Test locally
npm run dev
# Open http://localhost:3000
```

---

## ☁️ Cloudflare Pages Setup (Two Projects)

### 1. Create `janso-app` project (root app)
1. Go to: https://dash.cloudflare.com/?to=/:account/pages
2. Click "Create a project"
3. Connect GitHub/GitLab repository
4. Settings:
   - **Project name**: `janso-app`
   - **Build command**: `npm run build`
   - **Build output**: `dist`
   - **Root directory**: `/`

Set env vars for `janso-app`:
```bash
APP_URL=https://app.janso.studio
NODE_ENV=production
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
SESSION_SECRET=your-32-char-random-string
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...your-anon-key
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...your-service-role-key
```

### 2. Create `janso-marketing` project (`marketing-website/`)
1. Click "Create a project" again
2. Use same repository
3. Settings:
   - **Project name**: `janso-marketing`
   - **Build command**: `npm run build`
   - **Build output**: `dist`
   - **Root directory**: `marketing-website`

Set env vars for `janso-marketing`:
```bash
VITE_DASHBOARD_URL=https://app.janso.studio
```

### 3. Attach Domains
1. `janso-marketing` -> `janso.studio`, `www.janso.studio`
2. `janso-app` -> `app.janso.studio`
3. Wait for DNS propagation (automatic)

---

## 🔐 Google OAuth Setup

1. Go to: https://console.cloud.google.com/apis/credentials
2. Create/Edit OAuth 2.0 Client ID:
    - **Authorized JavaScript origins**:
     ```
       https://app.janso.studio
     ```
   - **Authorized redirect URIs**:
     ```
       https://app.janso.studio/auth/google/callback
     ```
3. Save and copy Client ID + Secret

---

## 🗄️ Supabase Setup

1. Create project at: https://app.supabase.com
2. Run migration: Execute `supabase-migration.sql` in SQL Editor
3. Enable RLS: Ensure Row Level Security is enabled on all tables
4. Get credentials:
   - Settings > API > Project URL (`SUPABASE_URL`)
   - Settings > API > `anon` public key (`VITE_SUPABASE_ANON_KEY`)
   - Settings > API > `service_role` secret key (`SUPABASE_SERVICE_ROLE_KEY`)
5. Update Authentication:
   - Authentication > URL Configuration
   - Site URL: `https://app.janso.studio`
   - Redirect URLs: Add `https://app.janso.studio/**`

---

## 🚀 Deploy

### Automatic (Recommended)
```bash
git push origin main
```
Cloudflare auto-deploys on push to main branch.

### Manual
```bash
npm run build
npx wrangler pages deploy dist
```

---

## ✅ Post-Deployment Testing

### 1. Basic Functionality
- [ ] Marketing site loads at https://janso.studio
- [ ] App loads at https://app.janso.studio
- [ ] HTTPS redirect works (http → https)
- [ ] Legal pages load (/privacy-policy, /terms-of-service)

### 2. Authentication
- [ ] Click "Get Started" on marketing site
- [ ] Redirect lands on https://app.janso.studio/auth/youtube
- [ ] Click "Sign in with Google"
- [ ] OAuth flow completes
- [ ] Redirects back to app
- [ ] User profile displays

### 3. YouTube Integration
- [ ] Connect YouTube channel
- [ ] Channel data loads
- [ ] Dashboard shows analytics

### 4. AI Features
- [ ] Go to Settings → API Keys
- [ ] Add Gemini API key
- [ ] Test AI features (SEO, Content Ideas, etc.)

### 5. Security Headers
Check at: https://securityheaders.com/?q=https://janso.studio
- [ ] HSTS enabled
- [ ] CSP configured
- [ ] X-Frame-Options: DENY

---

## 🆘 Common Issues & Fixes

### OAuth Error "redirect_uri_mismatch"
**Fix**: Add both of these Google OAuth redirect URIs:
- `https://app.janso.studio/auth/google/callback` for direct YouTube OAuth
- `https://your-project-ref.supabase.co/auth/v1/callback` for Supabase Google sign-in

Also confirm Supabase Auth URL Configuration includes:
- Site URL: `https://app.janso.studio`
- Redirect URLs: `https://app.janso.studio/auth/callback` and `https://app.janso.studio/**`

### "Supabase connection failed"
**Fix**: Verify environment variables are set correctly in Cloudflare

### "Gemini API key required"
**Expected**: Users must provide their own keys via Settings → API Keys

### Build fails on Cloudflare
**Fix**: Check build logs, ensure Node version is 20.11.0 in project settings

### Session not persisting
**Fix**: Verify `SESSION_SECRET` is set and `APP_URL` matches your domain

### Marketing CTA points to old domain
**Fix**: Set `VITE_DASHBOARD_URL` in `janso-marketing` project env vars and redeploy.

---

## 📊 Monitoring

### Cloudflare Dashboard
- Pages > [Project] > Analytics - Traffic and performance
- Pages > [Project] > Deployments - Build history
- Pages > [Project] > Functions - Function logs (if using Functions)

### Supabase Dashboard
- Database > Tables - View data
- Authentication > Users - User management
- Logs - Database and auth logs

### Lighthouse Score
Test at: https://pagespeed.web.dev/
Target: 90+ on all metrics

---

## 🔄 Rollback (If Needed)

1. Go to: Pages > [Project] > Deployments
2. Find last working deployment
3. Click `•••` > "Rollback to this deployment"

---

## 📝 Maintenance Commands

```bash
# Update dependencies
npm update

# Type check
npm run lint

# Local build test
npm run build
npm run preview

# Deploy manually
npm run deploy

# Clean build artifacts
npm run clean
```

---

## 🔗 Important Links

- **Marketing Site**: https://janso.studio
- **App Site**: https://app.janso.studio
- **Cloudflare Dashboard**: https://dash.cloudflare.com
- **Supabase Dashboard**: https://app.supabase.com
- **Google Cloud Console**: https://console.cloud.google.com
- **Gemini API Keys**: https://aistudio.google.com/app/apikey

### Documentation
- Full Guide: [cloudflare-pages.md](./cloudflare-pages.md)
- Checklist: [.production-checklist.md](./.production-checklist.md)
- Summary: [PRODUCTION_DEPLOYMENT_SUMMARY.md](./PRODUCTION_DEPLOYMENT_SUMMARY.md)

---

## 🎯 Version Info

Current Version: **1.0.0**  
Last Updated: **March 10, 2026**

---

**Need help?** Check [PRODUCTION_DEPLOYMENT_SUMMARY.md](./PRODUCTION_DEPLOYMENT_SUMMARY.md) for detailed information.

