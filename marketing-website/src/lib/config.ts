/**
 * Configuration and environment utilities for Janso Studio marketing site
 * Handles dashboard URL resolution and integration settings
 */

/**
 * Get the dashboard URL with environment-aware fallback
 * Used for OAuth redirects and internal navigation
 */
export function getDashboardUrl(): string {
  const configuredUrl = import.meta.env.VITE_DASHBOARD_URL?.trim();
  if (configuredUrl) return configuredUrl;

  const isLocalHost =
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");

  return isLocalHost ? "http://localhost:3000" : "https://app.janso.studio";
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
  docsUrl: "https://docs.janso.studio",
  contactEmail: "support@janso.studio",
  companyName: "Janso Studio",
  socialLinks: {
    youtube: "https://youtube.com/@jansostudio",
    github: "https://github.com/jansostudio",
    x: "https://x.com/jansostudio"
  }
};

