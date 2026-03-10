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
import { supabaseServer, verifyUser } from "./supabaseServer.ts";
import { initializeSnapshotTable, saveChannelSnapshot, getChannelSnapshots, getLatestSnapshot } from "./src/services/snapshotService.ts";

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
const DEFAULT_PRODUCTION_APP_URL = "https://app.janso.studio";

function resolveAppUrl(port: number): string {
  const configuredAppUrl = process.env.APP_URL?.trim();
  if (configuredAppUrl) return configuredAppUrl;
  return IS_PRODUCTION ? DEFAULT_PRODUCTION_APP_URL : `http://localhost:${port}`;
}

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

/**
 * Get Gemini API key from request header (BYOK model)
 * Never logs, persists, or echoes the key
 */
function getGeminiKeyFromRequest(req: express.Request): string {
  const apiKey = req.headers['x-gemini-key'] as string;
  
  if (!apiKey || !apiKey.trim()) {
    throw new Error('Gemini API key required. Please configure your key in Settings.');
  }
  
  return apiKey.trim();
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

const COACH_ALERT_CACHE_TTL_MS = 20 * 60 * 1000;
const COACH_ALERT_LOOKBACK_DAYS = 90;
const COACH_STOP_WORDS = new Set([
  "about", "after", "again", "also", "another", "because", "before", "being", "could", "every", "first",
  "from", "have", "history", "into", "just", "make", "more", "most", "next", "other", "over", "part",
  "really", "should", "some", "than", "that", "their", "there", "these", "they", "this", "those", "through",
  "today", "video", "videos", "what", "when", "where", "which", "while", "with", "your", "youtube", "why",
]);
const coachInsightAlertCache = new Map<string, { expiresAt: number; payload: any }>();

type CoachVideoSignal = {
  id: string;
  title: string;
  publishedAt: string;
  publishedAtMs: number;
  views: number;
  likes: number;
  comments: number;
  retentionPct: number | null;
  signalScore: number;
  tokens: string[];
};

type CoachTopicInsight = {
  topicToken: string;
  topicLabel: string;
  recent: CoachVideoSignal[];
  baseline: CoachVideoSignal[];
  liftPercent: number;
  retentionLiftPercent: number | null;
  usesRetention: boolean;
};

function average(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function toTopicLabel(token: string): string {
  return token
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function extractTopicTokens(title: string): string[] {
  const normalized = String(title || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 4 && !COACH_STOP_WORDS.has(token));

  return [...new Set(normalized)].slice(0, 8);
}

function buildFallbackIdeas(topicLabel: string, channelTitle: string): string[] {
  const audience = channelTitle?.trim() || "your audience";
  return [
    `${topicLabel} myths your viewers still believe in 2026`,
    `${topicLabel}: 3 mistakes ${audience} should avoid this week`,
    `Beginner-to-advanced ${topicLabel} roadmap in one video`,
  ];
}

function pickBestTopicInsight(signals: CoachVideoSignal[]): CoachTopicInsight | null {
  if (signals.length < 6) return null;

  const recentWindow = signals.slice(0, 12);
  const candidateTokens = new Set(recentWindow.flatMap((signal) => signal.tokens));
  let best: CoachTopicInsight | null = null;
  let bestComparisonLift = Number.NEGATIVE_INFINITY;

  for (const token of candidateTokens) {
    const recentMatches = recentWindow.filter((signal) => signal.tokens.includes(token)).slice(0, 3);
    if (recentMatches.length < 3) continue;

    const baselineMatches = signals
      .filter((signal) => signal.tokens.includes(token) && !recentMatches.some((item) => item.id === signal.id))
      .slice(0, 3);

    let baseline = baselineMatches;
    if (baseline.length < 3) {
      baseline = signals
        .filter((signal) => !recentMatches.some((item) => item.id === signal.id))
        .slice(0, 3);
    }
    if (baseline.length < 3) continue;

    const recentSignalAverage = average(recentMatches.map((signal) => signal.signalScore));
    const baselineSignalAverage = average(baseline.map((signal) => signal.signalScore));
    if (baselineSignalAverage <= 0) continue;

    const liftPercent = ((recentSignalAverage - baselineSignalAverage) / baselineSignalAverage) * 100;

    const recentRetentionValues = recentMatches
      .map((signal) => signal.retentionPct)
      .filter((value): value is number => typeof value === "number" && value > 0);
    const baselineRetentionValues = baseline
      .map((signal) => signal.retentionPct)
      .filter((value): value is number => typeof value === "number" && value > 0);

    let retentionLiftPercent: number | null = null;
    let usesRetention = false;

    if (recentRetentionValues.length >= 2 && baselineRetentionValues.length >= 2) {
      const recentRetentionAverage = average(recentRetentionValues);
      const baselineRetentionAverage = average(baselineRetentionValues);
      if (baselineRetentionAverage > 0) {
        retentionLiftPercent = ((recentRetentionAverage - baselineRetentionAverage) / baselineRetentionAverage) * 100;
        usesRetention = true;
      }
    }

    const comparisonLift = usesRetention && retentionLiftPercent !== null ? retentionLiftPercent : liftPercent;
    if (comparisonLift > bestComparisonLift) {
      bestComparisonLift = comparisonLift;
      best = {
        topicToken: token,
        topicLabel: toTopicLabel(token),
        recent: recentMatches,
        baseline,
        liftPercent,
        retentionLiftPercent,
        usesRetention,
      };
    }
  }

  if (!best) return null;

  const bestLift = best.usesRetention && best.retentionLiftPercent !== null
    ? best.retentionLiftPercent
    : best.liftPercent;

  if (bestLift >= 5) {
    return best;
  }

  const fallbackRecent = signals.slice(0, 3);
  const fallbackBaseline = signals.slice(3, 6);
  if (fallbackRecent.length < 3 || fallbackBaseline.length < 3) {
    return null;
  }

  const fallbackToken = fallbackRecent.flatMap((signal) => signal.tokens)[0] || "content";
  const fallbackRecentAvg = average(fallbackRecent.map((signal) => signal.signalScore));
  const fallbackBaselineAvg = average(fallbackBaseline.map((signal) => signal.signalScore));
  if (fallbackBaselineAvg <= 0) {
    return null;
  }

  const fallbackLift = ((fallbackRecentAvg - fallbackBaselineAvg) / fallbackBaselineAvg) * 100;
  if (fallbackLift < 5) {
    return null;
  }

  return {
    topicToken: fallbackToken,
    topicLabel: toTopicLabel(fallbackToken),
    recent: fallbackRecent,
    baseline: fallbackBaseline,
    liftPercent: fallbackLift,
    retentionLiftPercent: null,
    usesRetention: false,
  };
}

type CreateAppOptions = {
  includeFrontend?: boolean;
  port?: number;
};

type SupabaseProfileRow = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  channel_id: string | null;
};

type SupabaseYouTubeAccountRow = {
  id: string;
  user_id: string;
  google_id: string;
  channel_id: string;
  channel_title: string;
  channel_description: string | null;
  channel_thumbnail: string | null;
  statistics: Record<string, unknown> | null;
};

type UnifiedAccountState = {
  accounts: any[];
  activeIndex: number;
  source: "supabase" | "session";
};

function normalizeChannelStatistics(rawStatistics: unknown) {
  const stats =
    rawStatistics && typeof rawStatistics === "object"
      ? (rawStatistics as Record<string, unknown>)
      : {};

  return {
    subscriberCount: String(toNumber(stats.subscriberCount ?? stats.subscribers ?? 0)),
    videoCount: String(toNumber(stats.videoCount ?? stats.videos ?? 0)),
    viewCount: String(toNumber(stats.viewCount ?? stats.totalViews ?? 0)),
  };
}

function mapSupabaseAccountToLegacyUser(
  profile: SupabaseProfileRow | null,
  account: SupabaseYouTubeAccountRow,
) {
  const thumbnailUrl = account.channel_thumbnail || profile?.avatar_url || "";

  return {
    id: account.google_id || profile?.id || account.channel_id,
    name: profile?.full_name || account.channel_title || "Creator",
    picture: profile?.avatar_url || thumbnailUrl,
    channel: {
      id: account.channel_id,
      title: account.channel_title,
      description: account.channel_description || "",
      thumbnails: thumbnailUrl ? { default: { url: thumbnailUrl } } : {},
      statistics: normalizeChannelStatistics(account.statistics),
    },
  };
}

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
  const appUrl = resolveAppUrl(port);
  const redirectUri = `${appUrl}/auth/google/callback`;

  function normalizePostAuthRedirect(rawValue: unknown): string {
    if (typeof rawValue !== "string" || !rawValue.trim()) {
      return appUrl;
    }

    try {
      const appOrigin = new URL(appUrl).origin;
      const candidate = new URL(rawValue.trim(), appOrigin);
      if (candidate.origin !== appOrigin) {
        return appUrl;
      }
      return `${candidate.origin}${candidate.pathname}${candidate.search}${candidate.hash}`;
    } catch {
      return appUrl;
    }
  }

  function encodeOAuthState(redirectTo: string): string {
    return Buffer.from(JSON.stringify({ redirectTo }), "utf8").toString("base64url");
  }

  function decodeOAuthState(rawState: unknown): string {
    if (typeof rawState !== "string" || !rawState.trim()) {
      return appUrl;
    }

    try {
      const parsed = JSON.parse(Buffer.from(rawState, "base64url").toString("utf8"));
      return normalizePostAuthRedirect(parsed?.redirectTo);
    } catch {
      return appUrl;
    }
  }

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

  // Initialize snapshot database
  try {
    initializeSnapshotTable();
  } catch (error) {
    console.warn('Snapshot database not available:', error instanceof Error ? error.message : 'Unknown error');
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

  async function getUnifiedAccountsAndActiveIndex(req: express.Request): Promise<UnifiedAccountState> {
    const sessionState = getSessionAccountsAndActiveIndex(req);
    const fallbackState: UnifiedAccountState = {
      accounts: sessionState.accounts,
      activeIndex: sessionState.activeIndex,
      source: "session",
    };

    const authUser = await verifyUser(req);
    if (!authUser) {
      return fallbackState;
    }

    try {
      const [{ data: profile, error: profileError }, { data: rawAccounts, error: accountsError }] = await Promise.all([
        supabaseServer
          .from("profiles")
          .select("id, full_name, avatar_url, channel_id")
          .eq("id", authUser.id)
          .maybeSingle(),
        supabaseServer
          .from("youtube_accounts")
          .select("id, user_id, google_id, channel_id, channel_title, channel_description, channel_thumbnail, statistics")
          .eq("user_id", authUser.id)
          .order("created_at", { ascending: false }),
      ]);

      if (profileError && profileError.code !== "PGRST116") {
        console.error("Supabase profile fetch error:", profileError);
      }

      if (accountsError) {
        console.error("Supabase accounts fetch error:", accountsError);
        return fallbackState;
      }

      const accounts = (rawAccounts || []).map((account) =>
        mapSupabaseAccountToLegacyUser(
          (profile as SupabaseProfileRow | null) || null,
          account as SupabaseYouTubeAccountRow,
        ),
      );

      if (accounts.length === 0) {
        return fallbackState;
      }

      let activeIndex = 0;
      if (profile?.channel_id) {
        const matchedIndex = accounts.findIndex((account) => account.channel?.id === profile.channel_id);
        if (matchedIndex >= 0) {
          activeIndex = matchedIndex;
        }
      }

      return {
        accounts,
        activeIndex,
        source: "supabase",
      };
    } catch (error) {
      console.error("Supabase account state error:", error);
      return fallbackState;
    }
  }

  // Viral Clip Analyzer Endpoint
  app.post('/api/analyze', upload.single('video'), async (req, res) => {
    try {
      const ai = new GoogleGenAI({ apiKey: getGeminiKeyFromRequest(req) });
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
        model: 'gemini-2.5-flash',
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
    const postAuthRedirect = normalizePostAuthRedirect(Array.isArray(req.query.next) ? req.query.next[0] : req.query.next);
    
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
      state: encodeOAuthState(postAuthRedirect),
    });
    console.log(`[Auth URL Generated] URL contains redirect_uri: ${url.includes(redirectUri)}`);
    res.json({ url });
  });

  // OAuth entry point for marketing site and direct YouTube auth flow
  app.get("/auth/youtube", (req, res) => {
    console.log(`[YouTube Auth Entry] Initiating OAuth flow`);
    const postAuthRedirect = normalizePostAuthRedirect(Array.isArray(req.query.next) ? req.query.next[0] : req.query.next);
    
    if (OAUTH_MISSING_VARS.length > 0) {
      console.error(`[Auth Error] Missing OAuth vars: ${OAUTH_MISSING_VARS.join(", ")}`);
      return res.status(500).send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Configuration Error</title>
            <style>
              body {
                font-family: system-ui, sans-serif;
                display: flex;
                align-items: center;
                justify-content: center;
                min-height: 100vh;
                margin: 0;
                background: #f5f5f5;
              }
              .container {
                background: white;
                padding: 32px;
                border-radius: 8px;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
                max-width: 500px;
                text-align: center;
              }
              h1 { color: #d32f2f; margin: 0 0 16px 0; }
              p { color: #666; margin: 0; }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>Configuration Error</h1>
              <p>Google OAuth credentials are not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.</p>
            </div>
          </body>
        </html>
      `);
    }

    const url = oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: [
        "https://www.googleapis.com/auth/youtube.readonly",
        "https://www.googleapis.com/auth/yt-analytics.readonly",
        "https://www.googleapis.com/auth/userinfo.profile",
      ],
      prompt: "consent",
      state: encodeOAuthState(postAuthRedirect),
    });
    
    console.log(`[YouTube Auth Entry] Redirecting to Google OAuth`);
    res.redirect(url);
  });

  app.get(["/auth/google/callback", "/api/auth/google/callback"], async (req, res) => {
    const { code } = req.query;
    const postAuthRedirect = decodeOAuthState(Array.isArray(req.query.state) ? req.query.state[0] : req.query.state);

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
      // Deduplicate based on channel ID (if available) or Google account ID
      // This allows multiple YouTube channels under the same Google account
      const dedupedAccounts = accounts.filter((account: any) => {
        if (newUserData.channel && account.channel) {
          // Both have channels - compare channel IDs
          return account.channel.id !== newUserData.channel.id;
        } else if (!newUserData.channel && !account.channel) {
          // Neither has a channel - compare Google account IDs
          return account.id !== newUserData.id;
        }
        // One has channel, one doesn't - keep both
        return true;
      });
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
                        window.location.href = ${JSON.stringify(postAuthRedirect)};
                      }
                    }, 1000);
                  } else {
                    // No opener, just redirect to main page
                    window.location.href = ${JSON.stringify(postAuthRedirect)};
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

  app.get("/api/user/accounts", async (req, res) => {
    const { accounts, activeIndex } = await getUnifiedAccountsAndActiveIndex(req);

    const safeAccounts = accounts.map((account: any) => {
      const { tokens, ...safe } = account;
      return safe;
    });

    res.json({ accounts: safeAccounts, activeIndex });
  });

  app.post("/api/user/switch", async (req, res) => {
    const authUser = await verifyUser(req);
    if (authUser) {
      try {
        const { data: supabaseAccounts, error: fetchError } = await supabaseServer
          .from("youtube_accounts")
          .select("id, channel_id")
          .eq("user_id", authUser.id)
          .order("created_at", { ascending: false });

        if (fetchError) {
          console.error("Supabase switch fetch error:", fetchError);
        } else if ((supabaseAccounts || []).length > 0) {
          const index = Number(req.body?.index);
          if (!Number.isInteger(index)) {
            return res.status(400).json({ error: "Invalid index" });
          }

          if (index < 0 || index >= supabaseAccounts.length) {
            return res.status(400).json({ error: "Index out of range" });
          }

          const selectedAccount = supabaseAccounts[index];
          const { error: updateError } = await supabaseServer
            .from("profiles")
            .upsert({ id: authUser.id, channel_id: selectedAccount.channel_id }, { onConflict: "id" });

          if (updateError) {
            console.error("Supabase switch profile update error:", updateError);
            return res.status(500).json({ error: "Failed to switch account" });
          }

          return res.json({ success: true, activeIndex: index });
        }
      } catch (error) {
        console.error("Supabase switch error:", error);
      }
    }

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

  app.post("/api/user/remove", async (req, res) => {
    const authUser = await verifyUser(req);
    if (authUser) {
      try {
        const [{ data: profile }, { data: supabaseAccounts, error: fetchError }] = await Promise.all([
          supabaseServer
            .from("profiles")
            .select("channel_id")
            .eq("id", authUser.id)
            .maybeSingle(),
          supabaseServer
            .from("youtube_accounts")
            .select("id, channel_id")
            .eq("user_id", authUser.id)
            .order("created_at", { ascending: false }),
        ]);

        if (fetchError) {
          console.error("Supabase remove fetch error:", fetchError);
        } else if ((supabaseAccounts || []).length > 0) {
          const removeIndex = Number(req.body?.index);
          if (!Number.isInteger(removeIndex)) {
            return res.status(400).json({ error: "Invalid index" });
          }

          if (removeIndex < 0 || removeIndex >= supabaseAccounts.length) {
            return res.status(400).json({ error: "Index out of range" });
          }

          const accountToRemove = supabaseAccounts[removeIndex];
          const { error: deleteError } = await supabaseServer
            .from("youtube_accounts")
            .delete()
            .eq("id", accountToRemove.id)
            .eq("user_id", authUser.id);

          if (deleteError) {
            console.error("Supabase remove delete error:", deleteError);
            return res.status(500).json({ error: "Failed to remove account" });
          }

          const previousActiveIndex = profile?.channel_id
            ? supabaseAccounts.findIndex((account) => account.channel_id === profile.channel_id)
            : 0;

          const activeIndex = previousActiveIndex >= 0 ? previousActiveIndex : 0;
          const remainingAccounts = supabaseAccounts.filter((_, idx) => idx !== removeIndex);

          let nextActiveIndex = activeIndex;
          if (remainingAccounts.length === 0) {
            nextActiveIndex = 0;
          } else if (activeIndex === removeIndex) {
            nextActiveIndex = Math.max(0, removeIndex - 1);
          } else if (activeIndex > removeIndex) {
            nextActiveIndex = activeIndex - 1;
          }

          const nextChannelId = remainingAccounts[nextActiveIndex]?.channel_id || null;
          const { error: profileUpdateError } = await supabaseServer
            .from("profiles")
            .upsert({ id: authUser.id, channel_id: nextChannelId }, { onConflict: "id" });

          if (profileUpdateError) {
            console.error("Supabase remove profile update error:", profileUpdateError);
            return res.status(500).json({ error: "Failed to remove account" });
          }

          return res.json({ success: true, activeIndex: nextActiveIndex });
        }
      } catch (error) {
        console.error("Supabase remove error:", error);
      }
    }

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

  app.get("/api/user/channel", async (req, res) => {
    const { accounts, activeIndex } = await getUnifiedAccountsAndActiveIndex(req);
    const user = accounts[activeIndex];
    if (!user) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    // Don't send tokens back to client
    const { tokens, ...safeUser } = user;
    res.json(safeUser);
  });

  app.get("/api/script/daily-placeholder", async (req, res) => {
    const { accounts, activeIndex } = getSessionAccountsAndActiveIndex(req);
    const user = accounts[activeIndex];

    if (!user || !user.tokens) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    if (!user.channel) {
      return res.status(400).json({ error: "No channel connected" });
    }

    const dateKey = new Date().toISOString().slice(0, 10);
    const channelTitle = user.channel.title || "your niche";
    const channelDescription = String(user.channel.description || "").slice(0, 700);
    let recentTitles: string[] = [];

    try {
      const recentResponse = await fetch(
        "https://www.googleapis.com/youtube/v3/search?part=snippet&forMine=true&type=video&maxResults=6&order=date",
        {
          headers: { Authorization: `Bearer ${user.tokens.access_token}` },
        }
      );
      const recentData = await recentResponse.json();
      recentTitles = (recentData.items || [])
        .map((item: any) => item?.snippet?.title)
        .filter((title: unknown) => typeof title === "string" && title.trim().length > 0)
        .slice(0, 6);
    } catch (fetchError) {
      console.error("Fetch recent videos for placeholder error:", fetchError);
    }

    try {
      if (!process.env.GEMINI_API_KEY) {
        throw new Error("Missing GEMINI_API_KEY");
      }

      const ai = new GoogleGenAI({ apiKey: getGeminiKeyFromRequest(req) });
      const prompt = `You are helping a YouTube creator start a new script draft.
Return exactly one concise topic placeholder (max 100 characters) tailored to this channel.
It should feel fresh for date ${dateKey} and be specific enough to spark a script.
Do not include quotes or numbering.

Channel title: ${channelTitle}
Channel description: ${channelDescription || "No description"}
Recent videos: ${recentTitles.join(" | ") || "No recent titles"}`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              placeholder: { type: Type.STRING },
            },
            required: ["placeholder"],
          },
        },
      });

      const parsed = JSON.parse(response.text || "{}");
      const placeholder = String(parsed.placeholder || "").trim();

      if (!placeholder) {
        throw new Error("Placeholder was empty");
      }

      return res.json({
        placeholder,
        dateKey,
        channelId: user.channel.id,
        source: "ai",
      });
    } catch (error) {
      console.error("Generate daily script placeholder error:", error);

      const fallbackTopic = recentTitles[0] || channelTitle;
      return res.json({
        placeholder: `e.g., ${fallbackTopic}`,
        dateKey,
        channelId: user.channel.id,
        source: "fallback",
      });
    }
  });

  app.get("/api/coach/insight-alert", async (req, res) => {
    const { accounts, activeIndex } = getSessionAccountsAndActiveIndex(req);
    const user = accounts[activeIndex];

    if (!user || !user.tokens) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    if (!user.channel?.id) {
      return res.status(400).json({ error: "No channel connected" });
    }

    const channelId = String(user.channel.id);
    const cachedAlert = coachInsightAlertCache.get(channelId);
    if (cachedAlert && cachedAlert.expiresAt > Date.now()) {
      return res.json({ ...cachedAlert.payload, cached: true });
    }

    try {
      const authHeader = { Authorization: `Bearer ${user.tokens.access_token}` };
      const searchResponse = await fetch(
        "https://www.googleapis.com/youtube/v3/search?part=snippet&forMine=true&type=video&maxResults=30&order=date",
        { headers: authHeader }
      );

      if (!searchResponse.ok) {
        const errorPayload = await searchResponse.json().catch(() => ({}));
        return res.status(searchResponse.status).json({
          error: errorPayload?.error?.message || "Failed to fetch videos for insight analysis",
        });
      }

      const searchData = await searchResponse.json();
      const videoIds = (searchData.items || [])
        .map((item: any) => item?.id?.videoId)
        .filter((id: unknown) => typeof id === "string" && id.trim())
        .slice(0, 30)
        .join(",");

      if (!videoIds) {
        return res.json({
          generatedAt: new Date().toISOString(),
          analysisWindowDays: COACH_ALERT_LOOKBACK_DAYS,
          cached: false,
          alert: null,
          message: "Not enough video data for proactive insights yet.",
        });
      }

      const videosResponse = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${videoIds}`,
        { headers: authHeader }
      );

      if (!videosResponse.ok) {
        const errorPayload = await videosResponse.json().catch(() => ({}));
        return res.status(videosResponse.status).json({
          error: errorPayload?.error?.message || "Failed to fetch detailed video data",
        });
      }

      const videosData = await videosResponse.json();
      const videos = Array.isArray(videosData.items) ? videosData.items : [];

      if (videos.length < 6) {
        return res.json({
          generatedAt: new Date().toISOString(),
          analysisWindowDays: COACH_ALERT_LOOKBACK_DAYS,
          cached: false,
          alert: null,
          message: "Need at least 6 videos before proactive insight alerts can be generated.",
        });
      }

      const retentionByVideoId: Record<string, number> = {};

      try {
        const endDate = new Date().toISOString().slice(0, 10);
        const startDate = new Date(Date.now() - COACH_ALERT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000)
          .toISOString()
          .slice(0, 10);

        const analyticsResponse = await fetch(
          `https://youtubeanalytics.googleapis.com/v2/reports?ids=channel==MINE&startDate=${startDate}&endDate=${endDate}&metrics=views,averageViewPercentage&dimensions=video&sort=-views&maxResults=200`,
          { headers: authHeader }
        );

        if (analyticsResponse.ok) {
          const analyticsData = await analyticsResponse.json();
          const headers = Array.isArray(analyticsData.columnHeaders) ? analyticsData.columnHeaders : [];
          const rows = Array.isArray(analyticsData.rows) ? analyticsData.rows : [];

          const videoIndex = headers.findIndex((header: any) => header?.name === "video");
          const retentionIndex = headers.findIndex((header: any) => header?.name === "averageViewPercentage");

          if (videoIndex >= 0 && retentionIndex >= 0) {
            for (const row of rows) {
              const videoId = String(row?.[videoIndex] || "");
              const retentionValue = toNumber(row?.[retentionIndex]);
              if (videoId && retentionValue > 0) {
                retentionByVideoId[videoId] = retentionValue;
              }
            }
          }
        }
      } catch (analyticsError) {
        console.log("Coach insight analytics fallback to retention-proxy signals", analyticsError);
      }

      const now = Date.now();
      const signals: CoachVideoSignal[] = videos
        .map((video: any) => {
          const id = String(video?.id || "").trim();
          const title = String(video?.snippet?.title || "").trim();
          const publishedAt = String(video?.snippet?.publishedAt || "");
          const publishedAtMs = new Date(publishedAt).getTime();

          if (!id || !title || !Number.isFinite(publishedAtMs)) {
            return null;
          }

          const views = toNumber(video?.statistics?.viewCount);
          const likes = toNumber(video?.statistics?.likeCount);
          const comments = toNumber(video?.statistics?.commentCount);
          const retentionPct = typeof retentionByVideoId[id] === "number" ? retentionByVideoId[id] : null;

          const ageDays = Math.max(1, (now - publishedAtMs) / (24 * 60 * 60 * 1000));
          const viewsPerDay = views / ageDays;
          const engagementRate = views > 0 ? ((likes + comments) / views) * 100 : 0;
          const signalScore = retentionPct !== null
            ? retentionPct
            : engagementRate * 8 + Math.log10(viewsPerDay + 1) * 14;

          return {
            id,
            title,
            publishedAt,
            publishedAtMs,
            views,
            likes,
            comments,
            retentionPct,
            signalScore,
            tokens: extractTopicTokens(title),
          };
        })
        .filter((signal: CoachVideoSignal | null): signal is CoachVideoSignal => Boolean(signal))
        .sort((a, b) => b.publishedAtMs - a.publishedAtMs)
        .slice(0, 24);

      const topicInsight = pickBestTopicInsight(signals);
      if (!topicInsight) {
        return res.json({
          generatedAt: new Date().toISOString(),
          analysisWindowDays: COACH_ALERT_LOOKBACK_DAYS,
          cached: false,
          alert: null,
          message: "No strong positive trend detected yet. Keep publishing and check back soon.",
        });
      }

      const liftRaw = topicInsight.usesRetention && topicInsight.retentionLiftPercent !== null
        ? topicInsight.retentionLiftPercent
        : topicInsight.liftPercent;
      const liftPercent = Math.max(5, Math.round(liftRaw));
      const signalType = topicInsight.usesRetention ? "retention" : "retention-proxy";
      const channelTitle = String(user.channel?.title || "your channel").trim();

      let headline = `Your last 3 videos on ${topicInsight.topicLabel} had ${liftPercent}% higher retention signals.`;
      let summary = `This pattern indicates audience momentum. Double down on ${topicInsight.topicLabel} with follow-up angles while this interest is hot.`;
      let ideas = buildFallbackIdeas(topicInsight.topicLabel, channelTitle);

      if (req.headers['x-gemini-key']) {
        try {
          const ai = new GoogleGenAI({ apiKey: getGeminiKeyFromRequest(req) });
          const prompt = `You are generating a proactive YouTube coaching alert.

Important identity rule:
- Janso Studio is the app name, not the creator name.
- Creator channel name is "${channelTitle}".
- Never call the creator or audience "Janso Studio" unless the channel name exactly matches Janso Studio.

Trend data:
- Topic with strongest positive momentum: ${topicInsight.topicLabel}
- Lift over baseline: ${liftPercent}%
- Signal type: ${signalType}
- Most recent 3 matching videos: ${topicInsight.recent.map((video) => video.title).join(" | ")}

Return JSON with:
1) headline: one sentence like "Your last 3 videos on X had Y% higher retention..."
2) summary: 1-2 short sentences that explain why this matters now
3) ideas: exactly 3 concrete video ideas to double down.`;

          const aiResponse = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  headline: { type: Type.STRING },
                  summary: { type: Type.STRING },
                  ideas: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                },
                required: ["headline", "summary", "ideas"],
              },
            },
          });

          const parsed = JSON.parse(aiResponse.text || "{}");
          const parsedHeadline = String(parsed?.headline || "").trim();
          const parsedSummary = String(parsed?.summary || "").trim();
          const parsedIdeas = Array.isArray(parsed?.ideas)
            ? parsed.ideas.map((idea: unknown) => String(idea || "").trim()).filter(Boolean)
            : [];

          if (parsedHeadline) {
            headline = parsedHeadline;
          }
          if (parsedSummary) {
            summary = parsedSummary;
          }
          if (parsedIdeas.length >= 3) {
            ideas = parsedIdeas.slice(0, 3);
          }
        } catch (aiError) {
          console.error("Coach insight AI generation error:", aiError);
        }
      }

      const alertId = `${channelId}:${topicInsight.topicToken}:${topicInsight.recent[0]?.id || Date.now()}`;
      const payload = {
        generatedAt: new Date().toISOString(),
        analysisWindowDays: COACH_ALERT_LOOKBACK_DAYS,
        cached: false,
        alert: {
          id: alertId,
          topic: topicInsight.topicLabel,
          liftPercent,
          signalType,
          headline,
          summary,
          ideas: ideas.slice(0, 3),
          supportingVideos: topicInsight.recent.map((video) => ({
            id: video.id,
            title: video.title,
            publishedAt: video.publishedAt,
            views: video.views,
            retentionPct: video.retentionPct,
          })),
        },
      };

      coachInsightAlertCache.set(channelId, {
        expiresAt: Date.now() + COACH_ALERT_CACHE_TTL_MS,
        payload,
      });

      return res.json(payload);
    } catch (error) {
      console.error("Coach insight alert error:", error);
      return res.status(500).json({ error: "Failed to generate insight alert" });
    }
  });

  app.get("/api/user/videos", async (req, res) => {
    const { accounts, activeIndex } = getSessionAccountsAndActiveIndex(req);
    const user = accounts[activeIndex];
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

  app.get("/api/comments/fetch", async (req, res) => {
    const { accounts, activeIndex } = getSessionAccountsAndActiveIndex(req);
    const user = accounts[activeIndex];
    if (!user || !user.tokens) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const rawVideoId = Array.isArray(req.query.videoId) ? req.query.videoId[0] : req.query.videoId;
    const videoId = typeof rawVideoId === "string" ? rawVideoId : "";
    if (!videoId) {
      return res.status(400).json({ error: "videoId is required" });
    }

    try {
      const commentsResponse = await fetch(
        `https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&videoId=${encodeURIComponent(videoId)}&maxResults=100&order=relevance&textFormat=plainText`,
        {
          headers: { Authorization: `Bearer ${user.tokens.access_token}` },
        }
      );

      const commentsData = await commentsResponse.json();
      if (!commentsResponse.ok || commentsData?.error) {
        const statusCode = Number(commentsData?.error?.code) || commentsResponse.status || 500;
        return res.status(statusCode).json({
          error: commentsData?.error?.message || "Failed to fetch comments",
        });
      }

      const comments = (commentsData.items || [])
        .map((item: any) => {
          const topLevel = item?.snippet?.topLevelComment?.snippet;
          if (!topLevel?.textDisplay) {
            return null;
          }

          return {
            id: item?.id,
            textDisplay: topLevel.textDisplay,
            authorDisplayName: topLevel.authorDisplayName,
            likeCount: Number(topLevel.likeCount || 0),
            publishedAt: topLevel.publishedAt,
          };
        })
        .filter(Boolean);

      return res.json({
        comments,
        totalComments: commentsData?.pageInfo?.totalResults || comments.length,
      });
    } catch (error) {
      console.error("Fetch comments error:", error);
      return res.status(500).json({ error: "Failed to fetch comments" });
    }
  });

  app.put("/api/user/videos/:videoId/title", async (req, res) => {
    const { accounts, activeIndex } = getSessionAccountsAndActiveIndex(req);
    const user = accounts[activeIndex];
    if (!user || !user.tokens) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const { videoId } = req.params;
    const { title } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ error: "Title is required" });
    }

    try {
      // First, get the current video details (we need categoryId and other metadata)
      const getResponse = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}`,
        {
          headers: { Authorization: `Bearer ${user.tokens.access_token}` },
        }
      );

      if (!getResponse.ok) {
        const errorData = await getResponse.json().catch(() => ({}));
        console.error("YouTube get video error:", errorData);
        return res.status(getResponse.status).json({ 
          error: errorData.error?.message || "Failed to fetch video details" 
        });
      }

      const getData = await getResponse.json();
      if (!getData.items || getData.items.length === 0) {
        return res.status(404).json({ error: "Video not found" });
      }

      const video = getData.items[0];
      
      // Update the video with new title
      const updatePayload = {
        id: videoId,
        snippet: {
          ...video.snippet,
          title: title.trim(),
          categoryId: video.snippet.categoryId,
        }
      };

      const updateResponse = await fetch(
        "https://www.googleapis.com/youtube/v3/videos?part=snippet",
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${user.tokens.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(updatePayload),
        }
      );

      if (!updateResponse.ok) {
        const errorData = await updateResponse.json().catch(() => ({}));
        console.error("YouTube update video error:", errorData);
        return res.status(updateResponse.status).json({ 
          error: errorData.error?.message || "Failed to update video title" 
        });
      }

      const updateData = await updateResponse.json();
      res.json({ success: true, video: updateData });
    } catch (error) {
      console.error("Update video title error:", error);
      res.status(500).json({ error: "Failed to update video title" });
    }
  });

  // Bulk update video descriptions
  app.put("/api/user/videos/bulk/description", async (req, res) => {
    const { accounts, activeIndex } = getSessionAccountsAndActiveIndex(req);
    const user = accounts[activeIndex];
    if (!user || !user.tokens) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const { videoIds, description, findReplace } = req.body;

    if (!videoIds || !Array.isArray(videoIds) || videoIds.length === 0) {
      return res.status(400).json({ error: "Video IDs array is required" });
    }

    if (!description && !findReplace) {
      return res.status(400).json({ error: "Either description or findReplace is required" });
    }

    const results = { success: [], failed: [] };

    for (const videoId of videoIds) {
      try {
        const getResponse = await fetch(
          `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}`,
          { headers: { Authorization: `Bearer ${user.tokens.access_token}` } }
        );

        if (!getResponse.ok) {
          results.failed.push({ videoId, error: "Failed to fetch video" });
          continue;
        }

        const getData = await getResponse.json();
        if (!getData.items || getData.items.length === 0) {
          results.failed.push({ videoId, error: "Video not found" });
          continue;
        }

        const video = getData.items[0];
        let newDescription = description;

        // Apply find/replace if specified
        if (findReplace && findReplace.find && video.snippet.description) {
          newDescription = video.snippet.description.replace(
            new RegExp(findReplace.find, 'g'),
            findReplace.replace
          );
        }

        const updatePayload = {
          id: videoId,
          snippet: {
            ...video.snippet,
            description: newDescription || video.snippet.description,
            categoryId: video.snippet.categoryId,
          }
        };

        const updateResponse = await fetch(
          "https://www.googleapis.com/youtube/v3/videos?part=snippet",
          {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${user.tokens.access_token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(updatePayload),
          }
        );

        if (updateResponse.ok) {
          results.success.push(videoId);
        } else {
          const errorData = await updateResponse.json().catch(() => ({}));
          results.failed.push({ videoId, error: errorData.error?.message || "Update failed" });
        }
      } catch (error: any) {
        results.failed.push({ videoId, error: error.message });
      }
    }

    res.json(results);
  });

  // Bulk update video tags
  app.put("/api/user/videos/bulk/tags", async (req, res) => {
    const { accounts, activeIndex } = getSessionAccountsAndActiveIndex(req);
    const user = accounts[activeIndex];
    if (!user || !user.tokens) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const { videoIds, tags, mode } = req.body;

    if (!videoIds || !Array.isArray(videoIds) || videoIds.length === 0) {
      return res.status(400).json({ error: "Video IDs array is required" });
    }

    if (!tags || !Array.isArray(tags) || tags.length === 0) {
      return res.status(400).json({ error: "Tags array is required" });
    }

    const updateMode = mode || 'replace'; // 'replace', 'append', 'prepend'
    const results = { success: [], failed: [] };

    for (const videoId of videoIds) {
      try {
        const getResponse = await fetch(
          `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}`,
          { headers: { Authorization: `Bearer ${user.tokens.access_token}` } }
        );

        if (!getResponse.ok) {
          results.failed.push({ videoId, error: "Failed to fetch video" });
          continue;
        }

        const getData = await getResponse.json();
        if (!getData.items || getData.items.length === 0) {
          results.failed.push({ videoId, error: "Video not found" });
          continue;
        }

        const video = getData.items[0];
        let newTags = tags;

        if (updateMode === 'append') {
          newTags = [...(video.snippet.tags || []), ...tags];
        } else if (updateMode === 'prepend') {
          newTags = [...tags, ...(video.snippet.tags || [])];
        }
        // 'replace' mode uses tags as-is

        // Remove duplicates and limit to 500 tags (YouTube limit)
        newTags = [...new Set(newTags)].slice(0, 500);

        const updatePayload = {
          id: videoId,
          snippet: {
            ...video.snippet,
            tags: newTags,
            categoryId: video.snippet.categoryId,
          }
        };

        const updateResponse = await fetch(
          "https://www.googleapis.com/youtube/v3/videos?part=snippet",
          {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${user.tokens.access_token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(updatePayload),
          }
        );

        if (updateResponse.ok) {
          results.success.push(videoId);
        } else {
          const errorData = await updateResponse.json().catch(() => ({}));
          results.failed.push({ videoId, error: errorData.error?.message || "Update failed" });
        }
      } catch (error: any) {
        results.failed.push({ videoId, error: error.message });
      }
    }

    res.json(results);
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
      status,
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
      status: status === "applied" ? "applied" : "authorized",
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
    const { accounts, activeIndex } = getSessionAccountsAndActiveIndex(req);
    const user = accounts[activeIndex];
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
      
        if (!videosResponse.ok) {
          const errorData = await videosResponse.json().catch(() => ({}));
          console.error("YouTube videos API error:", errorData);
          throw new Error(errorData.error?.message || "Failed to fetch video details from YouTube");
        }
      
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

  app.get("/api/user/best-posting-time", async (req, res) => {
    const { accounts, activeIndex } = getSessionAccountsAndActiveIndex(req);
    const user = accounts[activeIndex];
    if (!user || !user.tokens) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    try {
      // Fetch user's video history
      const response = await fetch(
        "https://www.googleapis.com/youtube/v3/search?part=snippet&forMine=true&type=video&maxResults=50&order=date",
        {
          headers: { Authorization: `Bearer ${user.tokens.access_token}` },
        }
      );
      const data = await response.json();
      
      const videoIds = data.items?.map((item: any) => item.id.videoId).join(",");
      if (!videoIds) {
        return res.json({ 
          bestHour: null, 
          bestDay: null, 
          confidence: 'low',
          message: 'Not enough video data to analyze posting patterns' 
        });
      }

      // Fetch detailed statistics
      const statsResponse = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${videoIds}`,
        {
          headers: { Authorization: `Bearer ${user.tokens.access_token}` },
        }
      );
      const statsData = await statsResponse.json();
      const videos = statsData.items || [];

      if (videos.length < 5) {
        return res.json({ 
          bestHour: null, 
          bestDay: null, 
          confidence: 'low',
          message: 'Need at least 5 videos to analyze posting patterns' 
        });
      }

      // Analyze posting times and performance
      const hourlyPerformance: Record<number, { totalViews: number; totalEngagement: number; count: number; avgViewsPerDay: number }> = {};
      const dailyPerformance: Record<number, { totalViews: number; totalEngagement: number; count: number; avgViewsPerDay: number }> = {};
      const now = Date.now();

      for (const video of videos) {
        const publishedAt = new Date(video.snippet.publishedAt);
        const hour = publishedAt.getUTCHours();
        const day = publishedAt.getUTCDay(); // 0 = Sunday, 6 = Saturday
        
        const viewCount = toNumber(video.statistics?.viewCount);
        const likeCount = toNumber(video.statistics?.likeCount);
        const commentCount = toNumber(video.statistics?.commentCount);
        const engagement = likeCount + commentCount;
        
        // Calculate views per day (normalize by video age)
        const ageDays = Math.max(1, (now - publishedAt.getTime()) / (24 * 60 * 60 * 1000));
        const viewsPerDay = viewCount / ageDays;

        // Track hourly performance
        if (!hourlyPerformance[hour]) {
          hourlyPerformance[hour] = { totalViews: 0, totalEngagement: 0, count: 0, avgViewsPerDay: 0 };
        }
        hourlyPerformance[hour].totalViews += viewCount;
        hourlyPerformance[hour].totalEngagement += engagement;
        hourlyPerformance[hour].avgViewsPerDay += viewsPerDay;
        hourlyPerformance[hour].count += 1;

        // Track daily performance
        if (!dailyPerformance[day]) {
          dailyPerformance[day] = { totalViews: 0, totalEngagement: 0, count: 0, avgViewsPerDay: 0 };
        }
        dailyPerformance[day].totalViews += viewCount;
        dailyPerformance[day].totalEngagement += engagement;
        dailyPerformance[day].avgViewsPerDay += viewsPerDay;
        dailyPerformance[day].count += 1;
      }

      // Calculate best hour based on average views per day (most reliable metric)
      let bestHour = 0;
      let bestHourScore = 0;
      for (const [hour, data] of Object.entries(hourlyPerformance)) {
        const avgViewsPerDay = data.avgViewsPerDay / data.count;
        const score = avgViewsPerDay; // Could add engagement weight here
        if (score > bestHourScore) {
          bestHourScore = score;
          bestHour = parseInt(hour);
        }
      }

      // Calculate best day
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      let bestDay = 0;
      let bestDayScore = 0;
      for (const [day, data] of Object.entries(dailyPerformance)) {
        const avgViewsPerDay = data.avgViewsPerDay / data.count;
        const score = avgViewsPerDay;
        if (score > bestDayScore) {
          bestDayScore = score;
          bestDay = parseInt(day);
        }
      }

      // Determine confidence level
      const uniqueHours = Object.keys(hourlyPerformance).length;
      const totalVideos = videos.length;
      let confidence: 'low' | 'medium' | 'high' = 'low';
      if (totalVideos >= 20 && uniqueHours >= 5) {
        confidence = 'high';
      } else if (totalVideos >= 10 && uniqueHours >= 3) {
        confidence = 'medium';
      }

      // Generate AI-powered insight using Gemini
      let aiInsight = '';
      if (req.headers['x-gemini-key']) {
        try {
          const ai = new GoogleGenAI({ apiKey: getGeminiKeyFromRequest(req) });
          const prompt = `Analyze this YouTube channel's posting performance and provide a concise recommendation.

Videos analyzed: ${videos.length}
Best performing hour (UTC): ${bestHour}:00 (${hourlyPerformance[bestHour]?.count || 0} videos posted)
Best performing day: ${dayNames[bestDay]} (${dailyPerformance[bestDay]?.count || 0} videos posted)
Average views per day at best hour: ${Math.round(bestHourScore)}
Confidence level: ${confidence}

Provide a 1-2 sentence actionable recommendation for the creator about when to post videos for maximum reach. Consider audience timezone patterns and YouTube algorithm behavior. Be specific and encouraging.`;

          const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
          });

          aiInsight = response.text || '';
        } catch (aiError) {
          console.error('AI insight generation error:', aiError);
          aiInsight = `Based on your video history, posting around ${bestHour}:00 UTC on ${dayNames[bestDay]}s tends to perform best.`;
        }
      } else {
        aiInsight = `Based on your video history, posting around ${bestHour}:00 UTC on ${dayNames[bestDay]}s tends to perform best.`;
      }

      res.json({
        bestHour,
        bestHourFormatted: `${String(bestHour).padStart(2, '0')}:00 UTC`,
        bestDay: dayNames[bestDay],
        bestDayIndex: bestDay,
        confidence,
        videosAnalyzed: videos.length,
        aiInsight: aiInsight.trim(),
        hourlyBreakdown: Object.entries(hourlyPerformance).map(([hour, data]) => ({
          hour: parseInt(hour),
          avgViewsPerDay: Math.round(data.avgViewsPerDay / data.count),
          videoCount: data.count,
        })).sort((a, b) => b.avgViewsPerDay - a.avgViewsPerDay),
      });
    } catch (error) {
      console.error("Best posting time analysis error:", error);
      res.status(500).json({ error: "Failed to analyze best posting time" });
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
      const ai = new GoogleGenAI({ apiKey: getGeminiKeyFromRequest(req) });
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
        model: "gemini-2.5-flash",
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

  app.get("/api/competitors/discover", async (req, res) => {
    const user = (req.session as any).user;
    if (!user || !user.tokens) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    if (!user.channel) {
      return res.status(400).json({ error: "No channel connected" });
    }

    try {
      // Fetch user's recent videos to analyze niche
      const myVideosResponse = await fetch(
        "https://www.googleapis.com/youtube/v3/search?part=snippet&forMine=true&type=video&maxResults=10&order=date",
        {
          headers: { Authorization: `Bearer ${user.tokens.access_token}` },
        }
      );
      const myVideosData = await myVideosResponse.json();
      const myVideoIds = myVideosData.items?.map((item: any) => item.id.videoId).join(",");

      if (!myVideoIds) {
        return res.json({ 
          message: 'Not enough video data to discover competitors',
          suggestions: [] 
        });
      }

      // Get detailed info including tags
      const myStatsResponse = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${myVideoIds}`,
        {
          headers: { Authorization: `Bearer ${user.tokens.access_token}` },
        }
      );
      const myStatsData = await myStatsResponse.json();
      const myVideos = myStatsData.items || [];

      if (myVideos.length === 0) {
        return res.json({ 
          message: 'Not enough video data to discover competitors',
          suggestions: [] 
        });
      }

      // Use AI to analyze niche and generate search queries
      let searchQueries: string[] = [];
      let nicheDescription = '';
      
      const videoTitles = myVideos.map((v: any) => v.snippet.title);
      const videoTags = myVideos.flatMap((v: any) => v.snippet.tags || []);
      const channelDescription = user.channel.description || '';

      if (req.headers['x-gemini-key']) {
        try {
          const ai = new GoogleGenAI({ apiKey: getGeminiKeyFromRequest(req) });

          const prompt = `Analyze this YouTube channel and identify its niche and optimal competitor search queries.

Channel: ${user.channel.title}
Description: ${channelDescription}
Recent Video Titles: ${videoTitles.join(', ')}
Common Tags: ${videoTags.slice(0, 20).join(', ')}

Generate:
1. A concise niche description (2-3 words)
2. 3-5 search queries to find similar successful channels in this niche
3. Make queries specific enough to find real competitors, not just related topics

Return as JSON.`;

          const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  niche: { type: Type.STRING },
                  searchQueries: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                },
                required: ["niche", "searchQueries"],
              },
            },
          });

          const aiResult = JSON.parse(response.text);
          nicheDescription = aiResult.niche || 'Your Niche';
          searchQueries = aiResult.searchQueries || [];
        } catch (aiError) {
          console.error('AI niche analysis error:', aiError);
          // Fallback to tag-based search
          const topTags = videoTags.slice(0, 5);
          searchQueries = topTags.length > 0 ? topTags : [user.channel.title];
        }
      } else {
        // Fallback without AI
        const topTags = videoTags.slice(0, 3);
        searchQueries = topTags.length > 0 ? topTags : [user.channel.title];
      }

      // Search YouTube for competing channels using the generated queries
      const competitorChannels = new Map();
      const myChannelId = user.channel.id;

      for (const query of searchQueries.slice(0, 3)) {
        try {
          const searchResponse = await fetch(
            `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${encodeURIComponent(query)}&maxResults=10&order=relevance`,
            {
              headers: { Authorization: `Bearer ${user.tokens.access_token}` },
            }
          );
          const searchData = await searchResponse.json();

          if (searchData.items) {
            for (const item of searchData.items) {
              const channelId = item.id.channelId;
              // Skip own channel
              if (channelId === myChannelId) continue;
              
              if (!competitorChannels.has(channelId)) {
                competitorChannels.set(channelId, item);
              }
            }
          }
        } catch (searchError) {
          console.error(`Search error for query "${query}":`, searchError);
        }
      }

      // Get detailed stats for discovered channels
      const channelIds = Array.from(competitorChannels.keys()).slice(0, 12);
      if (channelIds.length === 0) {
        return res.json({ 
          niche: nicheDescription,
          message: 'No competing channels found',
          suggestions: [] 
        });
      }

      const channelsStatsResponse = await fetch(
        `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id=${channelIds.join(',')}`,
        {
          headers: { Authorization: `Bearer ${user.tokens.access_token}` },
        }
      );
      const channelsStatsData = await channelsStatsResponse.json();

      // Filter and rank channels by subscriber count
      const rankedChannels = (channelsStatsData.items || [])
        .filter((channel: any) => {
          const subs = parseInt(channel.statistics.subscriberCount || '0');
          const mySubs = parseInt(user.channel.statistics.subscriberCount || '0');
          // Show channels with 50% to 500% of your subscriber count
          return subs >= mySubs * 0.5 && subs <= mySubs * 5;
        })
        .sort((a: any, b: any) => 
          parseInt(b.statistics.subscriberCount) - parseInt(a.statistics.subscriberCount)
        )
        .slice(0, 8)
        .map((channel: any) => ({
          id: channel.id,
          title: channel.snippet.title,
          description: channel.snippet.description,
          thumbnails: channel.snippet.thumbnails,
          statistics: channel.statistics,
          matchScore: 'high', // Could compute similarity score here
        }));

      res.json({
        niche: nicheDescription || 'Your Niche',
        suggestions: rankedChannels,
        message: rankedChannels.length > 0 
          ? `Found ${rankedChannels.length} competing channels in your niche`
          : 'No direct competitors found in your size range'
      });
    } catch (error) {
      console.error("Discover competitors error:", error);
      res.status(500).json({ error: "Failed to discover competitors" });
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

        const rawCustomUrl = channel.snippet?.customUrl;
        const normalizedCustomUrl = rawCustomUrl
          ? String(rawCustomUrl).replace(/^https?:\/\/(www\.)?youtube\.com\//i, '')
          : '';
        const channelPath = normalizedCustomUrl
          ? normalizedCustomUrl.startsWith('@') ||
            normalizedCustomUrl.startsWith('c/') ||
            normalizedCustomUrl.startsWith('user/') ||
            normalizedCustomUrl.startsWith('channel/')
            ? normalizedCustomUrl
            : `@${normalizedCustomUrl}`
          : channel.id
            ? `channel/${channel.id}`
            : '';
        const channelUrl = channelPath ? `https://www.youtube.com/${channelPath}` : undefined;

        return res.json({
          channel: {
            id: channel.id,
            title: channel.snippet.title,
            description: channel.snippet.description,
            thumbnails: channel.snippet.thumbnails,
            customUrl: rawCustomUrl,
            channelUrl,
            statistics: channel.statistics
          },
          videos: sortedVideos
        });
      }

      const rawCustomUrl = channel.snippet?.customUrl;
      const normalizedCustomUrl = rawCustomUrl
        ? String(rawCustomUrl).replace(/^https?:\/\/(www\.)?youtube\.com\//i, '')
        : '';
      const channelPath = normalizedCustomUrl
        ? normalizedCustomUrl.startsWith('@') ||
          normalizedCustomUrl.startsWith('c/') ||
          normalizedCustomUrl.startsWith('user/') ||
          normalizedCustomUrl.startsWith('channel/')
          ? normalizedCustomUrl
          : `@${normalizedCustomUrl}`
        : channel.id
          ? `channel/${channel.id}`
          : '';
      const channelUrl = channelPath ? `https://www.youtube.com/${channelPath}` : undefined;

      res.json({
        channel: {
          id: channel.id,
          title: channel.snippet.title,
          description: channel.snippet.description,
          thumbnails: channel.snippet.thumbnails,
          customUrl: rawCustomUrl,
          channelUrl,
          statistics: channel.statistics,
        },
        videos: [],
      });
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

  // Channel Snapshots - Growth Momentum Tracking
  app.post("/api/snapshots/save", async (req, res) => {
    const { accounts, activeIndex } = getSessionAccountsAndActiveIndex(req);
    const user = accounts[activeIndex];
    
    if (!user || !user.channel?.id) {
      return res.status(401).json({ error: "Not authenticated or no channel connected" });
    }

    try {
      const channelId = user.channel.id;
      const subscribers = toNumber(user.channel.statistics?.subscriberCount);
      const videoCount = toNumber(user.channel.statistics?.videoCount);
      const viewCount = toNumber(user.channel.statistics?.viewCount);
      
      // Get estimated daily views from analytics if available
      const authHeader = { Authorization: `Bearer ${user.tokens.access_token}` };
      const endDate = new Date().toISOString().split("T")[0];
      const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      
      let estimatedDailyViews = 0;
      try {
        const analyticsResponse = await fetch(
          `https://youtubeanalytics.googleapis.com/v2/reports?ids=channel==MINE&startDate=${startDate}&endDate=${endDate}&metrics=views`,
          { headers: authHeader }
        );
        
        if (analyticsResponse.ok) {
          const analyticsData = await analyticsResponse.json();
          const rows = analyticsData.rows || [];
          if (rows.length > 0) {
            const totalViews = rows.reduce((sum: number, row: any[]) => sum + toNumber(row[0]), 0);
            estimatedDailyViews = Math.round(totalViews / Math.max(1, rows.length));
          }
        }
      } catch (error) {
        console.warn('Failed to fetch daily views for snapshot:', error);
      }

      const snapshot = {
        channelId,
        date: new Date().toISOString().split("T")[0],
        timestamp: Date.now(),
        subscriberCount: subscribers,
        videoCount,
        viewCount,
        estimatedDailyViews,
      };

      const success = saveChannelSnapshot(snapshot);
      
      if (success) {
        res.json({ 
          success: true, 
          snapshot,
          message: "Snapshot saved successfully"
        });
      } else {
        res.status(500).json({ error: "Failed to save snapshot" });
      }
    } catch (error) {
      console.error("Save snapshot error:", error);
      res.status(500).json({ error: "Failed to save snapshot" });
    }
  });

  app.get("/api/snapshots/history", async (req, res) => {
    const { accounts, activeIndex } = getSessionAccountsAndActiveIndex(req);
    const user = accounts[activeIndex];
    
    if (!user || !user.channel?.id) {
      return res.status(401).json({ error: "Not authenticated or no channel connected" });
    }

    try {
      const channelId = user.channel.id;
      const days = Number(req.query.days) || 90;
      
      const snapshots = getChannelSnapshots(channelId, days);
      
      res.json({
        channelId,
        snapshots,
        count: snapshots.length,
        period: `${days} days`,
        startDate: snapshots.length > 0 ? snapshots[0].date : null,
        endDate: snapshots.length > 0 ? snapshots[snapshots.length - 1].date : null,
      });
    } catch (error) {
      console.error("Get snapshots history error:", error);
      res.status(500).json({ error: "Failed to fetch snapshot history" });
    }
  });

  app.get("/api/snapshots/momentum", async (req, res) => {
    const { accounts, activeIndex } = getSessionAccountsAndActiveIndex(req);
    const user = accounts[activeIndex];
    
    if (!user || !user.channel?.id) {
      return res.status(401).json({ error: "Not authenticated or no channel connected" });
    }

    try {
      const channelId = user.channel.id;
      
      // Get growth metrics for different time periods
      const week = getChannelSnapshots(channelId, 7);
      const month = getChannelSnapshots(channelId, 30);
      const quarter = getChannelSnapshots(channelId, 90);
      
      // Calculate growth rates
      const calculateGrowth = (snapshots: any[]) => {
        if (snapshots.length < 2) return null;
        
        const first = snapshots[0];
        const last = snapshots[snapshots.length - 1];
        
        return {
          period: `${snapshots.length} days`,
          subscriberGrowth: last.subscriberCount - first.subscriberCount,
          subscriberGrowthPct: first.subscriberCount > 0 
            ? Number((((last.subscriberCount - first.subscriberCount) / first.subscriberCount) * 100).toFixed(2))
            : 0,
          viewGrowth: last.viewCount - first.viewCount,
          videoGrowth: last.videoCount - first.videoCount,
          avgDailyViews: Math.round(last.estimatedDailyViews),
        };
      };
      
      res.json({
        channelId,
        momentum: {
          week: calculateGrowth(week),
          month: calculateGrowth(month),
          quarter: calculateGrowth(quarter),
        },
        currentMetrics: {
          subscribers: user.channel.statistics?.subscriberCount || 0,
          videoCount: user.channel.statistics?.videoCount || 0,
          totalViews: user.channel.statistics?.viewCount || 0,
        },
      });
    } catch (error) {
      console.error("Get snapshot momentum error:", error);
      res.status(500).json({ error: "Failed to fetch growth momentum" });
    }
  });

  // Gemini API Key Validation Endpoint (BYOK)
  app.post('/api/gemini/validate', async (req, res) => {
    try {
      const apiKey = getGeminiKeyFromRequest(req);
      const ai = new GoogleGenAI({ apiKey });
      
      // Lightweight test request
      await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: 'Say "test successful" in exactly 2 words.',
        config: {
          maxOutputTokens: 10,
        },
      });
      
      res.json({ valid: true, message: 'API key is valid' });
    } catch (error: any) {
      console.error('API key validation error:', error.message);
      
      const errorStr = String(error).toLowerCase();
      if (errorStr.includes('api key not valid') || errorStr.includes('unauthorized') || errorStr.includes('401')) {
        res.status(401).json({ valid: false, error: 'Invalid API key' });
      } else if (errorStr.includes('rate limit') || errorStr.includes('429')) {
        res.status(429).json({ valid: false, error: 'Rate limited' });
      } else if (errorStr.includes('quota')) {
        res.status(429).json({ valid: false, error: 'Quota exceeded' });
      } else {
        res.status(500).json({ valid: false, error: 'Validation failed' });
      }
    }
  });

  if (includeFrontend) {
    // Vite middleware for development
    if (process.env.NODE_ENV !== "production") {
      const { createServer: createViteServer } = await import("vite");
      let hmrConfig: { port: number; clientPort: number };

      try {
        const preferredHmrPort = 24678;
        const hmrPort = await findAvailablePort(preferredHmrPort);
        process.env.VITE_HMR_PORT = String(hmrPort);

        if (hmrPort !== preferredHmrPort) {
          console.warn(`[Startup] Vite HMR port ${preferredHmrPort} is in use. Using ${hmrPort} instead.`);
        }

        hmrConfig = {
          port: hmrPort,
          clientPort: hmrPort,
        };
      } catch {
        const fallbackHmrPort = 24700;
        process.env.VITE_HMR_PORT = String(fallbackHmrPort);
        console.warn(`[Startup] Unable to probe Vite HMR port. Falling back to ${fallbackHmrPort}.`);
        hmrConfig = {
          port: fallbackHmrPort,
          clientPort: fallbackHmrPort,
        };
      }

      const vite = await createViteServer({
        server: {
          middlewareMode: true,
          hmr: hmrConfig,
        },
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
