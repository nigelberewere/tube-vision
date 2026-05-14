import { useEffect } from "react";
import { ArrowRight, Compass, Home, Search, Sparkles } from "lucide-react";
import { motion } from "motion/react";

import { applyPageMeta } from "@/src/lib/seo";
import { cn } from "@/src/lib/utils";

type NotFoundPageProps = {
  isDark: boolean;
  isAuthenticated: boolean;
  onConnect: () => void;
  onNavigateInternal: (path: string) => void;
};

const QUICK_LINKS = [
  {
    label: "Explore features",
    description: "Script, SEO, clips, voiceover, analytics, and planning tools.",
    href: "/features/script-architect",
    icon: Compass,
  },
  {
    label: "Try free tools",
    description: "Generate video ideas and keyword angles before signing in.",
    href: "/free-tools",
    icon: Sparkles,
  },
  {
    label: "Read the Growth Hub",
    description: "Creator guides for scripts, Shorts, thumbnails, and SEO.",
    href: "/blog",
    icon: Search,
  },
];

export function NotFoundPage({ isDark, isAuthenticated, onConnect, onNavigateInternal }: NotFoundPageProps) {
  useEffect(
    () =>
      applyPageMeta(
        "Page Not Found | Janso Studio",
        "The page you requested could not be found. Explore Janso Studio creator tools, guides, and support.",
      ),
    [],
  );

  const navigate = (path: string) => {
    onNavigateInternal(path);
  };

  return (
    <section className="px-4 pb-20 pt-10 md:px-8 md:pt-16">
      <div className="mx-auto grid w-full max-w-6xl gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
        <motion.div
          initial={{ opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
          className="space-y-7"
        >
          <span
            className={cn(
              "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold",
              isDark ? "border-white/10 bg-white/5 text-slate-200" : "border-slate-200 bg-white text-slate-700",
            )}
          >
            <span className="h-2 w-2 rounded-full bg-red-500" />
            404
          </span>

          <div className="space-y-4">
            <h1 className="max-w-3xl text-balance text-4xl font-semibold tracking-tight md:text-6xl">
              This page missed the publish queue.
            </h1>
            <p className={cn("max-w-2xl text-base leading-relaxed md:text-lg", isDark ? "text-slate-300" : "text-slate-700")}>
              The link may be outdated, mistyped, or moved during a site update. You can head back home or jump into a working creator workflow.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => navigate("/")}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-bold text-black transition hover:bg-slate-200"
            >
              <Home className="h-4 w-4" />
              Go home
            </button>
            <button
              type="button"
              onClick={onConnect}
              className={cn(
                "inline-flex items-center justify-center gap-2 rounded-xl border px-5 py-3 text-sm font-bold transition",
                isDark
                  ? "border-white/10 bg-white/[0.04] text-slate-100 hover:bg-white/[0.08]"
                  : "border-slate-200 bg-white text-slate-900 hover:bg-slate-50",
              )}
            >
              {isAuthenticated ? "Open dashboard" : "Connect YouTube"}
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 26 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.08, ease: "easeOut" }}
          className={cn(
            "relative overflow-hidden rounded-3xl border p-5 md:p-6",
            isDark ? "border-white/10 bg-black/35" : "border-slate-200 bg-white",
          )}
        >
          <div
            aria-hidden="true"
            className={cn(
              "absolute inset-x-6 top-0 h-px",
              isDark
                ? "bg-gradient-to-r from-transparent via-white/40 to-transparent"
                : "bg-gradient-to-r from-transparent via-slate-300 to-transparent",
            )}
          />
          <div className="grid grid-cols-4 gap-2" aria-hidden="true">
            {Array.from({ length: 24 }).map((_, index) => (
              <div
                key={index}
                className={cn(
                  "aspect-video rounded-lg border",
                  index === 6 || index === 11 || index === 16
                    ? "border-red-400/50 bg-red-500/20"
                    : isDark
                      ? "border-white/10 bg-white/[0.04]"
                      : "border-slate-200 bg-slate-50",
                )}
              />
            ))}
          </div>

          <div className="mt-6 space-y-3">
            {QUICK_LINKS.map((link) => {
              const Icon = link.icon;

              return (
                <button
                  key={link.href}
                  type="button"
                  onClick={() => navigate(link.href)}
                  className={cn(
                    "group flex w-full items-start gap-4 rounded-2xl border p-4 text-left transition",
                    isDark
                      ? "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.07]"
                      : "border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl",
                      isDark ? "bg-white/10 text-slate-100" : "bg-slate-900 text-white",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{link.label}</span>
                    <span className={cn("mt-1 block text-sm leading-relaxed", isDark ? "text-slate-400" : "text-slate-600")}>
                      {link.description}
                    </span>
                  </span>
                  <ArrowRight className={cn("mt-1 h-4 w-4 flex-shrink-0 transition group-hover:translate-x-0.5", isDark ? "text-slate-500" : "text-slate-400")} />
                </button>
              );
            })}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
