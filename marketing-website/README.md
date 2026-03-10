# Janso Marketing Website

Marketing site for Janso Studio, deployed separately from the app.

## Production Topology
- Marketing: `https://janso.studio`
- App: `https://app.janso.studio`

All CTA buttons in this site redirect users to:
- `${VITE_DASHBOARD_URL}/auth/youtube`

## Local Development

```bash
cd marketing-website
npm install
cp .env.example .env.local
npm run dev
```

Default local URL:
- `http://localhost:5173`

Required env var in `.env.local`:

```bash
VITE_DASHBOARD_URL=http://localhost:3000
```

## Cloudflare Pages Deployment

Create a dedicated Pages project for this folder:

- **Project name**: `janso-marketing`
- **Root directory**: `marketing-website`
- **Build command**: `npm run build`
- **Build output directory**: `dist`
- **Node version**: `20.11.0`

Set production env var:

```bash
VITE_DASHBOARD_URL=https://app.janso.studio
```

Attach custom domains to this marketing project:
- `janso.studio`
- `www.janso.studio`

## Notes
- This project is static-only (no backend).
- SPA routing fallback is handled by `public/_redirects`.
- Security headers are set in `public/_headers`.
