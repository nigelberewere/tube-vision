# 🎬 VidVision

**Production-Ready YouTube Channel Analytics & Optimization Platform**

VidVision is a comprehensive tool for YouTube content creators to analyze channel performance, generate content ideas, optimize SEO, and extract viral clips using AI.

🌐 **Marketing**: [https://janso.studio](https://janso.studio)  
🌐 **App**: [https://app.janso.studio](https://app.janso.studio)

---

## ✨ Features

### 📊 Analytics & Insights
- **Channel Dashboard**: Real-time metrics, subscriber growth, performance trends
- **Video Analytics**: Deep dive into views, engagement, retention, and watch time
- **AI Coach**: Data-driven recommendations based on channel performance
- **Growth Momentum**: Track viral videos and trending topics
- **Competitor Analysis**: Compare your channel against competitors

### 🤖 AI-Powered Tools
- **Content Strategist**: AI-generated video ideas tailored to your niche
- **Script Architect**: Professional script generation with hooks and CTAs
- **SEO Optimizer**: Auto-generate titles, descriptions, and tags
- **Thumbnail Studio**: A/B testing and heatmap simulation
- **Comment Strategist**: Automate community engagement
- **Viral Clip Extractor**: Extract short clips from long-form videos

### 🎨 Creator Tools
- **Brand Kit**: Manage logos, colors, and brand assets
- **Keyword Research**: Find trending topics in your niche
- **Video Library**: Organize and manage your content
- **Voice-Over Generator**: AI text-to-speech for videos

---

## 🚀 Quick Start

### For Users (Production)

1. Visit [https://janso.studio](https://janso.studio)
2. Click **Get Started** to open the app at `https://app.janso.studio`
3. Sign in with your Google account
4. Connect your YouTube channel
5. Get your free Gemini API key from [Google AI Studio](https://aistudio.google.com/app/apikey)
6. Add your API key in Settings → API Keys
7. Start analyzing and optimizing!

### For Developers (Local Setup)

#### Prerequisites
- Node.js 20.11.0 or higher
- npm or yarn
- Google Cloud Project with OAuth credentials
- Supabase account

#### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/vid-vision.git
cd vid-vision

# Install dependencies
npm install

# Copy environment template
cp .env.example .env.local

# Edit .env.local with your credentials
# - GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
# - SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
# - SESSION_SECRET (generate with: openssl rand -base64 32)

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 📦 Production Deployment

### Cloudflare Pages (Recommended)

Deploy as two Cloudflare Pages projects:
- `janso-marketing` from `marketing-website/` -> `https://janso.studio`
- `janso-app` from root `./` -> `https://app.janso.studio`

VidVision is optimized for this split deployment model.

#### Prerequisites
- Cloudflare account
- Custom domain (configured in Cloudflare)
- Supabase production project
- Google OAuth credentials (production)

#### Deployment Steps

1. **Create `janso-app` project (root)**
   - Go to Cloudflare Dashboard > Pages
   - Click "Create a project" and connect your Git repository
    - Build settings:
       - **Build command**: `npm run build`
       - **Build output directory**: `dist`
       - **Root directory**: `/`
       - **Node version**: `20.11.0`

2. **Create `janso-marketing` project (`marketing-website`)**
   - Click "Create a project" again with same repository
   - Build settings:
     - **Build command**: `npm run build`
     - **Build output directory**: `dist`
     - **Root directory**: `marketing-website`

3. **Configure Environment Variables**
   
   In Cloudflare Dashboard > Pages > [Project] > Settings > Environment Variables:
   
   ```bash
   APP_URL=https://app.janso.studio
   NODE_ENV=production
   
   # Google OAuth
   GOOGLE_CLIENT_ID=your-prod-client-id
   GOOGLE_CLIENT_SECRET=your-prod-client-secret
   
   # Supabase
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   
   # Session
   SESSION_SECRET=your-strong-random-secret
   ```

   In `janso-marketing` project env vars:

   ```bash
   VITE_DASHBOARD_URL=https://app.janso.studio
   ```

4. **Configure Custom Domain**
   - `janso-marketing` -> `janso.studio`, `www.janso.studio`
   - `janso-app` -> `app.janso.studio`
   - SSL certificates are automatic

5. **Update OAuth Redirect URIs**
   - Google Cloud Console > Credentials
   - Authorized JavaScript origins: `https://app.janso.studio`
   - Authorized redirect URIs: `https://app.janso.studio/auth/google/callback`

6. **Deploy**
   - Push to `main` branch for automatic deployment
   - Or deploy manually: `npm run deploy`

For detailed deployment guide, see: **[cloudflare-pages.md](./cloudflare-pages.md)**

For production checklist, see: **[.production-checklist.md](./.production-checklist.md)**

---

## 🏗️ Architecture

### Tech Stack

**Frontend:**
- React 19 with TypeScript
- Vite for blazing-fast builds
- Tailwind CSS for styling
- Motion for animations
- Recharts for data visualization

**Backend:**
- Cloudflare Pages Functions (Edge)
- Express.js (local development)
- Supabase (PostgreSQL database + Auth)
- Google OAuth 2.0
- YouTube Data API v3

**AI & Processing:**
- Google Gemini AI (user-provided API keys)
- FFmpeg.js for video processing
- youtube-dl for video downloads

**Infrastructure:**
- Cloudflare Pages (hosting + CDN)
- Cloudflare Workers (edge functions)
- Supabase (database + real-time)
- Cloudflare KV (sessions, optional)

### Project Structure

```
vid-vision/
├── src/
│   ├── components/       # React components
│   ├── lib/              # Utilities and helpers
│   ├── services/         # API services (Gemini, YouTube, etc.)
│   └── main.tsx          # App entry point
├── public/               # Static assets
│   ├── _headers          # Security headers config
│   ├── terms-of-service.md
│   └── privacy-policy.md
├── functions/            # Cloudflare Pages Functions (TODO)
│   ├── api/[[path]].ts   # API router
│   └── _middleware.ts    # Global middleware
├── server.ts             # Express server (local dev)
├── api/route.ts          # Vercel API route (legacy)
├── wrangler.toml         # Cloudflare configuration
└── .production-checklist.md
```

---

## 🔐 Security

### Features
- ✅ HTTPS enforced (automatic on Cloudflare)
- ✅ Security headers (CSP, HSTS, X-Frame-Options)
- ✅ Row Level Security (RLS) in Supabase
- ✅ OAuth 2.0 secure authentication
- ✅ API key encryption (browser-only storage)
- ✅ Rate limiting on API endpoints
- ✅ Input sanitization and validation
- ✅ CORS configuration

### Privacy
- **BYOK (Bring Your Own Key)**: Users provide their own Gemini API keys
- **No API key storage**: Keys stored locally in browser only
- **No video storage**: Videos processed temporarily and deleted
- **GDPR & CCPA compliant**: Full data control and deletion
- **Privacy Policy**: [/privacy-policy](/privacy-policy)
- **Terms of Service**: [/terms-of-service](/terms-of-service)

---

## 🔧 Development

### Available Scripts

```bash
npm run dev          # Start development server (with HMR)
npm run build        # Build for production
npm run preview      # Preview production build locally
npm run lint         # Type-check with TypeScript
npm run clean        # Clean build artifacts
npm run deploy       # Build and deploy to Cloudflare Pages
```

### Environment Variables

See [.env.example](./.env.example) for local development configuration.

See [.env.production.example](./.env.production.example) for production configuration.

### API Development

For Cloudflare Functions development, see: [CLOUDFLARE_FUNCTIONS.md](./CLOUDFLARE_FUNCTIONS.md)

---

## 📊 Performance

### Metrics (Target)
- **Lighthouse Score**: 90+ (Performance, Accessibility, Best Practices, SEO)
- **First Contentful Paint**: < 1.5s
- **Time to Interactive**: < 3.5s
- **Bundle Size**: < 500KB (initial load)

### Optimizations
- Code splitting by route
- Lazy loading for non-critical components
- Image optimization (WebP/AVIF)
- Font subsetting and preloading
- CDN caching on Cloudflare edge
- Brotli compression

---

## 🆘 Support

### Documentation
- [Deployment Guide](./cloudflare-pages.md)
- [Production Checklist](./.production-checklist.md)
- [Cloudflare Functions](./CLOUDFLARE_FUNCTIONS.md)
- [Supabase Migration](./SUPABASE_MIGRATION.md)

### Getting Help
- **Issues**: [GitHub Issues](https://github.com/your-org/vid-vision/issues)
- **Email**: support@janso.studio
- **Discussions**: [GitHub Discussions](https://github.com/your-org/vid-vision/discussions)

---

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.

---

## 🙏 Acknowledgments

Built with:
- [React](https://react.dev/)
- [Vite](https://vitejs.dev/)
- [Tailwind CSS](https://tailwindcss.com/)
- [Supabase](https://supabase.com/)
- [Cloudflare Pages](https://pages.cloudflare.com/)
- [Google Gemini](https://ai.google.dev/)
- [YouTube Data API](https://developers.google.com/youtube/v3)

---

## 🗺️ Roadmap

### ✅ Completed
- [x] Channel analytics dashboard
- [x] AI-powered content generation
- [x] SEO optimization tools
- [x] Thumbnail studio with A/B testing
- [x] Viral clip extractor
- [x] Cloudflare Pages migration
- [x] Production security hardening
- [x] Legal pages (Terms & Privacy)

### 🚧 In Progress
- [ ] Cloudflare Functions API migration
- [ ] Advanced analytics (retention graphs)
- [ ] Real-time collaboration features
- [ ] Mobile app (React Native)

### 📅 Planned
- [ ] Team workspaces
- [ ] Content calendar
- [ ] Automated publishing
- [ ] Advanced A/B testing
- [ ] Integration with TikTok, Instagram
- [ ] Pro tier with premium features
- [ ] White-label solutions for agencies

---

**Made with ❤️ by Janso Studio**
