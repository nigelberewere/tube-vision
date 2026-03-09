import { useState } from 'react';
import { generateVidVisionInsight } from '../services/geminiService';
import { Type } from '@google/genai';
import { Loader2, Share2, Copy, Check, Twitter, Linkedin, FileText } from 'lucide-react';
import { cn } from '../lib/utils';
import { loadBrandKit } from './BrandKit';

function getBrandVoiceContext(): string {
  const brandKit = loadBrandKit();
  
  return `
BRAND VOICE GUIDELINES (Maintain consistency with these):
- Primary Brand Color: ${brandKit.colors.primary} (reference when discussing brand elements)
- Visual Style: Uses ${brandKit.fonts.heading} for emphasis, ${brandKit.fonts.body} for body text
- Tone: Professional yet approachable, reflecting the brand's color palette

Subtly reflect this brand identity in the content's style and tone.
`.trim();
}

interface TwitterThread {
  tweets: string[];
  totalTweets: number;
  engagementTip: string;
}

interface LinkedInPost {
  headline: string;
  content: string;
  callToAction: string;
  hashtags: string[];
  tone: string;
}

interface BlogArticle {
  title: string;
  excerpt: string;
  sections: Array<{
    heading: string;
    content: string;
  }>;
  conclusion: string;
  wordCount: number;
  readTime: number; // in minutes
}

interface RepurposingResult {
  twitter?: TwitterThread;
  linkedin?: LinkedInPost;
  blog?: BlogArticle;
}

type Format = 'twitter' | 'linkedin' | 'blog';

export default function ContentRepurposer() {
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedFormat, setSelectedFormat] = useState<Format | null>(null);
  const [result, setResult] = useState<RepurposingResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleRepurpose = async (format: Format) => {
    const trimmedInput = inputText.trim();

    if (!trimmedInput) {
      setError('Please enter content to repurpose');
      return;
    }

    if (trimmedInput.length < 100) {
      setError('Content should be at least 100 characters');
      return;
    }

    setError(null);
    setLoading(true);
    setSelectedFormat(format);

    try {
      if (format === 'twitter') {
        await generateTwitterThread(trimmedInput);
      } else if (format === 'linkedin') {
        await generateLinkedInPost(trimmedInput);
      } else if (format === 'blog') {
        await generateBlogArticle(trimmedInput);
      }
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'Failed to repurpose content. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const generateTwitterThread = async (content: string) => {
    const schema = {
      type: Type.OBJECT,
      properties: {
        tweets: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: 'Array of individual tweets, each 280 characters or less. Start with 1/X format. Use conversational tone with personality.'
        },
        totalTweets: {
          type: Type.NUMBER,
          description: 'Total number of tweets in the thread'
        },
        engagementTip: {
          type: Type.STRING,
          description: 'One tip for maximizing engagement with this thread'
        }
      },
      required: ['tweets', 'totalTweets', 'engagementTip']
    };

    const prompt = `Transform this content into a compelling Twitter/X thread.

Rules:
- Each tweet must be exactly 280 characters or under
- Number the tweets (1/N, 2/N, etc.)
- Use natural, conversational language with personality
- Include emojis sparingly but effectively
- Start with a hook that makes people want to read the full thread
- Build momentum and save the best insight for later
- End with a clear call-to-action or thought-provoking question
- Make it shareable and quotable

Content:
${content}

Return ONLY valid JSON matching the schema.`;

    const response = await generateVidVisionInsight(prompt, schema, {
      systemInstruction: 'You are a social media expert. Transform content into engaging Twitter/X threads optimized for maximum engagement and shareability. Each tweet must be 280 characters or less. Return only valid JSON.',
    });

    if (response) {
      const parsed = JSON.parse(response);
      setResult({
        ...result,
        twitter: parsed as TwitterThread
      });
    }
  };

  const generateLinkedInPost = async (content: string) => {
    const schema = {
      type: Type.OBJECT,
      properties: {
        headline: {
          type: Type.STRING,
          description: 'Attention-grabbing headline (5-10 words) that invokes curiosity'
        },
        content: {
          type: Type.STRING,
          description: 'Professional 3-4 paragraph body. Start with a relatable problem or insight, build evidence, deliver value. Professional but conversational tone.'
        },
        callToAction: {
          type: Type.STRING,
          description: 'Clear call-to-action suggesting next steps (visit portfolio, share your thoughts, schedule time, etc.)'
        },
        hashtags: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: '3-5 relevant LinkedIn hashtags'
        },
        tone: {
          type: Type.STRING,
          description: 'Description of the tone used (e.g., "Authoritative but approachable", "Thought-leadership focused")'
        }
      },
      required: ['headline', 'content', 'callToAction', 'hashtags', 'tone']
    };

    const prompt = `Transform this content into a professional LinkedIn post.

Rules:
- Write for professionals and decision-makers
- Start with a compelling hook that works without an image
- Use 3-4 short paragraphs (easier to read on mobile)
- Include at least one insight or data point that's interesting
- Professional tone but conversational (not corporate jargon)
- End with a genuine call-to-action
- Include relevant hashtags that LinkedIn professionals follow
- Optimize for LinkedIn's algorithm: starts with value, builds credibility

Content:
${content}

${getBrandVoiceContext()}

Return ONLY valid JSON matching the schema.`;

    const response = await generateVidVisionInsight(prompt, schema, {
      systemInstruction: 'You are a LinkedIn content strategist. Transform content into professional posts that establish thought leadership and drive engagement. Return only valid JSON.',
    });

    if (response) {
      const parsed = JSON.parse(response);
      setResult({
        ...result,
        linkedin: parsed as LinkedInPost
      });
    }
  };

  const generateBlogArticle = async (content: string) => {
    const schema = {
      type: Type.OBJECT,
      properties: {
        title: {
          type: Type.STRING,
          description: 'SEO-friendly blog title (5-8 words, includes main keyword)'
        },
        excerpt: {
          type: Type.STRING,
          description: '2-3 sentence summary that hooks readers and explains what they\'ll learn'
        },
        sections: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              heading: { type: Type.STRING, description: 'Section heading (H2 level)' },
              content: { type: Type.STRING, description: 'Detailed section content with 3-5 paragraphs, practical examples, and specific takeaways' }
            },
            required: ['heading', 'content']
          },
          description: '4-6 main content sections building knowledge progressively'
        },
        conclusion: {
          type: Type.STRING,
          description: 'Wrap-up section that reinforces key points and suggests next steps'
        },
        wordCount: {
          type: Type.NUMBER,
          description: 'Approximate total word count of the full article'
        },
        readTime: {
          type: Type.NUMBER,
          description: 'Estimated reading time in minutes (based on 200 words per minute)'
        }
      },
      required: ['title', 'excerpt', 'sections', 'conclusion', 'wordCount', 'readTime']
    };

    const prompt = `Transform this content into a comprehensive blog article.

Rules:
- Title should be SEO-friendly and include the main keyword naturally
- Write for readers searching for this topic (answer their main questions)
- Organize content into 4-6 logical sections
- Each section should have:
  * Clear H2 heading
  * 3-5 paragraphs explaining the concept
  * Practical examples or case studies
  * Specific takeaways
- Use short paragraphs (2-3 sentences max) for readability
- Include data, quotes, or expert insights where relevant
- Write in a friendly but authoritative tone
- Add a strong conclusion that reinforces learning and suggests next steps
- Target 1500-2500 words total

Content:
${content}

${getBrandVoiceContext()}

Return ONLY valid JSON matching the schema.`;

    const response = await generateVidVisionInsight(prompt, schema, {
      systemInstruction: 'You are an SEO-focused content writer. Transform content into engaging, well-structured blog articles optimized for search and reader engagement. Return only valid JSON.',
    });

    if (response) {
      const parsed = JSON.parse(response);
      setResult({
        ...result,
        blog: parsed as BlogArticle
      });
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-zinc-100">Content Repurposer</h1>
        <p className="text-zinc-400 mt-2">Transform long-form content into Twitter threads, LinkedIn posts, and blog articles.</p>
      </div>

      {/* Input Section */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <label className="block text-sm font-medium text-zinc-300 mb-3">
          Content to Repurpose
        </label>
        <textarea
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          disabled={loading}
          placeholder="Paste your long-form script, article, or content here..."
          className="w-full h-64 bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white placeholder-zinc-500 resize-none focus:outline-none focus:border-indigo-500 disabled:opacity-50"
        />
        <div className="mt-3 text-sm text-zinc-500">
          {inputText.length} characters • {Math.ceil(inputText.split(/\s+/).length)} words
        </div>

        {/* Format Buttons */}
        <div className="mt-6 space-y-3">
          <p className="text-sm font-medium text-zinc-300">Choose format:</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <button
              onClick={() => handleRepurpose('twitter')}
              disabled={loading || inputText.trim().length < 100}
              className={cn(
                "p-4 rounded-lg border-2 transition-all flex flex-col items-center justify-center gap-2 text-center",
                selectedFormat === 'twitter' && loading
                  ? "border-blue-500 bg-blue-500/10"
                  : "border-zinc-700 hover:border-blue-500/50 bg-zinc-800 hover:bg-zinc-700/50 disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              <Twitter className="w-5 h-5 text-blue-400" />
              <span className="font-medium text-zinc-100">Twitter/X Thread</span>
              <span className="text-xs text-zinc-400">Multiple tweets</span>
            </button>

            <button
              onClick={() => handleRepurpose('linkedin')}
              disabled={loading || inputText.trim().length < 100}
              className={cn(
                "p-4 rounded-lg border-2 transition-all flex flex-col items-center justify-center gap-2 text-center",
                selectedFormat === 'linkedin' && loading
                  ? "border-blue-600 bg-blue-600/10"
                  : "border-zinc-700 hover:border-blue-600/50 bg-zinc-800 hover:bg-zinc-700/50 disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              <Linkedin className="w-5 h-5 text-blue-600" />
              <span className="font-medium text-zinc-100">LinkedIn Post</span>
              <span className="text-xs text-zinc-400">Professional tone</span>
            </button>

            <button
              onClick={() => handleRepurpose('blog')}
              disabled={loading || inputText.trim().length < 100}
              className={cn(
                "p-4 rounded-lg border-2 transition-all flex flex-col items-center justify-center gap-2 text-center",
                selectedFormat === 'blog' && loading
                  ? "border-amber-500 bg-amber-500/10"
                  : "border-zinc-700 hover:border-amber-500/50 bg-zinc-800 hover:bg-zinc-700/50 disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              <FileText className="w-5 h-5 text-amber-400" />
              <span className="font-medium text-zinc-100">Blog Article</span>
              <span className="text-xs text-zinc-400">1500+ words</span>
            </button>
          </div>
        </div>

        {loading && (
          <div className="mt-4 p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-lg flex items-center gap-2 text-sm text-indigo-300">
            <Loader2 className="w-4 h-4 animate-spin" />
            Transforming your content...
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-8">
          {/* Twitter Thread */}
          {result.twitter && (
            <div className="bg-zinc-900 border border-blue-500/30 rounded-xl p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <Twitter className="w-6 h-6 text-blue-400" />
                  <div>
                    <h2 className="text-xl font-bold text-zinc-100">Twitter/X Thread</h2>
                    <p className="text-sm text-zinc-400">{result.twitter.totalTweets} tweets</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    const threadText = result.twitter!.tweets.join('\n\n');
                    copyToClipboard(threadText);
                  }}
                  className="p-2 hover:bg-zinc-800 rounded-lg transition-colors"
                  title="Copy all tweets"
                >
                  {copied ? (
                    <Check className="w-5 h-5 text-emerald-400" />
                  ) : (
                    <Copy className="w-5 h-5 text-zinc-400" />
                  )}
                </button>
              </div>

              <div className="space-y-3 mb-4">
                {result.twitter.tweets.map((tweet, i) => (
                  <div key={i} className="bg-zinc-950 border border-blue-500/20 rounded-lg p-4">
                    <p className="text-sm text-zinc-300">{tweet}</p>
                  </div>
                ))}
              </div>

              <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                <p className="text-xs font-semibold text-blue-400 uppercase tracking-wider mb-1">Engagement Tip</p>
                <p className="text-sm text-blue-200">{result.twitter.engagementTip}</p>
              </div>
            </div>
          )}

          {/* LinkedIn Post */}
          {result.linkedin && (
            <div className="bg-zinc-900 border border-blue-600/30 rounded-xl p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <Linkedin className="w-6 h-6 text-blue-600" />
                  <div>
                    <h2 className="text-xl font-bold text-zinc-100">LinkedIn Post</h2>
                    <p className="text-sm text-zinc-400">{result.linkedin.tone}</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    const postText = `${result.linkedin!.headline}\n\n${result.linkedin!.content}\n\n${result.linkedin!.callToAction}\n\n${result.linkedin!.hashtags.join(' ')}`;
                    copyToClipboard(postText);
                  }}
                  className="p-2 hover:bg-zinc-800 rounded-lg transition-colors"
                  title="Copy post"
                >
                  {copied ? (
                    <Check className="w-5 h-5 text-emerald-400" />
                  ) : (
                    <Copy className="w-5 h-5 text-zinc-400" />
                  )}
                </button>
              </div>

              <div className="bg-zinc-950 border border-blue-600/20 rounded-lg p-6">
                <h3 className="text-lg font-bold text-white mb-4">{result.linkedin.headline}</h3>
                <p className="text-zinc-300 leading-relaxed mb-4 whitespace-pre-wrap">{result.linkedin.content}</p>
                <p className="text-blue-400 font-medium mb-4">{result.linkedin.callToAction}</p>
                <div className="flex flex-wrap gap-2">
                  {result.linkedin.hashtags.map((tag, i) => (
                    <span key={i} className="text-xs text-blue-400 bg-blue-500/10 px-2 py-1 rounded">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Blog Article */}
          {result.blog && (
            <div className="bg-zinc-900 border border-amber-500/30 rounded-xl p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <FileText className="w-6 h-6 text-amber-400" />
                  <div>
                    <h2 className="text-xl font-bold text-zinc-100">Blog Article</h2>
                    <p className="text-sm text-zinc-400">
                      {result.blog.wordCount.toLocaleString()} words • {result.blog.readTime} min read
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    let articleText = `# ${result.blog!.title}\n\n${result.blog!.excerpt}\n\n`;
                    result.blog!.sections.forEach((section) => {
                      articleText += `## ${section.heading}\n\n${section.content}\n\n`;
                    });
                    articleText += `## Conclusion\n\n${result.blog!.conclusion}`;
                    copyToClipboard(articleText);
                  }}
                  className="p-2 hover:bg-zinc-800 rounded-lg transition-colors"
                  title="Copy article"
                >
                  {copied ? (
                    <Check className="w-5 h-5 text-emerald-400" />
                  ) : (
                    <Copy className="w-5 h-5 text-zinc-400" />
                  )}
                </button>
              </div>

              <div className="space-y-6">
                {/* Title and Excerpt */}
                <div>
                  <h1 className="text-2xl md:text-3xl font-bold text-zinc-100 mb-3">{result.blog.title}</h1>
                  <p className="text-lg text-zinc-400 italic">{result.blog.excerpt}</p>
                </div>

                {/* Sections */}
                {result.blog.sections.map((section, i) => (
                  <div key={i} className="border-l-2 border-amber-500/30 pl-6">
                    <h2 className="text-xl font-bold text-amber-400 mb-3">{section.heading}</h2>
                    <p className="text-zinc-300 leading-relaxed whitespace-pre-wrap">{section.content}</p>
                  </div>
                ))}

                {/* Conclusion */}
                <div className="border-t border-zinc-700 pt-6">
                  <h2 className="text-xl font-bold text-zinc-100 mb-3">Conclusion</h2>
                  <p className="text-zinc-300 leading-relaxed whitespace-pre-wrap">{result.blog.conclusion}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
