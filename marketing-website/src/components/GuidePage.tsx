import { useEffect } from "react";
import { ArrowLeft, BookOpen, Check, Layers, LucideIcon, Rocket, KeyRound, Globe, Shield } from "lucide-react";
import { motion } from "motion/react";

import YouTubeLogoIcon from "@/src/components/icons/YouTubeLogoIcon";
import { cn } from "@/src/lib/utils";

export type GuideSlug = "api-setup" | "platform-workflow";

type GuidePageConfig = {
  documentTitle: string;
  metaDescription: string;
  badge: string;
  heroHeadline: string;
  heroSubheadline: string;
  gradientClasses: string;
  stats: { value: string; label: string }[];
  steps: { title: string; description: string | React.ReactNode; icon?: LucideIcon }[];
  ctaHeadline: string;
  ctaSubheadline: string;
};

const CONFIGS: Record<GuideSlug, GuidePageConfig> = {
  "api-setup": {
    documentTitle: "Gemini API Key Setup Guide | Janso Studio",
    metaDescription:
      "Step-by-step instructions for getting a free Gemini API key from Google AI Studio. Learn why Janso Studio uses BYOK for privacy and scalability.",
    badge: "API Setup Guide",
    heroHeadline: "How to Set Up Your Gemini API Key (BYOK)",
    heroSubheadline:
      "Janso Studio uses a 'Bring Your Own Key' model for Gemini. This keeps your data private and the platform scalable for all creators. Get your free key in 2 minutes.",
    gradientClasses: "from-blue-500 to-indigo-600",
    stats: [
      { value: "100%", label: "Privacy and control" },
      { value: "$0", label: "Cost on free tier" },
      { value: "2 min", label: "Setup time" },
    ],
    steps: [
      {
        icon: Shield,
        title: "Why BYOK?",
        description: (
          <div className="space-y-3">
            <p>Janso Studio never sees or stores your Gemini API key. You control your own usage, privacy, and cost. This model allows us to offer advanced AI features without storing your data or charging platform fees.</p>
            <ul className="list-disc pl-5 opacity-90 space-y-1">
              <li>Full privacy: Your key is stored only in your browser.</li>
              <li>Scalable: No per-user rate limits or platform bottlenecks.</li>
              <li>Cost control: You pay Google directly for your usage.</li>
            </ul>
          </div>
        ),
      },
      {
        icon: KeyRound,
        title: "Step 1: Get a Free Gemini API Key",
        description: (
          <ol className="list-decimal pl-5 opacity-90 space-y-2">
            <li>
              Go to <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-indigo-400 font-medium hover:underline">Google AI Studio</a> and sign in with your Google account.
            </li>
            <li>
              Click <b className="font-semibold text-slate-100">"Create API Key"</b> and copy the generated key.
            </li>
            <li>
              Keep this key safe. Do not share it publicly.
            </li>
          </ol>
        ),
      },
      {
        icon: Layers,
        title: "Step 2: Paste Your Key in Janso Studio",
        description: "Open the API Key Settings panel in the app and paste your Gemini API key. Your key is securely saved to your local browser storage and is never sent to our servers.",
      },
      {
        icon: Globe,
        title: "Troubleshooting",
        description: (
          <ul className="list-disc pl-5 opacity-90 space-y-1">
            <li>If your key is invalid, double-check for extra spaces or typos.</li>
            <li>Keys are case-sensitive and must start with <code className="bg-white/10 px-1 py-0.5 rounded text-xs select-all">AIzaSy</code>.</li>
            <li>If you hit usage limits, visit your Google Cloud Console to review quota.</li>
          </ul>
        ),
      },
    ],
    ctaHeadline: "Ready to test your API key?",
    ctaSubheadline: "Connect your channel and try generating your first script for free.",
  },
  "platform-workflow": {
    documentTitle: "How Janso Studio Works | Platform Workflow Guide",
    metaDescription:
      "See how creators go from idea to script to SEO optimization using Janso Studio. Learn the full workflow for YouTube growth.",
    badge: "Platform Workflow",
    heroHeadline: "From Idea to Upload: The Complete Workflow",
    heroSubheadline:
      "See how creators use Janso Studio to generate ideas, write scripts, create voiceovers, and optimize for YouTube SEO—all from a single, unified dashboard.",
    gradientClasses: "from-emerald-400 to-teal-600",
    stats: [
      { value: "6", label: "Integrated tools" },
      { value: "1", label: "Unified dashboard" },
      { value: "10x", label: "Faster production" },
    ],
    steps: [
      {
        title: "1. Generate Video Ideas",
        description: "Start with the Video Idea Generator to brainstorm topics based on your channel niche, trending keywords, or competitor gaps.",
      },
      {
        title: "2. Write Retention-Optimized Scripts",
        description: "Use Script Architect to structure your video for maximum watch time. Choose a framework (AIDA, PAS, storytelling) and let the AI generate hooks, sections, and CTAs.",
      },
      {
        title: "3. Create Studio-Quality Voiceovers",
        description: "Send your script directly to Voice Over Studio. Pick a voice, set tone and pacing, and generate high-fidelity audio in seconds—no mic or studio needed.",
      },
      {
        title: "4. Extract Viral Clips",
        description: "Use Viral Clip Creator to turn long-form videos into Shorts. All processing happens locally in your browser leveraging FFmpeg.wasm for maximum privacy and speed.",
      },
      {
        title: "5. Optimize for YouTube SEO",
        description: "Run your title, description, and tags through the SEO Optimizer. Get actionable keyword suggestions, competitor gap analysis, and semantic tag clusters.",
      },
      {
        title: "6. Publish and Track Growth",
        description: "Upload your video, then use the Analytics Dashboard to monitor retention, velocity, and keyword rankings over time to refine your strategy.",
      },
    ],
    ctaHeadline: "Streamline Your Entire YouTube Process",
    ctaSubheadline: "Stop jumping between 5 different tools. Run your channel from Janso Studio today.",
  },
};

type GuidePageProps = {
  slug: GuideSlug;
  isDark: boolean;
  isAuthenticated: boolean;
  onBack: () => void;
  onConnect: () => void;
};

export function GuidePage({ slug, isDark, isAuthenticated, onBack, onConnect }: GuidePageProps) {
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
    <>
      <section className="relative px-4 pb-16 pt-10 md:px-8 md:pb-20 md:pt-14">
        <div className="mx-auto w-full max-w-4xl">
          <motion.button
            type="button"
            onClick={onBack}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3 }}
            className={cn(
              "mb-8 inline-flex items-center gap-1.5 text-sm transition-colors",
              isDark ? "text-slate-400 hover:text-slate-100" : "text-slate-500 hover:text-slate-800",
            )}
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Janso Studio
          </motion.button>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: "easeOut" }}
            className="space-y-6"
          >
            <span
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold",
                isDark ? "border-white/10 bg-white/5 text-slate-200" : "border-slate-200 bg-white text-slate-700",
              )}
            >
              <BookOpen className="h-3.5 w-3.5 opacity-70" />
              {config.badge}
            </span>

            <h1 className="text-balance text-4xl font-semibold tracking-tight md:text-5xl lg:text-[3.25rem]">
              {config.heroHeadline}
            </h1>

            <p
              className={cn(
                "max-w-2xl text-base leading-relaxed md:text-lg",
                isDark ? "text-slate-300" : "text-slate-700",
              )}
            >
              {config.heroSubheadline}
            </p>
          </motion.div>

          {/* Stats row */}
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="mt-12 grid grid-cols-3 gap-4 lg:max-w-xl"
          >
            {config.stats.map((stat) => (
              <div
                key={stat.label}
                className={cn(
                  "rounded-2xl border p-4 text-center",
                  isDark ? "glass-card" : "border-slate-200 bg-white",
                )}
              >
                <p
                  className={cn(
                    "text-xl font-bold bg-gradient-to-r bg-clip-text text-transparent xl:text-2xl",
                    config.gradientClasses,
                  )}
                >
                  {stat.value}
                </p>
                <p className={cn("mt-1 text-xs leading-tight", isDark ? "text-slate-400" : "text-slate-600")}>
                  {stat.label}
                </p>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Guide Content / Steps */}
      <section className="px-4 py-8 md:px-8 md:py-16">
        <div className="mx-auto w-full max-w-4xl">
          <div className="grid gap-6">
            {config.steps.map((step, idx) => {
              const Icon = step.icon || Rocket;
              return (
                <motion.div
                  key={step.title}
                  initial={{ opacity: 0, y: 18 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.2 }}
                  transition={{ duration: 0.4, delay: idx * 0.05 }}
                  className={cn(
                    "reveal-stable rounded-2xl border p-6 md:p-8 flex flex-col md:flex-row gap-6",
                    isDark
                      ? "border-white/10 bg-[#0a0a0a]/50"
                      : "border-slate-200 bg-white",
                  )}
                >
                  <div
                    className={cn(
                      "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-sm",
                      config.gradientClasses,
                    )}
                  >
                    <Icon className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="mb-3 text-lg font-semibold md:text-xl">{step.title}</h3>
                    <div className={cn("text-sm md:text-base leading-relaxed", isDark ? "text-slate-300" : "text-slate-600")}>
                      {step.description}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-4 py-16 md:px-8 md:py-24">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.5 }}
          className={cn(
            "reveal-stable mx-auto w-full max-w-2xl rounded-3xl border px-8 py-14 text-center shadow-sm",
            isDark ? "glass-card" : "border-slate-200 bg-slate-50",
          )}
        >
          <div
            className={cn(
              "mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br text-white",
              config.gradientClasses,
            )}
          >
            <Check className="h-7 w-7" />
          </div>
          <h2 className="mb-3 text-2xl font-bold tracking-tight md:text-3xl">
            {config.ctaHeadline}
          </h2>
          <p
            className={cn(
              "mx-auto mb-8 max-w-md text-sm md:text-base",
              isDark ? "text-slate-400" : "text-slate-600",
            )}
          >
            {config.ctaSubheadline}
          </p>
          <button
            type="button"
            onClick={onConnect}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-8 py-3.5 text-sm font-bold text-white transition hover:bg-indigo-500 shadow-md shadow-indigo-500/20"
          >
            <YouTubeLogoIcon className="h-5 w-5" />
            {isAuthenticated ? "Continue to Dashboard" : "Sign In with Google"}
          </button>
        </motion.div>
      </section>
    </>
  );
}
