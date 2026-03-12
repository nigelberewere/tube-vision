import { useState, useEffect } from 'react';
import { generateVidVisionInsight } from '../services/geminiService';
import { Type } from '@google/genai';
import { Loader2, MessageSquare, TrendingUp, AlertCircle, CheckCircle, Copy, Check } from 'lucide-react';
import { cn } from '../lib/utils';

interface CommentStrategistProps {
  videoId?: string;
}

interface CommentTheme {
  theme: string;
  frequency: number;
  percentage: number;
  exampleComments: string[];
  sentiment: 'positive' | 'negative' | 'neutral' | 'question';
  draftReply?: string;
}

interface AudienceInsight {
  commonQuestions: string[];
  featureRequests: string[];
  contentIdeas: string[];
  paintPoints: string[];
  emotionalTriggers: string[];
}

interface CommentAnalysisResult {
  totalCommentsAnalyzed: number;
  themesIdentified: number;
  themes: CommentTheme[];
  insights: AudienceInsight;
  nextContentReport: string;
  engagementScore: number;
}

export default function CommentStrategist({ videoId }: CommentStrategistProps) {
  const [selectedVideoId, setSelectedVideoId] = useState(videoId || '');
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<CommentAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [videos, setVideos] = useState<Array<{ id: string; title: string }>>([]);
  const [copied, setCopied] = useState(false);
  const [selectedThemeForReply, setSelectedThemeForReply] = useState<number | null>(null);

  // Load user's recent videos
  useEffect(() => {
    const loadVideos = async () => {
      try {
        const response = await fetch('/api/user/videos?maxResults=10');
        if (response.ok) {
          const data = await response.json();
          const rawVideos = Array.isArray(data) ? data : data.items || [];
          const normalizedVideos = rawVideos
            .map((video: any) => {
              const id = typeof video.id === 'string' ? video.id : video.id?.videoId;
              const title = video.title || video.snippet?.title;
              return id && title ? { id, title } : null;
            })
            .filter((video: { id: string; title: string } | null): video is { id: string; title: string } => Boolean(video));

          setVideos(normalizedVideos);
          if (!selectedVideoId && normalizedVideos[0]) {
            setSelectedVideoId(normalizedVideos[0].id);
          }
        } else if (response.status === 401) {
          setError('Please connect your YouTube account to load videos.');
        } else {
          setError('Failed to load videos for comment analysis.');
        }
      } catch (err) {
        console.error('Failed to load videos:', err);
        setError('Failed to load videos for comment analysis.');
      }
    };

    loadVideos();
  }, []);

  const handleAnalyzeComments = async () => {
    if (!selectedVideoId) {
      setError('Please select a video');
      return;
    }

    setError(null);
    setResult(null);
    setLoading(true);

    try {
      // Fetch comments from the selected video
      const commentsResponse = await fetch(`/api/comments/fetch?videoId=${selectedVideoId}`);
      if (!commentsResponse.ok) {
        throw new Error('Failed to fetch comments');
      }

      const { comments, totalComments } = await commentsResponse.json();

      if (!comments || comments.length === 0) {
        setError('No comments found for this video.');
        setLoading(false);
        return;
      }

      // Analyze comments with AI
      setAnalyzing(true);
      const schema = {
        type: Type.OBJECT,
        properties: {
          themesIdentified: {
            type: Type.NUMBER,
            description: 'Number of distinct themes/topics identified in comments'
          },
          themes: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                theme: { type: Type.STRING, description: 'Name of the theme or topic (e.g., "Performance questions", "Feature requests")' },
                frequency: { type: Type.NUMBER, description: 'How many comments touch on this theme' },
                percentage: { type: Type.NUMBER, description: 'Percentage of comments addressing this theme (0-100)' },
                exampleComments: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: '2-3 representative example comments for this theme'
                },
                sentiment: {
                  type: Type.STRING,
                  enum: ['positive', 'negative', 'neutral', 'question'],
                  description: 'Overall sentiment of comments on this theme'
                },
                draftReply: {
                  type: Type.STRING,
                  description: 'Suggested personalized reply addressing this theme for the creator'
                }
              },
              required: ['theme', 'frequency', 'percentage', 'exampleComments', 'sentiment', 'draftReply']
            }
          },
          insights: {
            type: Type.OBJECT,
            properties: {
              commonQuestions: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: '3-5 most frequently asked questions'
              },
              featureRequests: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'Requested features or improvements mentioned by viewers'
              },
              contentIdeas: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: '3-5 content ideas viewers are asking for'
              },
              paintPoints: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'Problems or pain points viewers mention'
              },
              emotionalTriggers: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: '2-3 topics that generate emotional responses (excitement, frustration, etc.)'
              }
            },
            required: ['commonQuestions', 'featureRequests', 'contentIdeas', 'paintPoints', 'emotionalTriggers']
          },
          nextContentReport: {
            type: Type.STRING,
            description: 'A 3-4 sentence executive summary of what the audience wants next'
          },
          engagementScore: {
            type: Type.NUMBER,
            description: 'Overall engagement quality (1-100). Higher means more engaged audience.'
          }
        },
        required: ['themesIdentified', 'themes', 'insights', 'nextContentReport', 'engagementScore']
      };

      const commentText = comments.map((c: any) => c.textDisplay).join('\n---\n');

      const prompt = `You are Janso Studio's Comment Strategist. Analyze these YouTube comments to identify recurring themes, questions, and content opportunities.

Total comments to analyze: ${comments.length}
Video received: ${totalComments} total comments

Comments:
${commentText}

Your task:
1. Identify 5-8 major themes (topics, questions, feature requests, pain points, praise)
2. For each theme, provide:
   - Exact frequency count
   - Percentage of comments touching this theme
   - 2-3 representative example comments (verbatim)
   - Dominant sentiment (positive/negative/neutral/question)
   - A personalized reply the creator can use or adapt
3. Extract the top 3-5 questions viewers keep asking
4. List specific feature requests or improvement suggestions
5. Identify 3-5 content topics viewers want to see next
6. Note pain points that create frustration
7. Identify emotional triggers that generate high engagement
8. Create an executive summary of "What Your Audience Wants Next"
9. Score overall engagement quality (1-100)

Return ONLY valid JSON matching the schema. Be specific and actionable.`;

      const response = await generateVidVisionInsight(prompt, schema, {
        systemInstruction: 'You are Janso Studio\'s Comment Strategist. Analyze YouTube comments to extract audience insights, recurring questions, and content opportunities. Return only valid JSON.',
      });

      if (response) {
        const parsed = JSON.parse(response);
        setResult({
          ...parsed,
          totalCommentsAnalyzed: comments.length
        });
      }
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'Failed to analyze comments. Please try again.');
    } finally {
      setLoading(false);
      setAnalyzing(false);
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
        <h1 className="text-3xl font-bold tracking-tight text-zinc-100">Comment Strategist</h1>
        <p className="text-zinc-400 mt-2">Analyze viewer comments to find recurring questions, requests, and content opportunities.</p>
      </div>

      {/* Video Selection */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <label className="block text-sm font-medium text-zinc-300 mb-3">
          Select Video to Analyze
        </label>
        <select
          value={selectedVideoId}
          onChange={(e) => setSelectedVideoId(e.target.value)}
          disabled={loading}
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500 disabled:opacity-50"
        >
          <option value="">-- Choose a video --</option>
          {videos.map((video) => (
            <option key={video.id} value={video.id}>
              {video.title}
            </option>
          ))}
        </select>

        <button
          onClick={handleAnalyzeComments}
          disabled={loading || !selectedVideoId}
          className="mt-4 w-full h-12 bg-indigo-500 hover:bg-indigo-600 disabled:bg-indigo-900 disabled:text-zinc-600 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              {analyzing ? 'Analyzing Comments...' : 'Fetching Comments...'}
            </>
          ) : (
            <>
              <MessageSquare className="w-4 h-4" />
              Analyze Comments
            </>
          )}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-300">{error}</p>
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-8">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
              <div className="text-sm text-zinc-400 uppercase tracking-wider font-semibold mb-2">Comments Analyzed</div>
              <div className="text-3xl font-bold text-indigo-400">{result.totalCommentsAnalyzed.toLocaleString()}</div>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
              <div className="text-sm text-zinc-400 uppercase tracking-wider font-semibold mb-2">Themes Found</div>
              <div className="text-3xl font-bold text-amber-400">{result.themesIdentified}</div>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
              <div className="text-sm text-zinc-400 uppercase tracking-wider font-semibold mb-2">Engagement Score</div>
              <div className="text-3xl font-bold text-emerald-400">{result.engagementScore}/100</div>
            </div>
          </div>

          {/* Main Report Section */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <div className="flex items-start gap-3 mb-4">
              <TrendingUp className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <h2 className="text-xl font-bold text-zinc-100">What Your Audience Wants Next</h2>
                <p className="text-zinc-400 text-sm mt-1">Executive summary based on comment analysis</p>
              </div>
            </div>
            <div className="bg-zinc-950 border border-amber-500/20 rounded-lg p-4">
              <p className="text-white leading-relaxed">{result.nextContentReport}</p>
            </div>
          </div>

          {/* Insights Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
            {/* Questions */}
            {result.insights.commonQuestions.length > 0 && (
              <div className="bg-zinc-900 border border-blue-500/20 rounded-xl p-6">
                <h3 className="text-lg font-bold text-blue-400 mb-4 flex items-center gap-2">
                  <MessageSquare className="w-5 h-5" />
                  Top Questions
                </h3>
                <ul className="space-y-2">
                  {result.insights.commonQuestions.map((q, i) => (
                    <li key={i} className="text-sm text-zinc-300 flex items-start gap-2">
                      <span className="text-blue-400 font-semibold">Q:</span>
                      <span>{q}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Feature Requests */}
            {result.insights.featureRequests.length > 0 && (
              <div className="bg-zinc-900 border border-green-500/20 rounded-xl p-6">
                <h3 className="text-lg font-bold text-green-400 mb-4">Feature Requests</h3>
                <ul className="space-y-2">
                  {result.insights.featureRequests.map((f, i) => (
                    <li key={i} className="text-sm text-zinc-300 flex items-start gap-2">
                      <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Content Ideas */}
            {result.insights.contentIdeas.length > 0 && (
              <div className="bg-zinc-900 border border-purple-500/20 rounded-xl p-6">
                <h3 className="text-lg font-bold text-purple-400 mb-4">Content Ideas</h3>
                <ul className="space-y-2">
                  {result.insights.contentIdeas.map((idea, i) => (
                    <li key={i} className="text-sm text-zinc-300 flex items-start gap-2">
                      <span className="text-purple-400 font-semibold">→</span>
                      <span>{idea}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Pain Points */}
            {result.insights.paintPoints.length > 0 && (
              <div className="bg-zinc-900 border border-red-500/20 rounded-xl p-6">
                <h3 className="text-lg font-bold text-red-400 mb-4">Pain Points</h3>
                <ul className="space-y-2">
                  {result.insights.paintPoints.map((p, i) => (
                    <li key={i} className="text-sm text-zinc-300 flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Emotional Triggers */}
            {result.insights.emotionalTriggers.length > 0 && (
              <div className="bg-zinc-900 border border-pink-500/20 rounded-xl p-6 lg:col-span-2">
                <h3 className="text-lg font-bold text-pink-400 mb-4">Emotional Triggers</h3>
                <div className="flex flex-wrap gap-2">
                  {result.insights.emotionalTriggers.map((trigger, i) => (
                    <div
                      key={i}
                      className="text-sm bg-pink-500/20 text-pink-300 px-3 py-1 rounded-full border border-pink-500/30"
                    >
                      {trigger}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Comment Themes with Replies */}
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-zinc-100">Comment Themes & Draft Replies</h2>
            {result.themes.map((theme, i) => {
              const sentimentColor = {
                positive: 'emerald',
                negative: 'red',
                neutral: 'zinc',
                question: 'blue'
              }[theme.sentiment];

              return (
                <div
                  key={i}
                  className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 cursor-pointer hover:border-zinc-700 transition-colors"
                  onClick={() => setSelectedThemeForReply(selectedThemeForReply === i ? null : i)}
                >
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="text-lg font-bold text-zinc-100">{theme.theme}</h3>
                        <span
                          className={cn(
                            'text-xs px-2 py-1 rounded-full font-semibold uppercase tracking-wider',
                            sentimentColor === 'emerald' && 'bg-emerald-500/20 text-emerald-400',
                            sentimentColor === 'red' && 'bg-red-500/20 text-red-400',
                            sentimentColor === 'neutral' && 'bg-zinc-700/50 text-zinc-300',
                            sentimentColor === 'blue' && 'bg-blue-500/20 text-blue-400'
                          )}
                        >
                          {theme.sentiment}
                        </span>
                      </div>
                      <div className="flex gap-4 text-sm text-zinc-400">
                        <span>{theme.frequency} comments</span>
                        <span>{theme.percentage}% of all comments</span>
                      </div>
                    </div>
                  </div>

                  {/* Example Comments */}
                  <div className="mb-4 p-3 bg-zinc-950 border border-zinc-800 rounded-lg">
                    <p className="text-xs text-zinc-500 uppercase tracking-wider font-semibold mb-2">Example Comments</p>
                    <div className="space-y-2">
                      {theme.exampleComments.map((comment, j) => (
                        <p key={j} className="text-sm text-zinc-300 italic">{comment}</p>
                      ))}
                    </div>
                  </div>

                  {/* Expandable Reply */}
                  {selectedThemeForReply === i && (
                    <div className="mt-4 pt-4 border-t border-zinc-800 animate-in fade-in duration-200">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <p className="text-sm font-semibold text-indigo-400 uppercase tracking-wider">Draft Reply</p>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            copyToClipboard(theme.draftReply);
                          }}
                          className="p-1.5 hover:bg-zinc-800 rounded transition-colors"
                          title="Copy reply"
                        >
                          {copied ? (
                            <Check className="w-4 h-4 text-emerald-400" />
                          ) : (
                            <Copy className="w-4 h-4 text-zinc-400" />
                          )}
                        </button>
                      </div>
                      <p className="text-sm text-zinc-200 leading-relaxed bg-zinc-950 border border-indigo-500/20 rounded-lg p-3">
                        {theme.draftReply}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
