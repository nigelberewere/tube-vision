import { motion } from "motion/react";
import { ArrowLeft, BookOpen, Clock, Calendar, ArrowRight } from "lucide-react";
import { cn } from "@/src/lib/utils";

export type BlogCategory = "Growth" | "Product" | "Strategy";

export type BlogPostOverview = {
  slug: string;
  title: string;
  excerpt: string;
  category: BlogCategory;
  date: string;
  readTime: string;
  author: string;
  imageColor: string;
};

// Mock data for the blog hub
export const BLOG_POSTS: BlogPostOverview[] = [
  {
    slug: "youtube-keyword-research-gemini",
    title: "How to Find Trending YouTube Keywords Before Your Competitors",
    excerpt: "Stop guessing what your audience wants to watch. Learn how to use Gemini AI and Janso Studio's SEO Optimizer to find high-volume, low-competition semantic keywords.",
    category: "Growth",
    date: "Mar 17, 2026",
    readTime: "6 min read",
    author: "Janso Growth Team",
    imageColor: "from-blue-500 to-indigo-600",
  },
  {
    slug: "structuring-scripts-retention",
    title: "The Anatomy of a High-Retention YouTube Script",
    excerpt: "Great videos aren't just recorded—they're engineered. Discover the AIDA framework and how to place pattern interrupts every 90 seconds to maximize your average view duration.",
    category: "Strategy",
    date: "Mar 17, 2026",
    readTime: "8 min read",
    author: "Janso Content Team",
    imageColor: "from-emerald-400 to-teal-600",
  },
  {
    slug: "product-update-v2",
    title: "Janso Studio v2.0: Unified Dashboard, New AI Voices, and More",
    excerpt: "Read about our biggest update yet. We've brought Script Architect, Voice Over Studio, and the Viral Clip Creator into a single, seamless workspace for creators.",
    category: "Product",
    date: "Mar 17, 2026",
    readTime: "4 min read",
    author: "Product Team",
    imageColor: "from-violet-500 to-fuchsia-600",
  },
];

type BlogHubProps = {
  isDark: boolean;
  onBack: () => void;
  onNavigateToPost: (slug: string) => void;
};

export function BlogHub({ isDark, onBack, onNavigateToPost }: BlogHubProps) {
  return (
    <>
      <section className="relative px-4 pb-16 pt-10 md:px-8 md:pb-24 md:pt-14">
        <div className="mx-auto w-full max-w-6xl">
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
            Back to Janso Studio
          </motion.button>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: "easeOut" }}
            className="max-w-3xl space-y-6"
          >
            <span
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold",
                isDark ? "border-white/10 bg-white/5 text-slate-200" : "border-slate-200 bg-white text-slate-700",
              )}
            >
              <BookOpen className="h-3.5 w-3.5 opacity-70" />
              The Growth Hub
            </span>

            <h1 className="text-balance text-4xl font-semibold tracking-tight md:text-5xl lg:text-[3.25rem]">
              Insights and strategies for modern creators.
            </h1>

            <p
              className={cn(
                "max-w-2xl text-base leading-relaxed md:text-lg",
                isDark ? "text-slate-300" : "text-slate-700",
              )}
            >
              Read our latest articles on YouTube growth, algorithm changes, SEO tactics, and new feature releases from the Janso Studio team.
            </p>
          </motion.div>
        </div>
      </section>

      <section className="px-4 pb-20 md:px-8 md:pb-32">
        <div className="mx-auto w-full max-w-6xl">
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {BLOG_POSTS.map((post, i) => (
              <motion.article
                key={post.slug}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: i * 0.1 }}
                onClick={() => onNavigateToPost(post.slug)}
                className={cn(
                  "group cursor-pointer flex flex-col overflow-hidden rounded-3xl border transition-all duration-300",
                  isDark
                    ? "border-white/10 bg-[#0a0a0a]/50 hover:border-white/20 hover:bg-white/[0.04]"
                    : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-lg hover:shadow-slate-200/50",
                )}
              >
                {/* Simulated Article Header Image */}
                <div className={cn("h-48 w-full bg-gradient-to-br opacity-80 transition-opacity group-hover:opacity-100", post.imageColor)} />
                
                <div className="flex flex-1 flex-col p-6">
                  <div className="mb-4 flex items-center justify-between text-xs">
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-1 font-semibold",
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

                  <h2 className="mb-3 text-xl font-bold leading-snug tracking-tight group-hover:underline">{post.title}</h2>
                  <p className={cn("mb-6 flex-1 text-sm leading-relaxed", isDark ? "text-slate-300" : "text-slate-600")}>
                    {post.excerpt}
                  </p>

                  <div className={cn("flex items-center justify-between border-t pt-4", isDark ? "border-white/10" : "border-slate-100")}>
                    <div className="flex items-center gap-2">
                      <div className={cn("flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white shadow-sm", post.imageColor)}>
                        {post.author.charAt(0)}
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs font-semibold">{post.author}</span>
                        <span className={cn("text-[10px]", isDark ? "text-slate-400" : "text-slate-500")}>{post.date}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.article>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
