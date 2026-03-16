import { useEffect } from "react";
import { motion } from "motion/react";
import { ArrowLeft, Clock, Share2 } from "lucide-react";

import { BLOG_POSTS, type BlogPostOverview } from "@/src/components/BlogHub";
import YouTubeLogoIcon from "@/src/components/icons/YouTubeLogoIcon";
import { cn } from "@/src/lib/utils";

type BlogPostProps = {
  slug: string;
  isDark: boolean;
  onBack: () => void;
  onConnect: () => void;
};

// Simple markdown-style content renderer (mocking real blog content)
const MOCK_CONTENT: Record<string, React.ReactNode> = {
  "youtube-keyword-research-gemini": (
    <>
      <p>Finding the right keywords can be the difference between a video that flatlines at 50 views and one that drives evergreen traffic for years. But most creators approach SEO the wrong way—they target massive, highly competitive terms like "gaming setup" where they have zero chance of ranking.</p>
      <h2>The Problem with Traditional Keyword Research</h2>
      <p>Traditional tools give you search volume and a generic "competition" score. They don't look at semantic relationships, and they don't analyze your specific channel's authority. This leads to creators wasting hours optimizing for the wrong terms.</p>
      <h2>Enter Gemini AI</h2>
      <p>With Janso Studio's SEO Optimizer, we use Gemini to perform semantic keyword clustering. Instead of just giving you the keyword, we provide:</p>
      <ul>
        <li><strong>Primary target keywords:</strong> The exact phrase your title must include.</li>
        <li><strong>Semantic variations:</strong> What else searchers are typing (e.g., "cheap gaming desk" vs "budget pc setup").</li>
        <li><strong>Competitor Gaps:</strong> Keywords your competitors rank for, but you haven't covered yet.</li>
      </ul>
      <p>By leveraging AI, you don't just guess what the algorithm wants. You build a data-driven content library designed to rank.</p>
    </>
  ),
  "structuring-scripts-retention": (
    <>
      <p>If a viewer clicks off your video in the first three seconds, it doesn't matter how good your thumbnail was. YouTube's algorithm relies heavily on Average View Duration (AVD) to decide whether to push your video to a broader audience.</p>
      <h2>The Hook: Your Most Important 15 Seconds</h2>
      <p>Never start a video with "Hey guys, welcome back to the channel." Instead, use the AIDA framework (Attention, Interest, Desire, Action) built into Janso Studio's Script Architect.</p>
      <blockquote>
        <p>"A great hook visually and verbally confirms that clicking the thumbnail was the right decision."</p>
      </blockquote>
      <h2>Pattern Interrupts</h2>
      <p>Even the best content can feel monotonous if the pacing never changes. A pattern interrupt is anything that breaks the rhythm of a video:</p>
      <ul>
        <li>Changing the camera angle or focal length.</li>
        <li>Adding a B-roll sequence or sound effect.</li>
        <li>Shifting the tone of voice or narrative pace.</li>
      </ul>
      <p>Our AI recommends placing a pattern interrupt every 90 seconds to reset the viewer's attention span and keep them engaged through the midpoint drop-off.</p>
    </>
  ),
  "product-update-v2": (
    <>
      <p>Today marks the biggest milestone in Janso Studio's history. We are thrilled to announce version 2.0, a complete reimagining of the creator workflow.</p>
      <h2>What's New in v2.0?</h2>
      <p>We've completely overhauled the interface based on feedback from over 12,000 creators. The biggest change? A unified dashboard.</p>
      <ul>
        <li><strong>Seamless Pipeline:</strong> Generate an idea, write the script via Script Architect, and send it directly to Voice Over Studio without ever copy-pasting text.</li>
        <li><strong>Client-Side FFmpeg Upgrades:</strong> The Viral Clip Creator is now 40% faster at processing heavy 4K files, entirely within your browser for ultimate privacy.</li>
        <li><strong>New AI Voices:</strong> 5 new expressive voice characters added to our text-to-speech engine, optimized specifically for fast-paced short-form content.</li>
      </ul>
      <h2>Looking Ahead</h2>
      <p>We're not stopping here. Next quarter, we're focusing on deep analytics integrations so you can see your retention graphs directly alongside your script outlines. Stay tuned!</p>
    </>
  )
};

export function BlogPost({ slug, isDark, onBack, onConnect }: BlogPostProps) {
  const post = BLOG_POSTS.find((p) => p.slug === slug);
  const content = MOCK_CONTENT[slug] || <p>Article content not found.</p>;

  useEffect(() => {
    if (post) {
      document.title = `${post.title} | Janso Growth Hub`;
    }
  }, [post]);

  if (!post) {
    return (
      <div className={cn("w-full pt-20 text-center transition-colors duration-500", isDark ? "text-slate-200" : "text-slate-900")}>
        <h1 className="text-2xl font-bold">Post not found</h1>
        <button onClick={onBack} className="mt-4 text-indigo-500 underline">Return to Blog Hub</button>
      </div>
    );
  }

  return (
    <>
      {/* Article Header */}
      <article className="px-4 pb-20 pt-10 md:px-8 md:pt-14 relative z-10">
        <div className="mx-auto w-full max-w-3xl">
          <motion.button
            type="button"
            onClick={onBack}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3 }}
            className={cn(
              "mb-8 inline-flex items-center gap-1.5 text-sm transition-colors",
              isDark ? "text-slate-400 hover:text-slate-100" : "text-slate-500 hover:text-slate-800",
            )}
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Hub
          </motion.button>

          <header className="mb-10 lg:mb-14">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="space-y-6"
            >
              <div className="flex items-center gap-3 text-xs md:text-sm">
                <span
                  className={cn(
                    "rounded-full px-3 py-1 font-semibold",
                    post.category === "Product" && (isDark ? "bg-fuchsia-500/20 text-fuchsia-300" : "bg-fuchsia-100 text-fuchsia-700"),
                    post.category === "Growth" && (isDark ? "bg-blue-500/20 text-blue-300" : "bg-blue-100 text-blue-700"),
                    post.category === "Strategy" && (isDark ? "bg-emerald-500/20 text-emerald-300" : "bg-emerald-100 text-emerald-700"),
                  )}
                >
                  {post.category}
                </span>
                <span className={cn("flex items-center gap-1.5", isDark ? "text-slate-400" : "text-slate-500")}>
                  <Clock className="h-3.5 w-3.5" />
                  {post.readTime}
                </span>
              </div>

              <h1 className="text-balance text-3xl font-bold tracking-tight md:text-5xl lg:text-6xl leading-[1.1]">
                {post.title}
              </h1>

              <div className={cn("flex items-center justify-between border-y py-4 md:py-6", isDark ? "border-white/10" : "border-slate-200")}>
                <div className="flex items-center gap-3">
                  <div className={cn("flex h-10 w-10 md:h-12 md:w-12 items-center justify-center rounded-full text-sm font-bold text-white shadow-sm", post.imageColor)}>
                    {post.author.charAt(0)}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold md:text-base">{post.author}</span>
                    <span className={cn("text-xs", isDark ? "text-slate-400" : "text-slate-500")}>Published on {post.date}</span>
                  </div>
                </div>
                
                <button
                  type="button"
                  className={cn("p-2 rounded-full transition-colors", isDark ? "hover:bg-white/10 text-slate-400 hover:text-white" : "hover:bg-slate-200 text-slate-500 hover:text-black")}
                  title="Share post"
                >
                  <Share2 className="h-5 w-5" />
                </button>
              </div>
            </motion.div>
          </header>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className={cn("prose md:prose-lg max-w-none", isDark ? "prose-invert" : "")}
          >
            {content}
          </motion.div>

          {/* Embedded Post CTA */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.5 }}
            transition={{ duration: 0.5 }}
            className={cn(
              "mt-16 sm:mt-24 rounded-3xl border p-8 text-center md:p-12 shadow-sm",
              isDark
                ? "border-white/10 glass-card bg-gradient-to-br from-[#111] via-[#0a0a0a] to-[#151515]"
                : "border-slate-200 bg-gradient-to-br from-slate-50 via-white to-slate-100",
            )}
          >
            <h3 className="mb-3 text-2xl font-bold tracking-tight md:text-3xl">Put this strategy into practice.</h3>
            <p className={cn("mx-auto mb-8 max-w-md text-sm md:text-base", isDark ? "text-slate-400" : "text-slate-600")}>
              Sign up for Janso Studio to access the tools mentioned in this article, and start growing your channel today.
            </p>
            <button
              onClick={onConnect}
              type="button"
              className="inline-flex items-center justify-center w-full sm:w-auto gap-2 rounded-xl bg-indigo-600 px-8 py-3.5 text-sm font-bold text-white transition hover:bg-indigo-500 shadow-md shadow-indigo-500/20"
            >
              <YouTubeLogoIcon className="h-5 w-5" />
              Sign in with Google
            </button>
          </motion.div>
        </div>
      </article>
    </>
  );
}
