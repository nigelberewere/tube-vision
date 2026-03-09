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
}

export default function GrowthMomentum({ isConnected, className }: GrowthMomentumProps) {
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

  return (
    <div className={cn('space-y-6', className)}>
      {/* Growth Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Subscribers Growth */}
        <div className="relative overflow-hidden rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase dark:text-gray-400">
                Subscriber Growth ({selectedPeriod})
              </p>
              <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">
                {periodData?.subscriberGrowth ?? 0 > 0 ? '+' : ''}{formatNumber(periodData?.subscriberGrowth)}
              </p>
              {periodData?.subscriberGrowthPct !== undefined && (
                <p className={cn(
                  'mt-1 text-sm font-medium',
                  isPositiveGrowth(periodData.subscriberGrowthPct) ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                )}>
                  {periodData.subscriberGrowthPct > 0 ? '+' : ''}{periodData.subscriberGrowthPct.toFixed(1)}%
                </p>
              )}
            </div>
            <div className={cn(
              'rounded-full p-2 dark:bg-gray-800',
              isPositiveGrowth(periodData?.subscriberGrowth) ? 'bg-green-100' : 'bg-gray-100'
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
        <div className="relative overflow-hidden rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase dark:text-gray-400">
                View Growth ({selectedPeriod})
              </p>
              <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">
                {periodData?.viewGrowth ?? 0 > 0 ? '+' : ''}{formatNumber(periodData?.viewGrowth)}
              </p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {displayData.length > 0 ? `${displayData.length} days tracked` : 'No data'}
              </p>
            </div>
            <div className={cn(
              'rounded-full p-2 dark:bg-gray-800',
              isPositiveGrowth(periodData?.viewGrowth) ? 'bg-blue-100' : 'bg-gray-100'
            )}>
              <Zap className="h-5 w-5 text-blue-600" />
            </div>
          </div>
        </div>

        {/* Avg Daily Views */}
        <div className="relative overflow-hidden rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase dark:text-gray-400">
                Avg Daily Views ({selectedPeriod})
              </p>
              <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">
                {formatNumber(periodData?.avgDailyViews)}
              </p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                7-day average
              </p>
            </div>
            <div className="rounded-full bg-purple-100 p-2 dark:bg-gray-800">
              <TrendingUp className="h-5 w-5 text-purple-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Period Selector */}
      <div className="flex gap-2">
        {(['week', 'month', 'quarter'] as const).map((period) => (
          <button
            key={period}
            onClick={() => setSelectedPeriod(period)}
            className={cn(
              'rounded-lg px-4 py-2 text-sm font-medium transition-colors',
              selectedPeriod === period
                ? 'bg-blue-600 text-white dark:bg-blue-500'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
            )}
          >
            Last {period === 'week' ? '7' : period === 'month' ? '30' : '90'} days
          </button>
        ))}
      </div>

      {/* Growth Chart */}
      {chartData.length > 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900">
          <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">Growth Trend</h3>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={chartData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="dark:stroke-gray-700" />
              <XAxis 
                dataKey="date" 
                style={{ color: '#6b7280' }}
                className="dark:text-gray-400"
              />
              <YAxis yAxisId="left" style={{ color: '#6b7280' }} className="dark:text-gray-400" />
              <YAxis yAxisId="right" orientation="right" style={{ color: '#6b7280' }} className="dark:text-gray-400" />
              <Tooltip 
                contentStyle={{
                  backgroundColor: '#fff',
                  borderColor: '#e5e7eb',
                  borderRadius: '8px',
                }}
                formatter={(value: any) => {
                  if (typeof value === 'number') {
                    return [formatNumber(value), ''];
                  }
                  return value;
                }}
              />
              <Legend />
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
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center dark:border-gray-700 dark:bg-gray-800">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {loading ? 'Loading growth data...' : 'No snapshot data yet. Snapshots are automatically created daily to track your channel\'s growth momentum.'}
          </p>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-900/20">
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}
    </div>
  );
}
