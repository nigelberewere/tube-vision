import { GoogleGenAI, Type } from "@google/genai";
import { loadGeminiKey, recordAPIRequest, recordAPIError, redactKey } from "../lib/geminiKeyStorage";
import { classifyGeminiError } from "../lib/geminiErrorClassifier";

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

    const response = await ai.models.generateContent({
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
    });

    if (!response.text) {
      throw new Error("No response from Gemini");
    }

    return JSON.parse(response.text) as Clip[];
  } catch (error) {
    // Classify error for user-friendly messaging
    const classified = classifyGeminiError(error);
    
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
