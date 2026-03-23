import { useEffect } from "react";
import { motion } from "motion/react";
import { cn } from "@/src/lib/utils";
import { applyPageMeta } from "@/src/lib/seo";

const FAQS = [
  {
    q: "Is my data ever sent to your servers?",
    a: "No. All video, audio, and API key data is processed in your browser. Janso Studio never sees or stores your content or credentials.",
  },
  {
    q: "How does browser-side processing work?",
    a: "We use WebAssembly (Wasm) and modern browser APIs to run AI models, FFmpeg, and other tools directly on your device. This keeps your data private and fast.",
  },
  {
    q: "What if I lose my Gemini API key?",
    a: "You can always generate a new key from Google AI Studio. Your key is only stored in your browser and never leaves your device.",
  },
  {
    q: "Can I export my scripts, audio, or clips?",
    a: "Yes! Janso Studio is built for zero lock-in. Download everything you create, anytime.",
  },
  {
    q: "What are the costs?",
    a: "Janso Studio is free to use. You only pay Google for Gemini API usage, and most users stay within the free tier.",
  },
  {
    q: "Is there a mobile app?",
    a: "The web app is fully responsive and works on all modern devices. Native apps are planned for the future.",
  },
  {
    q: "How do I request a feature or report a bug?",
    a: "Use the Contact page to send us your feedback. We read every message!",
  },
];

export function FAQPage({ isDark, onBack }: { isDark: boolean; onBack: () => void }) {
  useEffect(() => applyPageMeta(
    "Janso Studio FAQ | Privacy, BYOK, and Creator Workflow Questions",
    "Read answers about Janso Studio privacy, browser-side processing, BYOK setup, exports, costs, and support.",
  ), []);

  return (
    <div className={cn("w-full pb-12 transition-colors duration-500", isDark ? "text-slate-200" : "text-slate-900")}> 
      <div className="mx-auto w-full max-w-2xl px-4 pt-10 md:px-0 md:pt-16">
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
          <h1 className="text-3xl font-bold md:text-4xl mb-2">Frequently Asked Questions</h1>
          <p className={cn("max-w-2xl text-base md:text-lg", isDark ? "text-slate-300" : "text-slate-700")}>Answers to common questions about privacy, browser-side processing, and using Janso Studio.</p>
        </motion.div>
        <div className="space-y-8">
          {FAQS.map((faq, i) => (
            <div key={faq.q} className="border-b pb-6">
              <h2 className="text-lg font-semibold mb-2">Q{i + 1}. {faq.q}</h2>
              <p className={cn("text-sm", isDark ? "text-slate-300" : "text-slate-700")}>{faq.a}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
