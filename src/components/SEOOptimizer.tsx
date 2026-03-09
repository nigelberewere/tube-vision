import { useState, useEffect } from 'react';
import { generateVidVisionInsight } from '../services/geminiService';
import { Type } from '@google/genai';
import { Loader2, Sparkles, Copy, Check, Trophy, Zap, Target } from 'lucide-react';

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
      Provide 3 high-CTR title options, a keyword-rich description (first 2 lines are crucial), and 15-20 high-ranking tags.`;
      
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
                    
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
                        
                        <div className="grid grid-cols-2 gap-3">
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

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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
