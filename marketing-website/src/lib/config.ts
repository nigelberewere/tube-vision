/**
 * Configuration and environment utilities for Tube Vision marketing site
 * Handles dashboard URL resolution and integration settings
 */

/**
 * Get the dashboard URL with fallback to localhost
 * Used for OAuth redirects and internal navigation
 */
export function getDashboardUrl(): string {
  return import.meta.env.VITE_DASHBOARD_URL || "http://localhost:3000";
}

/**
 * Build an auth URL that redirects users to the dashboard OAuth flow
 * The dashboard handles the rest of the authentication
 */
export function getAuthUrl(provider: "youtube" = "youtube"): string {
  const baseUrl = getDashboardUrl();
  return `${baseUrl}/auth/${provider}`;
}

/**
 * Normalize a URL to ensure it has proper protocol
 * Handles both relative and absolute URLs
 */
export function normalizeUrl(url: string): string {
  if (!url) return getDashboardUrl();
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }
  return url;
}

/**
 * Get environment-specific configuration
 */
export const config = {
  dashboardUrl: getDashboardUrl(),
  docsUrl: "https://docs.tubevision.ai",
  contactEmail: "hello@tubevision.ai",
  companyName: "Tube Vision",
  socialLinks: {
    youtube: "https://youtube.com/@tubevision",
    github: "https://github.com/tubevision",
    x: "https://x.com/tubevision"
  }
};
