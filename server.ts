import express from "express";
import { OAuth2Client } from "google-auth-library";
import cookieParser from "cookie-parser";
import session from "express-session";
import dotenv from "dotenv";
import path from "path";
import { createHmac } from "node:crypto";
import { fileURLToPath } from "url";
import net from "net";
import multer from "multer";
import { GoogleGenAI, Type } from "@google/genai";
import fs from "fs";
import youtubedl from "youtube-dl-exec";
import { supabaseServer, verifyUser } from "./supabaseServer.ts";
import {
  buildFallbackIdeas,
  COACH_ALERT_CACHE_TTL_MS,
  COACH_ALERT_LOOKBACK_DAYS,
  coachInsightAlertCache,
  extractTopicTokens,
  extractYouTubeError,
  formatDurationLabel,
  getGeminiKeyFromRequest,
  getSessionAccountsAndActiveIndex,
  installYouTubeDataApiCacheFetch,
  isMissingConfigValue,
  mapSupabaseAccountToLegacyUser,
  parseISODurationToSeconds,
  pickBestTopicInsight,
  resolveAppUrl,
  setSessionAccountsAndActiveIndex,
  toNumber,
  type CoachVideoSignal,
  type SupabaseProfileRow,
  type SupabaseYouTubeAccountRow,
  type UnifiedAccountState,
} from "./src/server/serverHelpers.ts";
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
const HAS_SUPABASE_SERVER = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
const OAUTH_STATE_SECRET = process.env.SESSION_SECRET || "tube-vision-secret";
const OAUTH_STATE_MAX_AGE_MS = 10 * 60 * 1000;

const OAUTH_MISSING_VARS = [
  ["GOOGLE_CLIENT_ID", GOOGLE_CLIENT_ID],
  ["GOOGLE_CLIENT_SECRET", GOOGLE_CLIENT_SECRET],
].filter(([, value]) => isMissingConfigValue(value as string)).map(([name]) => name);


type CreateAppOptions = {
  includeFrontend?: boolean;
  port?: number;
};

export async function createApp(options: CreateAppOptions = {}) {
  const { includeFrontend = true, port = DEFAULT_PORT } = options;
  const app = express();
  const appUrl = resolveAppUrl(port);
  const redirectUri = `${appUrl}/auth/google/callback`;

  installYouTubeDataApiCacheFetch();

  function signOAuthState(payload: { redirectTo: string; supabaseUserId: string | null; issuedAt: number }) {
    return createHmac("sha256", OAUTH_STATE_SECRET)
      .update(JSON.stringify(payload))
      .digest("base64url");
  }

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

  function buildYouTubeAuthBridgeUrl(rawNext: unknown): string {
    const bridgeUrl = new URL(appUrl);
    bridgeUrl.searchParams.set("connect_youtube", "1");

    const normalizedNext = normalizePostAuthRedirect(rawNext);
    if (normalizedNext !== appUrl) {
      bridgeUrl.searchParams.set("next", normalizedNext);
    }

    return bridgeUrl.toString();
  }

  function encodeOAuthState(redirectTo: string, supabaseUserId: string | null = null): string {
    const payload = {
      redirectTo: normalizePostAuthRedirect(redirectTo),
      supabaseUserId,
      issuedAt: Date.now(),
    };

    return Buffer.from(
      JSON.stringify({
        ...payload,
        signature: signOAuthState(payload),
      }),
      "utf8",
    ).toString("base64url");
  }

  function decodeOAuthState(rawState: unknown): { redirectTo: string; supabaseUserId: string | null } {
    if (typeof rawState !== "string" || !rawState.trim()) {
      return { redirectTo: appUrl, supabaseUserId: null };
    }

    try {
      const parsed = JSON.parse(Buffer.from(rawState, "base64url").toString("utf8"));
      const redirectTo = normalizePostAuthRedirect(parsed?.redirectTo);
      const supabaseUserId =
        typeof parsed?.supabaseUserId === "string" && parsed.supabaseUserId.trim()
          ? parsed.supabaseUserId.trim()
          : null;
      const issuedAt = Number(parsed?.issuedAt);
      const signature = typeof parsed?.signature === "string" ? parsed.signature : "";

      if (!signature || !Number.isFinite(issuedAt)) {
        return { redirectTo, supabaseUserId: null };
      }

      const expectedSignature = signOAuthState({ redirectTo, supabaseUserId, issuedAt });
      const isFresh = Math.abs(Date.now() - issuedAt) <= OAUTH_STATE_MAX_AGE_MS;

      return {
        redirectTo,
        supabaseUserId: signature === expectedSignature && isFresh ? supabaseUserId : null,
      };
    } catch {
      return { redirectTo: appUrl, supabaseUserId: null };
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

  async function persistYouTubeAccountToSupabase(
    supabaseUserId: string | null,
    userInfo: any,
    channel: any,
    tokens: any,
  ) {
    if (!supabaseUserId || !channel?.id) {
      return;
    }

    try {
      const { data: existingAccount, error: existingAccountError } = await supabaseServer
        .from("youtube_accounts")
        .select("id, refresh_token")
        .eq("channel_id", channel.id)
        .maybeSingle();

      if (existingAccountError && existingAccountError.code !== "PGRST116") {
        console.error("Supabase existing account fetch error:", existingAccountError);
      }

      const refreshToken = tokens.refresh_token || existingAccount?.refresh_token || "";
      if (!tokens.access_token) {
        console.warn("Skipping Supabase YouTube account persistence because OAuth access token is missing.");
        return;
      }

      if (!refreshToken) {
        console.warn("Persisting Supabase YouTube account without refresh token; reconnect may be required after access token expiry.");
      }

      const channelThumbnail =
        channel.snippet?.thumbnails?.default?.url ||
        channel.snippet?.thumbnails?.medium?.url ||
        channel.snippet?.thumbnails?.high?.url ||
        null;

      const expiresAt = tokens.expiry_date
        ? new Date(tokens.expiry_date).toISOString()
        : Number.isFinite(Number(tokens.expires_in))
          ? new Date(Date.now() + Number(tokens.expires_in) * 1000).toISOString()
          : null;

      const accountPayload = {
        user_id: supabaseUserId,
        google_id: String(userInfo?.id || supabaseUserId),
        channel_id: channel.id,
        channel_title: channel.snippet?.title || "Untitled Channel",
        channel_description: channel.snippet?.description || null,
        channel_thumbnail: channelThumbnail,
        access_token: tokens.access_token,
        refresh_token: refreshToken,
        expires_at: expiresAt,
        statistics: {
          subscriberCount: String(channel.statistics?.subscriberCount || "0"),
          viewCount: String(channel.statistics?.viewCount || "0"),
          videoCount: String(channel.statistics?.videoCount || "0"),
        },
      };

      const upsertAccount = async (onConflict: string) =>
        supabaseServer
          .from("youtube_accounts")
          .upsert(accountPayload, { onConflict });

      let accountResult = await upsertAccount("channel_id");
      if (accountResult.error) {
        const code = String((accountResult.error as any)?.code || "");
        const message = String((accountResult.error as any)?.message || "").toLowerCase();
        const conflictTargetMissing =
          code === "42P10" ||
          message.includes("no unique or exclusion constraint matching the on conflict specification");

        if (conflictTargetMissing) {
          // Backward-compatible fallback for installations that use a composite unique key.
          accountResult = await upsertAccount("user_id,channel_id");
        }
      }

      const [profileResult] = await Promise.all([
        supabaseServer
          .from("profiles")
          .upsert(
            {
              id: supabaseUserId,
              full_name: userInfo?.name || null,
              avatar_url: userInfo?.picture || null,
              channel_id: channel.id,
            },
            { onConflict: "id" },
          ),
      ]);

      if (profileResult.error) {
        console.error("Supabase profile upsert error:", profileResult.error);
      }

      if (accountResult.error) {
        console.error("Supabase YouTube account upsert error:", accountResult.error);
      }
    } catch (error) {
      console.error("Supabase OAuth persistence error:", error);
    }
  }

  async function resolveAccessTokenFromLegacyTokens(tokens: any): Promise<string | null> {
    const directAccessToken =
      typeof tokens?.access_token === "string" && tokens.access_token.trim()
        ? tokens.access_token.trim()
        : null;

    if (directAccessToken) {
      return directAccessToken;
    }

    const refreshToken =
      typeof tokens?.refresh_token === "string" && tokens.refresh_token.trim()
        ? tokens.refresh_token.trim()
        : null;

    if (!refreshToken) {
      return null;
    }

    try {
      const refreshClient = new OAuth2Client(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, redirectUri);
      refreshClient.setCredentials({ refresh_token: refreshToken });
      const refreshedToken = (await refreshClient.getAccessToken())?.token;
      return refreshedToken || null;
    } catch (error) {
      console.error("Failed to refresh access token from legacy account payload:", error);
      return null;
    }
  }

  async function getAuthHeaderForAccount(user: any) {
    const refreshToken = user?.tokens?.refresh_token;
    const fallbackAccessToken = user?.tokens?.access_token;
    const rawCacheScope = String(user?.channel?.id || user?.id || "").trim();
    const cacheScopeHeader = rawCacheScope ? { "X-VidVision-Cache-Scope": `channel:${rawCacheScope}` } : {};

    if (refreshToken) {
      try {
        const refreshClient = new OAuth2Client(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, redirectUri);
        refreshClient.setCredentials({ refresh_token: refreshToken });
        const refreshedToken = (await refreshClient.getAccessToken())?.token;
        if (refreshedToken) {
          return { Authorization: `Bearer ${refreshedToken}`, ...cacheScopeHeader };
        }
      } catch (error) {
        console.error("Failed to refresh OAuth token for request:", error);
      }
    }

    if (fallbackAccessToken) {
      return { Authorization: `Bearer ${fallbackAccessToken}`, ...cacheScopeHeader };
    }

    throw new Error("No OAuth token available for active account");
  }

  function mapYouTubeChannelToLegacyChannel(channel: any) {
    return {
      id: channel?.id || "",
      title: channel?.snippet?.title || "Untitled Channel",
      description: channel?.snippet?.description || "",
      thumbnails: channel?.snippet?.thumbnails?.default
        ? { default: channel.snippet.thumbnails.default }
        : channel?.snippet?.thumbnails || {},
      statistics: {
        subscriberCount: String(channel?.statistics?.subscriberCount || "0"),
        viewCount: String(channel?.statistics?.viewCount || "0"),
        videoCount: String(channel?.statistics?.videoCount || "0"),
      },
    };
  }

  async function refreshActiveYouTubeChannel(req: express.Request, user: any) {
    if (!user?.channel?.id) {
      return user;
    }

    const authHeader = await getAuthHeaderForAccount(user);
    const response = await fetch(
      "https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true",
      {
        headers: {
          ...authHeader,
          "Cache-Control": "no-cache",
        },
      },
    );
    const data = await response.json().catch(() => ({}));

    if (!response.ok || data?.error) {
      const upstream = extractYouTubeError(
        data,
        "Failed to refresh channel stats from YouTube",
        response.status,
      );
      throw new Error(upstream.message);
    }

    const refreshedChannel =
      (data?.items || []).find((item: any) => item?.id === user.channel.id) ||
      data?.items?.[0];

    if (!refreshedChannel) {
      throw new Error("No YouTube channel data was returned during refresh");
    }

    const refreshedUser = {
      ...user,
      channel: mapYouTubeChannelToLegacyChannel(refreshedChannel),
    };

    const authUser = await verifyUser(req);
    if (authUser?.id) {
      const accessToken = String(authHeader.Authorization || "").replace(/^Bearer\s+/i, "").trim();
      await persistYouTubeAccountToSupabase(
        authUser.id,
        {
          id: user.id,
          name: user.name,
          picture: user.picture,
        },
        refreshedChannel,
        {
          access_token: accessToken || user?.tokens?.access_token,
          refresh_token: user?.tokens?.refresh_token,
          expiry_date: user?.tokens?.expiry_date,
        },
      );
    }

    const sessionState = getSessionAccountsAndActiveIndex(req);
    if (sessionState.accounts.length > 0) {
      const refreshedAccounts = sessionState.accounts.map((account: any) =>
        account?.channel?.id === refreshedUser.channel.id
          ? { ...account, channel: refreshedUser.channel }
          : account,
      );
      const nextActiveIndex = Math.min(
        Math.max(sessionState.activeIndex, 0),
        Math.max(refreshedAccounts.length - 1, 0),
      );
      setSessionAccountsAndActiveIndex(req, refreshedAccounts, nextActiveIndex);
    }

    return refreshedUser;
  }

  function parseMaxResults(rawValue: unknown, fallback: number = 50): number {
    const raw = Array.isArray(rawValue) ? rawValue[0] : rawValue;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }

    return Math.min(50, Math.max(1, Math.floor(parsed)));
  }

  function normalizeYouTubeSearchQuery(rawValue: unknown): string {
    return String(rawValue || "")
      .toLowerCase()
      .trim()
      .replace(/\s+/g, " ");
  }

  function normalizeYouTubeSearchQueries(queries: unknown[], limit: number = 5): string[] {
    const deduped = new Set<string>();
    const normalized: string[] = [];

    for (const query of queries) {
      const cleanQuery = normalizeYouTubeSearchQuery(query);
      if (!cleanQuery || deduped.has(cleanQuery)) continue;
      deduped.add(cleanQuery);
      normalized.push(cleanQuery);
      if (normalized.length >= limit) break;
    }

    return normalized;
  }

  async function fetchMineVideoSeeds(authHeader: any, maxResults: number) {
    const boundedMaxResults = Math.min(50, Math.max(1, Math.floor(maxResults)));

    try {
      // 1. Fetch channel info to get uploads playlist ID (1 quota)
      const channelsResponse = await fetch(
        'https://www.googleapis.com/youtube/v3/channels?part=contentDetails&mine=true',
        { headers: authHeader }
      );
      const channelsData = await channelsResponse.json().catch(() => ({}));

      if (!channelsResponse.ok || channelsData?.error) {
        const upstream = extractYouTubeError(
          channelsData,
          'Failed to fetch channel uploads playlist from YouTube',
          channelsResponse.status,
        );
        return {
          ok: false,
          step: 'channels',
          upstream,
        };
      }

      const uploadsPlaylistId = channelsData?.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
      if (!uploadsPlaylistId) {
        return { ok: true, seeds: [] };
      }

      // 2. Fetch playlist items to get video IDs (1 quota per 50 items)
      const playlistResponse = await fetch(
        `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId=${encodeURIComponent(uploadsPlaylistId)}&maxResults=${boundedMaxResults}`,
        { headers: authHeader }
      );
      const playlistData = await playlistResponse.json().catch(() => ({}));

      if (!playlistResponse.ok || playlistData?.error) {
        const upstream = extractYouTubeError(
          playlistData,
          'Failed to fetch uploaded videos from YouTube',
          playlistResponse.status,
        );
        return {
          ok: false,
          step: 'playlistItems',
          upstream,
        };
      }

      const seeds = (playlistData.items || [])
        .map((item: any) => ({
          videoId: String(item?.contentDetails?.videoId || '').trim(),
          title: String(item?.snippet?.title || '').trim(),
        }))
        .filter((seed: any) => seed.videoId);

      return { ok: true, seeds };
    } catch (error: any) {
      const upstream = extractYouTubeError(
        {},
        error?.message || 'Unexpected error fetching playlist',
        500,
      );
      return {
        ok: false,
        step: 'playlistItems',
        upstream,
      };
    }
  }

  async function persistLegacyAccountToSupabase(supabaseUserId: string, legacyAccount: any) {
    const channel = legacyAccount?.channel;
    if (!channel?.id) {
      return false;
    }

    const accessToken = await resolveAccessTokenFromLegacyTokens(legacyAccount?.tokens || {});
    if (!accessToken) {
      return false;
    }

    const refreshToken =
      typeof legacyAccount?.tokens?.refresh_token === "string"
        ? legacyAccount.tokens.refresh_token
        : "";

    const expiryDate = Number(legacyAccount?.tokens?.expiry_date);

    await persistYouTubeAccountToSupabase(
      supabaseUserId,
      {
        id: legacyAccount?.id,
        name: legacyAccount?.name,
        picture: legacyAccount?.picture,
      },
      {
        id: channel.id,
        snippet: {
          title: channel.title,
          description: channel.description,
          thumbnails: channel.thumbnails,
        },
        statistics: channel.statistics,
      },
      {
        access_token: accessToken,
        refresh_token: refreshToken,
        expiry_date: Number.isFinite(expiryDate) ? expiryDate : undefined,
      },
    );

    return true;
  }

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

  async function getActiveYouTubeUser(req: express.Request) {
    const authUser = await verifyUser(req);
    if (authUser) {
      try {
        const [{ data: profile, error: profileError }, { data: rawAccounts, error: accountsError }] = await Promise.all([
          supabaseServer
            .from("profiles")
            .select("id, full_name, avatar_url, channel_id")
            .eq("id", authUser.id)
            .maybeSingle(),
          supabaseServer
            .from("youtube_accounts")
            .select("id, user_id, google_id, channel_id, channel_title, channel_description, channel_thumbnail, statistics, access_token, refresh_token, expires_at")
            .eq("user_id", authUser.id)
            .order("created_at", { ascending: false }),
        ]);

        if (profileError && profileError.code !== "PGRST116") {
          console.error("Supabase active profile fetch error:", profileError);
        }

        if (!accountsError && (rawAccounts || []).length > 0) {
          const accounts = (rawAccounts || []) as SupabaseYouTubeAccountRow[];
          const selectedAccount = profile?.channel_id
            ? accounts.find((account) => account.channel_id === profile.channel_id) || accounts[0]
            : accounts[0];

          if (selectedAccount) {
            return mapSupabaseAccountToLegacyUser(
              (profile as SupabaseProfileRow | null) || null,
              selectedAccount,
            );
          }
        } else if (accountsError) {
          console.error("Supabase active account fetch error:", accountsError);
        }
      } catch (error) {
        console.error("Supabase active account resolution error:", error);
      }
    }

    const { accounts, activeIndex } = getSessionAccountsAndActiveIndex(req);
    return accounts[activeIndex] || null;
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
        const user = await getActiveYouTubeUser(req);
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
  app.get("/auth/callback", (req, res) => {
    const redirectUrl = new URL(appUrl);

    for (const [key, value] of Object.entries(req.query || {})) {
      if (Array.isArray(value)) {
        value.forEach((entry) => redirectUrl.searchParams.append(key, String(entry)));
      } else if (typeof value !== "undefined") {
        redirectUrl.searchParams.set(key, String(value));
      }
    }

    res.redirect(307, redirectUrl.toString());
  });

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

  app.post("/api/auth/finalize-youtube", async (req, res) => {
    const authUser = await verifyUser(req);
    if (!authUser) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    try {
      const sessionState = getSessionAccountsAndActiveIndex(req);
      const session = sessionState.session as any;
      const pendingAccount = session.pendingYouTubeAccount || null;
      const activeAccount = sessionState.accounts[sessionState.activeIndex] || sessionState.accounts[0] || null;
      const accountToPersist = pendingAccount || activeAccount;

      if (!accountToPersist) {
        return res.status(200).json({ success: true, persisted: false, reason: "No pending account data" });
      }

      const persisted = await persistLegacyAccountToSupabase(authUser.id, accountToPersist);
      delete session.pendingYouTubeAccount;
      return res.json({ success: true, persisted });
    } catch (error) {
      console.error("Finalize YouTube auth error:", error);
      return res.status(500).json({ error: "Failed to finalize YouTube account" });
    }
  });

  app.get("/api/auth/google/url", async (req, res) => {
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

    const authUser = await verifyUser(req);
    if (!authUser) {
      return res.status(401).json({
        error: "Supabase sign-in required before connecting YouTube.",
      });
    }

    const url = oauth2Client.generateAuthUrl({
      access_type: "offline",
      include_granted_scopes: true,
      scope: [
        "https://www.googleapis.com/auth/youtube.readonly",
        // "https://www.googleapis.com/auth/youtube.force-ssl", // TODO: re-enable once Google re-approves with edit/delete scopes
        "https://www.googleapis.com/auth/yt-analytics.readonly",
        "https://www.googleapis.com/auth/userinfo.email",
        "https://www.googleapis.com/auth/userinfo.profile",
      ],
      prompt: "consent",
      state: encodeOAuthState(postAuthRedirect, authUser?.id || null),
    });
    console.log(`[Auth URL Generated] URL contains redirect_uri: ${url.includes(redirectUri)}`);
    res.json({ url });
  });

  // OAuth entry point for marketing site and direct YouTube auth flow
  app.get("/auth/youtube", (req, res) => {
    console.log(`[YouTube Auth Entry] Redirecting to Supabase auth bridge`);
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

    // Direct Google OAuth with identity + YouTube scopes in a single request.
    // Using our redirect_uri means the consent screen shows app.janso.studio.
    const url = oauth2Client.generateAuthUrl({
      access_type: "offline",
      include_granted_scopes: true,
      scope: [
        "https://www.googleapis.com/auth/userinfo.email",
        "https://www.googleapis.com/auth/userinfo.profile",
        "https://www.googleapis.com/auth/youtube.readonly",
        // "https://www.googleapis.com/auth/youtube.force-ssl", // TODO: re-enable once Google re-approves with edit/delete scopes
        "https://www.googleapis.com/auth/yt-analytics.readonly",
      ],
      prompt: "consent",
      state: encodeOAuthState(postAuthRedirect, null),
    });
    console.log(`[YouTube Auth Entry] Redirecting to Google OAuth with combined scopes`);
    res.redirect(url);
  });

  app.get(["/auth/google/callback", "/api/auth/google/callback"], async (req, res) => {
    const { code } = req.query;
    const { redirectTo: postAuthRedirect, supabaseUserId } = decodeOAuthState(
      Array.isArray(req.query.state) ? req.query.state[0] : req.query.state,
    );

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

      if (!userInfo.email) {
        return res.status(400).send("Google did not return an email address. Please try again.");
      }

      const youtubeResponse = await fetch(
        "https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true",
        {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        }
      );
      const youtubeData = await youtubeResponse.json();
      const channel = youtubeData.items?.[0];

      const { accounts } = getSessionAccountsAndActiveIndex(req);
      const existingAccount = accounts.find((account: any) => {
        if (channel?.id && account.channel?.id) {
          return account.channel.id === channel.id;
        }
        return account.id === userInfo.id;
      });

      // Keep session payload compact so account switching remains stable.
      const compactTokens = tokens.refresh_token
        ? { refresh_token: tokens.refresh_token }
        : existingAccount?.tokens?.refresh_token
          ? { refresh_token: existingAccount.tokens.refresh_token }
          : tokens.access_token
            ? { access_token: tokens.access_token }
            : null;

      if (!compactTokens) {
        return res.status(400).send("Google did not return a usable OAuth token.");
      }

      const newUserData = {
        id: userInfo.id,
        name: userInfo.name,
        picture: userInfo.picture,
        tokens: compactTokens,
        channel: channel
          ? {
              id: channel.id,
              title: channel.snippet.title,
              description: (channel.snippet.description || "").slice(0, 300),
              thumbnails: channel.snippet.thumbnails?.default
                ? { default: channel.snippet.thumbnails.default }
                : channel.snippet.thumbnails,
              statistics: {
                subscriberCount: channel.statistics?.subscriberCount || "0",
                viewCount: channel.statistics?.viewCount || "0",
                videoCount: channel.statistics?.videoCount || "0",
              },
            }
          : null,
      };

      // Deduplicate by channel ID when available so one Google login can keep multiple channels.
      const dedupedAccounts = accounts.filter((account: any) => {
        if (newUserData.channel && account.channel) {
          return account.channel.id !== newUserData.channel.id;
        }
        if (!newUserData.channel && !account.channel) {
          return account.id !== newUserData.id;
        }
        return true;
      });
      dedupedAccounts.unshift(newUserData);
      setSessionAccountsAndActiveIndex(req, dedupedAccounts.slice(0, 5), 0);
      (req.session as any).pendingYouTubeAccount = newUserData;

      if (!supabaseUserId) {
        // Combined flow (from /auth/youtube): create/find Supabase user via admin magic link,
        // persist the YouTube account, then redirect to establish the browser session.
        const { data: linkData, error: linkError } = await supabaseServer.auth.admin.generateLink({
          type: 'magiclink',
          email: userInfo.email,
          options: {
            data: {
              full_name: userInfo.name || null,
              avatar_url: userInfo.picture || null,
            },
            redirectTo: `${appUrl}/auth/callback`,
          },
        });

        if (linkError || !linkData?.properties?.action_link || !linkData?.user?.id) {
          console.error("[OAuth Callback] Failed to generate magic link:", linkError);
          return res.status(500).send("Authentication error - could not create your account. Please try again.");
        }

        await persistYouTubeAccountToSupabase(linkData.user.id, userInfo, channel, tokens);
        console.log(`[OAuth Callback] Combined flow: magic link generated for ${userInfo.email}`);
        return res.redirect(307, linkData.properties.action_link);
      }

      await persistYouTubeAccountToSupabase(supabaseUserId, userInfo, channel, tokens);

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

    const activeAccount = accounts[activeIndex] || accounts[0] || null;
    if (!activeAccount) {
      return res.json({ accounts: [], activeIndex: 0 });
    }

    const { tokens, ...safeAccount } = activeAccount;
    res.json({ accounts: [safeAccount], activeIndex: 0 });
  });

  app.post("/api/user/switch", async (req, res) => {
    return res.status(410).json({ error: "Multi-account switching has been removed." });
  });

  app.post("/api/user/remove", async (req, res) => {
    return res.status(410).json({ error: "Multi-account removal has been removed." });
  });

  app.get("/api/user/channel", async (req, res) => {
    const { accounts, activeIndex } = await getUnifiedAccountsAndActiveIndex(req);
    let user = accounts[activeIndex];
    if (!user) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    if (req.query.refresh === "1") {
      try {
        user = await refreshActiveYouTubeChannel(req, user);
      } catch (error) {
        console.error("Channel refresh error:", error);
        return res.status(502).json({ error: error instanceof Error ? error.message : "Failed to refresh channel" });
      }
    }

    const { tokens, ...safeUser } = user;
    res.json(safeUser);
  });

  app.get("/api/user/coach-history", async (req, res) => {
    const coachHistoryUserId = await resolveCoachHistoryUserId(req);
    if (!coachHistoryUserId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    try {
      const { data, error } = await supabaseServer
        .from("saved_content")
        .select("data, updated_at")
        .eq("user_id", coachHistoryUserId)
        .eq("content_type", "coach_history")
        .eq("title", "__singleton__")
        .order("updated_at", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1);

      if (error) {
        console.error("Coach history fetch error:", error);
        return res.status(500).json({ error: "Failed to load coach history" });
      }

      const row = Array.isArray(data) ? data[0] : null;
      res.json({
        conversations: Array.isArray(row?.data?.conversations) ? row.data.conversations : [],
        updatedAt: row?.updated_at || null,
      });
    } catch (error) {
      console.error("Coach history fetch exception:", error);
      res.status(500).json({ error: "Failed to load coach history" });
    }
  });

  app.put("/api/user/coach-history", async (req, res) => {
    const coachHistoryUserId = await resolveCoachHistoryUserId(req);
    if (!coachHistoryUserId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const conversations = Array.isArray(req.body?.conversations) ? req.body.conversations : null;
    if (!conversations) {
      return res.status(400).json({ error: "conversations array is required" });
    }

    try {
      const { data: existingRows, error: fetchError } = await supabaseServer
        .from("saved_content")
        .select("id")
        .eq("user_id", coachHistoryUserId)
        .eq("content_type", "coach_history")
        .eq("title", "__singleton__")
        .order("updated_at", { ascending: false })
        .order("created_at", { ascending: false });

      if (fetchError) {
        console.error("Coach history existing-row fetch error:", fetchError);
        return res.status(500).json({ error: "Failed to save coach history" });
      }

      const [primaryRow, ...duplicateRows] = (existingRows || []) as Array<{ id: string }>;
      const updatedAt = new Date().toISOString();

      if (primaryRow) {
        const { error: updateError } = await supabaseServer
          .from("saved_content")
          .update({ data: { conversations }, updated_at: updatedAt })
          .eq("id", primaryRow.id);

        if (updateError) {
          console.error("Coach history update error:", updateError);
          return res.status(500).json({ error: "Failed to save coach history" });
        }

        if (duplicateRows.length > 0) {
          const { error: deleteError } = await supabaseServer
            .from("saved_content")
            .delete()
            .in("id", duplicateRows.map((row) => row.id));

          if (deleteError) {
            console.error("Coach history duplicate cleanup error:", deleteError);
          }
        }
      } else {
        const { error: insertError } = await supabaseServer
          .from("saved_content")
          .insert({
            user_id: coachHistoryUserId,
            content_type: "coach_history",
            title: "__singleton__",
            data: { conversations },
          });

        if (insertError) {
          console.error("Coach history insert error:", insertError);
          return res.status(500).json({ error: "Failed to save coach history" });
        }
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Coach history save exception:", error);
      res.status(500).json({ error: "Failed to save coach history" });
    }
  });

  app.get("/api/user/tracked-competitors", async (req, res) => {
    const trackedCompetitorsUserId = await resolveCoachHistoryUserId(req);
    if (!trackedCompetitorsUserId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    try {
      const { data, error } = await supabaseServer
        .from("saved_content")
        .select("data, updated_at")
        .eq("user_id", trackedCompetitorsUserId)
        .eq("content_type", "competitor_analysis")
        .eq("title", "__singleton__")
        .order("updated_at", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1);

      if (error) {
        console.error("Tracked competitors fetch error:", error);
        return res.status(500).json({ error: "Failed to load tracked competitors" });
      }

      const row = Array.isArray(data) ? data[0] : null;
      res.json({
        competitors: Array.isArray(row?.data?.competitors) ? row.data.competitors : [],
        updatedAt: row?.updated_at || null,
      });
    } catch (error) {
      console.error("Tracked competitors fetch exception:", error);
      res.status(500).json({ error: "Failed to load tracked competitors" });
    }
  });

  app.put("/api/user/tracked-competitors", async (req, res) => {
    const trackedCompetitorsUserId = await resolveCoachHistoryUserId(req);
    if (!trackedCompetitorsUserId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const competitors = Array.isArray(req.body?.competitors) ? req.body.competitors : null;
    if (!competitors) {
      return res.status(400).json({ error: "competitors array is required" });
    }

    try {
      const { data: existingRows, error: fetchError } = await supabaseServer
        .from("saved_content")
        .select("id")
        .eq("user_id", trackedCompetitorsUserId)
        .eq("content_type", "competitor_analysis")
        .eq("title", "__singleton__")
        .order("updated_at", { ascending: false })
        .order("created_at", { ascending: false });

      if (fetchError) {
        console.error("Tracked competitors existing-row fetch error:", fetchError);
        return res.status(500).json({ error: "Failed to save tracked competitors" });
      }

      const [primaryRow, ...duplicateRows] = (existingRows || []) as Array<{ id: string }>;
      const updatedAt = new Date().toISOString();

      if (primaryRow) {
        const { error: updateError } = await supabaseServer
          .from("saved_content")
          .update({ data: { competitors }, updated_at: updatedAt })
          .eq("id", primaryRow.id);

        if (updateError) {
          console.error("Tracked competitors update error:", updateError);
          return res.status(500).json({ error: "Failed to save tracked competitors" });
        }

        if (duplicateRows.length > 0) {
          const { error: deleteError } = await supabaseServer
            .from("saved_content")
            .delete()
            .in("id", duplicateRows.map((row) => row.id));

          if (deleteError) {
            console.error("Tracked competitors duplicate cleanup error:", deleteError);
          }
        }
      } else {
        const { error: insertError } = await supabaseServer
          .from("saved_content")
          .insert({
            user_id: trackedCompetitorsUserId,
            content_type: "competitor_analysis",
            title: "__singleton__",
            data: { competitors },
          });

        if (insertError) {
          console.error("Tracked competitors insert error:", insertError);
          return res.status(500).json({ error: "Failed to save tracked competitors" });
        }
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Tracked competitors save exception:", error);
      res.status(500).json({ error: "Failed to save tracked competitors" });
    }
  });

  app.get("/api/user/saved-ideas", async (req, res) => {
    const savedIdeasUserId = await resolveCoachHistoryUserId(req);
    if (!savedIdeasUserId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    try {
      const { data, error } = await supabaseServer
        .from("saved_content")
        .select("data, updated_at")
        .eq("user_id", savedIdeasUserId)
        .eq("content_type", "script")
        .eq("title", "__saved_ideas__")
        .order("updated_at", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1);

      if (error) {
        console.error("Saved ideas fetch error:", error);
        return res.status(500).json({ error: "Failed to load saved ideas" });
      }

      const row = Array.isArray(data) ? data[0] : null;
      res.json({
        savedIdeas: Array.isArray(row?.data?.savedIdeas) ? row.data.savedIdeas : [],
        updatedAt: row?.updated_at || null,
      });
    } catch (error) {
      console.error("Saved ideas fetch exception:", error);
      res.status(500).json({ error: "Failed to load saved ideas" });
    }
  });

  app.put("/api/user/saved-ideas", async (req, res) => {
    const savedIdeasUserId = await resolveCoachHistoryUserId(req);
    if (!savedIdeasUserId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const savedIdeas = Array.isArray(req.body?.savedIdeas) ? req.body.savedIdeas : null;
    if (!savedIdeas) {
      return res.status(400).json({ error: "savedIdeas array is required" });
    }

    try {
      const { data: existingRows, error: fetchError } = await supabaseServer
        .from("saved_content")
        .select("id")
        .eq("user_id", savedIdeasUserId)
        .eq("content_type", "script")
        .eq("title", "__saved_ideas__")
        .order("updated_at", { ascending: false })
        .order("created_at", { ascending: false });

      if (fetchError) {
        console.error("Saved ideas existing-row fetch error:", fetchError);
        return res.status(500).json({ error: "Failed to save ideas" });
      }

      const [primaryRow, ...duplicateRows] = (existingRows || []) as Array<{ id: string }>;
      const updatedAt = new Date().toISOString();

      if (primaryRow) {
        const { error: updateError } = await supabaseServer
          .from("saved_content")
          .update({ data: { savedIdeas }, updated_at: updatedAt })
          .eq("id", primaryRow.id);

        if (updateError) {
          console.error("Saved ideas update error:", updateError);
          return res.status(500).json({ error: "Failed to save ideas" });
        }

        if (duplicateRows.length > 0) {
          const { error: deleteError } = await supabaseServer
            .from("saved_content")
            .delete()
            .in("id", duplicateRows.map((row) => row.id));

          if (deleteError) {
            console.error("Saved ideas duplicate cleanup error:", deleteError);
          }
        }
      } else {
        const { error: insertError } = await supabaseServer
          .from("saved_content")
          .insert({
            user_id: savedIdeasUserId,
            content_type: "script",
            title: "__saved_ideas__",
            data: { savedIdeas },
          });

        if (insertError) {
          console.error("Saved ideas insert error:", insertError);
          return res.status(500).json({ error: "Failed to save ideas" });
        }
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Saved ideas save exception:", error);
      res.status(500).json({ error: "Failed to save ideas" });
    }
  });

  app.get("/api/script/daily-placeholder", async (req, res) => {
    const user = await getActiveYouTubeUser(req);

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
      const authHeader = await getAuthHeaderForAccount(user);
      const recentSeedResult = await fetchMineVideoSeeds(authHeader, 6);
      if (recentSeedResult.ok) {
        recentTitles = recentSeedResult.seeds
          .map((seed: any) => seed.title)
          .filter((title: unknown) => typeof title === "string" && title.trim().length > 0)
          .slice(0, 6);
      }
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
    const user = await getActiveYouTubeUser(req);

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
      const authHeader = await getAuthHeaderForAccount(user);
      const recentSeedResult = await fetchMineVideoSeeds(authHeader, 30);

      if (recentSeedResult.ok === false) {
        const upstream = recentSeedResult.upstream;
        return res.status(upstream.httpStatus).json({
          error: upstream.message,
          upstream: {
            source: "youtube",
            step: "search",
            code: upstream.message,
            status: upstream.httpStatus,
            reason: upstream.message,
            message: upstream.message,
            isQuotaExceeded: false,
          },
        });
      }

      const videoIds = recentSeedResult.seeds
        .map((seed: any) => seed.videoId)
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
        `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${videoIds}`,
        { headers: authHeader }
      );

      if (!videosResponse.ok) {
        const errorPayload = await videosResponse.json().catch(() => ({}));
        const upstream = extractYouTubeError(
          errorPayload,
          "Failed to fetch detailed video data",
          videosResponse.status,
        );

        return res.status(videosResponse.status).json({
          error: upstream.message,
          upstream: {
            source: "youtube",
            step: "videos",
            code: upstream.code,
            status: upstream.status,
            reason: upstream.reason,
            message: upstream.message,
            isQuotaExceeded: upstream.isQuotaExceeded,
          },
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
    const user = await getActiveYouTubeUser(req);
    if (!user || !user.tokens) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    try {
      const authHeader = await getAuthHeaderForAccount(user);
      const maxResults = parseMaxResults(req.query.maxResults, 50);
      const recentSeedResult = await fetchMineVideoSeeds(authHeader, maxResults);

      if (recentSeedResult.ok === false) {
        const upstream = recentSeedResult.upstream;
        return res.status(upstream.httpStatus).json({
          error: upstream.message,
          upstream: {
            source: "youtube",
            step: "search",
            code: upstream.message,
            status: upstream.httpStatus,
            reason: upstream.message,
            message: upstream.message,
            isQuotaExceeded: false,
          },
        });
      }

      const videoIds = recentSeedResult.seeds
        .map((seed: any) => seed.videoId)
        .filter(Boolean)
        .join(",");

      if (!videoIds) {
        return res.json([]);
      }

      const statsResponse = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${videoIds}`,
        { headers: authHeader }
      );
      const statsData = await statsResponse.json().catch(() => ({}));

      if (!statsResponse.ok || statsData?.error) {
        const upstream = extractYouTubeError(
          statsData,
          "Failed to fetch video details from YouTube",
          statsResponse.status,
        );
        return res.status(upstream.httpStatus).json({
          error: upstream.message,
          upstream: {
            source: "youtube",
            step: "videos",
            code: upstream.code,
            status: upstream.status,
            reason: upstream.reason,
            message: upstream.message,
            isQuotaExceeded: upstream.isQuotaExceeded,
          },
        });
      }

      return res.json(statsData.items || []);
    } catch (error) {
      console.error("Fetch videos error:", error);
      return res.status(500).json({ error: "Failed to fetch videos" });
    }
  });

  app.get("/api/comments/fetch", async (req, res) => {
    const user = await getActiveYouTubeUser(req);
    if (!user || !user.tokens) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const rawVideoId = Array.isArray(req.query.videoId) ? req.query.videoId[0] : req.query.videoId;
    const videoId = typeof rawVideoId === "string" ? rawVideoId : "";
    if (!videoId) {
      return res.status(400).json({ error: "videoId is required" });
    }

    try {
      const authHeader = await getAuthHeaderForAccount(user);
      const commentsResponse = await fetch(
        `https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&videoId=${encodeURIComponent(videoId)}&maxResults=100&order=relevance&textFormat=plainText`,
        { headers: authHeader }
      );

      const commentsData = await commentsResponse.json().catch(() => ({}));
      if (!commentsResponse.ok || commentsData?.error) {
        const upstream = extractYouTubeError(
          commentsData,
          "Failed to fetch comments from YouTube",
          commentsResponse.status,
        );

        return res.status(upstream.httpStatus).json({
          error: upstream.message,
          upstream: {
            source: "youtube",
            step: "commentThreads",
            code: upstream.code,
            status: upstream.status,
            reason: upstream.reason,
            message: upstream.message,
            isQuotaExceeded: upstream.isQuotaExceeded,
          },
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
    const user = await getActiveYouTubeUser(req);
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
    const user = await getActiveYouTubeUser(req);
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
    const user = await getActiveYouTubeUser(req);
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

  app.get("/api/thumbnails/authorizations", async (req, res) => {
    const user = await getActiveYouTubeUser(req);
    if (!user || !user.tokens) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const queue = (req.session as any).thumbnailAuthorizations || [];
    res.json(queue);
  });

  app.post("/api/thumbnails/authorize", async (req, res) => {
    const user = await getActiveYouTubeUser(req);
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

  app.post("/api/thumbnails/authorize/clear", async (req, res) => {
    const user = await getActiveYouTubeUser(req);
    if (!user || !user.tokens) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    (req.session as any).thumbnailAuthorizations = [];
    res.json({ success: true, count: 0, queue: [] });
  });

  app.get("/api/shorts/my-long-videos", async (req, res) => {
    const user = await getActiveYouTubeUser(req);
    if (!user || !user.tokens) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    try {
      const authHeader = await getAuthHeaderForAccount(user);
      const recentSeedResult = await fetchMineVideoSeeds(authHeader, 50);

      if (recentSeedResult.ok === false) {
        const upstream = recentSeedResult.upstream;
        console.error("YouTube search API error:", upstream);
        return res.status(upstream.httpStatus).json({
          error: upstream.message,
          upstream: {
            source: "youtube",
            step: "search",
            code: upstream.message,
            status: upstream.httpStatus,
            reason: upstream.message,
            message: upstream.message,
            isQuotaExceeded: false,
          },
        });
      }

      const videoIds = recentSeedResult.seeds
        .map((seed: any) => seed.videoId)
        .filter(Boolean)
        .join(",");

      if (!videoIds) {
        return res.json([]);
      }

      const videosResponse = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${videoIds}`,
        { headers: authHeader }
      );
      
        if (!videosResponse.ok) {
          const errorData = await videosResponse.json().catch(() => ({}));
          console.error("YouTube videos API error:", errorData);
          const upstream = extractYouTubeError(
            errorData,
            "Failed to fetch video details from YouTube",
            videosResponse.status,
          );

          return res.status(upstream.httpStatus).json({
            error: upstream.message,
            upstream: {
              source: "youtube",
              step: "videos",
              code: upstream.code,
              status: upstream.status,
              reason: upstream.reason,
              message: upstream.message,
              isQuotaExceeded: upstream.isQuotaExceeded,
            },
          });
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
    const user = await getActiveYouTubeUser(req);
    const rawQuery = Array.isArray(req.query.q) ? req.query.q[0] : req.query.q;
    const query = normalizeYouTubeSearchQuery(rawQuery);

    if (!user || !user.tokens) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    if (!query) {
      return res.status(400).json({ error: "Query is required" });
    }

    try {
      const authHeader = await getAuthHeaderForAccount(user);

      const searchResponse = await fetch(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoDuration=short&maxResults=25&order=viewCount&q=${encodeURIComponent(query)}`,
        { headers: authHeader }
      );
      const searchData = await searchResponse.json();
      const videoIds = searchData.items?.map((item: any) => item.id.videoId).filter(Boolean).join(",");

      if (!videoIds) {
        return res.json([]);
      }

      const videosResponse = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${videoIds}`,
        { headers: authHeader }
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
    const user = await getActiveYouTubeUser(req);
    if (!user || !user.tokens) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    try {
      const authHeader = await getAuthHeaderForAccount(user);
      const recentSeedResult = await fetchMineVideoSeeds(authHeader, 50);

      if (recentSeedResult.ok === false) {
        return res.json({ 
          bestHour: null, 
          bestDay: null, 
          confidence: 'low',
          message: 'Not enough video data to analyze posting patterns' 
        });
      }

      const videoIds = recentSeedResult.seeds
        .map((seed: any) => seed.videoId)
        .join(",");
      if (!videoIds) {
        return res.json({ 
          bestHour: null, 
          bestDay: null, 
          confidence: 'low',
          message: 'Not enough video data to analyze posting patterns' 
        });
      }

      // Fetch detailed statistics (trimmed to snippet,statistics)
      const statsResponse = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${videoIds}`,
        {
          headers: authHeader,
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
    const user = await getActiveYouTubeUser(req);
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
    const user = await getActiveYouTubeUser(req);
    if (!user || !user.tokens) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    if (!user.channel) {
      return res.status(400).json({ error: "No channel connected" });
    }

    try {
      const authHeader = await getAuthHeaderForAccount(user);

      // Fetch user's recent videos to analyze niche using helper
      const recentSeedResult = await fetchMineVideoSeeds(authHeader, 10);

      if (recentSeedResult.ok === false) {
        const upstream = recentSeedResult.upstream;
        return res.status(upstream.httpStatus).json({
          error: upstream.message,
          upstream: upstream,
        });
      }

      const myVideoIds = recentSeedResult.seeds
        .map((item: any) => item.videoId)
        .filter(Boolean)
        .join(",");

      if (!myVideoIds) {
        return res.json({ 
          message: 'Not enough video data to discover competitors',
          suggestions: [] 
        });
      }

      // Get detailed info including tags
      const myStatsResponse = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${myVideoIds}`,
        { headers: authHeader }
      );
      const myStatsData = await myStatsResponse.json().catch(() => ({}));

      if (!myStatsResponse.ok || myStatsData?.error) {
        const statusCode = Number(myStatsData?.error?.code) || myStatsResponse.status || 500;
        return res.status(statusCode).json({
          error: myStatsData?.error?.message || "Failed to fetch video stats from YouTube",
          upstream: myStatsData?.error || null,
        });
      }

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
      const normalizedSearchQueries = normalizeYouTubeSearchQueries(searchQueries, 3);

      if (normalizedSearchQueries.length === 0) {
        const fallbackQuery = normalizeYouTubeSearchQuery(user.channel.title || nicheDescription);
        if (fallbackQuery) {
          normalizedSearchQueries.push(fallbackQuery);
        }
      }

      const collectCompetitorsForQuery = async (searchQuery: string) => {
        try {
          const searchResponse = await fetch(
            `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${encodeURIComponent(searchQuery)}&maxResults=10&order=relevance`,
            { headers: authHeader }
          );
          const searchData = await searchResponse.json().catch(() => ({}));

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
          console.error(`Search error for query "${searchQuery}":`, searchError);
        }
      };

      for (const searchQuery of normalizedSearchQueries.slice(0, 2)) {
        await collectCompetitorsForQuery(searchQuery);
      }

      if (competitorChannels.size < 6 && normalizedSearchQueries.length > 2) {
        await collectCompetitorsForQuery(normalizedSearchQueries[2]);
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
        { headers: authHeader }
      );
      const channelsStatsData = await channelsStatsResponse.json().catch(() => ({}));

      if (!channelsStatsResponse.ok || channelsStatsData?.error) {
        const statusCode = Number(channelsStatsData?.error?.code) || channelsStatsResponse.status || 500;
        return res.status(statusCode).json({
          error: channelsStatsData?.error?.message || "Failed to fetch competitor channel stats from YouTube",
          upstream: channelsStatsData?.error || null,
        });
      }

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

  app.post("/api/collaborators/search", async (req, res) => {
    const user = await getActiveYouTubeUser(req);
    if (!user || !user.tokens) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const niche = normalizeYouTubeSearchQuery(req.body?.niche);
    const minSubscribers = Math.max(0, toNumber(req.body?.minSubscribers));
    const rawMax = toNumber(req.body?.maxSubscribers || Number.MAX_SAFE_INTEGER);
    const maxSubscribers = Math.max(minSubscribers, rawMax);
    const maxResults = Math.min(Math.max(toNumber(req.body?.maxResults || 15), 1), 25);

    if (!niche) {
      return res.status(400).json({ error: "niche is required" });
    }

    try {
      const authHeader = await getAuthHeaderForAccount(user);
      const searchResponse = await fetch(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${encodeURIComponent(niche)}&maxResults=${Math.min(maxResults * 2, 50)}&order=relevance`,
        { headers: authHeader }
      );
      const searchData = await searchResponse.json().catch(() => ({}));

      if (!searchResponse.ok || searchData?.error) {
        const statusCode = Number(searchData?.error?.code) || searchResponse.status || 500;
        return res.status(statusCode).json({
          error: searchData?.error?.message || "Failed to search collaborator channels on YouTube",
          upstream: searchData?.error || null,
        });
      }

      const channelIds = Array.from(
        new Set(
          (searchData.items || [])
            .map((item: any) => item?.snippet?.channelId || item?.id?.channelId)
            .filter(Boolean)
        )
      ).slice(0, 50);

      if (channelIds.length === 0) {
        return res.json({ creators: [] });
      }

      const channelsResponse = await fetch(
        `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id=${channelIds.join(",")}`,
        { headers: authHeader }
      );
      const channelsData = await channelsResponse.json().catch(() => ({}));

      if (!channelsResponse.ok || channelsData?.error) {
        const statusCode = Number(channelsData?.error?.code) || channelsResponse.status || 500;
        return res.status(statusCode).json({
          error: channelsData?.error?.message || "Failed to load collaborator channel stats",
          upstream: channelsData?.error || null,
        });
      }

      const creators = (channelsData.items || [])
        .filter((channel: any) => {
          const subscribers = toNumber(channel?.statistics?.subscriberCount);
          return subscribers >= minSubscribers && subscribers <= maxSubscribers;
        })
        .slice(0, maxResults)
        .map((channel: any) => ({
          id: channel.id,
          title: channel?.snippet?.title || "Untitled Channel",
          description: channel?.snippet?.description || "",
          customUrl: channel?.snippet?.customUrl || undefined,
          thumbnails: channel?.snippet?.thumbnails || {},
          statistics: {
            subscriberCount: String(channel?.statistics?.subscriberCount || "0"),
            videoCount: String(channel?.statistics?.videoCount || "0"),
            viewCount: String(channel?.statistics?.viewCount || "0"),
          },
        }));

      res.json({ creators });
    } catch (error) {
      console.error("Search collaborators error:", error);
      res.status(500).json({ error: "Failed to search collaborators" });
    }
  });

  app.get("/api/collaborators/videos", async (req, res) => {
    const user = await getActiveYouTubeUser(req);
    if (!user || !user.tokens) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const rawChannelId = Array.isArray(req.query.channelId) ? req.query.channelId[0] : req.query.channelId;
    const channelId = typeof rawChannelId === "string" ? rawChannelId : "";
    if (!channelId) {
      return res.status(400).json({ error: "channelId is required" });
    }

    try {
      const authHeader = await getAuthHeaderForAccount(user);

      const channelResponse = await fetch(
        `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=${encodeURIComponent(channelId)}`,
        { headers: authHeader }
      );
      const channelData = await channelResponse.json().catch(() => ({}));

      if (!channelResponse.ok || channelData?.error) {
        const statusCode = Number(channelData?.error?.code) || channelResponse.status || 500;
        return res.status(statusCode).json({
          error: channelData?.error?.message || "Failed to fetch collaborator channel details",
          upstream: channelData?.error || null,
        });
      }

      const uploadsPlaylistId = channelData?.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
      if (!uploadsPlaylistId) {
        return res.json({ videos: [] });
      }

      const playlistResponse = await fetch(
        `https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&playlistId=${uploadsPlaylistId}&maxResults=12`,
        { headers: authHeader }
      );
      const playlistData = await playlistResponse.json().catch(() => ({}));

      if (!playlistResponse.ok || playlistData?.error) {
        const statusCode = Number(playlistData?.error?.code) || playlistResponse.status || 500;
        return res.status(statusCode).json({
          error: playlistData?.error?.message || "Failed to fetch collaborator uploads playlist",
          upstream: playlistData?.error || null,
        });
      }

      const videoIds = (playlistData.items || [])
        .map((item: any) => item?.contentDetails?.videoId)
        .filter(Boolean)
        .join(",");

      if (!videoIds) {
        return res.json({ videos: [] });
      }

      const videosResponse = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${videoIds}`,
        { headers: authHeader }
      );
      const videosData = await videosResponse.json().catch(() => ({}));

      if (!videosResponse.ok || videosData?.error) {
        const statusCode = Number(videosData?.error?.code) || videosResponse.status || 500;
        return res.status(statusCode).json({
          error: videosData?.error?.message || "Failed to fetch collaborator video stats",
          upstream: videosData?.error || null,
        });
      }

      const videos = (videosData.items || []).map((video: any) => ({
        id: video.id,
        title: video?.snippet?.title || "Untitled",
        viewCount: toNumber(video?.statistics?.viewCount),
        publishedAt: video?.snippet?.publishedAt || null,
      }));

      res.json({ videos });
    } catch (error) {
      console.error("Fetch collaborator videos error:", error);
      res.status(500).json({ error: "Failed to fetch collaborator videos" });
    }
  });

  app.get("/api/competitors/search", async (req, res) => {
    const user = await getActiveYouTubeUser(req);
    if (!user || !user.tokens) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const rawQuery = Array.isArray(req.query.q) ? req.query.q[0] : req.query.q;
    const query = normalizeYouTubeSearchQuery(rawQuery);
    if (!query) {
      return res.status(400).json({ error: "q is required" });
    }

    try {
      const authHeader = await getAuthHeaderForAccount(user);
      const response = await fetch(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${encodeURIComponent(query)}&maxResults=5`,
        { headers: authHeader }
      );
      const data = await response.json().catch(() => ({}));

      if (!response.ok || data?.error) {
        const statusCode = Number(data?.error?.code) || response.status || 500;
        return res.status(statusCode).json({
          error: data?.error?.message || "Failed to search competitor channels on YouTube",
          upstream: data?.error || null,
        });
      }

      res.json(data.items || []);
    } catch (error) {
      console.error("Search competitors error:", error);
      res.status(500).json({ error: "Failed to search competitors" });
    }
  });

  app.get("/api/competitors/videos", async (req, res) => {
    const user = await getActiveYouTubeUser(req);
    if (!user || !user.tokens) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const rawChannelId = Array.isArray(req.query.channelId) ? req.query.channelId[0] : req.query.channelId;
    const channelId = typeof rawChannelId === "string" ? rawChannelId : "";
    if (!channelId) {
      return res.status(400).json({ error: "channelId is required" });
    }

    try {
      const authHeader = await getAuthHeaderForAccount(user);

      const channelResponse = await fetch(
        `https://www.googleapis.com/youtube/v3/channels?part=contentDetails,statistics,snippet&id=${encodeURIComponent(channelId)}`,
        { headers: authHeader }
      );
      const channelData = await channelResponse.json().catch(() => ({}));

      if (!channelResponse.ok || channelData?.error) {
        const statusCode = Number(channelData?.error?.code) || channelResponse.status || 500;
        return res.status(statusCode).json({
          error: channelData?.error?.message || "Failed to fetch competitor channel details",
          upstream: channelData?.error || null,
        });
      }

      const channel = channelData.items?.[0];
      if (!channel) {
        return res.status(404).json({ error: "Channel not found" });
      }

      const uploadsPlaylistId = channel?.contentDetails?.relatedPlaylists?.uploads;
      if (!uploadsPlaylistId) {
        return res.status(404).json({ error: "Uploads playlist not found" });
      }

      const playlistResponse = await fetch(
        `https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&playlistId=${uploadsPlaylistId}&maxResults=20`,
        { headers: authHeader }
      );
      const playlistData = await playlistResponse.json().catch(() => ({}));

      if (!playlistResponse.ok || playlistData?.error) {
        const statusCode = Number(playlistData?.error?.code) || playlistResponse.status || 500;
        return res.status(statusCode).json({
          error: playlistData?.error?.message || "Failed to fetch competitor uploads playlist",
          upstream: playlistData?.error || null,
        });
      }

      const videoIds = (playlistData.items || [])
        .map((item: any) => item?.contentDetails?.videoId)
        .filter(Boolean)
        .join(",");

      const rawCustomUrl = channel.snippet?.customUrl;
      const normalizedCustomUrl = rawCustomUrl
        ? String(rawCustomUrl).replace(/^https?:\/\/(www\.)?youtube\.com\//i, "")
        : "";
      const channelPath = normalizedCustomUrl
        ? normalizedCustomUrl.startsWith("@") ||
          normalizedCustomUrl.startsWith("c/") ||
          normalizedCustomUrl.startsWith("user/") ||
          normalizedCustomUrl.startsWith("channel/")
          ? normalizedCustomUrl
          : `@${normalizedCustomUrl}`
        : channel.id
          ? `channel/${channel.id}`
          : "";
      const channelUrl = channelPath ? `https://www.youtube.com/${channelPath}` : undefined;

      if (videoIds) {
        const statsResponse = await fetch(
          `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${videoIds}`,
          { headers: authHeader }
        );
        const statsData = await statsResponse.json().catch(() => ({}));

        if (!statsResponse.ok || statsData?.error) {
          const statusCode = Number(statsData?.error?.code) || statsResponse.status || 500;
          return res.status(statusCode).json({
            error: statsData?.error?.message || "Failed to fetch competitor video stats",
            upstream: statsData?.error || null,
          });
        }

        const sortedVideos = (statsData.items || []).sort(
          (a: any, b: any) => parseInt(b.statistics.viewCount) - parseInt(a.statistics.viewCount)
        );

        return res.json({
          channel: {
            id: channel.id,
            title: channel.snippet.title,
            description: channel.snippet.description,
            thumbnails: channel.snippet.thumbnails,
            customUrl: rawCustomUrl,
            channelUrl,
            statistics: channel.statistics,
          },
          videos: sortedVideos,
        });
      }

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
    const user = await getActiveYouTubeUser(req);
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

  type SnapshotMetric = {
    date: string;
    subscriberCount: number;
    videoCount: number;
    viewCount: number;
    estimatedDailyViews: number;
    subscriberGrowth?: number;
    viewGrowth?: number;
    videoGrowth?: number;
  };

  const getIsoDateDaysAgo = (days: number): string => {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    return cutoffDate.toISOString().split("T")[0];
  };

  const mapSupabaseSnapshotRow = (row: any): SnapshotMetric => ({
    date: String(row?.snapshot_date || ""),
    subscriberCount: toNumber(row?.subscribers),
    videoCount: toNumber(row?.video_count),
    viewCount: toNumber(row?.total_views),
    estimatedDailyViews: toNumber(row?.estimated_daily_views),
  });

  const attachGrowthDeltas = (snapshots: SnapshotMetric[]): SnapshotMetric[] =>
    snapshots.map((current, index) => {
      if (index === 0) {
        return current;
      }

      const previous = snapshots[index - 1];
      return {
        ...current,
        subscriberGrowth: current.subscriberCount - previous.subscriberCount,
        viewGrowth: current.viewCount - previous.viewCount,
        videoGrowth: current.videoCount - previous.videoCount,
      };
    });

  const summarizeGrowth = (snapshots: SnapshotMetric[]) => {
    if (snapshots.length < 2) {
      return null;
    }

    const first = snapshots[0];
    const last = snapshots[snapshots.length - 1];

    const avgDailyViews =
      snapshots.length > 0
        ? Math.round(
            snapshots.reduce((sum, snapshot) => sum + toNumber(snapshot.estimatedDailyViews), 0) / snapshots.length,
          )
        : 0;

    return {
      period: `${snapshots.length} days`,
      subscriberGrowth: last.subscriberCount - first.subscriberCount,
      subscriberGrowthPct:
        first.subscriberCount > 0
          ? Number((((last.subscriberCount - first.subscriberCount) / first.subscriberCount) * 100).toFixed(2))
          : 0,
      viewGrowth: last.viewCount - first.viewCount,
      videoGrowth: last.videoCount - first.videoCount,
      avgDailyViews,
    };
  };

  const filterSnapshotsByDays = (snapshots: SnapshotMetric[], days: number): SnapshotMetric[] => {
    const cutoffIso = getIsoDateDaysAgo(days);
    return snapshots.filter((snapshot) => snapshot.date >= cutoffIso);
  };

  async function getEstimatedDailyViews(authHeader: Record<string, string>): Promise<number | null> {
    const endDate = new Date().toISOString().split("T")[0];
    const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    try {
      const analyticsResponse = await fetch(
        `https://youtubeanalytics.googleapis.com/v2/reports?ids=channel==MINE&startDate=${startDate}&endDate=${endDate}&metrics=views&dimensions=day&sort=day`,
        { headers: authHeader },
      );

      if (!analyticsResponse.ok) {
        const errorText = await analyticsResponse.text().catch(() => "");
        console.warn("Daily views analytics request failed:", analyticsResponse.status, errorText);
        return null;
      }

      const analyticsData = await analyticsResponse.json();
      if (analyticsData?.error) {
        console.warn("Daily views analytics API error:", analyticsData.error);
        return null;
      }

      const rows = analyticsData.rows || [];
      if (rows.length === 0) {
        return null;
      }

      const totalViews = rows.reduce((sum: number, row: any[]) => sum + toNumber(row[1] ?? row[0]), 0);
      return Math.round(totalViews / Math.max(1, rows.length));
    } catch (error) {
      console.warn("Failed to fetch daily views for snapshot:", error);
      return null;
    }
  }

  async function getFallbackEstimatedDailyViews(
    channelId: string,
    snapshotUserId: string | null,
    currentViewCount: number,
  ): Promise<number | null> {
    if (HAS_SUPABASE_SERVER && snapshotUserId) {
      try {
        const { data, error } = await supabaseServer
          .from("channel_snapshots")
          .select("total_views")
          .eq("user_id", snapshotUserId)
          .eq("channel_id", channelId)
          .order("snapshot_date", { ascending: false })
          .limit(1);

        if (!error && Array.isArray(data) && data.length > 0) {
          return Math.max(0, currentViewCount - toNumber(data[0]?.total_views));
        }

        if (error) {
          console.warn("Daily views fallback snapshot lookup failed:", error);
        }
      } catch (error) {
        console.warn("Daily views fallback snapshot lookup exception:", error);
      }
    }

    const latest = getLatestSnapshot(channelId);
    if (latest?.viewCount !== undefined) {
      return Math.max(0, currentViewCount - toNumber(latest.viewCount));
    }

    return null;
  }

  async function resolveSnapshotUserId(req: express.Request, channelId: string): Promise<string | null> {
    const authUser = await verifyUser(req);
    if (authUser?.id) {
      return authUser.id;
    }

    if (!HAS_SUPABASE_SERVER) {
      return null;
    }

    try {
      const { data, error } = await supabaseServer
        .from("youtube_accounts")
        .select("user_id")
        .eq("channel_id", channelId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error("Snapshot user_id lookup error:", error);
        return null;
      }

      return data?.user_id ? String(data.user_id) : null;
    } catch (error) {
      console.error("Snapshot user_id lookup exception:", error);
      return null;
    }
  }

  async function resolveCoachHistoryUserId(req: express.Request): Promise<string | null> {
    const authUser = await verifyUser(req);
    if (authUser?.id) {
      return authUser.id;
    }

    if (!HAS_SUPABASE_SERVER) {
      return null;
    }

    try {
      const sessionState = getSessionAccountsAndActiveIndex(req);
      const activeAccount =
        sessionState.accounts[sessionState.activeIndex] || sessionState.accounts[0] || null;
      const channelId = String(activeAccount?.channel?.id || "").trim();

      if (!channelId) {
        return null;
      }

      const { data, error } = await supabaseServer
        .from("youtube_accounts")
        .select("user_id")
        .eq("channel_id", channelId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error("Coach history user_id lookup error:", error);
        return null;
      }

      return data?.user_id ? String(data.user_id) : null;
    } catch (error) {
      console.error("Coach history user_id lookup exception:", error);
      return null;
    }
  }

  async function fetchSupabaseSnapshots(
    channelId: string,
    days: number,
    snapshotUserId: string | null,
  ): Promise<SnapshotMetric[] | null> {
    if (!HAS_SUPABASE_SERVER || !snapshotUserId) {
      return null;
    }

    try {
      const cutoffIso = getIsoDateDaysAgo(days);
      const { data, error } = await supabaseServer
        .from("channel_snapshots")
        .select("snapshot_date, subscribers, video_count, total_views, estimated_daily_views")
        .eq("user_id", snapshotUserId)
        .eq("channel_id", channelId)
        .gte("snapshot_date", cutoffIso)
        .order("snapshot_date", { ascending: true });

      if (error) {
        console.error("Supabase snapshot fetch error:", error);
        return null;
      }

      return attachGrowthDeltas((data || []).map(mapSupabaseSnapshotRow));
    } catch (error) {
      console.error("Supabase snapshot fetch exception:", error);
      return null;
    }
  }

  async function saveSnapshot(
    req: express.Request,
    user: any,
    force: boolean,
    snapshotUserId: string | null,
  ): Promise<{ snapshot: SnapshotMetric; created: boolean; storage: "supabase" | "sqlite" }> {
    const channelId = String(user.channel.id || "").trim();
    const snapshotDate = new Date().toISOString().split("T")[0];
    const subscribers = toNumber(user.channel.statistics?.subscriberCount);
    const videoCount = toNumber(user.channel.statistics?.videoCount);
    const viewCount = toNumber(user.channel.statistics?.viewCount);
    const authHeader = await getAuthHeaderForAccount(user);

    let estimatedDailyViews: number | null = null;
    const ensureEstimatedDailyViews = async () => {
      if (estimatedDailyViews !== null) {
        return estimatedDailyViews;
      }
      estimatedDailyViews =
        (await getEstimatedDailyViews(authHeader)) ??
        (await getFallbackEstimatedDailyViews(channelId, snapshotUserId, viewCount)) ??
        0;
      return estimatedDailyViews;
    };

    if (HAS_SUPABASE_SERVER && snapshotUserId) {
      if (!force) {
        const { data: existing, error: existingError } = await supabaseServer
          .from("channel_snapshots")
          .select("snapshot_date, subscribers, video_count, total_views, estimated_daily_views")
          .eq("user_id", snapshotUserId)
          .eq("channel_id", channelId)
          .eq("snapshot_date", snapshotDate)
          .maybeSingle();

        if (!existingError && existing) {
          if (toNumber(existing.estimated_daily_views) > 0) {
            return {
              snapshot: mapSupabaseSnapshotRow(existing),
              created: false,
              storage: "supabase",
            };
          }
        }

        if (existingError && existingError.code !== "PGRST116") {
          console.error("Supabase existing snapshot fetch error:", existingError);
        }
      }

      const payload = {
        user_id: snapshotUserId,
        channel_id: channelId,
        snapshot_date: snapshotDate,
        subscribers,
        video_count: videoCount,
        total_views: viewCount,
        estimated_daily_views: await ensureEstimatedDailyViews(),
      };

      const { data, error } = await supabaseServer
        .from("channel_snapshots")
        .upsert(payload, { onConflict: "channel_id,snapshot_date" })
        .select("snapshot_date, subscribers, video_count, total_views, estimated_daily_views")
        .single();

      if (!error && data) {
        return {
          snapshot: mapSupabaseSnapshotRow(data),
          created: true,
          storage: "supabase",
        };
      }

      if (error) {
        console.error("Supabase snapshot upsert error:", error);
      }
    }

    if (!force) {
      const latest = getLatestSnapshot(channelId);
      if (latest?.date === snapshotDate && toNumber(latest.estimatedDailyViews) > 0) {
        return {
          snapshot: {
            date: latest.date,
            subscriberCount: toNumber(latest.subscriberCount),
            videoCount: toNumber(latest.videoCount),
            viewCount: toNumber(latest.viewCount),
            estimatedDailyViews: toNumber(latest.estimatedDailyViews),
          },
          created: false,
          storage: "sqlite",
        };
      }
    }

    const sqliteSnapshot = {
      channelId,
      date: snapshotDate,
      timestamp: Date.now(),
      subscriberCount: subscribers,
      videoCount,
      viewCount,
      estimatedDailyViews: await ensureEstimatedDailyViews(),
    };

    const success = saveChannelSnapshot(sqliteSnapshot);
    if (!success) {
      throw new Error("Failed to save snapshot to local SQLite store");
    }

    return {
      snapshot: {
        date: sqliteSnapshot.date,
        subscriberCount: sqliteSnapshot.subscriberCount,
        videoCount: sqliteSnapshot.videoCount,
        viewCount: sqliteSnapshot.viewCount,
        estimatedDailyViews: sqliteSnapshot.estimatedDailyViews,
      },
      created: true,
      storage: "sqlite",
    };
  }

  // Channel Snapshots - Growth Momentum Tracking
  app.post("/api/snapshots/save", async (req, res) => {
    const user = await getActiveYouTubeUser(req);

    if (!user || !user.tokens || !user.channel?.id) {
      return res.status(401).json({ error: "Not authenticated or no channel connected" });
    }

    try {
      const force = req.query.force === "1" || req.body?.force === true;
      const snapshotUserId = await resolveSnapshotUserId(req, String(user.channel.id));
      const result = await saveSnapshot(req, user, force, snapshotUserId);

      return res.json({
        success: true,
        snapshot: result.snapshot,
        created: result.created,
        storage: result.storage,
        message: result.created ? "Snapshot saved successfully" : "Snapshot already exists for today",
      });
    } catch (error) {
      console.error("Save snapshot error:", error);
      return res.status(500).json({ error: "Failed to save snapshot" });
    }
  });

  app.get("/api/snapshots/history", async (req, res) => {
    const user = await getActiveYouTubeUser(req);

    if (!user || !user.tokens || !user.channel?.id) {
      return res.status(401).json({ error: "Not authenticated or no channel connected" });
    }

    try {
      const channelId = String(user.channel.id);
      const days = Math.max(1, Number(req.query.days) || 90);
      const snapshotUserId = await resolveSnapshotUserId(req, channelId);

      try {
        await saveSnapshot(req, user, false, snapshotUserId);
      } catch (snapshotError) {
        console.warn("Snapshot auto-save skipped while loading history:", snapshotError);
      }

      const supabaseSnapshots = await fetchSupabaseSnapshots(channelId, days, snapshotUserId);
      const snapshots = supabaseSnapshots || (getChannelSnapshots(channelId, days) as SnapshotMetric[]);

      return res.json({
        channelId,
        snapshots,
        count: snapshots.length,
        period: `${days} days`,
        startDate: snapshots.length > 0 ? snapshots[0].date : null,
        endDate: snapshots.length > 0 ? snapshots[snapshots.length - 1].date : null,
      });
    } catch (error) {
      console.error("Get snapshots history error:", error);
      return res.status(500).json({ error: "Failed to fetch snapshot history" });
    }
  });

  app.get("/api/snapshots/momentum", async (req, res) => {
    const user = await getActiveYouTubeUser(req);

    if (!user || !user.tokens || !user.channel?.id) {
      return res.status(401).json({ error: "Not authenticated or no channel connected" });
    }

    try {
      const channelId = String(user.channel.id);
      const snapshotUserId = await resolveSnapshotUserId(req, channelId);

      try {
        await saveSnapshot(req, user, false, snapshotUserId);
      } catch (snapshotError) {
        console.warn("Snapshot auto-save skipped while loading momentum:", snapshotError);
      }

      const quarterSupabase = await fetchSupabaseSnapshots(channelId, 90, snapshotUserId);

      const quarter = quarterSupabase || (getChannelSnapshots(channelId, 90) as SnapshotMetric[]);
      const month = quarterSupabase
        ? filterSnapshotsByDays(quarterSupabase, 30)
        : (getChannelSnapshots(channelId, 30) as SnapshotMetric[]);
      const week = quarterSupabase
        ? filterSnapshotsByDays(quarterSupabase, 7)
        : (getChannelSnapshots(channelId, 7) as SnapshotMetric[]);

      return res.json({
        channelId,
        momentum: {
          week: summarizeGrowth(week),
          month: summarizeGrowth(month),
          quarter: summarizeGrowth(quarter),
        },
        currentMetrics: {
          subscribers: user.channel.statistics?.subscriberCount || 0,
          videoCount: user.channel.statistics?.videoCount || 0,
          totalViews: user.channel.statistics?.viewCount || 0,
        },
      });
    } catch (error) {
      console.error("Get snapshot momentum error:", error);
      return res.status(500).json({ error: "Failed to fetch growth momentum" });
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

