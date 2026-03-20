import { useEffect, useState } from "react";

import { AboutPage } from "@/src/components/AboutPage";
import { BlogHub } from "@/src/components/BlogHub";
import { BlogPost } from "@/src/components/BlogPost";
import { ContactPage } from "@/src/components/ContactPage";
import { CookieConsentBanner } from "@/src/components/CookieConsentBanner";
import { CTASection } from "@/src/components/CTASection";
import { FAQ } from "@/src/components/FAQ";
import { FAQPage } from "@/src/components/FAQPage";
import { FeaturePage, type FeatureSlug } from "@/src/components/FeaturePage";
import { Features } from "@/src/components/Features";
import { Footer } from "@/src/components/Footer";
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
  | "blog_post";

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

  const openDashboardAuth = () => {
    if (isAuthenticated) {
      window.location.assign(getDashboardUrl());
      return;
    }

    window.location.assign(getAuthUrl("youtube", "/"));
  };

  const goHome = () => {
    window.history.pushState({}, "", "/");
    setPage("home");
    setCurrentFeatureSlug(null);
    setCurrentGuideSlug(null);
    setCurrentUseCaseSlug(null);
    setCurrentBlogPostSlug(null);
    window.scrollTo({ top: 0, behavior: "auto" });
  };

  const goToFeature = (slug: string) => {
    if ((FEATURE_SLUGS as readonly string[]).includes(slug as any)) {
      window.history.pushState({}, "", `/features/${slug}`);
      setPage("feature");
      setCurrentFeatureSlug(slug as FeatureSlug);
      setCurrentGuideSlug(null);
      setCurrentUseCaseSlug(null);
      setCurrentBlogPostSlug(null);
      window.scrollTo({ top: 0, behavior: "auto" });
    }
  };

  const goToGuide = (slug: string) => {
    if ((GUIDE_SLUGS as readonly string[]).includes(slug as any)) {
      window.history.pushState({}, "", `/guides/${slug}`);
      setPage("guide");
      setCurrentGuideSlug(slug as GuideSlug);
      setCurrentFeatureSlug(null);
      setCurrentUseCaseSlug(null);
      setCurrentBlogPostSlug(null);
      window.scrollTo({ top: 0, behavior: "auto" });
    }
  };

  const goToAbout = () => {
    window.history.pushState({}, "", "/about");
    setPage("about");
    setCurrentFeatureSlug(null);
    setCurrentGuideSlug(null);
    setCurrentUseCaseSlug(null);
    setCurrentBlogPostSlug(null);
    window.scrollTo({ top: 0, behavior: "auto" });
  };

  const goToUseCase = (slug: string) => {
    if ((USECASE_SLUGS as readonly string[]).includes(slug as any)) {
      window.history.pushState({}, "", `/usecase/${slug}`);
      setPage("usecase");
      setCurrentUseCaseSlug(slug as UseCaseSlug);
      setCurrentFeatureSlug(null);
      setCurrentGuideSlug(null);
      setCurrentBlogPostSlug(null);
      window.scrollTo({ top: 0, behavior: "auto" });
    }
  };

  const goToContact = () => {
    window.history.pushState({}, "", "/contact");
    setPage("contact");
    setCurrentFeatureSlug(null);
    setCurrentGuideSlug(null);
    setCurrentUseCaseSlug(null);
    setCurrentBlogPostSlug(null);
    window.scrollTo({ top: 0, behavior: "auto" });
  };

  const goToFAQ = () => {
    window.history.pushState({}, "", "/faq");
    setPage("faq");
    setCurrentFeatureSlug(null);
    setCurrentGuideSlug(null);
    setCurrentUseCaseSlug(null);
    setCurrentBlogPostSlug(null);
    window.scrollTo({ top: 0, behavior: "auto" });
  };

  const goToBlog = () => {
    window.history.pushState({}, "", "/blog");
    setPage("blog");
    setCurrentFeatureSlug(null);
    setCurrentGuideSlug(null);
    setCurrentUseCaseSlug(null);
    setCurrentBlogPostSlug(null);
    window.scrollTo({ top: 0, behavior: "auto" });
  };

  const goToBlogPost = (slug: string) => {
    window.history.pushState({}, "", `/blog/${slug}`);
    setPage("blog_post");
    setCurrentBlogPostSlug(slug);
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
  } else {
    mainContent = (
      <>
        <Hero isDark={isDark} isAuthenticated={isAuthenticated} authProfile={authState.profile} onConnect={openDashboardAuth} />
        <Features isDark={isDark} onNavigateToFeature={goToFeature} />
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
      />

      <main className="relative z-10 w-full overflow-visible">
        {mainContent}
      </main>

      <Footer isDark={isDark} />
      <CookieConsentBanner theme={isDark ? "dark" : "light"} />
    </div>
  );
}
