import { useEffect, useState } from "react";

import { CTASection } from "@/src/components/CTASection";
import { CookieConsentBanner } from "@/src/components/CookieConsentBanner";
import { FAQ } from "@/src/components/FAQ";
import { FeaturePage, type FeatureSlug } from "@/src/components/FeaturePage";
import { GuidePage, type GuideSlug } from "@/src/components/GuidePage";
import { AboutPage } from "@/src/components/AboutPage";
import { UseCasePage, type UseCaseSlug } from "@/src/components/UseCasePage";
import { ContactPage } from "@/src/components/ContactPage";
import { FAQPage } from "@/src/components/FAQPage";
import { Features } from "@/src/components/Features";
import { Footer } from "@/src/components/Footer";
import { Hero } from "@/src/components/Hero";
import { LegalViewer } from "@/src/components/LegalViewer";
import { Navigation } from "@/src/components/Navigation";
import { Pricing } from "@/src/components/Pricing";
import { getAuthUrl } from "@/src/lib/config";
import { cn } from "@/src/lib/utils";

const THEME_STORAGE_KEY = "tube_vision_theme";

type Theme = "dark" | "light";

type Page =
  | "home"
  | "privacy"
  | "terms"
  | "feature"
  | "guide"
  | "about"
  | "usecase"
  | "contact"
  | "faq";

const FEATURE_SLUGS = ["script-architect", "viral-clip-creator", "voice-over-studio", "youtube-seo"] as const;
const GUIDE_SLUGS = ["api-setup", "platform-workflow"] as const;
const USECASE_SLUGS = ["educators", "gaming", "faceless"] as const;


function getFeatureSlugFromPath(pathname: string): FeatureSlug | null {
  const match = pathname.match(/^\/features\/([^/]+)$/);
  if (!match) return null;
  const slug = match[1];
  return (FEATURE_SLUGS as readonly string[]).includes(slug) ? (slug as FeatureSlug) : null;
}

function getGuideSlugFromPath(pathname: string): GuideSlug | null {
  const match = pathname.match(/^\/guides\/([^/]+)$/);
  if (!match) return null;
  const slug = match[1];
  return (GUIDE_SLUGS as readonly string[]).includes(slug) ? (slug as GuideSlug) : null;
}

function getUseCaseSlugFromPath(pathname: string): UseCaseSlug | null {
  const match = pathname.match(/^\/usecase\/([^/]+)$/);
  if (!match) return null;
  const slug = match[1];
  return (USECASE_SLUGS as readonly string[]).includes(slug) ? (slug as UseCaseSlug) : null;
}

function getPageFromPath(pathname: string): Page {
  if (pathname === "/privacy") return "privacy";
  if (pathname === "/terms") return "terms";
  if (getFeatureSlugFromPath(pathname)) return "feature";
  if (getGuideSlugFromPath(pathname)) return "guide";
  if (pathname === "/about") return "about";
  if (getUseCaseSlugFromPath(pathname)) return "usecase";
  if (pathname === "/contact") return "contact";
  if (pathname === "/faq") return "faq";
  return "home";
}

export default function App() {
  const [page, setPage] = useState<Page>(() => getPageFromPath(window.location.pathname));
  const [currentFeatureSlug, setCurrentFeatureSlug] = useState<FeatureSlug | null>(
    () => getFeatureSlugFromPath(window.location.pathname),
  );
  const [currentGuideSlug, setCurrentGuideSlug] = useState<GuideSlug | null>(
    () => getGuideSlugFromPath(window.location.pathname),
  );
  const [currentUseCaseSlug, setCurrentUseCaseSlug] = useState<UseCaseSlug | null>(
    () => getUseCaseSlugFromPath(window.location.pathname),
  );
  const [theme, setTheme] = useState<Theme>(() => {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    return storedTheme === "light" ? "light" : "dark";
  });

  useEffect(() => {
    document.documentElement.classList.remove("dark", "light");
    document.documentElement.classList.add(theme);
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    const onPopState = () => {
      const path = window.location.pathname;
      setPage(getPageFromPath(path));
      setCurrentFeatureSlug(getFeatureSlugFromPath(path));
      setCurrentGuideSlug(getGuideSlugFromPath(path));
      setCurrentUseCaseSlug(getUseCaseSlugFromPath(path));
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const isDark = theme === "dark";

  const openDashboardAuth = () => {
    window.location.assign(getAuthUrl("youtube", "/"));
  };

  const goHome = () => {
    window.history.pushState({}, "", "/");
    setPage("home");
    setCurrentFeatureSlug(null);
    setCurrentGuideSlug(null);
    setCurrentUseCaseSlug(null);
    window.scrollTo({ top: 0, behavior: "auto" });
  };


  // Navigation handlers now accept string for compatibility with Navigation props
  const goToFeature = (slug: string) => {
    if ((FEATURE_SLUGS as readonly string[]).includes(slug)) {
      window.history.pushState({}, "", `/features/${slug}`);
      setPage("feature");
      setCurrentFeatureSlug(slug as FeatureSlug);
      setCurrentGuideSlug(null);
      setCurrentUseCaseSlug(null);
      window.scrollTo({ top: 0, behavior: "auto" });
    }
  };

  const goToGuide = (slug: string) => {
    if ((GUIDE_SLUGS as readonly string[]).includes(slug)) {
      window.history.pushState({}, "", `/guides/${slug}`);
      setPage("guide");
      setCurrentGuideSlug(slug as GuideSlug);
      setCurrentFeatureSlug(null);
      setCurrentUseCaseSlug(null);
      window.scrollTo({ top: 0, behavior: "auto" });
    }
  };

  const goToAbout = () => {
    window.history.pushState({}, "", "/about");
    setPage("about");
    setCurrentFeatureSlug(null);
    setCurrentGuideSlug(null);
    setCurrentUseCaseSlug(null);
    window.scrollTo({ top: 0, behavior: "auto" });
  };

  const goToUseCase = (slug: string) => {
    if ((USECASE_SLUGS as readonly string[]).includes(slug)) {
      window.history.pushState({}, "", `/usecase/${slug}`);
      setPage("usecase");
      setCurrentUseCaseSlug(slug as UseCaseSlug);
      setCurrentFeatureSlug(null);
      setCurrentGuideSlug(null);
      window.scrollTo({ top: 0, behavior: "auto" });
    }
  };

  const goToContact = () => {
    window.history.pushState({}, "", "/contact");
    setPage("contact");
    setCurrentFeatureSlug(null);
    setCurrentGuideSlug(null);
    setCurrentUseCaseSlug(null);
    window.scrollTo({ top: 0, behavior: "auto" });
  };

  const goToFAQ = () => {
    window.history.pushState({}, "", "/faq");
    setPage("faq");
    setCurrentFeatureSlug(null);
    setCurrentGuideSlug(null);
    setCurrentUseCaseSlug(null);
    window.scrollTo({ top: 0, behavior: "auto" });
  };


  if (page === "privacy" || page === "terms") {
    return (
      <>
        <LegalViewer type={page} isDark={isDark} onBack={goHome} />
        <CookieConsentBanner theme={isDark ? "dark" : "light"} />
      </>
    );
  }

  if (page === "feature" && currentFeatureSlug) {
    return (
      <div
        className={cn(
          "relative min-h-screen overflow-x-clip transition-colors duration-500",
          isDark ? "bg-[#050505] text-slate-200" : "bg-slate-100 text-slate-900",
        )}
      >
        <div
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-0",
            isDark
              ? "[background:radial-gradient(circle_at_12%_18%,rgba(99,102,241,0.22),transparent_28%),radial-gradient(circle_at_88%_14%,rgba(239,68,68,0.2),transparent_30%),radial-gradient(circle_at_52%_82%,rgba(16,185,129,0.16),transparent_32%)]"
              : "[background:radial-gradient(circle_at_12%_18%,rgba(99,102,241,0.14),transparent_28%),radial-gradient(circle_at_88%_14%,rgba(239,68,68,0.12),transparent_30%),radial-gradient(circle_at_52%_82%,rgba(16,185,129,0.1),transparent_32%)]",
          )}
        />
        <Navigation
          theme={theme}
          isDark={isDark}
          onToggleTheme={() => setTheme((prev) => (prev === "dark" ? "light" : "dark"))}
          onPrimaryAction={openDashboardAuth}
          onNavigateToFeature={goToFeature}
          onNavigateToGuide={goToGuide}
          onNavigateToAbout={goToAbout}
          onNavigateToUseCase={goToUseCase}
          onNavigateToContact={goToContact}
          onNavigateToFAQ={goToFAQ}
        />
        <main className="relative">
          <FeaturePage
            slug={currentFeatureSlug}
            isDark={isDark}
            onBack={goHome}
            onConnect={openDashboardAuth}
          />
        </main>
        <Footer isDark={isDark} />
        <CookieConsentBanner theme={isDark ? "dark" : "light"} />
      </div>
    );
  }

  if (page === "guide" && currentGuideSlug) {
    return (
      <div className={cn(
        "relative min-h-screen overflow-x-clip transition-colors duration-500",
        isDark ? "bg-[#050505] text-slate-200" : "bg-slate-100 text-slate-900",
      )}>
        <Navigation
          theme={theme}
          isDark={isDark}
          onToggleTheme={() => setTheme((prev) => (prev === "dark" ? "light" : "dark"))}
          onPrimaryAction={openDashboardAuth}
          onNavigateToFeature={goToFeature}
          onNavigateToGuide={goToGuide}
          onNavigateToAbout={goToAbout}
          onNavigateToUseCase={goToUseCase}
          onNavigateToContact={goToContact}
          onNavigateToFAQ={goToFAQ}
        />
        <main className="relative">
          <GuidePage slug={currentGuideSlug} isDark={isDark} onBack={goHome} />
        </main>
        <Footer isDark={isDark} />
        <CookieConsentBanner theme={isDark ? "dark" : "light"} />
      </div>
    );
  }

  if (page === "about") {
    return (
      <div className={cn(
        "relative min-h-screen overflow-x-clip transition-colors duration-500",
        isDark ? "bg-[#050505] text-slate-200" : "bg-slate-100 text-slate-900",
      )}>
        <Navigation
          theme={theme}
          isDark={isDark}
          onToggleTheme={() => setTheme((prev) => (prev === "dark" ? "light" : "dark"))}
          onPrimaryAction={openDashboardAuth}
          onNavigateToFeature={goToFeature}
          onNavigateToGuide={goToGuide}
          onNavigateToAbout={goToAbout}
          onNavigateToUseCase={goToUseCase}
          onNavigateToContact={goToContact}
          onNavigateToFAQ={goToFAQ}
        />
        <main className="relative">
          <AboutPage isDark={isDark} onBack={goHome} />
        </main>
        <Footer isDark={isDark} />
        <CookieConsentBanner theme={isDark ? "dark" : "light"} />
      </div>
    );
  }

  if (page === "usecase" && currentUseCaseSlug) {
    return (
      <div className={cn(
        "relative min-h-screen overflow-x-clip transition-colors duration-500",
        isDark ? "bg-[#050505] text-slate-200" : "bg-slate-100 text-slate-900",
      )}>
        <Navigation
          theme={theme}
          isDark={isDark}
          onToggleTheme={() => setTheme((prev) => (prev === "dark" ? "light" : "dark"))}
          onPrimaryAction={openDashboardAuth}
          onNavigateToFeature={goToFeature}
          onNavigateToGuide={goToGuide}
          onNavigateToAbout={goToAbout}
          onNavigateToUseCase={goToUseCase}
          onNavigateToContact={goToContact}
          onNavigateToFAQ={goToFAQ}
        />
        <main className="relative">
          <UseCasePage slug={currentUseCaseSlug} isDark={isDark} onBack={goHome} />
        </main>
        <Footer isDark={isDark} />
        <CookieConsentBanner theme={isDark ? "dark" : "light"} />
      </div>
    );
  }

  if (page === "contact") {
    return (
      <div className={cn(
        "relative min-h-screen overflow-x-clip transition-colors duration-500",
        isDark ? "bg-[#050505] text-slate-200" : "bg-slate-100 text-slate-900",
      )}>
        <Navigation
          theme={theme}
          isDark={isDark}
          onToggleTheme={() => setTheme((prev) => (prev === "dark" ? "light" : "dark"))}
          onPrimaryAction={openDashboardAuth}
          onNavigateToFeature={goToFeature}
          onNavigateToGuide={goToGuide}
          onNavigateToAbout={goToAbout}
          onNavigateToUseCase={goToUseCase}
          onNavigateToContact={goToContact}
          onNavigateToFAQ={goToFAQ}
        />
        <main className="relative">
          <ContactPage isDark={isDark} onBack={goHome} />
        </main>
        <Footer isDark={isDark} />
        <CookieConsentBanner theme={isDark ? "dark" : "light"} />
      </div>
    );
  }

  if (page === "faq") {
    return (
      <div className={cn(
        "relative min-h-screen overflow-x-clip transition-colors duration-500",
        isDark ? "bg-[#050505] text-slate-200" : "bg-slate-100 text-slate-900",
      )}>
        <Navigation
          theme={theme}
          isDark={isDark}
          onToggleTheme={() => setTheme((prev) => (prev === "dark" ? "light" : "dark"))}
          onPrimaryAction={openDashboardAuth}
          onNavigateToFeature={goToFeature}
          onNavigateToGuide={goToGuide}
          onNavigateToAbout={goToAbout}
          onNavigateToUseCase={goToUseCase}
          onNavigateToContact={goToContact}
          onNavigateToFAQ={goToFAQ}
        />
        <main className="relative">
          <FAQPage isDark={isDark} onBack={goHome} />
        </main>
        <Footer isDark={isDark} />
        <CookieConsentBanner theme={isDark ? "dark" : "light"} />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative min-h-screen overflow-x-clip transition-colors duration-500",
        isDark ? "bg-[#050505] text-slate-200" : "bg-slate-100 text-slate-900"
      )}
    >
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-0",
          isDark
            ? "[background:radial-gradient(circle_at_12%_18%,rgba(99,102,241,0.22),transparent_28%),radial-gradient(circle_at_88%_14%,rgba(239,68,68,0.2),transparent_30%),radial-gradient(circle_at_52%_82%,rgba(16,185,129,0.16),transparent_32%)]"
            : "[background:radial-gradient(circle_at_12%_18%,rgba(99,102,241,0.14),transparent_28%),radial-gradient(circle_at_88%_14%,rgba(239,68,68,0.12),transparent_30%),radial-gradient(circle_at_52%_82%,rgba(16,185,129,0.1),transparent_32%)]"
        )}
      />


      <Navigation
        theme={theme}
        isDark={isDark}
        onToggleTheme={() => setTheme((prev) => (prev === "dark" ? "light" : "dark"))}
        onPrimaryAction={openDashboardAuth}
        onNavigateToFeature={goToFeature}
        onNavigateToGuide={goToGuide}
        onNavigateToAbout={goToAbout}
        onNavigateToUseCase={goToUseCase}
        onNavigateToContact={goToContact}
        onNavigateToFAQ={goToFAQ}
      />

      <main className="relative">
        <Hero isDark={isDark} onConnect={openDashboardAuth} />
        <Features isDark={isDark} onNavigateToFeature={goToFeature} />
        <Pricing isDark={isDark} onConnect={openDashboardAuth} />
        <FAQ isDark={isDark} />
        <CTASection isDark={isDark} onConnect={openDashboardAuth} />
      </main>

      <Footer isDark={isDark} />
      <CookieConsentBanner theme={isDark ? "dark" : "light"} />
    </div>
  );
}
