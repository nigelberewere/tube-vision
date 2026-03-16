import { motion } from "motion/react";
import { ArrowLeft, BookOpen, Gamepad2, UserX, CheckCircle2, Play, Users, Zap, Search, Mic, Wand2, Youtube } from "lucide-react";
import { cn } from "@/src/lib/utils";
import YouTubeLogoIcon from "@/src/components/icons/YouTubeLogoIcon";

export type UseCaseSlug = "educators" | "gaming" | "faceless";

const CONFIGS = {
  educators: {
    badge: "For Educators",
    badgeIcon: BookOpen,
    title: "Turn lessons into engaging, accessible videos.",
    hero: "Discover how Script Architect and Voice Over Studio help educators and tutorial creators structure content for maximum clarity and retention.",
    gradientClasses: "from-blue-500/20 via-indigo-500/10 to-transparent",
    stats: [
      { label: "Retention increase", value: "35%" },
      { label: "Hours saved per video", value: "4+" },
      { label: "Languages supported", value: "30+" },
    ],
    features: [
      {
        icon: Wand2,
        title: "Script Architect for Lesson Planning",
        description: "Structure tutorials for clarity and retention. Use built-in frameworks like step-by-step, Q&A, or storytelling to keep your students actively engaged throughout the entire video.",
      },
      {
        icon: Mic,
        title: "Voice Over Studio for Accessibility",
        description: "Generate clear, expressive, and studio-quality narration in multiple languages. Perfect for reaching global audiences and students with different learning needs.",
      },
      {
        icon: Search,
        title: "Automated SEO & Keywords",
        description: "Make sure your tutorials are found by the students who need them. Gemini AI automatically identifies the exact search phrases your audience is using.",
      }
    ],
    ctaHeadline: "Ready to upgrade your tutorials?",
    ctaSubline: "Join thousands of educators scaling their knowledge with Janso Studio.",
  },
  gaming: {
    badge: "For Gaming Channels",
    badgeIcon: Gamepad2,
    title: "Capture every highlight and go viral.",
    hero: "Turn long, unedited streams into viral YouTube Shorts and TikToks instantly with our client-side Viral Clip Creator.",
    gradientClasses: "from-red-500/20 via-orange-500/10 to-transparent",
    stats: [
      { label: "Highlight detection accuracy", value: "98%" },
      { label: "Faster processing", value: "5x" },
      { label: "Privacy compromised", value: "0%" },
    ],
    features: [
      {
        icon: Play,
        title: "Automated Highlight Extraction",
        description: "Our Viral Clip Creator analyzes your local video files in the browser to automatically detect and extract the most exciting, action-packed moments from long-form streams.",
      },
      {
        icon: Zap,
        title: "Client-Side Speed",
        description: "Powered by WebAssembly FFmpeg, your massive 4K gaming files never leave your device. Process clips 5x faster than cloud-based alternatives with zero upload time.",
      },
      {
        icon: Users,
        title: "Scripted Commentary Planning",
        description: "Plan out your intro hooks, commentary scripts, and calls-to-action using the Script Architect to keep your audience engaged between the highlights.",
      }
    ],
    ctaHeadline: "Level up your gaming channel",
    ctaSubline: "Stop spending hours scrubbing through footage. Let AI find the gold.",
  },
  faceless: {
    badge: "For Faceless Channels",
    badgeIcon: UserX,
    title: "Grow your channel without showing your face.",
    hero: "Build an automated content machine using AI-powered scripting, idea generation, and ultra-realistic voiceovers.",
    gradientClasses: "from-emerald-500/20 via-teal-500/10 to-transparent",
    stats: [
      { label: "Content ideas generated", value: "100s" },
      { label: "Cost per AI Voiceover", value: "$0" },
      { label: "Monetization potential", value: "High" },
    ],
    features: [
      {
        icon: Search,
        title: "Video Idea Generator",
        description: "Never run out of ideas. Generate highly-searched topics, compelling titles, and structural outlines tailored perfectly to your specific niche and target audience.",
      },
      {
        icon: Mic,
        title: "Studio-Quality AI Voices",
        description: "Create natural-sounding, expressive narration in any style. Perfect for explainer videos, daily news recaps, or top-10 listicle channels that require professional voice work.",
      },
      {
        icon: Wand2,
        title: "Full Script Automation",
        description: "Take an idea, generate a detailed script optimized for high retention, and seamlessly push it to the Voice Studio—all within a single, unified workspace.",
      }
    ],
    ctaHeadline: "Start your faceless empire",
    ctaSubline: "Create high-quality, monetizable content entirely from your browser.",
  },
};

type UseCasePageProps = {
  slug: UseCaseSlug;
  isDark: boolean;
  onBack: () => void;
  onConnect?: () => void;
};

export function UseCasePage({ slug, isDark, onBack, onConnect }: UseCasePageProps) {
  const config = CONFIGS[slug];
  const BadgeIcon = config.badgeIcon;

  return (
    <div className="w-full pb-20">


      <div className="mx-auto w-full max-w-5xl px-4 pt-10 md:px-8 md:pt-16 relative z-10">
        <button
          type="button"
          onClick={onBack}
          className={cn(
            "mb-8 inline-flex items-center gap-1.5 text-sm transition-colors",
            isDark ? "text-slate-400 hover:text-slate-100" : "text-slate-500 hover:text-slate-800",
          )}
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Home
        </button>

        {/* Hero Section */}
        <div className="text-center max-w-3xl mx-auto mb-16 md:mb-24">
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-6 flex justify-center"
          >
            <span className={cn(
              "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-semibold shadow-sm",
              isDark ? "border-white/10 glass-card text-slate-200" : "border-slate-300 bg-white text-slate-800"
            )}>
              <BadgeIcon className="h-4 w-4" />
              {config.badge}
            </span>
          </motion.div>
          
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-4xl font-bold tracking-tight md:text-5xl lg:text-6xl mb-6 text-balance"
          >
            {config.title}
          </motion.h1>
          
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className={cn("text-lg md:text-xl text-balance", isDark ? "text-slate-300" : "text-slate-700")}
          >
            {config.hero}
          </motion.p>
        </div>

        {/* Stats Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className={cn(
            "grid grid-cols-1 md:grid-cols-3 gap-6 mb-24 rounded-3xl border p-8 shadow-sm",
            isDark ? "border-white/10 glass-card bg-black/20" : "border-slate-200 bg-white"
          )}
        >
          {config.stats.map((stat, i) => (
            <div key={i} className="text-center">
              <p className={cn("text-sm font-medium mb-1", isDark ? "text-slate-400" : "text-slate-500")}>
                {stat.label}
              </p>
              <p className="text-3xl md:text-4xl font-bold">{stat.value}</p>
            </div>
          ))}
        </motion.div>

        {/* Features Details */}
        <div className="space-y-6 md:space-y-12 mb-24">
          <div className="text-center mb-12">
            <h2 className="text-2xl font-bold md:text-3xl mb-4">How Janso Studio Empowers You</h2>
            <p className={cn("max-w-xl mx-auto text-base", isDark ? "text-slate-400" : "text-slate-600")}>
              We provide the exact tools you need to streamline your specific workflow, all powered by privacy-first AI.
            </p>
          </div>
          
          <div className="grid gap-6 md:grid-cols-3">
            {config.features.map((feature, i) => {
              const Icon = feature.icon;
              return (
                <motion.div
                  key={feature.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: i * 0.1 }}
                  className={cn(
                    "flex flex-col rounded-3xl border p-8 transition-all hover:-translate-y-1",
                    isDark
                      ? "border-white/10 glass-card bg-[#0a0a0a]/50 hover:bg-white/[0.04]"
                      : "border-slate-200 bg-white hover:shadow-lg hover:shadow-slate-200/50"
                  )}
                >
                  <div className={cn(
                    "mb-6 flex h-12 w-12 items-center justify-center rounded-2xl",
                    isDark ? "bg-white/10 text-white" : "bg-slate-100 text-slate-800"
                  )}>
                    <Icon className="h-6 w-6" />
                  </div>
                  <h3 className="mb-3 text-xl font-bold">{feature.title}</h3>
                  <p className={cn("text-sm leading-relaxed", isDark ? "text-slate-400" : "text-slate-600")}>
                    {feature.description}
                  </p>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* CTA Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 0.5 }}
          className={cn(
            "rounded-3xl border p-8 text-center md:p-14 shadow-sm relative overflow-hidden",
            isDark
              ? "border-white/10 bg-gradient-to-br from-[#111] via-[#0a0a0a] to-[#1a1a1a]"
              : "border-slate-200 bg-gradient-to-br from-slate-50 via-white to-slate-100",
          )}
        >
          <div className={cn("absolute inset-0 bg-gradient-to-br opacity-20", config.gradientClasses.replace('to-transparent', 'to-[#050505]'))} />
          
          <div className="relative z-10 max-w-2xl mx-auto">
            <h3 className="mb-4 text-3xl font-bold tracking-tight md:text-4xl lg:text-5xl">{config.ctaHeadline}</h3>
            <p className={cn("mx-auto mb-10 text-base md:text-lg", isDark ? "text-slate-300" : "text-slate-600")}>
              {config.ctaSubline}
            </p>
            
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <button
                onClick={onConnect}
                type="button"
                className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-indigo-600 px-8 py-4 text-sm font-bold text-white transition hover:bg-indigo-500 shadow-md shadow-indigo-500/20"
              >
                <YouTubeLogoIcon className="h-5 w-5" />
                Connect YouTube Channel
              </button>
            </div>
            
            <div className={cn("mt-8 flex flex-col md:flex-row items-center justify-center gap-4 text-xs font-medium", isDark ? "text-slate-400" : "text-slate-500")}>
              <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-emerald-500" /> Free to start</span>
              <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-emerald-500" /> No credit card required</span>
              <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-emerald-500" /> 100% Client-side privacy</span>
            </div>
          </div>
        </motion.div>

      </div>
    </div>
  );
}
