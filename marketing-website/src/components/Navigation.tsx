import { Sparkles } from "lucide-react";
import { motion } from "motion/react";

import { ThemeToggle } from "@/src/components/ThemeToggle";
import { cn } from "@/src/lib/utils";

type NavigationProps = {
  theme: "dark" | "light";
  isDark: boolean;
  onToggleTheme: () => void;
  onPrimaryAction: () => void;
};

const DOCS_URL = "https://docs.tubevision.ai";

const links = [
  { label: "Features", href: "#features" },
  { label: "Pricing", href: "#pricing" },
  { label: "About", href: "#about" },
  { label: "Docs", href: DOCS_URL, external: true }
];

export function Navigation({
  theme,
  isDark,
  onToggleTheme,
  onPrimaryAction
}: NavigationProps) {
  return (
    <header className="sticky top-0 z-50 px-4 py-4 md:px-8">
      <motion.nav
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
        className={cn(
          "mx-auto flex w-full max-w-6xl items-center justify-between rounded-2xl border px-4 py-3 backdrop-blur-xl md:px-6",
          isDark ? "glass-card" : "border-slate-200 bg-white/80 shadow-sm"
        )}
      >
        <a href="/" className="inline-flex items-center gap-2">
          <span
            className={cn(
              "inline-flex h-9 w-9 items-center justify-center rounded-xl",
              isDark
                ? "bg-gradient-to-br from-indigo-500/80 to-red-500/70"
                : "bg-gradient-to-br from-indigo-500 to-red-500"
            )}
          >
            <Sparkles className="h-4 w-4 text-white" />
          </span>
          <div>
            <p className="text-sm leading-none font-semibold md:text-base">Janso Studio</p>
            <p className={cn("text-xs", isDark ? "text-slate-400" : "text-slate-600")}>AI Creator Platform</p>
          </div>
        </a>

        <div className="hidden items-center gap-6 md:flex">
          {links.map((link) => (
            <a
              key={link.label}
              href={link.href}
              target={link.external ? "_blank" : undefined}
              rel={link.external ? "noopener noreferrer" : undefined}
              className={cn(
                "text-sm transition-colors",
                isDark ? "text-slate-300 hover:text-white" : "text-slate-700 hover:text-slate-900"
              )}
            >
              {link.label}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-2 md:gap-3">
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          <button
            type="button"
            onClick={onPrimaryAction}
            className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-slate-200"
          >
            Get Started
          </button>
        </div>
      </motion.nav>
    </header>
  );
}
