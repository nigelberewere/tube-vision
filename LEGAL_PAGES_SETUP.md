# Legal Pages Setup for Janso Studio

**Date**: March 10, 2026  
**Status**: Ready for Production Deployment

## Overview

Both Privacy Policy and Terms of Service pages are fully configured and ready to serve to users. They are accessed via the app at `https://app.janso.studio/privacy` and `https://app.janso.studio/terms`.

## Document Files

Legal content is stored as Markdown files in the app's `public/` directory:

- **Privacy Policy**: [public/privacy-policy.md](../public/privacy-policy.md)
- **Terms of Service**: [public/terms-of-service.md](../public/terms-of-service.md)

Both documents are updated with production information:
- Contact email: `support@janso.studio`
- Service domain: `https://janso.studio` and `https://app.janso.studio`
- Google API compliance included (Limited Use disclosures)

## How They're Served

### In the App (app.janso.studio)

1. **Client-Side Routing**: Added React-based routing in [src/App.tsx](../src/App.tsx)
   - Detects URL paths `/privacy` and `/terms`
   - Renders `LegalViewer` component for those routes
   - Provides back button to return to main app

2. **LegalViewer Component**: Renders markdown files as formatted HTML
   - Fetches markdown from `public/privacy-policy.md` or `public/terms-of-service.md`
   - Converts markdown to styled HTML
   - Displays in a clean, readable layout

3. **Cloudflare Pages Configuration**: Public files are served correctly
   - Markdown files cached for 1 hour (via `public/_headers`)
   - SPA fallback configured in `public/_redirects`
   - All routes properly mapped for legal pages

### From Marketing Site (janso.studio)

The Footer component links to:
- `https://app.janso.studio/privacy` (Privacy Policy)
- `https://app.janso.studio/terms` (Terms of Service)
- `mailto:support@janso.studio` (Contact)

Links open in a new tab (`target="_blank"`) so users can reference while evaluating the product.

## URLs

### Production
- Privacy Policy: `https://app.janso.studio/privacy`
- Terms of Service: `https://app.janso.studio/terms`

### Local Development
- Privacy Policy: `http://localhost:3000/privacy`
- Terms of Service: `http://localhost:3000/terms`

## Testing Checklist

Before going live, verify:

- [ ] Visit `https://app.janso.studio/privacy` → Legal Viewer loads Privacy Policy markdown
- [ ] Visit `https://app.janso.studio/terms` → Legal Viewer loads Terms of Service markdown
- [ ] Both pages have readable styling and back button
- [ ] Marketing site footer links point to correct URLs
- [ ] All old references (tubevision.ai, hello@tubevision.ai) are removed
- [ ] Markdown files are cached properly (1 hour per `_headers`)

## Implementation Details

### Routing Logic (src/App.tsx)

```typescript
const [currentPage, setCurrentPage] = useState<'app' | 'privacy' | 'terms'>('app');

useEffect(() => {
  const handleRouteChange = () => {
    const pathname = window.location.pathname;
    if (pathname === '/privacy') setCurrentPage('privacy');
    else if (pathname === '/terms') setCurrentPage('terms');
    else setCurrentPage('app');
  };
  
  handleRouteChange();
  window.addEventListener('popstate', handleRouteChange);
  // ... link click handler for SPA routing
}, []);

if (currentPage === 'privacy') {
  return <LegalViewer type="privacy" onBack={() => window.history.back()} />;
}
if (currentPage === 'terms') {
  return <LegalViewer type="terms" onBack={() => window.history.back()} />;
}
```

### Redirect Rules (public/_redirects)

```
# SPA fallback - all other routes → index.html for React Router
* /index.html 200
```

## Content Compliance

Both documents include:
- ✅ Google API Services User Data Policy compliance
- ✅ Limited Use disclosures (required by Google)
- ✅ BYOK (Bring Your Own Key) API key management disclosure
- ✅ Data retention and user rights information
- ✅ OAuth scope disclosures
- ✅ Third-party services and privacy policy links
- ✅ Supabase, Cloudflare, Google API disclosures

## Contact & Support

Users who have questions about privacy or terms can:
1. Click the "Contact" link in the footer → `mailto:support@janso.studio`
2. Visit Settings within the app
3. Contact via the website contact form (when deployed)

## Production Deployment

Once deployed to Cloudflare Pages:

1. Marketing site (`janso-marketing` project):
   - Footer links route to app.janso.studio legal pages
   - No content changes needed post-domain attachment

2. App (`janso-app` project):
   - Legal pages accessible immediately post-deployment
   - No additional configuration needed
   - Markdown files served as static assets from `public/`

---

**Next Steps**:
1. Deploy both `janso-app` and `janso-marketing` projects to Cloudflare Pages
2. Test legal page routing on `*.pages.dev` domains before DNS cutover
3. Verify all links work and styling renders correctly
4. Address any user feedback and update markdown files as needed
