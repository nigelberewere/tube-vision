import { useState } from 'react';
import { Users, UserPlus } from 'lucide-react';
import { cn } from '../lib/utils';
import CompetitorAnalysis from './CompetitorAnalysis';
import CollaborationEngine from './CollaborationEngine';

type CompetitionTab = 'competitors' | 'collaboration';

interface CompetitionNetworkProps {}

export default function CompetitionNetwork({}: CompetitionNetworkProps) {
  const [activeSubTab, setActiveSubTab] = useState<CompetitionTab>('competitors');

  const tabs = [
    { id: 'competitors' as const, label: 'Competitors', icon: Users, description: 'Analyze & reverse-engineer' },
    { id: 'collaboration' as const, label: 'Collaboration', icon: UserPlus, description: 'Find partners & outreach' },
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
        {activeSubTab === 'competitors' && <CompetitorAnalysis />}
        {activeSubTab === 'collaboration' && <CollaborationEngine />}
      </div>
    </div>
  );
}
