import { useEffect } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BarChart2,
  Brain,
  Check,
  Clock,
  FileText,
  Globe,
  Layers,
  Mic,
  Search,
  Shield,
  Sparkles,
  Tag,
  TrendingUp,
  Volume2,
  Zap,
} from "lucide-react";
import { motion } from "motion/react";

import { cn } from "@/src/lib/utils";
import YouTubeLogoIcon from "@/src/components/icons/YouTubeLogoIcon";

export type FeatureSlug =
  | "script-architect"
  | "viral-clip-creator"
  | "voice-over-studio"
  | "youtube-seo"
  | "thumbnail-studio"
  | "ai-youtube-coach"
  | "analytics-dashboard"
  | "video-idea-generator";

type Benefit = {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
};

type FeaturePageConfig = {
  documentTitle: string;
  metaDescription: string;
  badge: string;
  heroHeadline: string;
  heroSubheadline: string;
  gradientClasses: string;
  stats: { value: string; label: string }[];
  benefits: Benefit[];
  steps: { title: string; description: string }[];
  ctaHeadline: string;
  ctaSubheadline: string;
};

const CONFIGS: Record<FeatureSlug, FeaturePageConfig> = {
  "script-architect": {
    documentTitle: "AI Script Architect | YouTube Script Generator — No More Writer's Block | Janso Studio",
    metaDescription:
      "Generate full, retention-optimized YouTube scripts in seconds. Hooks, AIDA frameworks, pattern interrupts, and SEO-aware writing — all powered by AI. Try Janso Studio free.",
    badge: "AI Script Architect",
    heroHeadline: "Stop Staring at a Blank Page. Launch Every Video with a Winning Script.",
    heroSubheadline:
      "The AI writing partner that structures your scripts for maximum viewer retention — complete with hooks, narrative beats, and CTAs — in under 60 seconds.",
    gradientClasses: "from-sky-500 to-blue-600",
    stats: [
      { value: "< 60s", label: "Script generation time" },
      { value: "3×", label: "More uploads per month" },
      { value: "8", label: "Writing frameworks" },
    ],
    benefits: [
      {
        icon: Zap,
        title: "Hook Generator",
        description:
          "Open with a scroll-stopping hook in any format: story tease, bold claim, or surprising stat — crafted to maximize three-second viewer retention.",
      },
      {
        icon: Layers,
        title: "Retention Structures",
        description:
          "Choose from AIDA, PAS, storytelling, listicle, and tutorial frameworks proven to extend watch time and drive completions.",
      },
      {
        icon: Brain,
        title: "Pattern Interrupts",
        description:
          "Auto-suggested re-engagement beats placed every 90 seconds to reset viewer attention before the algorithm detects drop-off.",
      },
      {
        icon: Search,
        title: "SEO-Aware Writing",
        description:
          "Target keywords are woven naturally into your script so search engines and viewers both understand your video from the first line.",
      },
      {
        icon: Mic,
        title: "Tone Matching",
        description:
          "Specify your channel voice — casual, authoritative, educational — and the AI adapts every line to sound authentically like you.",
      },
      {
        icon: Tag,
        title: "Chapter Timestamps",
        description:
          "Auto-generated chapter markers to improve search visibility, boost UX scores, and help viewers navigate long-form content.",
      },
    ],
    steps: [
      {
        title: "Enter your video idea",
        description:
          "Type a title, topic, or initial concept. The AI refines your input into a structured narrative outline before writing begins.",
      },
      {
        title: "Choose your framework",
        description:
          "Pick AIDA, PAS, storytelling, or let the AI select the best structure for your specific content type and target audience.",
      },
      {
        title: "Download your script",
        description:
          "Get a full, ready-to-record script with sections, hooks, and timestamp suggestions — or send it straight to Voice Over Studio.",
      },
    ],
    ctaHeadline: "Write Your Next Script in Under a Minute",
    ctaSubheadline: "Join forward-thinking creators who use Janso Studio to plan, write, and publish faster.",
  },

  "viral-clip-creator": {
    documentTitle: "Viral Clip Creator | Turn Long-Form Videos into YouTube Shorts | Janso Studio",
    metaDescription:
      "Extract viral-ready Shorts from long-form videos with client-side FFmpeg — your video never leaves your device. AI scene scoring, auto-captions, 9:16 export. Try free.",
    badge: "Viral Clip Creator",
    heroHeadline: "Every Long-Form Video Contains Dozens of Shorts. Find Them in Minutes.",
    heroSubheadline:
      "Client-side FFmpeg processing means your video never leaves your device. AI scene scoring identifies the moments worth clipping — so you ship more content without more editing time.",
    gradientClasses: "from-red-500 to-orange-500",
    stats: [
      { value: "0 uploads", label: "Video stays on your device" },
      { value: "10×", label: "Faster than manual editing" },
      { value: "9∶16 & 1∶1", label: "Ready-to-publish formats" },
    ],
    benefits: [
      {
        icon: Shield,
        title: "100% Client-Side Processing",
        description:
          "Powered by FFmpeg.wasm running entirely in your browser. No uploads, no server access, no file size limits, and no privacy risk — ever.",
      },
      {
        icon: Brain,
        title: "AI Scene Scoring",
        description:
          "Machine learning scores every scene for energy, pacing, emotional peak, and shareability — ranked so you act on the best clips first.",
      },
      {
        icon: Zap,
        title: "Hook Detection",
        description:
          "Automatically surfaces the moments viewers stop scrolling for — bold statements, humor peaks, high-energy transitions, and surprise reveals.",
      },
      {
        icon: FileText,
        title: "Auto-Captions",
        description:
          "Generate and burn-in captions for silent autoplay watching. Captions increase engagement by up to 15% on silent-first platforms like Shorts.",
      },
      {
        icon: Layers,
        title: "Format Presets",
        description:
          "Export 9:16 vertical for YouTube Shorts, TikTok, and Reels, or 1:1 square for maximum cross-platform reach — with one click.",
      },
      {
        icon: Clock,
        title: "Batch Processing",
        description:
          "Extract 5, 10, or 20 clips from a single video in one session — perfect for weekly content batching and repurposing your archive.",
      },
    ],
    steps: [
      {
        title: "Load your video file",
        description:
          "Select any MP4, MOV, or WebM from your local drive. There is no upload step — the file is processed entirely in your browser using FFmpeg.wasm.",
      },
      {
        title: "Review AI clip suggestions",
        description:
          "Browse AI-scored clips ranked by viral potential, complete with preview thumbnails and scene context. Adjust trim points if desired.",
      },
      {
        title: "Export polished clips",
        description:
          "Download ready-to-upload vertical shorts with burned-in captions and your chosen aspect ratio. No render queue, no waiting.",
      },
    ],
    ctaHeadline: "Start Clipping. Publish More. Grow Faster.",
    ctaSubheadline:
      "One long-form video becomes 10+ clips. Turn your archive into a Shorts library today.",
  },

  "voice-over-studio": {
    documentTitle: "AI Voice Over Studio | Expressive Text-to-Speech for YouTube | Janso Studio",
    metaDescription:
      "Generate expressive AI voiceovers for YouTube with tone, pacing, and emotion controls. 20+ voice characters, 12 languages, Script Architect integration. Try Janso Studio free.",
    badge: "Voice Over Studio",
    heroHeadline: "Studio-Quality AI Voiceovers. No Microphone, No Studio, No Waiting.",
    heroSubheadline:
      "20+ expressive AI voices with tone, pacing, and emotion controls designed for YouTube content. Pair directly with Script Architect for a complete zero-friction production pipeline.",
    gradientClasses: "from-violet-500 to-indigo-600",
    stats: [
      { value: "20+", label: "Voice characters" },
      { value: "< 30s", label: "Audio generation time" },
      { value: "12", label: "Supported languages" },
    ],
    benefits: [
      {
        icon: Mic,
        title: "20+ Voice Characters",
        description:
          "From warm and conversational to authoritative and cinematic — find the exact voice identity that fits your channel and audience expectations.",
      },
      {
        icon: Volume2,
        title: "Emotion Controls",
        description:
          "Dial up enthusiasm for product reviews, gravity for documentaries, or calm clarity for tutorials. Precise sliders, not binary presets.",
      },
      {
        icon: Clock,
        title: "Pacing Editor",
        description:
          "Add natural pauses, slow down emphasis moments, and accelerate rapid-fire lists — giving your AI voice the cadence of a professional presenter.",
      },
      {
        icon: Globe,
        title: "Multi-Language Support",
        description:
          "Produce voiceovers in 12+ languages to reach global audiences without dubbing costs. Native-sounding delivery in every language.",
      },
      {
        icon: Layers,
        title: "Script Architect Sync",
        description:
          "Import scripts directly from Script Architect with one click. No copy-paste, no formatting issues — your full pipeline lives in one workspace.",
      },
      {
        icon: Zap,
        title: "Lossless Export",
        description:
          "Download 44.1 kHz WAV for professional video editing or 320 kbps MP3 for immediate upload — your choice on every generation.",
      },
    ],
    steps: [
      {
        title: "Paste or import your script",
        description:
          "Type directly, paste from anywhere, or pull in your Script Architect output with one click — no reformatting or cleanup required.",
      },
      {
        title: "Configure voice and tone",
        description:
          "Select a voice character, set the emotion profile, and tune pacing to match the exact delivery style your audience expects.",
      },
      {
        title: "Generate and download",
        description:
          "Render studio-quality audio in under 30 seconds. Download WAV or MP3, and regenerate with one click if you want any changes.",
      },
    ],
    ctaHeadline: "Launch Your Next Video Without Recording a Single Take",
    ctaSubheadline: "Your voice, amplified by AI. No studio costs. No reshoots. Just clean audio.",
  },

  "youtube-seo": {
    documentTitle: "YouTube SEO & Keyword Research Tool | Gemini-Powered Optimization | Janso Studio",
    metaDescription:
      "Rank higher on YouTube with Gemini-powered keyword research. Optimize titles, descriptions, tags, and semantic keywords. Find competitor gaps and trending topics. Try free.",
    badge: "YouTube SEO & Keyword Research",
    heroHeadline: "Rank Higher. Get Discovered. Build a Library of Videos YouTube Loves.",
    heroSubheadline:
      "Gemini-powered keyword analysis finds the exact search terms your audience types — then helps you optimize every metadata field to maximize click-through rate and long-term discovery.",
    gradientClasses: "from-indigo-500 to-purple-600",
    stats: [
      { value: "Gemini AI", label: "Semantic analysis engine" },
      { value: "5×", label: "More keyword coverage" },
      { value: "0", label: "Guesswork in your strategy" },
    ],
    benefits: [
      {
        icon: BarChart2,
        title: "Keyword Opportunity Scoring",
        description:
          "Every keyword ranked by search volume, competition level, and your channel's realistic ranking potential — not just raw popularity scores.",
      },
      {
        icon: Zap,
        title: "Title Optimizer",
        description:
          "Generate and score 10 title variants against CTR, keyword strength, and emotional pull simultaneously — then pick the winner.",
      },
      {
        icon: FileText,
        title: "Description Crafting",
        description:
          "AI writes full, keyword-rich descriptions with natural language density tuned for YouTube's search algorithm and Google Discovery.",
      },
      {
        icon: Tag,
        title: "Semantic Tag Clusters",
        description:
          "Auto-generate complete tag sets covering primary, secondary, and long-tail keyword variations — no more manual tag guesswork.",
      },
      {
        icon: Search,
        title: "Competitor Gap Finder",
        description:
          "See the high-traffic keywords your top competitors rank for that your channel hasn't targeted yet — and claim those rankings first.",
      },
      {
        icon: TrendingUp,
        title: "Trending Topic Alerts",
        description:
          "Surface rising search terms before they peak so your videos are indexed and ranking while competitors are still thinking about the topic.",
      },
    ],
    steps: [
      {
        title: "Enter your video topic",
        description:
          "Type a video idea, paste your script excerpt, or connect your YouTube channel to pull recent uploads for instant analysis.",
      },
      {
        title: "Get your keyword map",
        description:
          "Review your opportunity score, competitor coverage gaps, trend direction, and a prioritized list of high-value search terms to target.",
      },
      {
        title: "Apply and publish",
        description:
          "One-click populate your title, description, and tags with optimized content — then publish knowing every metadata field is working for you.",
      },
    ],
    ctaHeadline: "Start Ranking on YouTube with Data, Not Luck",
    ctaSubheadline:
      "Gemini-powered analysis finds the gaps your competitors missed. Start for free today.",
  },
  "thumbnail-studio": {
    documentTitle: "AI YouTube Thumbnail Generator & CTR Tester | Janso Studio",
    metaDescription:
      "Generate YouTube thumbnail ideas, test concepts, and improve click-through rate with Janso Studio's Thumbnail Studio for creators.",
    badge: "Thumbnail Studio",
    heroHeadline: "Design clickable thumbnails before you waste a single upload on a weak first impression.",
    heroSubheadline:
      "Thumbnail Studio helps creators generate concepts, pressure-test visual direction, and make smarter CTR decisions before publishing.",
    gradientClasses: "from-pink-500 to-rose-500",
    stats: [
      { value: "Faster", label: "Concept development" },
      { value: "Higher CTR", label: "Thumbnail decisions" },
      { value: "Less guesswork", label: "Before publish" },
    ],
    benefits: [
      { icon: Zap, title: "Concept Generation", description: "Generate multiple thumbnail directions from the same title so you are never locked into your first idea." },
      { icon: Layers, title: "Visual Contrast Planning", description: "See how facial focus, color blocking, and text placement shift the visual hierarchy of your thumbnail." },
      { icon: Brain, title: "Click Intent Alignment", description: "Match the thumbnail promise to the title promise so viewers feel compelled to click instead of confused." },
      { icon: Tag, title: "Text Overlay Guidance", description: "Use short, punchy overlay copy that amplifies curiosity instead of duplicating the title." },
      { icon: Search, title: "Niche Pattern Awareness", description: "Understand what thumbnail tropes your niche overuses so you can stand out instead of blending in." },
      { icon: TrendingUp, title: "CTR-First Workflow", description: "Move from random design choices to a repeatable thumbnail system that supports channel growth." },
    ],
    steps: [
      { title: "Start with your title or video premise", description: "Give the tool your working title and intended audience so the concepts reflect the click promise." },
      { title: "Compare visual directions", description: "Review different concept angles, emotional hooks, and overlay approaches side by side." },
      { title: "Publish the strongest option", description: "Leave with a clearer thumbnail direction before you invest time in final design work." },
    ],
    ctaHeadline: "Stop guessing your thumbnails into existence",
    ctaSubheadline: "Build a repeatable thumbnail process that supports higher click-through rates over time.",
  },
  "ai-youtube-coach": {
    documentTitle: "AI YouTube Coach | Channel Growth Advice for Creators | Janso Studio",
    metaDescription:
      "Get personalized YouTube growth advice, strategy prompts, and creator coaching with Janso Studio's AI YouTube Coach.",
    badge: "AI YouTube Coach",
    heroHeadline: "Get an always-on YouTube strategist that helps you think clearer, decide faster, and grow smarter.",
    heroSubheadline:
      "AI YouTube Coach gives creators practical strategy guidance, content positioning help, and channel-specific next steps without the cost of a full consultant.",
    gradientClasses: "from-violet-500 to-fuchsia-500",
    stats: [
      { value: "24/7", label: "Strategy support" },
      { value: "Faster", label: "Decision-making" },
      { value: "Clearer", label: "Growth priorities" },
    ],
    benefits: [
      { icon: Brain, title: "Idea Clarification", description: "Pressure-test video ideas, hooks, and positioning before you spend hours producing the wrong thing." },
      { icon: Search, title: "Channel Growth Questions", description: "Ask about uploads, audience behavior, content direction, packaging, or momentum and get actionable answers fast." },
      { icon: FileText, title: "Workflow Companion", description: "Use the coach as the strategic layer above scripting, SEO, voice, and ideas so your tools work together." },
      { icon: Globe, title: "Always Available", description: "Get creator support whenever you are planning, reviewing performance, or stuck on what to publish next." },
      { icon: Layers, title: "Conversation Memory", description: "Keep strategy threads alive so you can continue planning instead of starting over each time." },
      { icon: TrendingUp, title: "Action-Oriented Output", description: "Walk away with specific next moves, not generic motivational fluff." },
    ],
    steps: [
      { title: "Ask your channel question", description: "Bring your packaging, growth, SEO, upload, or audience problem directly into the conversation." },
      { title: "Refine the direction", description: "Use follow-up prompts to sharpen the recommendation until it matches your real content goals." },
      { title: "Turn advice into output", description: "Move straight into scripts, ideas, clips, and optimization with a clearer plan." },
    ],
    ctaHeadline: "Think with a strategist, not in circles",
    ctaSubheadline: "Use AI YouTube Coach to make better content decisions every week.",
  },
  "analytics-dashboard": {
    documentTitle: "YouTube Analytics Dashboard for Creators | Janso Studio",
    metaDescription:
      "Track channel growth, posting momentum, account performance, and creator-focused analytics in the Janso Studio YouTube dashboard.",
    badge: "Analytics Dashboard",
    heroHeadline: "See your YouTube channel like an operator, not just a creator refreshing Studio.",
    heroSubheadline:
      "Janso Studio's analytics dashboard organizes channel momentum, upload performance, and account-level insights into a clearer decision-making workspace.",
    gradientClasses: "from-emerald-500 to-cyan-500",
    stats: [
      { value: "Multi-account", label: "Creator workspace" },
      { value: "Live", label: "Operational visibility" },
      { value: "Actionable", label: "Not just raw data" },
    ],
    benefits: [
      { icon: BarChart2, title: "Growth Momentum", description: "Track the health of your channel with signals that are easier to act on than raw dashboard noise." },
      { icon: TrendingUp, title: "Publishing Feedback Loops", description: "Use recent upload and timing patterns to understand what is actually driving performance." },
      { icon: Layers, title: "Account Switching", description: "Move between channels cleanly when you operate multiple creator brands or client accounts." },
      { icon: Search, title: "Strategy Context", description: "View analytics in the same workspace where you generate ideas, write scripts, and optimize SEO." },
      { icon: Clock, title: "Faster Reviews", description: "Spend less time hunting metrics and more time deciding what to do next." },
      { icon: Zap, title: "Operational Clarity", description: "Turn analytics into a practical publishing workflow instead of a passive reporting screen." },
    ],
    steps: [
      { title: "Connect your channel", description: "Authenticate once and let Janso Studio pull the channel data needed for your workspace." },
      { title: "Review momentum and performance", description: "Check growth, watch trends, and recent content outcomes in one consolidated view." },
      { title: "Act on what the numbers imply", description: "Move directly into scripts, ideas, clips, or SEO with the context already in mind." },
    ],
    ctaHeadline: "Use analytics to decide, not just observe",
    ctaSubheadline: "Get a creator-friendly dashboard that helps you move from data to action faster.",
  },
  "video-idea-generator": {
    documentTitle: "YouTube Video Idea Generator | AI Content Ideas for Creators | Janso Studio",
    metaDescription:
      "Generate YouTube video ideas, hooks, trend angles, and content concepts with Janso Studio's AI Video Idea Generator.",
    badge: "Video Idea Generator",
    heroHeadline: "Build a pipeline of video ideas that actually match your niche, your audience, and your growth goals.",
    heroSubheadline:
      "Janso Studio's Video Idea Generator helps creators develop stronger topics, sharper hooks, and more publishable concepts without staring at a blank page.",
    gradientClasses: "from-amber-500 to-orange-500",
    stats: [
      { value: "Faster", label: "Idea generation" },
      { value: "Sharper", label: "Hooks and angles" },
      { value: "More consistent", label: "Publishing pipeline" },
    ],
    benefits: [
      { icon: Sparkles, title: "Fresh Topic Generation", description: "Generate multiple publishable concepts from a niche, trend, or creator problem in seconds." },
      { icon: Search, title: "Trend-Aware Angles", description: "Get idea directions that are designed around creator intent, discoverability, and audience curiosity." },
      { icon: Tag, title: "Hook Support", description: "Start with stronger opening angles so every concept feels more package-ready from the start." },
      { icon: Brain, title: "Creative Unblocking", description: "Use the generator when you need momentum, not just inspiration." },
      { icon: Layers, title: "Saved Idea Workflow", description: "Keep the best concepts around so they become part of a real content pipeline instead of a lost brainstorm." },
      { icon: FileText, title: "Direct Handoff to Scripting", description: "Take winning ideas straight into Script Architect when you are ready to turn them into production-ready videos." },
    ],
    steps: [
      { title: "Enter your niche or topic direction", description: "Start with the audience, trend, or channel theme you want to explore." },
      { title: "Review hooks and concepts", description: "Scan multiple ideas quickly to find the ones with the strongest promise." },
      { title: "Save and develop the best ones", description: "Move promising concepts into your active workflow so good ideas do not get lost." },
    ],
    ctaHeadline: "Never run your channel on empty again",
    ctaSubheadline: "Use a generator built to help creators publish more consistently without lowering quality.",
  },
};

type FeaturePageProps = {
  slug: FeatureSlug;
  isDark: boolean;
  isAuthenticated: boolean;
  onBack: () => void;
  onConnect: () => void;
};

export function FeaturePage({ slug, isDark, isAuthenticated, onBack, onConnect }: FeaturePageProps) {
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
      {/* ── Hero ── */}
      <section className="relative px-4 pb-16 pt-10 md:px-8 md:pb-20 md:pt-14">
        <div className="mx-auto w-full max-w-6xl">
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
            className="max-w-3xl space-y-6"
          >
            <span
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold",
                isDark ? "border-white/10 bg-white/5 text-slate-200" : "border-slate-200 bg-white text-slate-700",
              )}
            >
              <span
                className={cn(
                  "inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full bg-gradient-to-r",
                  config.gradientClasses,
                )}
              />
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

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="button"
                onClick={onConnect}
                className="inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-bold text-black transition hover:bg-slate-200"
              >
                <YouTubeLogoIcon size={16} />
                {isAuthenticated ? "Continue to Dashboard" : "Try it free"}
              </button>
              <button
                type="button"
                onClick={onBack}
                className={cn(
                  "inline-flex items-center gap-2 rounded-xl border px-6 py-3 text-sm font-semibold transition",
                  isDark
                    ? "border-white/20 bg-black/45 text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] hover:border-white/35 hover:bg-black/60"
                    : "border-slate-300 bg-white text-slate-900 hover:bg-slate-100",
                )}
              >
                See all features
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </motion.div>

          {/* Stats row */}
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="mt-12 grid grid-cols-3 gap-4 md:max-w-xl"
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
                    "text-xl font-bold bg-gradient-to-r bg-clip-text text-transparent md:text-2xl",
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

      {/* ── Benefits ── */}
      <section className="px-4 py-16 md:px-8 md:py-20">
        <div className="mx-auto w-full max-w-6xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.45 }}
            className="mb-10"
          >
            <p className={cn("mb-2 text-sm font-medium", isDark ? "text-indigo-300" : "text-indigo-600")}>
              What you get
            </p>
            <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
              Everything built in, nothing left out
            </h2>
          </motion.div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {config.benefits.map((benefit, idx) => {
              const Icon = benefit.icon;
              return (
                <motion.div
                  key={benefit.title}
                  initial={{ opacity: 0, y: 18 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.15 }}
                  transition={{ duration: 0.35, delay: idx * 0.05 }}
                  className={cn(
                    "rounded-2xl border p-5 transition duration-300",
                    isDark
                      ? "glass-card hover:border-white/20 hover:bg-white/[0.06]"
                      : "border-slate-200 bg-white hover:border-slate-300",
                  )}
                >
                  <div
                    className={cn(
                      "mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br text-white",
                      config.gradientClasses,
                    )}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mb-1.5 text-base font-semibold">{benefit.title}</h3>
                  <p className={cn("text-sm leading-relaxed", isDark ? "text-slate-300" : "text-slate-700")}>
                    {benefit.description}
                  </p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── How It Works ── */}
      <section
        className={cn(
          "px-4 py-16 md:px-8 md:py-20",
          isDark ? "bg-white/[0.02]" : "bg-white",
        )}
      >
        <div className="mx-auto w-full max-w-6xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.45 }}
            className="mb-12"
          >
            <p className={cn("mb-2 text-sm font-medium", isDark ? "text-indigo-300" : "text-indigo-600")}>
              How it works
            </p>
            <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
              Up and running in three steps
            </h2>
          </motion.div>

          <div className="grid gap-8 md:grid-cols-3">
            {config.steps.map((step, idx) => (
              <motion.div
                key={step.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.2 }}
                transition={{ duration: 0.4, delay: idx * 0.1 }}
              >
                <div
                  className={cn(
                    "mb-5 flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br text-sm font-bold text-white",
                    config.gradientClasses,
                  )}
                >
                  {idx + 1}
                </div>
                <h3 className="mb-2 text-base font-semibold">{step.title}</h3>
                <p className={cn("text-sm leading-relaxed", isDark ? "text-slate-400" : "text-slate-600")}>
                  {step.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="px-4 py-20 md:px-8 md:py-24">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.5 }}
          className={cn(
            "mx-auto w-full max-w-2xl rounded-3xl border px-8 py-14 text-center",
            isDark ? "glass-card" : "border-slate-200 bg-white",
          )}
        >
          <div
            className={cn(
              "mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br text-white",
              config.gradientClasses,
            )}
          >
            <Check className="h-6 w-6" />
          </div>
          <h2 className="mb-3 text-2xl font-semibold tracking-tight md:text-3xl">
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
            className="inline-flex items-center gap-2 rounded-xl bg-white px-7 py-3 text-sm font-bold text-black transition hover:bg-slate-200"
          >
            <YouTubeLogoIcon size={16} />
            {isAuthenticated ? "Continue to Dashboard" : "Connect and get started free"}
          </button>
        </motion.div>
      </section>
    </>
  );
}
