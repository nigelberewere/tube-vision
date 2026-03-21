import type React from "react";

export type BlogCategory = "Growth" | "Product" | "Strategy";

export type BlogPostOverview = {
  slug: string;
  title: string;
  excerpt: string;
  category: BlogCategory;
  date: string;
  readTime: string;
  author: string;
  imageUrl: string;
  authorInitialColor: string;
};

export type BlogPostEntry = BlogPostOverview & {
  content: React.ReactNode;
};

export const BLOG_POSTS: BlogPostEntry[] = [
  {
    slug: "youtube-keyword-research-gemini",
    title: "How to Find Trending YouTube Keywords Before Your Competitors",
    excerpt: "Stop guessing what your audience wants to watch. Learn how to use Gemini AI and Janso Studio's SEO Optimizer to find high-volume, low-competition semantic keywords.",
    category: "Growth",
    date: "Mar 17, 2026",
    readTime: "6 min read",
    author: "Janso Growth Team",
    imageUrl: "/images/blog/seo.png",
    authorInitialColor: "from-blue-500 to-indigo-600",
    content: (
      <>
        <p className="lead">Finding the right keywords can be the difference between a video that flatlines at 50 views and one that drives evergreen traffic for years. But most creators approach SEO the wrong way—they target massive, highly competitive terms like "gaming setup" where they have zero chance of ranking.</p>
        <h2>The Problem with Traditional Keyword Research</h2>
        <p>Traditional tools give you search volume and a generic "competition" score. They don't look at semantic relationships, and they don't analyze your specific channel's authority. This leads to creators wasting hours optimizing for the wrong terms. If your channel has 500 subscribers, trying to rank for a keyword that MKBHD owns is a fool's errand.</p>
        <p>What you actually need is <strong>semantic search optimization</strong>. YouTube doesn't just read your tags anymore; it uses AI to understand the entire context of your video. It transcribes the audio, reads the on-screen text, and analyzes the viewer's journey before and after your video.</p>
        <h2>Enter Gemini AI</h2>
        <p>With Janso Studio's SEO Optimizer, we use Gemini to perform semantic keyword clustering. Instead of just giving you a single target keyword, we provide a complete optimization roadmap:</p>
        <ul>
          <li><strong>Primary target keywords:</strong> The exact phrase your title must include for maximum click-through rate.</li>
          <li><strong>Semantic variations:</strong> What else searchers are typing. Using these naturally in your script helps Google understand relevance.</li>
          <li><strong>Competitor Gaps:</strong> Keywords your competitors rank for, but you haven't covered yet.</li>
        </ul>
        <blockquote>
          <p>"Don't fight the algorithm. Understand what the algorithm is trying to do and give it the exact data it needs to choose you."</p>
        </blockquote>
      </>
    ),
  },
  {
    slug: "structuring-scripts-retention",
    title: "The Anatomy of a High-Retention YouTube Script",
    excerpt: "Great videos aren't just recorded—they're engineered. Discover the AIDA framework and how to place pattern interrupts every 90 seconds to maximize your average view duration.",
    category: "Strategy",
    date: "Mar 17, 2026",
    readTime: "8 min read",
    author: "Janso Content Team",
    imageUrl: "/images/blog/script.png",
    authorInitialColor: "from-emerald-400 to-teal-600",
    content: (
      <>
        <p className="lead">If a viewer clicks off your video in the first three seconds, it doesn't matter how good your thumbnail was. YouTube's algorithm relies heavily on Average View Duration to decide whether to push your video to a broader audience.</p>
        <h2>The Hook: Your Most Important 15 Seconds</h2>
        <p>Never start a video with "Hey guys, welcome back to the channel." The modern viewer's attention span is incredibly fragile. Instead, use the AIDA framework built into Janso Studio's Script Architect.</p>
        <blockquote>
          <p>"A great hook visually and verbally confirms that clicking the thumbnail was the right decision."</p>
        </blockquote>
        <h2>Pattern Interrupts: Resetting Attention</h2>
        <p>Even the best content can feel monotonous if the pacing never changes. A pattern interrupt is anything that breaks the rhythm of a video.</p>
      </>
    ),
  },
  {
    slug: "product-update-v2",
    title: "Janso Studio v2.0: Unified Dashboard, New AI Voices, and More",
    excerpt: "Read about our biggest update yet. We've brought Script Architect, Voice Over Studio, and the Viral Clip Creator into a single, seamless workspace for creators.",
    category: "Product",
    date: "Mar 17, 2026",
    readTime: "4 min read",
    author: "Product Team",
    imageUrl: "/images/blog/v2.png",
    authorInitialColor: "from-violet-500 to-fuchsia-600",
    content: (
      <>
        <p className="lead">Today marks the biggest milestone in Janso Studio's history. We are thrilled to announce version 2.0, a complete reimagining of the creator workflow, built entirely around speed, privacy, and seamless integration.</p>
        <h2>What's New in v2.0?</h2>
        <p>We've completely overhauled the interface based on feedback from our early access creators. The solution was a unified, zero-friction dashboard.</p>
        <h2>The 'Bring Your Own Key' Philosophy</h2>
        <p>By using your own Google Gemini API key, you bypass platform rate limits, pay base costs, and keep more control over your workflow.</p>
      </>
    ),
  },
  {
    slug: "youtube-shorts-from-long-videos",
    title: "How to Turn Long Videos into YouTube Shorts Without Re-Editing Everything",
    excerpt: "Learn a practical clip-first workflow for extracting Shorts from long-form content, finding better hooks, and publishing more often without multiplying production time.",
    category: "Growth",
    date: "Mar 21, 2026",
    readTime: "7 min read",
    author: "Janso Growth Team",
    imageUrl: "/images/blog/youtube-shorts.png",
    authorInitialColor: "from-orange-500 to-red-600",
    content: (
      <>
        <p className="lead">Most creators know they should be posting Shorts. The real problem is that Shorts often become an entirely separate production burden.</p>
        <h2>The Better Workflow: Clip from What Already Works</h2>
        <p>Your long-form videos already contain the raw material for short-form growth. Strong reactions, direct opinions, bold claims, and payoff moments can all become standalone clips.</p>
        <h2>What Makes a Great Short Clip?</h2>
        <ul>
          <li><strong>It opens with tension</strong></li>
          <li><strong>It stands alone</strong></li>
          <li><strong>It resolves fast</strong></li>
        </ul>
      </>
    ),
  },
  {
    slug: "byok-gemini-privacy-creators",
    title: "Why BYOK Is Better for Creator Privacy, Control, and Cost",
    excerpt: "Bring Your Own Key is not just an implementation detail. It is a trust signal for creators who want AI power without losing control of privacy or usage costs.",
    category: "Strategy",
    date: "Mar 21, 2026",
    readTime: "5 min read",
    author: "Janso Platform Team",
    imageUrl: "/images/blog/privacy-byok.png",
    authorInitialColor: "from-indigo-500 to-blue-600",
    content: (
      <>
        <p className="lead">Many creators see "Bring Your Own Key" and assume it is a setup hurdle. In reality, BYOK can be one of the strongest trust signals your platform offers.</p>
        <h2>Why Creators Care About BYOK</h2>
        <ul>
          <li><strong>Privacy</strong></li>
          <li><strong>Cost transparency</strong></li>
          <li><strong>Scalability</strong></li>
        </ul>
        <h2>Turning Friction into a Trust Signal</h2>
        <p>Creators do not need less information. They need clearer framing.</p>
      </>
    ),
  },
  {
    slug: "best-ai-youtube-script-generator",
    title: "What Makes the Best AI YouTube Script Generator Actually Useful?",
    excerpt: "The best AI script generator is not the one that writes the most words. It is the one that helps creators ship clearer, stronger videos faster.",
    category: "Strategy",
    date: "Mar 21, 2026",
    readTime: "6 min read",
    author: "Janso Content Team",
    imageUrl: "/images/blog/script-generator.png",
    authorInitialColor: "from-sky-500 to-indigo-600",
    content: (
      <>
        <p className="lead">Most script generators fail because they optimize for length instead of retention. Creators do not need bigger drafts. They need stronger openings, cleaner structure, and better pacing.</p>
        <h2>What to Look For</h2>
        <ul>
          <li>Hook quality</li>
          <li>Framework support</li>
          <li>Natural transitions</li>
          <li>Workflow handoff into voice or production</li>
        </ul>
      </>
    ),
  },
  {
    slug: "youtube-thumbnail-ctr-tips",
    title: "7 Thumbnail CTR Tips You Can Use Before Your Next Upload",
    excerpt: "Improve click-through rate with smarter thumbnail contrast, tighter visual hierarchy, and packaging decisions that support your title instead of fighting it.",
    category: "Growth",
    date: "Mar 21, 2026",
    readTime: "6 min read",
    author: "Janso Growth Team",
    imageUrl: "/images/blog/thumbnail-ctr.png",
    authorInitialColor: "from-pink-500 to-rose-600",
    content: (
      <>
        <p className="lead">A thumbnail does not need to be louder. It needs to be clearer. Better CTR usually comes from faster comprehension, not more visual chaos.</p>
        <h2>The Core Rules</h2>
        <ol>
          <li>Lead with one focal point</li>
          <li>Use fewer overlay words</li>
          <li>Support the title promise</li>
        </ol>
      </>
    ),
  },
  {
    slug: "youtube-seo-for-small-channels",
    title: "YouTube SEO for Small Channels: How to Compete Without Big Authority",
    excerpt: "Small creators do not need to win the biggest keywords. They need to win the right intent clusters, long-tail terms, and semantic angles.",
    category: "Growth",
    date: "Mar 21, 2026",
    readTime: "7 min read",
    author: "Janso SEO Team",
    imageUrl: "/images/blog/seo-small-channels.png",
    authorInitialColor: "from-emerald-500 to-cyan-600",
    content: (
      <>
        <p className="lead">If your channel is small, broad keywords are often a trap. The better move is aligning content to lower-competition search intent you can realistically own.</p>
        <h2>Where Small Channels Win</h2>
        <ul>
          <li>Long-tail queries</li>
          <li>Topic-specific how-to phrases</li>
          <li>Semantic support keywords in scripts and descriptions</li>
        </ul>
      </>
    ),
  },
];

export function getBlogPostBySlug(slug: string) {
  return BLOG_POSTS.find((post) => post.slug === slug) ?? null;
}

export function getRelatedBlogPosts(currentSlug: string, limit = 3) {
  const current = getBlogPostBySlug(currentSlug);
  if (!current) {
    return BLOG_POSTS.slice(0, limit);
  }

  return BLOG_POSTS.filter((post) => post.slug !== currentSlug)
    .sort((a, b) => {
      const scoreA = a.category === current.category ? 1 : 0;
      const scoreB = b.category === current.category ? 1 : 0;
      return scoreB - scoreA;
    })
    .slice(0, limit);
}
