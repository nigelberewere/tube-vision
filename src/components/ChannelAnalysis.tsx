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
  RefreshCw,
  Check,
  X,
  Edit3,
  Tags,
  FileText
} from 'lucide-react';
import { ShimmerTable, ShimmerCard } from './Shimmer';
import { cn } from '../lib/utils';

interface VideoOptimization {
  videoId: string;
  currentTitle: string;
  suggestedTitle: string;
  score: number;
  reason: string;
  suggestedTags: string[];
  applying?: boolean;
  applied?: boolean;
  error?: string;
}

export default function ChannelAnalysis() {
  const [videos, setVideos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<any>(null);
  const [selectedVideos, setSelectedVideos] = useState<Set<string>>(new Set());
  const [showBulkDescriptionModal, setShowBulkDescriptionModal] = useState(false);
  const [showBulkTagsModal, setShowBulkTagsModal] = useState(false);
  const [bulkDescriptionText, setBulkDescriptionText] = useState('');
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [bulkTagsText, setBulkTagsText] = useState('');
  const [tagUpdateMode, setTagUpdateMode] = useState<'replace' | 'append' | 'prepend'>('replace');
  const [bulkUpdateProgress, setBulkUpdateProgress] = useState<{ success: string[], failed: any[] } | null>(null);
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);

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
        id: v.id,
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
                videoId: { type: Type.STRING },
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
      3. Suggest specific title and tag optimizations for my recent videos to improve CTR and search ranking. For each suggestion, include the videoId from the provided data.
      4. Provide a long-term growth strategy.`;
      
      const response = await generateVidVisionInsight(prompt, schema);
      if (response) {
        const parsedAnalysis = JSON.parse(response);
        // Ensure each optimization has the videoId
        if (parsedAnalysis.optimizations) {
          parsedAnalysis.optimizations = parsedAnalysis.optimizations.map((opt: any) => ({
            ...opt,
            applying: false,
            applied: false,
            error: undefined
          }));
        }
        setAnalysis(parsedAnalysis);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleApplyTitle = async (index: number) => {
    if (!analysis?.optimizations || !analysis.optimizations[index]) return;

    const optimization = analysis.optimizations[index];
    
    // Update state to show loading
    setAnalysis((prev: any) => {
      const newOptimizations = [...prev.optimizations];
      newOptimizations[index] = {
        ...newOptimizations[index],
        applying: true,
        error: undefined
      };
      return { ...prev, optimizations: newOptimizations };
    });

    try {
      const response = await fetch(`/api/user/videos/${optimization.videoId}/title`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: optimization.suggestedTitle
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to update title' }));
        throw new Error(errorData.error || 'Failed to update video title');
      }

      // Success - update state
      setAnalysis((prev: any) => {
        const newOptimizations = [...prev.optimizations];
        newOptimizations[index] = {
          ...newOptimizations[index],
          applying: false,
          applied: true,
          currentTitle: optimization.suggestedTitle // Update current title
        };
        return { ...prev, optimizations: newOptimizations };
      });
    } catch (error: any) {
      console.error('Failed to apply title:', error);
      
      // Error - update state
      setAnalysis((prev: any) => {
        const newOptimizations = [...prev.optimizations];
        newOptimizations[index] = {
          ...newOptimizations[index],
          applying: false,
          error: error.message || 'Failed to update title'
        };
        return { ...prev, optimizations: newOptimizations };
      });
    }
  };

  const toggleVideoSelection = (videoId: string) => {
    setSelectedVideos(prev => {
      const newSet = new Set(prev);
      if (newSet.has(videoId)) {
        newSet.delete(videoId);
      } else {
        newSet.add(videoId);
      }
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    if (selectedVideos.size === videos.length) {
      setSelectedVideos(new Set());
    } else {
      setSelectedVideos(new Set(videos.map(v => v.id)));
    }
  };

  const handleBulkDescriptionUpdate = async () => {
    if (selectedVideos.size === 0) return;
    
    setIsBulkUpdating(true);
    setBulkUpdateProgress(null);

    const payload: any = {
      videoIds: Array.from(selectedVideos)
    };

    if (findText && replaceText) {
      payload.findReplace = { find: findText, replace: replaceText };
    } else if (bulkDescriptionText) {
      payload.description = bulkDescriptionText;
    } else {
      setIsBulkUpdating(false);
      return;
    }

    try {
      const response = await fetch('/api/user/videos/bulk/description', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        const results = await response.json();
        setBulkUpdateProgress(results);
        if (results.success.length > 0) {
          await fetchVideos(); // Refresh video list
        }
      }
    } catch (error) {
      console.error('Bulk description update failed:', error);
    } finally {
      setIsBulkUpdating(false);
    }
  };

  const handleBulkTagsUpdate = async () => {
    if (selectedVideos.size === 0 || !bulkTagsText.trim()) return;
    
    setIsBulkUpdating(true);
    setBulkUpdateProgress(null);

    const tags = bulkTagsText.split(',').map(tag => tag.trim()).filter(Boolean);

    try {
      const response = await fetch('/api/user/videos/bulk/tags', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoIds: Array.from(selectedVideos),
          tags,
          mode: tagUpdateMode
        })
      });

      if (response.ok) {
        const results = await response.json();
        setBulkUpdateProgress(results);
        if (results.success.length > 0) {
          await fetchVideos(); // Refresh video list
        }
      }
    } catch (error) {
      console.error('Bulk tags update failed:', error);
    } finally {
      setIsBulkUpdating(false);
    }
  };

  const closeBulkDescriptionModal = () => {
    setShowBulkDescriptionModal(false);
    setBulkDescriptionText('');
    setFindText('');
    setReplaceText('');
    setBulkUpdateProgress(null);
  };

  const closeBulkTagsModal = () => {
    setShowBulkTagsModal(false);
    setBulkTagsText('');
    setBulkUpdateProgress(null);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-64 bg-zinc-800/50 rounded animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ShimmerCard />
          <ShimmerCard />
        </div>
        <ShimmerTable rows={8} />
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

      {/* Bulk Actions Panel */}
      {videos.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <button
                onClick={toggleSelectAll}
                className="text-sm font-medium text-zinc-300 hover:text-zinc-100 transition-colors"
              >
                {selectedVideos.size === videos.length ? 'Deselect All' : 'Select All'} ({selectedVideos.size} selected)
              </button>
            </div>
            
            {selectedVideos.size > 0 && (
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowBulkDescriptionModal(true)}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition-colors"
                >
                  <FileText size={16} />
                  Update Descriptions
                </button>
                <button
                  onClick={() => setShowBulkTagsModal(true)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition-colors"
                >
                  <Tags size={16} />
                  Update Tags
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {!analysis && !analyzing && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {videos.slice(0, 3).map((v, i) => (
            <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden relative">
              <input
                type="checkbox"
                checked={selectedVideos.has(v.id)}
                onChange={() => toggleVideoSelection(v.id)}
                className="absolute top-3 left-3 w-5 h-5 rounded border-2 border-zinc-600 bg-zinc-800 checked:bg-indigo-600 checked:border-indigo-600 cursor-pointer z-10"
              />
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
              {analysis.optimizations?.map((opt: VideoOptimization, i: number) => (
                <div key={i} className="p-6 hover:bg-zinc-800/30 transition-colors">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <div className="space-y-4">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Current Title</span>
                        <p className="text-sm text-zinc-400 line-clamp-1">{opt.currentTitle}</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <ArrowRight size={16} className="text-indigo-500 flex-shrink-0 mt-1" />
                        <div className="flex-1 min-w-0">
                          <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-400">Suggested Title</span>
                          <p className="text-base font-bold text-zinc-100">{opt.suggestedTitle}</p>
                        </div>
                        <div className="bg-indigo-500/10 text-indigo-400 px-3 py-1 rounded-full text-xs font-bold flex-shrink-0">
                          Score: {opt.score}/100
                        </div>
                      </div>
                      <p className="text-sm text-zinc-400 italic">"{opt.reason}"</p>
                      
                      {/* Apply Title Button */}
                      <div className="pt-2">
                        {opt.applied ? (
                          <div className="flex items-center gap-2 text-emerald-400 text-sm font-semibold">
                            <Check size={18} className="flex-shrink-0" />
                            <span>Title applied successfully!</span>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleApplyTitle(i)}
                            disabled={opt.applying}
                            className={cn(
                              "bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition-all",
                              opt.error && "bg-blue-600/50"
                            )}
                          >
                            {opt.applying ? (
                              <>
                                <Loader2 size={16} className="animate-spin" />
                                Applying...
                              </>
                            ) : (
                              <>
                                <CheckCircle2 size={16} />
                                Apply Title
                              </>
                            )}
                          </button>
                        )}
                        
                        {opt.error && (
                          <div className="flex items-center gap-2 text-rose-400 text-sm mt-2">
                            <X size={16} className="flex-shrink-0" />
                            <span>{opt.error}</span>
                          </div>
                        )}
                      </div>
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

      {/* Bulk Description Update Modal */}
      {showBulkDescriptionModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileText className="text-blue-400" size={24} />
                <h2 className="text-xl font-bold text-zinc-100">Bulk Update Descriptions</h2>
              </div>
              <button
                onClick={closeBulkDescriptionModal}
                className="text-zinc-400 hover:text-zinc-100 transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <p className="text-zinc-400 text-sm">
                Updating {selectedVideos.size} video{selectedVideos.size !== 1 ? 's' : ''}. Choose to set a new description or find/replace text.
              </p>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-2">
                    Set New Description (replaces entire description)
                  </label>
                  <textarea
                    value={bulkDescriptionText}
                    onChange={(e) => setBulkDescriptionText(e.target.value)}
                    placeholder="Enter new description for all selected videos..."
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 text-zinc-100 min-h-[120px] focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    disabled={findText !== '' || replaceText !== ''}
                  />
                </div>

                <div className="flex items-center gap-4">
                  <div className="h-px flex-1 bg-zinc-800" />
                  <span className="text-xs text-zinc-500">OR</span>
                  <div className="h-px flex-1 bg-zinc-800" />
                </div>

                <div className="space-y-3">
                  <label className="block text-sm font-medium text-zinc-300">
                    Find & Replace (updates affiliate links, seasonal text, etc.)
                  </label>
                  <input
                    type="text"
                    value={findText}
                    onChange={(e) => setFindText(e.target.value)}
                    placeholder="Find text..."
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    disabled={bulkDescriptionText !== ''}
                  />
                  <input
                    type="text"
                    value={replaceText}
                    onChange={(e) => setReplaceText(e.target.value)}
                    placeholder="Replace with..."
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    disabled={bulkDescriptionText !== ''}
                  />
                  <p className="text-xs text-zinc-500">
                    💡 Example: Find "oldaffiliatelink.com" and replace with "newaffiliatelink.com"
                  </p>
                </div>
              </div>

              {bulkUpdateProgress && (
                <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4 space-y-2">
                  <div className="flex items-center gap-2 text-emerald-400">
                    <CheckCircle2 size={18} />
                    <span className="font-semibold">Updated: {bulkUpdateProgress.success.length}</span>
                  </div>
                  {bulkUpdateProgress.failed.length > 0 && (
                    <div className="text-rose-400 text-sm">
                      Failed: {bulkUpdateProgress.failed.length} videos
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={handleBulkDescriptionUpdate}
                  disabled={isBulkUpdating || (!bulkDescriptionText && (!findText || !replaceText))}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-3 rounded-lg font-semibold flex items-center justify-center gap-2"
                >
                  {isBulkUpdating ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      Updating...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={18} />
                      Apply Changes
                    </>
                  )}
                </button>
                <button
                  onClick={closeBulkDescriptionModal}
                  className="px-6 py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg font-semibold"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Tags Update Modal */}
      {showBulkTagsModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Tags className="text-emerald-400" size={24} />
                <h2 className="text-xl font-bold text-zinc-100">Bulk Update Tags</h2>
              </div>
              <button
                onClick={closeBulkTagsModal}
                className="text-zinc-400 hover:text-zinc-100 transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <p className="text-zinc-400 text-sm">
                Updating {selectedVideos.size} video{selectedVideos.size !== 1 ? 's' : ''}. Enter tags separated by commas.
              </p>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-2">
                    Tags (comma-separated)
                  </label>
                  <textarea
                    value={bulkTagsText}
                    onChange={(e) => setBulkTagsText(e.target.value)}
                    placeholder="tag1, tag2, tag3, ..."
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 text-zinc-100 min-h-[100px] focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-3">
                    Update Mode
                  </label>
                  <div className="grid grid-cols-3 gap-3">
                    <button
                      onClick={() => setTagUpdateMode('replace')}
                      className={cn(
                        "px-4 py-2.5 rounded-lg text-sm font-semibold border-2 transition-all",
                        tagUpdateMode === 'replace'
                          ? "border-emerald-500 bg-emerald-500/10 text-emerald-300"
                          : "border-zinc-700 bg-zinc-800 text-zinc-400 hover:border-zinc-600"
                      )}
                    >
                      Replace
                    </button>
                    <button
                      onClick={() => setTagUpdateMode('append')}
                      className={cn(
                        "px-4 py-2.5 rounded-lg text-sm font-semibold border-2 transition-all",
                        tagUpdateMode === 'append'
                          ? "border-emerald-500 bg-emerald-500/10 text-emerald-300"
                          : "border-zinc-700 bg-zinc-800 text-zinc-400 hover:border-zinc-600"
                      )}
                    >
                      Append
                    </button>
                    <button
                      onClick={() => setTagUpdateMode('prepend')}
                      className={cn(
                        "px-4 py-2.5 rounded-lg text-sm font-semibold border-2 transition-all",
                        tagUpdateMode === 'prepend'
                          ? "border-emerald-500 bg-emerald-500/10 text-emerald-300"
                          : "border-zinc-700 bg-zinc-800 text-zinc-400 hover:border-zinc-600"
                      )}
                    >
                      Prepend
                    </button>
                  </div>
                  <p className="text-xs text-zinc-500 mt-2">
                    {tagUpdateMode === 'replace' && '• Replace: Removes all existing tags and sets new ones'}
                    {tagUpdateMode === 'append' && '• Append: Adds new tags at the end of existing tags'}
                    {tagUpdateMode === 'prepend' && '• Prepend: Adds new tags at the beginning of existing tags'}
                  </p>
                </div>
              </div>

              {bulkUpdateProgress && (
                <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4 space-y-2">
                  <div className="flex items-center gap-2 text-emerald-400">
                    <CheckCircle2 size={18} />
                    <span className="font-semibold">Updated: {bulkUpdateProgress.success.length}</span>
                  </div>
                  {bulkUpdateProgress.failed.length > 0 && (
                    <div className="text-rose-400 text-sm">
                      Failed: {bulkUpdateProgress.failed.length} videos
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={handleBulkTagsUpdate}
                  disabled={isBulkUpdating || !bulkTagsText.trim()}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-3 rounded-lg font-semibold flex items-center justify-center gap-2"
                >
                  {isBulkUpdating ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      Updating...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={18} />
                      Apply Tags
                    </>
                  )}
                </button>
                <button
                  onClick={closeBulkTagsModal}
                  className="px-6 py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg font-semibold"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
