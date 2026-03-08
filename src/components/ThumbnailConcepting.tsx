import { useEffect, useMemo, useState } from 'react';
import { Type } from '@google/genai';
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Image as ImageIcon,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Wand2,
} from 'lucide-react';
import { generateVidVisionInsight } from '../services/geminiService';

interface VideoItem {
  id: string;
  snippet: {
    title: string;
    description: string;
    thumbnails: {
      medium?: { url: string };
      high?: { url: string };
      default?: { url: string };
    };
    publishedAt: string;
  };
  statistics: {
    viewCount: string;
    likeCount: string;
    commentCount: string;
  };
  contentDetails: {
    duration: string;
  };
}

interface VideoMetrics {
  id: string;
  title: string;
  thumbnailUrl: string;
  publishedAt: string;
  durationLabel: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  viewsPerDay: number;
  engagementRate: number;
  performanceIndex: number;
  youtubeUrl: string;
}

interface AutoInsight {
  videoId: string;
  thumbnailHealthScore: number;
  mainIssue: string;
  proposedTextOverlay: string;
  titleTreatment: string;
  layoutDescription: string;
  colorDirection: string;
  visualHook: string;
  thumbnailImagePrompt: string;
  projectedCtrLiftPercent: number;
  whyThisShouldImproveCtr: string;
  swapPriority: number;
  video?: VideoMetrics;
}

interface ManualConcept {
  title: string;
  layoutDescription: string;
  textOverlay: string;
  colorPalette: string;
  emotionOrVibe: string;
  whyItWorks: string;
}

interface AuthorizationItem {
  videoId: string;
  videoTitle: string;
  currentThumbnailUrl: string;
  proposedTextOverlay: string;
  titleTreatment: string;
  layoutDescription: string;
  colorDirection: string;
  thumbnailImagePrompt: string;
  projectedCtrLiftPercent: number;
  swapPriority: number;
  status: string;
  approvedAt: string;
}

function parseISODurationToSeconds(duration: string): number {
  const match = duration?.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
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
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function toNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function compact(value: number): string {
  return Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

function buildVideoMetrics(videos: VideoItem[]): VideoMetrics[] {
  const now = Date.now();

  return videos.map((video) => {
    const publishedAt = video.snippet?.publishedAt || new Date().toISOString();
    const ageDays = Math.max(1, (now - new Date(publishedAt).getTime()) / (24 * 60 * 60 * 1000));
    const viewCount = toNumber(video.statistics?.viewCount);
    const likeCount = toNumber(video.statistics?.likeCount);
    const commentCount = toNumber(video.statistics?.commentCount);
    const durationSeconds = parseISODurationToSeconds(video.contentDetails?.duration || '');
    const viewsPerDay = viewCount / ageDays;
    const engagementRate = viewCount > 0 ? ((likeCount + commentCount) / viewCount) * 100 : 0;
    const performanceIndex = Math.log10(viewsPerDay + 1) * 70 + engagementRate * 4;

    return {
      id: video.id,
      title: video.snippet?.title || 'Untitled',
      thumbnailUrl:
        video.snippet?.thumbnails?.high?.url ||
        video.snippet?.thumbnails?.medium?.url ||
        video.snippet?.thumbnails?.default?.url ||
        '',
      publishedAt,
      durationLabel: formatDurationLabel(durationSeconds),
      viewCount,
      likeCount,
      commentCount,
      viewsPerDay,
      engagementRate,
      performanceIndex,
      youtubeUrl: `https://www.youtube.com/watch?v=${video.id}`,
    };
  });
}

function getPoorCandidates(metrics: VideoMetrics[]): VideoMetrics[] {
  const matureVideos = metrics.filter((video) => {
    const ageDays = (Date.now() - new Date(video.publishedAt).getTime()) / (24 * 60 * 60 * 1000);
    return ageDays >= 5;
  });

  const source = matureVideos.length > 0 ? matureVideos : metrics;
  return [...source].sort((a, b) => a.performanceIndex - b.performanceIndex).slice(0, 8);
}

function getTopPerformers(metrics: VideoMetrics[]): VideoMetrics[] {
  return [...metrics].sort((a, b) => b.performanceIndex - a.performanceIndex).slice(0, 5);
}

type Mode = 'auto' | 'manual';

export default function ThumbnailConcepting() {
  const [mode, setMode] = useState<Mode>('auto');

  const [topic, setTopic] = useState('');
  const [manualLoading, setManualLoading] = useState(false);
  const [manualConcepts, setManualConcepts] = useState<ManualConcept[]>([]);
  const [manualError, setManualError] = useState<string | null>(null);

  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [loadingVideos, setLoadingVideos] = useState(false);
  const [videosError, setVideosError] = useState<string | null>(null);
  const [needsConnection, setNeedsConnection] = useState(false);

  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [insights, setInsights] = useState<AutoInsight[]>([]);
  const [channelActions, setChannelActions] = useState<string[]>([]);

  const [authorizingId, setAuthorizingId] = useState<string | null>(null);
  const [queueLoading, setQueueLoading] = useState(false);
  const [authorizationQueue, setAuthorizationQueue] = useState<AuthorizationItem[]>([]);

  const videoMetrics = useMemo<VideoMetrics[]>(() => buildVideoMetrics(videos), [videos]);

  const poorCandidates = useMemo<VideoMetrics[]>(() => {
    return getPoorCandidates(videoMetrics);
  }, [videoMetrics]);

  const topPerformers = useMemo<VideoMetrics[]>(() => {
    return getTopPerformers(videoMetrics);
  }, [videoMetrics]);

  const authorizedIdSet = useMemo(() => {
    return new Set(authorizationQueue.map((item) => item.videoId));
  }, [authorizationQueue]);

  const fetchVideos = async (): Promise<VideoItem[]> => {
    setLoadingVideos(true);
    setVideosError(null);

    try {
      const response = await fetch('/api/user/videos');
      if (response.status === 401) {
        setNeedsConnection(true);
        setVideos([]);
        return [];
      }

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Failed to fetch your videos.');
      }

      const data = (await response.json()) as VideoItem[];
      setNeedsConnection(false);
      setVideos(data || []);
      return data || [];
    } catch (error: any) {
      setVideosError(error.message || 'Failed to fetch videos.');
      return [];
    } finally {
      setLoadingVideos(false);
    }
  };

  const fetchAuthorizationQueue = async () => {
    setQueueLoading(true);
    try {
      const response = await fetch('/api/thumbnails/authorizations');
      if (response.status === 401) {
        setNeedsConnection(true);
        setAuthorizationQueue([]);
        return;
      }

      if (!response.ok) {
        return;
      }

      const data = (await response.json()) as AuthorizationItem[];
      setAuthorizationQueue(data || []);
    } finally {
      setQueueLoading(false);
    }
  };

  useEffect(() => {
    if (mode === 'auto') {
      fetchVideos();
      fetchAuthorizationQueue();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const handleGenerateManualConcepts = async () => {
    if (!topic.trim()) return;

    setManualLoading(true);
    setManualError(null);
    setManualConcepts([]);

    try {
      const schema = {
        type: Type.OBJECT,
        properties: {
          concepts: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                layoutDescription: { type: Type.STRING },
                textOverlay: { type: Type.STRING },
                colorPalette: { type: Type.STRING },
                emotionOrVibe: { type: Type.STRING },
                whyItWorks: { type: Type.STRING },
              },
            },
          },
        },
      };

      const prompt = `Act as a master YouTube thumbnail strategist. Generate 3 high-CTR thumbnail concepts for: "${topic}".
Each concept must include: composition, short text overlay (max 4 words), color direction, emotional trigger, and conversion logic.`;

      const response = await generateVidVisionInsight(prompt, schema);
      if (!response) {
        throw new Error('No response from AI');
      }

      const parsed = JSON.parse(response);
      setManualConcepts(parsed.concepts || []);
    } catch (error: any) {
      setManualError(error.message || 'Failed to generate concepts.');
    } finally {
      setManualLoading(false);
    }
  };

  const runAutoAudit = async () => {
    setAuditLoading(true);
    setAuditError(null);
    setInsights([]);
    setChannelActions([]);

    try {
      let sourceVideos = videos;
      if (sourceVideos.length === 0) {
        sourceVideos = await fetchVideos();
      }

      const metrics = buildVideoMetrics(sourceVideos);
      const poorCandidatesSource = getPoorCandidates(metrics);
      const topPerformersSource = getTopPerformers(metrics);

      if (sourceVideos.length === 0 || poorCandidatesSource.length === 0) {
        throw new Error('No videos available to audit. Connect channel and publish videos first.');
      }

      const schema = {
        type: Type.OBJECT,
        properties: {
          insights: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                videoId: { type: Type.STRING },
                thumbnailHealthScore: { type: Type.NUMBER },
                mainIssue: { type: Type.STRING },
                proposedTextOverlay: { type: Type.STRING },
                titleTreatment: { type: Type.STRING },
                layoutDescription: { type: Type.STRING },
                colorDirection: { type: Type.STRING },
                visualHook: { type: Type.STRING },
                thumbnailImagePrompt: { type: Type.STRING },
                projectedCtrLiftPercent: { type: Type.NUMBER },
                whyThisShouldImproveCtr: { type: Type.STRING },
                swapPriority: { type: Type.NUMBER },
              },
              required: [
                'videoId',
                'thumbnailHealthScore',
                'mainIssue',
                'proposedTextOverlay',
                'titleTreatment',
                'layoutDescription',
                'colorDirection',
                'visualHook',
                'thumbnailImagePrompt',
                'projectedCtrLiftPercent',
                'whyThisShouldImproveCtr',
                'swapPriority',
              ],
            },
          },
          channelLevelActions: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
        },
        required: ['insights', 'channelLevelActions'],
      };

      const prompt = `You are an elite YouTube thumbnail optimization analyst.

Top-performing baseline videos (for pattern reference):
${JSON.stringify(
  topPerformersSource.map((video) => ({
    id: video.id,
    title: video.title,
    viewsPerDay: Math.round(video.viewsPerDay),
    engagementRate: Number(video.engagementRate.toFixed(2)),
  })),
)}

Potentially underperforming videos to improve:
${JSON.stringify(
  poorCandidatesSource.map((video) => ({
    videoId: video.id,
    title: video.title,
    viewsPerDay: Math.round(video.viewsPerDay),
    engagementRate: Number(video.engagementRate.toFixed(2)),
    currentPerformanceIndex: Number(video.performanceIndex.toFixed(2)),
  })),
)}

Return thumbnail redesign insights for every underperforming video.
Rules:
- proposedTextOverlay must be 4 words or fewer.
- titleTreatment should define font style, sizing, and placement.
- thumbnailImagePrompt must be a ready-to-use prompt for an image generator.
- projectedCtrLiftPercent should be realistic (2 to 35).
- thumbnailHealthScore is 1-100 (higher is better current thumbnail quality).
- swapPriority is 1-100 (higher means authorize this swap first).
- Focus on practical visual changes a creator can execute quickly.
- Include 3 to 5 high-impact channel-level actions.`;

      const response = await generateVidVisionInsight(prompt, schema);
      if (!response) {
        throw new Error('No audit response generated.');
      }

      const parsed = JSON.parse(response) as { insights: AutoInsight[]; channelLevelActions: string[] };
      const byId = new Map(poorCandidatesSource.map((video) => [video.id, video]));

      const mergedInsights = (parsed.insights || []).map((insight, index) => {
        const video = byId.get(insight.videoId) || poorCandidatesSource[index];
        return {
          ...insight,
          projectedCtrLiftPercent: Math.max(2, Math.min(35, toNumber(insight.projectedCtrLiftPercent))),
          video,
        };
      }).sort((a, b) => toNumber(b.swapPriority) - toNumber(a.swapPriority));

      setInsights(mergedInsights);
      setChannelActions(parsed.channelLevelActions || []);
    } catch (error: any) {
      setAuditError(error.message || 'Failed to run thumbnail audit.');
    } finally {
      setAuditLoading(false);
    }
  };

  const authorizeSwap = async (insight: AutoInsight) => {
    if (!insight.video) return;

    setAuthorizingId(insight.video.id);
    try {
      const response = await fetch('/api/thumbnails/authorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoId: insight.video.id,
          videoTitle: insight.video.title,
          currentThumbnailUrl: insight.video.thumbnailUrl,
          proposedTextOverlay: insight.proposedTextOverlay,
          titleTreatment: insight.titleTreatment,
          layoutDescription: insight.layoutDescription,
          colorDirection: insight.colorDirection,
          thumbnailImagePrompt: insight.thumbnailImagePrompt,
          projectedCtrLiftPercent: insight.projectedCtrLiftPercent,
          swapPriority: insight.swapPriority,
        }),
      });

      if (response.status === 401) {
        setNeedsConnection(true);
        throw new Error('Reconnect your YouTube account to authorize thumbnail swaps.');
      }

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Failed to authorize swap.');
      }

      const payload = await response.json();
      setAuthorizationQueue(payload.queue || []);
    } catch (error: any) {
      setAuditError(error.message || 'Failed to authorize swap.');
    } finally {
      setAuthorizingId(null);
    }
  };

  const clearAuthorizationQueue = async () => {
    setQueueLoading(true);
    try {
      const response = await fetch('/api/thumbnails/authorize/clear', { method: 'POST' });
      if (!response.ok) {
        return;
      }
      setAuthorizationQueue([]);
    } finally {
      setQueueLoading(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-10">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-zinc-100">Thumbnail Studio</h1>
        <p className="text-zinc-400 mt-2">
          Detect weak thumbnails, auto-generate stronger concepts, and approve thumbnail swap recommendations.
        </p>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <div className="grid grid-cols-2 gap-2 w-full md:w-[360px]">
          <button
            onClick={() => setMode('auto')}
            className={`rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors ${
              mode === 'auto' ? 'bg-white text-black' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
            }`}
          >
            Auto Audit
          </button>
          <button
            onClick={() => setMode('manual')}
            className={`rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors ${
              mode === 'manual' ? 'bg-white text-black' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
            }`}
          >
            Manual Concepts
          </button>
        </div>
      </div>

      {mode === 'manual' && (
        <>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <label className="block text-sm font-medium text-zinc-300 mb-2">Video Topic or Title</label>
            <div className="flex gap-3">
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g., I tested 10 AI tools in 24 hours"
                className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                onKeyDown={(e) => e.key === 'Enter' && handleGenerateManualConcepts()}
              />
              <button
                onClick={handleGenerateManualConcepts}
                disabled={manualLoading || !topic.trim()}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-2.5 rounded-lg font-medium flex items-center gap-2 transition-colors"
              >
                {manualLoading ? <Loader2 size={18} className="animate-spin" /> : <ImageIcon size={18} />}
                Generate
              </button>
            </div>
          </div>

          {manualError && (
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-300 text-sm flex items-start gap-3">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <p>{manualError}</p>
            </div>
          )}

          {manualConcepts.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {manualConcepts.map((concept, i) => (
                <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden flex flex-col">
                  <div className="h-44 bg-zinc-950 border-b border-zinc-800 relative flex items-center justify-center p-6 text-center">
                    <div className="absolute inset-0 opacity-20 bg-gradient-to-br from-indigo-500/20 via-zinc-900 to-zinc-950"></div>
                    <h3 className="relative z-10 text-2xl font-black tracking-tighter text-white uppercase">{concept.textOverlay}</h3>
                  </div>
                  <div className="p-5 space-y-3">
                    <h3 className="text-lg font-bold text-zinc-100">{concept.title}</h3>
                    <p className="text-sm text-indigo-400">{concept.emotionOrVibe}</p>
                    <p className="text-sm text-zinc-300"><span className="text-zinc-500">Layout:</span> {concept.layoutDescription}</p>
                    <p className="text-sm text-zinc-300"><span className="text-zinc-500">Colors:</span> {concept.colorPalette}</p>
                    <p className="text-sm text-zinc-400 italic">{concept.whyItWorks}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {mode === 'auto' && (
        <>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-5">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-zinc-100">Automatic Thumbnail Audit</h2>
                <p className="text-sm text-zinc-400 mt-1">
                  Analyze your channel videos, detect weak thumbnail performers, and generate replacement concepts.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={fetchVideos}
                  disabled={loadingVideos}
                  className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm font-medium transition-colors inline-flex items-center gap-2 disabled:opacity-60"
                >
                  {loadingVideos ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                  Refresh Videos
                </button>
                <button
                  onClick={runAutoAudit}
                  disabled={auditLoading || loadingVideos || needsConnection}
                  className="px-4 py-2 rounded-lg bg-white text-black hover:bg-zinc-200 text-sm font-semibold transition-colors inline-flex items-center gap-2 disabled:opacity-60"
                >
                  {auditLoading ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
                  Run Audit
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
                <p className="text-xs uppercase tracking-wider text-zinc-500 font-bold">Videos Loaded</p>
                <p className="text-2xl font-bold text-zinc-100 mt-1">{videoMetrics.length}</p>
              </div>
              <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
                <p className="text-xs uppercase tracking-wider text-zinc-500 font-bold">Flagged For Improvement</p>
                <p className="text-2xl font-bold text-amber-300 mt-1">{poorCandidates.length}</p>
              </div>
              <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
                <p className="text-xs uppercase tracking-wider text-zinc-500 font-bold">Authorized Swaps</p>
                <p className="text-2xl font-bold text-emerald-300 mt-1">{authorizationQueue.length}</p>
              </div>
            </div>

            {needsConnection && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
                Connect your YouTube account from the sidebar to use automatic thumbnail auditing.
              </div>
            )}

            {videosError && (
              <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-300 text-sm flex items-start gap-3">
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                <p>{videosError}</p>
              </div>
            )}

            {auditError && (
              <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-300 text-sm flex items-start gap-3">
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                <p>{auditError}</p>
              </div>
            )}

            {channelActions.length > 0 && (
              <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-4">
                <p className="text-xs uppercase tracking-wider text-indigo-300 font-bold mb-2">Channel-Level Thumbnail Actions</p>
                <div className="space-y-2">
                  {channelActions.map((action, i) => (
                    <p key={i} className="text-sm text-zinc-300">{i + 1}. {action}</p>
                  ))}
                </div>
              </div>
            )}
          </div>

          {auditLoading && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
              <Loader2 size={24} className="animate-spin text-indigo-400 mx-auto mb-3" />
              <p className="text-zinc-300">Analyzing thumbnails and generating upgrade concepts...</p>
            </div>
          )}

          {insights.length > 0 && (
            <div className="space-y-6">
              {insights.map((insight, index) => {
                const video = insight.video;
                if (!video) return null;

                return (
                  <div key={`${insight.videoId}-${index}`} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                    <div className="grid grid-cols-1 lg:grid-cols-12">
                      <div className="lg:col-span-4 border-b lg:border-b-0 lg:border-r border-zinc-800 p-5 space-y-3">
                        <img
                          src={video.thumbnailUrl}
                          alt={video.title}
                          className="w-full aspect-video object-cover rounded-lg border border-zinc-800"
                          referrerPolicy="no-referrer"
                        />
                        <h3 className="text-sm font-semibold text-zinc-100">{video.title}</h3>
                        <div className="grid grid-cols-2 gap-2 text-xs text-zinc-400">
                          <div className="bg-zinc-950 rounded-md p-2">Views: <span className="text-zinc-200">{compact(video.viewCount)}</span></div>
                          <div className="bg-zinc-950 rounded-md p-2">/day: <span className="text-zinc-200">{compact(video.viewsPerDay)}</span></div>
                          <div className="bg-zinc-950 rounded-md p-2">Engagement: <span className="text-zinc-200">{video.engagementRate.toFixed(2)}%</span></div>
                          <div className="bg-zinc-950 rounded-md p-2">Duration: <span className="text-zinc-200">{video.durationLabel}</span></div>
                        </div>
                      </div>

                      <div className="lg:col-span-8 p-5 space-y-4">
                        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                          <div>
                            <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">Proposed Upgrade</p>
                            <p className="text-sm text-zinc-300 mt-1">{insight.mainIssue}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">Health</span>
                            <span className="px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-300 text-xs font-bold">
                              {Math.round(insight.thumbnailHealthScore)}/100
                            </span>
                            <span className="px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-300 text-xs font-bold">
                              Priority {Math.round(insight.swapPriority)}
                            </span>
                          </div>
                        </div>

                        <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4 relative overflow-hidden min-h-[120px] flex items-center justify-center">
                          <div className="absolute inset-0 opacity-25 bg-gradient-to-br from-indigo-500/30 via-zinc-950 to-rose-500/20"></div>
                          <p className="relative z-10 text-3xl font-black text-white uppercase tracking-tight text-center">
                            {insight.proposedTextOverlay}
                          </p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                          <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                            <p className="text-xs uppercase tracking-wider text-zinc-500 font-bold">Layout Plan</p>
                            <p className="text-zinc-300 mt-1">{insight.layoutDescription}</p>
                          </div>
                          <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                            <p className="text-xs uppercase tracking-wider text-zinc-500 font-bold">Title Treatment</p>
                            <p className="text-zinc-300 mt-1">{insight.titleTreatment}</p>
                          </div>
                          <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                            <p className="text-xs uppercase tracking-wider text-zinc-500 font-bold">Color Direction</p>
                            <p className="text-zinc-300 mt-1">{insight.colorDirection}</p>
                          </div>
                          <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                            <p className="text-xs uppercase tracking-wider text-zinc-500 font-bold">Visual Hook</p>
                            <p className="text-zinc-300 mt-1">{insight.visualHook}</p>
                          </div>
                          <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                            <p className="text-xs uppercase tracking-wider text-zinc-500 font-bold">Expected CTR Benefit</p>
                            <p className="text-zinc-300 mt-1">{insight.whyThisShouldImproveCtr}</p>
                            <p className="text-emerald-300 text-xs mt-2">Projected lift: +{Math.round(insight.projectedCtrLiftPercent)}%</p>
                          </div>
                          <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 md:col-span-2">
                            <p className="text-xs uppercase tracking-wider text-zinc-500 font-bold">Image Prompt</p>
                            <p className="text-zinc-300 mt-1 text-xs leading-relaxed">{insight.thumbnailImagePrompt}</p>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <a
                            href={video.youtubeUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold transition-colors inline-flex items-center gap-2"
                          >
                            <ExternalLink size={14} />
                            Open Video
                          </a>
                          <button
                            onClick={() => authorizeSwap(insight)}
                            disabled={authorizingId === video.id || authorizedIdSet.has(video.id)}
                            className="px-3 py-2 rounded-lg bg-white text-black hover:bg-zinc-200 disabled:bg-zinc-700 disabled:text-zinc-400 text-xs font-semibold transition-colors inline-flex items-center gap-2"
                          >
                            {authorizingId === video.id ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                            {authorizedIdSet.has(video.id) ? 'Authorized' : 'Authorize Swap'}
                          </button>
                          {authorizedIdSet.has(video.id) && (
                            <span className="text-xs text-emerald-300 inline-flex items-center gap-1">
                              <CheckCircle2 size={14} /> In approval queue
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-zinc-100">Thumbnail Swap Authorization Queue</h3>
                <p className="text-sm text-zinc-400 mt-1">
                  Approved swaps are queued for creator review and execution.
                </p>
              </div>
              <button
                onClick={clearAuthorizationQueue}
                disabled={queueLoading || authorizationQueue.length === 0}
                className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-60 text-zinc-200 text-xs font-semibold transition-colors inline-flex items-center gap-2"
              >
                {queueLoading ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                Clear Queue
              </button>
            </div>

            {authorizationQueue.length === 0 ? (
              <p className="text-sm text-zinc-500 mt-4">No approved thumbnail swaps yet.</p>
            ) : (
              <div className="mt-4 space-y-3">
                {[...authorizationQueue]
                  .sort((a, b) => toNumber(b.swapPriority) - toNumber(a.swapPriority))
                  .map((item) => (
                  <div key={item.videoId} className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 flex items-start gap-3">
                    <img
                      src={item.currentThumbnailUrl}
                      alt={item.videoTitle}
                      className="w-24 h-14 object-cover rounded-md border border-zinc-800"
                      referrerPolicy="no-referrer"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-zinc-100">{item.videoTitle}</p>
                      <p className="text-xs text-zinc-400 mt-1">Overlay: {item.proposedTextOverlay}</p>
                      {item.titleTreatment ? (
                        <p className="text-xs text-zinc-500 mt-1">Title style: {item.titleTreatment}</p>
                      ) : null}
                      {toNumber(item.projectedCtrLiftPercent) > 0 ? (
                        <p className="text-xs text-emerald-300 mt-1">Projected CTR lift: +{Math.round(toNumber(item.projectedCtrLiftPercent))}%</p>
                      ) : null}
                      <p className="text-[11px] text-zinc-500 mt-1">Approved {new Date(item.approvedAt).toLocaleString()}</p>
                    </div>
                    <span className="px-2 py-1 text-[10px] uppercase tracking-wider rounded-full bg-emerald-500/15 text-emerald-300 font-bold">
                      {item.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-4 text-sm text-zinc-300 flex items-start gap-3">
            <Clock3 size={16} className="text-indigo-300 mt-0.5 shrink-0" />
            <p>
              Authorization marks a thumbnail swap as approved by the creator. Execution is queued for your thumbnail production workflow.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
