import { useState } from 'react';
import { BarChart4, LineChart as LineChartIcon } from 'lucide-react';
import { cn } from '../lib/utils';
import ChannelAnalysis from './ChannelAnalysis';
import ChannelInsights from './ChannelInsights';

type ChannelTab = 'analysis' | 'insights';

interface ChannelAnalyticsProps {}

export default function ChannelAnalytics({}: ChannelAnalyticsProps) {
  const [activeSubTab, setActiveSubTab] = useState<ChannelTab>('analysis');

  const tabs = [
    { id: 'analysis' as const, label: 'Analysis', icon: BarChart4, description: 'Growth trends & intelligence' },
    { id: 'insights' as const, label: 'Insights', icon: LineChartIcon, description: 'Performance opportunities' },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Sub-navigation tabs */}
      <div className="border-b border-white/10 mb-6">
        <div className="flex gap-1 overflow-x-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeSubTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveSubTab(tab.id)}
                className={cn(
                  'flex items-center gap-2 px-4 py-3 border-b-2 transition-all whitespace-nowrap',
                  isActive
                    ? 'border-purple-500 text-white'
                    : 'border-transparent text-slate-400 hover:text-slate-300 hover:border-slate-600'
                )}
              >
                <Icon size={16} />
                <span className="font-medium text-sm">{tab.label}</span>
                <span className="hidden sm:inline text-xs text-slate-500">
                  {tab.description}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto">
        {activeSubTab === 'analysis' && <ChannelAnalysis />}
        {activeSubTab === 'insights' && <ChannelInsights />}
      </div>
    </div>
  );
}
