import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { ArrowLeft, BookOpen, Clock } from "lucide-react";

import { BLOG_POSTS, type BlogCategory } from "@/src/lib/content";
import { cn } from "@/src/lib/utils";

const categories: Array<BlogCategory | "All"> = ["All", "Growth", "Strategy", "Product"];

type BlogHubProps = {
  isDark: boolean;
  onBack: () => void;
  onNavigateToPost: (slug: string) => void;
};

export function BlogHub({ isDark, onBack, onNavigateToPost }: BlogHubProps) {
  const [activeCategory, setActiveCategory] = useState<BlogCategory | "All">("All");

  useEffect(() => {
    const previousTitle = document.title;
    document.title = "YouTube Growth Blog for Creators | Janso Studio";

    let metaEl = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    const previousDescription = metaEl?.content ?? "";
    if (!metaEl) {
      metaEl = document.createElement("meta");
      metaEl.name = "description";
      document.head.appendChild(metaEl);
    }
    metaEl.content =
      "Read YouTube growth strategies, creator SEO guides, BYOK privacy explainers, packaging tips, and product updates from the Janso Studio team.";

    return () => {
      document.title = previousTitle;
      if (metaEl) metaEl.content = previousDescription;
    };
  }, []);

  const filteredPosts = useMemo(
    () => (activeCategory === "All" ? BLOG_POSTS : BLOG_POSTS.filter((post) => post.category === activeCategory)),
    [activeCategory],
  );

  const featuredPost = filteredPosts[0];
  const remainingPosts = filteredPosts.slice(1);

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
              Search-led content for creators who want more reach, better packaging, and cleaner systems.
            </h1>

            <p
              className={cn(
                "max-w-2xl text-base leading-relaxed md:text-lg",
                isDark ? "text-slate-300" : "text-slate-700",
              )}
            >
              Explore YouTube SEO, thumbnails, Shorts repurposing, BYOK strategy, scripting frameworks, and product workflow articles designed to help creators grow.
            </p>
          </motion.div>
        </div>
      </section>

      <section className="px-4 pb-20 md:px-8 md:pb-32">
        <div className="mx-auto w-full max-w-6xl">
          <div className="mb-8 flex flex-wrap gap-2">
            {categories.map((category) => (
              <button
                key={category}
                type="button"
                onClick={() => setActiveCategory(category)}
                className={cn(
                  "rounded-full border px-4 py-2 text-sm font-medium transition",
                  activeCategory === category
                    ? "bg-white text-black border-white"
                    : isDark
                      ? "border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.07]"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                )}
              >
                {category}
              </button>
            ))}
          </div>

          {featuredPost && (
            <motion.article
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              onClick={() => onNavigateToPost(featuredPost.slug)}
              className={cn(
                "group mb-8 grid cursor-pointer overflow-hidden rounded-3xl border lg:grid-cols-[1.05fr_0.95fr]",
                isDark
                  ? "border-white/10 bg-[#0a0a0a]/50 hover:border-white/20 hover:bg-white/[0.04]"
                  : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-lg hover:shadow-slate-200/50",
              )}
            >
              <div className="overflow-hidden">
                <img src={featuredPost.imageUrl} alt={featuredPost.title} className="h-full min-h-[260px] w-full object-cover transition-transform duration-500 group-hover:scale-105" />
              </div>
              <div className="flex flex-col p-6 md:p-8">
                <div className="mb-4 flex items-center justify-between text-xs">
                  <span className={cn("rounded-full px-2.5 py-1 font-semibold",
                    featuredPost.category === "Product" && (isDark ? "bg-fuchsia-500/20 text-fuchsia-300" : "bg-fuchsia-100 text-fuchsia-700"),
                    featuredPost.category === "Growth" && (isDark ? "bg-blue-500/20 text-blue-300" : "bg-blue-100 text-blue-700"),
                    featuredPost.category === "Strategy" && (isDark ? "bg-emerald-500/20 text-emerald-300" : "bg-emerald-100 text-emerald-700"),
                  )}>
                    {featuredPost.category}
                  </span>
                  <span className={cn("flex items-center gap-1.5", isDark ? "text-slate-400" : "text-slate-500")}>
                    <Clock className="h-3.5 w-3.5" />
                    {featuredPost.readTime}
                  </span>
                </div>
                <h2 className="text-2xl font-bold tracking-tight group-hover:underline md:text-3xl">{featuredPost.title}</h2>
                <p className={cn("mt-4 flex-1 text-sm leading-relaxed md:text-base", isDark ? "text-slate-300" : "text-slate-600")}>
                  {featuredPost.excerpt}
                </p>
                <div className={cn("mt-6 border-t pt-4 text-xs", isDark ? "border-white/10 text-slate-400" : "border-slate-100 text-slate-500")}>
                  {featuredPost.author} • {featuredPost.date}
                </div>
              </div>
            </motion.article>
          )}

          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {remainingPosts.map((post, i) => (
              <motion.article
                key={post.slug}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: i * 0.06 }}
                onClick={() => onNavigateToPost(post.slug)}
                className={cn(
                  "group flex cursor-pointer flex-col overflow-hidden rounded-3xl border transition-all duration-300",
                  isDark
                    ? "border-white/10 bg-[#0a0a0a]/50 hover:border-white/20 hover:bg-white/[0.04]"
                    : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-lg hover:shadow-slate-200/50",
                )}
              >
                <div className="h-48 w-full overflow-hidden bg-slate-800">
                  <img src={post.imageUrl} alt={post.title} className="h-full w-full object-cover opacity-80 transition-transform duration-500 group-hover:scale-105 group-hover:opacity-100" />
                </div>
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
                  <div className={cn("border-t pt-4 text-[11px]", isDark ? "border-white/10 text-slate-400" : "border-slate-100 text-slate-500")}>
                    {post.author} • {post.date}
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
