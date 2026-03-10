# Quick Start: Marketing Site & Dashboard Integration

## What's Integrated?

✅ Marketing website seamlessly connects to the dashboard via `/auth/youtube` endpoint
✅ All "Get Started" & "Connect YouTube" buttons redirect users through OAuth flow
✅ Theme preference persists across both projects
✅ Production-ready with separate Vercel deployments

---

## For Developers

### Local Development (3 Steps)

**Step 1: Start Dashboard**
```bash
cd ~/projects/vid-vision
npm run dev
# Runs on http://localhost:3000
```

**Step 2: Start Marketing Site**  
```bash
cd ~/projects/vid-vision/marketing-website
npm run dev
# Runs on http://localhost:5173
```

**Step 3: Test Integration**
- Open http://localhost:5173
- Click "Get Started" button
- You should be redirected to http://localhost:3000/auth/youtube
- Complete Google OAuth flow
- You're now authenticated in the dashboard!

### Environment Files

**Root `.env.local`** (dashboard + build):
```
VITE_DASHBOARD_URL=http://localhost:3000
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
VITE_SUPABASE_URL=...
```

**`marketing-website/.env.local`** (marketing site):
```
VITE_DASHBOARD_URL=http://localhost:3000
```

---

## How It Works

1. **User lands on marketing site** → sees features, pricing, testimonials
2. **User clicks "Get Started"** → redirected to `${DASHBOARD_URL}/auth/youtube`
3. **Dashboard receives request** → `/auth/youtube` endpoint initiates Google OAuth
4. **User authorizes** → Google OAuth callback stores session
5. **User is authenticated** → full access to all dashboard features

---

## Production Deployment

### Marketing Site
- **Deploy from**: `marketing-website/` folder
- **Domain**: `janso.studio` (or subdomain)
- **Environment**: `VITE_DASHBOARD_URL=https://app.janso.studio`
- **Type**: Static site (no backend needed)

### Dashboard
- **Deploy from**: Root folder
- **Domain**: `app.janso.studio` (or separate domain)
- **Environment**: Google OAuth credentials + other config
- **Type**: Dynamic with serverless backend (`api/route.ts`)

### Vercel Setup

**For each Vercel project:**
1. Connect GitHub repo
2. Set environment variables in Vercel dashboard
3. Dashboard needs: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `APP_URL`
4. Marketing site needs: `VITE_DASHBOARD_URL`
5. Deploy both projects independently

---

## Key Files

| File | Purpose |
|------|---------|
| `server.ts` | Dev backend with `/auth/youtube` endpoint |
| `api/route.ts` | Production backend (Vercel) with `/auth/youtube` |
| `marketing-website/src/App.tsx` | Marketing site root, handles theme & redirects |
| `marketing-website/src/lib/config.ts` | Dashboard URL configuration utilities |
| `MARKETING_INTEGRATION_GUIDE.md` | Detailed integration architecture guide |
| `INTEGRATION_CHECKLIST.md` | Pre-launch validation checklist |

---

## Troubleshooting

### CTA Doesn't Work?
- Check `VITE_DASHBOARD_URL` is set
- Verify dashboard is running on that URL
- Check browser console for errors

### OAuth Fails?
- Check Google Client ID/Secret are valid
- Verify redirect URI in Google Cloud Console
- Check server logs for auth errors

### Can't Build?
- Run `npm install` in both folder roots
- Verify Node.js version is 18+
- Check for TypeScript errors: `npm run lint`

---

## Quick Links

- 📚 [Full Integration Guide](./MARKETING_INTEGRATION_GUIDE.md)
- ✅ [Pre-Launch Checklist](./INTEGRATION_CHECKLIST.md)
- 📋 [Integration Status](./INTEGRATION_COMPLETE.md)
- ⚙️ [Config Utilities](./marketing-website/src/lib/config.ts)

---

## One-Liner Tests

```bash
# Build both projects
cd ~/projects/vid-vision && npm run build && cd marketing-website && npm run build

# Start both dev servers (in separate terminals)
npm run dev  # Terminal 1: dashboard on :3000
npm run dev -C marketing-website  # Terminal 2: marketing site on :5173
```

---

That's it! The marketing site and dashboard are fully integrated and ready to use.

