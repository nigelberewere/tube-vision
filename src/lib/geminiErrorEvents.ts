export const GEMINI_USER_ERROR_EVENT = 'janso:gemini-user-error';

export interface GeminiUserErrorDetail {
  message: string;
  requiresApiKey?: boolean;
}

export function emitGeminiUserError(detail: GeminiUserErrorDetail): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new CustomEvent<GeminiUserErrorDetail>(GEMINI_USER_ERROR_EVENT, { detail }));
}

export function messageRequiresApiKey(message: string): boolean {
  const normalized = String(message || '').toLowerCase();
  return (
    normalized.includes('api key') &&
    (normalized.includes('settings') || normalized.includes('missing') || normalized.includes('required'))
  );
}
