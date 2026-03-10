# Migration Path: Express to Cloudflare Functions

## Overview

Your Janso Studio app currently uses an Express.js server (`server.ts`) for API endpoints. For full Cloudflare Pages edge deployment, you have two options:

### Option 1: Keep Express (Simpler, Works Now) ✅ RECOMMENDED FOR INITIAL LAUNCH

**Deploy the Express server as a Cloudflare Worker:**

1. The current `server.ts` can run on Cloudflare Workers
2. Minimal changes needed
3. Works immediately
4. Good for initial launch

**What to do:**
- Deploy static files to Cloudflare Pages
- Deploy `server.ts` as a Cloudflare Worker
- Point custom API routes to the Worker

### Option 2: Migrate to Cloudflare Pages Functions (Full Edge, More Work)

**Gradually migrate endpoints to native Cloudflare Functions:**

1. Create `/functions` directory
2. Migrate endpoints one-by-one
3. Full edge deployment
4. Better cold start performance
5. More work upfront

---

## Recommendation: Phased Approach

### Phase 1: Launch with Express (Week 1)
✅ **Deploy now, optimize later**

1. Keep `server.ts` as-is
2. Deploy to Cloudflare Workers (not Pages Functions)
3. Get to production quickly
4. Validate everything works

**Deployment:**
```bash
# Add to wrangler.toml
[env.production]
name = "vid-vision-api"
main = "server.ts"
compatibility_date = "2024-01-01"

# Deploy Worker
wrangler deploy
```

### Phase 2: Migrate to Functions (Weeks 2-4)
🔄 **Gradual migration for better performance**

Migrate endpoints in order of importance:

#### Week 2: Authentication & Core APIs
- [ ] `/auth/google` - Google OAuth initiation
- [ ] `/auth/google/callback` - OAuth callback
- [ ] `/api/user` - User profile
- [ ] `/api/status` - Health check

#### Week 3: YouTube APIs
- [ ] `/api/youtube/channel` - Channel data
- [ ] `/api/youtube/videos` - Video list
- [ ] `/api/youtube/analytics` - Analytics data
- [ ] `/api/youtube/thumbnails` - Thumbnail downloads

#### Week 4: AI & Processing
- [ ] `/api/gemini/*` - All Gemini endpoints
- [ ] `/api/viral-clips/*` - Video processing
- [ ] `/api/snapshots/*` - Channel snapshots

---

## Option 1 Implementation: Express on Workers

### 1. Update wrangler.toml

```toml
name = "vid-vision"
compatibility_date = "2024-01-01"

[env.production]
name = "vid-vision-api"
main = "server.ts"
node_compat = true

# Environment variables (set in Cloudflare Dashboard)
[env.production.vars]
NODE_ENV = "production"

# KV for sessions
[[kv_namespaces]]
binding = "SESSIONS"
id = "your-kv-namespace-id"
```

### 2. Modify server.ts for Workers

Add at the top:
```typescript
// Export for Cloudflare Workers
export default {
  async fetch(request: Request, env: any, ctx: any) {
    // Your Express app already handles requests
    // Just export it for Workers runtime
    return app(request);
  }
};
```

### 3. Deploy

```bash
# Deploy as Worker
wrangler deploy

# Set environment variables
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET
wrangler secret put SESSION_SECRET
wrangler secret put SUPABASE_SERVICE_ROLE_KEY
```

### 4. Update Cloudflare Pages

Point API routes to Worker:
- Pages > [Project] > Settings > Functions > Routes
- Add: `/api/*` → Worker `vid-vision-api`

✅ **Done! Your Express API runs on Cloudflare Workers edge network.**

---

## Option 2 Implementation: Cloudflare Pages Functions

### Directory Structure

```
functions/
├── _middleware.ts              # Global middleware
├── api/
│   └── [[path]].ts             # Catch-all API router
├── auth/
│   ├── google.ts               # OAuth initiation
│   └── google/
│       └── callback.ts         # OAuth callback
└── _shared/
    ├── auth.ts                 # Auth helpers
    ├── youtube.ts              # YouTube API client
    └── supabase.ts             # Supabase client
```

### Example Migration: OAuth Endpoint

**Before (Express - server.ts):**
```typescript
app.get('/auth/google', (req, res) => {
  const oauth2Client = new OAuth2Client(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    `${APP_URL}/auth/google/callback`
  );
  
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });
  
  res.redirect(url);
});
```

**After (Cloudflare Function - functions/auth/google.ts):**
```typescript
import { OAuth2Client } from 'google-auth-library';

interface Env {
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  APP_URL: string;
}

export async function onRequest(context: EventContext<Env>) {
  const { env } = context;
  
  const oauth2Client = new OAuth2Client(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    `${env.APP_URL}/auth/google/callback`
  );
  
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/youtube.readonly',
      'https://www.googleapis.com/auth/userinfo.profile',
    ],
  });
  
  return Response.redirect(url, 302);
}
```

### Migration Checklist Template

For each endpoint:

- [ ] **Identify endpoint** (route, method, purpose)
- [ ] **Extract logic** from Express route handler
- [ ] **Create Function file** in `/functions` directory
- [ ] **Update imports** (use Web APIs, not Node.js APIs)
- [ ] **Handle environment variables** via `context.env`
- [ ] **Return Response** objects instead of Express `res.send()`
- [ ] **Test locally** with `wrangler pages dev`
- [ ] **Deploy** and verify in production
- [ ] **Remove old Express route** (optional, keep for fallback)

### Migration Tips

#### 1. Request Handling
```typescript
// Express
app.post('/api/endpoint', (req, res) => {
  const body = req.body;
  res.json({ success: true });
});

// Cloudflare Function
export async function onRequest(context) {
  const body = await context.request.json();
  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
```

#### 2. File Uploads
```typescript
// Express (multer)
const upload = multer({ dest: 'uploads/' });
app.post('/upload', upload.single('file'), (req, res) => {
  const file = req.file;
});

// Cloudflare Function
export async function onRequest(context) {
  const formData = await context.request.formData();
  const file = formData.get('file') as File;
  const buffer = await file.arrayBuffer();
  // Process buffer...
}
```

#### 3. Sessions
```typescript
// Express (express-session)
req.session.userId = user.id;

// Cloudflare Function (KV storage)
const sessionId = crypto.randomUUID();
await context.env.SESSIONS.put(sessionId, JSON.stringify(userData), {
  expirationTtl: 2592000, // 30 days
});
```

#### 4. Cookies
```typescript
// Express
res.cookie('session', sessionId, { httpOnly: true });

// Cloudflare Function
const response = new Response('...');
response.headers.set('Set-Cookie', 
  `session=${sessionId}; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000; Path=/`
);
```

---

## Performance Comparison

### Express on Workers
- **Cold Start**: ~100ms
- **Warm Start**: ~10ms
- **Memory**: 128 MB
- **CPU Time**: 50ms-30s
- **Global**: ✅ (edge network)

### Cloudflare Pages Functions
- **Cold Start**: ~5ms (native)
- **Warm Start**: ~1ms
- **Memory**: 128 MB
- **CPU Time**: 50ms
- **Global**: ✅ (edge network)

**Winner**: Pages Functions (faster cold starts, fully integrated)

---

## Cost Comparison

### Cloudflare Workers (Express)
- **Free Tier**: 100,000 requests/day
- **Paid**: $5/month for 10M requests

### Cloudflare Pages Functions
- **Free Tier**: 100,000 requests/day
- **Included**: With Pages (no extra cost)

**Winner**: Pages Functions (included, no extra billing)

---

## Decision Matrix

| Factor | Express on Workers | Pages Functions |
|--------|-------------------|-----------------|
| **Time to Deploy** | ⚡ 1 hour | 🕐 2-4 weeks |
| **Maintenance** | 🟡 Medium | 🟢 Low |
| **Performance** | 🟢 Good | 🟢 Excellent |
| **Cost** | 🟡 $5/mo | 🟢 Included |
| **Learning Curve** | 🟢 Easy | 🟡 Medium |
| **Best For** | Quick launch | Long-term production |

---

## Recommended Timeline

### Week 1: Launch with Express ✅
```bash
Day 1-2: Deploy Express to Workers
Day 3-4: Test production environment
Day 5-7: Monitor, fix bugs
```

### Week 2-4: Migrate to Functions (Optional)
```bash
Week 2: Auth & core APIs
Week 3: YouTube APIs
Week 4: AI & processing
```

### Month 2+: Optimize
```bash
- Add caching layers
- Implement rate limiting
- Add monitoring/alerts
- Optimize bundle sizes
```

---

## TL;DR

**For Immediate Production Launch:**
1. Use Express on Cloudflare Workers (Option 1)
2. Deploy in 1 hour
3. Everything works as-is
4. Optimize later

**For Long-term Production:**
1. Plan phased migration to Pages Functions (Option 2)
2. Better performance & cost
3. More work upfront
4. Do after validating product-market fit

**My Recommendation:** Start with Option 1, migrate to Option 2 over 4-6 weeks after successful launch.

---

## Need Help?

See:
- [CLOUDFLARE_FUNCTIONS.md](./CLOUDFLARE_FUNCTIONS.md) - Full Functions guide
- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- [Pages Functions Docs](https://developers.cloudflare.com/pages/functions/)

