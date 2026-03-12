import { useState, useEffect } from 'react';
import { generateVidVisionInsight } from '../services/geminiService';
import { Type } from '@google/genai';
import { Loader2, Sparkles, Copy, Check, Trophy, Zap, Target, Bookmark, Plus, Trash2, Edit2, Save, X, ChevronDown, ChevronUp } from 'lucide-react';

interface ABVariant {
  title: string;
  thumbnailConcept: string;
  textOverlay: string;
  colorPalette: string;
  visualSalienceScore: number;
  hookStrengthScore: number;
  predictedCTR: number;
  reasoning: string;
  winProbability: number;
}

interface GlobalSnippet {
  id: string;
  name: string;
  content: string;
  enabled: boolean;
}

interface SEOOptimizerProps {
  initialTopic?: string;
  onTopicUsed?: () => void;
}

export default function SEOOptimizer({ initialTopic = '', onTopicUsed }: SEOOptimizerProps = {}) {
  const [topic, setTopic] = useState(initialTopic);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [abTestResults, setAbTestResults] = useState<ABVariant[] | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [showABTest, setShowABTest] = useState(false);
  const [lastRequestTime, setLastRequestTime] = useState<number>(0);
  
  // Global Snippets state
  const [snippets, setSnippets] = useState<GlobalSnippet[]>([]);
  const [showSnippets, setShowSnippets] = useState(false);
  const [editingSnippet, setEditingSnippet] = useState<string | null>(null);
  const [newSnippetName, setNewSnippetName] = useState('');
  const [newSnippetContent, setNewSnippetContent] = useState('');
  const [isAddingSnippet, setIsAddingSnippet] = useState(false);

  // Load snippets from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('vidvision_global_snippets');
    if (saved) {
      try {
        setSnippets(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to load snippets:', e);
      }
    } else {
      // Set default snippets on first load
      const defaultSnippets: GlobalSnippet[] = [
        {
          id: '1',
          name: 'Social Links',
          content: '🔗 Follow me:\nTwitter: @yourhandle\nInstagram: @yourhandle\nTikTok: @yourhandle',
          enabled: true
        },
        {
          id: '2',
          name: 'Gear List',
          content: '📷 My Gear:\nCamera: Sony A7IV\nMic: Rode NT1\nLights: Elgato Key Light',
          enabled: true
        }
      ];
      setSnippets(defaultSnippets);
      localStorage.setItem('vidvision_global_snippets', JSON.stringify(defaultSnippets));
    }
  }, []);

  // Save snippets to localStorage whenever they change
  useEffect(() => {
    if (snippets.length > 0) {
      localStorage.setItem('vidvision_global_snippets', JSON.stringify(snippets));
    }
  }, [snippets]);

  const addSnippet = () => {
    if (!newSnippetName.trim() || !newSnippetContent.trim()) return;
    
    const newSnippet: GlobalSnippet = {
      id: Date.now().toString(),
      name: newSnippetName.trim(),
      content: newSnippetContent.trim(),
      enabled: true
    };
    
    setSnippets(prev => [...prev, newSnippet]);
    setNewSnippetName('');
    setNewSnippetContent('');
    setIsAddingSnippet(false);
  };

  const updateSnippet = (id: string, updates: Partial<GlobalSnippet>) => {
    setSnippets(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
    setEditingSnippet(null);
  };

  const deleteSnippet = (id: string) => {
    setSnippets(prev => prev.filter(s => s.id !== id));
  };

  const toggleSnippet = (id: string) => {
    setSnippets(prev => prev.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s));
  };

  const getEnabledSnippetsText = () => {
    return snippets
      .filter(s => s.enabled)
      .map(s => s.content)
      .join('\n\n');
  };

  useEffect(() => {
    if (initialTopic) {
      setTopic(initialTopic);
      onTopicUsed?.();
    }
  }, [initialTopic, onTopicUsed]);

  // Rate limit protection: minimum 2 seconds between requests
  const enforceRateLimit = async () => {
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTime;
    if (timeSinceLastRequest < 2000) {
      await new Promise(resolve => setTimeout(resolve, 2000 - timeSinceLastRequest));
    }
    setLastRequestTime(Date.now());
  };

  const handleGenerate = async () => {
    if (!topic) return;
    setLoading(true);
    setShowABTest(false);
    
    try {
      await enforceRateLimit();
      
      const schema = {
        type: Type.OBJECT,
        properties: {
          titles: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                ctrPotential: { type: Type.NUMBER, description: "Scale 1-100" },
                reasoning: { type: Type.STRING }
              }
            }
          },
          description: { type: Type.STRING },
          tags: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
          }
        }
      };

      const prompt = `Generate highly optimized SEO metadata for a YouTube video about: "${topic}". 
      Provide 3 high-CTR title options, a keyword-rich description (first 2 lines are crucial), and 15-20 high-ranking tags.
      
      ${snippets.filter(s => s.enabled).length > 0 ? `IMPORTANT: Naturally weave the following pre-saved content snippets into the description where relevant:\n\n${getEnabledSnippetsText()}\n\n` : ''}Make the description engaging and keyword-rich while incorporating any provided snippets seamlessly.`;
      
      const response = await generateVidVisionInsight(prompt, schema);
      if (response) {
        setResult(JSON.parse(response));
        setAbTestResults(null);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleABTest = async () => {
    if (!topic) return;
    setLoading(true);
    setShowABTest(true);
    
    try {
      await enforceRateLimit();
      
      // Single API call generates ALL variants with predictions
      const schema = {
        type: Type.OBJECT,
        properties: {
          variants: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                thumbnailConcept: { type: Type.STRING, description: "Detailed visual layout description" },
                textOverlay: { type: Type.STRING, description: "Text to display on thumbnail" },
                colorPalette: { type: Type.STRING },
                visualSalienceScore: { type: Type.NUMBER, description: "1-100, how eye-catching is this thumbnail" },
                hookStrengthScore: { type: Type.NUMBER, description: "1-100, how compelling is the title hook" },
                predictedCTR: { type: Type.NUMBER, description: "Predicted CTR percentage 1-100" },
                reasoning: { type: Type.STRING },
                winProbability: { type: Type.NUMBER, description: "Percentage chance this variant wins A/B test (0-100)" }
              },
              required: ["title", "thumbnailConcept", "textOverlay", "colorPalette", "visualSalienceScore", "hookStrengthScore", "predictedCTR", "reasoning", "winProbability"]
            },
            minItems: 3,
            maxItems: 4
          },
          winnerIndex: { type: Type.NUMBER, description: "Array index of predicted winner (0-based)" },
          testInsights: { type: Type.STRING, description: "Why the winner is predicted to perform best" }
        },
        required: ["variants", "winnerIndex", "testInsights"]
      };

      const prompt = `You are an A/B testing expert for YouTube thumbnails and titles. Generate 3-4 distinct title/thumbnail pairs for the video topic: "${topic}".

For each variant:
1. Create a DIFFERENT title strategy (curiosity gap, numbers, how-to, controversy, etc.)
2. Design a matching thumbnail concept with specific visual elements
3. Predict Visual Salience (how eye-catching in a feed)
4. Predict Hook Strength (how compelling the title is)
5. Calculate predicted CTR based on thumbnail-title synergy
6. Assign win probability based on YouTube's feed algorithm preferences

Ensure variants are MAXIMALLY different from each other to represent true A/B test options. Order them by winProbability (highest first).`;
      
      const response = await generateVidVisionInsight(prompt, schema);
      if (response) {
        const parsed = JSON.parse(response);
        setAbTestResults(parsed.variants);
        setResult({ 
          description: `A/B Test Analysis: ${parsed.testInsights}`,
          tags: [],
          titles: parsed.variants.map((v: ABVariant, i: number) => ({
            title: v.title,
            ctrPotential: v.predictedCTR,
            reasoning: i === parsed.winnerIndex ? `🏆 PREDICTED WINNER: ${v.reasoning}` : v.reasoning
          }))
        });
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-zinc-100">SEO Optimizer</h1>
        <p className="text-zinc-400 mt-2">Generate high-CTR titles, descriptions, tags, and A/B test predictions.</p>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <label className="block text-sm font-medium text-zinc-300 mb-2">
          Video Topic or Working Title
        </label>
        <div className="flex gap-3">
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g., How to build a SaaS in 2024"
            className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
          />
          <button
            onClick={handleGenerate}
            disabled={loading || !topic}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-2.5 rounded-lg font-medium flex items-center gap-2 transition-colors"
          >
            {loading && !showABTest ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
            Optimize
          </button>
          <button
            onClick={handleABTest}
            disabled={loading || !topic}
            className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-2.5 rounded-lg font-medium flex items-center gap-2 transition-colors"
          >
            {loading && showABTest ? <Loader2 size={18} className="animate-spin" /> : <Target size={18} />}
            A/B Test
          </button>
        </div>
        <p className="text-xs text-zinc-500 mt-2">
          💡 Tip: A/B Test simulates which title/thumbnail combo will perform best before upload
        </p>
      </div>

      {/* Global Snippets Section */}
      <div className="bg-gradient-to-br from-indigo-900/20 to-zinc-900 border border-indigo-500/30 rounded-xl overflow-hidden">
        <button
          onClick={() => setShowSnippets(!showSnippets)}
          className="w-full px-6 py-4 flex items-center justify-between hover:bg-indigo-500/5 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-indigo-500/20">
              <Bookmark className="text-indigo-400" size={20} />
            </div>
            <div className="text-left">
              <h2 className="text-lg font-semibold text-zinc-100">Global Snippets</h2>
              <p className="text-sm text-zinc-400">Save social links, gear lists, and more. AI will auto-include them in descriptions.</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-indigo-400 bg-indigo-500/10 px-3 py-1 rounded-full">
              {snippets.filter(s => s.enabled).length} active
            </span>
            {showSnippets ? <ChevronUp className="text-zinc-400" size={20} /> : <ChevronDown className="text-zinc-400" size={20} />}
          </div>
        </button>

        {showSnippets && (
          <div className="border-t border-indigo-500/30 p-6 space-y-4">
            {/* Existing Snippets */}
            {snippets.map(snippet => (
              <div
                key={snippet.id}
                className={`border rounded-lg p-4 transition-all ${
                  snippet.enabled 
                    ? 'border-indigo-500/30 bg-indigo-500/5' 
                    : 'border-zinc-700 bg-zinc-900/50 opacity-60'
                }`}
              >
                {editingSnippet === snippet.id ? (
                  <div className="space-y-3">
                    <input
                      type="text"
                      value={snippet.name}
                      onChange={(e) => updateSnippet(snippet.id, { name: e.target.value })}
                      className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                      placeholder="Snippet name"
                    />
                    <textarea
                      value={snippet.content}
                      onChange={(e) => updateSnippet(snippet.id, { content: e.target.value })}
                      rows={4}
                      className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 font-mono"
                      placeholder="Snippet content"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => setEditingSnippet(null)}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm transition-colors"
                      >
                        <Save size={14} />
                        Save
                      </button>
                      <button
                        onClick={() => setEditingSnippet(null)}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-white text-sm transition-colors"
                      >
                        <X size={14} />
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => toggleSnippet(snippet.id)}
                          className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                            snippet.enabled
                              ? 'border-indigo-500 bg-indigo-500'
                              : 'border-zinc-600 bg-transparent'
                          }`}
                        >
                          {snippet.enabled && <Check size={14} className="text-white" />}
                        </button>
                        <h3 className="font-medium text-zinc-100">{snippet.name}</h3>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setEditingSnippet(snippet.id)}
                          className="p-1.5 rounded-lg hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={() => deleteSnippet(snippet.id)}
                          className="p-1.5 rounded-lg hover:bg-red-500/20 text-zinc-400 hover:text-red-400 transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    <pre className="text-sm text-zinc-400 whitespace-pre-wrap font-mono leading-relaxed">
                      {snippet.content}
                    </pre>
                  </div>
                )}
              </div>
            ))}

            {/* Add New Snippet */}
            {isAddingSnippet ? (
              <div className="border border-indigo-500/30 rounded-lg p-4 bg-indigo-500/5 space-y-3">
                <input
                  type="text"
                  value={newSnippetName}
                  onChange={(e) => setNewSnippetName(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  placeholder="Snippet name (e.g., Affiliate Disclaimer)"
                />
                <textarea
                  value={newSnippetContent}
                  onChange={(e) => setNewSnippetContent(e.target.value)}
                  rows={4}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 font-mono"
                  placeholder="Snippet content (e.g., links, disclaimers, gear info...)"
                />
                <div className="flex gap-2">
                  <button
                    onClick={addSnippet}
                    disabled={!newSnippetName.trim() || !newSnippetContent.trim()}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
                  >
                    <Save size={14} />
                    Add Snippet
                  </button>
                  <button
                    onClick={() => {
                      setIsAddingSnippet(false);
                      setNewSnippetName('');
                      setNewSnippetContent('');
                    }}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-white text-sm font-medium transition-colors"
                  >
                    <X size={14} />
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setIsAddingSnippet(true)}
                className="w-full border-2 border-dashed border-zinc-700 hover:border-indigo-500/50 rounded-lg p-4 flex items-center justify-center gap-2 text-zinc-400 hover:text-indigo-400 transition-colors group"
              >
                <Plus size={18} className="group-hover:scale-110 transition-transform" />
                <span className="font-medium">Add New Snippet</span>
              </button>
            )}

            <div className="mt-4 p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-lg">
              <p className="text-xs text-indigo-200">
                💡 <strong>Tip:</strong> Enable/disable snippets using the checkboxes. Only enabled snippets will be included in AI-generated descriptions.
              </p>
            </div>
          </div>
        )}
      </div>

      {result && (
        <div className="space-y-6">
          {/* A/B Test Results - Show thumbnail concepts if in A/B mode */}
          {showABTest && abTestResults && (
            <div className="bg-gradient-to-br from-emerald-900/20 to-zinc-900 border border-emerald-500/30 rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-emerald-500/30 bg-emerald-900/20">
                <div className="flex items-center gap-2">
                  <Trophy className="text-emerald-400" size={20} />
                  <h2 className="text-lg font-semibold text-zinc-100">A/B Test Prediction</h2>
                </div>
                <p className="text-sm text-zinc-400 mt-1">Simulated performance analysis before upload</p>
              </div>
              <div className="p-6 space-y-4">
                {abTestResults.map((variant, i) => (
                  <div 
                    key={i} 
                    className={`border rounded-lg p-5 transition-all ${
                      i === 0 
                        ? 'border-emerald-500/50 bg-emerald-500/5' 
                        : 'border-zinc-700 bg-zinc-900/50'
                    }`}
                  >
                    {i === 0 && (
                      <div className="flex items-center gap-2 mb-3">
                        <Trophy className="text-emerald-400" size={18} />
                        <span className="text-emerald-400 font-semibold text-sm">PREDICTED WINNER</span>
                      </div>
                    )}
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4 md:gap-6">
                      {/* Title & Metrics */}
                      <div className="space-y-3">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-medium text-zinc-400">TITLE VARIANT {String.fromCharCode(65 + i)}</span>
                            <button 
                              onClick={() => copyToClipboard(variant.title, 200 + i)}
                              className="text-zinc-400 hover:text-zinc-200 p-1"
                            >
                              {copiedIndex === 200 + i ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                            </button>
                          </div>
                          <h3 className="text-lg font-semibold text-zinc-100">{variant.title}</h3>
                        </div>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                          <div className="bg-zinc-950/50 rounded-lg p-3">
                            <div className="flex items-center gap-2 mb-1">
                              <Zap className="text-yellow-400" size={14} />
                              <span className="text-xs text-zinc-400">Visual Salience</span>
                            </div>
                            <div className="text-2xl font-bold text-zinc-100">{variant.visualSalienceScore}</div>
                            <div className="text-xs text-zinc-500">Eye-catching power</div>
                          </div>
                          
                          <div className="bg-zinc-950/50 rounded-lg p-3">
                            <div className="flex items-center gap-2 mb-1">
                              <Target className="text-indigo-400" size={14} />
                              <span className="text-xs text-zinc-400">Hook Strength</span>
                            </div>
                            <div className="text-2xl font-bold text-zinc-100">{variant.hookStrengthScore}</div>
                            <div className="text-xs text-zinc-500">Title compelling</div>
                          </div>
                        </div>
                        
                        <div className="flex gap-3">
                          <div className="flex-1 bg-indigo-500/10 border border-indigo-500/30 rounded-lg p-3">
                            <div className="text-xs text-indigo-400 mb-1">Predicted CTR</div>
                            <div className="text-xl font-bold text-indigo-300">{variant.predictedCTR}%</div>
                          </div>
                          <div className="flex-1 bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3">
                            <div className="text-xs text-emerald-400 mb-1">Win Probability</div>
                            <div className="text-xl font-bold text-emerald-300">{variant.winProbability}%</div>
                          </div>
                        </div>
                        
                        <p className="text-sm text-zinc-400 italic">{variant.reasoning}</p>
                      </div>
                      
                      {/* Thumbnail Concept */}
                      <div className="space-y-3">
                        <div>
                          <div className="text-xs font-medium text-zinc-400 mb-2">THUMBNAIL CONCEPT</div>
                          <div className="bg-zinc-950/50 border border-zinc-700 rounded-lg p-4 space-y-3">
                            <div>
                              <span className="text-xs text-zinc-500">Layout:</span>
                              <p className="text-sm text-zinc-300 mt-1">{variant.thumbnailConcept}</p>
                            </div>
                            <div>
                              <span className="text-xs text-zinc-500">Text Overlay:</span>
                              <p className="text-md font-semibold text-zinc-100 mt-1">"{variant.textOverlay}"</p>
                            </div>
                            <div>
                              <span className="text-xs text-zinc-500">Color Palette:</span>
                              <p className="text-sm text-zinc-300 mt-1">{variant.colorPalette}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-zinc-800 bg-zinc-900/50">
              <h2 className="text-lg font-semibold text-zinc-100">{showABTest ? 'Title Options (from variants)' : 'High-CTR Titles'}</h2>
            </div>
            <div className="divide-y divide-zinc-800">
              {result.titles?.map((t: any, i: number) => (
                <div key={i} className="p-6 hover:bg-zinc-800/30 transition-colors">
                  <div className="flex justify-between items-start gap-4">
                    <div>
                      <h3 className="text-xl font-medium text-zinc-100">{t.title}</h3>
                      <p className="text-sm text-zinc-400 mt-2">{t.reasoning}</p>
                    </div>
                    <div className="flex flex-col items-end gap-3">
                      <div className="flex items-center gap-2 bg-indigo-500/10 text-indigo-400 px-3 py-1 rounded-full text-sm font-medium">
                        CTR Potential: {t.ctrPotential}/100
                      </div>
                      <button 
                        onClick={() => copyToClipboard(t.title, i)}
                        className="text-zinc-400 hover:text-zinc-200 p-2 rounded-md hover:bg-zinc-800 transition-colors"
                      >
                        {copiedIndex === i ? <Check size={18} className="text-emerald-500" /> : <Copy size={18} />}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
            {!showABTest && (
              <div className="lg:col-span-2 bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-zinc-800 bg-zinc-900/50 flex justify-between items-center">
                  <h2 className="text-lg font-semibold text-zinc-100">Optimized Description</h2>
                  <button 
                    onClick={() => copyToClipboard(result.description, 99)}
                    className="text-zinc-400 hover:text-zinc-200 transition-colors"
                  >
                    {copiedIndex === 99 ? <Check size={18} className="text-emerald-500" /> : <Copy size={18} />}
                  </button>
                </div>
                <div className="p-6">
                  <pre className="whitespace-pre-wrap font-sans text-sm text-zinc-300 leading-relaxed">
                    {result.description}
                  </pre>
                </div>
              </div>
            )}
            
            {showABTest && (
              <div className="lg:col-span-2 bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-zinc-800 bg-zinc-900/50">
                  <h2 className="text-lg font-semibold text-zinc-100">Test Insights</h2>
                </div>
                <div className="p-6">
                  <p className="text-sm text-zinc-300 leading-relaxed">{result.description}</p>
                  <div className="mt-4 p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                    <p className="text-xs text-amber-200">
                      📊 <strong>Next Steps:</strong> Use the predicted winner for your initial upload. After 48-72 hours of data, 
                      consider swapping to the second-best variant if performance is below expectations.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {!showABTest && result.tags && result.tags.length > 0 && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-zinc-800 bg-zinc-900/50 flex justify-between items-center">
                  <h2 className="text-lg font-semibold text-zinc-100">Tags</h2>
                  <button 
                    onClick={() => copyToClipboard(result.tags?.join(', '), 100)}
                    className="text-zinc-400 hover:text-zinc-200 transition-colors"
                  >
                    {copiedIndex === 100 ? <Check size={18} className="text-emerald-500" /> : <Copy size={18} />}
                  </button>
                </div>
                <div className="p-6">
                  <div className="flex flex-wrap gap-2">
                    {result.tags?.map((tag: string, i: number) => (
                      <span key={i} className="bg-zinc-800 text-zinc-300 px-3 py-1 rounded-md text-sm">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
