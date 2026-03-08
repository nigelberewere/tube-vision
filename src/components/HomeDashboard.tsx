import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertCircle,
  BarChart3,
  Clock3,
  Eye,
  Loader2,
  Sparkles,
  TrendingUp,
  Users,
} from 'lucide-react';

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

function toNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function compact(value: number): string {
  return Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(value);
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
    const hour = toNumber(row.hourOfDay);
    mapped[hour] = toNumber(row.views);
  }
  return mapped;
}

export default function HomeDashboard({ channel, isConnected, onConnect }: HomeDashboardProps) {
  const [analytics, setAnalytics] = useState<AnalyticsPayload | null>(null);
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboard = async () => {
    if (!isConnected) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [analyticsResponse, videosResponse] = await Promise.all([
        fetch('/api/user/analytics'),
        fetch('/api/user/videos'),
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

  useEffect(() => {
    fetchDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected]);

  const dailyObjects = useMemo(() => rowsToObjects(analytics?.daily), [analytics]);
  const hourlyObjects = useMemo(() => rowsToObjects(analytics?.hourly), [analytics]);

  const metrics = useMemo(() => {
    const lastDayViews = toNumber(dailyObjects[dailyObjects.length - 1]?.views);
    const last7DaysViews = dailyObjects.slice(-7).reduce((sum, row) => sum + toNumber(row.views), 0);
    const last30DaysViews = dailyObjects.reduce((sum, row) => sum + toNumber(row.views), 0);
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
      lastDayViews,
      last7DaysViews,
      last30DaysViews,
      netSubs30Days,
      viewsLastHour,
      viewsLast24Hours,
      bestHour: bestHour ? `${bestHour.hourOfDay}:00` : '--:--',
    };
  }, [analytics, dailyObjects, hourlyObjects]);

  if (!isConnected) {
    return (
      <div className="space-y-6 animate-in fade-in duration-500 pb-10">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8">
          <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-bold">Home</p>
          <h2 className="text-3xl font-bold text-white mt-2">Welcome to Tube Vision</h2>
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
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <Loader2 className="animate-spin text-indigo-500" size={32} />
        <p className="text-zinc-400">Loading your creator home metrics...</p>
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
          <p className="text-xs uppercase tracking-wider text-zinc-500 font-bold">Total Channel Views</p>
          <p className="text-2xl font-bold text-zinc-100 mt-1">{compact(toNumber(channel?.statistics?.viewCount))}</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <p className="text-xs uppercase tracking-wider text-zinc-500 font-bold">Total Videos</p>
          <p className="text-2xl font-bold text-zinc-100 mt-1">{compact(toNumber(channel?.statistics?.videoCount))}</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <p className="text-xs uppercase tracking-wider text-zinc-500 font-bold">Views Last Day</p>
          <p className="text-2xl font-bold text-zinc-100 mt-1">{compact(metrics.lastDayViews)}</p>
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
