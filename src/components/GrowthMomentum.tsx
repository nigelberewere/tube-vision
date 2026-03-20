import React, { useEffect, useState } from 'react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart } from 'recharts';
import { TrendingUp, TrendingDown, Zap } from 'lucide-react';
import { cn } from '../lib/utils';

interface GrowthMetric {
  date: string;
  subscriberCount: number;
  videoCount: number;
  viewCount: number;
  estimatedDailyViews: number;
  subscriberGrowth?: number;
  viewGrowth?: number;
  videoGrowth?: number;
}

interface Momentum {
  period: string;
  subscriberGrowth?: number;
  subscriberGrowthPct?: number;
  viewGrowth?: number;
  videoGrowth?: number;
  avgDailyViews?: number;
}

interface GrowthMomentumProps {
  isConnected: boolean;
  className?: string;
  theme?: 'dark' | 'light';
}

export default function GrowthMomentum({ isConnected, className, theme = 'dark' }: GrowthMomentumProps) {
  const isLightTheme = theme === 'light';
  const [historyData, setHistoryData] = useState<GrowthMetric[]>([]);
  const [momentum, setMomentum] = useState<{ week?: Momentum; month?: Momentum; quarter?: Momentum } | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<'week' | 'month' | 'quarter'>('month');
  const [error, setError] = useState<string | null>(null);

  const fetchGrowthData = async () => {
    if (!isConnected) return;

    setLoading(true);
    setError(null);

    try {
      // Ensure today's snapshot exists before loading trend endpoints.
      const saveResponse = await fetch('/api/snapshots/save', { method: 'POST' });
      if (saveResponse.status === 401) {
        setError('Reconnect your YouTube account');
        return;
      }
      if (!saveResponse.ok) {
        console.warn('Snapshot save endpoint returned non-OK status:', saveResponse.status);
      }

      const [historyRes, momentumRes] = await Promise.all([
        fetch('/api/snapshots/history?days=90'),
        fetch('/api/snapshots/momentum'),
      ]);

      if (!historyRes.ok || !momentumRes.ok) {
        // Snapshots may not have data yet, which is fine
        if (historyRes.status === 401 || momentumRes.status === 401) {
          setError('Reconnect your YouTube account');
          return;
        }
        throw new Error('Failed to fetch growth data');
      }

      const historyJson = await historyRes.json();
      const momentumJson = await momentumRes.json();

      setHistoryData(historyJson.snapshots || []);
      setMomentum(momentumJson.momentum);
    } catch (err) {
      console.warn('Growth momentum data not available yet:', err);
      // Don't show error - snapshots may just not have data yet
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isConnected) {
      fetchGrowthData();
      // Refresh every 6 hours
      const interval = setInterval(fetchGrowthData, 6 * 60 * 60 * 1000);
      return () => clearInterval(interval);
    }
  }, [isConnected]);

  if (!isConnected) {
    return null;
  }

  const periodData = momentum?.[selectedPeriod];
  const displayData = selectedPeriod === 'week' 
    ? historyData.slice(-7)
    : selectedPeriod === 'month'
    ? historyData.slice(-30)
    : historyData;

  // Format chart data for recharts
  const chartData = displayData.map((item) => ({
    date: new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    subscribers: item.subscriberCount,
    views: Math.round(item.viewCount / 1000), // Show in thousands
    dailyViews: item.estimatedDailyViews,
  }));

  const formatNumber = (num: number | undefined) => {
    if (num === undefined) return 'N/A';
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const isPositiveGrowth = (growth: number | undefined) => growth && growth > 0;

  const cardClass = isLightTheme
    ? 'border-slate-200 bg-white shadow-sm'
    : 'border-white/10 bg-slate-950/70';
  const labelClass = isLightTheme ? 'text-slate-500' : 'text-slate-400';
  const headingClass = isLightTheme ? 'text-slate-900' : 'text-white';
  const mutedClass = isLightTheme ? 'text-slate-500' : 'text-slate-400';
  const neutralBadgeClass = isLightTheme ? 'bg-slate-100' : 'bg-slate-800/80';
  const inactivePeriodClass = isLightTheme
    ? 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 shadow-sm'
    : 'border border-white/10 bg-slate-800/80 text-slate-200 hover:bg-slate-700';
  const emptyStateClass = isLightTheme
    ? 'border-slate-200 bg-slate-50 text-slate-600'
    : 'border-white/10 bg-slate-900/60 text-slate-300';
  const errorClass = isLightTheme
    ? 'border-red-200 bg-red-50 text-red-700'
    : 'border-red-500/30 bg-red-500/10 text-red-300';
  const gridStroke = isLightTheme ? '#e2e8f0' : 'rgba(148, 163, 184, 0.16)';
  const axisColor = isLightTheme ? '#64748b' : '#94a3b8';
  const tooltipBackground = isLightTheme ? '#ffffff' : '#0f172a';
  const tooltipBorder = isLightTheme ? '#e2e8f0' : 'rgba(148, 163, 184, 0.2)';
  const tooltipText = isLightTheme ? '#0f172a' : '#e2e8f0';

  return (
    <div className={cn('space-y-6', className)}>
      {/* Growth Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
        {/* Subscribers Growth */}
        <div className={cn('relative overflow-hidden rounded-lg border p-4', cardClass)}>
          <div className="flex items-start justify-between">
            <div>
              <p className={cn('text-xs font-medium uppercase', labelClass)}>
                Subscriber Growth ({selectedPeriod})
              </p>
              <p className={cn('mt-2 text-2xl font-bold', headingClass)}>
                {periodData?.subscriberGrowth ?? 0 > 0 ? '+' : ''}{formatNumber(periodData?.subscriberGrowth)}
              </p>
              {periodData?.subscriberGrowthPct !== undefined && (
                <p className={cn(
                  'mt-1 text-sm font-medium',
                  isPositiveGrowth(periodData.subscriberGrowthPct) ? 'text-green-600' : 'text-red-600'
                )}>
                  {periodData.subscriberGrowthPct > 0 ? '+' : ''}{periodData.subscriberGrowthPct.toFixed(1)}%
                </p>
              )}
            </div>
            <div className={cn(
              'rounded-full p-2',
              isPositiveGrowth(periodData?.subscriberGrowth) ? 'bg-green-100' : neutralBadgeClass
            )}>
              {isPositiveGrowth(periodData?.subscriberGrowth) ? (
                <TrendingUp className={cn('h-5 w-5', isPositiveGrowth(periodData?.subscriberGrowth) ? 'text-green-600' : 'text-gray-600')} />
              ) : (
                <TrendingDown className="h-5 w-5 text-gray-600" />
              )}
            </div>
          </div>
        </div>

        {/* Views Growth */}
          <div className={cn('relative overflow-hidden rounded-lg border p-4', cardClass)}>
          <div className="flex items-start justify-between">
            <div>
                <p className={cn('text-xs font-medium uppercase', labelClass)}>
                View Growth ({selectedPeriod})
              </p>
                <p className={cn('mt-2 text-2xl font-bold', headingClass)}>
                {periodData?.viewGrowth ?? 0 > 0 ? '+' : ''}{formatNumber(periodData?.viewGrowth)}
              </p>
                <p className={cn('mt-1 text-xs', mutedClass)}>
                {displayData.length > 0 ? `${displayData.length} days tracked` : 'No data'}
              </p>
            </div>
            <div className={cn(
                'rounded-full p-2',
                isPositiveGrowth(periodData?.viewGrowth) ? 'bg-blue-100' : neutralBadgeClass
            )}>
              <Zap className="h-5 w-5 text-blue-600" />
            </div>
          </div>
        </div>

        {/* Avg Daily Views */}
          <div className={cn('relative overflow-hidden rounded-lg border p-4', cardClass)}>
          <div className="flex items-start justify-between">
            <div>
                <p className={cn('text-xs font-medium uppercase', labelClass)}>
                Avg Daily Views ({selectedPeriod})
              </p>
                <p className={cn('mt-2 text-2xl font-bold', headingClass)}>
                {formatNumber(periodData?.avgDailyViews)}
              </p>
                <p className={cn('mt-1 text-xs', mutedClass)}>
                7-day average
              </p>
            </div>
              <div className={cn('rounded-full p-2', isLightTheme ? 'bg-purple-100' : 'bg-slate-800/80')}>
              <TrendingUp className="h-5 w-5 text-purple-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Period Selector */}
      <div className="grid grid-cols-3 gap-2">
        {(['week', 'month', 'quarter'] as const).map((period) => (
          <button
            key={period}
            onClick={() => setSelectedPeriod(period)}
            className={cn(
              'rounded-lg px-3 py-2 text-center text-sm font-medium transition-colors sm:px-4',
              selectedPeriod === period
                ? 'bg-blue-600 text-white'
                : inactivePeriodClass
            )}
          >
            <span className="sm:hidden">
              {period === 'week' ? 'Last 7' : period === 'month' ? 'Last 30' : 'Last 90'}
            </span>
            <span className="hidden sm:inline">
              Last {period === 'week' ? '7' : period === 'month' ? '30' : '90'} days
            </span>
          </button>
        ))}
      </div>

      {/* Growth Chart */}
      {chartData.length > 0 ? (
        <div className={cn('rounded-lg border p-4 sm:p-6', cardClass)}>
          <h3 className={cn('mb-4 text-lg font-semibold', headingClass)}>Growth Trend</h3>
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={chartData} margin={{ top: 5, right: 12, left: -18, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
              <XAxis 
                dataKey="date" 
                style={{ color: axisColor }}
              />
              <YAxis yAxisId="left" style={{ color: axisColor }} />
              <YAxis yAxisId="right" orientation="right" style={{ color: axisColor }} />
              <Tooltip 
                contentStyle={{
                  backgroundColor: tooltipBackground,
                  borderColor: tooltipBorder,
                  borderRadius: '8px',
                  color: tooltipText,
                }}
                labelStyle={{ color: tooltipText }}
                itemStyle={{ color: tooltipText }}
                formatter={(value: any) => {
                  if (typeof value === 'number') {
                    return [formatNumber(value), ''];
                  }
                  return value;
                }}
              />
              <Legend wrapperStyle={{ color: tooltipText }} />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="subscribers"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={false}
                name="Subscribers"
              />
              <Bar
                yAxisId="right"
                dataKey="dailyViews"
                fill="#8b5cf6"
                opacity={0.7}
                name="Daily Views"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className={cn('rounded-lg border p-8 text-center', emptyStateClass)}>
          <p className="text-sm">
            {loading ? 'Loading growth data...' : 'No snapshot data yet. Snapshots are automatically created daily to track your channel\'s growth momentum.'}
          </p>
        </div>
      )}

      {error && (
        <div className={cn('rounded-lg border p-4', errorClass)}>
          <p className="text-sm">{error}</p>
        </div>
      )}
    </div>
  );
}
