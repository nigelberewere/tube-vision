import { useState } from 'react';
import { generateVidVisionInsight } from '../services/geminiService';
import { Type } from '@google/genai';
import { Loader2, Sparkles, Target, BarChart2, Zap, TrendingUp, Flame, Clock, Rocket } from 'lucide-react';
import { cn } from '../lib/utils';

export default function KeywordResearch() {
  const [niche, setNiche] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [lastRequestTime, setLastRequestTime] = useState<number>(0);

  const handleResearch = async () => {
    if (!niche) return;
    setLoading(true);
    
    try {
      // Rate limit protection: minimum 2 seconds between requests
      const now = Date.now();
      const timeSinceLastRequest = now - lastRequestTime;
      if (timeSinceLastRequest < 2000) {
        await new Promise(resolve => setTimeout(resolve, 2000 - timeSinceLastRequest));
      }
      setLastRequestTime(Date.now());
      
      const schema = {
        type: Type.OBJECT,
        properties: {
          mainKeywordAnalysis: {
            type: Type.OBJECT,
            properties: {
              searchVolume: { type: Type.NUMBER, description: "1-100 scale" },
              competition: { type: Type.NUMBER, description: "1-100 scale" },
              overallScore: { type: Type.NUMBER, description: "1-100 scale" },
              verdict: { type: Type.STRING }
            }
          },
          trendingNow: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                keyword: { type: Type.STRING, description: "Rising search term in this niche" },
                growthVelocity: { type: Type.NUMBER, description: "1-100, how fast it's rising" },
                currentVolume: { type: Type.NUMBER, description: "Current search volume 1-100" },
                competition: { type: Type.NUMBER, description: "Current competition 1-100" },
                firstMoverWindow: { type: Type.STRING, description: "e.g., '2-4 weeks', 'Next 30 days'" },
                firstMoverScore: { type: Type.NUMBER, description: "Opportunity score 1-100 for being early" },
                trendReason: { type: Type.STRING, description: "Why this is trending now" },
                recommendedAction: { type: Type.STRING, description: "Specific action to take advantage" }
              },
              required: ["keyword", "growthVelocity", "currentVolume", "competition", "firstMoverWindow", "firstMoverScore", "trendReason", "recommendedAction"]
            },
            minItems: 3,
            maxItems: 5
          },
          opportunities: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                keyword: { type: Type.STRING },
                searchVolume: { type: Type.NUMBER },
                competition: { type: Type.NUMBER },
                whyItsGood: { type: Type.STRING }
              }
            }
          },
          contentAngles: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
          },
          trendInsight: {
            type: Type.STRING,
            description: "Overall insight about trending patterns in this niche"
          }
        },
        required: ["mainKeywordAnalysis", "trendingNow", "opportunities", "contentAngles", "trendInsight"]
      };

      const prompt = `You are a YouTube trend analyst with access to real-time search data. Perform comprehensive keyword research for: "${niche}".

**CRITICAL: Include "Trending Now" Analysis**
1. Identify 3-5 search terms that are RISING RIGHT NOW in this niche (early stage trends, not mainstream yet)
2. For each trending term, calculate:
   - Growth Velocity (how rapidly search volume is increasing)
   - Current Volume vs Competition ratio
   - First Mover Window (time window before it becomes saturated)
   - First Mover Score (opportunity for early creators to dominate)
   - Why it's trending (cultural events, news, seasonal factors, emerging tech, etc.)
   - Recommended action (specific video angle to capture the trend)

Then perform standard analysis:
- Evaluate the main keyword's search volume vs competition (1-100 scale)
- Find 4-5 "Low Competition, High Demand" evergreen long-tail keywords
- Suggest 3 unique content angles

Focus on giving creators a competitive advantage by spotting trends BEFORE they peak.`;
      
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

  const getVelocityColor = (velocity: number) => {
    if (velocity >= 80) return "text-red-400";
    if (velocity >= 60) return "text-orange-400";
    if (velocity >= 40) return "text-yellow-400";
    return "text-emerald-400";
  };

  const getVelocityIcon = (velocity: number) => {
    if (velocity >= 70) return <Flame className="text-red-400 animate-pulse" size={16} />;
    return <TrendingUp className="text-orange-400" size={16} />;
  };

  const getScoreColor = (score: number, inverse: boolean = false) => {
    if (inverse) {
      return score <= 33 ? "text-emerald-400" : score <= 66 ? "text-yellow-400" : "text-red-400";
    }
    return score >= 66 ? "text-emerald-400" : score >= 33 ? "text-yellow-400" : "text-red-400";
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-zinc-100">Keyword Research</h1>
        <p className="text-zinc-400 mt-2">Find low-competition, high-demand niches and catch trending topics early.</p>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <label className="block text-sm font-medium text-zinc-300 mb-2">
          Niche or Broad Topic
        </label>
        <div className="flex gap-3">
          <input
            type="text"
            value={niche}
            onChange={(e) => setNiche(e.target.value)}
            placeholder="e.g., Personal Finance for Beginners"
            className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            onKeyDown={(e) => e.key === 'Enter' && handleResearch()}
          />
          <button
            onClick={handleResearch}
            disabled={loading || !niche}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-2.5 rounded-lg font-medium flex items-center gap-2 transition-colors"
          >
            {loading ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}
            Analyze
          </button>
        </div>
        <p className="text-xs text-zinc-500 mt-2">
          🔥 Now includes real-time trending search data for first-mover advantage
        </p>
      </div>

      {result && (
        <div className="space-y-6">
          {/* Trending Now Section */}
          {result.trendingNow && result.trendingNow.length > 0 && (
            <div className="bg-gradient-to-br from-orange-900/20 to-zinc-900 border border-orange-500/30 rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-orange-500/30 bg-orange-900/20">
                <div className="flex items-center gap-2">
                  <Flame className="text-orange-400" size={20} />
                  <h2 className="text-lg font-semibold text-zinc-100">Trending Now - First Mover Opportunities</h2>
                </div>
                <p className="text-sm text-zinc-400 mt-1">{result.trendInsight}</p>
              </div>
              <div className="p-6 space-y-4">
                {result.trendingNow.map((trend: any, i: number) => (
                  <div 
                    key={i} 
                    className="border border-zinc-700 bg-zinc-900/50 rounded-lg p-5 hover:border-orange-500/50 transition-all"
                  >
                    <div className="flex items-start justify-between gap-4 mb-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          {getVelocityIcon(trend.growthVelocity)}
                          <h3 className="text-lg font-semibold text-zinc-100">{trend.keyword}</h3>
                        </div>
                        <p className="text-sm text-zinc-400 mb-3">{trend.trendReason}</p>
                      </div>
                      
                      <div className="flex flex-col gap-2">
                        <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg px-3 py-1.5 text-center">
                          <div className="text-xs text-orange-400 mb-0.5">First Mover</div>
                          <div className="text-lg font-bold text-orange-300">{trend.firstMoverScore}</div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                      <div className="bg-zinc-950/50 rounded-lg p-3">
                        <div className="flex items-center gap-1.5 mb-1">
                          <TrendingUp size={14} className={getVelocityColor(trend.growthVelocity)} />
                          <span className="text-xs text-zinc-400">Growth Velocity</span>
                        </div>
                        <div className={cn("text-xl font-bold", getVelocityColor(trend.growthVelocity))}>
                          {trend.growthVelocity}
                        </div>
                      </div>
                      
                      <div className="bg-zinc-950/50 rounded-lg p-3">
                        <div className="flex items-center gap-1.5 mb-1">
                          <BarChart2 size={14} className="text-indigo-400" />
                          <span className="text-xs text-zinc-400">Volume</span>
                        </div>
                        <div className={cn("text-xl font-bold", getScoreColor(trend.currentVolume))}>
                          {trend.currentVolume}
                        </div>
                      </div>
                      
                      <div className="bg-zinc-950/50 rounded-lg p-3">
                        <div className="flex items-center gap-1.5 mb-1">
                          <Target size={14} className="text-emerald-400" />
                          <span className="text-xs text-zinc-400">Competition</span>
                        </div>
                        <div className={cn("text-xl font-bold", getScoreColor(trend.competition, true))}>
                          {trend.competition}
                        </div>
                      </div>
                      
                      <div className="bg-zinc-950/50 rounded-lg p-3">
                        <div className="flex items-center gap-1.5 mb-1">
                          <Clock size={14} className="text-yellow-400" />
                          <span className="text-xs text-zinc-400">Window</span>
                        </div>
                        <div className="text-sm font-semibold text-zinc-100">
                          {trend.firstMoverWindow}
                        </div>
                      </div>
                    </div>
                    
                    <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-lg p-4">
                      <div className="flex items-start gap-2">
                        <Rocket className="text-indigo-400 flex-shrink-0 mt-0.5" size={16} />
                        <div>
                          <div className="text-xs font-medium text-indigo-400 mb-1">RECOMMENDED ACTION</div>
                          <p className="text-sm text-zinc-300">{trend.recommendedAction}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* Main Analysis */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <h2 className="text-xl font-semibold text-zinc-100 mb-6">Main Topic Analysis</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
              <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4 flex flex-col items-center justify-center text-center">
                <span className="text-sm text-zinc-400 mb-1">Search Volume</span>
                <span className={cn("text-3xl font-bold", getScoreColor(result.mainKeywordAnalysis.searchVolume))}>
                  {result.mainKeywordAnalysis.searchVolume}/100
                </span>
              </div>
              <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4 flex flex-col items-center justify-center text-center">
                <span className="text-sm text-zinc-400 mb-1">Competition</span>
                <span className={cn("text-3xl font-bold", getScoreColor(result.mainKeywordAnalysis.competition, true))}>
                  {result.mainKeywordAnalysis.competition}/100
                </span>
              </div>
              <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4 flex flex-col items-center justify-center text-center">
                <span className="text-sm text-zinc-400 mb-1">Overall Score</span>
                <span className={cn("text-3xl font-bold", getScoreColor(result.mainKeywordAnalysis.overallScore))}>
                  {result.mainKeywordAnalysis.overallScore}/100
                </span>
              </div>
            </div>
            <p className="text-zinc-300 bg-indigo-500/10 border border-indigo-500/20 p-4 rounded-lg">
              <strong className="text-indigo-400">Verdict:</strong> {result.mainKeywordAnalysis.verdict}
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Opportunities */}
            <div className="lg:col-span-2 bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-zinc-800 bg-zinc-900/50 flex items-center gap-2">
                <Target size={18} className="text-emerald-400" />
                <h2 className="text-lg font-semibold text-zinc-100">Golden Opportunities</h2>
              </div>
              <div className="divide-y divide-zinc-800">
                {result.opportunities?.map((opp: any, i: number) => (
                  <div key={i} className="p-6 hover:bg-zinc-800/30 transition-colors">
                    <h3 className="text-lg font-medium text-zinc-100 mb-3">{opp.keyword}</h3>
                    <div className="flex gap-4 mb-3">
                      <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-zinc-800 text-zinc-300">
                        Vol: <span className={getScoreColor(opp.searchVolume)}>{opp.searchVolume}</span>
                      </span>
                      <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-zinc-800 text-zinc-300">
                        Comp: <span className={getScoreColor(opp.competition, true)}>{opp.competition}</span>
                      </span>
                    </div>
                    <p className="text-sm text-zinc-400">{opp.whyItsGood}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Content Angles */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden h-fit">
              <div className="px-6 py-4 border-b border-zinc-800 bg-zinc-900/50 flex items-center gap-2">
                <Zap size={18} className="text-yellow-400" />
                <h2 className="text-lg font-semibold text-zinc-100">Unique Angles</h2>
              </div>
              <div className="p-6 space-y-4">
                {result.contentAngles?.map((angle: string, i: number) => (
                  <div key={i} className="flex gap-3">
                    <div className="w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center flex-shrink-0 text-sm font-bold">
                      {i + 1}
                    </div>
                    <p className="text-sm text-zinc-300 pt-0.5">{angle}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Dummy search icon since it's used above
function Search(props: any) {
  return <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
}
