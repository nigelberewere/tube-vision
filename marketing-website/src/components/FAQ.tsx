import { motion } from "motion/react";
import { ChevronDown } from "lucide-react";
import { useState } from "react";

import { cn } from "@/src/lib/utils";

type FAQProps = {
  isDark: boolean;
};

type FAQItem = {
  question: string;
  answer: string;
};

const faqs: FAQItem[] = [
  {
    question: "What is Janso Studio?",
    answer: "Janso Studio is an AI-powered YouTube analytics and optimization platform that helps content creators grow faster with tools like script generation, viral clip extraction, thumbnail concepting, and SEO optimization."
  },
  {
    question: "How does Janso Studio's YouTube keyword research tool work?",
    answer: "Our AI-powered keyword research tool analyzes your niche and suggests high-potential, low-competition keywords tailored for small channels looking to rank faster."
  },
  {
    question: "Can Janso Studio help me repurpose long videos into YouTube Shorts?",
    answer: "Yes! Our YouTube content repurposing tool uses AI to extract viral-worthy clips from your long-form videos and optimize them for Shorts, TikTok, and Instagram Reels."
  },
  {
    question: "Do I need to provide my own API keys?",
    answer: "Yes, Janso Studio uses your own Google Gemini API key for AI features. This keeps your data private and gives you full control over usage and costs. We never see or store your API key—it stays in your browser."
  },
  {
    question: "Is Janso Studio free to use?",
    answer: "Yes! Janso Studio is free for creators. You only pay for the Google Gemini API usage based on your activity. Most creators spend less than $5/month on API calls."
  },
  {
    question: "How do I connect my YouTube channel?",
    answer: "Click 'Sign in with Google' and approve read-only YouTube access. After authentication, you'll land in your Janso Studio dashboard with your channel ready to analyze."
  }
];

export function FAQ({ isDark }: FAQProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section className="px-4 py-18 md:px-8 md:py-24">
      <div className="mx-auto w-full max-w-3xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.35 }}
          transition={{ duration: 0.45 }}
          className="mb-10 text-center"
        >
          <p className={cn("mb-3 text-sm font-medium", isDark ? "text-indigo-300" : "text-indigo-600")}>
            Frequently Asked Questions
          </p>
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
            Everything you need to know
          </h2>
        </motion.div>

        <div className="space-y-3">
          {faqs.map((faq, idx) => {
            const isOpen = openIndex === idx;
            return (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.2 }}
                transition={{ duration: 0.35, delay: idx * 0.05 }}
                className={cn(
                  "overflow-hidden rounded-xl border transition-colors",
                  isDark
                    ? "glass-card hover:border-white/20"
                    : "border-slate-200 bg-white hover:border-slate-300"
                )}
              >
                <button
                  type="button"
                  onClick={() => setOpenIndex(isOpen ? null : idx)}
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition"
                >
                  <span className="text-base font-semibold">{faq.question}</span>
                  <ChevronDown
                    className={cn(
                      "h-5 w-5 flex-shrink-0 transition-transform",
                      isOpen ? "rotate-180" : "",
                      isDark ? "text-slate-400" : "text-slate-600"
                    )}
                  />
                </button>
                <div
                  className={cn(
                    "overflow-hidden transition-all duration-300",
                    isOpen ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
                  )}
                >
                  <p
                    className={cn(
                      "px-5 pb-4 text-sm leading-relaxed",
                      isDark ? "text-slate-300" : "text-slate-700"
                    )}
                  >
                    {faq.answer}
                  </p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
