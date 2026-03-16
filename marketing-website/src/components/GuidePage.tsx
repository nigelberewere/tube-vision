import { useEffect } from "react";
import { motion } from "motion/react";
import { cn } from "@/src/lib/utils";

export type GuideSlug = "api-setup" | "platform-workflow";

type GuidePageConfig = {
  documentTitle: string;
  metaDescription: string;
  heroTitle: string;
  heroSubtitle: string;
  sections: { title: string; content: React.ReactNode }[];
};

const CONFIGS: Record<GuideSlug, GuidePageConfig> = {
  "api-setup": {
    documentTitle: "Gemini API Key Setup Guide | Janso Studio",
    metaDescription:
      "Step-by-step instructions for getting a free Gemini API key from Google AI Studio. Learn why Janso Studio uses BYOK for privacy and scalability.",
    heroTitle: "How to Set Up Your Gemini API Key (BYOK)",
    heroSubtitle:
      "Janso Studio uses a 'Bring Your Own Key' model for Gemini. This keeps your data private and the platform scalable for all creators.",
    sections: [
      {
        title: "Why BYOK?",
        content: (
          <>
            <p className="mb-2">Janso Studio never sees or stores your Gemini API key. You control your own usage, privacy, and cost. This model allows us to offer advanced AI features without storing your data or charging platform fees.</p>
            <ul className="list-disc pl-5 text-sm">
              <li>Full privacy: Your key is stored only in your browser.</li>
              <li>Scalable: No per-user rate limits or platform bottlenecks.</li>
              <li>Cost control: You pay Google directly for your usage (most users stay within the free tier).</li>
            </ul>
          </>
        ),
      },
      {
        title: "Step 1: Get a Free Gemini API Key",
        content: (
          <ol className="list-decimal pl-5 text-sm space-y-2">
            <li>
              Go to <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-indigo-600 underline">Google AI Studio</a> and sign in with your Google account.
            </li>
            <li>
              Click <b>"Create API Key"</b> and copy the generated key.
            </li>
            <li>
              Paste your key into Janso Studio when prompted, or in the API Key Settings panel.
            </li>
          </ol>
        ),
      },
      {
        title: "Step 2: Paste Your Key in Janso Studio",
        content: (
          <p className="text-sm">Open the API Key Settings panel in the app and paste your Gemini API key. Your key is stored securely in your browser and never sent to our servers.</p>
        ),
      },
      {
        title: "Troubleshooting",
        content: (
          <ul className="list-disc pl-5 text-sm">
            <li>If your key is invalid, double-check for extra spaces or typos.</li>
            <li>Keys are case-sensitive and must start with <code>AI</code>.</li>
            <li>If you hit usage limits, visit your Google Cloud Console to review quota.</li>
          </ul>
        ),
      },
    ],
  },
  "platform-workflow": {
    documentTitle: "How Janso Studio Works | Platform Workflow Guide",
    metaDescription:
      "See how creators go from idea to script to SEO optimization using Janso Studio. Learn the full workflow for YouTube growth.",
    heroTitle: "From Idea to Upload: The Janso Studio Workflow",
    heroSubtitle:
      "See how creators use Janso Studio to generate ideas, write scripts, create voiceovers, and optimize for YouTube SEO—all in one place.",
    sections: [
      {
        title: "1. Generate Video Ideas",
        content: (
          <p className="text-sm">Start with the Video Idea Generator to brainstorm topics based on your channel niche, trending keywords, or competitor gaps.</p>
        ),
      },
      {
        title: "2. Write Retention-Optimized Scripts",
        content: (
          <p className="text-sm">Use Script Architect to structure your video for maximum watch time. Choose a framework (AIDA, PAS, storytelling) and let the AI generate hooks, sections, and CTAs.</p>
        ),
      },
      {
        title: "3. Create Studio-Quality Voiceovers",
        content: (
          <p className="text-sm">Send your script to Voice Over Studio. Pick a voice, set tone and pacing, and generate audio in seconds—no mic or studio needed.</p>
        ),
      },
      {
        title: "4. Extract Viral Clips",
        content: (
          <p className="text-sm">Use Viral Clip Creator to turn long-form videos into Shorts. All processing happens in your browser for privacy and speed.</p>
        ),
      },
      {
        title: "5. Optimize for YouTube SEO",
        content: (
          <p className="text-sm">Run your title, description, and tags through the SEO Optimizer. Get keyword suggestions, competitor gap analysis, and semantic tag clusters.</p>
        ),
      },
      {
        title: "6. Publish and Track Growth",
        content: (
          <p className="text-sm">Upload your video, then use the Analytics Dashboard to monitor retention, velocity, and keyword rankings over time.</p>
        ),
      },
    ],
  },
};

type GuidePageProps = {
  slug: GuideSlug;
  isDark: boolean;
  onBack: () => void;
};

export function GuidePage({ slug, isDark, onBack }: GuidePageProps) {
  const config = CONFIGS[slug];

  useEffect(() => {
    const prevTitle = document.title;
    document.title = config.documentTitle;
    let metaEl = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    const prevDesc = metaEl?.content ?? "";
    if (!metaEl) {
      metaEl = document.createElement("meta");
      metaEl.name = "description";
      document.head.appendChild(metaEl);
    }
    metaEl.content = config.metaDescription;
    return () => {
      document.title = prevTitle;
      if (metaEl) metaEl.content = prevDesc;
    };
  }, [config]);

  return (
    <div className={cn("min-h-screen pb-12 transition-colors duration-500", isDark ? "bg-[#050505] text-slate-200" : "bg-slate-100 text-slate-900")}> 
      <div className="mx-auto w-full max-w-3xl px-4 pt-10 md:px-0 md:pt-16">
        <button
          type="button"
          onClick={onBack}
          className={cn(
            "mb-8 inline-flex items-center gap-1.5 text-sm transition-colors",
            isDark ? "text-slate-400 hover:text-slate-100" : "text-slate-500 hover:text-slate-800",
          )}
        >
          ← Back
        </button>
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: "easeOut" }}
          className="mb-8"
        >
          <h1 className="text-3xl font-bold md:text-4xl mb-2">{config.heroTitle}</h1>
          <p className={cn("max-w-2xl text-base md:text-lg", isDark ? "text-slate-300" : "text-slate-700")}>{config.heroSubtitle}</p>
        </motion.div>
        <div className="space-y-10">
          {config.sections.map((section) => (
            <section key={section.title}>
              <h2 className="mb-2 text-xl font-semibold md:text-2xl">{section.title}</h2>
              <div className={cn("prose prose-sm", isDark ? "prose-invert" : "")}>{section.content}</div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
