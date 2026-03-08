import { useState, useEffect } from 'react';
import { generateVidVisionInsight } from '../services/geminiService';
import { Type } from '@google/genai';
import { Loader2, Sparkles, Copy, Check } from 'lucide-react';

interface SEOOptimizerProps {
  initialTopic?: string;
  onTopicUsed?: () => void;
}

export default function SEOOptimizer({ initialTopic = '', onTopicUsed }: SEOOptimizerProps = {}) {
  const [topic, setTopic] = useState(initialTopic);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  useEffect(() => {
    if (initialTopic) {
      setTopic(initialTopic);
      onTopicUsed?.();
    }
  }, [initialTopic, onTopicUsed]);

  const handleGenerate = async () => {
    if (!topic) return;
    setLoading(true);
    try {
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
        <p className="text-zinc-400 mt-2">Generate high-CTR titles, descriptions, and tags for your next video.</p>
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
            {loading ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
            Optimize
          </button>
        </div>
      </div>

      {result && (
        <div className="space-y-6">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-zinc-800 bg-zinc-900/50">
              <h2 className="text-lg font-semibold text-zinc-100">High-CTR Titles</h2>
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
          </div>
        </div>
      )}
    </div>
  );
}
