import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import ReactMarkdown from "react-markdown";

import { cn } from "@/src/lib/utils";

type LegalType = "privacy" | "terms";

type LegalViewerProps = {
  type: LegalType;
  isDark: boolean;
  onBack: () => void;
};

const LEGAL_CONTENT: Record<LegalType, { title: string; filePath: string }> = {
  privacy: {
    title: "Privacy Policy",
    filePath: "/privacy-policy.md",
  },
  terms: {
    title: "Terms of Service",
    filePath: "/terms-of-service.md",
  },
};

export function LegalViewer({ type, isDark, onBack }: LegalViewerProps) {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { title, filePath } = LEGAL_CONTENT[type];

  useEffect(() => {
    setLoading(true);
    setError(null);

    fetch(filePath)
      .then((res) => {
        if (!res.ok) {
          throw new Error("Failed to load legal document.");
        }
        return res.text();
      })
      .then(setContent)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [filePath]);

  return (
    <div
      className={cn(
        "relative min-h-screen transition-colors duration-500",
        isDark ? "bg-[#050505] text-slate-200" : "bg-slate-100 text-slate-900"
      )}
    >
      <div
        className={cn(
          "pointer-events-none absolute inset-0",
          isDark
            ? "[background:radial-gradient(circle_at_10%_15%,rgba(99,102,241,0.18),transparent_30%),radial-gradient(circle_at_88%_10%,rgba(239,68,68,0.16),transparent_28%)]"
            : "[background:radial-gradient(circle_at_10%_15%,rgba(99,102,241,0.12),transparent_30%),radial-gradient(circle_at_88%_10%,rgba(239,68,68,0.1),transparent_28%)]"
        )}
      />

      <main className="relative mx-auto max-w-4xl px-4 py-8 md:px-8 md:py-12">
        <button
          type="button"
          onClick={onBack}
          className={cn(
            "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition",
            isDark
              ? "border-white/15 bg-white/5 hover:bg-white/10"
              : "border-slate-300 bg-white hover:bg-slate-100"
          )}
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Home
        </button>

        <div
          className={cn(
            "mt-6 rounded-2xl border p-6 shadow-sm md:p-8",
            isDark ? "border-white/10 bg-black/30" : "border-slate-200 bg-white"
          )}
        >
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{title}</h1>

          {loading && <p className="mt-6 text-sm opacity-80">Loading document...</p>}

          {error && (
            <p className={cn("mt-6 text-sm", isDark ? "text-red-300" : "text-red-700")}>{error}</p>
          )}

          {!loading && !error && (
            <article className="mt-6 space-y-3 text-sm leading-7 md:text-base">
              <ReactMarkdown
                components={{
                  h1: ({ children }) => <h2 className="mt-8 text-xl font-bold md:text-2xl">{children}</h2>,
                  h2: ({ children }) => <h3 className="mt-7 text-lg font-semibold md:text-xl">{children}</h3>,
                  h3: ({ children }) => <h4 className="mt-6 text-base font-semibold md:text-lg">{children}</h4>,
                  p: ({ children }) => <p className="mt-3">{children}</p>,
                  ul: ({ children }) => <ul className="mt-3 list-disc space-y-1 pl-6">{children}</ul>,
                  ol: ({ children }) => <ol className="mt-3 list-decimal space-y-1 pl-6">{children}</ol>,
                  li: ({ children }) => <li>{children}</li>,
                  a: ({ children, href }) => (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(
                        "underline underline-offset-2",
                        isDark ? "text-sky-300 hover:text-sky-200" : "text-blue-700 hover:text-blue-800"
                      )}
                    >
                      {children}
                    </a>
                  ),
                  hr: () => <hr className={cn("my-6", isDark ? "border-white/10" : "border-slate-200")} />,
                  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                }}
              >
                {content}
              </ReactMarkdown>
            </article>
          )}
        </div>
      </main>
    </div>
  );
}
