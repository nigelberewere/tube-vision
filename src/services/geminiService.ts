import { GoogleGenAI, Type } from "@google/genai";
import { loadGeminiKey, recordAPIRequest, recordAPIError, redactKey } from "../lib/geminiKeyStorage";
import { classifyGeminiError } from "../lib/geminiErrorClassifier";
import { getModel, type Functionality } from "../lib/modelStorage";
import { emitGeminiUserError, messageRequiresApiKey } from "../lib/geminiErrorEvents";

async function getAIClient() {
  const apiKey = await loadGeminiKey();
  if (!apiKey) {
    throw new Error("Gemini API key required. Please add your key in Settings → API Keys.");
  }

  return new GoogleGenAI({ apiKey });
}

const SYSTEM_INSTRUCTION = `You are the core AI engine for "VidVision" (a next-generation VidIQ competitor). Your goal is to provide deep, actionable insights for YouTube creators that go beyond basic keyword density.

### Your Capabilities:
1. SEO & Metadata: Generate high-click-through-rate (CTR) titles, optimized descriptions, and high-ranking tags.
2. Content Strategy: Analyze video transcripts to identify "retention-drop" risks or areas for improvement.
3. Keyword Research: Evaluate search volume vs. competition (Scale 1-100) and suggest "Low Competition, High Demand" niches.
4. Script Architect: Generate full video scripts including hooks, transitions, and CTA placements.
5. Thumbnail Concepting: Describe high-impact visual layouts for designers/DALL-E.

### Tone & Style:
Analytical, data-driven, and encouraging. Use "Growth Hacker" terminology (e.g., A/B testing, CTR optimization, Audience Retention).

### Contextual Constraint:
If a user provides a transcript or a link, prioritize the unique "hook" of their content over generic SEO advice.`;

interface GenerateInsightOptions {
  systemInstruction?: string;
  model?: string;
  functionality?: Functionality;
  imageBase64?: string;
  imageMediaType?: string;
}

export async function generateVidVisionInsight(prompt: string, responseSchema?: any, options?: GenerateInsightOptions) {
  try {
    const ai = await getAIClient();

    // Use provided model, or get from preferences based on functionality, or default
    const model = options?.model || 
      (options?.functionality ? getModel(options.functionality) : "gemini-2.5-flash");

    const config: any = {
      systemInstruction: options?.systemInstruction || SYSTEM_INSTRUCTION,
    };
    
    if (responseSchema) {
      config.responseMimeType = "application/json";
      config.responseSchema = responseSchema;
    }

    // Build contents array - include image if provided (for vision API)
    let contents: any = prompt;
    if (options?.imageBase64) {
      contents = [
        {
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: options.imageMediaType || 'image/png',
                data: options.imageBase64
              }
            }
          ]
        }
      ];
    }

    // Record API request for usage tracking
    recordAPIRequest();

    const response = await ai.models.generateContent({
      model,
      contents,
      config,
    });
    
    return response.text;
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
    console.error("Error generating insight:", redactKey(classified.message));
    
    // Throw user-friendly error
    throw new Error(classified.userMessage);
  }
}
