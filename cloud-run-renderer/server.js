import cors from 'cors';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const app = express();
const port = Number(process.env.PORT || 8080);
const corsOrigin = process.env.CORS_ORIGIN || '*';
const maxSeconds = Number(process.env.MAX_CLIP_SECONDS || 65);
const ytDlpCookiesBase64 = String(process.env.YTDLP_COOKIES_B64 || '').trim();

app.use(cors({ origin: corsOrigin === '*' ? true : corsOrigin.split(',').map((v) => v.trim()) }));
app.use(express.json({ limit: '1mb' }));

function parseTimeToSeconds(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) throw new Error('Time is required');

  const parts = trimmed.split(':').map((part) => Number(part));
  if (parts.some((n) => Number.isNaN(n) || n < 0)) {
    throw new Error(`Invalid time format: ${value}`);
  }

  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];

  throw new Error(`Invalid time format: ${value}`);
}

function runCommand(command, args, timeoutMs = 20 * 60 * 1000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';

    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`${command} timed out`));
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    child.on('close', (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        const error = new Error(`${command} exited with ${code}`);
        error.command = command;
        error.exitCode = code;
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
      }
    });
  });
}

function buildRendererError(error) {
  const raw = String(error?.stderr || error?.stdout || error?.message || '').trim();
  const normalized = raw.toLowerCase();

  if (
    normalized.includes("sign in to confirm you're not a bot") ||
    normalized.includes('sign in to confirm you’re not a bot')
  ) {
    return {
      status: 503,
      message:
        'YouTube requested anti-bot verification for this video. Configure YTDLP_COOKIES_B64 on the renderer service, redeploy, and retry.',
      detail: 'Anti-bot challenge from YouTube',
    };
  }

  if (normalized.includes('private video')) {
    return {
      status: 403,
      message: 'This video is private and cannot be rendered by the cloud worker.',
      detail: 'Private video',
    };
  }

  if (normalized.includes('video unavailable')) {
    return {
      status: 404,
      message: 'The video is unavailable or blocked in the renderer region.',
      detail: 'Video unavailable',
    };
  }

  return {
    status: 500,
    message: 'Failed to render short clip in cloud worker.',
    detail: raw.slice(0, 1200),
  };
}

function isSupportedYouTubeUrl(url) {
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname === 'youtube.com' ||
      parsed.hostname === 'www.youtube.com' ||
      parsed.hostname === 'm.youtube.com' ||
      parsed.hostname === 'youtu.be'
    );
  } catch {
    return false;
  }
}

app.get('/health', (_req, res) => {
  res.json({ ok: true, cookiesConfigured: Boolean(ytDlpCookiesBase64) });
});

app.post('/render', async (req, res) => {
  const youtubeUrl = String(req.body?.youtubeUrl || '').trim();
  const startTime = String(req.body?.startTime || '').trim();
  const endTime = String(req.body?.endTime || '').trim();

  if (!youtubeUrl || !startTime || !endTime) {
    return res.status(400).json({ error: 'youtubeUrl, startTime, and endTime are required.' });
  }

  if (!isSupportedYouTubeUrl(youtubeUrl)) {
    return res.status(400).json({ error: 'Only YouTube URLs are supported.' });
  }

  let startSec;
  let endSec;
  try {
    startSec = parseTimeToSeconds(startTime);
    endSec = parseTimeToSeconds(endTime);
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Invalid timestamp format.' });
  }

  if (endSec <= startSec) {
    return res.status(400).json({ error: 'endTime must be greater than startTime.' });
  }

  const durationSec = endSec - startSec;
  if (durationSec > maxSeconds) {
    return res.status(400).json({ error: `Clip duration exceeds ${maxSeconds} seconds.` });
  }

  const tempDir = path.join(os.tmpdir(), `render-${randomUUID()}`);
  const inputPath = path.join(tempDir, 'input.mp4');
  const outputPath = path.join(tempDir, 'short.mp4');
  const cookiesPath = path.join(tempDir, 'cookies.txt');

  try {
    await fs.mkdir(tempDir, { recursive: true });

    const ytDlpArgs = [
      '--no-warnings',
      '--no-playlist',
      '--extractor-args', 'youtube:player_client=android,web',
      '--add-header', 'User-Agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      '--add-header', 'Accept-Language:en-US,en;q=0.9',
      '--merge-output-format', 'mp4',
      '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
      '-o', inputPath,
    ];

    if (ytDlpCookiesBase64) {
      try {
        const cookieText = Buffer.from(ytDlpCookiesBase64, 'base64').toString('utf8');
        await fs.writeFile(cookiesPath, cookieText, 'utf8');
        ytDlpArgs.push('--cookies', cookiesPath);
      } catch {
        console.warn('YTDLP_COOKIES_B64 is set but could not be decoded as base64. Continuing without cookies.');
      }
    }

    ytDlpArgs.push(youtubeUrl);

    await runCommand('yt-dlp', ytDlpArgs);

    await runCommand('ffmpeg', [
      '-hide_banner',
      '-loglevel', 'error',
      '-ss', String(startSec),
      '-i', inputPath,
      '-t', String(durationSec),
      '-vf', 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1',
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '22',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-movflags', '+faststart',
      '-y',
      outputPath,
    ]);

    if (!existsSync(outputPath)) {
      throw new Error('Renderer produced no output file');
    }

    const file = await fs.readFile(outputPath);
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', 'inline; filename="short.mp4"');
    res.setHeader('Cache-Control', 'no-store');
    return res.send(file);
  } catch (error) {
    console.error('Render error:', error);
    const formatted = buildRendererError(error);
    return res.status(formatted.status).json({
      error: formatted.message,
      detail: formatted.detail,
    });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
});

app.listen(port, () => {
  console.log(`Cloud renderer listening on port ${port}`);
});
