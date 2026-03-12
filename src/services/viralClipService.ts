import { GoogleGenAI, Type } from "@google/genai";
import { loadGeminiKey, recordAPIRequest, recordAPIError, redactKey } from "../lib/geminiKeyStorage";
import { classifyGeminiError } from "../lib/geminiErrorClassifier";
import { emitGeminiUserError, messageRequiresApiKey } from "../lib/geminiErrorEvents";

const GEMINI_RETRY_DELAYS_MS = [1500, 3500];

async function runWithGeminiRetry<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= GEMINI_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const classified = classifyGeminiError(error);
      const hasNextAttempt = attempt < GEMINI_RETRY_DELAYS_MS.length;

      if (!classified.retryable || !hasNextAttempt) {
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, GEMINI_RETRY_DELAYS_MS[attempt]));
    }
  }

  throw lastError;
}

async function getAIClient() {
  const apiKey = await loadGeminiKey();
  if (!apiKey) {
    throw new Error("Gemini API key required. Please add your key in Settings → API Keys.");
  }

  return new GoogleGenAI({ apiKey });
}

export interface Clip {
  clipNumber: number;
  title: string;
  startTime: string;
  endTime: string;
  duration: number;
  score: number;
  rationale: string;
  hookText: string;
  visualEditNotes: string;
  headline: string;
  hashtags: string[];
}

export async function analyzeTranscript(transcript: string): Promise<Clip[]> {
  try {
    const ai = await getAIClient();
    
    const systemInstruction = `
You are an expert Video Content Strategist and Viral Editor. Your goal is to analyze long-form video transcripts (and visual cues if provided) to identify the most high-impact, standalone segments for social media (TikTok, Reels, YouTube Shorts).

### Analysis Framework
For every video provided, evaluate segments based on:
1. **The Hook (0-3s):** Does it start with a high-stakes statement, a surprising fact, or an emotional peak?
2. **Retentiveness:** Is the point made clearly and concisely without needing the full context of the video?
3. **Emotional Resonance:** Does it provoke curiosity, anger, inspiration, or laughter?
4. **Intrinsic Value:** Does the viewer learn something or feel something by the end of the 60-second clip?

### Tasks
1. **Segment Extraction:** Identify 5-10 distinct clips.
2. **Timestamps:** Provide precise [MM:SS] to [MM:SS] markers.
3. **Virality Scoring:** Rate each clip 1-100 and explain why (e.g., "High controversy," "Strong takeaway").
4. **Social Copy:** Write a "scroll-stopping" headline and 3 relevant hashtags for each clip.
5. **Editing Suggestions:** Suggest where to add B-roll, zoom-ins for emphasis, or specific text overlays.
`;

    // Record API request for usage tracking
    recordAPIRequest();

    const response = await runWithGeminiRetry(() =>
      ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: transcript,
        config: {
          systemInstruction,
          responseMimeType: "application/json",
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
      })
    );

    if (!response.text) {
      throw new Error("No response from Gemini");
    }

    return JSON.parse(response.text) as Clip[];
  } catch (error) {
    // Classify error for user-friendly messaging
    const classified = classifyGeminiError(error);

    emitGeminiUserError({
      message: classified.userMessage,
      requiresApiKey: messageRequiresApiKey(classified.userMessage),
    });
    
    // Record specific error types for status display
    if (classified.type === 'invalid_key' || classified.type === 'rate_limited' || classified.type === 'quota_exhausted') {
      recordAPIError(classified.type);
    }
    
    // Log safely without exposing keys
    console.error("Error analyzing transcript:", redactKey(classified.message));
    
    // Throw user-friendly error
    throw new Error(classified.userMessage);
  }
}

const VIDEO_SYSTEM_INSTRUCTION = `
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

const VIDEO_RESPONSE_SCHEMA = {
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
      hashtags: { type: Type.ARRAY, items: { type: Type.STRING } },
    },
    required: ["clipNumber", "title", "startTime", "endTime", "duration", "score", "rationale", "hookText", "visualEditNotes", "headline", "hashtags"],
  },
};

/**
 * Analyze a video file uploaded via the Gemini Files API.
 * The file must already be uploaded + in ACTIVE state before calling this.
 */
export async function analyzeVideoByUri(fileUri: string, mimeType: string): Promise<Clip[]> {
  try {
    const ai = await getAIClient();
    recordAPIRequest();

    const response = await runWithGeminiRetry(() =>
      ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [
          { fileData: { fileUri, mimeType } },
          { text: "Analyze this video and find 5 viral short-form clip opportunities." },
        ],
        config: {
          systemInstruction: VIDEO_SYSTEM_INSTRUCTION,
          responseMimeType: "application/json",
          responseSchema: VIDEO_RESPONSE_SCHEMA,
        },
      })
    );

    if (!response.text) throw new Error("No response from Gemini");
    return JSON.parse(response.text) as Clip[];
  } catch (error) {
    const classified = classifyGeminiError(error);
    emitGeminiUserError({ message: classified.userMessage, requiresApiKey: messageRequiresApiKey(classified.userMessage) });
    if (classified.type === 'invalid_key' || classified.type === 'rate_limited' || classified.type === 'quota_exhausted') {
      recordAPIError(classified.type);
    }
    console.error("Error analyzing video by URI:", redactKey(classified.message));
    throw new Error(classified.userMessage);
  }
}

/**
 * Analyze a YouTube video directly (Gemini fetches it natively via URL).
 */
export async function analyzeYouTubeVideo(youtubeUrl: string): Promise<Clip[]> {
  try {
    const ai = await getAIClient();
    recordAPIRequest();

    const response = await runWithGeminiRetry(() =>
      ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [
          { fileData: { fileUri: youtubeUrl, mimeType: "video/mp4" } },
          { text: "Analyze this video and find 5 viral short-form clip opportunities." },
        ],
        config: {
          systemInstruction: VIDEO_SYSTEM_INSTRUCTION,
          responseMimeType: "application/json",
          responseSchema: VIDEO_RESPONSE_SCHEMA,
        },
      })
    );

    if (!response.text) throw new Error("No response from Gemini");
    return JSON.parse(response.text) as Clip[];
  } catch (error) {
    const classified = classifyGeminiError(error);
    emitGeminiUserError({ message: classified.userMessage, requiresApiKey: messageRequiresApiKey(classified.userMessage) });
    if (classified.type === 'invalid_key' || classified.type === 'rate_limited' || classified.type === 'quota_exhausted') {
      recordAPIError(classified.type);
    }
    console.error("Error analyzing YouTube video:", redactKey(classified.message));
    throw new Error(classified.userMessage);
  }
}

/**
 * Upload a File object to Gemini Files API and wait until it is ACTIVE.
 */
export async function uploadVideoToGemini(
  file: File,
  onProgress?: (step: string) => void,
): Promise<{ fileUri: string; mimeType: string }> {
  const apiKey = await loadGeminiKey();
  if (!apiKey) throw new Error("Gemini API key required. Please add your key in Settings → API Keys.");

  const ai = new GoogleGenAI({ apiKey });

  onProgress?.("Uploading video to Gemini… this may take a moment for larger files.");
  const uploadResult = await ai.files.upload({
    file,
    config: { mimeType: file.type || "video/mp4" },
  });

  onProgress?.("Processing video… waiting for Gemini to prepare the file.");
  let uploadedFile = await ai.files.get({ name: uploadResult.name! });
  while (uploadedFile.state === "PROCESSING") {
    await new Promise((r) => setTimeout(r, 4000));
    uploadedFile = await ai.files.get({ name: uploadResult.name! });
  }
  if (uploadedFile.state === "FAILED") {
    throw new Error("Gemini failed to process the uploaded video. Try a shorter clip or re-upload.");
  }

  return { fileUri: uploadResult.uri!, mimeType: file.type || "video/mp4" };
}
