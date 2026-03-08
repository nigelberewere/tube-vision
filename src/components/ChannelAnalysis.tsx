import { useState, useEffect } from 'react';
import { generateVidVisionInsight } from '../services/geminiService';
import { Type } from '@google/genai';
import { 
  Loader2, 
  Sparkles, 
  BarChart3, 
  TrendingUp, 
  AlertCircle, 
  CheckCircle2, 
  ArrowRight,
  RefreshCw
} from 'lucide-react';
import { cn } from '../lib/utils';

export default function ChannelAnalysis() {
  const [videos, setVideos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<any>(null);

  const fetchVideos = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/user/videos');
      if (response.ok) {
        const data = await response.json();
        setVideos(data);
      }
    } catch (error) {
      console.error('Failed to fetch videos:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVideos();
  }, []);

  const handleAnalyzeChannel = async () => {
    if (videos.length === 0) return;
    setAnalyzing(true);
    try {
      const videoData = videos.map(v => ({
        title: v.snippet.title,
        views: v.statistics.viewCount,
        likes: v.statistics.likeCount,
        tags: v.snippet.tags,
        description: v.snippet.description.substring(0, 100) + "..."
      }));

      const schema = {
        type: Type.OBJECT,
        properties: {
          nicheAnalysis: { type: Type.STRING },
          performancePatterns: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
          },
          optimizations: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                currentTitle: { type: Type.STRING },
                suggestedTitle: { type: Type.STRING },
                score: { type: Type.NUMBER },
                reason: { type: Type.STRING },
                suggestedTags: { type: Type.ARRAY, items: { type: Type.STRING } }
              }
            }
          },
          growthStrategy: { type: Type.STRING }
        }
      };

      const prompt = `Analyze my YouTube channel's performance based on my recent videos:
      ${JSON.stringify(videoData)}
      
      1. Identify my niche and its current trends.
      2. Find patterns in high-performing vs low-performing videos.
      3. Suggest specific title and tag optimizations for my recent videos to improve CTR and search ranking.
      4. Provide a long-term growth strategy.`;
      
      const response = await generateVidVisionInsight(prompt, schema);
      if (response) {
        setAnalysis(JSON.parse(response));
      }
    } catch (error) {
      console.error(error);
    } finally {
      setAnalyzing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <Loader2 className="animate-spin text-indigo-500" size={32} />
        <p className="text-zinc-400">Fetching your channel data...</p>
      </div>
    );
  }

  if (videos.length === 0) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-10 text-center">
        <div className="w-16 h-16 bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-6">
          <AlertCircle size={32} className="text-zinc-500" />
        </div>
        <h2 className="text-xl font-bold text-zinc-100 mb-2">No videos found</h2>
        <p className="text-zinc-400 max-w-md mx-auto">
          We couldn't find any videos on your channel. Upload some content to unlock deep channel analysis.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-100">Channel Analysis</h1>
          <p className="text-zinc-400 mt-2">Deep insights into your content patterns and growth opportunities.</p>
        </div>
        <button
          onClick={handleAnalyzeChannel}
          disabled={analyzing}
          className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-all shadow-lg shadow-indigo-500/20"
        >
          {analyzing ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
          {analysis ? 'Re-Analyze Channel' : 'Analyze My Channel'}
        </button>
      </div>

      {!analysis && !analyzing && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {videos.slice(0, 3).map((v, i) => (
            <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              <img 
                src={v.snippet.thumbnails.high.url} 
                alt={v.snippet.title} 
                className="w-full aspect-video object-cover"
                referrerPolicy="no-referrer"
              />
              <div className="p-4">
                <h3 className="text-sm font-semibold text-zinc-100 line-clamp-2 mb-2">{v.snippet.title}</h3>
                <div className="flex items-center gap-4 text-xs text-zinc-400">
                  <span>{Number(v.statistics.viewCount).toLocaleString()} views</span>
                  <span>{Number(v.statistics.likeCount).toLocaleString()} likes</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {analyzing && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-12 flex flex-col items-center justify-center text-center gap-6">
          <div className="relative">
            <div className="w-20 h-20 rounded-full border-4 border-indigo-500/20 border-t-indigo-500 animate-spin"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <Sparkles className="text-indigo-400" size={24} />
            </div>
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-zinc-100">AI is crunching your data...</h2>
            <p className="text-zinc-400 max-w-sm">
              We're analyzing your video titles, tags, and performance patterns to find your unique growth edge.
            </p>
          </div>
        </div>
      )}

      {analysis && (
        <div className="space-y-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Niche & Patterns */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-6">
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <BarChart3 size={20} className="text-indigo-400" />
                  <h2 className="text-lg font-bold text-zinc-100">Niche Analysis</h2>
                </div>
                <p className="text-zinc-400 text-sm leading-relaxed">{analysis.nicheAnalysis}</p>
              </div>
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <TrendingUp size={20} className="text-emerald-400" />
                  <h2 className="text-lg font-bold text-zinc-100">Performance Patterns</h2>
                </div>
                <ul className="space-y-2">
                  {analysis.performancePatterns?.map((pattern: string, i: number) => (
                    <li key={i} className="flex gap-3 text-sm text-zinc-300">
                      <CheckCircle2 size={16} className="text-emerald-500 flex-shrink-0 mt-0.5" />
                      {pattern}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Growth Strategy */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <RefreshCw size={20} className="text-yellow-400" />
                <h2 className="text-lg font-bold text-zinc-100">Growth Strategy</h2>
              </div>
              <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 text-sm text-zinc-300 leading-relaxed">
                {analysis.growthStrategy}
              </div>
            </div>
          </div>

          {/* Video Optimizations */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-zinc-800 bg-zinc-900/50">
              <h2 className="text-lg font-bold text-zinc-100">Recommended Optimizations</h2>
            </div>
            <div className="divide-y divide-zinc-800">
              {analysis.optimizations?.map((opt: any, i: number) => (
                <div key={i} className="p-6 hover:bg-zinc-800/30 transition-colors">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <div className="space-y-4">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Current Title</span>
                        <p className="text-sm text-zinc-400 line-clamp-1">{opt.currentTitle}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <ArrowRight size={16} className="text-indigo-500" />
                        <div className="flex-1">
                          <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-400">Suggested Title</span>
                          <p className="text-base font-bold text-zinc-100">{opt.suggestedTitle}</p>
                        </div>
                        <div className="bg-indigo-500/10 text-indigo-400 px-3 py-1 rounded-full text-xs font-bold">
                          Score: {opt.score}/100
                        </div>
                      </div>
                      <p className="text-sm text-zinc-400 italic">"{opt.reason}"</p>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 block mb-2">Suggested Tags</span>
                      <div className="flex flex-wrap gap-2">
                        {opt.suggestedTags?.map((tag: string, j: number) => (
                          <span key={j} className="bg-zinc-800 text-zinc-300 px-2 py-1 rounded text-xs">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
