import { useState, useEffect } from 'react';
import { generateVidVisionInsight } from '../services/geminiService';
import { Type } from '@google/genai';
import { Loader2, PenTool, Copy, Check } from 'lucide-react';
import { cn } from '../lib/utils';

interface ScriptArchitectProps {
  initialTopic?: string;
  onTopicUsed?: () => void;
}

const DEFAULT_TOPIC_PLACEHOLDER = 'e.g., The history of mechanical keyboards';
const DAILY_PLACEHOLDER_CACHE_KEY = 'vid_vision_script_daily_placeholder';

export default function ScriptArchitect({ initialTopic, onTopicUsed }: ScriptArchitectProps = {}) {
  const [topic, setTopic] = useState('');
  const [topicPlaceholder, setTopicPlaceholder] = useState(DEFAULT_TOPIC_PLACEHOLDER);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [copied, setCopied] = useState(false);

  // Auto-populate topic from initialTopic
  useEffect(() => {
    if (initialTopic) {
      setTopic(initialTopic);
      onTopicUsed?.();
    }
  }, [initialTopic, onTopicUsed]);

  useEffect(() => {
    let isCancelled = false;

    const loadDailyPlaceholder = async () => {
      const today = new Date().toISOString().slice(0, 10);

      try {
        const cached = localStorage.getItem(DAILY_PLACEHOLDER_CACHE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed?.dateKey === today && typeof parsed.placeholder === 'string' && parsed.placeholder.trim()) {
            setTopicPlaceholder(parsed.placeholder.trim());
          }
        }
      } catch {
        // Ignore malformed cache and refresh from API.
      }

      try {
        const response = await fetch('/api/script/daily-placeholder');
        if (!response.ok) {
          return;
        }

        const data = await response.json();
        const nextPlaceholder = String(data?.placeholder || '').trim();
        const dateKey = String(data?.dateKey || today);
        const channelId = String(data?.channelId || '');

        if (!nextPlaceholder || isCancelled) {
          return;
        }

        setTopicPlaceholder(nextPlaceholder);
        localStorage.setItem(
          DAILY_PLACEHOLDER_CACHE_KEY,
          JSON.stringify({ placeholder: nextPlaceholder, dateKey, channelId })
        );
      } catch (error) {
        console.error('Failed to load daily script placeholder:', error);
      }
    };

    loadDailyPlaceholder();

    return () => {
      isCancelled = true;
    };
  }, []);

  const handleGenerate = async () => {
    if (!topic) return;
    setLoading(true);
    try {
      const schema = {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          hook: { type: Type.STRING, description: "First 15-30 seconds. Must be highly engaging." },
          intro: { type: Type.STRING, description: "Setting expectations and building credibility." },
          bodyParagraphs: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                heading: { type: Type.STRING },
                content: { type: Type.STRING },
                visualCue: { type: Type.STRING, description: "What should be on screen?" }
              }
            }
          },
          cta: { type: Type.STRING, description: "Call to action (subscribe, next video, etc.)" },
          outro: { type: Type.STRING }
        }
      };

      const prompt = `Act as a master YouTube scriptwriter. Write a highly engaging, retention-optimized script for a video about: "${topic}".
      Include a strong hook, clear transitions, visual cues for the editor, and a compelling call to action.`;
      
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

  const copyToClipboard = () => {
    if (!result) return;
    
    let text = `# ${result.title}\n\n`;
    text += `## HOOK (0:00 - 0:30)\n${result.hook}\n\n`;
    text += `## INTRO\n${result.intro}\n\n`;
    
    result.bodyParagraphs.forEach((p: any, i: number) => {
      text += `## SECTION ${i + 1}: ${p.heading}\n`;
      text += `[VISUAL CUE: ${p.visualCue}]\n`;
      text += `${p.content}\n\n`;
    });
    
    text += `## CALL TO ACTION\n${result.cta}\n\n`;
    text += `## OUTRO\n${result.outro}`;

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-zinc-100">Script Architect</h1>
        <p className="text-zinc-400 mt-2">Generate full, retention-optimized video scripts with visual cues.</p>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <label className="block text-sm font-medium text-zinc-300 mb-2">
          Video Topic or Outline
        </label>
        <div className="flex gap-3">
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder={topicPlaceholder}
            className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
          />
          <button
            onClick={handleGenerate}
            disabled={loading || !topic}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-2.5 rounded-lg font-medium flex items-center gap-2 transition-colors"
          >
            {loading ? <Loader2 size={18} className="animate-spin" /> : <PenTool size={18} />}
            Draft Script
          </button>
        </div>
      </div>

      {result && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-zinc-800 bg-zinc-900/50 flex justify-between items-center sticky top-0 z-10">
            <h2 className="text-xl font-bold text-zinc-100">{result.title}</h2>
            <button 
              onClick={copyToClipboard}
              className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              {copied ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
              {copied ? 'Copied!' : 'Copy Full Script'}
            </button>
          </div>
          
          <div className="p-6 space-y-8">
            {/* Hook */}
            <section className="relative pl-6 border-l-2 border-indigo-500">
              <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-indigo-500 border-4 border-zinc-900"></div>
              <h3 className="text-sm font-bold tracking-wider text-indigo-400 uppercase mb-2">The Hook (0:00 - 0:30)</h3>
              <p className="text-zinc-300 leading-relaxed text-lg">{result.hook}</p>
            </section>

            {/* Intro */}
            <section className="relative pl-6 border-l-2 border-zinc-700">
              <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-zinc-700 border-4 border-zinc-900"></div>
              <h3 className="text-sm font-bold tracking-wider text-zinc-400 uppercase mb-2">Intro</h3>
              <p className="text-zinc-300 leading-relaxed">{result.intro}</p>
            </section>

            {/* Body */}
            {result.bodyParagraphs?.map((p: any, i: number) => (
              <section key={i} className="relative pl-6 border-l-2 border-zinc-700">
                <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-zinc-700 border-4 border-zinc-900"></div>
                <h3 className="text-sm font-bold tracking-wider text-zinc-400 uppercase mb-2">Section {i + 1}: {p.heading}</h3>
                <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-3 mb-4 flex gap-3 items-start">
                  <span className="text-xs font-bold bg-indigo-500/20 text-indigo-400 px-2 py-1 rounded">VISUAL</span>
                  <p className="text-sm text-zinc-400 italic">{p.visualCue}</p>
                </div>
                <p className="text-zinc-300 leading-relaxed">{p.content}</p>
              </section>
            ))}

            {/* CTA */}
            <section className="relative pl-6 border-l-2 border-emerald-500">
              <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-emerald-500 border-4 border-zinc-900"></div>
              <h3 className="text-sm font-bold tracking-wider text-emerald-400 uppercase mb-2">Call to Action</h3>
              <p className="text-zinc-300 leading-relaxed font-medium">{result.cta}</p>
            </section>

            {/* Outro */}
            <section className="relative pl-6 border-l-2 border-zinc-700">
              <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-zinc-700 border-4 border-zinc-900"></div>
              <h3 className="text-sm font-bold tracking-wider text-zinc-400 uppercase mb-2">Outro</h3>
              <p className="text-zinc-300 leading-relaxed">{result.outro}</p>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
