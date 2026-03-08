import { useState } from 'react';
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
  ThumbsUp
} from 'lucide-react';
import { cn } from '../lib/utils';

interface CompetitorChannel {
  id: string;
  title: string;
  description: string;
  thumbnails: any;
  statistics: {
    subscriberCount: string;
    videoCount: string;
    viewCount: string;
  };
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

export default function CompetitorAnalysis() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedCompetitor, setSelectedCompetitor] = useState<{
    channel: CompetitorChannel;
    videos: CompetitorVideo[];
  } | null>(null);
  const [loadingVideos, setLoadingVideos] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<any>(null);

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
    try {
      const response = await fetch(`/api/competitors/videos?channelId=${channelId}`);
      if (response.ok) {
        const data = await response.json();
        setSelectedCompetitor(data);
      }
    } catch (error) {
      console.error('Fetch videos error:', error);
    } finally {
      setLoadingVideos(false);
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
          <h1 className="text-3xl font-bold tracking-tight text-zinc-100">Competitor Analysis</h1>
          <p className="text-zinc-400 mt-2">Track your rivals and learn from their most successful content.</p>
        </div>
      </div>

      {/* Search Bar */}
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

      {loadingVideos && (
        <div className="flex flex-col items-center justify-center h-64 gap-4">
          <Loader2 className="animate-spin text-indigo-500" size={32} />
          <p className="text-zinc-400">Fetching competitor data...</p>
        </div>
      )}

      {selectedCompetitor && !loadingVideos && (
        <div className="space-y-8">
          {/* Competitor Header */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 flex flex-col md:flex-row items-center gap-8">
            <img 
              src={selectedCompetitor.channel.thumbnails.high.url} 
              alt={selectedCompetitor.channel.title} 
              className="w-24 h-24 rounded-full border-2 border-zinc-800"
              referrerPolicy="no-referrer"
            />
            <div className="flex-1 text-center md:text-left">
              <h2 className="text-2xl font-bold text-zinc-100">{selectedCompetitor.channel.title}</h2>
              <p className="text-zinc-400 text-sm mt-1 line-clamp-2 max-w-2xl">{selectedCompetitor.channel.description}</p>
              <div className="flex flex-wrap justify-center md:justify-start gap-6 mt-4">
                <div className="text-center md:text-left">
                  <p className="text-xs text-zinc-500 uppercase tracking-wider font-bold">Subscribers</p>
                  <p className="text-lg font-bold text-zinc-100">{Number(selectedCompetitor.channel.statistics.subscriberCount).toLocaleString()}</p>
                </div>
                <div className="text-center md:text-left">
                  <p className="text-xs text-zinc-500 uppercase tracking-wider font-bold">Total Views</p>
                  <p className="text-lg font-bold text-zinc-100">{Number(selectedCompetitor.channel.statistics.viewCount).toLocaleString()}</p>
                </div>
                <div className="text-center md:text-left">
                  <p className="text-xs text-zinc-500 uppercase tracking-wider font-bold">Videos</p>
                  <p className="text-lg font-bold text-zinc-100">{Number(selectedCompetitor.channel.statistics.videoCount).toLocaleString()}</p>
                </div>
              </div>
            </div>
            <button
              onClick={handleAnalyzeCompetitor}
              disabled={analyzing}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 transition-all shadow-lg shadow-indigo-500/20"
            >
              {analyzing ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
              {analysis ? 'Re-Analyze Strategy' : 'Analyze Strategy'}
            </button>
          </div>

          {/* AI Analysis Results */}
          {analyzing && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-12 flex flex-col items-center justify-center text-center gap-6">
              <div className="w-16 h-16 rounded-full border-4 border-indigo-500/20 border-t-indigo-500 animate-spin"></div>
              <h3 className="text-xl font-bold text-zinc-100">AI is analyzing their strategy...</h3>
            </div>
          )}

          {analysis && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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
