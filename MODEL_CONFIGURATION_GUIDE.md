# Model Configuration System - Implementation Guide

## Overview
Users with paid Gemini API accounts can now customize which AI model is used for each functionality, while being warned about quota implications. The system defaults to Flash models to minimize quota usage for free tier users.

## Key Features

### 1. **Model Storage & Management** (`src/lib/modelStorage.ts`)
- Centralized configuration for model preferences per functionality
- Stores preferences in browser localStorage
- Supports two model tiers: `flash` and `pro`
- Default models are always Flash tier for safe quota management

#### Available Functionalities:
- **general**: Used by most content analysis and generation tasks
- **aicoach**: AI Coach component for strategy discussions  
- **voiceover**: Text-to-speech voice generation
- **thumbnail**: Thumbnail design concepts and analysis
- **seo**: SEO optimization (titles, descriptions, tags)
- **script**: Video script generation

#### Available Models:
- `gemini-2.5-flash` - Fast, high quota (1000 req/day)
- `gemini-2.5-pro` - More capable, lower quota (50 req/day)
- `gemini-2.5-flash-preview-tts` - Optimized for text-to-speech

### 2. **Settings Panel - New "AI Models" Tab** 
Added a new dedicated tab in the Settings Panel (`src/components/ModelSettingsPanel.tsx`) that allows users to:
- Select models for each functionality independently
- See quota warnings for each model tier
- Toggle quota warning notifications
- Reset all models to defaults
- Understand the quota implications of their choices

#### Features:
- Visual indicator showing default vs. custom models
- Color-coded model tiers (blue=flash, purple=pro)
- Quota information and warnings
- Large banner warning about Pro model quota limits
- Persistent storage of preferences

### 3. **Updated Components**

#### AICoach (`src/components/AICoach.tsx`)
- Now uses `getModel('aicoach')` to select model for coaching conversations
- Chat initialization dynamically retrieves model preferences

#### VoiceOver (`src/components/VoiceOver.tsx`)
- Added `getVoiceOverModel()` helper that ensures TTS mode gets TTS-capable models
- Falls back to TTS variant if non-TTS model selected
- Uses model preferences for:
  - Voice preview generation
  - Smart tagging
  - Translation
  - Audio generation

#### APIKeySettings (`src/components/APIKeySettings.tsx`)
- API key test now uses the 'general' model
- Ensures consistent model usage across key validation

#### Gemini Service (`src/services/geminiService.ts`)
- `generateVidVisionInsight()` now accepts optional `functionality` parameter
- Automatically retrieves correct model based on functionality type
- Maintains backward compatibility (defaults to 'general' model)
- Interface:
```typescript
generateVidVisionInsight(prompt, responseSchema?, {
  functionality?: 'general' | 'aicoach' | 'voiceover' | 'thumbnail' | 'seo' | 'script',
  model?: string, // Override auto-detection
  systemInstruction?: string,
  imageBase64?: string,
  imageMediaType?: string
})
```

#### SettingsPanel (`src/components/SettingsPanel.tsx`)
- Added "AI Models" tab with Zap icon
- Integrated ModelSettingsPanel component
- Tab order: Appearance → Brand Kit → AI Models → API Keys

## How It Works

### For End Users:
1. Go to Settings → AI Models
2. For each functionality, select preferred model (Flash by default)
3. Enable/disable quota warnings
4. Click "Save Changes"
5. Preferences are stored in browser locally

### For Developers:
When a component needs to make an AI call:
```typescript
// Option 1: Let it auto-detect (uses 'general' by default)
const response = await generateVidVisionInsight(prompt, schema);

// Option 2: Specify functionality for auto model selection
const response = await generateVidVisionInsight(prompt, schema, {
  functionality: 'seo'
});

// Option 3: Override with specific model
const response = await generateVidVisionInsight(prompt, schema, {
  model: 'gemini-2.5-pro'
});
```

## Quota Warnings

The system displays warnings based on model tier:
- **Flash models**: Warning level (1000 req/day quota)
- **Pro models**: Critical level (50 req/day quota)
- Users can disable warnings per-functionality if desired

## Default Configuration

All functionalities default to `gemini-2.5-flash` with quota warnings enabled, except:
- **voiceover**: Defaults to `gemini-2.5-flash-preview-tts` (required for TTS)

This ensures free tier users won't accidentally hit quota limits while allowing power users with paid APIs to optimize for quality.

## Storage Details

Preferences stored in `localStorage` under key: `vidvision_model_preferences`

Structure:
```json
{
  "general": { "model": "gemini-2.5-flash", "tier": "flash", "quotaWarning": true },
  "aicoach": { "model": "gemini-2.5-flash", "tier": "flash", "quotaWarning": true },
  "voiceover": { "model": "gemini-2.5-flash-preview-tts", "tier": "flash", "quotaWarning": true },
  "thumbnail": { "model": "gemini-2.5-flash", "tier": "flash", "quotaWarning": true },
  "seo": { "model": "gemini-2.5-flash", "tier": "flash", "quotaWarning": true },
  "script": { "model": "gemini-2.5-flash", "tier": "flash", "quotaWarning": true }
}
```

## Migration Path

For future components that need to support specific functionality:
1. Import `getModel` from `modelStorage`
2. Call `getModel('functionality-name')` to get the preferred model
3. Pass to API call or generateVidVisionInsight

## Testing

Build status: ✅ **Successful**
- TypeScript compilation: ✅ Passed
- Production build: ✅ Completed (29.39s)
- All linting: ✅ Passed
