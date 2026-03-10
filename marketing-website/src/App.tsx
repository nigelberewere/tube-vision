import { useEffect, useState } from "react";

import { CTASection } from "@/src/components/CTASection";
import { FAQ } from "@/src/components/FAQ";
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
type Page = "home" | "privacy" | "terms";

function getPageFromPath(pathname: string): Page {
  if (pathname === "/privacy") return "privacy";
  if (pathname === "/terms") return "terms";
  return "home";
}

export default function App() {
  const [page, setPage] = useState<Page>(() => getPageFromPath(window.location.pathname));
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
    const onPopState = () => setPage(getPageFromPath(window.location.pathname));
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
    window.scrollTo({ top: 0, behavior: "auto" });
  };

  if (page === "privacy" || page === "terms") {
    return <LegalViewer type={page} isDark={isDark} onBack={goHome} />;
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
      />

      <main className="relative">
        <Hero isDark={isDark} onConnect={openDashboardAuth} />
        <Features isDark={isDark} />
        <Pricing isDark={isDark} onConnect={openDashboardAuth} />
        <FAQ isDark={isDark} />
        <CTASection isDark={isDark} onConnect={openDashboardAuth} />
      </main>

      <Footer isDark={isDark} />
    </div>
  );
}
