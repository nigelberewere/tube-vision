import {
  BarChart4,
  FileText,
  GraduationCap,
  ImageIcon,
  Mic,
  Play,
  Search,
  Users
} from "lucide-react";
import { motion } from "motion/react";

import { cn } from "@/src/lib/utils";

type FeaturesProps = {
  isDark: boolean;
};

type FeatureItem = {
  title: string;
  description: string;
  icon: typeof Mic;
  accentClass: string;
};

const features: FeatureItem[] = [
  {
    title: "AI YouTube Script Generator for Creators",
    description: "Generate expressive AI voiceovers with tone controls, pacing, and emotion profiles tuned for audience retention.",
    icon: Mic,
    accentClass: "from-blue-500 to-indigo-500"
  },
  {
    title: "YouTube Viral Clip Extractor AI Tool",
    description: "Extract viral-ready short clips from long-form videos using scene understanding and hook detection.",
    icon: Play,
    accentClass: "from-red-500 to-orange-500"
  },
  {
    title: "YouTube Thumbnail Idea Generator AI",
    description: "Run heatmap analysis and A/B test thumbnail concepts before publishing your next high-stakes upload.",
    icon: ImageIcon,
    accentClass: "from-pink-500 to-red-500"
  },
  {
    title: "YouTube SEO Optimizer for Video Titles",
    description: "Improve discoverability with optimized titles, descriptions, tags, and semantic keyword coverage.",
    icon: Search,
    accentClass: "from-indigo-500 to-purple-500"
  },
  {
    title: "YouTube Analytics Dashboard",
    description: "Track growth trends, retention curves, and content velocity with creator-focused metrics.",
    icon: BarChart4,
    accentClass: "from-green-500 to-emerald-500"
  },
  {
    title: "AI YouTube Growth Coach",
    description: "Get personalized growth advice, upload strategy, and experiments tailored to your channel goals.",
    icon: GraduationCap,
    accentClass: "from-violet-500 to-indigo-500"
  },
  {
    title: "YouTube Keyword Research Tool for Small Channels",
    description: "Build high-retention scripts with hook generators, structure templates, and narrative pacing guidance.",
    icon: FileText,
    accentClass: "from-sky-500 to-blue-600"
  },
  {
    title: "YouTube Competitor Channel Analysis Tool",
    description: "Analyze competitors, identify collab opportunities, and map audience overlap for faster expansion.",
    icon: Users,
    accentClass: "from-teal-500 to-cyan-500"
  }
];

export function Features({ isDark }: FeaturesProps) {
  return (
    <section id="features" className="px-4 py-18 md:px-8 md:py-24">
      <div className="mx-auto w-full max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.35 }}
          transition={{ duration: 0.45 }}
          className="mb-10 max-w-2xl"
        >
          <p className={cn("mb-3 text-sm font-medium", isDark ? "text-indigo-300" : "text-indigo-600")}>Feature Stack</p>
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">Everything creators need to scale on YouTube</h2>
          <p className={cn("mt-3 text-sm md:text-base", isDark ? "text-slate-300" : "text-slate-700")}>
            One platform for strategy, production, optimization, and growth insights. Built for solo creators and small media teams.
          </p>
        </motion.div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {features.map((feature, idx) => {
            const Icon = feature.icon;
            return (
              <motion.article
                key={feature.title}
                initial={{ opacity: 0, y: 22 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.2 }}
                transition={{ duration: 0.35, delay: idx * 0.04 }}
                className={cn(
                  "group rounded-2xl border p-5 transition duration-300",
                  isDark
                    ? "glass-card hover:border-white/20 hover:bg-white/[0.06]"
                    : "border-slate-200 bg-white hover:border-slate-300"
                )}
              >
                <div
                  className={cn(
                    "mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br text-white",
                    feature.accentClass
                  )}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mb-2 text-base font-semibold">{feature.title}</h3>
                <p className={cn("text-sm leading-relaxed", isDark ? "text-slate-300" : "text-slate-700")}>{feature.description}</p>
              </motion.article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
