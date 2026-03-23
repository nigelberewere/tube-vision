import fs from "node:fs";
import path from "node:path";

const distDir = path.resolve("dist");
const baseIndexPath = path.join(distDir, "index.html");

if (!fs.existsSync(baseIndexPath)) {
  throw new Error(`Base HTML not found at ${baseIndexPath}`);
}

const baseHtml = fs.readFileSync(baseIndexPath, "utf8");

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function setTagContent(html, pattern, replacement) {
  return html.replace(pattern, replacement);
}

function replaceMeta(html, selector, content) {
  return html.replace(selector, content);
}

function replacePrerenderContent(html, content) {
  const prerenderPattern = /<div id="seo-prerender">[\s\S]*?<\/div>/;

  if (!prerenderPattern.test(html)) {
    throw new Error("Could not locate prerender container in built HTML.");
  }

  return html.replace(prerenderPattern, `<div id="seo-prerender">\n${content}\n    </div>`);
}

function linkList(items) {
  return `<ul>${items
    .map((item) => `<li><a href="${item.href}">${escapeHtml(item.label)}</a></li>`)
    .join("")}</ul>`;
}

function paragraphList(items) {
  return items.map((item) => `<p>${escapeHtml(item)}</p>`).join("\n");
}

function bulletList(items) {
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function sectionHtml(section) {
  const parts = [`<section>`, `<h2>${escapeHtml(section.heading)}</h2>`];

  if (section.paragraphs?.length) {
    parts.push(paragraphList(section.paragraphs));
  }

  if (section.bullets?.length) {
    parts.push(bulletList(section.bullets));
  }

  if (section.links?.length) {
    parts.push(linkList(section.links));
  }

  parts.push(`</section>`);
  return parts.join("\n");
}

function pageBody(route) {
  const sections = route.sections.map(sectionHtml).join("\n");
  const imageBlock = route.image
    ? `<img src="${route.image.src}" alt="${escapeHtml(route.image.alt)}" width="${route.image.width}" height="${route.image.height}" />`
    : "";

  return `      <main>
        <header>
          <nav aria-label="Primary">
            <a href="/">Janso Studio</a>
            <a href="/features/analytics-dashboard">Analytics Dashboard</a>
            <a href="/features/script-architect">Script Architect</a>
            <a href="/features/youtube-seo">YouTube SEO</a>
            <a href="/blog">Blog</a>
            <a href="/contact">Contact</a>
          </nav>
          <h1>${escapeHtml(route.heading)}</h1>
          <p>${escapeHtml(route.description)}</p>
          ${imageBlock}
          <p><a href="https://app.janso.studio/">Open the dashboard</a></p>
        </header>
${sections}
      </main>`;
}

function renderRoute(route) {
  let html = baseHtml;
  const absoluteUrl = `https://janso.studio${route.path === "/" ? "/" : route.path}`;

  html = setTagContent(html, /<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(route.title)}</title>`);
  html = replaceMeta(
    html,
    /<meta\s+name="description"\s+content="[^"]*"\s*\/>/,
    `<meta name="description" content="${escapeHtml(route.description)}" />`,
  );
  html = replaceMeta(
    html,
    /<meta\s+property="og:url"\s+content="[^"]*"\s*\/>/,
    `<meta property="og:url" content="${absoluteUrl}" />`,
  );
  html = replaceMeta(
    html,
    /<meta\s+property="og:title"\s+content="[^"]*"\s*\/>/,
    `<meta property="og:title" content="${escapeHtml(route.title)}" />`,
  );
  html = replaceMeta(
    html,
    /<meta\s+property="og:description"\s+content="[^"]*"\s*\/>/,
    `<meta property="og:description" content="${escapeHtml(route.description)}" />`,
  );
  html = replaceMeta(
    html,
    /<meta\s+name="twitter:title"\s+content="[^"]*"\s*\/>/,
    `<meta name="twitter:title" content="${escapeHtml(route.title)}" />`,
  );
  html = replaceMeta(
    html,
    /<meta\s+name="twitter:description"\s+content="[^"]*"\s*\/>/,
    `<meta name="twitter:description" content="${escapeHtml(route.description)}" />`,
  );
  html = replaceMeta(
    html,
    /<link\s+rel="canonical"\s+href="[^"]*"\s*\/>/,
    `<link rel="canonical" href="${absoluteUrl}" />`,
  );
  html = replacePrerenderContent(html, pageBody(route));

  return html;
}

function routeDir(routePath) {
  if (routePath === "/") {
    return distDir;
  }

  return path.join(distDir, routePath.replace(/^\/+/, ""));
}

const featureRoutes = [
  {
    path: "/features/analytics-dashboard",
    title: "YouTube Analytics Dashboard for Creators | Janso Studio",
    heading: "YouTube analytics dashboards built for creator decisions",
    description: "Track channel momentum, publishing patterns, and creator performance signals in a dashboard designed to turn analytics into action.",
    image: { src: "/og.png", alt: "Janso Studio analytics dashboard preview", width: 1200, height: 630 },
    sections: [
      {
        heading: "What you can do",
        paragraphs: [
          "Review growth momentum, recent performance, and creator workflow context from the same workspace you use for scripting, ideas, and SEO.",
        ],
        bullets: [
          "Track channel growth and publishing feedback loops",
          "Review creator-friendly metrics instead of dashboard noise",
          "Move from analysis into scripts, ideas, clips, or SEO quickly",
        ],
      },
      {
        heading: "Explore related pages",
        links: [
          { href: "/features/script-architect", label: "AI Script Architect" },
          { href: "/features/youtube-seo", label: "YouTube SEO" },
          { href: "/blog", label: "Growth Hub blog" },
        ],
      },
    ],
  },
  {
    path: "/features/script-architect",
    title: "AI Script Architect | YouTube Script Generator | Janso Studio",
    heading: "Write stronger YouTube scripts with less friction",
    description: "Generate retention-aware YouTube scripts with hooks, frameworks, pacing support, and workflow handoff into the rest of your creator stack.",
    sections: [
      {
        heading: "Why creators use it",
        bullets: [
          "Generate hooks and full script structures quickly",
          "Use AIDA, PAS, storytelling, and tutorial frameworks",
          "Write scripts that support retention and clearer pacing",
        ],
      },
      {
        heading: "Related workflow",
        links: [
          { href: "/features/voice-over-studio", label: "Voice Over Studio" },
          { href: "/features/video-idea-generator", label: "Video Idea Generator" },
        ],
      },
    ],
  },
  {
    path: "/features/youtube-seo",
    title: "YouTube SEO and Keyword Research Tool | Janso Studio",
    heading: "YouTube SEO and keyword research for creators",
    description: "Optimize titles, descriptions, tags, and semantic keyword coverage with creator-focused YouTube SEO workflows.",
    sections: [
      {
        heading: "SEO workflow",
        bullets: [
          "Research discoverable keyword opportunities",
          "Improve titles, descriptions, and support keywords",
          "Find competitor gaps and search-driven content angles",
        ],
      },
      {
        heading: "Related reading",
        links: [
          { href: "/blog/youtube-keyword-research-gemini", label: "Trending YouTube keyword research" },
          { href: "/blog/youtube-seo-for-small-channels", label: "SEO for small channels" },
        ],
      },
    ],
  },
  {
    path: "/features/viral-clip-creator",
    title: "Viral Clip Creator | Turn Long Videos into Shorts | Janso Studio",
    heading: "Turn long-form videos into publishable short clips",
    description: "Extract clips, identify hooks, and build a repurposing workflow for Shorts and other short-form channels.",
    sections: [
      {
        heading: "Clip-first publishing",
        bullets: [
          "Repurpose long-form content into short clips",
          "Find stronger hooks and high-tension moments",
          "Publish more often without multiplying editing time",
        ],
      },
      {
        heading: "Related reading",
        links: [
          { href: "/blog/youtube-shorts-from-long-videos", label: "How to turn long videos into Shorts" },
          { href: "/features/analytics-dashboard", label: "Analytics Dashboard" },
        ],
      },
    ],
  },
  {
    path: "/features/voice-over-studio",
    title: "AI Voice Over Studio for YouTube | Janso Studio",
    heading: "Generate AI voiceovers for creator workflows",
    description: "Create expressive voiceovers with tone, pacing, and creator-friendly workflow handoff from scripts to production.",
    sections: [
      {
        heading: "Voice workflow",
        bullets: [
          "Generate narration quickly from written scripts",
          "Control tone, pacing, and production flow",
          "Use voiceovers in faceless, educational, and explainer formats",
        ],
      },
    ],
  },
  {
    path: "/features/thumbnail-studio",
    title: "AI YouTube Thumbnail Studio and CTR Planning | Janso Studio",
    heading: "Plan thumbnails around click intent and CTR",
    description: "Sharpen YouTube thumbnail direction with better contrast, hierarchy, and title-thumbnail alignment before you publish.",
    sections: [
      {
        heading: "Thumbnail planning",
        bullets: [
          "Compare concept directions before design work",
          "Improve visual hierarchy and click intent alignment",
          "Use clearer packaging decisions to support CTR",
        ],
      },
      {
        heading: "Related reading",
        links: [
          { href: "/blog/youtube-thumbnail-ctr-tips", label: "Thumbnail CTR tips" },
        ],
      },
    ],
  },
  {
    path: "/features/ai-youtube-coach",
    title: "AI YouTube Coach for Creators | Janso Studio",
    heading: "Get creator strategy support on demand",
    description: "Use the AI YouTube Coach to pressure-test ideas, refine channel direction, and turn questions into practical next steps.",
    sections: [
      {
        heading: "What the coach helps with",
        bullets: [
          "Packaging and growth questions",
          "Publishing decisions and strategy refinement",
          "Turning broad ideas into concrete creator next steps",
        ],
      },
    ],
  },
  {
    path: "/features/video-idea-generator",
    title: "YouTube Video Idea Generator for Creators | Janso Studio",
    heading: "Generate stronger video ideas and content angles",
    description: "Build a repeatable content pipeline with topic ideas, hooks, and direction for creator-led YouTube publishing.",
    sections: [
      {
        heading: "Idea generation workflow",
        bullets: [
          "Generate topics from niches, trends, and audience intent",
          "Create hooks and directions that lead into scripting",
          "Save promising ideas for a more durable content system",
        ],
      },
    ],
  },
];

const guideRoutes = [
  {
    path: "/guides/api-setup",
    title: "Gemini API Key Setup Guide | Janso Studio",
    heading: "Set up your Gemini API key for Janso Studio",
    description: "Follow the BYOK setup process for Gemini so you can use Janso Studio with more privacy, control, and workflow flexibility.",
    sections: [
      {
        heading: "What this guide covers",
        bullets: [
          "Why Janso Studio uses BYOK",
          "How to get a Gemini API key",
          "How to use your key safely in the app",
        ],
      },
    ],
  },
  {
    path: "/guides/platform-workflow",
    title: "How Janso Studio Works | Platform Workflow Guide",
    heading: "See the full creator workflow from idea to upload",
    description: "Understand how creators move from ideas to scripts, voiceovers, clips, SEO, and analytics inside Janso Studio.",
    sections: [
      {
        heading: "Workflow stages",
        bullets: [
          "Generate ideas and validate content direction",
          "Write scripts and create production assets",
          "Optimize SEO and review analytics feedback loops",
        ],
      },
    ],
  },
];

const useCaseRoutes = [
  {
    path: "/use-cases/educators",
    title: "AI YouTube Tools for Educators and Tutorial Channels | Janso Studio",
    heading: "Tools for educators and tutorial creators",
    description: "See how educators use Janso Studio for lesson scripting, accessibility-friendly voiceovers, and discoverable YouTube content.",
    sections: [
      {
        heading: "Common educator workflows",
        bullets: [
          "Structure tutorials for retention and clarity",
          "Use voiceovers for accessibility and multilingual reach",
          "Improve tutorial discoverability with YouTube SEO",
        ],
      },
    ],
  },
  {
    path: "/use-cases/gaming",
    title: "AI YouTube Tools for Gaming Creators | Janso Studio",
    heading: "Tools for gaming creators and streamers",
    description: "Use Janso Studio for highlight extraction, clip workflows, scripting, and faster publishing across gaming formats.",
    sections: [
      {
        heading: "Gaming creator workflows",
        bullets: [
          "Extract highlights from long streams",
          "Turn gameplay moments into clip libraries",
          "Support channel packaging and publishing systems",
        ],
      },
    ],
  },
  {
    path: "/use-cases/faceless",
    title: "AI YouTube Tools for Faceless Channels | Janso Studio",
    heading: "Tools for faceless YouTube channels",
    description: "Build faceless YouTube workflows with AI scripting, idea generation, voiceovers, and creator SEO support.",
    sections: [
      {
        heading: "Faceless channel workflows",
        bullets: [
          "Generate ideas and scripts at scale",
          "Create voiceovers without recording audio manually",
          "Support discoverability with SEO and keyword workflows",
        ],
      },
    ],
  },
];

const blogPosts = [
  {
    slug: "youtube-keyword-research-gemini",
    title: "How to Find Trending YouTube Keywords Before Your Competitors",
    excerpt: "Learn how creators can find search-driven opportunities with better keyword research and semantic SEO workflows.",
  },
  {
    slug: "structuring-scripts-retention",
    title: "The Anatomy of a High-Retention YouTube Script",
    excerpt: "Explore script structures, hooks, and pacing decisions that improve retention instead of just adding more words.",
  },
  {
    slug: "product-update-v2",
    title: "Janso Studio v2.0: Unified Dashboard, New AI Voices, and More",
    excerpt: "Read about a major Janso Studio update focused on workflow, speed, and creator operations.",
  },
  {
    slug: "youtube-shorts-from-long-videos",
    title: "How to Turn Long Videos into YouTube Shorts Without Re-Editing Everything",
    excerpt: "Use a clip-first workflow to repurpose long-form videos into Shorts and other short-form content.",
  },
  {
    slug: "byok-gemini-privacy-creators",
    title: "Why BYOK Is Better for Creator Privacy, Control, and Cost",
    excerpt: "Understand why Bring Your Own Key matters for creator privacy, cost transparency, and workflow control.",
  },
  {
    slug: "best-ai-youtube-script-generator",
    title: "What Makes the Best AI YouTube Script Generator Actually Useful?",
    excerpt: "See what separates useful creator writing tools from generic AI draft generators.",
  },
  {
    slug: "youtube-thumbnail-ctr-tips",
    title: "7 Thumbnail CTR Tips You Can Use Before Your Next Upload",
    excerpt: "Improve click-through rate with clearer visual hierarchy, contrast, and thumbnail-title alignment.",
  },
  {
    slug: "youtube-seo-for-small-channels",
    title: "YouTube SEO for Small Channels: How to Compete Without Big Authority",
    excerpt: "Learn how small channels can win with long-tail intent, semantic support terms, and right-sized keyword targets.",
  },
];

const blogRoutes = [
  {
    path: "/blog",
    title: "YouTube Growth Blog for Creators | Janso Studio",
    heading: "Growth-focused articles for YouTube creators",
    description: "Read creator-focused articles about YouTube SEO, scripting, Shorts, packaging, BYOK, and workflow systems.",
    sections: [
      {
        heading: "Recent articles",
        links: blogPosts.map((post) => ({ href: `/blog/${post.slug}`, label: post.title })),
      },
    ],
  },
  ...blogPosts.map((post) => ({
    path: `/blog/${post.slug}`,
    title: `${post.title} | Janso Studio Blog`,
    heading: post.title,
    description: post.excerpt,
    sections: [
      {
        heading: "Article summary",
        paragraphs: [post.excerpt],
      },
      {
        heading: "Keep exploring",
        links: [
          { href: "/blog", label: "Back to the Growth Hub" },
          { href: "/features/youtube-seo", label: "Explore YouTube SEO" },
          { href: "/features/script-architect", label: "Explore Script Architect" },
        ],
      },
    ],
  })),
];

const standaloneRoutes = [
  {
    path: "/about",
    title: "About Janso Studio | Creator-Focused AI YouTube Platform",
    heading: "About Janso Studio",
    description: "Learn about the vision, privacy-first principles, and creator workflow focus behind Janso Studio.",
    sections: [
      {
        heading: "What Janso Studio is built for",
        bullets: [
          "A unified creator workspace for YouTube growth",
          "Privacy-first tools that reduce busywork",
          "Faster decisions across scripts, SEO, clips, and analytics",
        ],
      },
    ],
  },
  {
    path: "/faq",
    title: "Janso Studio FAQ | Privacy, BYOK, and Creator Workflow Questions",
    heading: "Frequently asked questions about Janso Studio",
    description: "Read answers about privacy, BYOK setup, browser-side processing, exports, costs, and creator workflow questions.",
    sections: [
      {
        heading: "Popular topics",
        bullets: [
          "How browser-side processing works",
          "How BYOK and privacy are handled",
          "How creators export scripts, clips, and other output",
        ],
      },
    ],
  },
  {
    path: "/contact",
    title: "Contact Janso Studio | Support, Feedback, and Feature Requests",
    heading: "Contact Janso Studio",
    description: "Reach out with support questions, bug reports, feature ideas, or creator workflow feedback.",
    sections: [
      {
        heading: "Ways to use this page",
        bullets: [
          "Send support requests and product questions",
          "Report bugs or confusing workflow issues",
          "Share feature ideas and creator feedback",
        ],
      },
    ],
  },
  {
    path: "/free-tools",
    title: "Free YouTube Idea and Keyword Tools | Janso Studio",
    heading: "Free tools for YouTube creators",
    description: "Explore free creator tools for YouTube ideas, keyword discovery, and early-stage content planning.",
    sections: [
      {
        heading: "What you can explore",
        bullets: [
          "Idea generation support",
          "Keyword and topic exploration",
          "Lightweight creator workflow utilities",
        ],
      },
    ],
  },
];

const routes = [...featureRoutes, ...guideRoutes, ...useCaseRoutes, ...blogRoutes, ...standaloneRoutes];

for (const route of routes) {
  const html = renderRoute(route);
  const targetDir = routeDir(route.path);
  fs.mkdirSync(targetDir, { recursive: true });
  fs.writeFileSync(path.join(targetDir, "index.html"), html, "utf8");
}

console.log(`Prerendered ${routes.length} routes.`);
