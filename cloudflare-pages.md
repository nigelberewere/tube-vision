# Cloudflare Pages Deployment Guide (App + Marketing)

## Overview
Use two Cloudflare Pages projects so your marketing site and app can deploy independently.

- `janso-marketing` from `marketing-website/` -> `https://janso.studio`
- `janso-app` from repository root `./` -> `https://app.janso.studio`

This is the cleanest setup for releases, SEO, and OAuth.

## Why Two Projects
- Marketing and app have different env vars and release cadence.
- Root domain should stay fast and static for conversion/SEO.
- App can evolve APIs/auth without breaking the landing site.

## Pre-Domain Dry Run (Recommended)
Deploy both projects to `*.pages.dev` first before adding domains.

1. Deploy `janso-app` and copy its preview URL, for example `https://janso-app.pages.dev`.
2. Deploy `janso-marketing` with `VITE_DASHBOARD_URL=https://janso-app.pages.dev`.
3. Test CTA flow from marketing -> app (`/auth/youtube`).
4. After that passes, attach custom domains.

## Project A: Marketing Site (`marketing-website/`)

### Build Settings
- **Project name**: `janso-marketing`
- **Framework preset**: Vite
- **Root directory**: `marketing-website`
- **Build command**: `npm run build`
- **Build output directory**: `dist`
- **Node version**: `20.11.0`

### Environment Variables
Set in Cloudflare Dashboard > Pages > `janso-marketing` > Settings > Environment Variables:

```bash
VITE_DASHBOARD_URL=https://app.janso.studio
```

Use `https://janso-app.pages.dev` during dry run before custom domain is attached.

### Custom Domains
Attach these domains to `janso-marketing`:
- `janso.studio`
- `www.janso.studio`

## Project B: App (`./` root)

### Build Settings
- **Project name**: `janso-app`
- **Framework preset**: Vite
- **Root directory**: `/`
- **Build command**: `npm run build`
- **Build output directory**: `dist`
- **Node version**: `20.11.0`

### Environment Variables
Set in Cloudflare Dashboard > Pages > `janso-app` > Settings > Environment Variables:

```bash
APP_URL=https://app.janso.studio
NODE_ENV=production

GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
SESSION_SECRET=generate-a-strong-random-string

VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key

SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-secret-key
```

### Custom Domain
Attach this domain to `janso-app`:
- `app.janso.studio`

## OAuth and Supabase Configuration
Once domains are attached, update third-party settings.

### Google OAuth (for app only)
Authorized JavaScript origins:
```
https://app.janso.studio
```

Authorized redirect URIs:
```
https://app.janso.studio/auth/google/callback
```

### Supabase Auth
Set **Site URL**:
```
https://app.janso.studio
```

Add redirect URLs:
```
https://app.janso.studio/auth/callback
https://app.janso.studio/**
```

## Go-Live Order
1. Deploy `janso-app` to `pages.dev` and verify login/API.
2. Deploy `janso-marketing` with `VITE_DASHBOARD_URL` pointing to app preview URL.
3. Verify CTA redirects from marketing to app.
4. Attach custom domain `app.janso.studio` to app project.
5. Update marketing env var to `VITE_DASHBOARD_URL=https://app.janso.studio`.
6. Attach `janso.studio` and `www.janso.studio` to marketing project.
7. Update Google OAuth + Supabase to final `app.janso.studio` values.

## Validation Checklist
- Marketing home loads at `https://janso.studio`.
- CTA button routes to `https://app.janso.studio/auth/youtube`.
- OAuth callback returns to app without redirect mismatch.
- App APIs and auth sessions function under `app.janso.studio`.

## Troubleshooting

### CTA goes to wrong place
- Check `marketing-website/.env.local` and Cloudflare env var `VITE_DASHBOARD_URL`.

### OAuth `redirect_uri_mismatch`
- Ensure Google redirect URI exactly matches `https://app.janso.studio/auth/google/callback`.

### App works on preview, fails on domain
- Ensure `APP_URL` is updated to `https://app.janso.studio` in production env.
- Re-deploy app after changing env vars.

## Notes
- Legacy `vercel.json` files can stay in repo but are not used by Cloudflare.
- Keep marketing as static-only and app as authenticated runtime.
