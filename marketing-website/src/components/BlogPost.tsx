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
      <p className="lead">Finding the right keywords can be the difference between a video that flatlines at 50 views and one that drives evergreen traffic for years. But most creators approach SEO the wrong way—they target massive, highly competitive terms like "gaming setup" where they have zero chance of ranking.</p>
      
      <h2>The Problem with Traditional Keyword Research</h2>
      <p>Traditional tools give you search volume and a generic "competition" score. They don't look at semantic relationships, and they don't analyze your specific channel's authority. This leads to creators wasting hours optimizing for the wrong terms. If your channel has 500 subscribers, trying to rank for a keyword that MKBHD owns is a fool's errand.</p>
      
      <p>What you actually need is <strong>semantic search optimization</strong>. YouTube doesn't just read your tags anymore; it uses AI to understand the entire context of your video. It transcribes the audio, reads the on-screen text, and analyzes the viewer's journey before and after your video.</p>
      
      <h2>Enter Gemini AI</h2>
      <p>With Janso Studio's SEO Optimizer, we use Gemini to perform semantic keyword clustering. Instead of just giving you a single target keyword, we provide a complete optimization roadmap:</p>
      <ul>
        <li><strong>Primary target keywords:</strong> The exact phrase your title must include for maximum click-through rate.</li>
        <li><strong>Semantic variations:</strong> What else searchers are typing (e.g., "cheap gaming desk" vs "budget pc setup"). Using these naturally in your script helps Google understand relevance.</li>
        <li><strong>Competitor Gaps:</strong> Keywords your competitors rank for, but you haven't covered yet. These are your lowest-hanging fruits.</li>
      </ul>
      
      <h2>How to Implement Semantic SEO Today</h2>
      <p>To start ranking faster, you need to align your content with user intent. Here is a three-step framework you can apply to your next video:</p>
      
      <ol>
        <li><strong>Identify the Root Problem:</strong> People don't search for "how to fix a pipe"; they search for "stop leaking sink fast." Find the pain point.</li>
        <li><strong>Use the "Autocomplete Plus" Method:</strong> Type your idea into YouTube, but add letters (e.g., "video editing for h..."). Gemini does this at scale, finding long-tail gems.</li>
        <li><strong>Write to Google, Speak to Humans:</strong> Pack your description with context, but keep your video intro fast and human. The AI handles the metadata; you handle the delivery.</li>
      </ol>
      
      <blockquote>
        <p>"Don't fight the algorithm. Understand what the algorithm is trying to do—serve the right video to the right viewer—and give it the exact data it needs to choose you."</p>
      </blockquote>
      
      <p>By leveraging AI, you don't just guess what the algorithm wants. You build a data-driven content library designed to rank, accumulate watch time, and grow your channel while you sleep.</p>
    </>
  ),
  "structuring-scripts-retention": (
    <>
      <p className="lead">If a viewer clicks off your video in the first three seconds, it doesn't matter how good your thumbnail was. YouTube's algorithm relies heavily on Average View Duration (AVD) to decide whether to push your video to a broader audience.</p>
      
      <h2>The Hook: Your Most Important 15 Seconds</h2>
      <p>Never start a video with "Hey guys, welcome back to the channel." The modern viewer's attention span is incredibly fragile. Instead, use the AIDA framework (Attention, Interest, Desire, Action) built into Janso Studio's Script Architect.</p>
      
      <blockquote>
        <p>"A great hook visually and verbally confirms that clicking the thumbnail was the right decision. It pays off the promise immediately."</p>
      </blockquote>
      
      <p>A strong hook does three things:</p>
      <ul>
        <li><strong>Restates the premise:</strong> Affirm they are in the right place.</li>
        <li><strong>Raises the stakes:</strong> Explain why watching to the end is crucial.</li>
        <li><strong>Opens a loop:</strong> Tease a payoff that won't happen until later in the video.</li>
      </ul>
      
      <h2>Pattern Interrupts: Resetting Attention</h2>
      <p>Even the best content can feel monotonous if the pacing never changes. A pattern interrupt is anything that breaks the rhythm of a video. Think of it as a reset button for the viewer's brain.</p>
      
      <p>Effective pattern interrupts include:</p>
      <ul>
        <li>Changing the camera angle or focal length suddenly.</li>
        <li>Adding a B-roll sequence, text-on-screen, or a sound effect.</li>
        <li>Shifting the tone of voice or narrative pace (e.g., going from energetic to a quiet, serious whisper).</li>
        <li>Cutting to a completely different location or using a zoom transition.</li>
      </ul>
      
      <p>Our Script Architect AI analyzes your script's density and automatically recommends placing a pattern interrupt every 60 to 90 seconds. This is precisely the window where analytics show the highest probability of viewer drop-off.</p>
      
      <h2>The "Payoff" and the End Screen</h2>
      <p>Finally, how you end the video is just as important as how you start. Don't say "That's all for today" or "In conclusion"—viewers will instantly close the tab. Instead, seamlessly transition from your final point of value directly into an End Screen recommendation.</p>
      
      <p>By maintaining narrative momentum right up until the final frame, you drastically increase your chances of starting a binge session, which is the holy grail of YouTube growth.</p>
    </>
  ),
  "product-update-v2": (
    <>
      <p className="lead">Today marks the biggest milestone in Janso Studio's history. We are thrilled to announce version 2.0, a complete reimagining of the creator workflow, built entirely around speed, privacy, and seamless integration.</p>
      
      <h2>What's New in v2.0?</h2>
      <p>We've completely overhauled the interface based on feedback from our early access creators. The problem was clear: jumping between five different tools ruins the creative flow. The solution? A unified, zero-friction dashboard.</p>
      
      <h3>1. The Seamless Pipeline</h3>
      <p>In v1.0, you generated a script, copied it, opened the voiceover tool, pasted it, and exported. In v2.0, those tools talk to each other. Generate an idea, write the script via Script Architect, and send it directly to Voice Over Studio with a single click. The pacing, emotional cues, and paragraph breaks are preserved automatically.</p>
      
      <h3>2. Client-Side FFmpeg Upgrades</h3>
      <p>The Viral Clip Creator is now a beast. We've optimized our WebAssembly implementation, making it <strong>40% faster</strong> at processing heavy 4K files. The best part? It still runs entirely within your browser. You get desktop-level performance with ultimate data privacy, and zero upload wait times.</p>
      
      <h3>3. Expanded AI Voice Library</h3>
      <p>We've added 5 new expressive voice characters to our text-to-speech engine. These aren't generic corporate voices; they are optimized specifically for fast-paced short-form content, featuring natural breaths, dynamic emphasis, and pacing controls that understand comedic timing.</p>
      
      <h2>The 'Bring Your Own Key' (BYOK) Philosophy</h2>
      <p>We believe AI should be powerful and transparent. Version 2.0 doubles down on our BYOK integrations. By using your own Google Gemini API key, you bypass platform rate limits, pay base costs, and guarantee that your scripts remain your private intellectual property.</p>
      
      <h2>Looking Ahead to Q3</h2>
      <p>We're not stopping here. Next quarter, we're focusing on deep analytics integrations. Imagine seeing your YouTube retention graphs directly alongside your script outlines, so the AI can learn exactly which lines caused viewers to stay or leave.</p>
      <p>Welcome to the future of YouTube creation. Let's get building.</p>
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
                  <div className={cn("flex h-10 w-10 md:h-12 md:w-12 items-center justify-center rounded-full text-sm font-bold text-white shadow-sm bg-gradient-to-br", post.authorInitialColor)}>
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
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mb-12 overflow-hidden rounded-3xl border border-white/10 shadow-2xl"
          >
            <img src={post.imageUrl} alt={post.title} className="w-full h-auto max-h-[500px] object-cover" />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
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
