import { useEffect } from "react";
import { motion } from "motion/react";
import { cn } from "@/src/lib/utils";
import { applyPageMeta } from "@/src/lib/seo";

export function AboutPage({ isDark, onBack }: { isDark: boolean; onBack: () => void }) {
  useEffect(() => applyPageMeta(
    "About Janso Studio | Creator-Focused AI YouTube Platform",
    "Learn about Janso Studio, our privacy-first creator tools, and the vision behind our AI YouTube workflow platform.",
  ), []);

  return (
    <div className={cn("w-full pb-12 transition-colors duration-500", isDark ? "text-slate-200" : "text-slate-900")}> 
      <div className="mx-auto w-full max-w-3xl px-4 pt-10 md:px-0 md:pt-16">
        <button
          type="button"
          onClick={onBack}
          className={cn(
            "mb-8 inline-flex items-center gap-1.5 text-sm transition-colors",
            isDark ? "text-slate-400 hover:text-slate-100" : "text-slate-500 hover:text-slate-800",
          )}
        >
          ← Back
        </button>
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: "easeOut" }}
          className="mb-8"
        >
          <h1 className="text-3xl font-bold md:text-4xl mb-2">About Janso Studio</h1>
          <p className={cn("max-w-2xl text-base md:text-lg", isDark ? "text-slate-300" : "text-slate-700")}>A unified platform for creators, built to empower the next generation of YouTube channels with AI-driven tools for every step of the journey.</p>
        </motion.div>
        <div className="space-y-10">
          <section>
            <h2 className="mb-2 text-xl font-semibold md:text-2xl">Our Vision</h2>
            <p className="prose prose-sm md:prose-base mb-2">
              Janso Studio was founded to solve a simple problem: creators spend too much time on repetitive, non-creative work. Our mission is to automate the busywork—so you can focus on ideas, storytelling, and growth.
            </p>
            <ul className="list-disc pl-5 text-sm">
              <li>One platform for scripting, voiceover, editing, and SEO.</li>
              <li>Privacy-first: all processing happens in your browser.</li>
              <li>Zero lock-in: export everything, use your own API keys.</li>
            </ul>
          </section>
          <section>
            <h2 className="mb-2 text-xl font-semibold md:text-2xl">The Story</h2>
            <p className="prose prose-sm md:prose-base mb-2">
              Janso Studio began as a side project by creators frustrated with the fragmented, expensive, and privacy-invasive tools on the market. We wanted a single workspace that respected user data, worked with any channel size, and kept creators in control.
            </p>
          </section>
          <section>
            <h2 className="mb-2 text-xl font-semibold md:text-2xl">About Inaetia Enterprise</h2>
            <p className="prose prose-sm md:prose-base mb-2">
              Janso Studio is a project by <a href="https://inaetia.com" target="_blank" rel="noopener noreferrer" className="text-indigo-600 underline">Inaetia Enterprise</a>, a company focused on AI-driven development and privacy-first software. Our team brings experience from both the creator economy and enterprise AI, ensuring Janso Studio is both powerful and trustworthy.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
