import { KeyRound, Link2, Rocket } from "lucide-react";
import { motion } from "motion/react";

import { cn } from "@/src/lib/utils";

type CTASectionProps = {
  isDark: boolean;
  isAuthenticated: boolean;
  onConnect: () => void;
};

const steps = [
  {
    title: "Sign in with Google",
    description: "Authenticate with Google, grant read-only YouTube access, and land in your Janso Studio dashboard.",
    icon: Link2,
    color: "text-red-500"
  },
  {
    title: "Add your Gemini API key",
    description: "Use BYOK for full privacy and control over model usage and cost.",
    icon: KeyRound,
    color: "text-indigo-500"
  },
  {
    title: "Start shipping growth workflows",
    description: "Create scripts, optimize SEO, generate voiceovers, and publish with confidence.",
    icon: Rocket,
    color: "text-green-500"
  }
];

export function CTASection({ isDark, isAuthenticated, onConnect }: CTASectionProps) {
  return (
    <section id="about" className="px-4 py-18 md:px-8 md:py-24">
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.4 }}
          className={cn(
            "rounded-3xl border p-6 md:p-8",
            isDark ? "glass-card" : "border-slate-200 bg-white"
          )}
        >
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">How it works</h2>
            <button
              type="button"
              onClick={() => {
                window.history.pushState({}, "", "/guides/api-setup");
                window.dispatchEvent(new PopStateEvent("popstate"));
              }}
              className={cn("ml-4 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors border border-indigo-400/40", isDark ? "bg-white/10 text-indigo-200 hover:bg-white/20" : "bg-indigo-50 text-indigo-700 hover:bg-indigo-100")}
            >
              Gemini API Setup Guide
            </button>
          </div>
          <div className="mt-6 grid gap-3 md:grid-cols-3">
            {steps.map((step, idx) => {
              const Icon = step.icon;
              return (
                <motion.article
                  key={step.title}
                  initial={{ opacity: 0, y: 18 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.25 }}
                  transition={{ duration: 0.35, delay: idx * 0.05 }}
                  className={cn(
                    "rounded-2xl border p-4",
                    isDark ? "border-white/10 bg-white/5" : "border-slate-200 bg-slate-50"
                  )}
                >
                  <Icon className={cn("mb-3 h-5 w-5", step.color)} />
                  <h3 className="mb-1.5 text-sm font-semibold md:text-base">{step.title}</h3>
                  <p className={cn("text-sm", isDark ? "text-slate-300" : "text-slate-700")}>{step.description}</p>
                </motion.article>
              );
            })}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.35 }}
          transition={{ duration: 0.4 }}
          className={cn(
            "rounded-3xl border p-8 text-center md:p-12",
            isDark
              ? "border-indigo-400/30 bg-gradient-to-br from-indigo-500/20 via-blue-500/10 to-green-500/10"
              : "border-indigo-200 bg-gradient-to-br from-indigo-100 via-blue-100 to-green-100"
          )}
        >
          <p className={cn("text-sm font-medium", isDark ? "text-indigo-200" : "text-indigo-700")}>Janso Studio</p>
          <h3 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">Ready to grow your channel?</h3>
          <p className={cn("mx-auto mt-3 max-w-xl text-sm md:text-base", isDark ? "text-slate-200" : "text-slate-700")}>
            Plug into your existing workflow, automate high-impact tasks, and focus on creating videos that convert.
          </p>
          <button
            type="button"
            onClick={onConnect}
            className="mt-6 rounded-xl bg-white px-7 py-3 text-sm font-bold text-black transition hover:bg-slate-200"
          >
            {isAuthenticated ? "Continue to Dashboard" : "Sign in with Google"}
          </button>
        </motion.div>
      </div>
    </section>
  );
}
