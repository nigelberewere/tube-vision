import { ArrowRight, BookOpen, LineChart, Sparkles } from "lucide-react";
import { motion } from "motion/react";

import { BLOG_POSTS } from "@/src/lib/content";
import { cn } from "@/src/lib/utils";

type ContentEngineSectionProps = {
  isDark: boolean;
  onNavigateToBlog: () => void;
  onNavigateToPost: (slug: string) => void;
};

export function ContentEngineSection({ isDark, onNavigateToBlog, onNavigateToPost }: ContentEngineSectionProps) {
  const featured = BLOG_POSTS.slice(0, 3);

  return (
    <section className="px-4 py-18 md:px-8 md:py-24">
      <div className="mx-auto w-full max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.4 }}
          className="mb-10 flex flex-col gap-4 md:flex-row md:items-end md:justify-between"
        >
          <div className="max-w-2xl">
            <p className={cn("mb-3 text-sm font-medium", isDark ? "text-blue-300" : "text-blue-700")}>Traffic engine</p>
            <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">Content built to capture creator search intent and move readers into the product</h2>
            <p className={cn("mt-3 text-sm md:text-base", isDark ? "text-slate-300" : "text-slate-700")}>
              Publish around SEO, packaging, Shorts, BYOK, scripting, and creator systems so Google finds you for real problems creators are already searching.
            </p>
          </div>
          <button
            type="button"
            onClick={onNavigateToBlog}
            className={cn(
              "inline-flex items-center gap-2 rounded-xl border px-5 py-3 text-sm font-semibold transition",
              isDark ? "border-white/15 bg-white/[0.03] hover:bg-white/[0.07]" : "border-slate-200 bg-white hover:bg-slate-50",
            )}
          >
            <BookOpen className="h-4 w-4" />
            Explore the Growth Hub
          </button>
        </motion.div>

        <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.35 }}
            className={cn(
              "reveal-stable rounded-3xl border p-6",
              isDark ? "glass-card" : "border-slate-200 bg-white",
            )}
          >
            <div className="grid gap-4 md:grid-cols-3">
              {[
                { icon: Sparkles, label: "High-intent feature terms", value: "script generator, thumbnail CTR, creator SEO" },
                { icon: LineChart, label: "Mid-funnel education", value: "BYOK, creator workflows, analytics strategy" },
                { icon: BookOpen, label: "Compounding discovery", value: "Articles linked into pages, tools, and CTAs" },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.label}
                    className={cn(
                      "rounded-2xl border p-4",
                      isDark ? "border-white/10 bg-white/[0.03]" : "border-slate-200 bg-slate-50",
                    )}
                  >
                    <Icon className={cn("mb-3 h-5 w-5", isDark ? "text-blue-300" : "text-blue-700")} />
                    <p className="text-sm font-semibold">{item.label}</p>
                    <p className={cn("mt-2 text-xs leading-relaxed", isDark ? "text-slate-400" : "text-slate-500")}>{item.value}</p>
                  </div>
                );
              })}
            </div>
          </motion.div>

          <div className="space-y-4">
            {featured.map((post, index) => (
              <motion.button
                key={post.slug}
                type="button"
                onClick={() => onNavigateToPost(post.slug)}
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.15 }}
                transition={{ duration: 0.35, delay: index * 0.05 }}
                className={cn(
                  "reveal-stable flex w-full items-start justify-between gap-4 rounded-3xl border p-5 text-left transition",
                  isDark
                    ? "border-white/10 bg-[#0a0a0a]/50 hover:border-white/20 hover:bg-white/[0.04]"
                    : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50",
                )}
              >
                <div>
                  <p className={cn("text-[11px] font-semibold uppercase tracking-[0.18em]", isDark ? "text-slate-500" : "text-slate-500")}>
                    {post.category}
                  </p>
                  <p className="mt-2 text-base font-semibold">{post.title}</p>
                  <p className={cn("mt-2 text-sm leading-relaxed", isDark ? "text-slate-400" : "text-slate-600")}>{post.excerpt}</p>
                </div>
                <ArrowRight className={cn("mt-1 h-4 w-4 flex-shrink-0", isDark ? "text-slate-500" : "text-slate-400")} />
              </motion.button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
