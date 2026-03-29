import { useEffect, useState } from "react";

import { AboutPage } from "@/src/components/AboutPage";
import { BlogHub } from "@/src/components/BlogHub";
import { BlogPost } from "@/src/components/BlogPost";
import { ContactPage } from "@/src/components/ContactPage";
import { ContentEngineSection } from "@/src/components/ContentEngineSection";
import { CookieConsentBanner } from "@/src/components/CookieConsentBanner";
import { CTASection } from "@/src/components/CTASection";
import { DiscoveryGrid } from "@/src/components/DiscoveryGrid";
import { FAQ } from "@/src/components/FAQ";
import { FAQPage } from "@/src/components/FAQPage";
import { FeaturePage, type FeatureSlug } from "@/src/components/FeaturePage";
import { Features } from "@/src/components/Features";
import { Footer } from "@/src/components/Footer";
import { FreeToolsPage } from "@/src/components/FreeToolsPage";
import { GuidePage, type GuideSlug } from "@/src/components/GuidePage";
import { Hero } from "@/src/components/Hero";
import { LegalViewer } from "@/src/components/LegalViewer";
import { Navigation } from "@/src/components/Navigation";
import { Pricing } from "@/src/components/Pricing";
import { UseCasePage, type UseCaseSlug } from "@/src/components/UseCasePage";
import { getAuthUrl, getDashboardUrl } from "@/src/lib/config";
import { readSharedAuthState, type SharedAuthState } from "@/src/lib/sharedAuthCookie";
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
  | "faq"
  | "blog"
  | "blog_post"
  | "free_tools";

const FEATURE_ROUTE_MAP = {
  "script-architect": "script-architect",
  "ai-youtube-script-generator": "script-architect",
  "viral-clip-creator": "viral-clip-creator",
  "viral-clip-extractor": "viral-clip-creator",
  "voice-over-studio": "voice-over-studio",
  "youtube-seo": "youtube-seo",
  "seo-optimizer": "youtube-seo",
  "keyword-research-tool": "youtube-seo",
  "thumbnail-studio": "thumbnail-studio",
  "ai-thumbnail-generator": "thumbnail-studio",
  "ai-youtube-coach": "ai-youtube-coach",
  "youtube-growth-coach": "ai-youtube-coach",
  "analytics-dashboard": "analytics-dashboard",
  "youtube-analytics-dashboard": "analytics-dashboard",
  "video-idea-generator": "video-idea-generator",
  "youtube-video-idea-generator": "video-idea-generator",
} as const satisfies Record<string, FeatureSlug>;

const GUIDE_ROUTE_MAP = {
  "api-setup": "api-setup",
  "gemini-api-setup": "api-setup",
  "byok-gemini-api-key": "api-setup",
  "platform-workflow": "platform-workflow",
  "youtube-workflow": "platform-workflow",
} as const satisfies Record<string, GuideSlug>;

const USECASE_ROUTE_MAP = {
  educators: "educators",
  "educational-channels": "educators",
  gaming: "gaming",
  "gaming-creators": "gaming",
  faceless: "faceless",
  "faceless-youtube-channels": "faceless",
} as const satisfies Record<string, UseCaseSlug>;

function getFeatureSlugFromPath(pathname: string): FeatureSlug | null {
  const match = pathname.match(/^\/features\/([^/]+)$/);
  if (!match) return null;
  return FEATURE_ROUTE_MAP[match[1] as keyof typeof FEATURE_ROUTE_MAP] ?? null;
}

function getGuideSlugFromPath(pathname: string): GuideSlug | null {
  const match = pathname.match(/^\/guides\/([^/]+)$/);
  if (!match) return null;
  return GUIDE_ROUTE_MAP[match[1] as keyof typeof GUIDE_ROUTE_MAP] ?? null;
}

function getUseCaseSlugFromPath(pathname: string): UseCaseSlug | null {
  const match = pathname.match(/^\/(?:usecase|use-cases)\/([^/]+)$/);
  if (!match) return null;
  return USECASE_ROUTE_MAP[match[1] as keyof typeof USECASE_ROUTE_MAP] ?? null;
}

function getBlogPostSlugFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/blog\/([^/]+)$/);
  if (!match) return null;
  return match[1];
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
  if (pathname === "/blog") return "blog";
  if (getBlogPostSlugFromPath(pathname)) return "blog_post";
  if (pathname === "/free-tools") return "free_tools";
  return "home";
}

export default function App() {
  const [authState, setAuthState] = useState<SharedAuthState>(() => readSharedAuthState());
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
  const [currentBlogPostSlug, setCurrentBlogPostSlug] = useState<string | null>(
    () => getBlogPostSlugFromPath(window.location.pathname),
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
    const refreshAuthState = () => {
      setAuthState(readSharedAuthState());
    };

    refreshAuthState();
    window.addEventListener("focus", refreshAuthState);
    document.addEventListener("visibilitychange", refreshAuthState);

    return () => {
      window.removeEventListener("focus", refreshAuthState);
      document.removeEventListener("visibilitychange", refreshAuthState);
    };
  }, []);

  useEffect(() => {
    const onPopState = () => {
      const path = window.location.pathname;
      setPage(getPageFromPath(path));
      setCurrentFeatureSlug(getFeatureSlugFromPath(path));
      setCurrentGuideSlug(getGuideSlugFromPath(path));
      setCurrentUseCaseSlug(getUseCaseSlugFromPath(path));
      setCurrentBlogPostSlug(getBlogPostSlugFromPath(path));
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const isDark = theme === "dark";
  const isAuthenticated = authState.isAuthenticated;

  const navigateToPath = (path: string) => {
    window.history.pushState({}, "", path);
    setPage(getPageFromPath(path));
    setCurrentFeatureSlug(getFeatureSlugFromPath(path));
    setCurrentGuideSlug(getGuideSlugFromPath(path));
    setCurrentUseCaseSlug(getUseCaseSlugFromPath(path));
    setCurrentBlogPostSlug(getBlogPostSlugFromPath(path));
    window.scrollTo({ top: 0, behavior: "auto" });
  };

  const openDashboardAuth = () => {
    if (isAuthenticated) {
      window.location.assign(getDashboardUrl());
      return;
    }

    window.location.assign(getAuthUrl("youtube", "/"));
  };

  const goHome = () => {
    navigateToPath("/");
  };

  const goToFeature = (slug: string) => {
    if (Object.values(FEATURE_ROUTE_MAP).includes(slug as FeatureSlug)) {
      navigateToPath(`/features/${slug}`);
    }
  };

  const goToGuide = (slug: string) => {
    if (Object.values(GUIDE_ROUTE_MAP).includes(slug as GuideSlug)) {
      navigateToPath(`/guides/${slug}`);
    }
  };

  const goToAbout = () => {
    navigateToPath("/about");
  };

  const goToUseCase = (slug: string) => {
    if (Object.values(USECASE_ROUTE_MAP).includes(slug as UseCaseSlug)) {
      navigateToPath(`/use-cases/${slug}`);
    }
  };

  const goToFreeTools = () => {
    navigateToPath("/free-tools");
  };

  const goToContact = () => {
    navigateToPath("/contact");
  };

  const goToFAQ = () => {
    navigateToPath("/faq");
  };

  const goToBlog = () => {
    navigateToPath("/blog");
  };

  const goToBlogPost = (slug: string) => {
    navigateToPath(`/blog/${slug}`);
  };

  if (page === "privacy" || page === "terms") {
    return (
      <>
        <LegalViewer type={page} isDark={isDark} onBack={goHome} />
        <CookieConsentBanner theme={isDark ? "dark" : "light"} />
      </>
    );
  }

  let mainContent: React.ReactNode = null;

  if (page === "feature" && currentFeatureSlug) {
    mainContent = <FeaturePage slug={currentFeatureSlug} isDark={isDark} isAuthenticated={isAuthenticated} onBack={goHome} onConnect={openDashboardAuth} />;
  } else if (page === "guide" && currentGuideSlug) {
    mainContent = <GuidePage slug={currentGuideSlug} isDark={isDark} isAuthenticated={isAuthenticated} onBack={goHome} onConnect={openDashboardAuth} />;
  } else if (page === "about") {
    mainContent = <AboutPage isDark={isDark} onBack={goHome} />;
  } else if (page === "usecase" && currentUseCaseSlug) {
    mainContent = <UseCasePage slug={currentUseCaseSlug} isDark={isDark} isAuthenticated={isAuthenticated} onBack={goHome} onConnect={openDashboardAuth} />;
  } else if (page === "contact") {
    mainContent = <ContactPage isDark={isDark} onBack={goHome} />;
  } else if (page === "faq") {
    mainContent = <FAQPage isDark={isDark} onBack={goHome} />;
  } else if (page === "blog") {
    mainContent = <BlogHub isDark={isDark} onBack={goHome} onNavigateToPost={goToBlogPost} />;
  } else if (page === "blog_post" && currentBlogPostSlug) {
    mainContent = <BlogPost slug={currentBlogPostSlug} isDark={isDark} isAuthenticated={isAuthenticated} onBack={goToBlog} onConnect={openDashboardAuth} />;
  } else if (page === "free_tools") {
    mainContent = <FreeToolsPage isDark={isDark} isAuthenticated={isAuthenticated} onBack={goHome} onConnect={openDashboardAuth} />;
  } else {
    mainContent = (
      <>
        <Hero isDark={isDark} isAuthenticated={isAuthenticated} authProfile={authState.profile} onConnect={openDashboardAuth} />
        <Features isDark={isDark} onNavigateToFeature={goToFeature} />
        <DiscoveryGrid
          isDark={isDark}
          onNavigateToFeature={goToFeature}
          onNavigateToGuide={goToGuide}
          onNavigateToUseCase={goToUseCase}
          onNavigateToFreeTools={goToFreeTools}
        />
        <ContentEngineSection
          isDark={isDark}
          onNavigateToBlog={goToBlog}
          onNavigateToPost={goToBlogPost}
        />
        <Pricing isDark={isDark} isAuthenticated={isAuthenticated} onConnect={openDashboardAuth} />
        <FAQ isDark={isDark} />
        <CTASection isDark={isDark} isAuthenticated={isAuthenticated} onConnect={openDashboardAuth} />
      </>
    );
  }

  return (
    <div
      className={cn(
        "relative min-h-screen overflow-x-clip transition-colors duration-500",
        isDark ? "bg-[#050505] text-slate-200" : "bg-slate-100 text-slate-900"
      )}
    >
      {/* Global Background Gradient */}
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-0 z-0",
          isDark
            ? "[background:radial-gradient(circle_at_12%_18%,rgba(99,102,241,0.22),transparent_28%),radial-gradient(circle_at_88%_14%,rgba(239,68,68,0.2),transparent_30%),radial-gradient(circle_at_52%_82%,rgba(16,185,129,0.16),transparent_32%)]"
            : "[background:radial-gradient(circle_at_12%_18%,rgba(99,102,241,0.14),transparent_28%),radial-gradient(circle_at_88%_14%,rgba(239,68,68,0.12),transparent_30%),radial-gradient(circle_at_52%_82%,rgba(16,185,129,0.1),transparent_32%)]"
        )}
      />

      <Navigation
        theme={theme}
        isDark={isDark}
        onToggleTheme={() => setTheme((prev) => (prev === "dark" ? "light" : "dark"))}
        isAuthenticated={isAuthenticated}
        authProfile={authState.profile}
        onPrimaryAction={openDashboardAuth}
        onNavigateToFeature={goToFeature}
        onNavigateToGuide={goToGuide}
        onNavigateToAbout={goToAbout}
        onNavigateToUseCase={goToUseCase}
        onNavigateToContact={goToContact}
        onNavigateToFAQ={goToFAQ}
        onNavigateToBlog={goToBlog}
        onNavigateToFreeTools={goToFreeTools}
      />

      <main className="relative z-10 w-full overflow-visible">
        {mainContent}
      </main>

      <Footer isDark={isDark} onNavigateInternal={navigateToPath} />
      <CookieConsentBanner theme={isDark ? "dark" : "light"} />
    </div>
  );
}
