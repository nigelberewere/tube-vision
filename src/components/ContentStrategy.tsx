import { useState } from 'react';
import { generateVidVisionInsight } from '../services/geminiService';
import { Type } from '@google/genai';
import { Loader2, Sparkles, AlertTriangle, TrendingUp, Clock } from 'lucide-react';
import { cn } from '../lib/utils';

export default function ContentStrategy() {
  const [transcript, setTranscript] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleAnalyze = async () => {
    if (!transcript) return;
    setLoading(true);
    try {
      const schema = {
        type: Type.OBJECT,
        properties: {
          hookAnalysis: {
            type: Type.OBJECT,
            properties: {
              score: { type: Type.NUMBER, description: "1-100" },
              feedback: { type: Type.STRING },
              improvement: { type: Type.STRING }
            }
          },
          retentionRisks: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                timestampOrSection: { type: Type.STRING },
                reason: { type: Type.STRING },
                fix: { type: Type.STRING }
              }
            }
          },
          overallPacing: { type: Type.STRING },
          ctaEffectiveness: { type: Type.STRING }
        }
      };

      const prompt = `Analyze this video transcript for audience retention and engagement. 
      Identify where viewers might click off (retention risks), evaluate the hook's strength, and suggest pacing improvements.
      
      Transcript:
      "${transcript.substring(0, 15000)}"`; // Limit to avoid token limits if too long
      
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

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-zinc-100">Content Strategy</h1>
        <p className="text-zinc-400 mt-2">Analyze your transcript to identify retention drop-offs and improve pacing.</p>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <label className="block text-sm font-medium text-zinc-300 mb-2">
          Video Transcript
        </label>
        <textarea
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          placeholder="Paste your video script or transcript here..."
          className="w-full h-40 sm:h-48 md:h-56 lg:h-64 bg-zinc-950 border border-zinc-800 rounded-lg px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm md:text-base text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-none"
        />
        <div className="mt-4 flex justify-end">
          <button
            onClick={handleAnalyze}
            disabled={loading || !transcript}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-2.5 rounded-lg font-medium flex items-center gap-2 transition-colors"
          >
            {loading ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
            Analyze Transcript
          </button>
        </div>
      </div>

      {result && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:gap-5 md:grid-cols-2 md:gap-6">
            {/* Hook Analysis */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className={cn(
                  "w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold",
                  result.hookAnalysis.score >= 80 ? "bg-emerald-500/20 text-emerald-400" :
                  result.hookAnalysis.score >= 60 ? "bg-yellow-500/20 text-yellow-400" :
                  "bg-red-500/20 text-red-400"
                )}>
                  {result.hookAnalysis.score}
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-zinc-100">Hook Strength</h2>
                  <p className="text-sm text-zinc-400">First 30 seconds</p>
                </div>
              </div>
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-medium text-zinc-300 mb-1">Feedback</h3>
                  <p className="text-sm text-zinc-400">{result.hookAnalysis.feedback}</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-indigo-400 mb-1">How to Improve</h3>
                  <p className="text-sm text-zinc-300">{result.hookAnalysis.improvement}</p>
                </div>
              </div>
            </div>

            {/* General Feedback */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-6">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Clock size={18} className="text-indigo-400" />
                  <h2 className="text-lg font-semibold text-zinc-100">Overall Pacing</h2>
                </div>
                <p className="text-sm text-zinc-400">{result.overallPacing}</p>
              </div>
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp size={18} className="text-emerald-400" />
                  <h2 className="text-lg font-semibold text-zinc-100">CTA Effectiveness</h2>
                </div>
                <p className="text-sm text-zinc-400">{result.ctaEffectiveness}</p>
              </div>
            </div>
          </div>

          {/* Retention Risks */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-zinc-800 bg-zinc-900/50 flex items-center gap-2">
              <AlertTriangle size={18} className="text-yellow-500" />
              <h2 className="text-lg font-semibold text-zinc-100">Retention Risks</h2>
            </div>
            <div className="divide-y divide-zinc-800">
              {result.retentionRisks?.map((risk: any, i: number) => (
                <div key={i} className="p-6 hover:bg-zinc-800/30 transition-colors">
                  <div className="flex flex-col md:flex-row gap-4 md:gap-8">
                    <div className="md:w-1/4">
                      <span className="inline-block bg-zinc-800 text-zinc-300 px-3 py-1 rounded-md text-sm font-mono">
                        {risk.timestampOrSection}
                      </span>
                    </div>
                    <div className="md:w-3/4 space-y-3">
                      <div>
                        <h3 className="text-sm font-medium text-zinc-300 mb-1">Why they might leave:</h3>
                        <p className="text-sm text-zinc-400">{risk.reason}</p>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-indigo-400 mb-1">The Fix:</h3>
                        <p className="text-sm text-zinc-300">{risk.fix}</p>
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
