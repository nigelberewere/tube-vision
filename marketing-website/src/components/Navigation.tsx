import { ChevronDown } from "lucide-react";
import { motion } from "motion/react";

import { type FeatureSlug } from "@/src/components/FeaturePage";
import { ThemeToggle } from "@/src/components/ThemeToggle";
import { getDashboardAssetUrl } from "@/src/lib/config";
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
  isAuthenticated: boolean;
  onToggleTheme: () => void;
  onPrimaryAction: () => void;
  onNavigateToFeature: (slug: FeatureSlug) => void;
  onNavigateToGuide?: (slug: string) => void;
  onNavigateToAbout?: () => void;
  onNavigateToUseCase?: (slug: string) => void;
  onNavigateToContact?: () => void;
  onNavigateToFAQ?: () => void;
  onNavigateToBlog?: () => void;
};

// const DOCS_URL = "https://docs.janso.studio"; // TODO: Uncomment when docs are available

const featureLinks: { label: string; slug: FeatureSlug; description: string }[] = [
  { label: "AI Script Architect", slug: "script-architect", description: "Overcome writer's block instantly" },
  { label: "Viral Clip Creator", slug: "viral-clip-creator", description: "Long-form to Shorts in minutes" },
  { label: "Voice Over Studio", slug: "voice-over-studio", description: "Studio-quality AI voices" },
  { label: "YouTube SEO & Keywords", slug: "youtube-seo", description: "Rank higher with Gemini AI" },
];

const navLinks = [
  { label: "Pricing", href: "#pricing", external: false },
  { label: "About", href: "#about", external: false },
  // { label: "Docs", href: DOCS_URL, external: true } // TODO: Re-add when docs site is ready
];

export function Navigation({
  theme,
  isDark,
  isAuthenticated,
  onToggleTheme,
  onPrimaryAction,
  onNavigateToFeature,
  onNavigateToGuide,
  onNavigateToAbout,
  onNavigateToUseCase,
  onNavigateToContact,
  onNavigateToFAQ,
  onNavigateToBlog,
}: NavigationProps) {
  const logoSrc = getDashboardAssetUrl("/favicon.svg")

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
          <img src={logoSrc} alt="Janso Studio" className="h-9 w-9 rounded-xl" />
          <div>
            <p className="text-sm leading-none font-semibold md:text-base">Janso Studio</p>
            <p className={cn("text-xs", isDark ? "text-slate-400" : "text-slate-600")}>AI Creator Platform</p>
          </div>
        </a>

        <div className="hidden items-center gap-6 md:flex">
          {/* Features dropdown */}
          <div className="group relative">
            <button
              type="button"
              className={cn(
                "inline-flex items-center gap-1 text-sm transition-colors",
                isDark ? "text-slate-300 hover:text-white" : "text-slate-700 hover:text-slate-900",
              )}
            >
              Features
              <ChevronDown className="h-3.5 w-3.5 opacity-60 transition-transform duration-200 group-hover:rotate-180" />
            </button>
            <div className="pointer-events-none absolute left-0 top-full z-50 pt-3 opacity-0 transition-all duration-200 group-hover:pointer-events-auto group-hover:opacity-100">
              <div
                className={cn(
                  "w-64 rounded-2xl border p-1.5 shadow-xl backdrop-blur-xl",
                  isDark ? "border-white/10 bg-[#050505]/80" : "border-slate-200 bg-white/80",
                )}
              >
                {featureLinks.map((fl) => (
                  <button
                    key={fl.slug}
                    type="button"
                    onClick={() => onNavigateToFeature(fl.slug)}
                    className={cn(
                      "flex w-full flex-col items-start rounded-xl px-3 py-2.5 text-left transition-colors",
                      isDark ? "hover:bg-white/[0.07]" : "hover:bg-slate-50",
                    )}
                  >
                    <span className="text-sm font-medium">{fl.label}</span>
                    <span className={cn("text-xs", isDark ? "text-slate-400" : "text-slate-500")}>{fl.description}</span>
                  </button>
                ))}
                <div className={cn("mt-1 border-t pt-1", isDark ? "border-white/10" : "border-slate-100")}>\
                  <a
                    href="#features"
                    className={cn(
                      "flex w-full items-center gap-1 rounded-xl px-3 py-2 text-xs transition-colors",
                      isDark ? "text-slate-400 hover:text-slate-200" : "text-slate-500 hover:text-slate-700",
                    )}
                  >
                    View all features
                  </a>
                </div>
              </div>
            </div>
          </div>

          {/* Learn dropdown */}
          <div className="group relative">
            <button
              type="button"
              className={cn(
                "inline-flex items-center gap-1 text-sm transition-colors",
                isDark ? "text-slate-300 hover:text-white" : "text-slate-700 hover:text-slate-900",
              )}
            >
              Learn
              <ChevronDown className="h-3.5 w-3.5 opacity-60 transition-transform duration-200 group-hover:rotate-180" />
            </button>
            <div className="pointer-events-none absolute left-0 top-full z-50 pt-3 opacity-0 transition-all duration-200 group-hover:pointer-events-auto group-hover:opacity-100">
              <div
                className={cn(
                  "w-64 rounded-2xl border p-1.5 shadow-xl backdrop-blur-xl",
                  isDark ? "border-white/10 bg-[#050505]/80" : "border-slate-200 bg-white/80",
                )}
              >
                <button type="button" onClick={() => onNavigateToGuide && onNavigateToGuide("api-setup")}
                  className={cn("flex w-full flex-col items-start rounded-xl px-3 py-2.5 text-left transition-colors", isDark ? "hover:bg-white/[0.07]" : "hover:bg-slate-50")}
                >
                  <span className="text-sm font-medium">Gemini API Setup Guide</span>
                  <span className={cn("text-xs", isDark ? "text-slate-400" : "text-slate-500")}>How to get your free key</span>
                </button>
                <button type="button" onClick={() => onNavigateToGuide && onNavigateToGuide("platform-workflow")}
                  className={cn("flex w-full flex-col items-start rounded-xl px-3 py-2.5 text-left transition-colors", isDark ? "hover:bg-white/[0.07]" : "hover:bg-slate-50")}
                >
                  <span className="text-sm font-medium">Platform Workflow</span>
                  <span className={cn("text-xs", isDark ? "text-slate-400" : "text-slate-500")}>From idea to SEO</span>
                </button>
                <button type="button" onClick={() => onNavigateToAbout && onNavigateToAbout()}
                  className={cn("flex w-full flex-col items-start rounded-xl px-3 py-2.5 text-left transition-colors", isDark ? "hover:bg-white/[0.07]" : "hover:bg-slate-50")}
                >
                  <span className="text-sm font-medium">About Us & Vision</span>
                  <span className={cn("text-xs", isDark ? "text-slate-400" : "text-slate-500")}>The story behind Janso Studio</span>
                </button>
                <button type="button" onClick={() => onNavigateToFAQ && onNavigateToFAQ()}
                  className={cn("flex w-full flex-col items-start rounded-xl px-3 py-2.5 text-left transition-colors", isDark ? "hover:bg-white/[0.07]" : "hover:bg-slate-50")}
                >
                  <span className="text-sm font-medium">FAQ</span>
                  <span className={cn("text-xs", isDark ? "text-slate-400" : "text-slate-500")}>Privacy, browser-side, more</span>
                </button>
                <button type="button" onClick={() => onNavigateToContact && onNavigateToContact()}
                  className={cn("flex w-full flex-col items-start rounded-xl px-3 py-2.5 text-left transition-colors", isDark ? "hover:bg-white/[0.07]" : "hover:bg-slate-50")}
                >
                  <span className="text-sm font-medium">Contact & Support</span>
                  <span className={cn("text-xs", isDark ? "text-slate-400" : "text-slate-500")}>Feature requests, bug reports</span>
                </button>
                <div className={cn("mt-1 border-t pt-1", isDark ? "border-white/10" : "border-slate-100")}>
                  <button type="button" onClick={() => onNavigateToBlog && onNavigateToBlog()}
                    className={cn("flex w-full flex-col items-start rounded-xl px-3 py-2.5 text-left transition-colors", isDark ? "hover:bg-white/[0.07]" : "hover:bg-slate-50")}
                  >
                    <span className="text-sm font-medium text-indigo-500 font-semibold">The Growth Hub</span>
                    <span className={cn("text-xs", isDark ? "text-slate-400" : "text-slate-500")}>Read our latest articles</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Use Cases dropdown */}
          <div className="group relative">
            <button
              type="button"
              className={cn(
                "inline-flex items-center gap-1 text-sm transition-colors",
                isDark ? "text-slate-300 hover:text-white" : "text-slate-700 hover:text-slate-900",
              )}
            >
              Use Cases
              <ChevronDown className="h-3.5 w-3.5 opacity-60 transition-transform duration-200 group-hover:rotate-180" />
            </button>
            <div className="pointer-events-none absolute left-0 top-full z-50 pt-3 opacity-0 transition-all duration-200 group-hover:pointer-events-auto group-hover:opacity-100">
              <div
                className={cn(
                  "w-64 rounded-2xl border p-1.5 shadow-xl backdrop-blur-xl",
                  isDark ? "border-white/10 bg-[#050505]/80" : "border-slate-200 bg-white/80",
                )}
              >
                <button type="button" onClick={() => onNavigateToUseCase && onNavigateToUseCase("educators")}
                  className={cn("flex w-full flex-col items-start rounded-xl px-3 py-2.5 text-left transition-colors", isDark ? "hover:bg-white/[0.07]" : "hover:bg-slate-50")}
                >
                  <span className="text-sm font-medium">For Educators</span>
                  <span className={cn("text-xs", isDark ? "text-slate-400" : "text-slate-500")}>Tutorials, lessons, accessibility</span>
                </button>
                <button type="button" onClick={() => onNavigateToUseCase && onNavigateToUseCase("gaming")}
                  className={cn("flex w-full flex-col items-start rounded-xl px-3 py-2.5 text-left transition-colors", isDark ? "hover:bg-white/[0.07]" : "hover:bg-slate-50")}
                >
                  <span className="text-sm font-medium">For Gaming Channels</span>
                  <span className={cn("text-xs", isDark ? "text-slate-400" : "text-slate-500")}>Highlights, Shorts, commentary</span>
                </button>
                <button type="button" onClick={() => onNavigateToUseCase && onNavigateToUseCase("faceless")}
                  className={cn("flex w-full flex-col items-start rounded-xl px-3 py-2.5 text-left transition-colors", isDark ? "hover:bg-white/[0.07]" : "hover:bg-slate-50")}
                >
                  <span className="text-sm font-medium">For Faceless Channels</span>
                  <span className={cn("text-xs", isDark ? "text-slate-400" : "text-slate-500")}>Idea generation, AI voiceover</span>
                </button>
              </div>
            </div>
          </div>

        </div>

        <div className="flex items-center gap-2 md:gap-3">
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          <button
            type="button"
            onClick={onPrimaryAction}
            className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-slate-200"
          >
            <GoogleLogo className="h-4 w-4" />
            {isAuthenticated ? "Dashboard" : "Sign in with Google"}
          </button>
        </div>
      </motion.nav>
    </header>
  );
}

