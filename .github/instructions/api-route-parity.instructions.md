---
description: "Use when adding, removing, or changing API/auth endpoints, callback paths, or deployment routing. Prefer keeping server.ts and api/route.ts in parity to reduce Vercel 404 regressions."
name: "API Route Parity (Local + Vercel)"
applyTo: "server.ts, api/route.ts, vercel.json"
---

# API Route Parity Checklist

This project runs backend logic in two runtimes:
- `server.ts` for local/dev
- `api/route.ts` for Vercel production (`/api/*` and `/auth/*` rewrites)

When editing API/auth behavior, prefer keeping both runtimes aligned.

- Add, rename, or remove the endpoint in both files in the same change when practical.
- Keep HTTP method parity (`GET`/`POST`) and request/response shape parity.
- Keep OAuth callback path handling aligned (`/auth/google/callback` and `/api/auth/google/callback`).
- If route prefixes or entrypoint paths change, update `vercel.json` rewrites.
- If a route is intentionally local-only or prod-only, consider leaving a short note in code for future maintainers.

Before finishing endpoint work, run:
- `npm run lint`
- `npm run build`
- Quick parity search:

```bash
rg "app\\.(get|post|put|delete)\\(\"/(api|auth)" server.ts
rg "if \\(path === '(api|auth)" api/route.ts
```

Endpoint changes that touch only one runtime are allowed when intentionally scoped.
