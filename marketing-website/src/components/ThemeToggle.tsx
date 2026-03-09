import { Moon, Sun } from "lucide-react";

import { cn } from "@/src/lib/utils";

type ThemeToggleProps = {
  theme: "dark" | "light";
  onToggle: () => void;
};

export function ThemeToggle({ theme, onToggle }: ThemeToggleProps) {
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label="Toggle theme"
      className={cn(
        "inline-flex h-10 w-10 items-center justify-center rounded-xl border transition-all duration-300",
        isDark
          ? "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
          : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
      )}
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
