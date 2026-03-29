import { Github, Mail, Youtube } from "lucide-react";

import { cn } from "@/src/lib/utils";

type FooterProps = {
  isDark: boolean;
  onNavigateInternal: (href: string) => void;
};

const FEATURE_LINKS = [
  { label: "AI Script Architect", href: "/features/script-architect" },
  { label: "Viral Clip Creator", href: "/features/viral-clip-creator" },
  { label: "Voice Over Studio", href: "/features/voice-over-studio" },
  { label: "YouTube SEO & Keywords", href: "/features/youtube-seo" },
  { label: "Thumbnail Studio", href: "/features/thumbnail-studio" },
  { label: "AI YouTube Coach", href: "/features/ai-youtube-coach" },
  { label: "Analytics Dashboard", href: "/features/analytics-dashboard" },
  { label: "Video Idea Generator", href: "/features/youtube-video-idea-generator" },
];
const LEARN_LINKS = [
  { label: "Gemini API Setup Guide", href: "/guides/api-setup" },
  { label: "Platform Workflow", href: "/guides/platform-workflow" },
  { label: "Free Tools", href: "/free-tools" },
  { label: "About Us & Vision", href: "/about" },
  { label: "FAQ", href: "/faq" },
  { label: "Contact & Support", href: "/contact" },
];
const USECASE_LINKS = [
  { label: "For Educators", href: "/use-cases/educators" },
  { label: "For Gaming Channels", href: "/use-cases/gaming" },
  { label: "For Faceless Channels", href: "/use-cases/faceless" },
];

export function Footer({ isDark, onNavigateInternal }: FooterProps) {
  const renderInternalLink = (link: { label: string; href: string }) => (
    <a
      key={link.href}
      href={link.href}
      onClick={(event) => {
        event.preventDefault();
        onNavigateInternal(link.href);
      }}
      className={cn("transition", isDark ? "text-slate-300 hover:text-white" : "text-slate-700 hover:text-slate-900")}
    >
      {link.label}
    </a>
  );

  return (
    <footer
      className={cn(
        "border-t px-4 py-10 md:px-8",
        isDark ? "border-white/10" : "border-slate-200"
      )}
    >
      <div className="mx-auto grid w-full max-w-6xl gap-8 md:grid-cols-[1.2fr_auto_auto_auto] md:items-start">
        <div>
          <p className="text-lg font-semibold">Janso Studio</p>
          <p className={cn("mt-2 max-w-md text-sm", isDark ? "text-slate-400" : "text-slate-600")}>
            AI-powered operating system for YouTube creators building the next generation of channels.
          </p>
        </div>

        <div className="flex flex-col gap-2 text-sm">
          <p className={cn("mb-1 text-xs font-semibold uppercase tracking-wider", isDark ? "text-slate-500" : "text-slate-400")}>Features</p>
          {FEATURE_LINKS.map(renderInternalLink)}
        </div>
        <div className="flex flex-col gap-2 text-sm">
          <p className={cn("mb-1 text-xs font-semibold uppercase tracking-wider", isDark ? "text-slate-500" : "text-slate-400")}>Learn</p>
          {LEARN_LINKS.map(renderInternalLink)}
        </div>
        <div className="flex flex-col gap-2 text-sm">
          <p className={cn("mb-1 text-xs font-semibold uppercase tracking-wider", isDark ? "text-slate-500" : "text-slate-400")}>Use Cases</p>
          {USECASE_LINKS.map(renderInternalLink)}
        </div>

        <div className="flex flex-col gap-2 text-sm">
          <p className={cn("mb-1 text-xs font-semibold uppercase tracking-wider", isDark ? "text-slate-500" : "text-slate-400")}>
            Company
          </p>
          <a
            className={cn(
              "transition",
              isDark ? "text-slate-300 hover:text-white" : "text-slate-700 hover:text-slate-900"
            )}
            href="/privacy"
            onClick={(event) => {
              event.preventDefault();
              onNavigateInternal("/privacy");
            }}
          >
            Privacy Policy
          </a>
          <a
            className={cn(
              "transition",
              isDark ? "text-slate-300 hover:text-white" : "text-slate-700 hover:text-slate-900"
            )}
            href="/terms"
            onClick={(event) => {
              event.preventDefault();
              onNavigateInternal("/terms");
            }}
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
