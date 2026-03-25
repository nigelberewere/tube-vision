import { useState, useEffect, useMemo } from 'react';
import { generateVidVisionInsight } from '../services/geminiService';
import { Type } from '@google/genai';
import { Loader2, MessageSquare, TrendingUp, AlertCircle, CheckCircle, Copy, Check, Search } from 'lucide-react';
import { fetchCachedJson } from '../lib/apiFetch';
import { cn } from '../lib/utils';
import { parseApiErrorResponse } from '../lib/youtubeApiErrors';

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

interface VideoOption {
  id: string;
  title: string;
  thumbnailUrl: string;
  publishedAt: string;
  commentCount: number;
}

function formatPublishedDate(value: string): string {
  if (!value) {
    return 'Recent upload';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'Recent upload';
  }

  return parsed.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function CommentStrategist({ videoId }: CommentStrategistProps) {
  const [selectedVideoId, setSelectedVideoId] = useState(videoId || '');
  const [loading, setLoading] = useState(false);
  const [loadingVideos, setLoadingVideos] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<CommentAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [videos, setVideos] = useState<VideoOption[]>([]);
  const [videoSearchQuery, setVideoSearchQuery] = useState('');
  const [copied, setCopied] = useState(false);
  const [selectedThemeForReply, setSelectedThemeForReply] = useState<number | null>(null);

  // Load user's recent videos
  useEffect(() => {
    const loadVideos = async () => {
      setLoadingVideos(true);
      try {
        const response = await fetchCachedJson<any>('/api/user/videos?maxResults=10', { ttlMs: 5 * 60 * 1000 });
        if (response.ok) {
          const data = response.data;
          const rawVideos = Array.isArray(data) ? data : data.items || [];
          const normalizedVideos = rawVideos
            .map((video: any) => {
              const id = typeof video.id === 'string' ? video.id : video.id?.videoId;
              const title = video.title || video.snippet?.title;
              const thumbnailUrl = video.snippet?.thumbnails?.medium?.url || video.snippet?.thumbnails?.high?.url || video.snippet?.thumbnails?.default?.url || '';
              const publishedAt = typeof video.snippet?.publishedAt === 'string' ? video.snippet.publishedAt : '';
              const parsedCommentCount = Number(video.statistics?.commentCount ?? 0);
              const commentCount = Number.isFinite(parsedCommentCount) ? parsedCommentCount : 0;

              return id && title ? { id, title, thumbnailUrl, publishedAt, commentCount } : null;
            })
            .filter((video: VideoOption | null): video is VideoOption => Boolean(video));

          setVideos(normalizedVideos);
          if (!selectedVideoId && normalizedVideos[0]) {
            setSelectedVideoId(normalizedVideos[0].id);
          }
        } else if (response.status === 401) {
          setError('Please connect your YouTube account to load videos.');
        } else {
          const message = await parseApiErrorResponse(response.response, 'Failed to load videos for comment analysis.');
          setError(message);
        }
      } catch (err) {
        console.error('Failed to load videos:', err);
        setError('Failed to load videos for comment analysis.');
      } finally {
        setLoadingVideos(false);
      }
    };

    loadVideos();
  }, []);

  const filteredVideos = useMemo(() => {
    const normalizedQuery = videoSearchQuery.trim().toLowerCase();
    if (!normalizedQuery) {
      return videos;
    }

    return videos.filter((video) => video.title.toLowerCase().includes(normalizedQuery));
  }, [videoSearchQuery, videos]);

  const selectedVideo = useMemo(
    () => videos.find((video) => video.id === selectedVideoId) || null,
    [videos, selectedVideoId],
  );

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
        const message = await parseApiErrorResponse(commentsResponse, 'Failed to fetch comments.');
        throw new Error(message);
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
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <label className="block text-sm font-medium text-zinc-200">
              Choose the video whose comments you want to analyze
            </label>
            <p className="mt-1 text-sm text-zinc-400">
              Search your recent uploads, then click a video card to lock in the selection.
            </p>
          </div>
          <div className="inline-flex items-center rounded-full border border-zinc-700 bg-zinc-950 px-3 py-1 text-xs font-semibold text-zinc-300">
            {videos.length} recent upload{videos.length === 1 ? '' : 's'}
          </div>
        </div>

        <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={16} />
              <input
                type="search"
                value={videoSearchQuery}
                onChange={(e) => setVideoSearchQuery(e.target.value)}
                placeholder="Search recent videos by title..."
                disabled={loading || loadingVideos}
                className="w-full rounded-xl border border-zinc-700 bg-zinc-950 pl-10 pr-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 disabled:opacity-50"
              />
            </div>

            <div className="flex items-center justify-between text-xs text-zinc-500">
              <span>{filteredVideos.length} visible</span>
              <span>{selectedVideo ? '1 selected' : 'No video selected'}</span>
            </div>

            <div className="max-h-[28rem] overflow-y-auto pr-1 space-y-3">
              {loadingVideos ? (
                <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 px-4 py-8 text-sm text-zinc-400 flex items-center justify-center gap-3">
                  <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                  Loading your recent uploads...
                </div>
              ) : filteredVideos.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-zinc-700 bg-zinc-950/40 px-4 py-8 text-center">
                  <p className="text-sm font-medium text-zinc-200">No videos match that search.</p>
                  <p className="mt-1 text-xs text-zinc-500">Try a different keyword or clear the search field.</p>
                </div>
              ) : (
                filteredVideos.map((video) => {
                  const isSelected = video.id === selectedVideoId;

                  return (
                    <button
                      key={video.id}
                      type="button"
                      onClick={() => setSelectedVideoId(video.id)}
                      aria-pressed={isSelected}
                      className={cn(
                        'w-full rounded-2xl border px-3 py-3 text-left transition-all',
                        'flex items-start gap-3 bg-zinc-950/70 hover:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/40',
                        isSelected
                          ? 'border-indigo-400/70 bg-indigo-500/10 shadow-[0_0_0_1px_rgba(99,102,241,0.25)]'
                          : 'border-zinc-800 hover:border-zinc-700'
                      )}
                    >
                      <div className="w-24 shrink-0 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 aspect-video">
                        {video.thumbnailUrl ? (
                          <img src={video.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-900 text-xs font-semibold text-zinc-500">
                            Video
                          </div>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <p className="line-clamp-2 text-sm font-semibold text-zinc-100">{video.title}</p>
                          <span
                            className={cn(
                              'shrink-0 rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.18em]',
                              isSelected
                                ? 'border-indigo-400/50 bg-indigo-500/20 text-indigo-200'
                                : 'border-zinc-700 bg-zinc-900 text-zinc-500'
                            )}
                          >
                            {isSelected ? 'Selected' : 'Pick'}
                          </span>
                        </div>

                        <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-zinc-400">
                          <span className="rounded-full bg-zinc-900 px-2 py-1">{formatPublishedDate(video.publishedAt)}</span>
                          <span className="rounded-full bg-zinc-900 px-2 py-1">{video.commentCount.toLocaleString()} comments</span>
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-indigo-500/20 bg-gradient-to-br from-indigo-500/10 via-zinc-900 to-zinc-950 p-5 flex flex-col">
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-indigo-300">Ready to analyze</p>

            {selectedVideo ? (
              <>
                <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950/70">
                  <div className="aspect-video bg-zinc-900">
                    {selectedVideo.thumbnailUrl ? (
                      <img src={selectedVideo.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-zinc-500">
                        Selected Video
                      </div>
                    )}
                  </div>
                  <div className="p-4">
                    <p className="text-sm font-semibold leading-relaxed text-zinc-100">{selectedVideo.title}</p>
                    <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-zinc-400">
                      <span className="rounded-full border border-zinc-700 bg-zinc-900 px-2 py-1">{formatPublishedDate(selectedVideo.publishedAt)}</span>
                      <span className="rounded-full border border-zinc-700 bg-zinc-900 px-2 py-1">{selectedVideo.commentCount.toLocaleString()} comments</span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleAnalyzeComments}
                  disabled={loading || loadingVideos || !selectedVideoId}
                  className="mt-4 w-full h-12 bg-indigo-500 hover:bg-indigo-600 disabled:bg-indigo-900 disabled:text-zinc-600 text-white font-medium rounded-xl transition-colors flex items-center justify-center gap-2"
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
              </>
            ) : (
              <div className="mt-4 rounded-2xl border border-dashed border-zinc-700 bg-zinc-950/50 px-4 py-6 text-sm text-zinc-400">
                Choose a video from the list to preview it here before running the analysis.
              </div>
            )}

            <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 text-xs leading-relaxed text-zinc-400">
              We will fetch the latest comments on the selected video, cluster repeated questions and pain points, then suggest content ideas and draft replies.
            </div>
          </div>
        </div>
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
