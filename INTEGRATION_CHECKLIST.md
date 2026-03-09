# Marketing Site & Dashboard Integration Checklist

## Environment Setup ✓
- [x] Root .env.local has VITE_DASHBOARD_URL=http://localhost:3000
- [x] marketing-website/.env.local created with proper config
- [x] marketing-website/.env.example updated with guidance

## Configuration Files ✓
- [x] vercel.json configured for dashboard with API rewrites
- [x] vercel.json configured for marketing-website with SPA fallback
- [x] vite.config.ts in marketing-website has correct alias setup
- [x] tsconfig.json configured for both projects

## Components & Integration ✓
- [x] Navigation.tsx updated with proper external link handling
- [x] Footer.tsx has correct link targets (_blank for external)
- [x] App.tsx uses import.meta.env.VITE_DASHBOARD_URL with fallback
- [x] All CTA buttons call openDashboardAuth() → ${DASHBOARD_URL}/auth/youtube
- [x] Theme system uses shared localStorage key (tube_vision_theme)

## Files & Assets ✓
- [x] favicon.svg exists in marketing-website/public
- [x] Favicon rewrite configured in vercel.json
- [x] All Lucide icons properly imported
- [x] Motion animations properly imported

## API & OAuth ✓
- [x] Dashboard has /auth/youtube endpoint (server.ts)
- [x] api/route.ts mirrors /auth endpoints (Vercel)
- [x] api/route.ts mirrors /api endpoints (Vercel)
- [x] Vercel rewrites point /auth/* and /api/* to api/route function

## Documentation ✓
- [x] MARKETING_INTEGRATION_GUIDE.md created
- [x] config.ts utilities for dashboard URL resolution
- [x] Clear deployment instructions
- [x] Development workflow documented

## Local Validation Required
- [ ] npm run build in root (dashboard)
- [ ] npm run build in marketing-website
- [ ] npm run lint in marketing-website
- [ ] Start npm run dev in root
- [ ] Start npm run dev in marketing-website
- [ ] Click CTA in marketing site → redirects to dashboard /auth/youtube

## Production Validation Required (Before Deploy)
- [ ] Dashboard deployed to https://app.tubevision.com
- [ ] Marketing site deployed to https://tubevision.com
- [ ] VITE_DASHBOARD_URL env var set in marketing site deployment
- [ ] Google OAuth redirect URI accepts both domains
- [ ] Test CTA redirect works in production
- [ ] Theme preference persists across domains
- [ ] Error handling works (try invalid OAuth)

## Optional Enhancements
- [ ] Add analytics tracking to CTAs (Plausible/Mixpanel)
- [ ] Add blog/docs on marketing site
- [ ] Create email sign-up flow
- [ ] Add back-link from dashboard to marketing site
- [ ] Create privacy policy page
- [ ] Create terms of service page
- [ ] Set up status page
