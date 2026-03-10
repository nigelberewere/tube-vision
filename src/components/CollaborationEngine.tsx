import { useState, useEffect } from 'react';
import { generateVidVisionInsight } from '../services/geminiService';
import { Type } from '@google/genai';
import { Loader2, Users, Mail, Copy, Check, ExternalLink, Play, TrendingUp } from 'lucide-react';

interface Creator {
  id: string;
  title: string;
  description: string;
  customUrl?: string;
  thumbnails: any;
  statistics: {
    subscriberCount: string;
    videoCount: string;
    viewCount: string;
  };
}

interface CreatorMatch {
  creator: Creator;
  videoCount: number;
  avgViews: number;
  recentVideos: Array<{ title: string; viewCount: number; publishedAt: string }>;
  collaborationScore: number;
  outreachEmail?: string;
}

interface SearchFilters {
  subscriberRange: 'any' | 'exact' | 'wider';
  contentCategory: string;
}

function normalizeChannelPayload(payload: any): Creator | null {
  const channel = payload?.channel ?? payload;
  if (!channel || typeof channel !== 'object') return null;

  const stats = channel.statistics ?? {};

  return {
    id: String(channel.id ?? ''),
    title: String(channel.title ?? payload?.name ?? 'Your Channel'),
    description: String(channel.description ?? ''),
    customUrl: channel.customUrl ? String(channel.customUrl) : undefined,
    thumbnails: channel.thumbnails ?? {},
    statistics: {
      subscriberCount: String(stats.subscriberCount ?? '0'),
      videoCount: String(stats.videoCount ?? '0'),
      viewCount: String(stats.viewCount ?? '0'),
    },
  };
}

export default function CollaborationEngine() {
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [userChannel, setUserChannel] = useState<Creator | null>(null);
  const [matches, setMatches] = useState<CreatorMatch[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [Filters, setFilters] = useState<SearchFilters>({
    subscriberRange: 'exact',
    contentCategory: ''
  });
  const [expandedCreatorId, setExpandedCreatorId] = useState<string | null>(null);

  // Load user's channel info
  useEffect(() => {
    const loadUserChannel = async () => {
      try {
        setLoading(true);
        const response = await fetch('/api/user/channel');
        if (response.ok) {
          const data = await response.json();
          const normalized = normalizeChannelPayload(data);
          if (!normalized?.id) {
            setError('Unable to load your channel info. Please reconnect your account.');
            setUserChannel(null);
            return;
          }

          setUserChannel(normalized);
          
          // Extract category from channel description if available
          const categoryMatch = normalized.description?.match(/(?:channel|niche|category)[:—\s]*([^,.\n]+)/i);
          if (categoryMatch) {
            setFilters(prev => ({ ...prev, contentCategory: categoryMatch[1].trim() }));
          }
        } else if (response.status === 401) {
          setError('Please connect your YouTube account to use Collaboration Engine.');
          setUserChannel(null);
        } else {
          setError('Failed to load your channel info. Please try again.');
        }
      } catch (err) {
        console.error('Failed to load user channel:', err);
        setError('Failed to load your channel info. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    loadUserChannel();
  }, []);

  const handleFindCollaborators = async () => {
    if (!userChannel) {
      setError('Unable to load your channel info');
      return;
    }

    if (!Filters.contentCategory.trim()) {
      setError('Please specify a content category/niche');
      return;
    }

    setError(null);
    setMatches([]);
    setSearching(true);

    try {
      // Calculate subscriber range
      const userSubs = parseInt(userChannel.statistics.subscriberCount || '0');
      let minSubs: number, maxSubs: number;

      if (Filters.subscriberRange === 'exact') {
        minSubs = Math.max(Math.floor(userSubs * 0.7), 100);
        maxSubs = Math.ceil(userSubs * 1.5);
      } else if (Filters.subscriberRange === 'wider') {
        minSubs = Math.max(Math.floor(userSubs * 0.3), 100);
        maxSubs = Math.ceil(userSubs * 3);
      } else {
        minSubs = 1;
        maxSubs = 1000000000;
      }

      // Search for collaborators
      const searchResponse = await fetch('/api/collaborators/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          niche: Filters.contentCategory,
          minSubscribers: minSubs,
          maxSubscribers: maxSubs,
          maxResults: 15
        })
      });

      if (!searchResponse.ok) {
        const errorData = await searchResponse.json();
        throw new Error(errorData.error || 'Failed to search for collaborators');
      }

      const { creators } = await searchResponse.json();

      if (!creators || creators.length === 0) {
        setError('No collaborators found in your niche range. Try adjusting filters.');
        setSearching(false);
        return;
      }

      // Fetch videos and generate outreach emails for each creator
      const creatorMatches: CreatorMatch[] = [];

      for (const creator of creators) {
        try {
          // Fetch creator's recent videos
          const videosResponse = await fetch(`/api/collaborators/videos?channelId=${creator.id}`);
          let recentVideos = [];
          let avgViews = 0;

          if (videosResponse.ok) {
            const { videos } = await videosResponse.json();
            recentVideos = videos || [];
            if (videos && videos.length > 0) {
              avgViews = videos.reduce((sum: number, v: any) => sum + parseInt(v.viewCount || 0), 0) / videos.length;
            }
          }

          // Generate outreach email using Gemini
          let outreachEmail: string | undefined;
          try {
            const emailSchema = {
              type: Type.OBJECT,
              properties: {
                emailBody: {
                  type: Type.STRING,
                  description: 'Professional, personalized outreach email (150-300 words)'
                },
                subject: {
                  type: Type.STRING,
                  description: 'Compelling email subject line'
                }
              },
              required: ['emailBody', 'subject']
            };

            const videosContext = recentVideos
              .slice(0, 3)
              .map((v: any) => `- "${v.title}" (${parseInt(v.viewCount).toLocaleString()} views)`)
              .join('\n');

            const emailPrompt = `Draft a personalized collaboration outreach email from a YouTube creator to ${creator.title}.

Your Channel: ${userChannel.title}
- Subscribers: ${parseInt(userChannel.statistics.subscriberCount).toLocaleString()}
- Niche: ${Filters.contentCategory}
- Description: ${userChannel.description?.substring(0, 100)}

Their Channel: ${creator.title}
- Subscribers: ${parseInt(creator.statistics.subscriberCount).toLocaleString()}
- Recent Videos:
${videosContext}

Write a professional, genuine email that:
1. Shows you've actually watched their content (reference something specific)
2. Explains why a collaboration would benefit both audiences
3. Suggests a specific collaboration idea based on their recent content
4. Includes a clear call-to-action
5. Keeps it concise and respectful of their time

Return ONLY valid JSON matching the schema.`;

            const emailResponse = await generateVidVisionInsight(emailPrompt, emailSchema, {
              systemInstruction: 'You are an expert at drafting personalized, authentic collaboration outreach emails. Create emails that are professional, specific, and genuinely interested in mutual benefit.',
            });

            if (emailResponse) {
              const parsed = JSON.parse(emailResponse);
              outreachEmail = `Subject: ${parsed.subject}\n\n${parsed.emailBody}`;
            }
          } catch (err) {
            console.error('Failed to generate email:', err);
          }

          const creatorSubs = parseInt(creator.statistics.subscriberCount || '0');
          const collaborationScore = calculateCollaborationScore(
            userSubs,
            creatorSubs,
            avgViews,
            recentVideos.length
          );

          creatorMatches.push({
            creator,
            videoCount: recentVideos.length,
            avgViews,
            recentVideos: recentVideos.slice(0, 3),
            collaborationScore,
            outreachEmail
          });

          // Rate limit: 1 second between API calls
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (err) {
          console.error(`Failed to process creator ${creator.title}:`, err);
        }
      }

      // Sort by collaboration score (highest first)
      creatorMatches.sort((a, b) => b.collaborationScore - a.collaborationScore);
      setMatches(creatorMatches);
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'Failed to find collaborators. Please try again.');
    } finally {
      setSearching(false);
    }
  };

  const calculateCollaborationScore = (userSubs: number, creatorSubs: number, avgViews: number, videoCount: number) => {
    let score = 50;

    // Audience size compatibility (0-30 points)
    const ratio = creatorSubs / userSubs;
    if (ratio >= 0.7 && ratio <= 1.5) {
      score += 30; // Perfect match
    } else if (ratio >= 0.5 && ratio <= 2) {
      score += 20; // Good match
    } else if (ratio >= 0.3 && ratio <= 3) {
      score += 10; // Acceptable match
    }

    // Content consistency (0-20 points)
    if (videoCount >= 50) {
      score += 20;
    } else if (videoCount >= 20) {
      score += 15;
    } else if (videoCount >= 10) {
      score += 10;
    }

    // Engagement level (0-20 points)
    if (avgViews > userSubs * 0.5) {
      score += 20;
    } else if (avgViews > userSubs * 0.2) {
      score += 15;
    } else if (avgViews > 0) {
      score += 10;
    }

    return Math.min(100, score);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-zinc-100">Collaboration Engine</h1>
        <p className="text-zinc-400 mt-2">Find creators in your niche and generate personalized outreach emails.</p>
      </div>

      {/* Search Controls */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">
              Your Channel
            </label>
            {userChannel ? (
              <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-4 flex items-center gap-4">
                <img
                  src={userChannel.thumbnails?.default?.url || '/favicon.svg'}
                  alt={userChannel.title}
                  className="w-16 h-16 rounded-lg object-cover"
                />
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-white truncate">{userChannel.title}</h3>
                  <div className="flex gap-4 text-sm text-zinc-400 mt-1">
                    <span>{parseInt(userChannel.statistics.subscriberCount).toLocaleString()} subscribers</span>
                    <span>{parseInt(userChannel.statistics.videoCount).toLocaleString()} videos</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-4 text-zinc-400">
                Loading channel info...
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-2">
                Content Niche/Category
              </label>
              <input
                type="text"
                value={Filters.contentCategory}
                onChange={(e) => setFilters(prev => ({ ...prev, contentCategory: e.target.value }))}
                placeholder="e.g., Tech Reviews, Gaming, Cooking"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-2">
                Subscriber Range
              </label>
              <select
                value={Filters.subscriberRange}
                onChange={(e) => setFilters(prev => ({ ...prev, subscriberRange: e.target.value as any }))}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="exact">Similar Size (0.7x - 1.5x)</option>
                <option value="wider">Wider Range (0.3x - 3x)</option>
                <option value="any">Any Size</option>
              </select>
            </div>
          </div>

          <button
            onClick={handleFindCollaborators}
            disabled={searching || !userChannel || !Filters.contentCategory.trim()}
            className="w-full h-12 bg-indigo-500 hover:bg-indigo-600 disabled:bg-indigo-900 disabled:text-zinc-600 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {searching ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Finding Collaborators...
              </>
            ) : (
              <>
                <Users className="w-4 h-4" />
                Find Collaborators
              </>
            )}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Results */}
      {matches.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-zinc-100">
              {matches.length} Potential Collaborators Found
            </h2>
            <span className="text-sm text-zinc-400">Sorted by collaboration fit</span>
          </div>

          {matches.map((match, idx) => (
            <div
              key={match.creator.id}
              className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden hover:border-indigo-500/30 transition-colors"
            >
              {/* Creator Card Header */}
              <div
                className="p-6 cursor-pointer hover:bg-zinc-800/50 transition-colors"
                onClick={() =>
                  setExpandedCreatorId(expandedCreatorId === match.creator.id ? null : match.creator.id)
                }
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4 flex-1 min-w-0">
                    <img
                      src={match.creator.thumbnails?.default?.url}
                      alt={match.creator.title}
                      className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-lg font-bold text-white truncate">{match.creator.title}</h3>
                        {match.creator.customUrl && (
                          <a
                            href={`https://youtube.com/${match.creator.customUrl}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-indigo-400 hover:text-indigo-300 flex-shrink-0"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        )}
                      </div>
                      <div className="flex gap-4 text-sm text-zinc-400 mb-2">
                        <span>{parseInt(match.creator.statistics.subscriberCount).toLocaleString()} subscribers</span>
                        <span>{match.videoCount} recent videos</span>
                        <span>~{Math.round(match.avgViews).toLocaleString()} avg views</span>
                      </div>
                      <p className="text-sm text-zinc-400 line-clamp-2">{match.creator.description}</p>
                    </div>
                  </div>

                  {/* Collaboration Score */}
                  <div className="flex flex-col items-center gap-2 flex-shrink-0">
                    <div className="relative w-16 h-16 flex items-center justify-center">
                      <svg className="w-16 h-16 -rotate-90" viewBox="0 0 100 100">
                        <circle
                          cx="50"
                          cy="50"
                          r="45"
                          fill="none"
                          stroke="rgba(255, 255, 255, 0.1)"
                          strokeWidth="6"
                        />
                        <circle
                          cx="50"
                          cy="50"
                          r="45"
                          fill="none"
                          stroke="rgb(99, 102, 241)"
                          strokeWidth="6"
                          strokeDasharray={`${match.collaborationScore * 2.827} 282.7`}
                          strokeLinecap="round"
                        />
                      </svg>
                      <div className="absolute text-center">
                        <div className="text-sm font-bold text-indigo-400">{match.collaborationScore}</div>
                        <div className="text-[10px] text-zinc-500">Score</div>
                      </div>
                    </div>
                    <span className="text-xs text-zinc-500">#{idx + 1}</span>
                  </div>
                </div>
              </div>

              {/* Expanded Content */}
              {expandedCreatorId === match.creator.id && (
                <div className="border-t border-zinc-800 p-6 space-y-4 bg-zinc-950/50 animate-in fade-in duration-200">
                  {/* Recent Videos */}
                  {match.recentVideos.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-zinc-300 mb-3 flex items-center gap-2">
                        <Play className="w-4 h-4" />
                        Recent Videos
                      </h4>
                      <div className="space-y-2">
                        {match.recentVideos.map((video, i) => (
                          <div key={i} className="bg-zinc-900 rounded p-3 text-sm">
                            <p className="text-zinc-200 line-clamp-2">{video.title}</p>
                            <p className="text-xs text-zinc-500 mt-1">
                              {Math.round(parseInt(String(video.viewCount)) / 1000)}K views • {new Date(video.publishedAt).toLocaleDateString()}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Outreach Email */}
                  {match.outreachEmail && (
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
                          <Mail className="w-4 h-4" />
                          Personalized Outreach Email
                        </h4>
                        <button
                          onClick={() => copyToClipboard(match.outreachEmail!)}
                          className="p-1.5 hover:bg-zinc-800 rounded transition-colors"
                          title="Copy email"
                        >
                          {copied ? (
                            <Check className="w-4 h-4 text-emerald-400" />
                          ) : (
                            <Copy className="w-4 h-4 text-zinc-400" />
                          )}
                        </button>
                      </div>
                      <div className="bg-zinc-900 border border-indigo-500/20 rounded-lg p-4 text-sm text-zinc-300 whitespace-pre-wrap font-mono text-xs leading-relaxed max-h-96 overflow-y-auto">
                        {match.outreachEmail}
                      </div>
                    </div>
                  )}

                  {/* Collaboration Ideas */}
                  <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                    <p className="text-sm text-emerald-300 flex items-start gap-2">
                      <TrendingUp className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      <span>
                        This creator is a {match.collaborationScore >= 80 ? 'perfect' : match.collaborationScore >= 60 ? 'strong' : 'potential'} match for collaboration based on audience size, content consistency, and engagement patterns.
                      </span>
                    </p>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
