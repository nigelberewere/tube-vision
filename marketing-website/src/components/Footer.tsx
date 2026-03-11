import { Github, Mail, Youtube } from "lucide-react";

import { cn } from "@/src/lib/utils";

type FooterProps = {
  isDark: boolean;
};

export function Footer({ isDark }: FooterProps) {
  return (
    <footer
      className={cn(
        "border-t px-4 py-10 md:px-8",
        isDark ? "border-white/10" : "border-slate-200"
      )}
    >
      <div className="mx-auto grid w-full max-w-6xl gap-8 md:grid-cols-[1.2fr_1fr_auto] md:items-start">
        <div>
          <p className="text-lg font-semibold">Janso Studio</p>
          <p className={cn("mt-2 max-w-md text-sm", isDark ? "text-slate-400" : "text-slate-600")}>
            AI-powered operating system for YouTube creators building the next generation of channels.
          </p>
        </div>

        <div className="flex gap-8 text-sm">
          <a
            className={cn(
              "transition",
              isDark ? "text-slate-300 hover:text-white" : "text-slate-700 hover:text-slate-900"
            )}
            href="https://janso.studio/privacy"
            target="_blank"
            rel="noopener noreferrer"
          >
            Privacy Policy
          </a>
          <a
            className={cn(
              "transition",
              isDark ? "text-slate-300 hover:text-white" : "text-slate-700 hover:text-slate-900"
            )}
            href="https://janso.studio/terms"
            target="_blank"
            rel="noopener noreferrer"
          >
            Terms of Service
          </a>
          <a
            className={cn(
              "transition",
              isDark ? "text-slate-300 hover:text-white" : "text-slate-700 hover:text-slate-900"
            )}
            href="mailto:support@janso.studio"
          >
            Contact
          </a>
        </div>

        <div className="flex items-center gap-3">
          <a
            href="https://youtube.com/@jansostudio"
            aria-label="YouTube"
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "rounded-lg border p-2 transition",
              isDark ? "border-white/10 bg-white/5 hover:bg-white/10" : "border-slate-300 bg-white hover:bg-slate-100"
            )}
          >
            <Youtube className="h-4 w-4" />
          </a>
          <a
            href="https://github.com/jansostudio"
            aria-label="Github"
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "rounded-lg border p-2 transition",
              isDark ? "border-white/10 bg-white/5 hover:bg-white/10" : "border-slate-300 bg-white hover:bg-slate-100"
            )}
          >
            <Github className="h-4 w-4" />
          </a>
          <a
            href="mailto:support@janso.studio"
            aria-label="Email"
            className={cn(
              "rounded-lg border p-2 transition",
              isDark ? "border-white/10 bg-white/5 hover:bg-white/10" : "border-slate-300 bg-white hover:bg-slate-100"
            )}
          >
            <Mail className="h-4 w-4" />
          </a>
        </div>
      </div>

      <div className={cn("mx-auto mt-8 w-full max-w-6xl text-xs", isDark ? "text-slate-500" : "text-slate-600")}>
        © 2026 Janso Studio. All rights reserved.
      </div>
    </footer>
  );
}
