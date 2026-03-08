import { useState, useEffect } from 'react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  AreaChart, 
  Area,
  BarChart,
  Bar,
  Cell
} from 'recharts';
import { 
  Loader2, 
  TrendingUp, 
  Users, 
  Clock, 
  BarChart3, 
  AlertCircle,
  Calendar,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';
import { cn } from '../lib/utils';

interface AnalyticsData {
  daily: {
    columnHeaders: any[];
    rows: any[][];
  };
  hourly: {
    columnHeaders: any[];
    rows: any[][];
  };
}

export default function ChannelInsights() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalytics = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/user/analytics');
      if (response.ok) {
        const result = await response.json();
        if (result.daily.error || result.hourly.error) {
           setError("YouTube Analytics API returned an error. Make sure you have granted the required permissions and your channel has enough data.");
        } else {
           setData(result);
        }
      } else if (response.status === 401) {
        setError("Please reconnect your YouTube account to grant analytics permissions.");
      } else {
        setError("Failed to fetch analytics data.");
      }
    } catch (err) {
      console.error('Failed to fetch analytics:', err);
      setError("An unexpected error occurred while fetching analytics.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <Loader2 className="animate-spin text-indigo-500" size={32} />
        <p className="text-zinc-400">Fetching deep channel insights...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-10 text-center">
        <div className="w-16 h-16 bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-6">
          <AlertCircle size={32} className="text-rose-500" />
        </div>
        <h2 className="text-xl font-bold text-zinc-100 mb-2">Analytics Error</h2>
        <p className="text-zinc-400 max-w-md mx-auto mb-6">
          {error}
        </p>
        <button 
          onClick={() => window.location.reload()}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-xl font-bold transition-all"
        >
          Try Again
        </button>
      </div>
    );
  }

  if (!data || !data.daily.rows || data.daily.rows.length === 0) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-10 text-center">
        <div className="w-16 h-16 bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-6">
          <BarChart3 size={32} className="text-zinc-500" />
        </div>
        <h2 className="text-xl font-bold text-zinc-100 mb-2">No Analytics Data Yet</h2>
        <p className="text-zinc-400 max-w-md mx-auto">
          YouTube Analytics data can take 24-48 hours to appear for new channels or after granting permissions. Check back soon!
        </p>
      </div>
    );
  }

  // Transform daily data
  const dailyChartData = data.daily.rows.map(row => {
    const obj: any = {};
    data.daily.columnHeaders.forEach((header, index) => {
      obj[header.name] = row[index];
    });
    // Format date for display
    obj.displayDate = new Date(obj.day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    return obj;
  });

  // Transform hourly data
  const hourlyChartData = data.hourly.rows.map(row => {
    const obj: any = {};
    data.hourly.columnHeaders.forEach((header, index) => {
      obj[header.name] = row[index];
    });
    obj.displayHour = `${obj.hourOfDay}:00`;
    return obj;
  });

  // Calculate "Best Time to Post"
  const bestHour = [...hourlyChartData].sort((a, b) => b.views - a.views)[0];

  // Calculate totals and growth
  const totalViews = dailyChartData.reduce((acc, curr) => acc + curr.views, 0);
  const totalSubsGained = dailyChartData.reduce((acc, curr) => acc + curr.subscribersGained, 0);
  const totalSubsLost = dailyChartData.reduce((acc, curr) => acc + curr.subscribersLost, 0);
  const netSubs = totalSubsGained - totalSubsLost;

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-10">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-zinc-100">Channel Insights</h1>
        <p className="text-zinc-400 mt-2">Deep dive into your performance metrics and audience behavior.</p>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-400">
              <TrendingUp size={20} />
            </div>
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Last 30 Days</span>
          </div>
          <p className="text-zinc-400 text-sm font-medium">Total Views</p>
          <div className="flex items-baseline gap-2 mt-1">
            <h3 className="text-2xl font-bold text-zinc-100">{totalViews.toLocaleString()}</h3>
            <span className="text-emerald-400 text-xs font-bold flex items-center">
              <ArrowUpRight size={12} />
              Live
            </span>
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400">
              <Users size={20} />
            </div>
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Subscriber Growth</span>
          </div>
          <p className="text-zinc-400 text-sm font-medium">Net Subscribers</p>
          <div className="flex items-baseline gap-2 mt-1">
            <h3 className="text-2xl font-bold text-zinc-100">{netSubs > 0 ? `+${netSubs.toLocaleString()}` : netSubs.toLocaleString()}</h3>
            <span className={cn("text-xs font-bold flex items-center", netSubs >= 0 ? "text-emerald-400" : "text-rose-400")}>
              {netSubs >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
              Trend
            </span>
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 rounded-xl bg-yellow-500/10 flex items-center justify-center text-yellow-400">
              <Clock size={20} />
            </div>
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Optimization</span>
          </div>
          <p className="text-zinc-400 text-sm font-medium">Best Time to Post</p>
          <div className="flex items-baseline gap-2 mt-1">
            <h3 className="text-2xl font-bold text-zinc-100">{bestHour ? `${bestHour.hourOfDay}:00` : '--:--'}</h3>
            <span className="text-indigo-400 text-xs font-bold">Peak Views</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Views Over Time */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold text-zinc-100">Views Over Time</h3>
            <BarChart3 size={18} className="text-zinc-500" />
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailyChartData}>
                <defs>
                  <linearGradient id="colorViews" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                <XAxis 
                  dataKey="displayDate" 
                  stroke="#71717a" 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false} 
                  minTickGap={30}
                />
                <YAxis 
                  stroke="#71717a" 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false} 
                  tickFormatter={(value) => value >= 1000 ? `${(value/1000).toFixed(1)}k` : value}
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '8px' }}
                  itemStyle={{ color: '#e4e4e7', fontSize: '12px' }}
                  labelStyle={{ color: '#71717a', fontSize: '10px', marginBottom: '4px' }}
                />
                <Area 
                  type="monotone" 
                  dataKey="views" 
                  stroke="#6366f1" 
                  strokeWidth={2}
                  fillOpacity={1} 
                  fill="url(#colorViews)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Subscriber Behavior */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold text-zinc-100">Subscriber Behavior</h3>
            <Users size={18} className="text-zinc-500" />
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dailyChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                <XAxis 
                  dataKey="displayDate" 
                  stroke="#71717a" 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false} 
                  minTickGap={30}
                />
                <YAxis 
                  stroke="#71717a" 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false} 
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '8px' }}
                  itemStyle={{ fontSize: '12px' }}
                  labelStyle={{ color: '#71717a', fontSize: '10px', marginBottom: '4px' }}
                />
                <Line 
                  type="monotone" 
                  dataKey="subscribersGained" 
                  name="Gained"
                  stroke="#10b981" 
                  strokeWidth={2}
                  dot={false}
                />
                <Line 
                  type="monotone" 
                  dataKey="subscribersLost" 
                  name="Lost"
                  stroke="#f43f5e" 
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Views by Hour of Day */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-bold text-zinc-100">Hourly View Patterns</h3>
            <p className="text-xs text-zinc-500 mt-1">Identify when your audience is most active to optimize your upload schedule.</p>
          </div>
          <Clock size={18} className="text-zinc-500" />
        </div>
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={hourlyChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
              <XAxis 
                dataKey="hourOfDay" 
                stroke="#71717a" 
                fontSize={10} 
                tickLine={false} 
                axisLine={false} 
                tickFormatter={(val) => `${val}:00`}
              />
              <YAxis 
                stroke="#71717a" 
                fontSize={10} 
                tickLine={false} 
                axisLine={false} 
              />
              <Tooltip 
                cursor={{ fill: '#27272a' }}
                contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '8px' }}
                itemStyle={{ color: '#e4e4e7', fontSize: '12px' }}
                labelStyle={{ color: '#71717a', fontSize: '10px', marginBottom: '4px' }}
                labelFormatter={(val) => `Time: ${val}:00`}
              />
              <Bar dataKey="views" radius={[4, 4, 0, 0]}>
                {hourlyChartData.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={entry.hourOfDay === bestHour?.hourOfDay ? '#6366f1' : '#3f3f46'} 
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
