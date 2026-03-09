import { useState } from 'react';
import { Image as ImageIcon, Eye, ShieldCheck } from 'lucide-react';
import { cn } from '../lib/utils';
import ThumbnailConcepting from './ThumbnailConcepting';
import ThumbnailHeatmapSimulator from './ThumbnailHeatmapSimulator';
import ThumbnailABTester from './ThumbnailABTester';

type ThumbnailTab = 'concepts' | 'heatmap' | 'abtest';

interface ThumbnailStudioProps {}

export default function ThumbnailStudio({}: ThumbnailStudioProps) {
  const [activeSubTab, setActiveSubTab] = useState<ThumbnailTab>('concepts');

  const tabs = [
    { id: 'concepts' as const, label: 'Concepts', icon: ImageIcon, description: 'Generate and audit thumbnails' },
    { id: 'heatmap' as const, label: 'Heatmap', icon: Eye, description: 'Eye-tracking simulation' },
    { id: 'abtest' as const, label: 'A/B Test', icon: ShieldCheck, description: 'Compare performance' },
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
        {activeSubTab === 'concepts' && <ThumbnailConcepting />}
        {activeSubTab === 'heatmap' && <ThumbnailHeatmapSimulator />}
        {activeSubTab === 'abtest' && <ThumbnailABTester />}
      </div>
    </div>
  );
}
