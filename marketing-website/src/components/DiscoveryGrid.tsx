import { ArrowRight, Compass, Gamepad2, GraduationCap, KeyRound, Search, Sparkles } from "lucide-react";
import { motion } from "motion/react";

import { type FeatureSlug } from "@/src/components/FeaturePage";
import { type GuideSlug } from "@/src/components/GuidePage";
import { type UseCaseSlug } from "@/src/components/UseCasePage";
import { cn } from "@/src/lib/utils";

type DiscoveryGridProps = {
  isDark: boolean;
  onNavigateToFeature: (slug: FeatureSlug) => void;
  onNavigateToGuide: (slug: GuideSlug) => void;
  onNavigateToUseCase: (slug: UseCaseSlug) => void;
  onNavigateToFreeTools: () => void;
};

const SECTIONS = [
  {
    title: "Feature deep dives",
    description: "Targeted landing pages built around high-intent creator problems and SEO terms.",
    items: [
      { label: "AI YouTube Script Generator", caption: "Script Architect", icon: Sparkles, action: "feature", slug: "script-architect" },
      { label: "Extract Viral Clips from Long Videos", caption: "Viral Clip Creator", icon: Compass, action: "feature", slug: "viral-clip-creator" },
      { label: "YouTube SEO Optimizer", caption: "Keyword research and metadata", icon: Search, action: "feature", slug: "youtube-seo" },
    ],
  },
  {
    title: "Creator-specific playbooks",
    description: "Show each audience exactly how Janso Studio fits their workflow.",
    items: [
      { label: "For Gaming Creators", caption: "Shorts, clips, highlights", icon: Gamepad2, action: "usecase", slug: "gaming" },
      { label: "For Educational Channels", caption: "Scripts, clarity, narration", icon: GraduationCap, action: "usecase", slug: "educators" },
      { label: "Free Tools", caption: "Instant idea and keyword prompts", icon: Compass, action: "free-tools", slug: "free-tools" },
    ],
  },
  {
    title: "Trust and onboarding",
    description: "Turn BYOK and privacy into confidence, not conversion friction.",
    items: [
      { label: "BYOK Gemini Setup Guide", caption: "Privacy-first onboarding", icon: KeyRound, action: "guide", slug: "api-setup" },
      { label: "Platform Workflow", caption: "Idea to upload in one system", icon: Sparkles, action: "guide", slug: "platform-workflow" },
      { label: "Use the Free Tools First", caption: "Give value before sign-in", icon: Search, action: "free-tools", slug: "free-tools" },
    ],
  },
] as const;

export function DiscoveryGrid({
  isDark,
  onNavigateToFeature,
  onNavigateToGuide,
  onNavigateToUseCase,
  onNavigateToFreeTools,
}: DiscoveryGridProps) {
  return (
    <section className="px-4 py-18 md:px-8 md:py-24">
      <div className="mx-auto w-full max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.4 }}
          className="mb-10 max-w-2xl"
        >
          <p className={cn("mb-3 text-sm font-medium", isDark ? "text-emerald-300" : "text-emerald-700")}>Explore by intent</p>
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">Choose the page that matches what a creator is searching for</h2>
          <p className={cn("mt-3 text-sm md:text-base", isDark ? "text-slate-300" : "text-slate-700")}>
            Whether they want a script generator, a BYOK setup guide, or creator-specific workflows, every path should feel purpose-built.
          </p>
        </motion.div>

        <div className="grid gap-5 xl:grid-cols-3">
          {SECTIONS.map((section, sectionIndex) => (
            <motion.article
              key={section.title}
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.15 }}
              transition={{ duration: 0.35, delay: sectionIndex * 0.06 }}
              className={cn(
                "reveal-stable rounded-3xl border p-6",
                isDark ? "glass-card" : "border-slate-200 bg-white",
              )}
            >
              <h3 className="text-lg font-semibold">{section.title}</h3>
              <p className={cn("mt-2 text-sm", isDark ? "text-slate-400" : "text-slate-600")}>{section.description}</p>

              <div className="mt-6 space-y-3">
                {section.items.map((item) => {
                  const Icon = item.icon;

                  const handleClick = () => {
                    if (item.action === "feature") {
                      onNavigateToFeature(item.slug as FeatureSlug);
                    } else if (item.action === "guide") {
                      onNavigateToGuide(item.slug as GuideSlug);
                    } else if (item.action === "usecase") {
                      onNavigateToUseCase(item.slug as UseCaseSlug);
                    } else {
                      onNavigateToFreeTools();
                    }
                  };

                  return (
                    <button
                      key={item.label}
                      type="button"
                      onClick={handleClick}
                      className={cn(
                        "flex w-full items-start justify-between gap-3 rounded-2xl border px-4 py-4 text-left transition",
                        isDark
                          ? "border-white/10 bg-white/[0.03] hover:bg-white/[0.07] hover:border-white/20"
                          : "border-slate-200 bg-slate-50 hover:bg-white hover:border-slate-300",
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div className={cn("mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl", isDark ? "bg-white/10 text-white" : "bg-slate-100 text-slate-800")}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold">{item.label}</p>
                          <p className={cn("mt-1 text-xs", isDark ? "text-slate-400" : "text-slate-500")}>{item.caption}</p>
                        </div>
                      </div>
                      <ArrowRight className={cn("mt-1 h-4 w-4 flex-shrink-0", isDark ? "text-slate-500" : "text-slate-400")} />
                    </button>
                  );
                })}
              </div>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}
