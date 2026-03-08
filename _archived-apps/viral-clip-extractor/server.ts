import express from 'express';
import { createServer as createViteServer } from 'vite';
import multer from 'multer';
import { GoogleGenAI, Type } from '@google/genai';
import fs from 'fs';
import path from 'path';
import youtubedl from 'youtube-dl-exec';

const upload = multer({ dest: 'uploads/' });

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Create uploads directory if it doesn't exist
  if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
  }

  // Headers for SharedArrayBuffer (ffmpeg.wasm)
  app.use((req, res, next) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    next();
  });

  // Serve uploads directory
  app.use('/uploads', express.static('uploads'));

  app.use(express.json());

  // API Routes
  app.post('/api/analyze', upload.single('video'), async (req, res) => {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      let filePath = '';
      let mimeType = 'video/mp4';
      let videoUrl = '';

      if (req.file) {
        filePath = req.file.path;
        mimeType = req.file.mimetype;
        videoUrl = `/uploads/${req.file.filename}`;
      } else if (req.body.youtubeUrl) {
        const url = req.body.youtubeUrl;
        const filename = `yt-${Date.now()}.mp4`;
        filePath = path.join('uploads', filename);
        videoUrl = `/uploads/${filename}`;
        
        console.log(`Downloading YouTube video: ${url}`);
        try {
          await youtubedl(url, {
            output: filePath,
            format: 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
            noCheckCertificates: true,
            noWarnings: true,
            preferFreeFormats: true,
            addHeader: [
              'referer:https://www.google.com/',
              'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            ],
          });
        } catch (dlError: any) {
          console.error('YouTube download error:', dlError.message);
          if (dlError.message.includes('Sign in to confirm you’re not a bot')) {
            throw new Error('YouTube is blocking this request. Please download the video manually and use the "Upload File" option.');
          }
          throw dlError;
        }
      } else {
        return res.status(400).json({ error: 'No video provided' });
      }

      console.log(`Uploading file ${filePath} to Gemini...`);
      const uploadResult = await ai.files.upload({
        file: filePath,
        config: {
          mimeType: mimeType,
        }
      });

      console.log(`File uploaded. Waiting for processing...`);
      let file = await ai.files.get({ name: uploadResult.name });
      while (file.state === 'PROCESSING') {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        file = await ai.files.get({ name: uploadResult.name });
      }

      if (file.state === 'FAILED') {
        throw new Error('Video processing failed in Gemini');
      }

      console.log(`File processed. Generating content...`);
      const systemInstruction = `
You are an expert Video Content Strategist and Viral Editor. Your goal is to analyze long-form videos to identify the most high-impact, standalone segments for social media (TikTok, Reels, YouTube Shorts).

### Analysis Framework
For every video provided, evaluate segments based on:
1. **The Hook (0-3s):** Does it start with a high-stakes statement, a surprising fact, or an emotional peak?
2. **Retentiveness:** Is the point made clearly and concisely without needing the full context of the video?
3. **Emotional Resonance:** Does it provoke curiosity, anger, inspiration, or laughter?
4. **Intrinsic Value:** Does the viewer learn something or feel something by the end of the 60-second clip?

### Tasks
1. **Segment Extraction:** Identify exactly 5 distinct clips.
2. **Timestamps:** Provide precise [MM:SS] to [MM:SS] markers.
3. **Virality Scoring:** Rate each clip 1-100 and explain why.
4. **Social Copy:** Write a "scroll-stopping" headline and 3 relevant hashtags for each clip.
5. **Editing Suggestions:** Suggest where to add B-roll, zoom-ins for emphasis, or specific text overlays.
`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: [
          { fileData: { fileUri: uploadResult.uri, mimeType: uploadResult.mimeType } },
          { text: 'Analyze this video and find 5 viral clips.' }
        ],
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                clipNumber: { type: Type.INTEGER },
                title: { type: Type.STRING },
                startTime: { type: Type.STRING, description: "MM:SS" },
                endTime: { type: Type.STRING, description: "MM:SS" },
                duration: { type: Type.INTEGER, description: "Duration in seconds" },
                score: { type: Type.INTEGER, description: "Score out of 100" },
                rationale: { type: Type.STRING },
                hookText: { type: Type.STRING },
                visualEditNotes: { type: Type.STRING },
                headline: { type: Type.STRING },
                hashtags: { 
                  type: Type.ARRAY,
                  items: { type: Type.STRING }
                }
              },
              required: ["clipNumber", "title", "startTime", "endTime", "duration", "score", "rationale", "hookText", "visualEditNotes", "headline", "hashtags"]
            }
          }
        }
      });

      res.json({ 
        clips: JSON.parse(response.text || '[]'),
        videoUrl: videoUrl
      });
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
