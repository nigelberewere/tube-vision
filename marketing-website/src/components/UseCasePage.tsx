import { motion } from "motion/react";
import { cn } from "@/src/lib/utils";

export type UseCaseSlug = "educators" | "gaming" | "faceless";

const CONFIGS = {
  educators: {
    title: "For Educators & Tutorial Creators",
    hero: "Turn lessons into engaging, accessible videos with Script Architect and Voice Over Studio.",
    sections: [
      {
        heading: "Script Architect for Lesson Planning",
        content: "Structure tutorials for clarity and retention. Use frameworks like step-by-step, Q&A, or storytelling to keep students engaged.",
      },
      {
        heading: "Voice Over Studio for Accessibility",
        content: "Generate clear, expressive narration in multiple languages. Perfect for reaching global audiences and students with different learning needs.",
      },
    ],
  },
  gaming: {
    title: "For Gaming Channels",
    hero: "Capture every highlight and turn streams into viral Shorts with Viral Clip Creator.",
    sections: [
      {
        heading: "Viral Clip Creator for Highlights",
        content: "Automatically detect and extract the most exciting moments from long-form streams. Export directly to YouTube Shorts or TikTok.",
      },
      {
        heading: "Script Architect for Commentary",
        content: "Plan out commentary, intros, and outros to keep your audience engaged between highlights.",
      },
    ],
  },
  faceless: {
    title: "For Faceless & Automation Channels",
    hero: "Grow your channel without showing your face using AI-powered scripting and voiceover.",
    sections: [
      {
        heading: "Video Idea Generator for Content Planning",
        content: "Never run out of ideas. Generate topics, titles, and outlines tailored to your niche and audience.",
      },
      {
        heading: "AI Voice Over Studio",
        content: "Create natural-sounding narration in any style or language. Perfect for explainer, news, or listicle channels.",
      },
    ],
  },
};

type UseCasePageProps = {
  slug: UseCaseSlug;
  isDark: boolean;
  onBack: () => void;
};

export function UseCasePage({ slug, isDark, onBack }: UseCasePageProps) {
  const config = CONFIGS[slug];
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
          <h1 className="text-3xl font-bold md:text-4xl mb-2">{config.title}</h1>
          <p className={cn("max-w-2xl text-base md:text-lg", isDark ? "text-slate-300" : "text-slate-700")}>{config.hero}</p>
        </motion.div>
        <div className="space-y-10">
          {config.sections.map((section) => (
            <section key={section.heading}>
              <h2 className="mb-2 text-xl font-semibold md:text-2xl">{section.heading}</h2>
              <p className={cn("prose prose-sm", isDark ? "prose-invert" : "")}>{section.content}</p>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
