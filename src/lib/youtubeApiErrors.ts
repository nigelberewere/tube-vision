type ApiErrorPayload = {
  error?: unknown;
  upstream?: {
    code?: number;
    reason?: string;
    message?: string;
    isQuotaExceeded?: boolean;
  };
};

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}

function sanitizeMessage(rawMessage: unknown, fallbackMessage: string): string {
  const text = typeof rawMessage === 'string' && rawMessage.trim() ? rawMessage : fallbackMessage;
  const decoded = decodeHtmlEntities(text);
  const stripped = decoded.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return stripped || fallbackMessage;
}

export function getFriendlyYouTubeError(payload: ApiErrorPayload, fallbackMessage: string): string {
  const upstreamReason = String(payload?.upstream?.reason || '').toLowerCase();
  const baseMessage = sanitizeMessage(
    payload?.error || payload?.upstream?.message,
    fallbackMessage,
  );

  const isQuotaError =
    Boolean(payload?.upstream?.isQuotaExceeded) ||
    upstreamReason.includes('quota') ||
    /quota/i.test(baseMessage);

  if (isQuotaError) {
    return 'YouTube API quota exceeded for today. Try again after quota reset, or reconnect using a project with higher quota.';
  }

  const isPermissionError =
    payload?.upstream?.code === 403 &&
    (upstreamReason.includes('insufficientpermissions') || upstreamReason.includes('forbidden'));

  if (isPermissionError) {
    return 'Your YouTube account is connected, but required permissions are missing. Reconnect your account to refresh scopes.';
  }

  return baseMessage;
}

export async function parseApiErrorResponse(response: Response, fallbackMessage: string): Promise<string> {
  const payload = (await response.json().catch(() => ({}))) as ApiErrorPayload;
  return getFriendlyYouTubeError(payload, fallbackMessage);
}
