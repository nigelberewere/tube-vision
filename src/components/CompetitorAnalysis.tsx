import { useState, useEffect } from 'react';
import { generateVidVisionInsight } from '../services/geminiService';
import { Type } from '@google/genai';
import { 
  Search, 
  Users, 
  TrendingUp, 
  BarChart3, 
  Loader2, 
  ArrowRight, 
  ExternalLink,
  Sparkles,
  Play,
  Eye,
  ThumbsUp,
  Target,
  CheckCircle2,
  Star,
  StarOff,
  Calendar,
  Zap,
  AlertCircle,
  Trophy,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  Clock,
  MessageCircle,
  Upload,
  GitCompare,
  X,
  FileText,
  Globe
} from 'lucide-react';
import { cn } from '../lib/utils';
import { ShimmerCard, ShimmerVideoCard } from './Shimmer';
import { fetchSingletonContent, upsertSingletonContent } from '../lib/supabase';

interface CompetitorChannel {
  id: string;
  title: string;
  description: string;
  thumbnails: any;
  channelUrl?: string;
  statistics: {
    subscriberCount: string;
    videoCount: string;
    viewCount: string;
  };
  matchScore?: string;
  trackedAt?: string;
  customUrl?: string;
}

interface DiscoveredCompetitors {
  niche: string;
  suggestions: CompetitorChannel[];
  message: string;
}

interface CompetitorVideo {
  id: string;
  snippet: {
    title: string;
    description: string;
    thumbnails: any;
    publishedAt: string;
    tags?: string[];
  };
  statistics: {
    viewCount: string;
    likeCount: string;
    commentCount: string;
  };
}

interface CompetitorMetrics {
  engagementRate: number;
  avgViewsPerVideo: number;
  uploadFrequency: string;
  lastUploadDate: string;
  growthTrend: 'rising' | 'steady' | 'declining';
}

interface ContentGapAnalysis {
  theirTopics: string[];
  missingTopics: string[];
  opportunities: string[];
  recommendations: string;
}

const STORAGE_KEY = 'vid_vision_tracked_competitors';

export default function CompetitorAnalysis() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [discoveredCompetitors, setDiscoveredCompetitors] = useState<DiscoveredCompetitors | null>(null);
  const [loadingDiscovery, setLoadingDiscovery] = useState(true);
  const [selectedCompetitor, setSelectedCompetitor] = useState<{
    channel: CompetitorChannel;
    videos: CompetitorVideo[];
  } | null>(null);
  const [loadingVideos, setLoadingVideos] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<any>(null);
  const [trackedCompetitors, setTrackedCompetitors] = useState<CompetitorChannel[]>([]);
  const [view, setView] = useState<'discover' | 'tracked' | 'compare'>('discover');
  const [compareMode, setCompareMode] = useState(false);
  const [selectedForCompare, setSelectedForCompare] = useState<string[]>([]);
  const [competitorMetrics, setCompetitorMetrics] = useState<CompetitorMetrics | null>(null);
  const [gapAnalysis, setGapAnalysis] = useState<ContentGapAnalysis | null>(null);
  const [gapAnalysisError, setGapAnalysisError] = useState<string | null>(null);
  const [loadingGapAnalysis, setLoadingGapAnalysis] = useState(false);

  // Load tracked competitors from localStorage, falling back to Supabase after storage clears
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setTrackedCompetitors(JSON.parse(stored));
        return;
      } catch (e) {
        console.error('Failed to parse tracked competitors:', e);
      }
    }
    // localStorage empty — try Supabase
    fetchSingletonContent('competitor_analysis').then((row) => {
      const competitors = row?.data?.competitors;
      if (Array.isArray(competitors) && competitors.length > 0) {
        setTrackedCompetitors(competitors);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(competitors));
      }
    }).catch(() => {});
  }, []);

  // Save tracked competitors to localStorage and Supabase
  const saveTrackedCompetitors = (competitors: CompetitorChannel[]) => {
    setTrackedCompetitors(competitors);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(competitors));
    upsertSingletonContent('competitor_analysis', { competitors }).catch(() => {});
  };

  // Toggle tracking for a competitor
  const toggleTracking = (channel: CompetitorChannel) => {
    const isTracked = trackedCompetitors.some(c => c.id === channel.id);
    if (isTracked) {
      saveTrackedCompetitors(trackedCompetitors.filter(c => c.id !== channel.id));
    } else {
      saveTrackedCompetitors([...trackedCompetitors, { ...channel, trackedAt: new Date().toISOString() }]);
    }
  };

  // Check if a competitor is tracked
  const isTracked = (channelId: string) => {
    return trackedCompetitors.some(c => c.id === channelId);
  };

  // Calculate competitor metrics
  const calculateMetrics = (videos: CompetitorVideo[]): CompetitorMetrics => {
    if (videos.length === 0) {
      return {
        engagementRate: 0,
        avgViewsPerVideo: 0,
        uploadFrequency: 'Unknown',
        lastUploadDate: 'Unknown',
        growthTrend: 'steady'
      };
    }

    // Calculate engagement rate (likes + comments) / views
    const totalEngagement = videos.reduce((sum, v) => {
      const likes = parseInt(v.statistics.likeCount) || 0;
      const comments = parseInt(v.statistics.commentCount) || 0;
      const views = parseInt(v.statistics.viewCount) || 1;
      return sum + ((likes + comments) / views);
    }, 0);
    const engagementRate = (totalEngagement / videos.length) * 100;

    // Calculate average views
    const totalViews = videos.reduce((sum, v) => sum + (parseInt(v.statistics.viewCount) || 0), 0);
    const avgViewsPerVideo = totalViews / videos.length;

    // Calculate upload frequency
    const sortedVideos = [...videos].sort((a, b) => 
      new Date(b.snippet.publishedAt).getTime() - new Date(a.snippet.publishedAt).getTime()
    );
    
    const lastUploadDate = sortedVideos[0] ? new Date(sortedVideos[0].snippet.publishedAt).toLocaleDateString() : 'Unknown';
    
    // Calculate days between uploads
    if (sortedVideos.length >= 2) {
      const daysBetween = sortedVideos.slice(0, 5).reduce((sum, video, i) => {
        if (i === 0) return sum;
        const diff = new Date(sortedVideos[i-1].snippet.publishedAt).getTime() - 
                     new Date(video.snippet.publishedAt).getTime();
        return sum + (diff / (1000 * 60 * 60 * 24));
      }, 0);
      const avgDays = daysBetween / 4;
      
      let uploadFrequency = 'Irregular';
      if (avgDays < 1.5) uploadFrequency = 'Daily';
      else if (avgDays < 4) uploadFrequency = '2-3 times/week';
      else if (avgDays < 8) uploadFrequency = 'Weekly';
      else if (avgDays < 20) uploadFrequency = 'Bi-weekly';
      else uploadFrequency = 'Monthly';

      // Determine growth trend based on view counts over time
      const recentViews = sortedVideos.slice(0, 3).reduce((sum, v) => sum + parseInt(v.statistics.viewCount), 0) / 3;
      const olderViews = sortedVideos.slice(-3).reduce((sum, v) => sum + parseInt(v.statistics.viewCount), 0) / 3;
      const growthTrend = recentViews > olderViews * 1.2 ? 'rising' : recentViews < olderViews * 0.8 ? 'declining' : 'steady';

      return { engagementRate, avgViewsPerVideo, uploadFrequency, lastUploadDate, growthTrend };
    }

    return {
      engagementRate,
      avgViewsPerVideo,
      uploadFrequency: 'Not enough data',
      lastUploadDate,
      growthTrend: 'steady'
    };
  };

  useEffect(() => {
    const discoverCompetitors = async () => {
      setLoadingDiscovery(true);
      try {
        const response = await fetch('/api/competitors/discover');
        if (response.ok) {
          const data = await response.json();
          setDiscoveredCompetitors(data);
        }
      } catch (error) {
        console.error('Discovery error:', error);
      } finally {
        setLoadingDiscovery(false);
      }
    };

    discoverCompetitors();
  }, []);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const response = await fetch(`/api/competitors/search?q=${encodeURIComponent(searchQuery)}`);
      if (response.ok) {
        const data = await response.json();
        setSearchResults(data);
      }
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setSearching(false);
    }
  };

  const handleSelectCompetitor = async (channelId: string) => {
    setLoadingVideos(true);
    setSearchResults([]);
    setSearchQuery('');
    setAnalysis(null);
    setCompetitorMetrics(null);
    setGapAnalysis(null);
    setGapAnalysisError(null);
    try {
      const response = await fetch(`/api/competitors/videos?channelId=${channelId}`);
      if (response.ok) {
        const data = await response.json();
        setSelectedCompetitor(data);
        
        // Calculate metrics
        const metrics = calculateMetrics(data.videos);
        setCompetitorMetrics(metrics);
      }
    } catch (error) {
      console.error('Fetch videos error:', error);
    } finally {
      setLoadingVideos(false);
    }
  };

  const handleContentGapAnalysis = async () => {
    if (!selectedCompetitor) return;
    setLoadingGapAnalysis(true);
    setGapAnalysisError(null);
    setGapAnalysis(null);
    
    try {
      const videoTopics = selectedCompetitor.videos.slice(0, 20).map(v => v.snippet.title);
      
      const schema = {
        type: Type.OBJECT,
        properties: {
          theirTopics: { type: Type.ARRAY, items: { type: Type.STRING } },
          missingTopics: { type: Type.ARRAY, items: { type: Type.STRING } },
          opportunities: { type: Type.ARRAY, items: { type: Type.STRING } },
          recommendations: { type: Type.STRING }
        }
      };

      const prompt = `Analyze this competitor's content and identify content gaps and opportunities:
      
      Competitor: ${selectedCompetitor.channel.title}
      Recent Video Titles: ${JSON.stringify(videoTopics)}
      
      1. What are the main topics/themes they consistently cover?
      2. What related topics are they NOT covering that could be valuable?
      3. What specific content opportunities exist for a competitor?
      4. Provide a strategic recommendation for beating them.
      
      Be specific and actionable.`;
      
      const response = await generateVidVisionInsight(prompt, schema);
      if (response) {
        const parsed = JSON.parse(response);
        // Ensure all expected properties exist and are arrays/strings
        setGapAnalysis({
          theirTopics: Array.isArray(parsed.theirTopics) ? parsed.theirTopics : [],
          missingTopics: Array.isArray(parsed.missingTopics) ? parsed.missingTopics : [],
          opportunities: Array.isArray(parsed.opportunities) ? parsed.opportunities : [],
          recommendations: typeof parsed.recommendations === 'string' ? parsed.recommendations : 'No recommendations available'
        });
      }
    } catch (error: any) {
      console.error('Gap analysis error:', error);
      
      // Show user-friendly error messages
      let errorMessage = 'Failed to analyze content gaps. Please try again.';
      
      if (error?.message?.includes('429') || error?.message?.includes('RESOURCE_EXHAUSTED')) {
        errorMessage = 'API quota exceeded. Please try again in a few minutes.';
      } else if (error?.message?.includes('quota') || error?.message?.includes('Quota')) {
        errorMessage = 'API quota exceeded. You\'ve reached the daily limit.';
      } else if (error?.message?.includes('API key')) {
        errorMessage = 'API key error. Please check your configuration.';
      }
      
      setGapAnalysisError(errorMessage);
      setGapAnalysis(null);
    } finally {
      setLoadingGapAnalysis(false);
    }
  };

  const handleAnalyzeCompetitor = async () => {
    if (!selectedCompetitor) return;
    setAnalyzing(true);
    try {
      const videoData = selectedCompetitor.videos.slice(0, 10).map(v => ({
        title: v.snippet.title,
        views: v.statistics.viewCount,
        tags: v.snippet.tags,
      }));

      const schema = {
        type: Type.OBJECT,
        properties: {
          contentStrategy: { type: Type.STRING },
          topKeywords: { type: Type.ARRAY, items: { type: Type.STRING } },
          winningPatterns: { type: Type.ARRAY, items: { type: Type.STRING } },
          opportunities: { type: Type.STRING }
        }
      };

      const prompt = `Analyze this competitor's YouTube strategy based on their top performing videos:
      Channel: ${selectedCompetitor.channel.title}
      Videos: ${JSON.stringify(videoData)}
      
      1. What is their core content strategy?
      2. What are the top keywords they are ranking for?
      3. What patterns make their videos successful (titles, topics, thumbnails)?
      4. What are the gaps or opportunities for me to compete with them?`;
      
      const response = await generateVidVisionInsight(prompt, schema);
      if (response) {
        setAnalysis(JSON.parse(response));
      }
    } catch (error) {
      console.error('Analysis error:', error);
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-100">Competitor Intelligence</h1>
          <p className="text-zinc-400 mt-2">Discover, track, and outperform your competition with AI-powered insights.</p>
        </div>
        
        {/* View Tabs */}
        {!selectedCompetitor && (
          <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-xl p-1">
            <button
              onClick={() => setView('discover')}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-semibold transition-all",
                view === 'discover' 
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20" 
                  : "text-zinc-400 hover:text-zinc-300"
              )}
            >
              <div className="flex items-center gap-2">
                <Target size={16} />
                <span>Discover</span>
              </div>
            </button>
            <button
              onClick={() => setView('tracked')}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-semibold transition-all relative",
                view === 'tracked' 
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20" 
                  : "text-zinc-400 hover:text-zinc-300"
              )}
            >
              <div className="flex items-center gap-2">
                <Star size={16} />
                <span>Tracked</span>
                {trackedCompetitors.length > 0 && (
                  <span className="ml-1 px-2 py-0.5 bg-indigo-500 text-white text-xs rounded-full">
                    {trackedCompetitors.length}
                  </span>
                )}
              </div>
            </button>
            <button
              onClick={() => setView('compare')}
              disabled={trackedCompetitors.length < 2}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-semibold transition-all",
                view === 'compare' 
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20" 
                  : "text-zinc-400 hover:text-zinc-300",
                trackedCompetitors.length < 2 && "opacity-50 cursor-not-allowed"
              )}
            >
              <div className="flex items-center gap-2">
                <GitCompare size={16} />
                <span>Compare</span>
              </div>
            </button>
          </div>
        )}
      </div>

      {/* Discover View */}
      {!selectedCompetitor && view === 'discover' && (
        <>
          {loadingDiscovery ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3 md:gap-4">
              {[...Array(8)].map((_, i) => <ShimmerCard key={i} />)}
            </div>
          ) : discoveredCompetitors && discoveredCompetitors.suggestions.length > 0 ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center">
                    <Target size={20} className="text-indigo-400" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-zinc-100">AI-Suggested Competitors in {discoveredCompetitors.niche}</h2>
                    <p className="text-sm text-zinc-400">{discoveredCompetitors.message}</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    discoveredCompetitors.suggestions.forEach(channel => {
                      if (!isTracked(channel.id)) {
                        toggleTracking(channel);
                      }
                    });
                  }}
                  className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition-colors"
                >
                  <Star size={14} />
                  <span>Track All</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3 md:gap-4">
                {discoveredCompetitors.suggestions.map((channel) => {
                  const avgViewsPerVideo = parseInt(channel.statistics.viewCount) / parseInt(channel.statistics.videoCount);
                  const tracked = isTracked(channel.id);
                  
                  return (
                    <div
                      key={channel.id}
                      className="bg-zinc-900 border border-zinc-800 hover:border-indigo-500/50 rounded-2xl overflow-hidden transition-all group relative"
                    >
                      {/* Match Score Badge */}
                      {channel.matchScore && (
                        <div className="absolute top-3 right-3 bg-indigo-600 text-white text-xs font-bold px-2 py-1 rounded-full z-10">
                          {channel.matchScore}% match
                        </div>
                      )}
                      
                      <div className="p-5">
                        <div className="flex items-start gap-3 mb-4">
                          <img
                            src={channel.thumbnails.medium?.url || channel.thumbnails.default?.url}
                            alt={channel.title}
                            className="w-16 h-16 rounded-full border-2 border-zinc-800 group-hover:border-indigo-500/50 transition-colors"
                            referrerPolicy="no-referrer"
                          />
                          <div className="flex-1 min-w-0">
                            <h3 className="font-bold text-zinc-100 text-sm line-clamp-2 group-hover:text-indigo-400 transition-colors">
                              {channel.title}
                            </h3>
                            <p className="text-xs text-zinc-500 mt-1 line-clamp-1">
                              {channel.description || 'No description'}
                            </p>
                          </div>
                        </div>

                        <div className="space-y-2 mb-4">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-zinc-500 flex items-center gap-1">
                              <Users size={12} />
                              Subscribers
                            </span>
                            <span className="font-semibold text-zinc-300">
                              {(parseInt(channel.statistics.subscriberCount) / 1000).toFixed(1)}K
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-zinc-500 flex items-center gap-1">
                              <Play size={12} />
                              Avg Views
                            </span>
                            <span className="font-semibold text-zinc-300">
                              {(avgViewsPerVideo / 1000).toFixed(1)}K
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-zinc-500 flex items-center gap-1">
                              <Upload size={12} />
                              Videos
                            </span>
                            <span className="font-semibold text-zinc-300">
                              {Number(channel.statistics.videoCount).toLocaleString()}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleTracking(channel);
                            }}
                            className={cn(
                              "flex-1 py-2 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1",
                              tracked
                                ? "bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30"
                                : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                            )}
                          >
                            {tracked ? <Star size={14} className="fill-current" /> : <Star size={14} />}
                            <span>{tracked ? 'Tracked' : 'Track'}</span>
                          </button>
                          <button
                            onClick={() => handleSelectCompetitor(channel.id)}
                            className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1"
                          >
                            <Sparkles size={14} />
                            <span>Analyze</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : discoveredCompetitors ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center">
              <Target size={32} className="text-zinc-600 mx-auto mb-3" />
              <p className="text-zinc-400">{discoveredCompetitors.message || 'No competitors discovered yet'}</p>
              <p className="text-sm text-zinc-500 mt-2">Try searching manually below</p>
            </div>
          ) : null}
        </>
      )}

      {/* Tracked View */}
      {!selectedCompetitor && view === 'tracked' && (
        <div className="space-y-4">
          {trackedCompetitors.length === 0 ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-12 text-center">
              <Star size={48} className="text-zinc-600 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-zinc-100 mb-2">No Tracked Competitors</h3>
              <p className="text-zinc-400 max-w-md mx-auto mb-6">
                Start tracking competitors to monitor their performance and get notified of changes.
              </p>
              <button
                onClick={() => setView('discover')}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl font-semibold transition-all inline-flex items-center gap-2"
              >
                <Target size={18} />
                <span>Discover Competitors</span>
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-zinc-100">
                  Tracking {trackedCompetitors.length} Competitor{trackedCompetitors.length !== 1 ? 's' : ''}
                </h2>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => saveTrackedCompetitors([])}
                    className="text-xs text-red-400 hover:text-red-300 font-semibold transition-colors"
                  >
                    Clear All
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 sm:gap-3 md:gap-4">
                {trackedCompetitors.map((channel) => {
                  const avgViewsPerVideo = parseInt(channel.statistics.viewCount) / parseInt(channel.statistics.videoCount);
                  const daysSinceTracked = channel.trackedAt 
                    ? Math.floor((Date.now() - new Date(channel.trackedAt).getTime()) / (1000 * 60 * 60 * 24))
                    : 0;

                  return (
                    <div
                      key={channel.id}
                      className="bg-zinc-900 border border-zinc-800 hover:border-yellow-500/50 rounded-2xl overflow-hidden transition-all group"
                    >
                      <div className="p-5">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-start gap-3 flex-1 min-w-0">
                            <img
                              src={channel.thumbnails.medium?.url || channel.thumbnails.default?.url}
                              alt={channel.title}
                              className="w-14 h-14 rounded-full border-2 border-yellow-500/30"
                              referrerPolicy="no-referrer"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1 mb-1">
                                <Star size={12} className="text-yellow-500 fill-current" />
                                <h3 className="font-bold text-zinc-100 text-sm line-clamp-1">
                                  {channel.title}
                                </h3>
                              </div>
                              <p className="text-xs text-zinc-500">
                                Tracked {daysSinceTracked}d ago
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleTracking(channel);
                            }}
                            className="text-yellow-500 hover:text-red-400 transition-colors p-1"
                          >
                            <X size={16} />
                          </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3 mb-4 p-3 bg-zinc-800/50 rounded-xl">
                          <div className="text-center">
                            <p className="text-xs text-zinc-500 mb-1">Subs</p>
                            <p className="text-sm font-bold text-zinc-100">
                              {(parseInt(channel.statistics.subscriberCount) / 1000).toFixed(0)}K
                            </p>
                          </div>
                          <div className="text-center">
                            <p className="text-xs text-zinc-500 mb-1">Avg Views</p>
                            <p className="text-sm font-bold text-zinc-100">
                              {(avgViewsPerVideo / 1000).toFixed(1)}K
                            </p>
                          </div>
                          <div className="text-center">
                            <p className="text-xs text-zinc-500 mb-1">Videos</p>
                            <p className="text-sm font-bold text-zinc-100">
                              {Number(channel.statistics.videoCount).toLocaleString()}
                            </p>
                          </div>
                        </div>

                        <button
                          onClick={() => handleSelectCompetitor(channel.id)}
                          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-2"
                        >
                          <BarChart3 size={14} />
                          <span>View Full Analysis</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Compare View */}
      {!selectedCompetitor && view === 'compare' && (
        <div className="space-y-6">
          {trackedCompetitors.length < 2 ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-12 text-center">
              <GitCompare size={48} className="text-zinc-600 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-zinc-100 mb-2">Not Enough Competitors</h3>
              <p className="text-zinc-400 max-w-md mx-auto">
                Track at least 2 competitors to compare them side-by-side.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-bold text-zinc-100 mb-2">Compare Tracked Competitors</h2>
                <p className="text-sm text-zinc-400">Side-by-side comparison of key metrics</p>
              </div>

              {/* Comparison Table */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-zinc-800/50">
                      <tr>
                        <th className="text-left p-4 text-xs font-bold text-zinc-400 uppercase tracking-wider">
                          Channel
                        </th>
                        <th className="text-center p-4 text-xs font-bold text-zinc-400 uppercase tracking-wider">
                          Subscribers
                        </th>
                        <th className="text-center p-4 text-xs font-bold text-zinc-400 uppercase tracking-wider">
                          Total Views
                        </th>
                        <th className="text-center p-4 text-xs font-bold text-zinc-400 uppercase tracking-wider">
                          Videos
                        </th>
                        <th className="text-center p-4 text-xs font-bold text-zinc-400 uppercase tracking-wider">
                          Avg Views/Video
                        </th>
                        <th className="text-center p-4 text-xs font-bold text-zinc-400 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800">
                      {trackedCompetitors
                        .sort((a, b) => parseInt(b.statistics.subscriberCount) - parseInt(a.statistics.subscriberCount))
                        .map((channel, index) => {
                          const avgViews = parseInt(channel.statistics.viewCount) / parseInt(channel.statistics.videoCount);
                          const isTop = index === 0;
                          
                          return (
                            <tr key={channel.id} className="hover:bg-zinc-800/30 transition-colors">
                              <td className="p-4">
                                <div className="flex items-center gap-3">
                                  {isTop && (
                                    <Trophy size={16} className="text-yellow-500" />
                                  )}
                                  <img
                                    src={channel.thumbnails.default?.url}
                                    alt={channel.title}
                                    className="w-10 h-10 rounded-full"
                                    referrerPolicy="no-referrer"
                                  />
                                  <div>
                                    <p className="font-semibold text-zinc-100 text-sm">{channel.title}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="p-4 text-center">
                                <p className="font-bold text-zinc-100">
                                  {(parseInt(channel.statistics.subscriberCount) / 1000).toFixed(1)}K
                                </p>
                              </td>
                              <td className="p-4 text-center">
                                <p className="font-bold text-zinc-100">
                                  {(parseInt(channel.statistics.viewCount) / 1000000).toFixed(1)}M
                                </p>
                              </td>
                              <td className="p-4 text-center">
                                <p className="font-bold text-zinc-100">
                                  {Number(channel.statistics.videoCount).toLocaleString()}
                                </p>
                              </td>
                              <td className="p-4 text-center">
                                <p className="font-bold text-zinc-100">
                                  {(avgViews / 1000).toFixed(1)}K
                                </p>
                              </td>
                              <td className="p-4 text-center">
                                <button
                                  onClick={() => handleSelectCompetitor(channel.id)}
                                  className="text-indigo-400 hover:text-indigo-300 text-xs font-semibold transition-colors"
                                >
                                  Analyze
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Quick Insights */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 sm:gap-3 md:gap-4">
                {(() => {
                  const sortedBySubjects = [...trackedCompetitors].sort((a, b) => 
                    parseInt(b.statistics.subscriberCount) - parseInt(a.statistics.subscriberCount)
                  );
                  const topChannel = sortedBySubjects[0];
                  
                  const avgViewsList = trackedCompetitors.map(c => 
                    parseInt(c.statistics.viewCount) / parseInt(c.statistics.videoCount)
                  );
                  const topByEngagement = trackedCompetitors[
                    avgViewsList.indexOf(Math.max(...avgViewsList))
                  ];
                  
                  const mostVideos = [...trackedCompetitors].sort((a, b) => 
                    parseInt(b.statistics.videoCount) - parseInt(a.statistics.videoCount)
                  )[0];

                  return (
                    <>
                      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Trophy size={16} className="text-yellow-500" />
                          <p className="text-xs font-bold text-zinc-400 uppercase">Largest Channel</p>
                        </div>
                        <p className="text-lg font-bold text-zinc-100">{topChannel.title}</p>
                        <p className="text-sm text-zinc-400 mt-1">
                          {(parseInt(topChannel.statistics.subscriberCount) / 1000).toFixed(1)}K subscribers
                        </p>
                      </div>
                      
                      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Zap size={16} className="text-indigo-500" />
                          <p className="text-xs font-bold text-zinc-400 uppercase">Best Engagement</p>
                        </div>
                        <p className="text-lg font-bold text-zinc-100">{topByEngagement.title}</p>
                        <p className="text-sm text-zinc-400 mt-1">
                          {(avgViewsList[trackedCompetitors.indexOf(topByEngagement)] / 1000).toFixed(1)}K avg views
                        </p>
                      </div>
                      
                      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Upload size={16} className="text-emerald-500" />
                          <p className="text-xs font-bold text-zinc-400 uppercase">Most Prolific</p>
                        </div>
                        <p className="text-lg font-bold text-zinc-100">{mostVideos.title}</p>
                        <p className="text-sm text-zinc-400 mt-1">
                          {Number(mostVideos.statistics.videoCount).toLocaleString()} videos
                        </p>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Manual Search Bar */}
      {!selectedCompetitor && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Search size={18} className="text-zinc-500" />
            <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-wider">Or Search Manually</h3>
          </div>
          <div className="relative max-w-2xl">
            <div className="relative flex items-center">
              <Search className="absolute left-4 text-zinc-500" size={20} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Search for a competitor channel..."
                className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl pl-12 pr-4 py-4 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
              />
              {searching && (
                <div className="absolute right-4">
                  <Loader2 className="animate-spin text-indigo-500" size={20} />
                </div>
              )}
            </div>

            {/* Search Results Dropdown */}
            {searchResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden z-50 shadow-2xl">
                {searchResults.map((result) => (
                  <button
                    key={result.id.channelId}
                    onClick={() => handleSelectCompetitor(result.id.channelId)}
                    className="w-full flex items-center gap-4 p-4 hover:bg-zinc-800 transition-colors border-b border-zinc-800 last:border-0"
                  >
                    <img 
                      src={result.snippet.thumbnails.default.url} 
                      alt={result.snippet.title} 
                      className="w-12 h-12 rounded-full"
                      referrerPolicy="no-referrer"
                    />
                    <div className="text-left">
                      <h3 className="font-bold text-zinc-100">{result.snippet.title}</h3>
                      <p className="text-xs text-zinc-500 line-clamp-1">{result.snippet.description}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Back Button When Competitor Selected */}
      {selectedCompetitor && (
        <button
          onClick={() => {
            setSelectedCompetitor(null);
            setAnalysis(null);
          }}
          className="flex items-center gap-2 text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
        >
          <ArrowRight size={16} className="rotate-180" />
          <span>Back to Competitor Discovery</span>
        </button>
      )}

      {loadingVideos && (
        <div className="space-y-6">
          <div className="h-32 bg-zinc-800/50 rounded-2xl animate-pulse" />
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 md:gap-6">
            <ShimmerVideoCard />
            <ShimmerVideoCard />
            <ShimmerVideoCard />
            <ShimmerVideoCard />
            <ShimmerVideoCard />
            <ShimmerVideoCard />
          </div>
        </div>
      )}

      {selectedCompetitor && !loadingVideos && (
        <div className="space-y-8">
          {/* Competitor Header with Metrics */}
          <div className="bg-gradient-to-br from-zinc-900 via-zinc-900 to-indigo-950/20 border border-zinc-800 rounded-2xl p-6">
            <div className="flex flex-col lg:flex-row items-start gap-6">
              <img 
                src={selectedCompetitor.channel.thumbnails.high.url} 
                alt={selectedCompetitor.channel.title} 
                className="w-24 h-24 rounded-full border-2 border-indigo-500/50 shadow-lg shadow-indigo-500/20"
                referrerPolicy="no-referrer"
              />
              <div className="flex-1">
                <div className="flex items-start justify-between flex-wrap gap-4 mb-4">
                  <div>
                    <h2 className="text-2xl font-bold text-zinc-100">{selectedCompetitor.channel.title}</h2>
                    <p className="text-zinc-400 text-sm mt-1 line-clamp-2 max-w-2xl">{selectedCompetitor.channel.description}</p>
                  </div>
                  <button
                    onClick={() => toggleTracking(selectedCompetitor.channel)}
                    className={cn(
                      "px-4 py-2 rounded-xl font-semibold text-sm flex items-center gap-2 transition-all",
                      isTracked(selectedCompetitor.channel.id)
                        ? "bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30"
                        : "bg-indigo-600 hover:bg-indigo-700 text-white"
                    )}
                  >
                    {isTracked(selectedCompetitor.channel.id) ? (
                      <>
                        <Star size={16} className="fill-current" />
                        <span>Tracked</span>
                      </>
                    ) : (
                      <>
                        <Star size={16} />
                        <span>Track Channel</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 md:gap-4">
                  <div className="bg-zinc-800/50 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Users size={16} className="text-indigo-400" />
                      <p className="text-xs font-bold text-zinc-400 uppercase">Subscribers</p>
                    </div>
                    <p className="text-2xl font-bold text-zinc-100">
                      {(parseInt(selectedCompetitor.channel.statistics.subscriberCount) / 1000).toFixed(1)}K
                    </p>
                  </div>
                  
                  <div className="bg-zinc-800/50 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Eye size={16} className="text-emerald-400" />
                      <p className="text-xs font-bold text-zinc-400 uppercase">Total Views</p>
                    </div>
                    <p className="text-2xl font-bold text-zinc-100">
                      {(parseInt(selectedCompetitor.channel.statistics.viewCount) / 1000000).toFixed(1)}M
                    </p>
                  </div>
                  
                  <div className="bg-zinc-800/50 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Play size={16} className="text-yellow-400" />
                      <p className="text-xs font-bold text-zinc-400 uppercase">Videos</p>
                    </div>
                    <p className="text-2xl font-bold text-zinc-100">
                      {Number(selectedCompetitor.channel.statistics.videoCount).toLocaleString()}
                    </p>
                  </div>
                  
                  <div className="bg-zinc-800/50 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Activity size={16} className="text-purple-400" />
                      <p className="text-xs font-bold text-zinc-400 uppercase">Avg Views</p>
                    </div>
                    <p className="text-2xl font-bold text-zinc-100">
                      {competitorMetrics ? (competitorMetrics.avgViewsPerVideo / 1000).toFixed(1) : '...'}K
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Advanced Metrics */}
          {competitorMetrics && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 md:gap-4">
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Zap size={18} className="text-yellow-500" />
                  <p className="text-xs font-bold text-zinc-400 uppercase">Engagement Rate</p>
                </div>
                <p className="text-3xl font-bold text-zinc-100">
                  {competitorMetrics.engagementRate.toFixed(2)}%
                </p>
                <p className="text-xs text-zinc-500 mt-2">Likes + Comments per View</p>
              </div>

              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Calendar size={18} className="text-indigo-500" />
                  <p className="text-xs font-bold text-zinc-400 uppercase">Upload Frequency</p>
                </div>
                <p className="text-2xl font-bold text-zinc-100">
                  {competitorMetrics.uploadFrequency}
                </p>
                <p className="text-xs text-zinc-500 mt-2">Posting Schedule</p>
              </div>

              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Clock size={18} className="text-emerald-500" />
                  <p className="text-xs font-bold text-zinc-400 uppercase">Last Upload</p>
                </div>
                <p className="text-lg font-bold text-zinc-100">
                  {competitorMetrics.lastUploadDate}
                </p>
                <p className="text-xs text-zinc-500 mt-2">Most Recent Video</p>
              </div>

              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  {competitorMetrics.growthTrend === 'rising' ? (
                    <ArrowUpRight size={18} className="text-emerald-500" />
                  ) : competitorMetrics.growthTrend === 'declining' ? (
                    <ArrowDownRight size={18} className="text-red-500" />
                  ) : (
                    <Activity size={18} className="text-yellow-500" />
                  )}
                  <p className="text-xs font-bold text-zinc-400 uppercase">Growth Trend</p>
                </div>
                <p className={cn(
                  "text-2xl font-bold capitalize",
                  competitorMetrics.growthTrend === 'rising' && "text-emerald-500",
                  competitorMetrics.growthTrend === 'declining' && "text-red-500",
                  competitorMetrics.growthTrend === 'steady' && "text-yellow-500"
                )}>
                  {competitorMetrics.growthTrend}
                </p>
                <p className="text-xs text-zinc-500 mt-2">Based on Recent Views</p>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleAnalyzeCompetitor}
              disabled={analyzing}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 transition-all shadow-lg shadow-indigo-500/20"
            >
              {analyzing ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
              {analysis ? 'Re-Analyze Strategy' : 'Analyze Strategy'}
            </button>

            <button
              onClick={handleContentGapAnalysis}
              disabled={loadingGapAnalysis}
              className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 transition-all shadow-lg shadow-emerald-500/20"
            >
              {loadingGapAnalysis ? <Loader2 size={18} className="animate-spin" /> : <Target size={18} />}
              {gapAnalysis ? 'Refresh Gap Analysis' : 'Find Content Gaps'}
            </button>

            <button
              onClick={() => {
                const channel = selectedCompetitor.channel;
                const directUrl = channel.channelUrl;
                const rawCustomUrl = channel.customUrl
                  ? String(channel.customUrl).replace(/^https?:\/\/(www\.)?youtube\.com\//i, '')
                  : '';

                const customPath = rawCustomUrl
                  ? rawCustomUrl.startsWith('@') ||
                    rawCustomUrl.startsWith('c/') ||
                    rawCustomUrl.startsWith('user/') ||
                    rawCustomUrl.startsWith('channel/')
                    ? rawCustomUrl
                    : `@${rawCustomUrl}`
                  : '';

                const fallbackUrl = customPath
                  ? `https://www.youtube.com/${customPath}`
                  : channel.id
                    ? `https://www.youtube.com/channel/${channel.id}`
                    : 'https://www.youtube.com';

                window.open(directUrl || fallbackUrl, '_blank', 'noopener,noreferrer');
              }}
              className="bg-zinc-800 hover:bg-zinc-700 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 transition-all"
            >
              <ExternalLink size={18} />
              <span>View on YouTube</span>
            </button>
          </div>

          {/* Content Gap Analysis Error */}
          {gapAnalysisError && (
            <div className="bg-red-950/30 border border-red-500/50 rounded-2xl p-6 flex items-start gap-4">
              <AlertCircle size={24} className="text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="text-lg font-bold text-red-300 mb-1">Unable to Analyze Content Gaps</h3>
                <p className="text-sm text-red-200">{gapAnalysisError}</p>
              </div>
            </div>
          )}

          {/* Content Gap Analysis */}
          {gapAnalysis && (
            <div className="bg-gradient-to-br from-emerald-950/30 via-zinc-900 to-zinc-900 border border-emerald-500/30 rounded-2xl p-6 space-y-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-emerald-500/20 rounded-xl flex items-center justify-center">
                  <Target size={24} className="text-emerald-400" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-zinc-100">Content Gap Analysis</h3>
                  <p className="text-sm text-zinc-400">Opportunities to outperform your competitor</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <FileText size={18} className="text-zinc-400" />
                    <h4 className="font-bold text-zinc-100">Their Top Topics</h4>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {gapAnalysis.theirTopics && gapAnalysis.theirTopics.length > 0 ? (
                      gapAnalysis.theirTopics.map((topic, i) => (
                        <span key={i} className="bg-zinc-800 text-zinc-300 px-3 py-1.5 rounded-lg text-xs font-medium">
                          {topic}
                        </span>
                      ))
                    ) : (
                      <p className="text-sm text-zinc-400">No topics identified</p>
                    )}
                  </div>
                </div>

                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <AlertCircle size={18} className="text-yellow-400" />
                    <h4 className="font-bold text-zinc-100">Missing From Their Content</h4>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {gapAnalysis.missingTopics && gapAnalysis.missingTopics.length > 0 ? (
                      gapAnalysis.missingTopics.map((topic, i) => (
                        <span key={i} className="bg-yellow-500/10 text-yellow-400 px-3 py-1.5 rounded-lg text-xs font-medium border border-yellow-500/30">
                          {topic}
                        </span>
                      ))
                    ) : (
                      <p className="text-sm text-yellow-400">No missing topics identified</p>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles size={18} className="text-emerald-400" />
                  <h4 className="font-bold text-zinc-100">Your Opportunities</h4>
                </div>
                <div className="space-y-2">
                  {gapAnalysis.opportunities && gapAnalysis.opportunities.length > 0 ? (
                    gapAnalysis.opportunities.map((opp, i) => (
                      <div key={i} className="flex gap-3 items-start bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-3">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 flex-shrink-0"></div>
                        <p className="text-sm text-zinc-300">{opp}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-zinc-400">No opportunities identified</p>
                  )}
                </div>
              </div>

              <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Trophy size={18} className="text-indigo-400" />
                  <h4 className="font-bold text-zinc-100">Strategic Recommendation</h4>
                </div>
                <p className="text-zinc-300 leading-relaxed">{gapAnalysis.recommendations}</p>
              </div>
            </div>
          )}

          {/* AI Analysis Results */}
          {analyzing && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 sm:p-12 flex flex-col items-center justify-center text-center gap-4 sm:gap-6">
              <div className="w-16 h-16 rounded-full border-4 border-indigo-500/20 border-t-indigo-500 animate-spin"></div>
              <h3 className="text-xl font-bold text-zinc-100">AI is analyzing their strategy...</h3>
            </div>
          )}

          {analysis && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-6">
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <TrendingUp size={20} className="text-indigo-400" />
                    <h3 className="text-lg font-bold text-zinc-100">Content Strategy</h3>
                  </div>
                  <p className="text-sm text-zinc-400 leading-relaxed">{analysis.contentStrategy}</p>
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Search size={20} className="text-emerald-400" />
                    <h3 className="text-lg font-bold text-zinc-100">Top Keywords</h3>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {analysis.topKeywords.map((kw: string, i: number) => (
                      <span key={i} className="bg-emerald-500/10 text-emerald-400 px-3 py-1 rounded-full text-xs font-medium">
                        {kw}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-6">
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <BarChart3 size={20} className="text-yellow-400" />
                    <h3 className="text-lg font-bold text-zinc-100">Winning Patterns</h3>
                  </div>
                  <ul className="space-y-2">
                    {analysis.winningPatterns.map((pattern: string, i: number) => (
                      <li key={i} className="flex gap-3 text-sm text-zinc-400">
                        <div className="w-1.5 h-1.5 rounded-full bg-yellow-500 mt-1.5 flex-shrink-0"></div>
                        {pattern}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Sparkles size={20} className="text-indigo-400" />
                    <h3 className="text-lg font-bold text-zinc-100">Your Opportunity</h3>
                  </div>
                  <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-xl p-4 text-sm text-zinc-300 italic">
                    {analysis.opportunities}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Top Videos List */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Users size={20} className="text-indigo-400" />
              <h3 className="text-xl font-bold text-zinc-100">Most Popular Recent Videos</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
              {selectedCompetitor.videos.map((video) => (
                <div key={video.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden group hover:border-indigo-500/50 transition-all">
                  <div className="relative aspect-video">
                    <img 
                      src={video.snippet.thumbnails.high.url} 
                      alt={video.snippet.title} 
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Play className="text-white fill-current" size={48} />
                    </div>
                  </div>
                  <div className="p-4 space-y-3">
                    <h4 className="font-bold text-zinc-100 line-clamp-2 text-sm group-hover:text-indigo-400 transition-colors">
                      {video.snippet.title}
                    </h4>
                    <div className="flex items-center justify-between text-xs text-zinc-500">
                      <div className="flex items-center gap-3">
                        <span className="flex items-center gap-1">
                          <Eye size={14} />
                          {Number(video.statistics.viewCount).toLocaleString()}
                        </span>
                        <span className="flex items-center gap-1">
                          <ThumbsUp size={14} />
                          {Number(video.statistics.likeCount).toLocaleString()}
                        </span>
                      </div>
                      <span>{new Date(video.snippet.publishedAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {!selectedCompetitor && !loadingVideos && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-12 text-center space-y-4">
          <div className="w-16 h-16 bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <Users size={32} className="text-zinc-500" />
          </div>
          <h3 className="text-xl font-bold text-zinc-100">No competitor selected</h3>
          <p className="text-zinc-400 max-w-md mx-auto">
            Search for a YouTube channel in your niche to see their most popular videos and analyze their winning strategy.
          </p>
        </div>
      )}
    </div>
  );
}
