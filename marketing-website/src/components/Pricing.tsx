import { CheckCircle2 } from "lucide-react";
import { motion } from "motion/react";

import { cn } from "@/src/lib/utils";

type PricingProps = {
  isDark: boolean;
  isAuthenticated: boolean;
  onConnect: () => void;
};

const creatorItems = ["Bring your own Gemini API key", "All AI creator tools included", "Multi-account YouTube support"];
const teamItems = ["Workspace collaboration", "Priority support", "Advanced analytics exports"];

export function Pricing({ isDark, isAuthenticated, onConnect }: PricingProps) {
  return (
    <section id="pricing" className="px-4 py-18 md:px-8 md:py-24">
      <div className="mx-auto w-full max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.45 }}
          className="mb-10 text-center"
        >
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">Simple pricing for modern creators</h2>
          <p className={cn("mx-auto mt-3 max-w-2xl text-sm md:text-base", isDark ? "text-slate-300" : "text-slate-700")}>
            No lock-in subscriptions. Start free, bring your own model key, and scale when your team grows.
          </p>
        </motion.div>

        <div className="grid gap-4 md:grid-cols-2">
          <article
            className={cn(
              "rounded-2xl border p-6",
              isDark ? "glass-card" : "border-slate-200 bg-white"
            )}
          >
            <p className={cn("text-sm", isDark ? "text-indigo-300" : "text-indigo-600")}>Creator</p>
            <h3 className="mt-1 text-2xl font-semibold">$0 Platform Fee</h3>
            <p className={cn("mt-2 text-sm", isDark ? "text-slate-300" : "text-slate-700")}>Use Janso Studio for free with BYOK model access.</p>
            <ul className="mt-5 space-y-2 text-sm">
              {creatorItems.map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={onConnect}
              className="mt-6 rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-slate-200"
            >
              {isAuthenticated ? "Continue to Dashboard" : "Sign in with Google"}
            </button>
          </article>

          <article
            className={cn(
              "rounded-2xl border p-6",
              isDark ? "border-indigo-400/30 bg-indigo-500/10" : "border-indigo-200 bg-indigo-50"
            )}
          >
            <p className={cn("text-sm", isDark ? "text-indigo-200" : "text-indigo-700")}>Studio Teams</p>
            <h3 className="mt-1 text-2xl font-semibold">Custom</h3>
            <p className={cn("mt-2 text-sm", isDark ? "text-slate-200" : "text-slate-700")}>For creator teams running multi-channel operations.</p>
            <ul className="mt-5 space-y-2 text-sm">
              {teamItems.map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <a
              href="mailto:support@janso.studio"
              className={cn(
                "mt-6 inline-flex rounded-xl border px-5 py-2.5 text-sm font-semibold transition",
                isDark
                  ? "border-white/20 bg-white/5 hover:bg-white/10"
                  : "border-slate-300 bg-white hover:bg-slate-100"
              )}
            >
              Contact Sales
            </a>
          </article>
        </div>
      </div>
    </section>
  );
}

