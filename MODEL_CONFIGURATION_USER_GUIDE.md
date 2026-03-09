# Model Configuration - User Guide

## Overview

VidVision now allows you to choose which AI model is used for each feature. This is useful if you have a paid Gemini API account and want to optimize for quality or minimize quota usage.

## Accessing Model Settings

1. **Click Settings** (gear icon) in the top navigation
2. **Click "AI Models"** tab
3. You'll see all available features with model options

## Understanding Model Choices

### Flash Models (Recommended for Most Users)
- **`gemini-2.5-flash`** - Fast and efficient
- **Quota**: ~1000 requests per day
- **Best for**: Quick tasks, high-volume usage
- **Quality**: Good for content analysis and generation

### Pro Models (For Power Users with Paid APIs)
- **`gemini-2.5-pro`** - More capable, higher quality
- **Quota**: ~50 requests per day
- **Best for**: Complex tasks, critical decisions
- **Caution**: Very limited daily quota - use sparingly

### Specialized Models
- **`gemini-2.5-flash-preview-tts`** - Text-to-speech optimization
- Used automatically for voice generation
- Special quota rates apply

## Available Features You Can Configure

| Feature | Default Model | When to Change |
|---------|---------------|-----------------|
| **General AI Tasks** | Flash | Use Pro if quality is critical |
| **AI Coach** | Flash | Use Pro for detailed strategic advice |
| **Voice Generation** | Flash TTS | Usually no need to change |
| **Thumbnail Design** | Flash | Use Pro for complex designs |
| **SEO Optimization** | Flash | Use Pro for competitive niches |
| **Script Architecture** | Flash | Use Pro for premium content |

## Quota Warnings

When you select a model, VidVision shows you the quota implications:

<table>
  <tr>
    <th>Warning Level</th>
    <th>What it Means</th>
    <th>What to Do</th>
  </tr>
  <tr>
    <td>🔴 <strong>Critical</strong></td>
    <td>Pro model with only ~50 requests/day</td>
    <td>Use only for tasks requiring highest quality. Monitor usage closely.</td>
  </tr>
  <tr>
    <td>🟡 <strong>Warning</strong></td>
    <td>Flash model with ~1000 requests/day</td>
    <td>Good for general use. May approach limits if very heavy usage.</td>
  </tr>
  <tr>
    <td>✅ <strong>None</strong></td>
    <td>You've disabled warnings</td>
    <td>You understand the quota - no reminder needed</td>
  </tr>
</table>

## How to Use

### Basic Usage (Keep Defaults)
If you're not sure, keep all models on Flash defaults. They provide excellent quality while minimizing quota usage.

### Optimize for Quality (Paid API Users)
If you have a paid API account and want higher quality:

1. Go to Settings → AI Models
2. For important tasks (e.g., Script Architecture), switch to **Pro**
3. Keep less critical tasks (e.g., General Tasks) on **Flash**
4. Click **Save Changes**

### Optimize for Quota (Budget Conscious)
If you want to stretch your free quota further:

1. Keep everything on Flash (default)
2. If you see quota warnings, enable them for all features
3. Click **Save Changes**
4. You'll get warnings before using heavy quota

### Per-Feature Optimization
You can mix models:
- **General AI Tasks**: Flash (high volume)
- **AI Coach**: Pro (quality matters for coaching)
- **Thumbnail Design**: Flash (quick concepts)
- **SEO Optimization**: Flash (good enough for most)
- **Script Architecture**: Pro (this is your final product)

## Save and Reset

### Saving Changes
When you modify any model selections:
1. The **Save Changes** button becomes bright blue (enabled)
2. Click it to save your selections
3. A success message confirms the save
4. Your preferences are saved to your browser

### Reset to Defaults
To go back to all Flash models:
1. Click the **Reset** button
2. Click **OK** to confirm
3. All selections return to Flash models
4. Click **Save Changes** to apply

## Important Notes

⚠️ **Model changes apply immediately** - Once saved, new requests use your selected models.

⚠️ **Quota limits are real** - Check your [Google AI Studio quota](https://aistudio.google.com/app/apikey) if you get errors.

⚠️ **Pro models have tight quotas** - Using Pro for all features will quickly exhaust your daily limit. Use strategically.

⚠️ **Browser-local storage** - Your preferences are stored in your browser only. Using another browser or clearing cookies resets to defaults.

## Switching Models Mid-Session

1. Go to Settings → AI Models
2. Change any models you want
3. Click **Save Changes**
4. Return to your task - next request uses the new models

## Troubleshooting

### "Quota exhausted" error
- You've hit the daily limit for your selected models
- Pro models: Wait until tomorrow (only ~50/day)
- Flash models: Wait until tomorrow (only ~1000/day)
- Or temporarily switch to Pro for less quota if you have it

### "Invalid model name" error
- The model you selected is no longer available
- Reset to defaults using the **Reset** button

### Changes not saving
- Click the blue **Save Changes** button
- Wait for the success message
- Check your browser console for errors

### Want to check your actual quota?
Visit [Google AI Studio](https://aistudio.google.com/app/apikey) to see real-time usage.

## FAQ

**Q: Will changing models affect my API key?**
A: No, your API key stays the same. Only which model gets used changes.

**Q: Can I set different models for different sessions?**
A: Yes! Change models anytime in Settings, and they apply immediately.

**Q: What if I use all my quota?**
A: Free tier users get 1,500 quota units daily total. If you hit it, you'll see "quota exhausted" errors. You'll have to wait until the next day.

**Q: Should I use Pro for everything?**
A: No! Pro has very limited quota (~50 requests/day vs ~1000 for Flash). Use Pro only for your most important tasks.

**Q: Where are my preferences saved?**
A: In your browser's local storage. They persist until you clear cookies or switch browsers.

**Q: Can I share my model preferences with others?**
A: Not directly, but if you export your browser data, your preferences are included.

## Pro Tips

1. **Use Flash for exploration, Pro for finalization** - Generate ideas quickly with Flash, refine with Pro
2. **Monitor your usage** - Check [API key page](https://aistudio.google.com/app/apikey) weekly
3. **Enable quota warnings** - Let VidVision remind you about quotas before requesting
4. **Keep AI Coach on Flash** - Real-time coaching works fine with Flash quality
5. **Use Pro for Script Architecture** - Your scripts are your output, worth the quality
