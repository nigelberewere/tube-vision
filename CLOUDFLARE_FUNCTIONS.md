# Cloudflare Pages Functions

This directory contains Cloudflare Pages Functions for VidVision's API endpoints.

## Overview

Cloudflare Pages Functions are edge functions that run on Cloudflare's global network. They replace the previous Vercel serverless functions and Express server for production deployment.

## Directory Structure

```
functions/
├── api/
│   └── [[path]].ts       # Catch-all API handler (main API router)
├── auth/
│   ├── google.ts         # Google OAuth initiation
│   └── callback.ts       # OAuth callback handler
└── _middleware.ts        # Global middleware (CORS, rate limiting, auth)
```

## How It Works

### Route Mapping

Cloudflare Pages automatically maps files in `/functions` to routes:

- `/functions/api/[[path]].ts` → `/api/*` (catch-all)
- `/functions/auth/google.ts` → `/auth/google`
- `/functions/auth/callback.ts` → `/auth/callback`

### Request/Response Interface

Cloudflare Functions use standard Web API Request/Response objects:

```typescript
export async function onRequest(context: EventContext<Env, any, any>) {
  const { request, env, params } = context;
  
  // Access request
  const url = new URL(request.url);
  const body = await request.json();
  
  // Access environment variables
  const apiKey = env.GOOGLE_CLIENT_ID;
  
  // Access route parameters
  const path = params.path;
  
  // Return response
  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' },
    status: 200,
  });
}
```

## Migration from Vercel/Express

### Before (Vercel):
```typescript
export default function handler(req: VercelRequest, res: VercelResponse) {
  res.status(200).json({ message: 'Hello' });
}
```

### After (Cloudflare):
```typescript
export async function onRequest(context) {
  return new Response(JSON.stringify({ message: 'Hello' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
```

## Environment Variables

Access environment variables via `context.env`:

```typescript
export async function onRequest(context) {
  const clientId = context.env.GOOGLE_CLIENT_ID;
  const secret = context.env.GOOGLE_CLIENT_SECRET;
  
  // Use environment variables...
}
```

Set environment variables in Cloudflare Dashboard:
- Pages > [Your Project] > Settings > Environment Variables

## Middleware

Global middleware in `_middleware.ts` runs before all functions:

```typescript
export async function onRequest(context) {
  // Add CORS headers
  const response = await context.next();
  response.headers.set('Access-Control-Allow-Origin', '*');
  return response;
}
```

## Rate Limiting

Use Cloudflare Workers KV for rate limiting:

```typescript
// In _middleware.ts
export async function onRequest(context) {
  const { request, env } = context;
  const ip = request.headers.get('CF-Connecting-IP');
  
  // Check rate limit
  const key = `ratelimit:${ip}`;
  const count = await env.RATE_LIMIT_KV.get(key);
  
  if (count && parseInt(count) > 100) {
    return new Response('Rate limit exceeded', { status: 429 });
  }
  
  // Increment counter
  await env.RATE_LIMIT_KV.put(key, String((parseInt(count || '0') + 1)), {
    expirationTtl: 60, // 1 minute window
  });
  
  return context.next();
}
```

## Session Management

Use Cloudflare Workers KV for session storage:

```typescript
// Store session
await context.env.SESSIONS.put(sessionId, JSON.stringify(sessionData), {
  expirationTtl: 86400 * 30, // 30 days
});

// Retrieve session
const data = await context.env.SESSIONS.get(sessionId);
const session = JSON.parse(data);
```

## Database Access

For Supabase (recommended):

```typescript
import { createClient } from '@supabase/supabase-js';

export async function onRequest(context) {
  const supabase = createClient(
    context.env.SUPABASE_URL,
    context.env.SUPABASE_SERVICE_ROLE_KEY
  );
  
  const { data, error } = await supabase
    .from('snapshots')
    .select('*')
    .eq('user_id', userId);
  
  return new Response(JSON.stringify(data));
}
```

## Error Handling

Always wrap in try-catch and return proper errors:

```typescript
export async function onRequest(context) {
  try {
    // Your logic here
    return new Response(JSON.stringify({ success: true }));
  } catch (error) {
    console.error('Function error:', error);
    
    return new Response(JSON.stringify({ 
      error: 'Internal server error',
      message: error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
```

## Testing Locally

Use Wrangler CLI to test functions locally:

```bash
# Install dependencies
npm install

# Run dev server with functions
npx wrangler pages dev dist --compatibility-date=2024-01-01

# Or use the npm script
npm run dev
```

## Deployment

Functions are automatically deployed with your Pages deployment:

```bash
# Build and deploy
npm run build
wrangler pages deploy dist

# Or use the deploy script
npm run deploy
```

## Limitations

Cloudflare Pages Functions have limits:
- **CPU Time**: 50ms (Free), 50ms-30s (Workers Paid)
- **Memory**: 128 MB
- **Request Size**: 100 MB
- **Response Size**: Unlimited

For long-running tasks (e.g., video processing), consider:
1. Cloudflare Workers (Unbound) for longer execution
2. Cloudflare Queues for background processing
3. External workers (BullMQ, Celery, etc.)

## Best Practices

1. **Keep functions small**: One responsibility per function
2. **Use middleware**: Share common logic (auth, CORS, logging)
3. **Leverage edge**: Use KV, D1, R2 for data storage at the edge
4. **Cache responses**: Use Cache API for frequently accessed data
5. **Handle errors**: Always return proper HTTP status codes
6. **Log strategically**: Use console.log for debugging (visible in Cloudflare logs)
7. **Secure secrets**: Never expose API keys in responses or logs

## Resources

- [Cloudflare Pages Functions Docs](https://developers.cloudflare.com/pages/functions/)
- [Workers Runtime API](https://developers.cloudflare.com/workers/runtime-apis/)
- [Workers KV](https://developers.cloudflare.com/kv/)
- [Cloudflare D1](https://developers.cloudflare.com/d1/)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/)

## Example: Complete API Function

```typescript
// functions/api/hello.ts
interface Env {
  ENVIRONMENT: string;
}

export async function onRequest(context: EventContext<Env, any, any>) {
  const { request, env } = context;
  
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json',
  };
  
  // Handle OPTIONS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers });
  }
  
  try {
    const url = new URL(request.url);
    const name = url.searchParams.get('name') || 'World';
    
    return new Response(JSON.stringify({
      message: `Hello, ${name}!`,
      environment: env.ENVIRONMENT,
      timestamp: new Date().toISOString(),
    }), {
      status: 200,
      headers,
    });
  } catch (error) {
    return new Response(JSON.stringify({
      error: 'Internal server error',
      message: error.message,
    }), {
      status: 500,
      headers,
    });
  }
}
```

---

**Note**: The actual API implementation (`api/[[path]].ts`) requires significant refactoring from the Express-based `server.ts`. This is a complex migration best done in phases. For initial deployment, you can use the existing `server.ts` locally and gradually migrate endpoints to Cloudflare Functions.
