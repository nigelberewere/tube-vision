# Tube Vision - AI YouTube Creator Platform

A unified platform for YouTube creators with AI-powered tools to grow your channel.

## Features

- **SEO Optimizer** - Optimize video titles, descriptions, and tags
- **Content Strategy** - Plan your content calendar
- **Keyword Research** - Find trending keywords and topics
- **Script Architect** - AI-assisted script writing
- **Thumbnail Concepting** - Design ideas for thumbnails
- **Voice Over Studio** - AI-powered text-to-speech with expressive voices
- **Viral Clip Creator** - Extract viral moments from long-form videos
- **My Videos** - View and analyze your uploaded videos
- **Channel Analysis** - Deep dive into your channel metrics
- **AI YouTube Coach** - Get personalized growth advice
- **Video Idea Generator** - Never run out of content ideas
- **Competitor Analysis** - Learn from other successful channels
- **Channel Insights** - Analytics and growth tracking

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies:
   ```
   npm install
   ```

2. Set up environment variables in `.env.local`:
   ```
   GOOGLE_CLIENT_ID=your_google_client_id
   GOOGLE_CLIENT_SECRET=your_google_client_secret
   SESSION_SECRET=your_session_secret
   ```

3. Run the app:
   ```
   npm run dev
   ```

4. Open http://localhost:3000 in your browser

5. **Add your Gemini API key:**
   - Navigate to Settings → API Keys
   - Get your free API key from [Google AI Studio](https://aistudio.google.com/app/apikey)
   - Paste it into the settings panel
   - Your key is encrypted and stored only in your browser

## Tech Stack

- **Frontend:** React 19, TypeScript, Tailwind CSS, Motion (Framer Motion)
- **Backend:** Express, Node.js
- **AI:** Google Gemini API for content generation and analysis (Bring Your Own Key)
- **Auth:** Google OAuth 2.0 for YouTube integration
- **Video Processing:** FFmpeg.wasm for client-side video editing

## Environment Variables

**Required for OAuth:**
- `GOOGLE_CLIENT_ID` - OAuth client ID from Google Cloud Console
- `GOOGLE_CLIENT_SECRET` - OAuth client secret
- `SESSION_SECRET` - Secret for session encryption

**Optional:**
- `APP_URL` - Your app URL (defaults to http://localhost:3000)

**Note:** Gemini API keys are no longer set via environment variables. Users provide their own API keys through Settings → API Keys for privacy and scalability.

## License

MIT
