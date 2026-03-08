import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createApiApp } from './_app';

let appPromise: Promise<any> | null = null;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!appPromise) {
    appPromise = Promise.resolve(createApiApp());
  }

  const app = await appPromise;

  // Reconstruct the original path from the query parameter
  const path = Array.isArray(req.query?.path) ? req.query.path.join('/') : req.query?.path;
  
  if (path) {
    // Rewrite the URL to the original path for Express to handle
    req.url = `/${path}`;
  }

  // Let Express handle the request
  return app(req, res);
}
