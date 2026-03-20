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

function hasHourBucket(map: Record<number, number>, hour: number): boolean {
  return Object.prototype.hasOwnProperty.call(map, hour);
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

// Convert a UTC hour (0-23) to a local-time string like "14:30 EST".
// Handles half-hour / quarter-hour offsets (e.g. India UTC+5:30).
function utcHourToLocalDisplay(utcHour: number): string {
  const d = new Date();
  d.setUTCHours(utcHour, 0, 0, 0);
  const h = d.getHours();
  const m = d.getMinutes();
  const tzAbbr =
    new Intl.DateTimeFormat('en', { timeZoneName: 'short' })
      .formatToParts(d)
      .find((p) => p.type === 'timeZoneName')?.value ?? 'local';
  return m === 0
    ? `${String(h).padStart(2, '0')}:00 ${tzAbbr}`
    : `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} ${tzAbbr}`;
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
    const hasAnyRecentHourlyData = Object.keys(todayHourlyMap).length > 0 || Object.keys(yesterdayHourlyMap).length > 0;
    const currentHour = new Date().getHours();
    const previousHour = currentHour === 0 ? 23 : currentHour - 1;

    const viewsLastHour =
      currentHour === 0
        ? (hasHourBucket(yesterdayHourlyMap, 23) ? toNumber(yesterdayHourlyMap[23]) : null)
        : (hasHourBucket(todayHourlyMap, previousHour) ? toNumber(todayHourlyMap[previousHour]) : null);

    let rolling24Views = 0;
    let complete24HourWindow = true;
    for (let offset = 0; offset < 24; offset += 1) {
      const absoluteHour = previousHour - offset;
      const isTodayBucket = absoluteHour >= 0;
      const hourIndex = (absoluteHour + 24) % 24;
      const sourceMap = isTodayBucket ? todayHourlyMap : yesterdayHourlyMap;

      if (!hasHourBucket(sourceMap, hourIndex)) {
        complete24HourWindow = false;
        break;
      }

      rolling24Views += toNumber(sourceMap[hourIndex]);
    }

    const viewsLast24Hours = complete24HourWindow ? rolling24Views : null;

    const bestHour = [...hourlyObjects].sort((a, b) => toNumber(b.views) - toNumber(a.views))[0];
    const bestHourDisplay = bestHour
      ? `${bestHour.hour}:00`
      : (typeof bestPostingTime?.bestHour === 'number' ? utcHourToLocalDisplay(bestPostingTime.bestHour) : '--:--');

    return {
      last7DaysViews,
      last30DaysViews,
      avgViewsPerDay,
      netSubs30Days,
      viewsLastHour,
      viewsLast24Hours,
      hasAnyRecentHourlyData,
      bestHour: bestHourDisplay,
    };
  }, [analytics, bestPostingTime, dailyObjects, hourlyObjects]);

  const strongTextClass = isLightTheme ? 'text-slate-900' : 'text-zinc-100';
  const bodyTextClass = isLightTheme ? 'text-slate-600' : 'text-zinc-300';
  const mutedTextClass = isLightTheme ? 'text-slate-500' : 'text-zinc-400';
  const labelTextClass = isLightTheme ? 'text-slate-500' : 'text-zinc-500';
  const surfaceCardClass = isLightTheme
    ? 'border-slate-200 bg-white shadow-sm'
    : 'border-zinc-800 bg-zinc-900';
  const nestedSurfaceClass = isLightTheme
    ? 'border-slate-200 bg-slate-50'
    : 'border-zinc-800 bg-zinc-950';
  const softPanelClass = isLightTheme
    ? 'border-slate-200 bg-white shadow-sm'
    : 'border-white/10 bg-white/5';
  const insetPanelClass = isLightTheme
    ? 'border-slate-200 bg-slate-50'
    : 'border-white/10 bg-black/20';
  const heroMetaCardClass = isLightTheme
    ? 'border-slate-200 bg-white shadow-sm'
    : 'border-white/15 bg-black/25';
  const primaryActionClass = isLightTheme
    ? 'bg-slate-900 text-slate-50 hover:bg-slate-800 shadow-sm'
    : 'bg-white text-black hover:bg-slate-200';
  const copyActionClass = isLightTheme
    ? 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
    : 'border-white/15 text-zinc-200 hover:bg-white/10';
  const iconActionClass = isLightTheme
    ? 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
    : 'text-zinc-400 hover:bg-white/10 hover:text-white';

  if (!isConnected) {
    return (
      <div className="space-y-6 animate-in fade-in duration-500 pb-10">
        <div className={cn('rounded-2xl border p-8', isLightTheme ? 'border-slate-200 bg-white shadow-sm' : 'border-white/10 bg-white/[0.03]')}>
          <p className={cn('text-[10px] font-bold uppercase tracking-[0.2em]', labelTextClass)}>Home</p>
          <h2 className={cn('mt-2 text-3xl font-bold', strongTextClass)}>Welcome to Janso Studio</h2>
          <p className={cn('mt-3 max-w-2xl', bodyTextClass)}>
            Connect your channel to unlock live creator metrics like subscribers, views in the last hour, last 24 hours,
            and performance trends across your content ecosystem.
          </p>
          <button
            onClick={onConnect}
            className={cn('mt-6 rounded-xl px-6 py-2.5 font-semibold transition-colors', primaryActionClass)}
          >
            Connect YouTube To Start
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
          <div className={cn('rounded-xl border p-5', surfaceCardClass)}>
            <Activity size={18} className={isLightTheme ? 'text-indigo-700' : 'text-indigo-300'} />
            <p className={cn('mt-3 font-semibold', strongTextClass)}>Real-Time Pulse</p>
            <p className={cn('mt-1 text-sm', mutedTextClass)}>Track views in the last hour and last 24 hours.</p>
          </div>
          <div className={cn('rounded-xl border p-5', surfaceCardClass)}>
            <Users size={18} className={isLightTheme ? 'text-emerald-700' : 'text-emerald-300'} />
            <p className={cn('mt-3 font-semibold', strongTextClass)}>Subscriber Health</p>
            <p className={cn('mt-1 text-sm', mutedTextClass)}>See net subscriber changes and momentum at a glance.</p>
          </div>
          <div className={cn('rounded-xl border p-5', surfaceCardClass)}>
            <Sparkles size={18} className={isLightTheme ? 'text-amber-700' : 'text-amber-300'} />
            <p className={cn('mt-3 font-semibold', strongTextClass)}>Actionable Home</p>
            <p className={cn('mt-1 text-sm', mutedTextClass)}>Use Home as your daily command center before creating.</p>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-8 pb-10">
        <div className="space-y-4">
          <div className={cn('h-8 w-64 rounded animate-pulse', isLightTheme ? 'bg-slate-200' : 'bg-zinc-800/50')} />
          <div className={cn('h-4 w-96 rounded animate-pulse', isLightTheme ? 'bg-slate-200' : 'bg-zinc-800/50')} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6">
          <ShimmerStat />
          <ShimmerStat />
          <ShimmerStat />
          <ShimmerStat />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
          <ShimmerChart />
          <ShimmerChart />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
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
          <p className={cn('text-[10px] font-bold uppercase tracking-[0.2em]', labelTextClass)}>Home</p>
          <h2 className={cn('mt-1 text-3xl font-bold', strongTextClass)}>{channel?.title || 'Your Channel Overview'}</h2>
          <p className={cn('mt-2', mutedTextClass)}>Your daily command center for subscriber and view momentum.</p>
        </div>
        <button
          onClick={fetchDashboard}
          className={cn('rounded-xl px-5 py-2.5 text-sm font-semibold transition-colors', primaryActionClass)}
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
                heroMetaCardClass
              )}
            >
              <p className={cn('text-[10px] uppercase tracking-[0.18em]', mutedTextClass)}>Role</p>
              <p className={cn('text-sm font-semibold mt-1', strongTextClass)}>Workspace Owner</p>
            </div>
            <div
              className={cn(
                'rounded-lg border px-3 py-2 min-w-[130px]',
                heroMetaCardClass
              )}
            >
              <p className={cn('text-[10px] uppercase tracking-[0.18em]', mutedTextClass)}>Active Account</p>
              <p className={cn('text-sm font-semibold mt-1', strongTextClass)}>
                {totalAccounts > 0 ? `${activeAccountIndex + 1} of ${totalAccounts}` : '1 of 1'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div
          className={cn(
            'rounded-xl border p-5 text-sm',
            isLightTheme ? 'border-amber-200 bg-amber-50' : 'border-amber-500/20 bg-amber-500/10'
          )}
        >
          <div className="flex items-start gap-3">
            <AlertCircle size={18} className={cn('mt-0.5 shrink-0', isLightTheme ? 'text-amber-600' : 'text-amber-400')} />
            <div className="flex-1">
              {error === 'ANALYTICS_API_DISABLED' ? (
                <>
                  <h4 className={cn('mb-2 font-bold', isLightTheme ? 'text-amber-900' : 'text-amber-300')}>YouTube Analytics API Not Enabled</h4>
                  <p className={cn('mb-3', isLightTheme ? 'text-amber-800' : 'text-amber-200')}>
                    The YouTube Analytics API needs to be enabled in your Google Cloud Console to show Home metrics.
                  </p>
                  <div className={cn('space-y-2 text-sm', isLightTheme ? 'text-amber-800' : 'text-amber-100')}>
                    <p className="font-semibold">How to fix:</p>
                    <ol className="list-decimal ml-5 space-y-1">
                      <li>
                        Visit the{' '}
                        <a
                          href="https://console.developers.google.com/apis/library/youtubeanalytics.googleapis.com"
                          target="_blank"
                          rel="noopener noreferrer"
                          className={cn('font-semibold underline', isLightTheme ? 'hover:text-amber-950' : 'hover:text-white')}
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
                <p className={isLightTheme ? 'text-amber-800' : 'text-amber-200'}>{error}</p>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className={cn('rounded-xl border p-5', surfaceCardClass)}>
          <div className={cn('flex h-9 w-9 items-center justify-center rounded-lg', isLightTheme ? 'bg-emerald-100 text-emerald-700' : 'bg-emerald-500/10 text-emerald-300')}>
            <Users size={17} />
          </div>
          <p className={cn('mt-4 text-xs font-bold uppercase tracking-wider', labelTextClass)}>Subscribers</p>
          <p className={cn('mt-1 text-2xl font-bold', strongTextClass)}>{compact(toNumber(channel?.statistics?.subscriberCount))}</p>
        </div>

        <div className={cn('rounded-xl border p-5', surfaceCardClass)}>
          <div className={cn('flex h-9 w-9 items-center justify-center rounded-lg', isLightTheme ? 'bg-indigo-100 text-indigo-700' : 'bg-indigo-500/10 text-indigo-300')}>
            <Eye size={17} />
          </div>
          <p className={cn('mt-4 text-xs font-bold uppercase tracking-wider', labelTextClass)}>Views Last Hour</p>
          <p className={cn('mt-1 text-2xl font-bold', strongTextClass)}>{metrics.viewsLastHour === null ? '--' : compact(metrics.viewsLastHour)}</p>
          <p className={cn('mt-1 text-xs', labelTextClass)}>
            {metrics.viewsLastHour === null ? 'Hourly analytics unavailable' : 'Last completed hour'}
          </p>
        </div>

        <div className={cn('rounded-xl border p-5', surfaceCardClass)}>
          <div className={cn('flex h-9 w-9 items-center justify-center rounded-lg', isLightTheme ? 'bg-blue-100 text-blue-700' : 'bg-blue-500/10 text-blue-300')}>
            <Activity size={17} />
          </div>
          <p className={cn('mt-4 text-xs font-bold uppercase tracking-wider', labelTextClass)}>Views Last 24h</p>
          <p className={cn('mt-1 text-2xl font-bold', strongTextClass)}>{metrics.viewsLast24Hours === null ? '--' : compact(metrics.viewsLast24Hours)}</p>
          <p className={cn('mt-1 text-xs', labelTextClass)}>
            {metrics.viewsLast24Hours === null ? '24 hourly buckets not available yet' : 'Previous 24 completed hours'}
          </p>
        </div>

        <div className={cn('rounded-xl border p-5', surfaceCardClass)}>
          <div className={cn('flex h-9 w-9 items-center justify-center rounded-lg', isLightTheme ? 'bg-amber-100 text-amber-700' : 'bg-amber-500/10 text-amber-300')}>
            <BarChart3 size={17} />
          </div>
          <p className={cn('mt-4 text-xs font-bold uppercase tracking-wider', labelTextClass)}>Net Subs 30d</p>
          <p className={cn('mt-1 text-2xl font-bold', strongTextClass)}>
            {metrics.netSubs30Days > 0 ? `+${compact(metrics.netSubs30Days)}` : compact(metrics.netSubs30Days)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        <div className={cn('rounded-xl border p-5', surfaceCardClass)}>
          <p className={cn('text-xs font-bold uppercase tracking-wider', labelTextClass)}>All Channel Views (All-Time)</p>
          <p className={cn('mt-1 text-2xl font-bold', strongTextClass)}>{full(toNumber(channel?.statistics?.viewCount))}</p>
          <p className={cn('mt-1 text-xs', labelTextClass)}>{compact(toNumber(channel?.statistics?.viewCount))} lifetime views</p>
        </div>
        <div className={cn('rounded-xl border p-5', surfaceCardClass)}>
          <p className={cn('text-xs font-bold uppercase tracking-wider', labelTextClass)}>Total Videos</p>
          <p className={cn('mt-1 text-2xl font-bold', strongTextClass)}>{compact(toNumber(channel?.statistics?.videoCount))}</p>
        </div>
        <div className={cn('rounded-xl border p-5', surfaceCardClass)}>
          <p className={cn('text-xs font-bold uppercase tracking-wider', labelTextClass)}>Avg Views / Day (30d)</p>
          <p className={cn('mt-1 text-2xl font-bold', strongTextClass)}>{compact(metrics.avgViewsPerDay)}</p>
        </div>
        <div className={cn('rounded-xl border p-5', surfaceCardClass)}>
          <p className={cn('text-xs font-bold uppercase tracking-wider', labelTextClass)}>Views Last 7 Days</p>
          <p className={cn('mt-1 text-2xl font-bold', strongTextClass)}>{compact(metrics.last7DaysViews)}</p>
        </div>
        <div className={cn('rounded-xl border p-5', surfaceCardClass)}>
          <p className={cn('text-xs font-bold uppercase tracking-wider', labelTextClass)}>Views Last 30 Days</p>
          <p className={cn('mt-1 text-2xl font-bold', strongTextClass)}>{compact(metrics.last30DaysViews)}</p>
        </div>
        <div className={cn('rounded-xl border p-5', surfaceCardClass)}>
          <p className={cn('text-xs font-bold uppercase tracking-wider', labelTextClass)}>Best Posting Hour</p>
          <p className={cn('mt-1 text-2xl font-bold', strongTextClass)}>{metrics.bestHour}</p>
          <p className={cn('mt-1 text-xs', labelTextClass)}>
            {metrics.hasAnyRecentHourlyData ? 'Based on hourly analytics' : 'Fallback from posting-time analysis'}
          </p>
        </div>
      </div>

      {/* Growth Momentum Section */}
      <GrowthMomentum 
        isConnected={isConnected}
        theme={theme}
        className={cn(
          'rounded-2xl border p-6',
          isLightTheme
            ? 'border-fuchsia-200 bg-gradient-to-br from-fuchsia-50 via-white to-sky-50 shadow-sm'
            : 'border-white/10 bg-gradient-to-br from-purple-500/10 via-pink-500/10 to-blue-500/10'
        )}
      />

      {/* Smart Content Repurposing Insight */}
      {shouldShowRepurposeInsight && latestVideo && repurposeInsight && (
        <div
          className={cn(
            'rounded-2xl border p-6',
            isLightTheme
              ? 'border-sky-200 bg-gradient-to-br from-sky-50 via-white to-indigo-50 shadow-[0_18px_45px_rgba(15,23,42,0.08)]'
              : 'border-white/10 bg-black/35 shadow-[0_18px_45px_rgba(0,0,0,0.4)]'
          )}
        >
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className={cn('flex items-center gap-2 text-lg font-bold', strongTextClass)}>
                <Sparkles size={18} className={isLightTheme ? 'text-sky-600' : 'text-sky-300'} />
                Smart Repurposing Insight
              </h3>
              <p className={cn('mt-1 text-sm', bodyTextClass)}>
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
                className={cn('rounded-lg p-1.5 transition', iconActionClass)}
                aria-label="Dismiss insight"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {repurposeError && (
            <div
              className={cn(
                'mb-3 rounded-lg border px-3 py-2 text-sm',
                isLightTheme ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-amber-500/30 bg-amber-500/10 text-amber-200'
              )}
            >
              {repurposeError}
            </div>
          )}

          <div className="space-y-3">
            <div className={cn('rounded-xl border p-4', softPanelClass)}>
              <p className={cn('text-[10px] font-bold uppercase tracking-[0.18em]', isLightTheme ? 'text-sky-700' : 'text-sky-300')}>Source Upload</p>
              <p className={cn('mt-1 text-base font-semibold', strongTextClass)}>{repurposeInsight.videoTitle}</p>
              <p className={cn('mt-1 text-xs', mutedTextClass)}>
                Generated {new Date(repurposeInsight.generatedAt).toLocaleString()} for cross-platform publishing.
              </p>
              <p className={cn('mt-3 text-sm', bodyTextClass)}>{repurposeInsight.recommendedNextStep}</p>
            </div>

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
              <div className={cn('rounded-xl border p-4', insetPanelClass)}>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className={cn('text-xs font-bold uppercase tracking-[0.16em]', isLightTheme ? 'text-sky-700' : 'text-sky-300')}>X Post</p>
                  <button
                    onClick={() => copyRepurposeText('x')}
                    className={cn('inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] transition-colors', copyActionClass)}
                  >
                    {copiedRepurposeItem === 'x' ? <Check size={12} /> : <Copy size={12} />}
                    {copiedRepurposeItem === 'x' ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <p className={cn('text-sm leading-relaxed', isLightTheme ? 'text-slate-700' : 'text-zinc-200')}>{repurposeInsight.xPost}</p>
              </div>

              <div className={cn('rounded-xl border p-4', insetPanelClass)}>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className={cn('text-xs font-bold uppercase tracking-[0.16em]', isLightTheme ? 'text-indigo-700' : 'text-indigo-300')}>LinkedIn</p>
                  <button
                    onClick={() => copyRepurposeText('linkedin')}
                    className={cn('inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] transition-colors', copyActionClass)}
                  >
                    {copiedRepurposeItem === 'linkedin' ? <Check size={12} /> : <Copy size={12} />}
                    {copiedRepurposeItem === 'linkedin' ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <p className={cn('text-sm leading-relaxed', isLightTheme ? 'text-slate-700' : 'text-zinc-200')}>{repurposeInsight.linkedinPost}</p>
              </div>

              <div className={cn('rounded-xl border p-4', insetPanelClass)}>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className={cn('text-xs font-bold uppercase tracking-[0.16em]', isLightTheme ? 'text-violet-700' : 'text-violet-300')}>Blog Angle</p>
                  <button
                    onClick={() => copyRepurposeText('blog')}
                    className={cn('inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] transition-colors', copyActionClass)}
                  >
                    {copiedRepurposeItem === 'blog' ? <Check size={12} /> : <Copy size={12} />}
                    {copiedRepurposeItem === 'blog' ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <p className={cn('text-sm font-semibold leading-relaxed', strongTextClass)}>{repurposeInsight.blogTitle}</p>
                <p className={cn('mt-2 text-sm leading-relaxed', bodyTextClass)}>{repurposeInsight.blogAngle}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Daily Video Ideas Section */}
      <div
        className={cn(
          'rounded-2xl border p-4 sm:p-6',
          isLightTheme
            ? 'border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-cyan-50 shadow-sm'
            : 'border-emerald-400/30 bg-gradient-to-br from-emerald-500/10 via-teal-500/10 to-cyan-500/10'
        )}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-xl', isLightTheme ? 'bg-emerald-100' : 'bg-emerald-500/20')}>
            <Lightbulb size={24} className={isLightTheme ? 'text-emerald-700' : 'text-emerald-300'} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
              <div>
                <h3 className={cn('flex items-center gap-2 text-lg font-bold', strongTextClass)}>
                  <Calendar size={18} className={isLightTheme ? 'text-emerald-700' : 'text-emerald-300'} />
                  Daily Video Ideas
                </h3>
                <p className={cn('mt-1 text-sm', bodyTextClass)}>
                  Fresh, AI-generated ideas personalized for your channel
                </p>
              </div>
              <button
                onClick={() => generateDailyIdeas(true)}
                disabled={loadingIdeas}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-emerald-700 sm:w-auto whitespace-nowrap"
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
                  <div key={i} className={cn('rounded-xl border p-4 animate-pulse', softPanelClass)}>
                    <div className={cn('mb-2 h-4 w-3/4 rounded', isLightTheme ? 'bg-slate-200' : 'bg-white/10')}></div>
                    <div className={cn('h-3 w-1/2 rounded', isLightTheme ? 'bg-slate-200' : 'bg-white/10')}></div>
                  </div>
                ))}
              </div>
            ) : dailyIdeas.length > 0 ? (
              <div className="space-y-3">
                {dailyIdeas.map((idea, index) => (
                  <div 
                    key={index} 
                    className={cn(
                      'group rounded-xl border p-4 transition-all',
                      isLightTheme
                        ? 'border-slate-200 bg-white shadow-sm hover:border-emerald-300 hover:bg-emerald-50/50'
                        : 'border-white/10 bg-white/5 hover:border-emerald-400/30 hover:bg-white/10'
                    )}
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className={cn(
                            "text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded",
                            idea.difficulty === 'Easy'
                              ? isLightTheme ? 'bg-emerald-100 text-emerald-700' : 'bg-emerald-500/20 text-emerald-300'
                              : idea.difficulty === 'Medium'
                              ? isLightTheme ? 'bg-amber-100 text-amber-700' : 'bg-yellow-500/20 text-yellow-300'
                              : isLightTheme ? 'bg-rose-100 text-rose-700' : 'bg-rose-500/20 text-rose-300'
                          )}>
                            {idea.difficulty}
                          </span>
                          <span className={cn('text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded', isLightTheme ? 'bg-cyan-100 text-cyan-700' : 'bg-cyan-500/20 text-cyan-300')}>
                            {idea.potentialReach}
                          </span>
                        </div>
                        <h4 className={cn('text-base font-bold transition-colors', isLightTheme ? 'text-slate-900 group-hover:text-emerald-700' : 'text-white group-hover:text-emerald-300')}>
                          {idea.title}
                        </h4>
                      </div>
                      <Sparkles size={18} className={cn('opacity-0 transition-opacity flex-shrink-0 group-hover:opacity-100', isLightTheme ? 'text-emerald-600' : 'text-emerald-400')} />
                    </div>
                    <div className={cn('flex items-start gap-2 text-sm', bodyTextClass)}>
                      <Zap size={14} className="text-yellow-400 flex-shrink-0 mt-0.5" />
                      <p className="italic">"{idea.hook}"</p>
                    </div>
                  </div>
                ))}
                <div className="pt-2">
                  <button 
                    onClick={onNavigateToIdeas}
                    className={cn('flex items-center gap-1 text-sm font-semibold transition-colors', isLightTheme ? 'text-emerald-700 hover:text-emerald-800' : 'text-emerald-300 hover:text-emerald-200')}
                  >
                    View full idea generator
                    <ArrowRight size={16} />
                  </button>
                </div>
              </div>
            ) : (
              <div className={cn('rounded-xl border p-6 text-center', softPanelClass)}>
                <p className={cn('text-sm', mutedTextClass)}>Click "Refresh Ideas" to get your daily video ideas</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* AI-Powered Best Posting Time Recommendation */}
      {bestPostingTime && bestPostingTime.bestHour !== null && (
        <div
          className={cn(
            'rounded-2xl border p-4 sm:p-6',
            isLightTheme
              ? 'border-indigo-200 bg-gradient-to-br from-indigo-50 via-white to-pink-50 shadow-sm'
              : 'border-indigo-400/30 bg-gradient-to-br from-indigo-500/10 via-purple-500/10 to-pink-500/10'
          )}
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <div className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-xl', isLightTheme ? 'bg-indigo-100' : 'bg-indigo-500/20')}>
              <Lightbulb size={24} className={isLightTheme ? 'text-indigo-700' : 'text-indigo-300'} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="mb-2 flex flex-col items-start gap-2 sm:flex-row sm:items-center">
                <h3 className={cn('text-lg font-bold', strongTextClass)}>AI-Powered Posting Recommendation</h3>
                <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider',
                  bestPostingTime.confidence === 'high' 
                    ? isLightTheme ? 'bg-emerald-100 text-emerald-700' : 'bg-emerald-500/20 text-emerald-300'
                    : bestPostingTime.confidence === 'medium'
                    ? isLightTheme ? 'bg-amber-100 text-amber-700' : 'bg-amber-500/20 text-amber-300'
                    : isLightTheme ? 'bg-slate-200 text-slate-700' : 'bg-zinc-500/20 text-zinc-300'
                )}>
                  {bestPostingTime.confidence} confidence
                </span>
              </div>
              
              <p className={cn('mb-4 text-sm leading-relaxed', bodyTextClass)}>
                {bestPostingTime.aiInsight.replace(
                  /(\d{1,2}):00 UTC/g,
                  (_, h) => utcHourToLocalDisplay(parseInt(h, 10)),
                )}
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className={cn('rounded-xl border p-4', softPanelClass)}>
                  <div className="flex items-center gap-2 mb-1">
                    <Clock3 size={16} className={isLightTheme ? 'text-indigo-700' : 'text-indigo-300'} />
                    <p className={cn('text-xs font-bold uppercase tracking-wider', mutedTextClass)}>Best Hour</p>
                  </div>
                  <p className={cn('text-2xl font-bold', strongTextClass)}>{utcHourToLocalDisplay(bestPostingTime.bestHour)}</p>
                  <p className={cn('mt-1 text-xs', labelTextClass)}>Optimal posting time</p>
                </div>

                <div className={cn('rounded-xl border p-4', softPanelClass)}>
                  <div className="flex items-center gap-2 mb-1">
                    <Calendar size={16} className={isLightTheme ? 'text-purple-700' : 'text-purple-300'} />
                    <p className={cn('text-xs font-bold uppercase tracking-wider', mutedTextClass)}>Best Day</p>
                  </div>
                  <p className={cn('text-2xl font-bold', strongTextClass)}>{bestPostingTime.bestDay}</p>
                  <p className={cn('mt-1 text-xs', labelTextClass)}>Best performing day</p>
                </div>

                <div className={cn('rounded-xl border p-4', softPanelClass)}>
                  <div className="flex items-center gap-2 mb-1">
                    <BarChart3 size={16} className={isLightTheme ? 'text-pink-700' : 'text-pink-300'} />
                    <p className={cn('text-xs font-bold uppercase tracking-wider', mutedTextClass)}>Data Points</p>
                  </div>
                  <p className={cn('text-2xl font-bold', strongTextClass)}>{bestPostingTime.videosAnalyzed}</p>
                  <p className={cn('mt-1 text-xs', labelTextClass)}>Videos analyzed</p>
                </div>
              </div>

              {bestPostingTime.hourlyBreakdown && bestPostingTime.hourlyBreakdown.length > 0 && (
                <div className={cn('mt-4 border-t pt-4', isLightTheme ? 'border-slate-200' : 'border-white/10')}>
                  <p className={cn('mb-2 text-xs font-bold uppercase tracking-wider', mutedTextClass)}>Top Performing Hours</p>
                  <div className="flex flex-wrap gap-2">
                    {bestPostingTime.hourlyBreakdown.slice(0, 5).map((hourData) => (
                      <div key={hourData.hour} className={cn('rounded-lg border px-3 py-1.5', softPanelClass)}>
                        <span className={cn('text-xs font-mono', isLightTheme ? 'text-indigo-700' : 'text-indigo-300')}>{utcHourToLocalDisplay(hourData.hour)}</span>
                        <span className={cn('ml-2 text-xs', labelTextClass)}>({hourData.videoCount} videos)</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className={cn('rounded-2xl border p-4 sm:p-5', surfaceCardClass)}>
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className={cn('text-lg font-semibold', strongTextClass)}>Recent Upload Snapshot</h3>
            <p className={cn('mt-1 text-sm', mutedTextClass)}>Latest videos from your channel with current view counts.</p>
          </div>
          <div className={cn('inline-flex items-center gap-1 text-xs', labelTextClass)}>
            <Clock3 size={14} />
            Updated live
          </div>
        </div>

        {videos.length === 0 ? (
          <p className={cn('text-sm', labelTextClass)}>No recent videos found yet.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {videos.slice(0, 4).map((video) => (
              <div key={video.id} className={cn('flex gap-3 rounded-lg border p-3', nestedSurfaceClass)}>
                <img
                  src={
                    video.snippet?.thumbnails?.medium?.url ||
                    video.snippet?.thumbnails?.high?.url ||
                    video.snippet?.thumbnails?.default?.url ||
                    ''
                  }
                  alt={video.snippet?.title}
                  className={cn('h-14 w-24 rounded-md border object-cover', isLightTheme ? 'border-slate-200' : 'border-zinc-800')}
                  referrerPolicy="no-referrer"
                />
                <div className="min-w-0 flex-1">
                  <p className={cn('line-clamp-2 text-sm font-semibold', strongTextClass)}>{video.snippet?.title || 'Untitled'}</p>
                  <div className={cn('mt-1 flex items-center gap-3 text-xs', labelTextClass)}>
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
