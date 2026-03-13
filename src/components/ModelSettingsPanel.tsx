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
  thumbnailImage: {
    label: 'Thumbnail Images',
    description: 'Actual 16:9 thumbnail rendering in Thumbnail Studio',
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

interface ModelSettingsPanelProps {
  theme?: 'dark' | 'light';
}

export default function ModelSettingsPanel({ theme = 'dark' }: ModelSettingsPanelProps) {
  const isLightTheme = theme === 'light';
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
    'thumbnailImage',
    'seo',
    'script',
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10">
      {/* Header */}
      <div className={cn(
        'rounded-2xl border p-6',
        isLightTheme ? 'border-slate-300 bg-slate-100/60' : 'border-white/10 bg-white/[0.03]'
      )}>
        <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-bold">Settings</p>
        <h2 className={cn('text-2xl font-bold mt-2', isLightTheme ? 'text-slate-900' : 'text-white')}>AI Models</h2>
        <p className={cn('mt-2 max-w-2xl', isLightTheme ? 'text-slate-700' : 'text-slate-400')}>
          Choose which AI model to use for each feature. Flash text models are the safest default, while Imagen models control the generated thumbnail images.
        </p>
      </div>

      {/* Quota Warning Banner */}
      <div className={cn(
        'rounded-xl border p-4',
        isLightTheme ? 'border-amber-300 bg-amber-50' : 'border-amber-500/30 bg-amber-500/10'
      )}>
        <div className="flex gap-3">
          <AlertCircle size={18} className={cn('flex-shrink-0 mt-0.5', isLightTheme ? 'text-amber-700' : 'text-amber-400')} />
          <div className={cn('text-sm', isLightTheme ? 'text-amber-900' : 'text-amber-100')}>
            <p className="font-semibold">⚠️ Model Impact on Quota</p>
            <p className={cn('mt-1', isLightTheme ? 'text-amber-800' : 'text-amber-200/80')}>
              Flash text models preserve the most quota. Pro text models have much lower daily limits, and Imagen models use separate image-generation availability and pricing.
            </p>
            <p className={cn('mt-1', isLightTheme ? 'text-amber-800' : 'text-amber-200/80')}>
              Choose Pro or Imagen models only when the quality gain matters. See{' '}
              <a
                href="https://ai.google.dev/pricing"
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  'underline hover:no-underline',
                  isLightTheme ? 'font-medium text-amber-900' : 'text-amber-300'
                )}
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
          const isImageFunction = functionality === 'thumbnailImage';

          return (
            <div
              key={functionality}
              className={cn(
                'rounded-2xl border p-5 space-y-4',
                isLightTheme ? 'border-slate-300 bg-white' : 'border-zinc-800 bg-zinc-900'
              )}
            >
              {/* Functionality Header */}
              <div>
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className={cn('text-lg font-semibold', isLightTheme ? 'text-slate-900' : 'text-white')}>
                      {FUNCTIONALITY_NAMES[functionality].label}
                    </h3>
                    <p className={cn('text-sm mt-1', isLightTheme ? 'text-slate-600' : 'text-zinc-400')}>
                      {FUNCTIONALITY_NAMES[functionality].description}
                    </p>
                  </div>
                  {isDefault && (
                    <span className={cn(
                      'text-[10px] font-bold uppercase tracking-[0.2em] px-2.5 py-1 rounded',
                      isLightTheme
                        ? 'border border-indigo-200 bg-indigo-100 text-indigo-700'
                        : 'bg-indigo-500/20 text-indigo-300'
                    )}>
                      Default
                    </span>
                  )}
                </div>
              </div>

              {/* Model Selection */}
              <div className="space-y-3">
                <label className={cn('text-sm font-medium block', isLightTheme ? 'text-slate-700' : 'text-zinc-200')}>Select Model</label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {suitableModels.map(model => (
                    <button
                      key={model.id}
                      type="button"
                      onClick={() => handleModelChange(functionality, model.id)}
                      className={cn(
                        'text-left rounded-lg border-2 p-3 transition-all',
                        config.model === model.id
                          ? isLightTheme
                            ? 'border-indigo-500 bg-indigo-50 shadow-[inset_0_0_0_1px_rgba(99,102,241,0.15)]'
                            : 'border-indigo-400 bg-indigo-500/10'
                          : isLightTheme
                            ? 'border-slate-300 bg-slate-50 hover:border-indigo-400 hover:bg-indigo-50/40'
                            : 'border-zinc-700 bg-zinc-800/50 hover:border-indigo-500/50 hover:bg-zinc-800'
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className={cn('font-medium text-sm', isLightTheme ? 'text-slate-900' : 'text-white')}>{model.name}</p>
                          <p className={cn('text-xs mt-1', isLightTheme ? 'text-slate-600' : 'text-zinc-400')}>{model.description}</p>
                          <p className={cn('text-[11px] mt-1 font-mono', isLightTheme ? 'text-slate-500' : 'text-zinc-500')}>{model.id}</p>
                          <div className="flex items-center gap-2 mt-2">
                            <span className={cn(
                              'text-[10px] font-bold uppercase tracking-[0.1em] px-2 py-1 rounded',
                              model.tier === 'flash'
                                ? isLightTheme
                                  ? 'border border-blue-200 bg-blue-100 text-blue-700'
                                  : 'bg-blue-500/20 text-blue-300'
                                : model.tier === 'pro'
                                  ? isLightTheme
                                    ? 'border border-purple-200 bg-purple-100 text-purple-700'
                                    : 'bg-purple-500/20 text-purple-300'
                                  : isLightTheme
                                    ? 'border border-emerald-200 bg-emerald-100 text-emerald-700'
                                    : 'bg-emerald-500/20 text-emerald-300'
                            )}>
                              {model.tier}
                            </span>
                            <span className={cn('text-[10px]', isLightTheme ? 'text-slate-600' : 'text-zinc-400')}>{model.quotaPerDay}</span>
                          </div>
                        </div>
                        {config.model === model.id && (
                          <CheckCircle size={18} className={cn('flex-shrink-0 mt-1', isLightTheme ? 'text-indigo-600' : 'text-indigo-400')} />
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Quota Warning Toggle */}
              <div className={cn('pt-3 border-t', isLightTheme ? 'border-slate-200' : 'border-zinc-800')}>
                <label className="flex items-center gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={config.quotaWarning}
                    onChange={(e) => handleQuotaWarningChange(functionality, e.target.checked)}
                    className={cn(
                      'w-4 h-4 rounded cursor-pointer accent-indigo-500',
                      isLightTheme ? 'border-slate-400 bg-white' : 'border-zinc-700 bg-zinc-800'
                    )}
                  />
                  <div className="flex-1 min-w-0">
                    <span className={cn(
                      'text-sm font-medium',
                      isLightTheme ? 'text-slate-800 group-hover:text-slate-900' : 'text-zinc-200 group-hover:text-zinc-100'
                    )}>
                      Show quota warning before using
                    </span>
                    <p className={cn('text-xs', isLightTheme ? 'text-slate-600' : 'text-zinc-500')}>You'll be warned if this model may reach quota limits</p>
                  </div>
                </label>
              </div>

              {/* Model Warning */}
              {warningLevel === 'critical' && (
                <div className={cn(
                  'border rounded-lg p-3',
                  isLightTheme ? 'bg-red-50 border-red-200' : 'bg-red-500/10 border-red-500/30'
                )}>
                  <p className={cn('text-xs flex items-center gap-2', isLightTheme ? 'text-red-800' : 'text-red-200')}>
                    <AlertCircle size={14} className={cn('flex-shrink-0', isLightTheme ? 'text-red-700' : undefined)} />
                    <span>This model has very limited quota. Use for critical tasks only.</span>
                  </p>
                </div>
              )}
              {warningLevel === 'warning' && (
                <div className={cn(
                  'border rounded-lg p-3',
                  isLightTheme ? 'bg-amber-50 border-amber-300' : 'bg-amber-500/10 border-amber-500/30'
                )}>
                  <p className={cn('text-xs flex items-center gap-2', isLightTheme ? 'text-amber-800' : 'text-amber-200')}>
                    <Info size={14} className={cn('flex-shrink-0', isLightTheme ? 'text-amber-700' : undefined)} />
                    <span>
                      {isImageFunction
                        ? 'This image model depends on image-generation access and may use separate quota or pricing.'
                        : 'This model may reach quota limits with heavy daily use.'}
                    </span>
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Action Buttons */}
      <div className={cn('flex gap-3 pt-4 border-t', isLightTheme ? 'border-slate-300' : 'border-zinc-800')}>
        <button
          onClick={handleSave}
          disabled={!settings.hasChanges || isSaving}
          className={cn(
            'flex-1 px-4 py-2.5 rounded-lg font-medium transition-all',
            settings.hasChanges && !isSaving
              ? 'bg-indigo-500 text-white hover:bg-indigo-600'
              : isLightTheme
                ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                : 'bg-zinc-800 text-zinc-400 cursor-not-allowed'
          )}
        >
          {isSaving ? 'Saving...' : 'Save Changes'}
        </button>

        <button
          onClick={handleReset}
          disabled={isSaving}
          className={cn(
            'px-4 py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2',
            isLightTheme
              ? 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
              : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
          )}
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
            ? isLightTheme
              ? 'bg-green-50 text-green-800 border border-green-200'
              : 'bg-green-500/10 text-green-200 border border-green-500/30'
            : isLightTheme
              ? 'bg-red-50 text-red-800 border border-red-200'
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
      <div className={cn(
        'rounded-xl border p-4',
        isLightTheme ? 'border-blue-200 bg-blue-50' : 'border-blue-500/20 bg-blue-500/5'
      )}>
        <div className="flex gap-3">
          <Info size={18} className={cn('flex-shrink-0 mt-0.5', isLightTheme ? 'text-blue-700' : 'text-blue-400')} />
          <div className={cn('text-sm', isLightTheme ? 'text-blue-900' : 'text-blue-200')}>
            <p className="font-semibold">About Model Selection</p>
            <p className={cn('mt-1', isLightTheme ? 'text-blue-800' : 'text-blue-300/80')}>
              Each feature can use a different model. Flash models are optimized for speed and quota efficiency. 
              Pro models offer higher quality but have lower quota limits. Choose based on your API limits and quality needs.
            </p>
            <p className={cn('mt-2', isLightTheme ? 'text-blue-800' : 'text-blue-300/80')}>
              Changes are saved to your browser only. Your preferences won't affect other users.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
