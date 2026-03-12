const cloudRenderBaseUrl = (import.meta.env.VITE_CLOUD_RENDER_URL || '').trim();
const RENDER_TIMEOUT_MS = 8 * 60 * 1000;
const RETRY_DELAY_MS = 7000;
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

interface RenderRequest {
  youtubeUrl: string;
  startTime: string;
  endTime: string;
}

export function isCloudRenderConfigured(): boolean {
  return Boolean(cloudRenderBaseUrl);
}

function getCloudRenderBaseUrl(): string {
  if (!cloudRenderBaseUrl) {
    throw new Error('Cloud renderer is not configured. Set VITE_CLOUD_RENDER_URL and redeploy.');
  }
  return cloudRenderBaseUrl.replace(/\/+$/, '');
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const payload = await response.json();
    if (payload?.error) {
      return String(payload.error);
    }
  } catch {
    // Keep fallback.
  }
  return fallback;
}

export async function warmCloudRenderer(): Promise<boolean> {
  const baseUrl = getCloudRenderBaseUrl();

  try {
    const response = await fetch(`${baseUrl}/health`, {
      method: 'GET',
      cache: 'no-store',
    });

    return response.ok;
  } catch {
    return false;
  }
}

export async function renderYouTubeShort(request: RenderRequest): Promise<string> {
  const baseUrl = getCloudRenderBaseUrl();

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), RENDER_TIMEOUT_MS);

    try {
      const response = await fetch(`${baseUrl}/render`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      if (!response.ok) {
        const message = await readErrorMessage(response, 'Cloud renderer failed to render this clip.');
        const error = new Error(message);

        if (attempt < 2 && RETRYABLE_STATUS.has(response.status)) {
          lastError = error;
          await sleep(RETRY_DELAY_MS);
          continue;
        }

        throw error;
      }

      const blob = await response.blob();
      return URL.createObjectURL(blob);
    } catch (error: any) {
      const isAbortError = error?.name === 'AbortError';
      const message = isAbortError
        ? 'Renderer timed out while processing this clip. Try a shorter range or retry.'
        : String(error?.message || 'Cloud renderer request failed.');

      lastError = new Error(message);
      if (attempt < 2) {
        await sleep(RETRY_DELAY_MS);
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError || new Error('Cloud renderer failed to render this clip.');
}
