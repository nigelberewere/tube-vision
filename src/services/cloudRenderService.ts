const cloudRenderBaseUrl = (import.meta.env.VITE_CLOUD_RENDER_URL || '').trim();

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

export async function renderYouTubeShort(request: RenderRequest): Promise<string> {
  const baseUrl = getCloudRenderBaseUrl();

  const response = await fetch(`${baseUrl}/render`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    let message = 'Cloud renderer failed to render this clip.';
    try {
      const payload = await response.json();
      if (payload?.error) {
        message = String(payload.error);
      }
    } catch {
      // Keep fallback message.
    }
    throw new Error(message);
  }

  const blob = await response.blob();
  return URL.createObjectURL(blob);
}
