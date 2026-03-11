import { motion } from "motion/react";

import { ThemeToggle } from "@/src/components/ThemeToggle";
import { cn } from "@/src/lib/utils";

function GoogleLogo({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      x="0px"
      y="0px"
      width="100"
      height="100"
      viewBox="0 0 48 48"
      className={className}
    >
      <path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"></path>
      <path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"></path>
      <path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z"></path>
      <path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z"></path>
    </svg>
  );
}

type NavigationProps = {
  theme: "dark" | "light";
  isDark: boolean;
  onToggleTheme: () => void;
  onPrimaryAction: () => void;
};

// const DOCS_URL = "https://docs.janso.studio"; // TODO: Uncomment when docs are available

const links = [
  { label: "Features", href: "#features", external: false },
  { label: "Pricing", href: "#pricing", external: false },
  { label: "About", href: "#about", external: false }
  // { label: "Docs", href: DOCS_URL, external: true } // TODO: Re-add when docs site is ready
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
          <img src="/favicon.svg" alt="Janso Studio" className="h-9 w-9 rounded-xl" />
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
            className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-slate-200"
          >
            <GoogleLogo className="h-4 w-4" />
            Sign in with Google
          </button>
        </div>
      </motion.nav>
    </header>
  );
}

