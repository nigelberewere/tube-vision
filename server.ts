import express from "express";
import { OAuth2Client } from "google-auth-library";
import cookieParser from "cookie-parser";
import session from "express-session";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import net from "net";
import multer from "multer";
import { GoogleGenAI, Type } from "@google/genai";
import fs from "fs";
import youtubedl from "youtube-dl-exec";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load local-first env files so dev credentials in .env.local are picked up.
dotenv.config({ path: path.join(__dirname, ".env.local") });
dotenv.config({ path: path.join(__dirname, ".env") });

const upload = multer({ dest: 'uploads/' });

const DEFAULT_PORT = Number(process.env.PORT || 3000);
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const SHORTS_MAX_SECONDS = 61;
const LONG_FORM_MIN_SECONDS = 120;
const IS_PRODUCTION = process.env.NODE_ENV === "production";

function isMissingConfigValue(value?: string): boolean {
  if (!value || !value.trim()) return true;
  const normalized = value.trim().toLowerCase();
  return (
    normalized.includes("your_google_client") ||
    normalized.includes("placeholder") ||
    normalized.includes("changeme")
  );
}

const OAUTH_MISSING_VARS = [
  ["GOOGLE_CLIENT_ID", GOOGLE_CLIENT_ID],
  ["GOOGLE_CLIENT_SECRET", GOOGLE_CLIENT_SECRET],
].filter(([, value]) => isMissingConfigValue(value as string)).map(([name]) => name);

function parseISODurationToSeconds(duration: string): number {
  if (!duration) return 0;

  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;

  const hours = Number(match[1] || 0);
  const minutes = Number(match[2] || 0);
  const seconds = Number(match[3] || 0);
  return hours * 3600 + minutes * 60 + seconds;
}

function formatDurationLabel(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function toNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

type CreateAppOptions = {
  includeFrontend?: boolean;
  port?: number;
};

function getSessionAccountsAndActiveIndex(req: express.Request) {
  const session = req.session as any;
  const rawAccounts = Array.isArray(session.accounts)
    ? session.accounts
    : session.user
      ? [session.user]
      : [];

  let activeIndex = Number.isInteger(session.activeAccountIndex) ? session.activeAccountIndex : 0;
  if (rawAccounts.length === 0) {
    activeIndex = 0;
  } else if (activeIndex < 0 || activeIndex >= rawAccounts.length) {
    activeIndex = 0;
  }

  return { session, accounts: rawAccounts, activeIndex };
}

function setSessionAccountsAndActiveIndex(req: express.Request, accounts: any[], activeIndex: number) {
  const session = req.session as any;
  if (!Array.isArray(accounts) || accounts.length === 0) {
    session.accounts = [];
    session.activeAccountIndex = 0;
    delete session.user;
    return;
  }

  const normalizedIndex = Math.min(Math.max(activeIndex, 0), accounts.length - 1);
  session.accounts = accounts;
  session.activeAccountIndex = normalizedIndex;
  session.user = accounts[normalizedIndex];
}

export async function createApp(options: CreateAppOptions = {}) {
  const { includeFrontend = true, port = DEFAULT_PORT } = options;
  const app = express();
  const appUrl = process.env.APP_URL || `http://localhost:${port}`;
  const redirectUri = `${appUrl}/auth/google/callback`;

  if (OAUTH_MISSING_VARS.length > 0) {
    console.warn(`Missing OAuth env vars: ${OAUTH_MISSING_VARS.join(", ")}. Update .env.local before connecting YouTube.`);
  }

  console.log(`[OAuth Config] APP_URL: ${appUrl}`);
  console.log(`[OAuth Config] REDIRECT_URI: ${redirectUri}`);
  console.log(`[OAuth Config] NODE_ENV: ${IS_PRODUCTION ? 'production' : 'development'}`);

  // Create uploads directory if it doesn't exist
  if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
  }

  // Headers for SharedArrayBuffer (ffmpeg.wasm) and CORS
  app.use((req, res, next) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    next();
  });

  // Serve uploads directory
  app.use('/uploads', express.static('uploads'));

  app.use(cookieParser());
  app.use(express.json());
  app.use(
    session({
      secret: process.env.SESSION_SECRET || "tube-vision-secret",
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: IS_PRODUCTION,
        sameSite: IS_PRODUCTION ? "none" : "lax",
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000, // 1 day
      },
    })
  );

  const oauth2Client = new OAuth2Client(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    redirectUri
  );

  // Viral Clip Analyzer Endpoint
  app.post('/api/analyze', upload.single('video'), async (req, res) => {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      let filePath = '';
      let mimeType = 'video/mp4';
      let videoUrl = '';

      if (req.file) {
        filePath = req.file.path;
        mimeType = req.file.mimetype;
        videoUrl = `/uploads/${req.file.filename}`;
      } else if (req.body.videoId) {
        const user = (req.session as any).user;
        if (!user || !user.tokens) {
          return res.status(401).json({ error: 'Not authenticated' });
        }

        const videoId = String(req.body.videoId).trim();
        if (!videoId) {
          return res.status(400).json({ error: 'Invalid channel video id' });
        }

        const url = `https://www.youtube.com/watch?v=${videoId}`;
        const filename = `my-video-${videoId}-${Date.now()}.mp4`;
        filePath = path.join('uploads', filename);
        videoUrl = `/uploads/${filename}`;

        console.log(`Downloading connected channel video: ${url}`);
        try {
          await youtubedl(url, {
            output: filePath,
            format: 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
            noCheckCertificates: true,
            noWarnings: true,
            preferFreeFormats: true,
            addHeader: [
              'referer:https://www.google.com/',
              'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            ],
          });
        } catch (dlError: any) {
          console.error('Connected channel video download error:', dlError.message);
          if (dlError.message?.includes('Sign in to confirm you\'re not a bot')) {
            throw new Error('YouTube blocked auto-download for this video. Upload the MP4 manually as fallback.');
          }
          throw dlError;
        }
      } else if (req.body.youtubeUrl) {
        const url = req.body.youtubeUrl;
        const filename = `yt-${Date.now()}.mp4`;
        filePath = path.join('uploads', filename);
        videoUrl = `/uploads/${filename}`;
        
        console.log(`Downloading YouTube video: ${url}`);
        try {
          await youtubedl(url, {
            output: filePath,
            format: 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
            noCheckCertificates: true,
            noWarnings: true,
            preferFreeFormats: true,
            addHeader: [
              'referer:https://www.google.com/',
              'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            ],
          });
        } catch (dlError: any) {
          console.error('YouTube download error:', dlError.message);
          if (dlError.message.includes('Sign in to confirm you\'re not a bot')) {
            throw new Error('YouTube is blocking this request. Please download the video manually and use the "Upload File" option.');
          }
          throw dlError;
        }
      } else {
        return res.status(400).json({ error: 'No video provided' });
      }

      console.log(`Uploading file ${filePath} to Gemini...`);
      const uploadResult = await ai.files.upload({
        file: filePath,
        config: {
          mimeType: mimeType,
        }
      });

      console.log(`File uploaded. Waiting for processing...`);
      let file = await ai.files.get({ name: uploadResult.name });
      while (file.state === 'PROCESSING') {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        file = await ai.files.get({ name: uploadResult.name });
      }

      if (file.state === 'FAILED') {
        throw new Error('Video processing failed in Gemini');
      }

      console.log(`File processed. Generating content...`);
      const systemInstruction = `
You are an expert Video Content Strategist and Viral Editor. Your goal is to analyze long-form videos to identify the most high-impact, standalone segments for social media (TikTok, Reels, YouTube Shorts).

### Analysis Framework
For every video provided, evaluate segments based on:
1. **The Hook (0-3s):** Does it start with a high-stakes statement, a surprising fact, or an emotional peak?
2. **Retentiveness:** Is the point made clearly and concisely without needing the full context of the video?
3. **Emotional Resonance:** Does it provoke curiosity, anger, inspiration, or laughter?
4. **Intrinsic Value:** Does the viewer learn something or feel something by the end of the 60-second clip?

### Tasks
1. **Segment Extraction:** Identify exactly 5 distinct clips.
2. **Timestamps:** Provide precise [MM:SS] to [MM:SS] markers.
3. **Virality Scoring:** Rate each clip 1-100 and explain why.
4. **Social Copy:** Write a "scroll-stopping" headline and 3 relevant hashtags for each clip.
5. **Editing Suggestions:** Suggest where to add B-roll, zoom-ins for emphasis, or specific text overlays.
`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: [
          { fileData: { fileUri: uploadResult.uri, mimeType: uploadResult.mimeType } },
          { text: 'Analyze this video and find 5 viral clips.' }
        ],
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                clipNumber: { type: Type.INTEGER },
                title: { type: Type.STRING },
                startTime: { type: Type.STRING, description: "MM:SS" },
                endTime: { type: Type.STRING, description: "MM:SS" },
                duration: { type: Type.INTEGER, description: "Duration in seconds" },
                score: { type: Type.INTEGER, description: "Score out of 100" },
                rationale: { type: Type.STRING },
                hookText: { type: Type.STRING },
                visualEditNotes: { type: Type.STRING },
                headline: { type: Type.STRING },
                hashtags: { 
                  type: Type.ARRAY,
                  items: { type: Type.STRING }
                }
              },
              required: ["clipNumber", "title", "startTime", "endTime", "duration", "score", "rationale", "hookText", "visualEditNotes", "headline", "hashtags"]
            }
          }
        }
      });

      res.json({ 
        clips: JSON.parse(response.text || '[]'),
        videoUrl: videoUrl
      });
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ error: error.message });
    }
  });

  // OAuth and API Routes
  app.get("/api/auth/config", (req, res) => {
    res.json({
      appUrl,
      redirectUri,
      nodeEnv: process.env.NODE_ENV || 'development',
      hasClientId: Boolean(GOOGLE_CLIENT_ID),
      hasClientSecret: Boolean(GOOGLE_CLIENT_SECRET),
      missingVars: OAUTH_MISSING_VARS,
    });
  });

  app.get("/api/auth/google/url", (req, res) => {
    console.log(`[Auth URL Request] REDIRECT_URI: ${redirectUri}`);
    
    if (OAUTH_MISSING_VARS.length > 0) {
      console.error(`[Auth Error] Missing OAuth vars: ${OAUTH_MISSING_VARS.join(", ")}`);
      return res.status(500).json({
        error: "Google OAuth credentials not configured",
        missingEnv: OAUTH_MISSING_VARS,
      });
    }

    if (!appUrl || appUrl.includes('localhost')) {
      console.warn(`[Auth Warning] APP_URL not properly set for production: ${appUrl}`);
    }

    const url = oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: [
        "https://www.googleapis.com/auth/youtube.readonly",
        "https://www.googleapis.com/auth/yt-analytics.readonly",
        "https://www.googleapis.com/auth/userinfo.profile",
      ],
      prompt: "consent",
    });
    console.log(`[Auth URL Generated] URL contains redirect_uri: ${url.includes(redirectUri)}`);
    res.json({ url });
  });

  app.get(["/auth/google/callback", "/api/auth/google/callback"], async (req, res) => {
    const { code } = req.query;

    if (!code) {
      return res.status(400).send("No code provided");
    }

    try {
      const { tokens } = await oauth2Client.getToken(code as string);
      oauth2Client.setCredentials(tokens);

      // Fetch user profile and channel info
      const userInfoResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      const userInfo = await userInfoResponse.json();

      const youtubeResponse = await fetch(
        "https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true",
        {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        }
      );
      const youtubeData = await youtubeResponse.json();
      const channel = youtubeData.items?.[0];

      const newUserData = {
        id: userInfo.id,
        name: userInfo.name,
        picture: userInfo.picture,
        tokens: tokens,
        channel: channel ? {
          id: channel.id,
          title: channel.snippet.title,
          description: channel.snippet.description,
          thumbnails: channel.snippet.thumbnails,
          statistics: channel.statistics,
        } : null,
      };

      const { accounts } = getSessionAccountsAndActiveIndex(req);
      const dedupedAccounts = accounts.filter((account: any) => account.id !== newUserData.id);
      dedupedAccounts.unshift(newUserData);
      setSessionAccountsAndActiveIndex(req, dedupedAccounts, 0);

      res.send(`
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8">
            <title>Authentication Successful</title>
            <style>
              body {
                margin: 0;
                padding: 20px;
                font-family: system-ui, -apple-system, sans-serif;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                display: flex;
                align-items: center;
                justify-content: center;
                min-height: 100vh;
                text-align: center;
              }
              .container {
                background: rgba(255, 255, 255, 0.1);
                border-radius: 12px;
                padding: 32px;
                backdrop-filter: blur(10px);
              }
              h1 { margin: 0 0 12px 0; font-size: 24px; }
              p { margin: 0; opacity: 0.9; }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>✓ Authentication Successful</h1>
              <p>Closing this window...</p>
            </div>
            <script>
              (function() {
                // Try multiple close strategies
                function closeWindow() {
                  if (window.opener) {
                    try {
                      window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, window.location.origin);
                    } catch (e) {
                      console.error('Failed to post message:', e);
                    }
                    
                    // Try to close immediately
                    window.close();
                    
                    // Fallback: try again after a short delay
                    setTimeout(function() {
                      window.close();
                    }, 100);
                    
                    // If still open after 1 second, redirect to main page
                    setTimeout(function() {
                      if (!window.closed) {
                        window.location.href = '/';
                      }
                    }, 1000);
                  } else {
                    // No opener, just redirect to main page
                    window.location.href = '/';
                  }
                }
                
                // Execute immediately and after DOM is ready
                closeWindow();
                if (document.readyState === 'loading') {
                  document.addEventListener('DOMContentLoaded', closeWindow);
                }
              })();
            </script>
          </body>
        </html>
      `);
    } catch (error) {
      console.error("OAuth error:", error);
      res.status(500).send("Authentication failed");
    }
  });

  app.get("/api/user/accounts", (req, res) => {
    const { accounts, activeIndex } = getSessionAccountsAndActiveIndex(req);

    const safeAccounts = accounts.map((account: any) => {
      const { tokens, ...safe } = account;
      return safe;
    });

    res.json({ accounts: safeAccounts, activeIndex });
  });

  app.post("/api/user/switch", (req, res) => {
    const { accounts } = getSessionAccountsAndActiveIndex(req);
    if (accounts.length === 0) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const index = Number(req.body?.index);
    if (!Number.isInteger(index)) {
      return res.status(400).json({ error: "Invalid index" });
    }

    if (index < 0 || index >= accounts.length) {
      return res.status(400).json({ error: "Index out of range" });
    }

    setSessionAccountsAndActiveIndex(req, accounts, index);
    res.json({ success: true, activeIndex: index });
  });

  app.post("/api/user/remove", (req, res) => {
    const { accounts, activeIndex } = getSessionAccountsAndActiveIndex(req);
    if (accounts.length === 0) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const removeIndex = Number(req.body?.index);
    if (!Number.isInteger(removeIndex)) {
      return res.status(400).json({ error: "Invalid index" });
    }

    if (removeIndex < 0 || removeIndex >= accounts.length) {
      return res.status(400).json({ error: "Index out of range" });
    }

    const updatedAccounts = accounts.filter((_: any, idx: number) => idx !== removeIndex);

    let nextActiveIndex = activeIndex;
    if (updatedAccounts.length === 0) {
      nextActiveIndex = 0;
    } else if (activeIndex === removeIndex) {
      nextActiveIndex = Math.max(0, removeIndex - 1);
    } else if (activeIndex > removeIndex) {
      nextActiveIndex = activeIndex - 1;
    }

    setSessionAccountsAndActiveIndex(req, updatedAccounts, nextActiveIndex);
    res.json({ success: true, activeIndex: nextActiveIndex });
  });

  app.get("/api/user/channel", (req, res) => {
    const { accounts, activeIndex } = getSessionAccountsAndActiveIndex(req);
    const user = accounts[activeIndex];
    if (!user) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    // Don't send tokens back to client
    const { tokens, ...safeUser } = user;
    res.json(safeUser);
  });

  app.get("/api/user/videos", async (req, res) => {
    const user = (req.session as any).user;
    if (!user || !user.tokens) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    try {
      const response = await fetch(
        "https://www.googleapis.com/youtube/v3/search?part=snippet&forMine=true&type=video&maxResults=50&order=date",
        {
          headers: { Authorization: `Bearer ${user.tokens.access_token}` },
        }
      );
      const data = await response.json();
      
      // Fetch detailed statistics for each video
      const videoIds = data.items?.map((item: any) => item.id.videoId).join(",");
      if (videoIds) {
        const statsResponse = await fetch(
          `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${videoIds}`,
          {
            headers: { Authorization: `Bearer ${user.tokens.access_token}` },
          }
        );
        const statsData = await statsResponse.json();
        return res.json(statsData.items);
      }
      
      res.json([]);
    } catch (error) {
      console.error("Fetch videos error:", error);
      res.status(500).json({ error: "Failed to fetch videos" });
    }
  });

  app.get("/api/thumbnails/authorizations", (req, res) => {
    const user = (req.session as any).user;
    if (!user || !user.tokens) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const queue = (req.session as any).thumbnailAuthorizations || [];
    res.json(queue);
  });

  app.post("/api/thumbnails/authorize", (req, res) => {
    const user = (req.session as any).user;
    if (!user || !user.tokens) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const {
      videoId,
      videoTitle,
      currentThumbnailUrl,
      proposedTextOverlay,
      titleTreatment,
      layoutDescription,
      colorDirection,
      thumbnailImagePrompt,
      projectedCtrLiftPercent,
      swapPriority,
    } = req.body || {};

    if (!videoId || !videoTitle) {
      return res.status(400).json({ error: "videoId and videoTitle are required" });
    }

    const queue = ((req.session as any).thumbnailAuthorizations || []) as any[];
    const existingIndex = queue.findIndex((item) => item.videoId === videoId);
    const payload = {
      videoId,
      videoTitle,
      currentThumbnailUrl: currentThumbnailUrl || "",
      proposedTextOverlay: proposedTextOverlay || "",
      titleTreatment: titleTreatment || "",
      layoutDescription: layoutDescription || "",
      colorDirection: colorDirection || "",
      thumbnailImagePrompt: thumbnailImagePrompt || "",
      projectedCtrLiftPercent: Number(projectedCtrLiftPercent || 0),
      swapPriority: Number(swapPriority || 50),
      status: "authorized",
      approvedAt: new Date().toISOString(),
    };

    if (existingIndex >= 0) {
      queue[existingIndex] = payload;
    } else {
      queue.push(payload);
    }

    (req.session as any).thumbnailAuthorizations = queue;
    res.json({ success: true, item: payload, count: queue.length, queue });
  });

  app.post("/api/thumbnails/authorize/clear", (req, res) => {
    const user = (req.session as any).user;
    if (!user || !user.tokens) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    (req.session as any).thumbnailAuthorizations = [];
    res.json({ success: true, count: 0, queue: [] });
  });

  app.get("/api/shorts/my-long-videos", async (req, res) => {
    const user = (req.session as any).user;
    if (!user || !user.tokens) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    try {
      const searchResponse = await fetch(
        "https://www.googleapis.com/youtube/v3/search?part=snippet&forMine=true&type=video&maxResults=50&order=date",
        {
          headers: { Authorization: `Bearer ${user.tokens.access_token}` },
        }
      );
      const searchData = await searchResponse.json();
      const videoIds = searchData.items?.map((item: any) => item.id.videoId).filter(Boolean).join(",");

      if (!videoIds) {
        return res.json([]);
      }

      const videosResponse = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${videoIds}`,
        {
          headers: { Authorization: `Bearer ${user.tokens.access_token}` },
        }
      );
      const videosData = await videosResponse.json();

      const longFormVideos = (videosData.items || [])
        .map((video: any) => {
          const durationSeconds = parseISODurationToSeconds(video.contentDetails?.duration || "");
          return {
            id: video.id,
            title: video.snippet?.title || "Untitled",
            description: video.snippet?.description || "",
            thumbnail:
              video.snippet?.thumbnails?.high?.url ||
              video.snippet?.thumbnails?.medium?.url ||
              video.snippet?.thumbnails?.default?.url ||
              "",
            publishedAt: video.snippet?.publishedAt,
            viewCount: toNumber(video.statistics?.viewCount),
            likeCount: toNumber(video.statistics?.likeCount),
            commentCount: toNumber(video.statistics?.commentCount),
            durationSeconds,
            durationLabel: formatDurationLabel(durationSeconds),
            youtubeUrl: `https://www.youtube.com/watch?v=${video.id}`,
          };
        })
        .filter((video: any) => video.durationSeconds >= LONG_FORM_MIN_SECONDS)
        .sort(
          (a: any, b: any) =>
            new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime()
        );

      res.json(longFormVideos);
    } catch (error) {
      console.error("Fetch long-form videos error:", error);
      res.status(500).json({ error: "Failed to fetch long-form videos" });
    }
  });

  app.get("/api/shorts/niche-high-performers", async (req, res) => {
    const user = (req.session as any).user;
    const query = String(req.query.q || "").trim();

    if (!user || !user.tokens) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    if (!query) {
      return res.status(400).json({ error: "Query is required" });
    }

    try {
      const searchResponse = await fetch(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoDuration=short&maxResults=25&order=viewCount&q=${encodeURIComponent(query)}`,
        {
          headers: { Authorization: `Bearer ${user.tokens.access_token}` },
        }
      );
      const searchData = await searchResponse.json();
      const videoIds = searchData.items?.map((item: any) => item.id.videoId).filter(Boolean).join(",");

      if (!videoIds) {
        return res.json([]);
      }

      const videosResponse = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${videoIds}`,
        {
          headers: { Authorization: `Bearer ${user.tokens.access_token}` },
        }
      );
      const videosData = await videosResponse.json();

      const now = Date.now();
      const performers = (videosData.items || [])
        .map((video: any) => {
          const durationSeconds = parseISODurationToSeconds(video.contentDetails?.duration || "");
          const viewCount = toNumber(video.statistics?.viewCount);
          const likeCount = toNumber(video.statistics?.likeCount);
          const commentCount = toNumber(video.statistics?.commentCount);
          const publishedAt = video.snippet?.publishedAt || new Date().toISOString();
          const ageDays = Math.max(1, (now - new Date(publishedAt).getTime()) / (24 * 60 * 60 * 1000));
          const viewsPerDay = Math.round(viewCount / ageDays);
          const engagementRate = viewCount > 0 ? Number((((likeCount + commentCount) / viewCount) * 100).toFixed(2)) : 0;

          return {
            id: video.id,
            title: video.snippet?.title || "Untitled",
            description: video.snippet?.description || "",
            thumbnail:
              video.snippet?.thumbnails?.high?.url ||
              video.snippet?.thumbnails?.medium?.url ||
              video.snippet?.thumbnails?.default?.url ||
              "",
            channelTitle: video.snippet?.channelTitle || "Unknown Channel",
            publishedAt,
            durationSeconds,
            durationLabel: formatDurationLabel(durationSeconds),
            viewCount,
            likeCount,
            commentCount,
            viewsPerDay,
            engagementRate,
            youtubeUrl: `https://www.youtube.com/watch?v=${video.id}`,
          };
        })
        .filter((video: any) => video.durationSeconds <= SHORTS_MAX_SECONDS)
        .sort((a: any, b: any) => {
          if (b.viewsPerDay !== a.viewsPerDay) return b.viewsPerDay - a.viewsPerDay;
          return b.viewCount - a.viewCount;
        })
        .slice(0, 12);

      res.json(performers);
    } catch (error) {
      console.error("Fetch niche shorts error:", error);
      res.status(500).json({ error: "Failed to fetch high-performing shorts" });
    }
  });

  app.post("/api/shorts/remix-plan", async (req, res) => {
    const user = (req.session as any).user;
    const { niche, source } = req.body || {};

    if (!user || !user.tokens) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    if (!source?.title) {
      return res.status(400).json({ error: "Source short data is required" });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: "Missing GEMINI_API_KEY on server" });
    }

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const prompt = `Build an original YouTube Shorts remix plan for this niche and reference short.

Niche: ${niche || "General"}
Source title: ${source.title}
Source channel: ${source.channelTitle || "Unknown"}
Source url: ${source.youtubeUrl || "N/A"}
Source views: ${source.viewCount || 0}
Source description: ${source.description || ""}

Goals:
- Keep the concept inspiration but avoid copying wording/structure line-by-line.
- Deliver a remix that can be produced from original footage by the creator.
- Optimize for YouTube Shorts retention and replay value.

Return concise, practical recommendations.`;

      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              remixAngle: { type: Type.STRING },
              hook: { type: Type.STRING },
              titleOptions: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              beatByBeatPlan: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              shotIdeas: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              scriptTemplate: { type: Type.STRING },
              cta: { type: Type.STRING },
              hashtagPack: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              originalityGuardrails: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
            },
            required: [
              "remixAngle",
              "hook",
              "titleOptions",
              "beatByBeatPlan",
              "shotIdeas",
              "scriptTemplate",
              "cta",
              "hashtagPack",
              "originalityGuardrails",
            ],
          },
        },
      });

      res.json(JSON.parse(response.text || "{}"));
    } catch (error) {
      console.error("Remix plan generation error:", error);
      res.status(500).json({ error: "Failed to generate remix plan" });
    }
  });

  app.get("/api/competitors/search", async (req, res) => {
    const user = (req.session as any).user;
    const { q } = req.query;
    if (!user || !user.tokens) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    try {
      const response = await fetch(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${q}&maxResults=5`,
        {
          headers: { Authorization: `Bearer ${user.tokens.access_token}` },
        }
      );
      const data = await response.json();
      res.json(data.items);
    } catch (error) {
      console.error("Search competitors error:", error);
      res.status(500).json({ error: "Failed to search competitors" });
    }
  });

  app.get("/api/competitors/videos", async (req, res) => {
    const user = (req.session as any).user;
    const { channelId } = req.query;
    if (!user || !user.tokens) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    try {
      // Get the channel's "uploads" playlist ID
      const channelResponse = await fetch(
        `https://www.googleapis.com/youtube/v3/channels?part=contentDetails,statistics,snippet&id=${channelId}`,
        {
          headers: { Authorization: `Bearer ${user.tokens.access_token}` },
        }
      );
      const channelData = await channelResponse.json();
      const channel = channelData.items?.[0];
      const uploadsPlaylistId = channel?.contentDetails?.relatedPlaylists?.uploads;

      if (!uploadsPlaylistId) {
        return res.status(404).json({ error: "Uploads playlist not found" });
      }

      // Get videos from the uploads playlist
      const playlistResponse = await fetch(
        `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId=${uploadsPlaylistId}&maxResults=20`,
        {
          headers: { Authorization: `Bearer ${user.tokens.access_token}` },
        }
      );
      const playlistData = await playlistResponse.json();
      const videoIds = playlistData.items?.map((item: any) => item.contentDetails.videoId).join(",");

      if (videoIds) {
        const statsResponse = await fetch(
          `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${videoIds}`,
          {
            headers: { Authorization: `Bearer ${user.tokens.access_token}` },
          }
        );
        const statsData = await statsResponse.json();
        
        // Sort by view count to get "most popular"
        const sortedVideos = statsData.items.sort((a: any, b: any) => 
          parseInt(b.statistics.viewCount) - parseInt(a.statistics.viewCount)
        );

        return res.json({
          channel: {
            title: channel.snippet.title,
            description: channel.snippet.description,
            thumbnails: channel.snippet.thumbnails,
            statistics: channel.statistics
          },
          videos: sortedVideos
        });
      }

      res.json({ channel: channel.snippet, videos: [] });
    } catch (error) {
      console.error("Fetch competitor videos error:", error);
      res.status(500).json({ error: "Failed to fetch competitor videos" });
    }
  });

  app.get("/api/user/analytics", async (req, res) => {
    const user = (req.session as any).user;
    if (!user || !user.tokens) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    try {
      const endDate = new Date().toISOString().split("T")[0];
      const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      const yesterdayDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split("T")[0];

      const authHeader = { Authorization: `Bearer ${user.tokens.access_token}` };

      // Fetch daily analytics (always works)
      const reportsResponse = await fetch(
        `https://youtubeanalytics.googleapis.com/v2/reports?ids=channel==MINE&startDate=${startDate}&endDate=${endDate}&metrics=views,subscribersGained,subscribersLost,estimatedMinutesWatched&dimensions=day&sort=day`,
        { headers: authHeader }
      );
      const reportsData = await reportsResponse.json();

      if (reportsData.error) {
        console.error("YouTube Analytics API error:", reportsData.error);
        return res.status(403).json({
          error: reportsData.error.message || "YouTube Analytics API error",
          code: reportsData.error.code,
          details: reportsData.error,
        });
      }

      // Try to fetch hourly data (may not be available for all channels)
      let hourlyData = { rows: [] };
      let todayHourlyData = { rows: [] };
      let yesterdayHourlyData = { rows: [] };

      try {
        const [hourlyResponse, todayHourlyResponse, yesterdayHourlyResponse] = await Promise.all([
          fetch(
            `https://youtubeanalytics.googleapis.com/v2/reports?ids=channel==MINE&startDate=${startDate}&endDate=${endDate}&metrics=views&dimensions=hour&sort=hour`,
            { headers: authHeader }
          ),
          fetch(
            `https://youtubeanalytics.googleapis.com/v2/reports?ids=channel==MINE&startDate=${endDate}&endDate=${endDate}&metrics=views&dimensions=hour&sort=hour`,
            { headers: authHeader }
          ),
          fetch(
            `https://youtubeanalytics.googleapis.com/v2/reports?ids=channel==MINE&startDate=${yesterdayDate}&endDate=${yesterdayDate}&metrics=views&dimensions=hour&sort=hour`,
            { headers: authHeader }
          ),
        ]);

        const hourlyJson = await hourlyResponse.json();
        const todayHourlyJson = await todayHourlyResponse.json();
        const yesterdayHourlyJson = await yesterdayHourlyResponse.json();

        // Only use hourly data if no errors
        if (!hourlyJson.error) hourlyData = hourlyJson;
        if (!todayHourlyJson.error) todayHourlyData = todayHourlyJson;
        if (!yesterdayHourlyJson.error) yesterdayHourlyData = yesterdayHourlyJson;
      } catch (hourlyError) {
        console.log("Hourly analytics not available, continuing with daily data only");
      }

      res.json({
        daily: reportsData,
        hourly: hourlyData,
        todayHourly: todayHourlyData,
        yesterdayHourly: yesterdayHourlyData,
      });
    } catch (error) {
      console.error("Fetch analytics error:", error);
      res.status(500).json({ error: "Failed to fetch analytics" });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ error: "Logout failed" });
      }
      res.clearCookie("connect.sid");
      res.json({ success: true });
    });
  });

  if (includeFrontend) {
    // Vite middleware for development
    if (process.env.NODE_ENV !== "production") {
      const { createServer: createViteServer } = await import("vite");
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
    } else {
      app.use(express.static(path.join(__dirname, "dist")));
      app.get("*", (req, res) => {
        res.sendFile(path.join(__dirname, "dist", "index.html"));
      });
    }
  }

  return app;
}

async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const tester = net
      .createServer()
      .once("error", (error: NodeJS.ErrnoException) => {
        if (error.code === "EADDRINUSE") {
          resolve(false);
        } else {
          resolve(false);
        }
      })
      .once("listening", () => {
        tester.close(() => resolve(true));
      })
      .listen(port, "0.0.0.0");
  });
}

async function findAvailablePort(startPort: number, maxAttempts = 20): Promise<number> {
  for (let offset = 0; offset < maxAttempts; offset += 1) {
    const candidate = startPort + offset;
    if (await isPortAvailable(candidate)) {
      return candidate;
    }
  }

  throw new Error(`Unable to find an open port from ${startPort} to ${startPort + maxAttempts - 1}`);
}

async function startServer() {
  const port = await findAvailablePort(DEFAULT_PORT);

  if (port !== DEFAULT_PORT) {
    console.warn(`[Startup] Port ${DEFAULT_PORT} is in use. Starting on port ${port} instead.`);
    if (process.env.APP_URL) {
      console.warn(`[Startup] APP_URL is set to ${process.env.APP_URL}. Ensure it matches the active local port.`);
    }
  }

  const app = await createApp({ includeFrontend: true, port });

  app.listen(port, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${port}`);
  });
}

if (!process.env.VERCEL) {
  startServer();
}
