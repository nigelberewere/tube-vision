import { useEffect } from "react";
import { motion } from "motion/react";
import { ArrowLeft, Clock, Share2 } from "lucide-react";

import { getBlogPostBySlug, getRelatedBlogPosts } from "@/src/lib/content";
import YouTubeLogoIcon from "@/src/components/icons/YouTubeLogoIcon";
import { cn } from "@/src/lib/utils";

type BlogPostProps = {
  slug: string;
  isDark: boolean;
  isAuthenticated: boolean;
  onBack: () => void;
  onConnect: () => void;
};

export function BlogPost({ slug, isDark, isAuthenticated, onBack, onConnect }: BlogPostProps) {
  const post = getBlogPostBySlug(slug);
  const relatedPosts = getRelatedBlogPosts(slug, 3);

  useEffect(() => {
    if (!post) {
      return;
    }

    document.title = `${post.title} | Janso Growth Hub`;

    let metaEl = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    const previousDescription = metaEl?.content ?? "";
    if (!metaEl) {
      metaEl = document.createElement("meta");
      metaEl.name = "description";
      document.head.appendChild(metaEl);
    }
    metaEl.content = post.excerpt;

    return () => {
      if (metaEl) metaEl.content = previousDescription;
    };
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
      <article className="relative z-10 px-4 pb-20 pt-10 md:px-8 md:pt-14">
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

              <h1 className="text-balance text-3xl font-bold leading-[1.1] tracking-tight md:text-5xl lg:text-6xl">
                {post.title}
              </h1>

              <div className={cn("flex items-center justify-between border-y py-4 md:py-6", isDark ? "border-white/10" : "border-slate-200")}>
                <div className="flex items-center gap-3">
                  <div className={cn("flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br text-sm font-bold text-white shadow-sm md:h-12 md:w-12", post.authorInitialColor)}>
                    {post.author.charAt(0)}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold md:text-base">{post.author}</span>
                    <span className={cn("text-xs", isDark ? "text-slate-400" : "text-slate-500")}>Published on {post.date}</span>
                  </div>
                </div>

                <button
                  type="button"
                  className={cn("rounded-full p-2 transition-colors", isDark ? "text-slate-400 hover:bg-white/10 hover:text-white" : "text-slate-500 hover:bg-slate-200 hover:text-black")}
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
            <img src={post.imageUrl} alt={post.title} className="h-auto max-h-[500px] w-full object-cover" />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className={cn("prose max-w-none md:prose-lg", isDark ? "prose-invert" : "")}
          >
            {post.content}
          </motion.div>

          <section className="mt-16 sm:mt-20">
            <div className="mb-5">
              <h3 className="text-2xl font-bold tracking-tight">Keep exploring</h3>
              <p className={cn("mt-2 text-sm", isDark ? "text-slate-400" : "text-slate-600")}>
                Related creator strategy content that can bring readers deeper into your topic cluster.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {relatedPosts.map((related) => (
                <button
                  key={related.slug}
                  type="button"
                  onClick={() => {
                    window.history.pushState({}, "", `/blog/${related.slug}`);
                    window.dispatchEvent(new PopStateEvent("popstate"));
                    window.scrollTo({ top: 0, behavior: "auto" });
                  }}
                  className={cn(
                    "rounded-2xl border p-4 text-left transition",
                    isDark
                      ? "border-white/10 bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/20"
                      : "border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300",
                  )}
                >
                  <p className="text-sm font-semibold">{related.title}</p>
                  <p className={cn("mt-2 text-xs leading-relaxed", isDark ? "text-slate-400" : "text-slate-500")}>{related.excerpt}</p>
                </button>
              ))}
            </div>
          </section>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.5 }}
            transition={{ duration: 0.5 }}
            className={cn(
              "mt-16 rounded-3xl border p-8 text-center shadow-sm sm:mt-24 md:p-12",
              isDark
                ? "glass-card border-white/10 bg-gradient-to-br from-[#111] via-[#0a0a0a] to-[#151515]"
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
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-8 py-3.5 text-sm font-bold text-white shadow-md shadow-indigo-500/20 transition hover:bg-indigo-500 sm:w-auto"
            >
              <YouTubeLogoIcon className="h-5 w-5" />
              {isAuthenticated ? "Continue to Dashboard" : "Sign in with Google"}
            </button>
          </motion.div>
        </div>
      </article>
    </>
  );
}
