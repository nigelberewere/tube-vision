import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // For now, return a simple diagnostic response
  // This will be replaced with actual route handling once we verify it works
  const path = Array.isArray(req.query?.path) ? req.query.path.join('/') : req.query?.path || 'unknown';
  
  res.status(200).json({
    message: 'API function is working',
    requestedPath: path,
    method: req.method,
    url: req.url,
    env: {
      hasGoogleClientId: !!process.env.GOOGLE_CLIENT_ID,
      hasGoogleClientSecret: !!process.env.GOOGLE_CLIENT_SECRET,
      hasGeminiKey: !!process.env.GEMINI_API_KEY,
      appUrl: process.env.APP_URL || 'not set',
      nodeEnv: process.env.NODE_ENV || 'not set'
    }
  });
}
