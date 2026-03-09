/**
 * Fetch wrapper for AI-powered API endpoints
 * 
 * Automatically injects X-Gemini-Key header for backend AI processing
 * while maintaining security (key never logged or persisted server-side)
 */

import { loadGeminiKey } from './geminiKeyStorage';

/**
 * Fetch wrapper that adds BYOK header for AI endpoints
 */
export async function fetchWithAI(url: string, options: RequestInit = {}): Promise<Response> {
  const apiKey = await loadGeminiKey();
  
  if (!apiKey) {
    throw new Error('Gemini API key required. Please add your key in Settings → API Keys.');
  }
  
  // Add Gemini API key header (safe for backend AI processing)
  const headers = new Headers(options.headers);
  headers.set('X-Gemini-Key', apiKey);
  
  return fetch(url, {
    ...options,
    headers,
  });
}

/**
 * Check if URL is an AI-powered endpoint
 */
function isAIEndpoint(url: string): boolean {
  const aiEndpoints = [
    '/api/analyze',
    '/api/script/daily-placeholder',
    '/api/coach/insight-alert',
    '/api/shorts/remix-plan',
    '/api/user/best-posting-time',
    '/api/gemini/validate',
  ];
  
  return aiEndpoints.some(endpoint => url.includes(endpoint));
}

/**
 * Smart fetch that auto-detects AI endpoints and adds header
 */
export async function smartFetch(url: string, options: RequestInit = {}): Promise<Response> {
  if (isAIEndpoint(url)) {
    return fetchWithAI(url, options);
  }
  
  return fetch(url, options);
}
