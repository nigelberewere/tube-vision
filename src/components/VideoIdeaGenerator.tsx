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
  Globe
} from 'lucide-react';
import { cn } from '../lib/utils';

interface VideoIdea {
  title: string;
  hook: string;
  whyItWorks: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  potentialReach: string;
}

interface ViralTrend {
  topic: string;
  explanation: string;
  angle: string;
  urgency: 'High' | 'Medium' | 'Low';
}

interface VideoIdeaGeneratorProps {
  channelContext?: any;
}

export default function VideoIdeaGenerator({ channelContext }: VideoIdeaGeneratorProps) {
  const [ideas, setIdeas] = useState<VideoIdea[]>([]);
  const [trends, setTrends] = useState<ViralTrend[]>([]);
  const [loadingIdeas, setLoadingIdeas] = useState(false);
  const [loadingTrends, setLoadingTrends] = useState(false);

  const generateIdeas = async () => {
    setLoadingIdeas(true);
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
            potentialReach: { type: Type.STRING }
          },
          required: ['title', 'hook', 'whyItWorks', 'difficulty', 'potentialReach']
        }
      };

      const prompt = `Generate 5 personalized daily video ideas for a YouTube channel.
      ${channelContext ? `Channel Name: ${channelContext.title}. Description: ${channelContext.description}.` : "The user hasn't connected their channel, so generate general high-potential ideas for a 'Tech & Productivity' niche."}
      
      Each idea should include:
      1. A high-CTR title.
      2. A 1-sentence hook.
      3. Why it works (psychological trigger).
      4. Difficulty level (Easy/Medium/Hard).
      5. Potential reach (e.g., "High", "Niche", "Viral").`;

      const response = await generateVidVisionInsight(prompt, schema);
      if (response) {
        setIdeas(JSON.parse(response));
      }
    } catch (error) {
      console.error('Failed to generate ideas:', error);
    } finally {
      setLoadingIdeas(false);
    }
  };

  const findTrends = async () => {
    setLoadingTrends(true);
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
        setTrends(JSON.parse(response));
      }
    } catch (error) {
      console.error('Failed to find trends:', error);
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
          <p className="text-zinc-400 mt-2">Personalized daily ideas and viral trends tailored to your niche.</p>
        </div>
        <div className="flex gap-3">
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
          <div className="flex items-center gap-2 mb-2">
            <Calendar size={20} className="text-indigo-400" />
            <h2 className="text-xl font-bold text-zinc-100">Daily Personalized Ideas</h2>
          </div>

          {loadingIdeas ? (
            <div className="space-y-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-32 bg-zinc-900/50 border border-zinc-800 animate-pulse rounded-2xl"></div>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              {ideas.map((idea, i) => (
                <div key={i} className="group bg-zinc-900 border border-zinc-800 rounded-2xl p-6 hover:border-indigo-500/50 transition-all hover:shadow-xl hover:shadow-indigo-500/5">
                  <div className="flex justify-between items-start gap-4 mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
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
                      </div>
                      <h3 className="text-lg font-bold text-zinc-100 group-hover:text-indigo-400 transition-colors">{idea.title}</h3>
                    </div>
                    <button className="p-2 bg-zinc-800 rounded-lg text-zinc-400 hover:text-zinc-100 transition-colors">
                      <ArrowUpRight size={18} />
                    </button>
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
        </div>

        {/* Viral Trends Section */}
        <div className="space-y-6">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp size={20} className="text-emerald-400" />
            <h2 className="text-xl font-bold text-zinc-100">Viral Trends</h2>
          </div>

          {loadingTrends ? (
            <div className="space-y-4">
              {[1, 2].map(i => (
                <div key={i} className="h-48 bg-zinc-900/50 border border-zinc-800 animate-pulse rounded-2xl"></div>
              ))}
            </div>
          ) : (
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
          )}
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
