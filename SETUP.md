# Tube Vision - Setup Guide

## Installation Complete! ✅

All dependencies have been installed. There was a minor network timeout with `youtube-dl-exec`, but this won't affect most features.

## Quick Start

1. **Create your `.env.local` file** (copy from `.env.local.example`):
   ```bash
   cp .env.local.example .env.local
   ```

2. **Add OAuth credentials** to `.env.local`:
   - Create Google OAuth credentials: https://console.cloud.google.com/apis/credentials
     - Enable YouTube Data API v3
     - Enable YouTube Analytics API
     - Add authorized redirect URI: http://localhost:3000/auth/google/callback
   - Add `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `SESSION_SECRET` to `.env.local`

3. **Start the development server**:
   ```bash
   npm run dev
   ```

4. **Open your browser**: http://localhost:3000

5. **Add your Gemini API key** (required for AI features):
   - Click Settings → API Keys
   - Get a free API key from https://aistudio.google.com/app/apikey
   - Paste it into the settings panel
   - Your key is encrypted and stored only in your browser

## Features Available

### ✅ Works Without YouTube Auth:
- SEO Optimizer
- Content Strategy
- Keyword Research
- Script Architect
- Thumbnail Concepting
- **Voice Over Studio** (AI text-to-speech)
- **Viral Clip Creator** (video analysis & editing)

### 🔐 Requires YouTube Auth:
- My Videos
- Channel Analysis
- AI YouTube Coach
- Video Idea Generator (better with auth)
- Competitor Analysis
- Channel Insights

## Troubleshooting

### YouTube URL Download Not Working?
The Viral Clip Creator's YouTube download feature requires `youtube-dl-exec`. If it's not working:
- Use the "Upload File" option instead
- Or manually install yt-dlp: `npm install yt-dlp` (alternative)

### Voice Over Not Working?
- Add your Gemini API key in Settings → API Keys
- Get a free key from https://aistudio.google.com/app/apikey
- The Gemini API must support the `gemini-2.5-flash-preview-tts` model

### OAuth Not Working?
- Check that redirect URI is exactly: `http://localhost:3000/auth/google/callback`
- Enable required APIs in Google Cloud Console
- Verify `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are correct

## File Structure

```
vid-Vision/
├── src/
│   ├── components/
│   │   ├── VoiceOver.tsx              # AI Voice generation
│   │   ├── ViralClipExtractor.tsx     # Video clip analysis
│   │   ├── SEOOptimizer.tsx
│   │   ├── ContentStrategy.tsx
│   │   └── ... (other features)
│   ├── services/
│   │   ├── viralClipService.ts        # Gemini video analysis
│   │   ├── ffmpegService.ts           # Client-side video cutting
│   │   └── geminiService.ts
│   └── App.tsx                        # Main app with navigation
├── server.ts                          # Express server with OAuth & video API
└── package.json                       # All dependencies
```

## Tech Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS
- **Backend**: Express, Google OAuth 2.0
- **AI**: Google Gemini API
- **Video**: FFmpeg.wasm (runs in browser!)

## Next Steps

1. Get your API keys and add them to `.env.local`
2. Run `npm run dev`
3. Start creating amazing YouTube content! 🚀

---

Need help? Check the main [README.md](README.md) for more details.
