/**
 * Production Environment Utilities
 * Helpers for production-ready features: logging, error tracking, monitoring
 */

export const IS_PRODUCTION = import.meta.env.MODE === 'production';
export const IS_DEVELOPMENT = import.meta.env.MODE === 'development';

/**
 * Production-safe logger
 * In production, only logs warnings and errors
 * In development, logs everything
 */
export const logger = {
  debug: (...args: any[]) => {
    if (IS_DEVELOPMENT) {
      console.log('[DEBUG]', ...args);
    }
  },
  
  info: (...args: any[]) => {
    if (IS_DEVELOPMENT) {
      console.info('[INFO]', ...args);
    }
  },
  
  warn: (...args: any[]) => {
    console.warn('[WARN]', ...args);
  },
  
  error: (...args: any[]) => {
    console.error('[ERROR]', ...args);
    
    // In production, you could send to error tracking service
    if (IS_PRODUCTION) {
      // TODO: Send to error tracking (e.g., Sentry)
      // Sentry.captureException(args[0]);
    }
  },
};

/**
 * Track custom events (analytics)
 * Replace with your analytics provider (Plausible, Cloudflare Web Analytics, etc.)
 */
export function trackEvent(
  eventName: string,
  properties?: Record<string, any>
) {
  if (IS_DEVELOPMENT) {
    logger.debug('Event tracked:', eventName, properties);
    return;
  }

  // TODO: Integrate with your analytics service
  // Example for Plausible:
  // window.plausible?.(eventName, { props: properties });
  
  // Example for Cloudflare Web Analytics (no event tracking, just pageviews)
  // Cloudflare Analytics is automatic, no code needed
}

/**
 * Track page views
 */
export function trackPageView(pageName: string) {
  if (IS_DEVELOPMENT) {
    logger.debug('Page view:', pageName);
    return;
  }

  // Most analytics automatically track pageviews
  // Manual tracking if needed:
  // window.plausible?.('pageview', { props: { page: pageName } });
}

/**
 * Report error to tracking service
 */
export function reportError(
  error: Error,
  context?: Record<string, any>
) {
  logger.error('Error reported:', error.message, context);

  if (IS_PRODUCTION) {
    // TODO: Send to error tracking service
    // Sentry.captureException(error, {
    //   extra: context,
    // });
  }
}

/**
 * Performance monitoring
 */
export function measurePerformance(
  metricName: string,
  duration: number
) {
  if (IS_DEVELOPMENT) {
    logger.debug(`Performance [${metricName}]: ${duration}ms`);
  }

  if (IS_PRODUCTION) {
    // TODO: Send to performance monitoring service
    // Example: Send to Cloudflare Analytics or custom endpoint
  }
}

/**
 * Measure async operation performance
 */
export async function measureAsync<T>(
  metricName: string,
  operation: () => Promise<T>
): Promise<T> {
  const start = performance.now();
  try {
    const result = await operation();
    const duration = performance.now() - start;
    measurePerformance(metricName, duration);
    return result;
  } catch (error) {
    const duration = performance.now() - start;
    measurePerformance(`${metricName}_error`, duration);
    throw error;
  }
}

/**
 * Feature flags (simple implementation)
 * In production, you might use a service like LaunchDarkly, ConfigCat, etc.
 */
const featureFlags: Record<string, boolean> = {
  enableBetaFeatures: IS_DEVELOPMENT,
  enableDebugMode: IS_DEVELOPMENT,
  enableErrorReporting: IS_PRODUCTION,
  enableAnalytics: IS_PRODUCTION,
};

export function isFeatureEnabled(featureName: string): boolean {
  return featureFlags[featureName] ?? false;
}

/**
 * Rate limiting helper (client-side)
 * Prevents excessive API calls
 */
export class RateLimiter {
  private callTimes: number[] = [];
  
  constructor(
    private maxCalls: number,
    private windowMs: number
  ) {}

  canMakeCall(): boolean {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    
    // Remove old calls outside the window
    this.callTimes = this.callTimes.filter(time => time > windowStart);
    
    // Check if we're under the limit
    if (this.callTimes.length < this.maxCalls) {
      this.callTimes.push(now);
      return true;
    }
    
    return false;
  }

  getTimeUntilNextCall(): number {
    if (this.callTimes.length === 0) return 0;
    
    const oldestCall = this.callTimes[0];
    const windowStart = Date.now() - this.windowMs;
    
    if (oldestCall <= windowStart) return 0;
    
    return oldestCall - windowStart;
  }
}

/**
 * Retry logic for failed operations
 */
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  baseDelayMs: number = 1000
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt < maxRetries - 1) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        logger.warn(`Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error('Operation failed after retries');
}

/**
 * Validate environment variables
 */
export function validateEnvironment() {
  const requiredVars = [
    'VITE_SUPABASE_URL',
    'VITE_SUPABASE_ANON_KEY',
  ];

  const missing = requiredVars.filter(
    varName => !import.meta.env[varName]
  );

  if (missing.length > 0) {
    logger.error('Missing required environment variables:', missing);
    
    if (IS_PRODUCTION) {
      throw new Error(
        `Missing required environment variables: ${missing.join(', ')}`
      );
    }
  }
}

/**
 * Get application version from package.json
 */
export function getAppVersion(): string {
  return import.meta.env.VITE_APP_VERSION || '1.0.0';
}

/**
 * Check if app needs update (compare versions)
 */
export async function checkForUpdates(): Promise<boolean> {
  if (IS_DEVELOPMENT) return false;

  try {
    const response = await fetch('/version.json');
    const { version } = await response.json();
    const currentVersion = getAppVersion();
    
    return version !== currentVersion;
  } catch (error) {
    logger.warn('Failed to check for updates:', error);
    return false;
  }
}
