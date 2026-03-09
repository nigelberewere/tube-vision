import { useState, useEffect } from 'react';
import { AlertCircle, CheckCircle, RotateCcw, Info } from 'lucide-react';
import { cn } from '../lib/utils';
import {
  loadModelPreferences,
  saveModelPreferences,
  AVAILABLE_MODELS,
  DEFAULT_MODELS,
  getSuitableModels,
  getQuotaWarningLevel,
  type Functionality,
  type ModelConfig,
} from '../lib/modelStorage';

const FUNCTIONALITY_NAMES: Record<Functionality, { label: string; description: string }> = {
  general: {
    label: 'General AI Tasks',
    description: 'Used for most content analysis and generation tasks',
  },
  aicoach: {
    label: 'AI Coach',
    description: 'Real-time coaching and strategy discussions',
  },
  voiceover: {
    label: 'Voice Generation',
    description: 'Text-to-speech for video narration',
  },
  thumbnail: {
    label: 'Thumbnail Design',
    description: 'Thumbnail concept generation and analysis',
  },
  seo: {
    label: 'SEO Optimization',
    description: 'Title, description, and tag optimization',
  },
  script: {
    label: 'Script Architecture',
    description: 'Video script generation and editing',
  },
};

interface ModelSettings {
  preferences: Record<Functionality, ModelConfig>;
  hasChanges: boolean;
}

export default function ModelSettingsPanel() {
  const [settings, setSettings] = useState<ModelSettings>({
    preferences: { ...DEFAULT_MODELS },
    hasChanges: false,
  });

  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Load preferences on mount
  useEffect(() => {
    const prefs = loadModelPreferences();
    setSettings({ preferences: prefs, hasChanges: false });
  }, []);

  function handleModelChange(functionality: Functionality, modelId: string) {
    const newPreferences = {
      ...settings.preferences,
      [functionality]: {
        ...settings.preferences[functionality],
        model: modelId,
        tier: AVAILABLE_MODELS.find(m => m.id === modelId)?.tier || 'flash',
      },
    };

    setSettings({
      preferences: newPreferences,
      hasChanges: true,
    });
    setSaveMessage(null);
  }

  function handleQuotaWarningChange(functionality: Functionality, checked: boolean) {
    const newPreferences = {
      ...settings.preferences,
      [functionality]: {
        ...settings.preferences[functionality],
        quotaWarning: checked,
      },
    };

    setSettings({
      preferences: newPreferences,
      hasChanges: true,
    });
  }

  async function handleSave() {
    setIsSaving(true);
    try {
      saveModelPreferences(settings.preferences);
      setSaveMessage({
        type: 'success',
        text: 'Model preferences saved successfully',
      });
      setSettings(prev => ({ ...prev, hasChanges: false }));
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (error) {
      setSaveMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Failed to save preferences',
      });
    } finally {
      setIsSaving(false);
    }
  }

  function handleReset() {
    if (confirm('Reset all model preferences to defaults? This cannot be undone.')) {
      setSettings({
        preferences: { ...DEFAULT_MODELS },
        hasChanges: true,
      });
    }
  }

  const functionalities: Functionality[] = [
    'general',
    'aicoach',
    'voiceover',
    'thumbnail',
    'seo',
    'script',
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10">
      {/* Header */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
        <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-bold">Settings</p>
        <h2 className="text-2xl font-bold text-white mt-2">AI Models</h2>
        <p className="text-slate-400 mt-2 max-w-2xl">
          Choose which AI model to use for each feature. Flash models are recommended for most users to minimize quota usage.
        </p>
      </div>

      {/* Quota Warning Banner */}
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
        <div className="flex gap-3">
          <AlertCircle size={18} className="text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-amber-100">
            <p className="font-semibold">⚠️ Model Impact on Quota</p>
            <p className="text-amber-200/80 mt-1">
              Switching from Flash to Pro models will <strong>significantly reduce your daily API quota</strong>. 
              Flash: ~1000 requests/day • Pro: ~50 requests/day
            </p>
            <p className="text-amber-200/80 mt-1">
              Choose Pro models only for tasks where higher quality is critical. See{' '}
              <a
                href="https://ai.google.dev/pricing"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:no-underline text-amber-300"
              >
                pricing details
              </a>
            </p>
          </div>
        </div>
      </div>

      {/* Model Selection Cards */}
      <div className="space-y-4">
        {functionalities.map(functionality => {
          const config = settings.preferences[functionality] || DEFAULT_MODELS[functionality];
          const isDefault = DEFAULT_MODELS[functionality].model === config.model;
          const warningLevel = getQuotaWarningLevel(config);
          const suitableModels = getSuitableModels(functionality);

          return (
            <div
              key={functionality}
              className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 space-y-4"
            >
              {/* Functionality Header */}
              <div>
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-white">
                      {FUNCTIONALITY_NAMES[functionality].label}
                    </h3>
                    <p className="text-sm text-zinc-400 mt-1">
                      {FUNCTIONALITY_NAMES[functionality].description}
                    </p>
                  </div>
                  {isDefault && (
                    <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-indigo-300 bg-indigo-500/20 px-2.5 py-1 rounded">
                      Default
                    </span>
                  )}
                </div>
              </div>

              {/* Model Selection */}
              <div className="space-y-3">
                <label className="text-sm font-medium text-zinc-200 block">Select Model</label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {suitableModels.map(model => (
                    <button
                      key={model.id}
                      type="button"
                      onClick={() => handleModelChange(functionality, model.id)}
                      className={cn(
                        'text-left rounded-lg border-2 p-3 transition-all',
                        config.model === model.id
                          ? 'border-indigo-400 bg-indigo-500/10'
                          : 'border-zinc-700 bg-zinc-800/50 hover:border-indigo-500/50 hover:bg-zinc-800'
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-white text-sm">{model.name}</p>
                          <p className="text-xs text-zinc-400 mt-1">{model.description}</p>
                          <div className="flex items-center gap-2 mt-2">
                            <span className={cn(
                              'text-[10px] font-bold uppercase tracking-[0.1em] px-2 py-1 rounded',
                              model.tier === 'flash'
                                ? 'bg-blue-500/20 text-blue-300'
                                : 'bg-purple-500/20 text-purple-300'
                            )}>
                              {model.tier}
                            </span>
                            <span className="text-[10px] text-zinc-400">{model.quotaPerDay}</span>
                          </div>
                        </div>
                        {config.model === model.id && (
                          <CheckCircle size={18} className="text-indigo-400 flex-shrink-0 mt-1" />
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Quota Warning Toggle */}
              <div className="pt-3 border-t border-zinc-800">
                <label className="flex items-center gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={config.quotaWarning}
                    onChange={(e) => handleQuotaWarningChange(functionality, e.target.checked)}
                    className="w-4 h-4 rounded border-zinc-700 bg-zinc-800 cursor-pointer accent-indigo-500"
                  />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-zinc-200 group-hover:text-zinc-100">
                      Show quota warning before using
                    </span>
                    <p className="text-xs text-zinc-500">You'll be warned if this model may reach quota limits</p>
                  </div>
                </label>
              </div>

              {/* Model Warning */}
              {warningLevel === 'critical' && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                  <p className="text-xs text-red-200 flex items-center gap-2">
                    <AlertCircle size={14} className="flex-shrink-0" />
                    <span>This model has very limited quota. Use for critical tasks only.</span>
                  </p>
                </div>
              )}
              {warningLevel === 'warning' && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
                  <p className="text-xs text-amber-200 flex items-center gap-2">
                    <Info size={14} className="flex-shrink-0" />
                    <span>This model may reach quota limits with heavy daily use.</span>
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3 pt-4 border-t border-zinc-800">
        <button
          onClick={handleSave}
          disabled={!settings.hasChanges || isSaving}
          className={cn(
            'flex-1 px-4 py-2.5 rounded-lg font-medium transition-all',
            settings.hasChanges && !isSaving
              ? 'bg-indigo-500 text-white hover:bg-indigo-600'
              : 'bg-zinc-800 text-zinc-400 cursor-not-allowed'
          )}
        >
          {isSaving ? 'Saving...' : 'Save Changes'}
        </button>

        <button
          onClick={handleReset}
          disabled={isSaving}
          className="px-4 py-2.5 rounded-lg font-medium bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          <RotateCcw size={16} />
          Reset
        </button>
      </div>

      {/* Save Message */}
      {saveMessage && (
        <div className={cn(
          'rounded-lg p-3 text-sm font-medium flex items-center gap-2 animate-in fade-in',
          saveMessage.type === 'success'
            ? 'bg-green-500/10 text-green-200 border border-green-500/30'
            : 'bg-red-500/10 text-red-200 border border-red-500/30'
        )}>
          {saveMessage.type === 'success' ? (
            <CheckCircle size={16} />
          ) : (
            <AlertCircle size={16} />
          )}
          {saveMessage.text}
        </div>
      )}

      {/* Info Box */}
      <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
        <div className="flex gap-3">
          <Info size={18} className="text-blue-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-200">
            <p className="font-semibold">About Model Selection</p>
            <p className="text-blue-300/80 mt-1">
              Each feature can use a different model. Flash models are optimized for speed and quota efficiency. 
              Pro models offer higher quality but have lower quota limits. Choose based on your API limits and quality needs.
            </p>
            <p className="text-blue-300/80 mt-2">
              Changes are saved to your browser only. Your preferences won't affect other users.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
