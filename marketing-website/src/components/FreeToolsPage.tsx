import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Compass, Lightbulb, Search, Sparkles, Wand2 } from "lucide-react";
import { motion } from "motion/react";

import YouTubeLogoIcon from "@/src/components/icons/YouTubeLogoIcon";
import { BLOG_POSTS } from "@/src/lib/content";
import { cn } from "@/src/lib/utils";

type FreeToolsPageProps = {
  isDark: boolean;
  isAuthenticated: boolean;
  onBack: () => void;
  onConnect: () => void;
};

type IdeaResult = {
  title: string;
  angle: string;
  hook: string;
};

type KeywordResult = {
  phrase: string;
  intent: string;
};

const TITLE_PATTERNS = [
  "How {topic} creators can grow faster in 2026",
  "{topic} mistakes killing retention right now",
  "I tested 7 {topic} formats so you do not have to",
  "The {topic} system small creators should copy",
  "What nobody tells you about {topic} growth",
];

const ANGLE_PATTERNS = [
  "Turn one strong insight into a repeatable content series.",
  "Use a creator-first angle that promises a fast, practical win.",
  "Frame the topic around a current pain point your audience already feels.",
  "Position the video as a shortcut, teardown, or myth-busting guide.",
];

const HOOK_PATTERNS = [
  "Most creators approach {topic} backwards. Here is the faster path.",
  "If your channel is stuck, this {topic} shift is probably the reason.",
  "This is the {topic} playbook I would use if I had to restart from zero.",
  "Before you publish another {topic} video, watch for this pattern.",
];

const KEYWORD_MODIFIERS = [
  "for beginners",
  "step by step",
  "with AI",
  "for small creators",
  "workflow",
  "checklist",
  "strategy",
  "tutorial",
];

function toTitleCase(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function buildIdeas(topic: string): IdeaResult[] {
  const normalized = topic.trim().toLowerCase();
  const titleTopic = toTitleCase(normalized);

  return TITLE_PATTERNS.slice(0, 3).map((pattern, index) => ({
    title: pattern.replaceAll("{topic}", titleTopic),
    angle: ANGLE_PATTERNS[index % ANGLE_PATTERNS.length],
    hook: HOOK_PATTERNS[index % HOOK_PATTERNS.length].replaceAll("{topic}", normalized),
  }));
}

function buildKeywords(topic: string): KeywordResult[] {
  const normalized = topic.trim().toLowerCase();

  return KEYWORD_MODIFIERS.slice(0, 6).map((modifier, index) => ({
    phrase: `${normalized} ${modifier}`,
    intent:
      index < 2
        ? "High search intent"
        : index < 4
          ? "Mid-funnel creator research"
          : "Long-tail opportunity",
  }));
}

export function FreeToolsPage({ isDark, isAuthenticated, onBack, onConnect }: FreeToolsPageProps) {
  const [topic, setTopic] = useState("youtube automation");
  const [submittedTopic, setSubmittedTopic] = useState("youtube automation");

  useEffect(() => {
    const previousTitle = document.title;
    document.title = "Free YouTube Idea & Keyword Tools | Janso Studio";

    let metaEl = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    const previousDescription = metaEl?.content ?? "";
    if (!metaEl) {
      metaEl = document.createElement("meta");
      metaEl.name = "description";
      document.head.appendChild(metaEl);
    }
    metaEl.content =
      "Use free creator tools from Janso Studio to generate YouTube video ideas and keyword angles instantly. No login required.";

    return () => {
      document.title = previousTitle;
      if (metaEl) metaEl.content = previousDescription;
    };
  }, []);

  const ideas = useMemo(() => buildIdeas(submittedTopic), [submittedTopic]);
  const keywords = useMemo(() => buildKeywords(submittedTopic), [submittedTopic]);
  const suggestedPosts = BLOG_POSTS.slice(0, 3);

  return (
    <div className="px-4 pb-20 pt-10 md:px-8 md:pt-14">
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

        <section className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr]">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: "easeOut" }}
            className="space-y-6"
          >
            <span
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold",
                isDark ? "border-white/10 bg-white/5 text-slate-200" : "border-slate-200 bg-white text-slate-700",
              )}
            >
              <Compass className="h-3.5 w-3.5 text-emerald-400" />
              Free creator tools
            </span>

            <div className="space-y-4">
              <h1 className="text-balance text-4xl font-semibold tracking-tight md:text-5xl lg:text-[3.15rem]">
                Get YouTube idea and keyword inspiration instantly, without logging in.
              </h1>
              <p className={cn("max-w-2xl text-base leading-relaxed md:text-lg", isDark ? "text-slate-300" : "text-slate-700")}>
                Try lightweight versions of Janso Studio&apos;s idea generation and keyword discovery workflows. When you are ready for personalized analytics, scripts, and automation, connect your channel and continue in the full dashboard.
              </p>
            </div>

            <div
              className={cn(
                "rounded-3xl border p-5 md:p-6",
                isDark ? "glass-card" : "border-slate-200 bg-white",
              )}
            >
              <label className={cn("mb-2 block text-sm font-medium", isDark ? "text-slate-200" : "text-slate-700")}>
                Enter your niche, audience, or next topic
              </label>
              <div className="flex flex-col gap-3 sm:flex-row">
                <input
                  value={topic}
                  onChange={(event) => setTopic(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && topic.trim()) {
                      setSubmittedTopic(topic.trim());
                    }
                  }}
                  placeholder="e.g. gaming shorts, personal finance, study tips"
                  className={cn(
                    "min-w-0 flex-1 rounded-2xl border px-4 py-3 text-sm outline-none transition focus:ring-2 focus:ring-indigo-400/60",
                    isDark
                      ? "border-white/10 bg-black/35 text-slate-100 placeholder:text-slate-500"
                      : "border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400",
                  )}
                />
                <button
                  type="button"
                  onClick={() => topic.trim() && setSubmittedTopic(topic.trim())}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-bold text-black transition hover:bg-slate-200"
                >
                  <Sparkles className="h-4 w-4" />
                  Generate ideas
                </button>
              </div>
              <p className={cn("mt-3 text-xs", isDark ? "text-slate-400" : "text-slate-500")}>
                Free tools are intentionally lightweight. Connect YouTube for full personalization, analytics, and workflow automation.
              </p>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.08 }}
            className={cn(
              "rounded-3xl border p-5 md:p-6",
              isDark ? "border-white/10 bg-black/35" : "border-slate-200 bg-white",
            )}
          >
            <p className={cn("text-xs font-semibold uppercase tracking-[0.22em]", isDark ? "text-slate-500" : "text-slate-500")}>
              Why it converts
            </p>
            <div className="mt-4 space-y-4">
              {[
                "Immediate value before sign-in lowers friction for cold traffic.",
                "BYOK keeps model usage private and cost-transparent for serious creators.",
                "The full dashboard adds scripts, SEO, analytics, voiceover, and channel-aware recommendations.",
              ].map((point) => (
                <div
                  key={point}
                  className={cn(
                    "rounded-2xl border p-4 text-sm",
                    isDark ? "border-white/10 bg-white/[0.03] text-slate-300" : "border-slate-200 bg-slate-50 text-slate-700",
                  )}
                >
                  {point}
                </div>
              ))}
            </div>
          </motion.div>
        </section>

        <section className="mt-10 grid gap-6 lg:grid-cols-2">
          <motion.article
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.35 }}
            className={cn(
              "reveal-stable rounded-3xl border p-6",
              isDark ? "glass-card" : "border-slate-200 bg-white",
            )}
          >
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 text-white">
                <Lightbulb className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-xl font-semibold">Free Video Idea Generator</h2>
                <p className={cn("text-sm", isDark ? "text-slate-400" : "text-slate-600")}>
                  Seed ideas for {submittedTopic}
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {ideas.map((idea) => (
                <div
                  key={idea.title}
                  className={cn(
                    "rounded-2xl border p-4",
                    isDark ? "border-white/10 bg-white/[0.03]" : "border-slate-200 bg-slate-50",
                  )}
                >
                  <h3 className="text-base font-semibold">{idea.title}</h3>
                  <p className={cn("mt-2 text-sm", isDark ? "text-slate-300" : "text-slate-700")}>{idea.angle}</p>
                  <p className={cn("mt-2 text-sm italic", isDark ? "text-slate-400" : "text-slate-600")}>
                    Hook: {idea.hook}
                  </p>
                </div>
              ))}
            </div>
          </motion.article>

          <motion.article
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.35, delay: 0.08 }}
            className={cn(
              "reveal-stable rounded-3xl border p-6",
              isDark ? "glass-card" : "border-slate-200 bg-white",
            )}
          >
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white">
                <Search className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-xl font-semibold">Free Keyword Angle Finder</h2>
                <p className={cn("text-sm", isDark ? "text-slate-400" : "text-slate-600")}>
                  Long-tail variations you can test next
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {keywords.map((keyword) => (
                <div
                  key={keyword.phrase}
                  className={cn(
                    "flex items-start justify-between gap-4 rounded-2xl border p-4",
                    isDark ? "border-white/10 bg-white/[0.03]" : "border-slate-200 bg-slate-50",
                  )}
                >
                  <div>
                    <p className="text-sm font-semibold">{keyword.phrase}</p>
                    <p className={cn("mt-1 text-xs", isDark ? "text-slate-400" : "text-slate-500")}>{keyword.intent}</p>
                  </div>
                  <Wand2 className={cn("mt-0.5 h-4 w-4 flex-shrink-0", isDark ? "text-indigo-300" : "text-indigo-600")} />
                </div>
              ))}
            </div>
          </motion.article>
        </section>

        <section className="mt-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.45 }}
            className={cn(
              "rounded-3xl border px-6 py-10 text-center md:px-10",
              isDark
                ? "border-emerald-400/20 bg-gradient-to-br from-emerald-500/12 via-blue-500/8 to-indigo-500/10"
                : "border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-indigo-50",
            )}
          >
            <p className={cn("text-sm font-medium", isDark ? "text-emerald-300" : "text-emerald-700")}>Ready for the full workflow?</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">
              Connect your channel and turn rough ideas into scripts, clips, SEO, and growth insights.
            </h2>
            <p className={cn("mx-auto mt-3 max-w-2xl text-sm md:text-base", isDark ? "text-slate-300" : "text-slate-700")}>
              The free tools help you start. The full app personalizes everything around your actual channel, competitors, and performance data.
            </p>
            <button
              type="button"
              onClick={onConnect}
              className="mt-7 inline-flex items-center gap-2 rounded-xl bg-white px-7 py-3 text-sm font-bold text-black transition hover:bg-slate-200"
            >
              <YouTubeLogoIcon size={16} />
              {isAuthenticated ? "Continue to Dashboard" : "Connect YouTube for the full app"}
            </button>
          </motion.div>
        </section>

        <section className="mt-10">
          <div className="mb-5">
            <p className={cn("text-sm font-medium", isDark ? "text-indigo-300" : "text-indigo-700")}>Learn while you explore</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight md:text-3xl">Related reads for creators researching this workflow</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {suggestedPosts.map((post) => (
              <a
                key={post.slug}
                href={`/blog/${post.slug}`}
                className={cn(
                  "rounded-3xl border p-5 transition",
                  isDark
                    ? "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06]"
                    : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50",
                )}
              >
                <p className={cn("text-[11px] font-semibold uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-500")}>
                  {post.category}
                </p>
                <p className="mt-2 text-base font-semibold">{post.title}</p>
                <p className={cn("mt-2 text-sm leading-relaxed", isDark ? "text-slate-400" : "text-slate-600")}>{post.excerpt}</p>
              </a>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
