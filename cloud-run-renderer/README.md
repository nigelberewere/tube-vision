# Cloud Renderer Deployment

This service powers `Render Short (Cloud)` for URL and channel-based Shorts rendering.

## Required runtime

The renderer must run with:

- `node` 20+
- `ffmpeg`
- `yt-dlp`

The provided [Dockerfile](/c:/Users/nigel/projects/vid-vision/cloud-run-renderer/Dockerfile) installs all required dependencies and pulls yt-dlp from the nightly channel, which is often needed when YouTube changes its player responses. If you deploy this service on Render, use a Docker web service rooted at [cloud-run-renderer](/c:/Users/nigel/projects/vid-vision/cloud-run-renderer) so both binaries are available at runtime.

## Environment variables

- `PORT`
- `CORS_ORIGIN`
- `MAX_CLIP_SECONDS`
- `YTDLP_COOKIES_B64` optional, but recommended for videos that trigger YouTube anti-bot checks

On Render, the service must bind to the provided `PORT` on `0.0.0.0`. The server is configured to do this explicitly.

## Health check

`GET /health` now reports whether `ffmpeg` and `yt-dlp` are actually available. A healthy response looks like:

```json
{
  "ok": true,
  "cookiesConfigured": false,
  "ytDlp": {
    "command": "yt-dlp",
    "available": true,
    "version": "2026.03.20"
  },
  "ffmpeg": {
    "command": "ffmpeg",
    "available": true,
    "version": "ffmpeg version ..."
  }
}
```

If `ok` is `false`, the Render service is misconfigured and `/render` will fail until the missing dependency is installed.
