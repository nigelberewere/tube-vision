import { useState, useEffect } from 'react';
import { generateVidVisionInsight } from '../services/geminiService';
import { Type } from '@google/genai';
import { 
  Loader2, 
  Sparkles, 
  TrendingUp, 
  Lightbulb, 
  Zap, 
  ArrowUpRight, 
  Calendar,
  Search,
  Globe,
  Heart,
  FileText,
  Trash2,
  Star,
  AlertCircle
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useAuth } from '../lib/supabaseAuth';

interface VideoIdea {
  id: string;
  title: string;
  hook: string;
  whyItWorks: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  potentialReach: string;
  viralScore: number;
  engagementScore: number;
  seoScore: number;
  overallScore: number;
  savedAt?: string;
}

interface ViralTrend {
  topic: string;
  explanation: string;
  angle: string;
  urgency: 'High' | 'Medium' | 'Low';
}

interface VideoIdeaGeneratorProps {
  channelContext?: any;
  onNavigateToScript?: (ideaTitle: string) => void;
}

const SAVED_IDEAS_KEY = 'vid_vision_saved_ideas';
export default function VideoIdeaGenerator({ channelContext, onNavigateToScript }: VideoIdeaGeneratorProps) {
  const { session: authSession } = useAuth();
  const [ideas, setIdeas] = useState<VideoIdea[]>([]);
  const [trends, setTrends] = useState<ViralTrend[]>([]);
  const [ideasError, setIdeasError] = useState<string | null>(null);
  const [trendsError, setTrendsError] = useState<string | null>(null);
  const [loadingIdeas, setLoadingIdeas] = useState(false);
  const [loadingTrends, setLoadingTrends] = useState(false);
  const [savedIdeas, setSavedIdeas] = useState<VideoIdea[]>([]);
  const [viewMode, setViewMode] = useState<'generated' | 'saved'>('generated');
  const savedIdeasHeaders = authSession?.access_token
    ? {
        Authorization: `Bearer ${authSession.access_token}`,
        'X-Supabase-Auth': authSession.access_token,
      }
    : undefined;

  // Load saved ideas from localStorage first, then refresh from the backend.
  useEffect(() => {
    const stored = localStorage.getItem(SAVED_IDEAS_KEY);
    if (stored) {
      try {
        setSavedIdeas(JSON.parse(stored));
      } catch (e) {
        console.error('Failed to parse saved ideas:', e);
      }
    }

    fetch('/api/user/saved-ideas', {
      credentials: 'include',
      headers: savedIdeasHeaders,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return response.json();
      })
      .then((payload) => {
        const nextSavedIdeas = Array.isArray(payload?.savedIdeas) ? payload.savedIdeas : [];
        setSavedIdeas(nextSavedIdeas);
        localStorage.setItem(SAVED_IDEAS_KEY, JSON.stringify(nextSavedIdeas));
      })
      .catch((error) => {
        console.error('Failed to load saved ideas from backend:', error);
      });
  }, [savedIdeasHeaders]);

  const persistSavedIdeas = (nextSavedIdeas: VideoIdea[]) => {
    setSavedIdeas(nextSavedIdeas);
    localStorage.setItem(SAVED_IDEAS_KEY, JSON.stringify(nextSavedIdeas));
    fetch('/api/user/saved-ideas', {
      method: 'PUT',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(savedIdeasHeaders || {}),
      },
      body: JSON.stringify({ savedIdeas: nextSavedIdeas }),
    }).catch((error) => {
      console.error('Failed to save ideas to backend:', error);
    });
  };

  const saveIdea = (idea: VideoIdea) => {
    const ideaWithTimestamp = { ...idea, savedAt: new Date().toISOString() };
    const updated = [...savedIdeas, ideaWithTimestamp];
    persistSavedIdeas(updated);
  };

  const removeSavedIdea = (ideaId: string) => {
    const updated = savedIdeas.filter(i => i.id !== ideaId);
    persistSavedIdeas(updated);
  };

  const isIdeaSaved = (ideaId: string) => {
    return savedIdeas.some(i => i.id === ideaId);
  };

  const generateIdeas = async () => {
    setLoadingIdeas(true);
    setIdeasError(null);
    setIdeas([]);
    
    try {
      const schema = {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            hook: { type: Type.STRING },
            whyItWorks: { type: Type.STRING },
            difficulty: { type: Type.STRING, enum: ['Easy', 'Medium', 'Hard'] },
            potentialReach: { type: Type.STRING },
            viralScore: { type: Type.NUMBER },
            engagementScore: { type: Type.NUMBER },
            seoScore: { type: Type.NUMBER },
            overallScore: { type: Type.NUMBER }
          },
          required: ['title', 'hook', 'whyItWorks', 'difficulty', 'potentialReach', 'viralScore', 'engagementScore', 'seoScore', 'overallScore']
        }
      };

      const prompt = `Generate 5 personalized daily video ideas for a YouTube channel.
      ${channelContext ? `Channel Name: ${channelContext.title}. Description: ${channelContext.description}.` : "The user hasn't connected their channel, so generate general high-potential ideas for a 'Tech & Productivity' niche."}
      
      Each idea should include:
      1. A high-CTR title.
      2. A 1-sentence hook.
      3. Why it works (psychological trigger).
      4. Difficulty level (Easy/Medium/Hard).
      5. Potential reach (e.g., "High", "Niche", "Viral").
      6. viralScore: 1-100 score representing viral potential.
      7. engagementScore: 1-100 score for expected engagement (comments, shares).
      8. seoScore: 1-100 score for search/discoverability potential.
      9. overallScore: 1-100 overall recommendation score (weighted average).
      
      Make scores realistic and varied. Higher scores for better ideas.`;

      const response = await generateVidVisionInsight(prompt, schema);
      if (response) {
        const parsedIdeas = JSON.parse(response);
        // Add unique IDs to each idea
        const ideasWithIds = (Array.isArray(parsedIdeas) ? parsedIdeas : []).map((idea: any) => ({
          ...idea,
          id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
        }));
        setIdeas(ideasWithIds);
      }
    } catch (error: any) {
      console.error('Failed to generate ideas:', error);
      
      let errorMessage = 'Failed to generate ideas. Please try again.';
      if (error?.message?.includes('429') || error?.message?.includes('RESOURCE_EXHAUSTED')) {
        errorMessage = 'API quota exceeded. Please try again in a few minutes.';
      } else if (error?.message?.includes('quota') || error?.message?.includes('Quota')) {
        errorMessage = 'API quota exceeded. You\'ve reached the daily limit.';
      }
      
      setIdeasError(errorMessage);
      setIdeas([]);
    } finally {
      setLoadingIdeas(false);
    }
  };

  const findTrends = async () => {
    setLoadingTrends(true);
    setTrendsError(null);
    setTrends([]);
    
    try {
      const schema = {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            topic: { type: Type.STRING },
            explanation: { type: Type.STRING },
            angle: { type: Type.STRING },
            urgency: { type: Type.STRING, enum: ['High', 'Medium', 'Low'] }
          },
          required: ['topic', 'explanation', 'angle', 'urgency']
        }
      };

      const prompt = `Identify 3 current viral trends or trending topics on YouTube right now that could go viral.
      ${channelContext ? `Focus on topics relevant to the niche: ${channelContext.title}.` : "Focus on general tech, lifestyle, or business trends."}
      
      For each trend:
      1. The topic name.
      2. An explanation of why it's trending.
      3. A unique 'angle' or 'twist' the creator can use.
      4. Urgency (High/Medium/Low).`;

      // Using googleSearch tool for real-time trends
      const response = await generateVidVisionInsight(prompt, schema);
      if (response) {
        const parsedTrends = JSON.parse(response);
        setTrends(Array.isArray(parsedTrends) ? parsedTrends : []);
      }
    } catch (error: any) {
      console.error('Failed to find trends:', error);
      
      let errorMessage = 'Failed to find trends. Please try again.';
      if (error?.message?.includes('429') || error?.message?.includes('RESOURCE_EXHAUSTED')) {
        errorMessage = 'API quota exceeded. Please try again in a few minutes.';
      } else if (error?.message?.includes('quota') || error?.message?.includes('Quota')) {
        errorMessage = 'API quota exceeded. You\'ve reached the daily limit.';
      }
      
      setTrendsError(errorMessage);
      setTrends([]);
    } finally {
      setLoadingTrends(false);
    }
  };

  useEffect(() => {
    generateIdeas();
    findTrends();
  }, []);

  return (
    <div className="space-y-10 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-100">Video Idea Generator</h1>
          <p className="text-zinc-400 mt-2">Personalized daily ideas with AI-powered scores and trending insights.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-xl p-1">
            <button
              onClick={() => setViewMode('generated')}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-semibold transition-all",
                viewMode === 'generated' 
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20" 
                  : "text-zinc-400 hover:text-zinc-300"
              )}
            >
              <div className="flex items-center gap-2">
                <Sparkles size={14} />
                <span>Generated</span>
              </div>
            </button>
            <button
              onClick={() => setViewMode('saved')}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-semibold transition-all relative",
                viewMode === 'saved' 
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20" 
                  : "text-zinc-400 hover:text-zinc-300"
              )}
            >
              <div className="flex items-center gap-2">
                <Heart size={14} />
                <span>Saved</span>
                {savedIdeas.length > 0 && (
                  <span className="ml-1 px-2 py-0.5 bg-rose-500 text-white text-xs rounded-full">
                    {savedIdeas.length}
                  </span>
                )}
              </div>
            </button>
          </div>
          <button
            onClick={generateIdeas}
            disabled={loadingIdeas}
            className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-100 px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 transition-all"
          >
            {loadingIdeas ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} className="text-indigo-400" />}
            Refresh Ideas
          </button>
          <button
            onClick={findTrends}
            disabled={loadingTrends}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 transition-all shadow-lg shadow-indigo-500/20"
          >
            {loadingTrends ? <Loader2 size={16} className="animate-spin" /> : <Globe size={16} />}
            Scan Trends
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Daily Ideas Section */}
        <div className="lg:col-span-2 space-y-6">
          {viewMode === 'generated' ? (
            <>
              <div className="flex items-center gap-2 mb-2">
                <Calendar size={20} className="text-indigo-400" />
                <h2 className="text-xl font-bold text-zinc-100">AI-Generated Ideas</h2>
              </div>

              {ideasError && (
                <div className="bg-red-950/30 border border-red-500/50 rounded-2xl p-6 flex items-start gap-4">
                  <AlertCircle size={24} className="text-red-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-lg font-bold text-red-300 mb-1">Unable to Generate Ideas</h3>
                    <p className="text-sm text-red-200">{ideasError}</p>
                  </div>
                </div>
              )}

              {loadingIdeas ? (
                <div className="space-y-4">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="h-32 bg-zinc-900/50 border border-zinc-800 animate-pulse rounded-2xl"></div>
                  ))}
                </div>
              ) : ideas && ideas.length > 0 ? (
                <div className="space-y-4">
                  {ideas.map((idea, i) => {
                    const saved = isIdeaSaved(idea.id);
                    return (
                      <div key={i} className="group bg-zinc-900 border border-zinc-800 rounded-2xl p-6 hover:border-indigo-500/50 transition-all hover:shadow-xl hover:shadow-indigo-500/5">
                        <div className="flex justify-between items-start gap-4 mb-4">
                          <div className="flex-1">
                            <div className="flex items-center flex-wrap gap-2 mb-2">
                              <span className={cn(
                                "text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded",
                                idea.difficulty === 'Easy' ? "bg-emerald-500/10 text-emerald-400" :
                                idea.difficulty === 'Medium' ? "bg-yellow-500/10 text-yellow-400" :
                                "bg-rose-500/10 text-rose-400"
                              )}>
                                {idea.difficulty}
                              </span>
                              <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400">
                                {idea.potentialReach} Reach
                              </span>
                              <div className="flex items-center gap-1.5 bg-gradient-to-r from-yellow-500/10 to-orange-500/10 border border-yellow-500/30 px-2 py-0.5 rounded">
                                <Star size={12} className="text-yellow-500 fill-current" />
                                <span className="text-[10px] font-bold text-yellow-400">{idea.overallScore}/100</span>
                              </div>
                            </div>
                            <h3 className="text-lg font-bold text-zinc-100 group-hover:text-indigo-400 transition-colors">{idea.title}</h3>
                          </div>
                          <div className="flex gap-2">
                            <button 
                              onClick={() => saved ? removeSavedIdea(idea.id) : saveIdea(idea)}
                              className={cn(
                                "p-2 rounded-lg transition-all",
                                saved 
                                  ? "bg-rose-500/20 text-rose-400 hover:bg-rose-500/30" 
                                  : "bg-zinc-800 text-zinc-400 hover:text-rose-400 hover:bg-zinc-700"
                              )}
                            >
                              <Heart size={18} className={saved ? "fill-current" : ""} />
                            </button>
                            <button 
                              onClick={() => onNavigateToScript?.(idea.title)}
                              className="p-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg text-white transition-all"
                              title="Create script from this idea"
                            >
                              <FileText size={18} />
                            </button>
                          </div>
                        </div>
                        
                        {/* Score Breakdown */}
                        <div className="grid grid-cols-3 gap-3 mb-4">
                          <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-2">
                            <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-500 mb-1">Viral</p>
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-1.5 bg-zinc-700 rounded-full overflow-hidden">
                                <div 
                                  className="h-full bg-gradient-to-r from-purple-500 to-pink-500" 
                                  style={{ width: `${idea.viralScore}%` }}
                                ></div>
                              </div>
                              <span className="text-xs font-bold text-zinc-300">{idea.viralScore}</span>
                            </div>
                          </div>
                          <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-2">
                            <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-500 mb-1">Engagement</p>
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-1.5 bg-zinc-700 rounded-full overflow-hidden">
                                <div 
                                  className="h-full bg-gradient-to-r from-blue-500 to-cyan-500" 
                                  style={{ width: `${idea.engagementScore}%` }}
                                ></div>
                              </div>
                              <span className="text-xs font-bold text-zinc-300">{idea.engagementScore}</span>
                            </div>
                          </div>
                          <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-2">
                            <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-500 mb-1">SEO</p>
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-1.5 bg-zinc-700 rounded-full overflow-hidden">
                                <div 
                                  className="h-full bg-gradient-to-r from-emerald-500 to-teal-500" 
                                  style={{ width: `${idea.seoScore}%` }}
                                ></div>
                              </div>
                              <span className="text-xs font-bold text-zinc-300">{idea.seoScore}</span>
                            </div>
                          </div>
                        </div>
                        
                        <div className="space-y-3">
                          <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 block mb-1">The Hook</span>
                            <p className="text-sm text-zinc-300 italic">"{idea.hook}"</p>
                          </div>
                          <div className="flex items-start gap-2 text-sm text-zinc-400">
                            <Zap size={16} className="text-yellow-500 flex-shrink-0 mt-0.5" />
                            <p><span className="text-zinc-200 font-medium">Why it works:</span> {idea.whyItWorks}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : !loadingIdeas && !ideasError ? (
                <div className="text-center py-12">
                  <Lightbulb size={48} className="text-zinc-600 mx-auto mb-4" />
                  <h3 className="text-xl font-bold text-zinc-100 mb-2">No Ideas Generated</h3>
                  <p className="text-zinc-400 max-w-md mx-auto mb-6">
                    Click "Generate Ideas" to create personalized video ideas
                  </p>
                </div>
              ) : null}
            </>
          ) : (
            <>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Heart size={20} className="text-rose-400" />
                  <h2 className="text-xl font-bold text-zinc-100">Saved Ideas</h2>
                </div>
                {savedIdeas.length > 0 && (
                  <button
                    onClick={() => {
                      if (confirm('Clear all saved ideas?')) {
                        persistSavedIdeas([]);
                      }
                    }}
                    className="text-xs text-red-400 hover:text-red-300 font-semibold transition-colors"
                  >
                    Clear All
                  </button>
                )}
              </div>

              {savedIdeas.length === 0 ? (
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-12 text-center">
                  <Heart size={48} className="text-zinc-600 mx-auto mb-4" />
                  <h3 className="text-xl font-bold text-zinc-100 mb-2">No Saved Ideas</h3>
                  <p className="text-zinc-400 max-w-md mx-auto mb-6">
                    Start saving your favorite ideas to build your content pipeline.
                  </p>
                  <button
                    onClick={() => setViewMode('generated')}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl font-semibold transition-all inline-flex items-center gap-2"
                  >
                    <Sparkles size={18} />
                    <span>Generate Ideas</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {savedIdeas.map((idea, i) => (
                    <div key={i} className="group bg-zinc-900 border border-rose-500/20 rounded-2xl p-6 hover:border-rose-500/50 transition-all">
                      <div className="flex justify-between items-start gap-4 mb-4">
                        <div className="flex-1">
                          <div className="flex items-center flex-wrap gap-2 mb-2">
                            <span className={cn(
                              "text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded",
                              idea.difficulty === 'Easy' ? "bg-emerald-500/10 text-emerald-400" :
                              idea.difficulty === 'Medium' ? "bg-yellow-500/10 text-yellow-400" :
                              "bg-rose-500/10 text-rose-400"
                            )}>
                              {idea.difficulty}
                            </span>
                            <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400">
                              {idea.potentialReach} Reach
                            </span>
                            <div className="flex items-center gap-1.5 bg-gradient-to-r from-yellow-500/10 to-orange-500/10 border border-yellow-500/30 px-2 py-0.5 rounded">
                              <Star size={12} className="text-yellow-500 fill-current" />
                              <span className="text-[10px] font-bold text-yellow-400">{idea.overallScore}/100</span>
                            </div>
                            {idea.savedAt && (
                              <span className="text-[10px] text-zinc-500">
                                Saved {new Date(idea.savedAt).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                          <h3 className="text-lg font-bold text-zinc-100">{idea.title}</h3>
                        </div>
                        <div className="flex gap-2">
                          <button 
                            onClick={() => onNavigateToScript?.(idea.title)}
                            className="p-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg text-white transition-all"
                            title="Create script from this idea"
                          >
                            <FileText size={18} />
                          </button>
                          <button 
                            onClick={() => removeSavedIdea(idea.id)}
                            className="p-2 bg-zinc-800 hover:bg-red-500/20 rounded-lg text-zinc-400 hover:text-red-400 transition-all"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-3 gap-3 mb-4">
                        <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-2">
                          <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-500 mb-1">Viral</p>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-zinc-700 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-gradient-to-r from-purple-500 to-pink-500" 
                                style={{ width: `${idea.viralScore}%` }}
                              ></div>
                            </div>
                            <span className="text-xs font-bold text-zinc-300">{idea.viralScore}</span>
                          </div>
                        </div>
                        <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-2">
                          <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-500 mb-1">Engagement</p>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-zinc-700 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-gradient-to-r from-blue-500 to-cyan-500" 
                                style={{ width: `${idea.engagementScore}%` }}
                              ></div>
                            </div>
                            <span className="text-xs font-bold text-zinc-300">{idea.engagementScore}</span>
                          </div>
                        </div>
                        <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-2">
                          <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-500 mb-1">SEO</p>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-zinc-700 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-gradient-to-r from-emerald-500 to-teal-500" 
                                style={{ width: `${idea.seoScore}%` }}
                              ></div>
                            </div>
                            <span className="text-xs font-bold text-zinc-300">{idea.seoScore}</span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="space-y-3">
                        <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3">
                          <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 block mb-1">The Hook</span>
                          <p className="text-sm text-zinc-300 italic">"{idea.hook}"</p>
                        </div>
                        <div className="flex items-start gap-2 text-sm text-zinc-400">
                          <Zap size={16} className="text-yellow-500 flex-shrink-0 mt-0.5" />
                          <p><span className="text-zinc-200 font-medium">Why it works:</span> {idea.whyItWorks}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Viral Trends Section */}
        <div className="space-y-6">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp size={20} className="text-emerald-400" />
            <h2 className="text-xl font-bold text-zinc-100">Viral Trends</h2>
          </div>

          {trendsError && (
            <div className="bg-red-950/30 border border-red-500/50 rounded-2xl p-6 flex items-start gap-4">
              <AlertCircle size={24} className="text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="text-lg font-bold text-red-300 mb-1">Unable to Find Trends</h3>
                <p className="text-sm text-red-200">{trendsError}</p>
              </div>
            </div>
          )}

          {loadingTrends ? (
            <div className="space-y-4">
              {[1, 2].map(i => (
                <div key={i} className="h-48 bg-zinc-900/50 border border-zinc-800 animate-pulse rounded-2xl"></div>
              ))}
            </div>
          ) : trends && trends.length > 0 ? (
            <div className="space-y-4">
              {trends.map((trend, i) => (
                <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 blur-3xl rounded-full -mr-12 -mt-12 group-hover:bg-emerald-500/10 transition-all"></div>
                  
                  <div className="flex justify-between items-center">
                    <h3 className="font-bold text-zinc-100 flex items-center gap-2">
                      <Sparkles size={16} className="text-emerald-400" />
                      {trend.topic}
                    </h3>
                    <span className={cn(
                      "text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded",
                      trend.urgency === 'High' ? "bg-rose-500/10 text-rose-400" :
                      trend.urgency === 'Medium' ? "bg-yellow-500/10 text-yellow-400" :
                      "bg-zinc-800 text-zinc-400"
                    )}>
                      {trend.urgency} Urgency
                    </span>
                  </div>

                  <p className="text-sm text-zinc-400 leading-relaxed">
                    {trend.explanation}
                  </p>

                  <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-xl p-3">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400 block mb-1">The Twist</span>
                    <p className="text-sm text-zinc-200 font-medium">{trend.angle}</p>
                  </div>
                </div>
              ))}
              
              <div className="bg-indigo-500/5 border border-indigo-500/10 rounded-2xl p-5 text-center">
                <p className="text-xs text-zinc-500">
                  Trends are updated in real-time based on global YouTube search patterns and niche-specific momentum.
                </p>
              </div>
            </div>
          ) : !loadingTrends && !trendsError ? (
            <div className="text-center py-12">
              <Globe size={48} className="text-zinc-600 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-zinc-100 mb-2">No Trends Found</h3>
              <p className="text-zinc-400 max-w-md mx-auto mb-6">
                Click "Scan Trends" to discover current viral opportunities
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function RefreshCw({ size, className }: { size: number, className?: string }) {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      width={size} 
      height={size} 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className={className}
    >
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  );
}
