import { useState, useEffect } from 'react';
import { generateVidVisionInsight } from '../services/geminiService';
import { Type } from '@google/genai';
import { Loader2, PenTool, Copy, Check, AlertTriangle, Eye, Zap, TrendingDown, Download, Save, X, Clock } from 'lucide-react';
import { cn } from '../lib/utils';

interface ScriptArchitectProps {
  initialTopic?: string;
  onTopicUsed?: () => void;
  channelContext?: {
    id?: string;
    title?: string;
  } | null;
}

type VideoFormat = 'short' | 'long';

interface ScriptBodyParagraph {
  heading: string;
  content: string;
  visualCue: string;
}

interface ScriptResult {
  title: string;
  hook: string;
  intro: string;
  bodyParagraphs: ScriptBodyParagraph[];
  cta: string;
  outro: string;
}

interface RetentionIssue {
  section: string;
  issueType: 'too_long' | 'no_hook' | 'monotonous' | 'lacks_visual_change' | 'complex_language';
  severity: number; // 1-10
  description: string;
  suggestion: string;
  insertAt?: string;
}

interface RetentionAnalysis {
  overallScore: number;
  issues: RetentionIssue[];
  strengths: string[];
  summary: string;
}

interface SavedScript {
  id: string;
  title: string;
  topic: string;
  videoFormat: string;
  targetLength: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

const DEFAULT_TOPIC_PLACEHOLDER = 'e.g., The history of mechanical keyboards';
const DAILY_PLACEHOLDER_CACHE_KEY = 'vid_vision_script_daily_placeholder';
const SCRIPT_ARCHITECT_SYSTEM_INSTRUCTION = `You are Janso Studio's Script Architect.

You only generate spoken YouTube scripts, not SEO metadata.

Rules:
- Return only the requested JSON structure.
- Do not include hashtags anywhere.
- Do not include tag lists, keyword lists, or title dumps.
- Keep language natural and spoken, optimized for retention.
- Respect the requested format (short or long-form) and target final length.`;

function sanitizeText(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }

  return value
    .replace(/#[A-Za-z0-9_]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function sanitizeChannelMentions(value: string, channelName?: string): string {
  const normalizedChannelName = (channelName || '').trim();
  const isJansoStudioChannel = /janso\s*studio/i.test(normalizedChannelName);

  if (isJansoStudioChannel) {
    return value;
  }

  const replacementName = normalizedChannelName || 'your channel';

  return value
    .replace(/\bvid\s*visionaries\b/gi, 'everyone')
    .replace(/\bvid\s*vision\b/gi, replacementName)
    .replace(/\btube\s*vision\b/gi, replacementName)
    .replace(/\bjanso\s*studio\b/gi, replacementName)
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function normalizeParagraph(value: unknown, channelName?: string): ScriptBodyParagraph | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const paragraph = value as Record<string, unknown>;
  const heading = sanitizeChannelMentions(sanitizeText(paragraph.heading), channelName);
  const content = sanitizeChannelMentions(sanitizeText(paragraph.content), channelName);
  const visualCue = sanitizeChannelMentions(sanitizeText(paragraph.visualCue), channelName);

  if (!heading && !content && !visualCue) {
    return null;
  }

  return {
    heading: heading || 'Main Point',
    content: content || 'Expand this point with a concrete example and clear takeaway.',
    visualCue: visualCue || 'Supporting b-roll or on-screen text',
  };
}

function normalizeScriptResult(value: unknown, channelName?: string): ScriptResult | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const data = value as Record<string, unknown>;
  const title = sanitizeChannelMentions(sanitizeText(data.title), channelName);
  const hook = sanitizeChannelMentions(sanitizeText(data.hook), channelName);
  const intro = sanitizeChannelMentions(sanitizeText(data.intro), channelName);
  const cta = sanitizeChannelMentions(sanitizeText(data.cta), channelName);
  const outro = sanitizeChannelMentions(sanitizeText(data.outro), channelName);

  const bodyParagraphs = Array.isArray(data.bodyParagraphs)
    ? data.bodyParagraphs
        .map((paragraph) => normalizeParagraph(paragraph, channelName))
        .filter((paragraph): paragraph is ScriptBodyParagraph => Boolean(paragraph))
    : [];

  if (!title || !hook || !intro || !cta || !outro || bodyParagraphs.length === 0) {
    return null;
  }

  return {
    title,
    hook,
    intro,
    bodyParagraphs,
    cta,
    outro,
  };
}

export default function ScriptArchitect({ initialTopic, onTopicUsed, channelContext }: ScriptArchitectProps = {}) {
  const [topic, setTopic] = useState('');
  const [videoFormat, setVideoFormat] = useState<VideoFormat | ''>('');
  const [targetLengthValue, setTargetLengthValue] = useState('');
  const [targetLengthUnit, setTargetLengthUnit] = useState<'seconds' | 'minutes'>('seconds');
  const [topicPlaceholder, setTopicPlaceholder] = useState(DEFAULT_TOPIC_PLACEHOLDER);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScriptResult | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [generatedConfig, setGeneratedConfig] = useState<{ videoFormat: VideoFormat; targetLength: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [saveMessage, setSaveMessage] = useState<'success' | 'error' | null>(null);

  // Saved scripts modal state
  const [showSavedScripts, setShowSavedScripts] = useState(false);
  const [savedScripts, setSavedScripts] = useState<SavedScript[]>([]);
  const [loadingSavedScripts, setLoadingSavedScripts] = useState(false);
  const [savedScriptsError, setSavedScriptsError] = useState<string | null>(null);

  // Retention Doctor state
  const [retentionAnalysis, setRetentionAnalysis] = useState<RetentionAnalysis | null>(null);
  const [analyzingRetention, setAnalyzingRetention] = useState(false);
  const [retentionError, setRetentionError] = useState<string | null>(null);

  const connectedChannelName = String(channelContext?.title || '').trim();
  
  // Computed target length string for display and API
  const targetLength = targetLengthValue ? `${targetLengthValue} ${targetLengthUnit}` : '';

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
    const trimmedTopic = topic.trim();
    const trimmedTargetLength = targetLength.trim();

    if (!trimmedTopic || !videoFormat || !trimmedTargetLength) {
      setGenerationError('Please enter a topic, choose short or long-form, and set a required final length.');
      return;
    }

    const requestedFormat: VideoFormat = videoFormat;

    setGenerationError(null);
    setResult(null);
    setGeneratedConfig(null);
    setLoading(true);
    try {
      const schema = {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING, description: 'Clean title text only. Never use hashtags.' },
          hook: { type: Type.STRING, description: 'Opening lines only. Never use hashtags.' },
          intro: { type: Type.STRING, description: 'Set expectation and context. Never use hashtags.' },
          bodyParagraphs: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                heading: { type: Type.STRING },
                content: { type: Type.STRING },
                visualCue: { type: Type.STRING, description: 'What should be on screen?' }
              },
              required: ['heading', 'content', 'visualCue']
            }
          },
          cta: { type: Type.STRING, description: "Call to action (subscribe, next video, etc.)" },
          outro: { type: Type.STRING }
        },
        required: ['title', 'hook', 'intro', 'bodyParagraphs', 'cta', 'outro']
      };

      const formatLabel = requestedFormat === 'short' ? 'YouTube Short' : 'Long-form YouTube video';
      const pacingGuidance = requestedFormat === 'short'
        ? 'Keep momentum high with concise lines, quick transitions, and immediate payoff. Avoid filler.'
        : 'Use deliberate pacing with smooth transitions, examples, and retention hooks between sections.';
      const bodySectionGuidance = requestedFormat === 'short'
        ? 'Limit body sections to 2-3 compact sections.'
        : 'Use 4-6 clear body sections with rising value.';

      const prompt = `Act as a master YouTube scriptwriter. Write a highly engaging, retention-optimized script for a ${formatLabel} about: "${trimmedTopic}".

      Strict requirements:
      - Required final script length: ${trimmedTargetLength}
      - ${pacingGuidance}
      - ${bodySectionGuidance}
      - Include a strong hook, clear transitions, visual cues for the editor, and a compelling call to action.
      - Ensure the final spoken script fits the required final length.
      - Do not include hashtags, tag lists, SEO metadata, or keyword dumps.
      - App name is "Janso Studio" and must never be treated as the creator's channel identity.
      - Connected creator channel name: ${connectedChannelName || 'Not connected'}
      - If a greeting is used, address the audience neutrally ("everyone", "friends") or based on the connected channel identity only.
      - Never use "Janso Studio" as an audience nickname unless the connected channel name itself is exactly Janso Studio.
      - Return only JSON matching the schema.`;
      
      const response = await generateVidVisionInsight(prompt, schema, {
        systemInstruction: SCRIPT_ARCHITECT_SYSTEM_INSTRUCTION,
      });

      if (response) {
        const parsed = JSON.parse(response);
        const normalized = normalizeScriptResult(parsed, connectedChannelName);
        if (!normalized) {
          throw new Error('Invalid script payload');
        }

        setResult(normalized);
        setGeneratedConfig({ videoFormat: requestedFormat, targetLength: trimmedTargetLength });
      }
    } catch (error: any) {
      console.error(error);

      if (error?.message?.includes('Invalid script payload')) {
        setGenerationError('The AI returned an invalid script format. Please generate again.');
      } else {
        setGenerationError('Failed to generate script. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    if (!result) return;

    const text = buildScriptText();
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const buildScriptText = () => {
    if (!result) return '';
    
    const scriptFormatLabel = generatedConfig?.videoFormat === 'short' ? 'Short-form' : 'Long-form';
    const scriptLengthLabel = generatedConfig?.targetLength || 'Not specified';
    const hookRange = generatedConfig?.videoFormat === 'short' ? '0:00 - 0:03' : '0:00 - 0:30';
    
    let text = `# ${result.title}\n\n`;
    text += `## FORMAT\n${scriptFormatLabel}\n\n`;
    text += `## TARGET LENGTH\n${scriptLengthLabel}\n\n`;
    text += `## HOOK (${hookRange})\n${result.hook}\n\n`;
    text += `## INTRO\n${result.intro}\n\n`;
    
    result.bodyParagraphs.forEach((p, i) => {
      text += `## SECTION ${i + 1}: ${p.heading}\n`;
      text += `[VISUAL CUE: ${p.visualCue}]\n`;
      text += `${p.content}\n\n`;
    });
    
    text += `## CALL TO ACTION\n${result.cta}\n\n`;
    text += `## OUTRO\n${result.outro}`;
    
    return text;
  };

  const downloadScript = () => {
    if (!result) return;
    
    const text = buildScriptText();
    const timestamp = new Date().toISOString().slice(0, 10);
    const filename = `script-${result.title.toLowerCase().replace(/\s+/g, '-')}-${timestamp}.txt`;
    
    const element = document.createElement('a');
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
    element.setAttribute('download', filename);
    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const saveScriptToStorage = async () => {
    if (!result || !generatedConfig) return;
    
    setSaveMessage(null);
    try {
      const script = {
        title: result.title,
        topic: topic,
        videoFormat: generatedConfig.videoFormat,
        targetLength: generatedConfig.targetLength,
        content: buildScriptText(),
      };
      
      const response = await fetch('/api/user/scripts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(script),
      });

      if (!response.ok) {
        setSaveMessage('error');
        setTimeout(() => setSaveMessage(null), 2000);
        return;
      }

      setSaveMessage('success');
      setTimeout(() => setSaveMessage(null), 2000);
    } catch (error) {
      console.error('Failed to save script:', error);
      setSaveMessage('error');
      setTimeout(() => setSaveMessage(null), 2000);
    }
  };

  const fetchSavedScripts = async () => {
    setLoadingSavedScripts(true);
    setSavedScriptsError(null);
    try {
      const response = await fetch('/api/user/scripts');
      if (!response.ok) {
        setSavedScriptsError('Failed to load saved scripts');
        return;
      }

      const data = await response.json();
      setSavedScripts(Array.isArray(data?.scripts) ? data.scripts : []);
    } catch (error) {
      console.error('Failed to fetch saved scripts:', error);
      setSavedScriptsError('Failed to load saved scripts');
    } finally {
      setLoadingSavedScripts(false);
    }
  };

  const loadSavedScript = (script: SavedScript) => {
    setTopic(script.topic);
    setVideoFormat(script.videoFormat as VideoFormat);
    setTargetLengthValue(script.targetLength.split(' ')[0]);
    setTargetLengthUnit(script.targetLength.includes('minute') ? 'minutes' : 'seconds');
    
    // Parse the content back to extract the result
    // The content is in the format we build, so we extract sections
    const lines = script.content.split('\n').filter((line: string) => line.trim());
    
    // For now, just show a message that the script was loaded
    // In a full implementation, you'd parse and restore the full result object
    console.log('Loaded script:', script.title);
    
    setShowSavedScripts(false);
  };

  const openSavedScripts = () => {
    setShowSavedScripts(true);
    fetchSavedScripts();
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
        <div className="space-y-4">
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder={topicPlaceholder}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-2">
                Script Format
              </label>
              <div className="inline-flex items-center gap-1 rounded-full border border-zinc-800/80 bg-zinc-950/80 p-1 shadow-sm shadow-black/20">
                <button
                  type="button"
                  onClick={() => setVideoFormat('short')}
                  className={cn(
                    'rounded-full px-4 py-2 text-sm font-medium transition-all',
                    videoFormat === 'short'
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-950/40'
                      : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/5'
                  )}
                  aria-pressed={videoFormat === 'short'}
                >
                  Short
                </button>
                <button
                  type="button"
                  onClick={() => setVideoFormat('long')}
                  className={cn(
                    'rounded-full px-4 py-2 text-sm font-medium transition-all',
                    videoFormat === 'long'
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-950/40'
                      : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/5'
                  )}
                  aria-pressed={videoFormat === 'long'}
                >
                  Long-form
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-2">
                Required Final Length
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={targetLengthValue}
                  onChange={(e) => setTargetLengthValue(e.target.value)}
                  placeholder={videoFormat === 'short' ? '45' : '8'}
                  className="flex-1 bg-zinc-950/80 border border-zinc-800/80 rounded-full px-4 py-2.5 text-zinc-100 shadow-sm shadow-black/20 transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50"
                  onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
                />
                <div className="inline-flex items-center gap-1 rounded-full border border-zinc-800/80 bg-zinc-950/80 p-1 shadow-sm shadow-black/20">
                  <button
                    type="button"
                    onClick={() => setTargetLengthUnit('seconds')}
                    className={cn(
                      'rounded-full px-4 py-2 text-sm font-medium transition-all',
                      targetLengthUnit === 'seconds'
                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-950/40'
                        : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/5'
                    )}
                    aria-pressed={targetLengthUnit === 'seconds'}
                  >
                    Seconds
                  </button>
                  <button
                    type="button"
                    onClick={() => setTargetLengthUnit('minutes')}
                    className={cn(
                      'rounded-full px-4 py-2 text-sm font-medium transition-all',
                      targetLengthUnit === 'minutes'
                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-950/40'
                        : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/5'
                    )}
                    aria-pressed={targetLengthUnit === 'minutes'}
                  >
                    Minutes
                  </button>
                </div>
              </div>
            </div>
          </div>

          {generationError && (
            <p className="text-sm text-rose-400">{generationError}</p>
          )}

          <div className="flex gap-3">
            <button
              onClick={handleGenerate}
              disabled={loading || !topic.trim() || !videoFormat || !targetLengthValue.trim()}
              className="w-full md:w-auto bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-2.5 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors"
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : <PenTool size={18} />}
              Draft Script
            </button>
            <button
              onClick={openSavedScripts}
              className="md:w-auto bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-6 py-2.5 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors"
            >
              <Clock size={18} />
              Saved Scripts
            </button>
          </div>
        </div>
      </div>

      {result && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-zinc-800 bg-zinc-900/50 flex justify-between items-center sticky top-0 z-10">
            <div>
              <h2 className="text-xl font-bold text-zinc-100">{result.title}</h2>
              {generatedConfig && (
                <p className="text-xs text-zinc-400 mt-1">
                  {generatedConfig.videoFormat === 'short' ? 'Short-form' : 'Long-form'} • Target length: {generatedConfig.targetLength}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={copyToClipboard}
                className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                {copied ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
                {copied ? 'Copied!' : 'Copy'}
              </button>
              <button 
                onClick={downloadScript}
                className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                title="Download as .txt file"
              >
                <Download size={16} />
                Download
              </button>
              <button 
                onClick={saveScriptToStorage}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                title="Save to browser storage"
              >
                {saveMessage === 'success' ? <Check size={16} className="text-emerald-400" /> : <Save size={16} />}
                {saveMessage === 'success' ? 'Saved!' : 'Save'}
              </button>
            </div>
          </div>
          
          <div className="p-6 space-y-8">
            {/* Hook */}
            <section className="relative pl-6 border-l-2 border-indigo-500">
              <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-indigo-500 border-4 border-zinc-900"></div>
              <h3 className="text-sm font-bold tracking-wider text-indigo-400 uppercase mb-2">
                The Hook ({generatedConfig?.videoFormat === 'short' ? '0:00 - 0:03' : '0:00 - 0:30'})
              </h3>
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

      {/* Saved Scripts Modal */}
      {showSavedScripts && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowSavedScripts(false)}
          />

          {/* Sidebar */}
          <div className="absolute right-0 top-0 h-full w-full max-w-md bg-zinc-950 border-l border-zinc-800 shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
            {/* Header */}
            <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between">
              <h2 className="text-lg font-bold text-zinc-100">Saved Scripts</h2>
              <button
                onClick={() => setShowSavedScripts(false)}
                className="text-zinc-400 hover:text-zinc-100 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
              {loadingSavedScripts ? (
                <div className="flex items-center justify-center h-32">
                  <Loader2 size={24} className="animate-spin text-indigo-500" />
                </div>
              ) : savedScriptsError ? (
                <div className="p-6 text-center">
                  <p className="text-sm text-rose-400">{savedScriptsError}</p>
                </div>
              ) : savedScripts.length === 0 ? (
                <div className="p-6 text-center">
                  <p className="text-sm text-zinc-400">No saved scripts yet</p>
                </div>
              ) : (
                <div className="space-y-2 p-4">
                  {savedScripts.map((script) => (
                    <button
                      key={script.id}
                      onClick={() => loadSavedScript(script)}
                      className="w-full text-left p-4 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 transition-colors group"
                    >
                      <h3 className="font-medium text-zinc-100 group-hover:text-indigo-400 truncate">
                        {script.title}
                      </h3>
                      <p className="text-xs text-zinc-500 mt-1 truncate">{script.topic}</p>
                      <div className="flex items-center gap-2 mt-2 text-xs text-zinc-400">
                        <span className="px-2 py-1 bg-zinc-800 rounded">
                          {script.videoFormat === 'short' ? 'Short' : 'Long'}
                        </span>
                        <span className="px-2 py-1 bg-zinc-800 rounded">
                          {script.targetLength}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-500 mt-2">
                        {new Date(script.updatedAt).toLocaleDateString()}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
