/**
 * Model Configuration Storage
 * Manages user-selected AI models for different functionalities
 * Defaults to flash models to minimize quota usage
 */

export type Functionality = 
  | 'general'
  | 'aicoach'
  | 'voiceover'
  | 'thumbnail'
  | 'thumbnailImage'
  | 'seo'
  | 'script';

export type ModelTier = 'flash' | 'pro' | 'image';

export interface ModelConfig {
  model: string;
  tier: ModelTier;
  quotaWarning: boolean;
}

export interface AvailableModel {
  id: string;
  name: string;
  tier: ModelTier;
  description: string;
  quotaPerDay: string;
  warning: string;
}

// Default models - Flash models recommended for free tier
export const DEFAULT_MODELS: Record<Functionality, ModelConfig> = {
  general: {
    model: 'gemini-2.5-flash',
    tier: 'flash',
    quotaWarning: true,
  },
  aicoach: {
    model: 'gemini-2.5-flash',
    tier: 'flash',
    quotaWarning: true,
  },
  voiceover: {
    model: 'gemini-2.5-flash-preview-tts',
    tier: 'flash',
    quotaWarning: true,
  },
  thumbnail: {
    model: 'gemini-2.5-flash',
    tier: 'flash',
    quotaWarning: true,
  },
  thumbnailImage: {
    model: 'gemini-3-pro-image-preview',
    tier: 'image',
    quotaWarning: true,
  },
  seo: {
    model: 'gemini-2.5-flash',
    tier: 'flash',
    quotaWarning: true,
  },
  script: {
    model: 'gemini-2.5-flash',
    tier: 'flash',
    quotaWarning: true,
  },
};

// Available models users can select from
export const AVAILABLE_MODELS: AvailableModel[] = [
  {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    tier: 'flash' as const,
    description: 'Fast responses, lower quota usage. Ideal for high-volume tasks.',
    quotaPerDay: '1000 requests',
    warning: 'May reach limits with heavy use',
  },
  {
    id: 'gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    tier: 'pro' as const,
    description: 'More capable, higher quality. Different quota limits apply.',
    quotaPerDay: '50 requests',
    warning: 'Lower quota limit. Use for critical tasks only.',
  },
  {
    id: 'gemini-2.5-flash-preview-tts',
    name: 'Gemini 2.5 Flash (TTS)',
    tier: 'flash' as const,
    description: 'Optimized for text-to-speech generation.',
    quotaPerDay: '500 requests',
    warning: 'Specialized for voice generation',
  },
  {
    id: 'gemini-3-pro-image-preview',
    name: 'Gemini 3 Pro (Image)',
    tier: 'image' as const,
    description: 'Current Gemini image generation/editing model for API-key workflows.',
    quotaPerDay: 'Varies by account',
    warning: 'Recommended for most users with Gemini API keys.',
  },
  {
    id: 'gemini-2.0-flash-preview-image-generation',
    name: 'Gemini Flash (Image)',
    tier: 'image' as const,
    description: 'Legacy image model kept for compatibility with older keys/setups.',
    quotaPerDay: 'Varies by account',
    warning: 'Legacy model. Prefer Gemini 3 Pro (Image).',
  },
  {
    id: 'imagen-4.0-generate-001',
    name: 'Imagen 4',
    tier: 'image' as const,
    description: 'Highest image quality. Requires Imagen API access (paid/billed key).',
    quotaPerDay: 'Varies by account',
    warning: 'Requires image-generation billing on your Gemini key.',
  },
  {
    id: 'imagen-3.0-generate-002',
    name: 'Imagen 3',
    tier: 'image' as const,
    description: 'Alternative high-quality Imagen model. Also requires paid API access.',
    quotaPerDay: 'Varies by account',
    warning: 'Requires image-generation billing on your Gemini key.',
  },
];

const STORAGE_KEY = 'vidvision_model_preferences';

/**
 * Load model preferences from localStorage
 */
export function loadModelPreferences(): Record<Functionality, ModelConfig> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const prefs = JSON.parse(stored);
      // Merge with defaults to ensure all functionalities have a model
      return { ...DEFAULT_MODELS, ...prefs };
    }
  } catch (error) {
    console.error('Error loading model preferences:', error);
  }
  return { ...DEFAULT_MODELS };
}

/**
 * Get model for a specific functionality
 */
export function getModel(functionality: Functionality): string {
  const prefs = loadModelPreferences();
  return prefs[functionality]?.model || DEFAULT_MODELS[functionality].model;
}

export function getModelLabel(modelId: string): string {
  return AVAILABLE_MODELS.find((model) => model.id === modelId)?.name || modelId;
}

/**
 * Get the full config for a functionality
 */
export function getModelConfig(functionality: Functionality): ModelConfig {
  const prefs = loadModelPreferences();
  return prefs[functionality] || DEFAULT_MODELS[functionality];
}

/**
 * Save model preferences to localStorage
 */
export function saveModelPreferences(preferences: Record<Functionality, ModelConfig>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch (error) {
    console.error('Error saving model preferences:', error);
    throw new Error('Failed to save model preferences');
  }
}

/**
 * Update a single functionality's model
 */
export function updateFunctionalityModel(
  functionality: Functionality,
  modelId: string,
  quotaWarning: boolean = true
): void {
  const prefs = loadModelPreferences();
  const selectedModel = AVAILABLE_MODELS.find(m => m.id === modelId);
  
  if (!selectedModel) {
    throw new Error(`Model ${modelId} not found`);
  }

  prefs[functionality] = {
    model: modelId,
    tier: selectedModel.tier,
    quotaWarning,
  };

  saveModelPreferences(prefs);
}

/**
 * Reset all models to defaults
 */
export function resetToDefaults(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Get models suitable for a functionality based on its requirements
 */
export function getSuitableModels(functionality: Functionality): typeof AVAILABLE_MODELS {
  if (functionality === 'voiceover') {
    // TTS functionality only works with specific models
    return AVAILABLE_MODELS.filter(m => m.id.includes('tts'));
  }
  if (functionality === 'thumbnailImage') {
    return AVAILABLE_MODELS.filter(m => m.tier === 'image');
  }
  // All other models available for general/content generation
  return AVAILABLE_MODELS.filter(m => !m.id.includes('tts') && m.tier !== 'image');
}

/**
 * Get quota warning level based on model tier
 */
export function getQuotaWarningLevel(modelConfig: ModelConfig): 'critical' | 'warning' | 'none' {
  if (!modelConfig.quotaWarning) return 'none';
  
  if (modelConfig.tier === 'pro') {
    return 'critical'; // Pro has very limited quota
  }

  if (modelConfig.tier === 'image') {
    return 'warning';
  }
  
  return 'warning'; // Flash has higher quota but still limited
}
