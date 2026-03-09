import { useState } from 'react';
import { Moon, Sun, Palette } from 'lucide-react';
import { cn } from '../lib/utils';
import BrandKit from './BrandKit';

type Theme = 'dark' | 'light';
type SettingsTab = 'appearance' | 'brandkit';

interface SettingsPanelProps {
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
}

export default function SettingsPanel({ theme, onThemeChange }: SettingsPanelProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('appearance');

  const options: Array<{ id: Theme; label: string; description: string; icon: typeof Sun }> = [
    {
      id: 'dark',
      label: 'Dark Mode',
      description: 'High-contrast cinematic workspace for night sessions.',
      icon: Moon,
    },
    {
      id: 'light',
      label: 'Light Mode',
      description: 'Bright and clean workspace for daytime planning.',
      icon: Sun,
    },
  ];

  const settingsTabs = [
    { id: 'appearance' as const, label: 'Appearance', icon: Moon },
    { id: 'brandkit' as const, label: 'Brand Kit', icon: Palette },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10">
      {/* Settings Tabs */}
      <div className="flex gap-2 p-1 bg-zinc-900/50 rounded-lg border border-zinc-800">
        {settingsTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-md transition-all text-sm font-medium',
                isActive
                  ? 'bg-indigo-500 text-white shadow-lg'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
              )}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Render active tab content */}
      {activeTab === 'appearance' ? (
        <>
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
        <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-bold">Settings</p>
        <h2 className="text-2xl font-bold text-white mt-2">Appearance</h2>
        <p className="text-slate-400 mt-2 max-w-2xl">
          Switch between dark and light modes. Your choice is saved and will be used every time you return.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {options.map((option) => {
          const Icon = option.icon;
          const selected = theme === option.id;

          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onThemeChange(option.id)}
              className={cn(
                'text-left rounded-2xl border p-5 transition-all',
                selected
                  ? 'border-indigo-400/70 bg-indigo-500/10 shadow-[0_0_0_1px_rgba(99,102,241,0.3)]'
                  : 'border-zinc-800 bg-zinc-900 hover:border-indigo-500/50 hover:bg-zinc-900/80'
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="w-10 h-10 rounded-lg bg-white/10 border border-white/15 flex items-center justify-center">
                  <Icon size={18} className="text-white" />
                </div>
                {selected && (
                  <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-indigo-300">Active</span>
                )}
              </div>
              <p className="text-lg font-semibold text-white mt-4">{option.label}</p>
              <p className="text-sm text-slate-400 mt-2">{option.description}</p>
            </button>
          );
        })}
      </div>
        </>
      ) : (
        <BrandKit />
      )}
    </div>
  );
}
