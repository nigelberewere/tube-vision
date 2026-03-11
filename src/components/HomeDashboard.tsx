import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertCircle,
  BarChart3,
  Clock3,
  Copy,
  Check,
  Eye,
  Loader2,
  Sparkles,
  TrendingUp,
  Users,
  Calendar,
  Lightbulb,
  Zap,
  ArrowRight,
  RefreshCw,
  X,
} from 'lucide-react';
import { ShimmerCard, ShimmerStat, ShimmerChart } from './Shimmer';
import GrowthMomentum from './GrowthMomentum';
import { generateVidVisionInsight } from '../services/geminiService';
import { Type } from '@google/genai';
import { cn } from '../lib/utils';

interface ChannelInfo {
  id: string;
  title: string;
  description: string;
  thumbnails: any;
  statistics: {
    subscriberCount: string;
    videoCount: string;
    viewCount: string;
  };
}

interface HomeDashboardProps {
  channel: ChannelInfo | null;
  isConnected: boolean;
  onConnect: () => void;
  profileName?: string;
  profileImage?: string;
  activeAccountIndex?: number;
  totalAccounts?: number;
  onNavigateToIdeas?: () => void;
  theme?: 'dark' | 'light';
}

interface AnalyticsReport {
  columnHeaders?: Array<{ name: string }>;
  rows?: any[][];
  error?: {
    code?: number;
    message?: string;
  };
}

interface AnalyticsPayload {
  daily: AnalyticsReport;
  hourly: AnalyticsReport;
  todayHourly?: AnalyticsReport;
  yesterdayHourly?: AnalyticsReport;
}

interface VideoItem {
  id: string;
  snippet: {
    title: string;
    thumbnails: {
      medium?: { url: string };
      high?: { url: string };
      default?: { url: string };
    };
    publishedAt: string;
  };
  statistics: {
    viewCount: string;
  };
}

interface BestPostingTime {
  bestHour: number;
  bestHourFormatted: string;
  bestDay: string;
  bestDayIndex: number;
  confidence: 'low' | 'medium' | 'high';
  videosAnalyzed: number;
  aiInsight: string;
  hourlyBreakdown?: Array<{
    hour: number;
    avgViewsPerDay: number;
    videoCount: number;
  }>;
}

interface DailyVideoIdea {
  title: string;
  hook: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  potentialReach: string;
}

interface RepurposeInsight {
  videoId: string;
  videoTitle: string;
  publishedAt: string;
  generatedAt: string;
  xPost: string;
  linkedinPost: string;
  blogTitle: string;
  blogAngle: string;
  recommendedNextStep: string;
}

const DAILY_IDEAS_STORAGE_KEY = 'vid_vision_daily_ideas';
const REPURPOSE_INSIGHT_STORAGE_KEY = 'vid_vision_repurpose_insight';
const NEW_UPLOAD_WINDOW_HOURS = 72;

function getTodayDateKey(): string {
  return new Date().toISOString().split('T')[0]; // YYYY-MM-DD
}

function toNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function compact(value: number): string {
  return Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

function full(value: number): string {
  return Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value);
}

function rowsToObjects(report?: AnalyticsReport): Array<Record<string, any>> {
  const headers = report?.columnHeaders || [];
  const rows = report?.rows || [];

  return rows.map((row) => {
    const item: Record<string, any> = {};
    headers.forEach((header, index) => {
      item[header.name] = row[index];
    });
    return item;
  });
}

function hourMap(report?: AnalyticsReport): Record<number, number> {
  const mapped: Record<number, number> = {};
  const rows = rowsToObjects(report);
  for (const row of rows) {
    const hour = toNumber(row.hour);
    mapped[hour] = toNumber(row.views);
  }
  return mapped;
}

function getLatestVideo(videos: VideoItem[]): VideoItem | null {
  if (!videos.length) {
    return null;
  }

  return [...videos].sort((a, b) => {
    const aTime = new Date(a.snippet?.publishedAt || 0).getTime();
    const bTime = new Date(b.snippet?.publishedAt || 0).getTime();
    return bTime - aTime;
  })[0];
}

function isFreshUpload(publishedAt?: string): boolean {
  if (!publishedAt) {
    return false;
  }

  const publishedTime = new Date(publishedAt).getTime();
  if (!Number.isFinite(publishedTime)) {
    return false;
  }

  const ageMs = Date.now() - publishedTime;
  return ageMs >= 0 && ageMs <= NEW_UPLOAD_WINDOW_HOURS * 60 * 60 * 1000;
}

export default function HomeDashboard({
  channel,
  isConnected,
  onConnect,
  profileName,
  profileImage,
  activeAccountIndex = 0,
  totalAccounts = 0,
  onNavigateToIdeas,
  theme = 'dark',
}: HomeDashboardProps) {
  const isLightTheme = theme === 'light';
  const [analytics, setAnalytics] = useState<AnalyticsPayload | null>(null);
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [bestPostingTime, setBestPostingTime] = useState<BestPostingTime | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dailyIdeas, setDailyIdeas] = useState<DailyVideoIdea[]>([]);
  const [loadingIdeas, setLoadingIdeas] = useState(false);
  const [repurposeInsight, setRepurposeInsight] = useState<RepurposeInsight | null>(null);
  const [repurposeLoading, setRepurposeLoading] = useState(false);
  const [repurposeError, setRepurposeError] = useState<string | null>(null);
  const [copiedRepurposeItem, setCopiedRepurposeItem] = useState<'x' | 'linkedin' | 'blog' | null>(null);
  const [repurposeInsightDismissed, setRepurposeInsightDismissed] = useState(false);

  const fetchDashboard = async () => {
    if (!isConnected) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [analyticsResponse, videosResponse, bestTimeResponse] = await Promise.all([
        fetch('/api/user/analytics'),
        fetch('/api/user/videos'),
        fetch('/api/user/best-posting-time'),
      ]);

      if (analyticsResponse.status === 401 || videosResponse.status === 401) {
        setError('Reconnect your YouTube account to load your home metrics.');
        return;
      }

      if (!analyticsResponse.ok) {
        const errorData = await analyticsResponse.json();
        // Check if it's the YouTube Analytics API not enabled error
        if (errorData.error && errorData.error.includes('youtubeanalytics.googleapis.com')) {
          throw new Error('ANALYTICS_API_DISABLED');
        }
        throw new Error(errorData.error || 'Failed to fetch analytics for homepage.');
      }

      const analyticsData = (await analyticsResponse.json()) as AnalyticsPayload;
      if (analyticsData.daily?.error || analyticsData.hourly?.error) {
        const message = analyticsData.daily?.error?.message || analyticsData.hourly?.error?.message;
        throw new Error(message || 'YouTube Analytics returned an error for your channel.');
      }

      setAnalytics(analyticsData);

      if (videosResponse.ok) {
        const videosData = (await videosResponse.json()) as VideoItem[];
        setVideos(videosData || []);
      } else {
        setVideos([]);
      }

      if (bestTimeResponse.ok) {
        const bestTimeData = (await bestTimeResponse.json()) as BestPostingTime;
        setBestPostingTime(bestTimeData);
      } else {
        setBestPostingTime(null);
      }
    } catch (fetchError: any) {
      if (fetchError.message === 'ANALYTICS_API_DISABLED') {
        setError('ANALYTICS_API_DISABLED');
      } else {
        setError(fetchError.message || 'Failed to load homepage metrics.');
      }
    } finally {
      setLoading(false);
    }
  };

  const generateDailyIdeas = async (force = false) => {
    setLoadingIdeas(true);
    try {
      // Check localStorage for cached ideas from today
      const todayKey = getTodayDateKey();
      const cached = localStorage.getItem(DAILY_IDEAS_STORAGE_KEY);
      
      if (!force && cached) {
        const parsed = JSON.parse(cached);
        if (parsed.date === todayKey && Array.isArray(parsed.ideas)) {
          setDailyIdeas(parsed.ideas);
          setLoadingIdeas(false);
          return;
        }
      }

      // Generate new ideas
      const schema = {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            hook: { type: Type.STRING },
            difficulty: { type: Type.STRING, enum: ['Easy', 'Medium', 'Hard'] },
            potentialReach: { type: Type.STRING }
          },
          required: ['title', 'hook', 'difficulty', 'potentialReach']
        }
      };

      const prompt = `Generate 3 daily video ideas for a YouTube creator.
      ${channel ? `Channel Name: ${channel.title}. Description: ${channel.description}. Subscribers: ${channel.statistics.subscriberCount}.` : "The user hasn't connected their channel yet, so generate general high-potential ideas for content creators."}
      
      Each idea should include:
      1. A compelling, high-CTR title.
      2. A 1-sentence hook to start the video.
      3. Difficulty level (Easy/Medium/Hard).
      4. Potential reach (e.g., "Viral", "High", "Niche").
      
      Make these ideas fresh, actionable, and different from yesterday. Focus on trending topics and proven formats.`;

      const response = await generateVidVisionInsight(prompt, schema);
      if (response) {
        const ideas = JSON.parse(response);
        setDailyIdeas(ideas);
        
        // Cache in localStorage
        localStorage.setItem(DAILY_IDEAS_STORAGE_KEY, JSON.stringify({
          date: todayKey,
          ideas: ideas
        }));
      }
    } catch (error) {
      console.error('Failed to generate daily ideas:', error);
    } finally {
      setLoadingIdeas(false);
    }
  };

  const generateRepurposeInsight = async (video: VideoItem) => {
    if (!channel?.id || !video?.id || !video?.snippet?.title) {
      return;
    }

    setRepurposeLoading(true);
    setRepurposeError(null);

    try {
      const cachedRaw = localStorage.getItem(REPURPOSE_INSIGHT_STORAGE_KEY);
      if (cachedRaw) {
        const cached = JSON.parse(cachedRaw) as {
          channelId?: string;
          videoId?: string;
          insight?: RepurposeInsight;
        };

        if (cached?.channelId === channel.id && cached?.videoId === video.id && cached?.insight) {
          setRepurposeInsight(cached.insight);
          setRepurposeLoading(false);
          return;
        }
      }

      const schema = {
        type: Type.OBJECT,
        properties: {
          xPost: { type: Type.STRING },
          linkedinPost: { type: Type.STRING },
          blogTitle: { type: Type.STRING },
          blogAngle: { type: Type.STRING },
          recommendedNextStep: { type: Type.STRING },
        },
        required: ['xPost', 'linkedinPost', 'blogTitle', 'blogAngle', 'recommendedNextStep'],
      };

      const prompt = `You are an expert content repurposing strategist for YouTube creators.

A creator just uploaded a new video. Generate ready-to-use cross-platform content suggestions.

Output requirements:
- xPost: a single X/Twitter post (max 280 chars)
- linkedinPost: a concise LinkedIn post (2 short paragraphs max)
- blogTitle: SEO-friendly blog title
- blogAngle: 2-3 sentence blog intro angle
- recommendedNextStep: one concrete publishing action for today

Channel: ${channel.title}
Channel description: ${channel.description || 'N/A'}
New upload title: ${video.snippet.title}
Published at: ${video.snippet.publishedAt}
Current views: ${toNumber(video.statistics?.viewCount)}

Return valid JSON only.`;

      const response = await generateVidVisionInsight(prompt, schema, {
        systemInstruction:
          'You create concise, conversion-focused repurposed social content for creators. Keep writing natural, practical, and publish-ready. Return JSON only.',
      });

      if (!response) {
        throw new Error('No response while generating repurposing insight.');
      }

      const parsed = JSON.parse(response);
      const nextInsight: RepurposeInsight = {
        videoId: video.id,
        videoTitle: video.snippet.title,
        publishedAt: video.snippet.publishedAt,
        generatedAt: new Date().toISOString(),
        xPost: String(parsed.xPost || '').trim(),
        linkedinPost: String(parsed.linkedinPost || '').trim(),
        blogTitle: String(parsed.blogTitle || '').trim(),
        blogAngle: String(parsed.blogAngle || '').trim(),
        recommendedNextStep: String(parsed.recommendedNextStep || '').trim(),
      };

      setRepurposeInsight(nextInsight);
      localStorage.setItem(
        REPURPOSE_INSIGHT_STORAGE_KEY,
        JSON.stringify({
          channelId: channel.id,
          videoId: video.id,
          insight: nextInsight,
        }),
      );
    } catch (insightError: any) {
      setRepurposeError(insightError?.message || 'Failed to generate repurposing insight.');
    } finally {
      setRepurposeLoading(false);
    }
  };

  const copyRepurposeText = async (target: 'x' | 'linkedin' | 'blog') => {
    if (!repurposeInsight) {
      return;
    }

    let text = '';
    if (target === 'x') {
      text = repurposeInsight.xPost;
    } else if (target === 'linkedin') {
      text = repurposeInsight.linkedinPost;
    } else {
      text = `${repurposeInsight.blogTitle}\n\n${repurposeInsight.blogAngle}`;
    }

    try {
      await navigator.clipboard.writeText(text);
      setCopiedRepurposeItem(target);
      window.setTimeout(() => setCopiedRepurposeItem(null), 1800);
    } catch {
      setRepurposeError('Could not copy to clipboard.');
    }
  };

  const dismissRepurposeInsight = () => {
    setRepurposeInsightDismissed(true);
  };

  useEffect(() => {
    fetchDashboard();
    generateDailyIdeas(); // Auto-load daily ideas
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected]);

  useEffect(() => {
    if (!isConnected) {
      return;
    }

    const pollId = window.setInterval(() => {
      fetchDashboard();
    }, 5 * 60 * 1000);

    return () => window.clearInterval(pollId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected]);

  const latestVideo = useMemo(() => getLatestVideo(videos), [videos]);
  const hasFreshUpload = useMemo(
    () => isFreshUpload(latestVideo?.snippet?.publishedAt),
    [latestVideo?.snippet?.publishedAt],
  );
  const shouldShowRepurposeInsight = useMemo(() => {
    if (!latestVideo || !hasFreshUpload || !repurposeInsight || repurposeInsightDismissed) {
      return false;
    }

    return repurposeInsight.videoId === latestVideo.id;
  }, [hasFreshUpload, latestVideo, repurposeInsight, repurposeInsightDismissed]);

  useEffect(() => {
    // Reopen the tile when a newly detected upload becomes the latest video.
    setRepurposeInsightDismissed(false);
  }, [latestVideo?.id]);

  useEffect(() => {
    if (!isConnected || !channel?.id || !latestVideo || !hasFreshUpload) {
      return;
    }

    generateRepurposeInsight(latestVideo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, channel?.id, latestVideo?.id, hasFreshUpload]);

  const dailyObjects = useMemo(() => rowsToObjects(analytics?.daily), [analytics]);
  const hourlyObjects = useMemo(() => rowsToObjects(analytics?.hourly), [analytics]);

  const metrics = useMemo(() => {
    const last7DaysViews = dailyObjects.slice(-7).reduce((sum, row) => sum + toNumber(row.views), 0);
    const last30DaysViews = dailyObjects.reduce((sum, row) => sum + toNumber(row.views), 0);
    const avgViewsPerDay = dailyObjects.length > 0 ? Math.round(last30DaysViews / dailyObjects.length) : 0;
    const netSubs30Days = dailyObjects.reduce(
      (sum, row) => sum + toNumber(row.subscribersGained) - toNumber(row.subscribersLost),
      0,
    );

    const todayHourlyMap = hourMap(analytics?.todayHourly);
    const yesterdayHourlyMap = hourMap(analytics?.yesterdayHourly);
    const currentHour = new Date().getHours();
    const previousHour = currentHour === 0 ? 23 : currentHour - 1;

    const viewsLastHour =
      currentHour === 0
        ? toNumber(yesterdayHourlyMap[23])
        : toNumber(todayHourlyMap[previousHour]);

    let viewsLast24Hours = 0;
    for (let offset = 0; offset < 24; offset += 1) {
      const hourIndex = (currentHour - offset + 24) % 24;
      const isTodayBucket = offset < currentHour + 1;
      viewsLast24Hours += isTodayBucket
        ? toNumber(todayHourlyMap[hourIndex])
        : toNumber(yesterdayHourlyMap[hourIndex]);
    }

    const bestHour = [...hourlyObjects].sort((a, b) => toNumber(b.views) - toNumber(a.views))[0];

    return {
      last7DaysViews,
      last30DaysViews,
      avgViewsPerDay,
      netSubs30Days,
      viewsLastHour,
      viewsLast24Hours,
      bestHour: bestHour ? `${bestHour.hour}:00` : '--:--',
    };
  }, [analytics, dailyObjects, hourlyObjects]);

  if (!isConnected) {
    return (
      <div className="space-y-6 animate-in fade-in duration-500 pb-10">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8">
          <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-bold">Home</p>
          <h2 className="text-3xl font-bold text-white mt-2">Welcome to Janso Studio</h2>
          <p className="text-slate-400 mt-3 max-w-2xl">
            Connect your channel to unlock live creator metrics like subscribers, views in the last hour, last 24 hours,
            and performance trends across your content ecosystem.
          </p>
          <button
            onClick={onConnect}
            className="mt-6 bg-white text-black hover:bg-slate-200 px-6 py-2.5 rounded-xl font-semibold"
          >
            Connect YouTube To Start
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-xl border border-white/10 bg-zinc-900 p-5">
            <Activity size={18} className="text-indigo-300" />
            <p className="text-zinc-100 font-semibold mt-3">Real-Time Pulse</p>
            <p className="text-zinc-400 text-sm mt-1">Track views in the last hour and last 24 hours.</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-zinc-900 p-5">
            <Users size={18} className="text-emerald-300" />
            <p className="text-zinc-100 font-semibold mt-3">Subscriber Health</p>
            <p className="text-zinc-400 text-sm mt-1">See net subscriber changes and momentum at a glance.</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-zinc-900 p-5">
            <Sparkles size={18} className="text-amber-300" />
            <p className="text-zinc-100 font-semibold mt-3">Actionable Home</p>
            <p className="text-zinc-400 text-sm mt-1">Use Home as your daily command center before creating.</p>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-8 pb-10">
        <div className="space-y-4">
          <div className="h-8 w-64 bg-zinc-800/50 rounded animate-pulse" />
          <div className="h-4 w-96 bg-zinc-800/50 rounded animate-pulse" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <ShimmerStat />
          <ShimmerStat />
          <ShimmerStat />
          <ShimmerStat />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ShimmerChart />
          <ShimmerChart />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <ShimmerCard />
          <ShimmerCard />
          <ShimmerCard />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-10">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-bold">Home</p>
          <h2 className="text-3xl font-bold text-zinc-100 mt-1">{channel?.title || 'Your Channel Overview'}</h2>
          <p className="text-zinc-400 mt-2">Your daily command center for subscriber and view momentum.</p>
        </div>
        <button
          onClick={fetchDashboard}
          className="bg-white text-black hover:bg-slate-200 px-5 py-2.5 rounded-xl text-sm font-semibold"
        >
          Refresh Home Metrics
        </button>
      </div>

      <div
        className={cn(
          'rounded-2xl border p-5',
          isLightTheme
            ? 'border-indigo-200 bg-gradient-to-r from-indigo-100 via-white to-cyan-100'
            : 'border-indigo-400/20 bg-gradient-to-r from-indigo-500/10 via-slate-900 to-cyan-500/10'
        )}
      >
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            {profileImage ? (
              <img
                src={profileImage}
                alt={profileName || 'Account profile'}
                className={cn(
                  'w-14 h-14 rounded-full border object-cover',
                  isLightTheme ? 'border-indigo-200' : 'border-white/20'
                )}
                referrerPolicy="no-referrer"
              />
            ) : (
              <div
                className={cn(
                  'w-14 h-14 rounded-full border font-bold flex items-center justify-center',
                  isLightTheme
                    ? 'border-indigo-200 bg-indigo-100 text-slate-900'
                    : 'border-white/20 bg-white/10 text-white'
                )}
              >
                {(profileName || channel?.title || 'T').slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className={cn('text-[10px] uppercase tracking-[0.2em] font-bold', isLightTheme ? 'text-indigo-700' : 'text-indigo-200/80')}>
                Personal Workspace
              </p>
              <h3 className={cn('text-xl font-bold truncate mt-1', isLightTheme ? 'text-slate-900' : 'text-white')}>
                Welcome back, {profileName || 'Creator'}
              </h3>
              <p className={cn('text-sm truncate mt-1', isLightTheme ? 'text-slate-600' : 'text-slate-300')}>
                {channel?.title ? `${channel.title} is now your active dashboard.` : 'Your connected account is active.'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 w-full md:w-auto">
            <div
              className={cn(
                'rounded-lg border px-3 py-2 min-w-[130px]',
                isLightTheme ? 'border-slate-300 bg-white/85' : 'border-white/15 bg-black/25'
              )}
            >
              <p className={cn('text-[10px] uppercase tracking-[0.18em]', isLightTheme ? 'text-slate-500' : 'text-slate-400')}>Role</p>
              <p className={cn('text-sm font-semibold mt-1', isLightTheme ? 'text-slate-900' : 'text-white')}>Workspace Owner</p>
            </div>
            <div
              className={cn(
                'rounded-lg border px-3 py-2 min-w-[130px]',
                isLightTheme ? 'border-slate-300 bg-white/85' : 'border-white/15 bg-black/25'
              )}
            >
              <p className={cn('text-[10px] uppercase tracking-[0.18em]', isLightTheme ? 'text-slate-500' : 'text-slate-400')}>Active Account</p>
              <p className={cn('text-sm font-semibold mt-1', isLightTheme ? 'text-slate-900' : 'text-white')}>
                {totalAccounts > 0 ? `${activeAccountIndex + 1} of ${totalAccounts}` : '1 of 1'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-sm">
          <div className="flex items-start gap-3">
            <AlertCircle size={18} className="mt-0.5 shrink-0 text-amber-400" />
            <div className="flex-1">
              {error === 'ANALYTICS_API_DISABLED' ? (
                <>
                  <h4 className="font-bold text-amber-300 mb-2">YouTube Analytics API Not Enabled</h4>
                  <p className="text-amber-200 mb-3">
                    The YouTube Analytics API needs to be enabled in your Google Cloud Console to show Home metrics.
                  </p>
                  <div className="space-y-2 text-sm text-amber-100">
                    <p className="font-semibold">How to fix:</p>
                    <ol className="list-decimal ml-5 space-y-1">
                      <li>
                        Visit the{' '}
                        <a
                          href="https://console.developers.google.com/apis/library/youtubeanalytics.googleapis.com"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline hover:text-white font-semibold"
                        >
                          YouTube Analytics API page
                        </a>
                      </li>
                      <li>Make sure your project is selected in the top dropdown</li>
                      <li>Click the blue "Enable" button</li>
                      <li>Wait 2-3 minutes for the API to activate</li>
                      <li>Return here and click "Refresh Home Metrics"</li>
                    </ol>
                  </div>
                </>
              ) : (
                <p className="text-amber-200">{error}</p>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <div className="w-9 h-9 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-300">
            <Users size={17} />
          </div>
          <p className="text-xs uppercase tracking-wider text-zinc-500 font-bold mt-4">Subscribers</p>
          <p className="text-2xl font-bold text-zinc-100 mt-1">{compact(toNumber(channel?.statistics?.subscriberCount))}</p>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <div className="w-9 h-9 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-300">
            <Eye size={17} />
          </div>
          <p className="text-xs uppercase tracking-wider text-zinc-500 font-bold mt-4">Views Last Hour</p>
          <p className="text-2xl font-bold text-zinc-100 mt-1">{compact(metrics.viewsLastHour)}</p>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <div className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-300">
            <Activity size={17} />
          </div>
          <p className="text-xs uppercase tracking-wider text-zinc-500 font-bold mt-4">Views Last 24h</p>
          <p className="text-2xl font-bold text-zinc-100 mt-1">{compact(metrics.viewsLast24Hours)}</p>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-300">
            <BarChart3 size={17} />
          </div>
          <p className="text-xs uppercase tracking-wider text-zinc-500 font-bold mt-4">Net Subs 30d</p>
          <p className="text-2xl font-bold text-zinc-100 mt-1">
            {metrics.netSubs30Days > 0 ? `+${compact(metrics.netSubs30Days)}` : compact(metrics.netSubs30Days)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <p className="text-xs uppercase tracking-wider text-zinc-500 font-bold">All Channel Views (All-Time)</p>
          <p className="text-2xl font-bold text-zinc-100 mt-1">{full(toNumber(channel?.statistics?.viewCount))}</p>
          <p className="text-xs text-zinc-500 mt-1">{compact(toNumber(channel?.statistics?.viewCount))} lifetime views</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <p className="text-xs uppercase tracking-wider text-zinc-500 font-bold">Total Videos</p>
          <p className="text-2xl font-bold text-zinc-100 mt-1">{compact(toNumber(channel?.statistics?.videoCount))}</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <p className="text-xs uppercase tracking-wider text-zinc-500 font-bold">Avg Views / Day (30d)</p>
          <p className="text-2xl font-bold text-zinc-100 mt-1">{compact(metrics.avgViewsPerDay)}</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <p className="text-xs uppercase tracking-wider text-zinc-500 font-bold">Views Last 7 Days</p>
          <p className="text-2xl font-bold text-zinc-100 mt-1">{compact(metrics.last7DaysViews)}</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <p className="text-xs uppercase tracking-wider text-zinc-500 font-bold">Views Last 30 Days</p>
          <p className="text-2xl font-bold text-zinc-100 mt-1">{compact(metrics.last30DaysViews)}</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <p className="text-xs uppercase tracking-wider text-zinc-500 font-bold">Best Posting Hour</p>
          <p className="text-2xl font-bold text-zinc-100 mt-1">{metrics.bestHour}</p>
        </div>
      </div>

      {/* Growth Momentum Section */}
      <GrowthMomentum 
        isConnected={isConnected}
        className="rounded-2xl border border-white/10 bg-gradient-to-br from-purple-500/10 via-pink-500/10 to-blue-500/10 p-6"
      />

      {/* Smart Content Repurposing Insight */}
      {shouldShowRepurposeInsight && latestVideo && repurposeInsight && (
        <div className="rounded-2xl border border-white/10 bg-black/35 p-6 shadow-[0_18px_45px_rgba(0,0,0,0.4)]">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="flex items-center gap-2 text-lg font-bold text-white">
                <Sparkles size={18} className="text-sky-300" />
                Smart Repurposing Insight
              </h3>
              <p className="mt-1 text-sm text-zinc-300">
                Fresh cross-platform drafts from your latest upload.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => generateRepurposeInsight(latestVideo)}
                disabled={repurposeLoading}
                className="inline-flex items-center gap-1 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {repurposeLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                Refresh Drafts
              </button>
              <button
                onClick={dismissRepurposeInsight}
                className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-white/10 hover:text-white"
                aria-label="Dismiss insight"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {repurposeError && (
            <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
              {repurposeError}
            </div>
          )}

          <div className="space-y-3">
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-sky-300">Source Upload</p>
              <p className="mt-1 text-base font-semibold text-white">{repurposeInsight.videoTitle}</p>
              <p className="mt-1 text-xs text-zinc-400">
                Generated {new Date(repurposeInsight.generatedAt).toLocaleString()} for cross-platform publishing.
              </p>
              <p className="mt-3 text-sm text-zinc-300">{repurposeInsight.recommendedNextStep}</p>
            </div>

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
              <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-sky-300">X Post</p>
                  <button
                    onClick={() => copyRepurposeText('x')}
                    className="inline-flex items-center gap-1 rounded-md border border-white/15 px-2 py-1 text-[11px] text-zinc-200 hover:bg-white/10"
                  >
                    {copiedRepurposeItem === 'x' ? <Check size={12} /> : <Copy size={12} />}
                    {copiedRepurposeItem === 'x' ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <p className="text-sm leading-relaxed text-zinc-200">{repurposeInsight.xPost}</p>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-indigo-300">LinkedIn</p>
                  <button
                    onClick={() => copyRepurposeText('linkedin')}
                    className="inline-flex items-center gap-1 rounded-md border border-white/15 px-2 py-1 text-[11px] text-zinc-200 hover:bg-white/10"
                  >
                    {copiedRepurposeItem === 'linkedin' ? <Check size={12} /> : <Copy size={12} />}
                    {copiedRepurposeItem === 'linkedin' ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <p className="text-sm leading-relaxed text-zinc-200">{repurposeInsight.linkedinPost}</p>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-violet-300">Blog Angle</p>
                  <button
                    onClick={() => copyRepurposeText('blog')}
                    className="inline-flex items-center gap-1 rounded-md border border-white/15 px-2 py-1 text-[11px] text-zinc-200 hover:bg-white/10"
                  >
                    {copiedRepurposeItem === 'blog' ? <Check size={12} /> : <Copy size={12} />}
                    {copiedRepurposeItem === 'blog' ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <p className="text-sm font-semibold leading-relaxed text-white">{repurposeInsight.blogTitle}</p>
                <p className="mt-2 text-sm leading-relaxed text-zinc-300">{repurposeInsight.blogAngle}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Daily Video Ideas Section */}
      <div className="rounded-2xl border border-emerald-400/30 bg-gradient-to-br from-emerald-500/10 via-teal-500/10 to-cyan-500/10 p-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
            <Lightbulb size={24} className="text-emerald-300" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Calendar size={18} className="text-emerald-300" />
                  Daily Video Ideas
                </h3>
                <p className="text-zinc-300 text-sm mt-1">
                  Fresh, AI-generated ideas personalized for your channel
                </p>
              </div>
              <button
                onClick={() => generateDailyIdeas(true)}
                disabled={loadingIdeas}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition-all whitespace-nowrap"
              >
                {loadingIdeas ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <RefreshCw size={16} />
                )}
                Refresh Ideas
              </button>
            </div>

            {loadingIdeas ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="bg-white/5 border border-white/10 rounded-xl p-4 animate-pulse">
                    <div className="h-4 bg-white/10 rounded w-3/4 mb-2"></div>
                    <div className="h-3 bg-white/10 rounded w-1/2"></div>
                  </div>
                ))}
              </div>
            ) : dailyIdeas.length > 0 ? (
              <div className="space-y-3">
                {dailyIdeas.map((idea, index) => (
                  <div 
                    key={index} 
                    className="bg-white/5 hover:bg-white/10 border border-white/10 hover:border-emerald-400/30 rounded-xl p-4 transition-all group"
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className={cn(
                            "text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded",
                            idea.difficulty === 'Easy' ? "bg-emerald-500/20 text-emerald-300" :
                            idea.difficulty === 'Medium' ? "bg-yellow-500/20 text-yellow-300" :
                            "bg-rose-500/20 text-rose-300"
                          )}>
                            {idea.difficulty}
                          </span>
                          <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300">
                            {idea.potentialReach}
                          </span>
                        </div>
                        <h4 className="text-base font-bold text-white group-hover:text-emerald-300 transition-colors">
                          {idea.title}
                        </h4>
                      </div>
                      <Sparkles size={18} className="text-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                    </div>
                    <div className="flex items-start gap-2 text-sm text-zinc-300">
                      <Zap size={14} className="text-yellow-400 flex-shrink-0 mt-0.5" />
                      <p className="italic">"{idea.hook}"</p>
                    </div>
                  </div>
                ))}
                <div className="pt-2">
                  <button 
                    onClick={onNavigateToIdeas}
                    className="text-sm text-emerald-300 hover:text-emerald-200 font-semibold flex items-center gap-1 transition-colors"
                  >
                    View full idea generator
                    <ArrowRight size={16} />
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-white/5 border border-white/10 rounded-xl p-6 text-center">
                <p className="text-zinc-400 text-sm">Click "Refresh Ideas" to get your daily video ideas</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* AI-Powered Best Posting Time Recommendation */}
      {bestPostingTime && bestPostingTime.bestHour !== null && (
        <div className="rounded-2xl border border-indigo-400/30 bg-gradient-to-br from-indigo-500/10 via-purple-500/10 to-pink-500/10 p-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-indigo-500/20 flex items-center justify-center flex-shrink-0">
              <Lightbulb size={24} className="text-indigo-300" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-lg font-bold text-white">AI-Powered Posting Recommendation</h3>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                  bestPostingTime.confidence === 'high' 
                    ? 'bg-emerald-500/20 text-emerald-300' 
                    : bestPostingTime.confidence === 'medium'
                    ? 'bg-amber-500/20 text-amber-300'
                    : 'bg-zinc-500/20 text-zinc-300'
                }`}>
                  {bestPostingTime.confidence} confidence
                </span>
              </div>
              
              <p className="text-zinc-300 text-sm leading-relaxed mb-4">
                {bestPostingTime.aiInsight}
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Clock3 size={16} className="text-indigo-300" />
                    <p className="text-xs uppercase tracking-wider text-zinc-400 font-bold">Best Hour</p>
                  </div>
                  <p className="text-2xl font-bold text-white">{bestPostingTime.bestHourFormatted}</p>
                  <p className="text-xs text-zinc-500 mt-1">Optimal posting time</p>
                </div>

                <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Calendar size={16} className="text-purple-300" />
                    <p className="text-xs uppercase tracking-wider text-zinc-400 font-bold">Best Day</p>
                  </div>
                  <p className="text-2xl font-bold text-white">{bestPostingTime.bestDay}</p>
                  <p className="text-xs text-zinc-500 mt-1">Best performing day</p>
                </div>

                <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <BarChart3 size={16} className="text-pink-300" />
                    <p className="text-xs uppercase tracking-wider text-zinc-400 font-bold">Data Points</p>
                  </div>
                  <p className="text-2xl font-bold text-white">{bestPostingTime.videosAnalyzed}</p>
                  <p className="text-xs text-zinc-500 mt-1">Videos analyzed</p>
                </div>
              </div>

              {bestPostingTime.hourlyBreakdown && bestPostingTime.hourlyBreakdown.length > 0 && (
                <div className="mt-4 pt-4 border-t border-white/10">
                  <p className="text-xs uppercase tracking-wider text-zinc-400 font-bold mb-2">Top Performing Hours</p>
                  <div className="flex flex-wrap gap-2">
                    {bestPostingTime.hourlyBreakdown.slice(0, 5).map((hourData) => (
                      <div key={hourData.hour} className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5">
                        <span className="text-xs font-mono text-indigo-300">{String(hourData.hour).padStart(2, '0')}:00</span>
                        <span className="text-xs text-zinc-500 ml-2">({hourData.videoCount} videos)</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-zinc-100">Recent Upload Snapshot</h3>
            <p className="text-sm text-zinc-400 mt-1">Latest videos from your channel with current view counts.</p>
          </div>
          <div className="text-xs text-zinc-500 inline-flex items-center gap-1">
            <Clock3 size={14} />
            Updated live
          </div>
        </div>

        {videos.length === 0 ? (
          <p className="text-sm text-zinc-500">No recent videos found yet.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {videos.slice(0, 4).map((video) => (
              <div key={video.id} className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 flex gap-3">
                <img
                  src={
                    video.snippet?.thumbnails?.medium?.url ||
                    video.snippet?.thumbnails?.high?.url ||
                    video.snippet?.thumbnails?.default?.url ||
                    ''
                  }
                  alt={video.snippet?.title}
                  className="w-24 h-14 object-cover rounded-md border border-zinc-800"
                  referrerPolicy="no-referrer"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-zinc-100 line-clamp-2">{video.snippet?.title || 'Untitled'}</p>
                  <div className="mt-1 flex items-center gap-3 text-xs text-zinc-500">
                    <span className="inline-flex items-center gap-1">
                      <TrendingUp size={12} />
                      {compact(toNumber(video.statistics?.viewCount))} views
                    </span>
                    <span>{new Date(video.snippet?.publishedAt).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
