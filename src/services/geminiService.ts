import { GoogleGenAI, Type } from "@google/genai";

function getAIClient() {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing VITE_GEMINI_API_KEY in .env.local. Add it and restart the dev server.");
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
}

export async function generateVidVisionInsight(prompt: string, responseSchema?: any, options?: GenerateInsightOptions) {
  try {
    const ai = getAIClient();

    const config: any = {
      systemInstruction: options?.systemInstruction || SYSTEM_INSTRUCTION,
    };
    
    if (responseSchema) {
      config.responseMimeType = "application/json";
      config.responseSchema = responseSchema;
    }

    const response = await ai.models.generateContent({
      model: options?.model || "gemini-2.5-flash",
      contents: prompt,
      config,
    });
    
    return response.text;
  } catch (error) {
    console.error("Error generating insight:", error);
    throw error;
  }
}
