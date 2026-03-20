import { ArrowRight, CirclePlay, Sparkles, TrendingUp } from "lucide-react";
import { motion } from "motion/react";

import { cn } from "@/src/lib/utils";
import YouTubeLogoIcon from "@/src/components/icons/YouTubeLogoIcon";

type HeroProps = {
  isDark: boolean;
  isAuthenticated: boolean;
  onConnect: () => void;
};

export function Hero({ isDark, isAuthenticated, onConnect }: HeroProps) {
  return (
    <section className="relative overflow-hidden px-4 pb-16 pt-10 md:px-8 md:pb-20 md:pt-14">
      <div aria-hidden="true" className="hero-grid pointer-events-none absolute inset-0" />

      <div className="relative mx-auto grid w-full max-w-6xl items-center gap-10 lg:grid-cols-[1.05fr_0.95fr]">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: "easeOut" }}
          className="space-y-7"
        >
          <span
            className={cn(
              "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium",
              isDark
                ? "border-white/10 bg-white/5 text-slate-300"
                : "border-slate-300 bg-white text-slate-700"
            )}
          >
            <Sparkles className="h-3.5 w-3.5 text-indigo-500" />
            new heights everyday
          </span>

          <div className="space-y-4">
            <h1 className="text-balance text-4xl font-semibold tracking-tight md:text-6xl">
              AI-Powered YouTube Analytics & Optimization Platform
            </h1>
            <p className={cn("max-w-2xl text-base md:text-lg", isDark ? "text-slate-300" : "text-slate-700")}> 
              AI YouTube script generator, viral clip extractor, and SEO optimizer built for content creators who want to grow faster.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onConnect}
              className="inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-bold text-black transition hover:bg-slate-200"
            >
              <YouTubeLogoIcon size={16} />
              {isAuthenticated ? "Continue to Dashboard" : "Connect YouTube"}
            </button>
            <button
              type="button"
              onClick={() => document.getElementById("features")?.scrollIntoView({ behavior: "smooth" })}
              className={cn(
                "inline-flex items-center gap-2 rounded-xl border px-6 py-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 focus-visible:ring-offset-2",
                isDark
                  ? "border-white/20 bg-black/45 text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] hover:border-white/35 hover:bg-black/60"
                  : "border-slate-300 bg-white text-slate-900 hover:bg-slate-100"
              )}
            >
              <CirclePlay className="h-4 w-4" />
              View Features
            </button>
          </div>

          <div className={cn("text-sm", isDark ? "text-slate-400" : "text-slate-600")}>
            Trusted by <span className="font-semibold text-green-500">forward-thinking</span> creators across gaming,
            education, tech, and lifestyle.
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut", delay: 0.12 }}
          className={cn(
            "relative overflow-hidden rounded-3xl border p-5 md:p-7",
            isDark
              ? "border-white/15 bg-black/40 shadow-[0_18px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl"
              : "border-slate-200 bg-white shadow-sm"
          )}
        >
          <div
            aria-hidden="true"
            className={cn("pointer-events-none absolute inset-0", isDark ? "bg-black/20" : "bg-transparent")}
          />

          <div
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute right-[-24%] top-[-12%] h-52 w-52 rounded-full blur-3xl",
              isDark ? "bg-indigo-500/20" : "bg-indigo-500/25"
            )}
          />

          <div className="relative space-y-5">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className={cn("rounded-2xl border p-4", isDark ? "border-white/15 bg-black/45" : "border-slate-200 bg-slate-50")}>
                <p className={cn("text-xs", isDark ? "text-slate-300" : "text-slate-600")}>Weekly Views</p>
                <p className={cn("mt-1 text-2xl font-semibold", isDark ? "text-slate-50" : "text-slate-900")}>+182%</p>
              </div>
              <div className={cn("rounded-2xl border p-4", isDark ? "border-white/15 bg-black/45" : "border-slate-200 bg-slate-50")}>
                <p className={cn("text-xs", isDark ? "text-slate-300" : "text-slate-600")}>CTR Lift</p>
                <p className={cn("mt-1 text-2xl font-semibold", isDark ? "text-slate-50" : "text-slate-900")}>+3.6x</p>
              </div>
            </div>

            <div className={cn("rounded-2xl border p-4", isDark ? "border-white/15 bg-black/45" : "border-slate-200 bg-slate-50")}>
              <div className="mb-3 flex items-center justify-between">
                <p className={cn("text-sm font-semibold", isDark ? "text-slate-100" : "text-slate-800")}>Content Momentum</p>
                <TrendingUp className="h-4 w-4 text-green-500" />
              </div>
              <div className="space-y-2">
                {[76, 54, 88, 69, 95].map((value, idx) => (
                  <motion.div
                    key={value + idx}
                    initial={{ width: 0 }}
                    animate={{ width: `${value}%` }}
                    transition={{ duration: 0.7, delay: 0.2 + idx * 0.08 }}
                    className="h-2 rounded-full bg-gradient-to-r from-indigo-500 via-blue-500 to-green-500"
                  />
                ))}
              </div>
            </div>

            <div className={cn("rounded-2xl border px-4 py-3 text-xs font-mono", isDark ? "border-white/15 bg-black/45 text-slate-200" : "border-slate-200 bg-slate-50 text-slate-700")}>
              insight://best-short-source = "video_34_timestamp_08:12"
            </div>

            <a
              href="#features"
              className={cn(
                "inline-flex w-fit items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition",
                isDark
                  ? "border-white/15 bg-black/45 text-slate-100 hover:bg-black/60 hover:text-white"
                  : "border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100 hover:text-slate-950"
              )}
            >
              Explore full feature stack
              <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
