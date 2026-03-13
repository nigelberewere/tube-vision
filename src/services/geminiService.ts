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

const SYSTEM_INSTRUCTION = `You are the core AI engine for "Janso Studio" (a next-generation VidIQ competitor). Your goal is to provide deep, actionable insights for YouTube creators that go beyond basic keyword density.

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

interface GenerateThumbnailImageOptions {
  aspectRatio?: string;
  modelCandidates?: string[];
}

const DEFAULT_THUMBNAIL_IMAGE_MODELS = [
  "imagen-4.0-generate-001",
  "imagen-3.0-generate-002",
];

function uniqueModels(candidates: string[]): string[] {
  const deduped = new Set<string>();
  for (const candidate of candidates) {
    const value = String(candidate || "").trim();
    if (value) {
      deduped.add(value);
    }
  }
  return [...deduped];
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

export async function generateThumbnailImage(prompt: string, options: GenerateThumbnailImageOptions = {}) {
  try {
    const ai = await getAIClient();
    const modelsToTry = uniqueModels([...(options.modelCandidates || []), ...DEFAULT_THUMBNAIL_IMAGE_MODELS]);

    if (modelsToTry.length === 0) {
      throw new Error("No image generation model configured.");
    }

    let lastError: unknown = null;

    for (const model of modelsToTry) {
      try {
        recordAPIRequest();

        const response = await ai.models.generateImages({
          model,
          prompt,
          config: {
            numberOfImages: 1,
            aspectRatio: options.aspectRatio || "16:9",
            outputMimeType: "image/png",
            includeRaiReason: true,
            enhancePrompt: true,
          },
        });

        const generatedImage = response.generatedImages?.[0];
        const imageBytes = generatedImage?.image?.imageBytes;
        const mimeType = generatedImage?.image?.mimeType || "image/png";

        if (imageBytes) {
          return `data:${mimeType};base64,${imageBytes}`;
        }

        if (generatedImage?.raiFilteredReason) {
          throw new Error(`Image request was filtered: ${generatedImage.raiFilteredReason}`);
        }

        throw new Error("Image model returned no image bytes.");
      } catch (modelError) {
        lastError = modelError;
      }
    }

    throw lastError || new Error("No supported image model produced a thumbnail.");
  } catch (error) {
    const classified = classifyGeminiError(error);

    emitGeminiUserError({
      message: classified.userMessage,
      requiresApiKey: messageRequiresApiKey(classified.userMessage),
    });

    if (classified.type === "invalid_key" || classified.type === "rate_limited" || classified.type === "quota_exhausted") {
      recordAPIError(classified.type);
    }

    console.error("Error generating thumbnail image:", redactKey(classified.message));
    throw new Error(classified.userMessage);
  }
}
