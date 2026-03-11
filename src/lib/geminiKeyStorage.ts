/**
 * Secure Gemini API Key Storage
 * 
 * Browser-only storage with encryption at rest.
 * Keys are stored in localStorage with Web Crypto API encryption.
 * Never logs, exposes, or transmits keys to servers.
 */

const STORAGE_KEY = 'vidvision_gemini_api_key';
const SALT_KEY = 'vidvision_gemini_salt';

/**
 * Redacts API keys from any string for safe logging
 */
export function redactKey(text: string): string {
  if (!text) return text;
  
  // Redact patterns like AIzaSy... (Google API key format)
  return text.replace(/AIza[A-Za-z0-9_-]{33}/g, '[REDACTED_API_KEY]')
             .replace(/\b[A-Za-z0-9_-]{39}\b/g, '[REDACTED_KEY]');
}

/**
 * Generate a fingerprint for rate-limit tracking (not for security)
 */
export function getKeyFingerprint(apiKey: string): string {
  if (!apiKey || apiKey.length < 10) return 'unknown';
  
  // Simple fingerprint: first 6 + last 4 chars
  return `${apiKey.substring(0, 6)}...${apiKey.substring(apiKey.length - 4)}`;
}

/**
 * Encrypt data using Web Crypto API
 */
async function encrypt(data: string, password: string): Promise<string> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  
  // Derive key from password
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );
  
  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: encoder.encode(SALT_KEY),
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );
  
  // Generate random IV
  const iv = crypto.getRandomValues(new Uint8Array(12));
  
  // Encrypt
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    dataBuffer
  );
  
  // Combine IV + encrypted data
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.length);
  
  // Convert to base64
  return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypt data using Web Crypto API
 */
async function decrypt(encryptedData: string, password: string): Promise<string> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  
  // Decode base64
  const combined = new Uint8Array(
    atob(encryptedData).split('').map(c => c.charCodeAt(0))
  );
  
  // Extract IV and encrypted data
  const iv = combined.slice(0, 12);
  const encrypted = combined.slice(12);
  
  // Derive key
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );
  
  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: encoder.encode(SALT_KEY),
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );
  
  // Decrypt
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    encrypted
  );
  
  return decoder.decode(decrypted);
}

/**
 * Get browser fingerprint for encryption key derivation
 */
function getBrowserFingerprint(): string {
  // Use stable browser characteristics for password derivation
  // Not for security, just obfuscation
  const nav = navigator;
  return `${nav.userAgent}_${nav.language}_${screen.width}x${screen.height}`;
}

/**
 * Save Gemini API key to encrypted localStorage
 */
export async function saveGeminiKey(apiKey: string): Promise<void> {
  if (typeof window === 'undefined') {
    throw new Error('Key storage only available in browser');
  }
  
  if (!apiKey || apiKey.trim().length === 0) {
    throw new Error('API key cannot be empty');
  }
  
  try {
    const password = getBrowserFingerprint();
    const encrypted = await encrypt(apiKey.trim(), password);
    localStorage.setItem(STORAGE_KEY, encrypted);
  } catch (error) {
    console.error('Failed to save API key:', redactKey(String(error)));
    throw new Error('Failed to save API key');
  }
}

/**
 * Load Gemini API key from encrypted localStorage
 */
export async function loadGeminiKey(): Promise<string | null> {
  if (typeof window === 'undefined') {
    return null;
  }
  
  try {
    const encrypted = localStorage.getItem(STORAGE_KEY);
    if (!encrypted) return null;
    
    const password = getBrowserFingerprint();
    const decrypted = await decrypt(encrypted, password);
    return decrypted;
  } catch (error) {
    console.error('Failed to load API key:', redactKey(String(error)));
    // If decryption fails, clear corrupted data
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

/**
 * Delete Gemini API key from localStorage
 */
export function deleteGeminiKey(): void {
  if (typeof window === 'undefined') return;
  
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Check if a Gemini API key is saved
 */
export function hasGeminiKey(): boolean {
  if (typeof window === 'undefined') return false;
  
  return localStorage.getItem(STORAGE_KEY) !== null;
}

/**
 * Track API usage for quota/rate-limit UX
 */
interface UsageStats {
  count: number;
  lastReset: string; // ISO date string
  lastError?: {
    type: 'rate_limited' | 'quota_exhausted' | 'invalid_key';
    timestamp: string;
  };
}

const USAGE_KEY = 'vidvision_gemini_usage';

export function recordAPIRequest(): void {
  if (typeof window === 'undefined') return;
  
  try {
    const today = new Date().toISOString().split('T')[0];
    const stored = localStorage.getItem(USAGE_KEY);
    const stats: UsageStats = stored ? JSON.parse(stored) : { count: 0, lastReset: today };
    
    // Reset counter daily
    if (stats.lastReset !== today) {
      stats.count = 0;
      stats.lastReset = today;
      delete stats.lastError;
    }
    
    stats.count++;
    localStorage.setItem(USAGE_KEY, JSON.stringify(stats));
  } catch (error) {
    console.error('Failed to record usage:', error);
  }
}

export function recordAPIError(type: 'rate_limited' | 'quota_exhausted' | 'invalid_key'): void {
  if (typeof window === 'undefined') return;
  
  try {
    const stored = localStorage.getItem(USAGE_KEY);
    const stats: UsageStats = stored ? JSON.parse(stored) : { count: 0, lastReset: new Date().toISOString().split('T')[0] };
    
    stats.lastError = {
      type,
      timestamp: new Date().toISOString(),
    };
    
    localStorage.setItem(USAGE_KEY, JSON.stringify(stats));
  } catch (error) {
    console.error('Failed to record error:', error);
  }
}

export function clearLastAPIError(): void {
  if (typeof window === 'undefined') return;

  try {
    const stored = localStorage.getItem(USAGE_KEY);
    if (!stored) return;

    const stats: UsageStats = JSON.parse(stored);
    if (stats.lastError) {
      delete stats.lastError;
      localStorage.setItem(USAGE_KEY, JSON.stringify(stats));
    }
  } catch {
    // Ignore malformed usage state.
  }
}

export function getUsageStats(): UsageStats | null {
  if (typeof window === 'undefined') return null;
  
  try {
    const stored = localStorage.getItem(USAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}
