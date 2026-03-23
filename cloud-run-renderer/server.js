import cors from 'cors';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const app = express();
const port = Number(process.env.PORT || 8080);
const corsOrigin = process.env.CORS_ORIGIN || '*';
const maxSeconds = Number(process.env.MAX_CLIP_SECONDS || 65);
const ytDlpCookiesBase64 = String(process.env.YTDLP_COOKIES_B64 || '').trim();

function normalizeOrigin(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';

  try {
    return new URL(trimmed).origin;
  } catch {
    try {
      return new URL(`https://${trimmed}`).origin;
    } catch {
      return '';
    }
  }
}

const configuredOrigins = corsOrigin === '*'
  ? ['*']
  : Array.from(
      new Set(
        [
          ...corsOrigin.split(',').map(normalizeOrigin),
          'https://app.janso.studio',
          'https://janso.studio',
          'https://www.janso.studio',
        ].filter(Boolean),
      ),
    );

const corsOptions = {
  origin(origin, callback) {
    if (!origin || configuredOrigins.includes('*')) {
      callback(null, true);
      return;
    }

    const normalizedOrigin = normalizeOrigin(origin);
    if (normalizedOrigin && configuredOrigins.includes(normalizedOrigin)) {
      callback(null, true);
      return;
    }

    callback(new Error(`Origin ${origin} is not allowed by CORS`));
  },
  methods: ['GET', 'HEAD', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
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

function inspectBinary(command, versionArgs = ['--version']) {
  const result = spawnSync(command, versionArgs, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const output = String(result.stdout || result.stderr || '').trim();
  const firstLine = output.split(/\r?\n/).find(Boolean) || '';

  return {
    command,
    available: !result.error && result.status === 0,
    version: firstLine,
    error:
      result.error?.code ||
      result.error?.message ||
      (result.status && result.status !== 0 ? `${command} exited with ${result.status}` : ''),
  };
}

function getRuntimeDiagnostics() {
  const ytDlp = inspectBinary('yt-dlp');
  const ffmpeg = inspectBinary('ffmpeg', ['-version']);

  return {
    ok: ytDlp.available && ffmpeg.available,
    cookiesConfigured: Boolean(ytDlpCookiesBase64),
    ytDlp,
    ffmpeg,
  };
}

function getMissingDependencyMessage(diagnostics) {
  const missing = [diagnostics.ytDlp, diagnostics.ffmpeg].filter((item) => !item.available);
  if (missing.length === 0) {
    return '';
  }

  const summary = missing
    .map((item) => `${item.command}${item.error ? ` (${item.error})` : ''}`)
    .join(', ');

  return `Cloud renderer is missing required runtime dependencies: ${summary}. Deploy the renderer from cloud-run-renderer/Dockerfile or install ffmpeg and yt-dlp in the Render service environment.`;
}

const YTDLP_FORMAT_STRATEGIES = [
  'bestvideo*+bestaudio/best',
  'bestvideo+bestaudio/best',
  'best[ext=mp4]/best',
  'best',
];

const YTDLP_EXTRACTOR_STRATEGIES = [
  'youtube:player_client=android,tv,ios;player_skip=webpage,configs',
  'youtube:player_client=android,tv_simply_embedded,ios;player_skip=webpage,configs',
  'youtube:player_client=android,ios;player_skip=webpage',
  'youtube:player_client=android_creator,tv_simply_embedded,ios',
  'youtube:player_client=android,web,tv,ios',
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isFormatUnavailableError(error) {
  const raw = String(error?.stderr || error?.stdout || error?.message || '').toLowerCase();
  return (
    raw.includes('requested format is not available') ||
    raw.includes('no video formats found') ||
    raw.includes('format is not available')
  );
}

function isPageReloadError(error) {
  const raw = String(error?.stderr || error?.stdout || error?.message || '').toLowerCase();
  return raw.includes('the page needs to be reloaded');
}

function isPlayerResponseExtractionError(error) {
  const raw = String(error?.stderr || error?.stdout || error?.message || '').toLowerCase();
  return (
    raw.includes('failed to extract any player response') ||
    raw.includes('unable to extract initial player response') ||
    raw.includes('player response') && raw.includes('git.io/yt-dlp-bug')
  );
}

async function downloadYouTubeSource({ youtubeUrl, inputPath, cookiesPath }) {
  const baseArgs = [
    '--no-warnings',
    '--no-playlist',
    '--extractor-retries', '3',
    '--add-header', 'User-Agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    '--add-header', 'Accept-Language:en-US,en;q=0.9',
    '--merge-output-format', 'mp4',
  ];

  if (cookiesPath && existsSync(cookiesPath)) {
    baseArgs.push('--cookies', cookiesPath);
  }

  let lastError = null;

  for (const extractorArgs of YTDLP_EXTRACTOR_STRATEGIES) {
    let shouldTryNextExtractorStrategy = false;

    for (const formatSelector of YTDLP_FORMAT_STRATEGIES) {
      const args = [...baseArgs, '--extractor-args', extractorArgs, '-f', formatSelector, '-o', inputPath, youtubeUrl];

      try {
        await runCommand('yt-dlp', args);
        return;
      } catch (error) {
        lastError = error;
        await fs.rm(inputPath, { force: true }).catch(() => {});

        if (isPlayerResponseExtractionError(error)) {
          shouldTryNextExtractorStrategy = true;
          await sleep(1000);
          break;
        }

        if (isPageReloadError(error)) {
          shouldTryNextExtractorStrategy = true;
          await sleep(1000);
          break;
        }

        if (!isFormatUnavailableError(error)) {
          throw error;
        }
      }
    }

    if (shouldTryNextExtractorStrategy) {
      continue;
    }

    // Safety net for this extractor strategy: let yt-dlp auto-negotiate without an explicit format selector.
    try {
      const args = [...baseArgs, '--extractor-args', extractorArgs, '-o', inputPath, youtubeUrl];
      await runCommand('yt-dlp', args);
      return;
    } catch (error) {
      lastError = error;
      await fs.rm(inputPath, { force: true }).catch(() => {});

      if (isPlayerResponseExtractionError(error)) {
        await sleep(1000);
        continue;
      }

      if (isPageReloadError(error)) {
        await sleep(1000);
        continue;
      }
    }
  }

  throw lastError || new Error('yt-dlp could not download a playable source.');
}

function buildRendererError(error) {
  const raw = String(error?.stderr || error?.stdout || error?.message || '').trim();
  const normalized = raw.toLowerCase();

  if (
    error?.code === 'ENOENT' ||
    error?.code === 'EPERM' ||
    normalized.includes('spawn yt-dlp') ||
    normalized.includes('spawn ffmpeg')
  ) {
    return {
      status: 503,
      message:
        'Cloud renderer runtime is missing ffmpeg or yt-dlp. Redeploy the renderer using cloud-run-renderer/Dockerfile and verify both binaries are installed.',
      detail: raw.slice(0, 1200),
    };
  }

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

  if (
    normalized.includes('requested format is not available') ||
    normalized.includes('no video formats found')
  ) {
    return {
      status: 422,
      message:
        'Cloud worker could not find a downloadable format for this video. Retry shortly or try a different source video.',
      detail: raw.slice(0, 1200),
    };
  }

  if (normalized.includes('the page needs to be reloaded')) {
    return {
      status: 503,
      message:
        'YouTube returned a transient extraction response for this video. Retry in a moment. If it keeps failing, configure YTDLP_COOKIES_B64 on the renderer service and redeploy.',
      detail: raw.slice(0, 1200),
    };
  }

  if (isPlayerResponseExtractionError(error)) {
    return {
      status: 503,
      message:
        'yt-dlp could not parse YouTube player data for this video. Redeploy the renderer with the latest yt-dlp nightly build, then retry. If it still fails, refresh YTDLP_COOKIES_B64 as well.',
      detail: raw.slice(0, 1200),
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
  const diagnostics = getRuntimeDiagnostics();
  res.status(diagnostics.ok ? 200 : 503).json(diagnostics);
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
    const diagnostics = getRuntimeDiagnostics();
    if (!diagnostics.ok) {
      return res.status(503).json({
        error: getMissingDependencyMessage(diagnostics),
        detail: diagnostics,
      });
    }

    await fs.mkdir(tempDir, { recursive: true });
    let hasCookies = false;
    if (ytDlpCookiesBase64) {
      try {
        const cookieText = Buffer.from(ytDlpCookiesBase64, 'base64').toString('utf8');
        await fs.writeFile(cookiesPath, cookieText, 'utf8');
        hasCookies = true;
      } catch {
        console.warn('YTDLP_COOKIES_B64 is set but could not be decoded as base64. Continuing without cookies.');
      }
    }

    await downloadYouTubeSource({
      youtubeUrl,
      inputPath,
      cookiesPath: hasCookies ? cookiesPath : '',
    });

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

app.listen(port, '0.0.0.0', () => {
  console.log(`Cloud renderer listening on 0.0.0.0:${port}`);
});
