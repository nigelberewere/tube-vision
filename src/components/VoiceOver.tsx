import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, Modality } from '@google/genai';
import { Play, Square, Download, Loader2, Volume2, Sparkles, Pause, Tags, Plus, Wand2, Sliders, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const VOICES = ['Algenib', 'Kore', 'Puck', 'Charon', 'Fenrir', 'Zephyr', 'Aoede', 'Orus'];
const TAGS = [
  '[Whispering]', '[Serious]', '[Excited]', '[Sad]', '[Angry]',
  '[Happy]', '[Sarcastic]', '[Confident]', '[Fearful]',
  '[Chuckle]', '[Laugh]', '[Sigh]', '[Gasp]', '[Breath]',
  '[Fast]', '[Slow]', '[Loud]', '[Soft]', '[Shouting]',
  '[Pause]', '[Pause 1s]', '[Pause 2s]'
];

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

function createWavFile(base64Data: string, sampleRate: number = 24000): Blob {
  const binaryString = atob(base64Data);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  if (bytes.length > 4 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) {
    return new Blob([bytes], { type: 'audio/wav' });
  }

  const buffer = new ArrayBuffer(44 + bytes.length);
  const view = new DataView(buffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + bytes.length, true);
  writeString(view, 8, 'WAVE');

  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);

  writeString(view, 36, 'data');
  view.setUint32(40, bytes.length, true);

  const pcmData = new Uint8Array(buffer, 44);
  pcmData.set(bytes);

  return new Blob([buffer], { type: 'audio/wav' });
}

export default function VoiceOver() {
  const [script, setScript] = useState('In a world where silence was the only currency, [Pause] one voice dared to speak... [Whispering] and it changed everything.');
  const [voice, setVoice] = useState(VOICES[0]);
  const [pitch, setPitch] = useState(0);
  const [speed, setSpeed] = useState(1.0);
  const [volume, setVolume] = useState(1.0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSmartTagging, setIsSmartTagging] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flashEditor, setFlashEditor] = useState(false);
  const [previewingVoice, setPreviewingVoice] = useState<string | null>(null);
  const [playingPreview, setPlayingPreview] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  
  const audioRef = useRef<HTMLAudioElement>(null);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (textAreaRef.current) {
      textAreaRef.current.style.height = 'auto';
      textAreaRef.current.style.height = `${textAreaRef.current.scrollHeight}px`;
    }
  }, [script]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleEnded = () => setIsPlaying(false);
    const handlePause = () => setIsPlaying(false);
    const handlePlay = () => setIsPlaying(true);
    const handleLoadedMetadata = () => setDuration(audio.duration);
    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);

    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);

    return () => {
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
    };
  }, [audioUrl]);

  const handlePreviewVoice = async (e: React.MouseEvent, voiceName: string) => {
    e.stopPropagation();
    if (previewingVoice || playingPreview) {
      if (playingPreview === voiceName && previewAudioRef.current) {
        previewAudioRef.current.pause();
        setPlayingPreview(null);
      }
      return;
    }
    
    setPreviewingVoice(voiceName);
    try {
      const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: `Say cheerfully: Hi, I am ${voiceName}.` }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: voiceName },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        const blob = createWavFile(base64Audio, 24000);
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        previewAudioRef.current = audio;
        
        audio.onended = () => setPlayingPreview(null);
        audio.onpause = () => setPlayingPreview(null);
        
        setPreviewingVoice(null);
        setPlayingPreview(voiceName);
        audio.play();
      } else {
        setPreviewingVoice(null);
      }
    } catch (err) {
      console.error("Preview Error:", err);
      setPreviewingVoice(null);
    }
  };

  const insertTag = (tag: string) => {
    const textArea = textAreaRef.current;
    if (!textArea) {
      setScript(prev => prev + ' ' + tag);
      return;
    }

    const start = textArea.selectionStart;
    const end = textArea.selectionEnd;
    const newText = script.substring(0, start) + tag + script.substring(end);
    
    setScript(newText);
    
    setFlashEditor(true);
    setTimeout(() => setFlashEditor(false), 300);
    
    setTimeout(() => {
      textArea.focus();
      textArea.setSelectionRange(start + tag.length, start + tag.length);
    }, 0);
  };

  const handleSmartTagging = async () => {
    if (!script.trim()) return;
    setIsSmartTagging(true);
    setError(null);
    
    try {
      const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: script,
        config: {
          systemInstruction: "Analyze this script and identify the most dramatic, emotional, tense, or expressive moments. Automatically wrap the text in appropriate expressive tags like [Whispering], [Serious], [Excited], [Sad], [Angry], [Happy], [Breath], or [Pause 1s] to enhance the vocal delivery. Return only the tagged script without any additional commentary."
        }
      });
      
      if (response.text) {
        setScript(response.text.trim());
      }
    } catch (err: any) {
      console.error("Smart Tagging Error:", err);
      setError(err.message || "Failed to generate smart tags.");
    } finally {
      setIsSmartTagging(false);
    }
  };

  const handleGenerate = async () => {
    if (!script.trim()) return;
    
    setIsGenerating(true);
    setError(null);
    setAudioUrl(null);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);

    try {
      const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });
      
      const pitchInstruction = pitch !== 0 ? ` Adjust pitch to be ${pitch > 0 ? 'higher' : 'deeper'}.` : '';
      const speedInstruction = speed !== 1.0 ? ` Speak at ${speed}x speed.` : '';
      const volumeInstruction = volume !== 1.0 ? ` Speak ${volume > 1.0 ? 'louder' : 'softer'}.` : '';
      
      const instructions = [pitchInstruction, speedInstruction, volumeInstruction].filter(Boolean).join('');
      const tagInstruction = " IMPORTANT: Bracketed tags like [Whisper], [Laugh], or [Sad] apply ONLY to the sentence or paragraph immediately following them. Return to normal speaking for subsequent sentences unless another tag is present.";
      const prompt = `Say expressively${instructions}.${tagInstruction} Text: ${script}`;
      
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: prompt }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: voice },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      
      if (base64Audio) {
        const blob = createWavFile(base64Audio, 24000);
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
      } else {
        throw new Error("No audio data returned from the model.");
      }
    } catch (err: any) {
      console.error("TTS Error:", err);
      setError(err.message || "Failed to generate speech.");
    } finally {
      setIsGenerating(false);
    }
  };

  const togglePlay = () => {
    if (!audioRef.current || !audioUrl) return;
    
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
  };

  const handleScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    if (highlightRef.current) {
      highlightRef.current.scrollTop = e.currentTarget.scrollTop;
      highlightRef.current.scrollLeft = e.currentTarget.scrollLeft;
    }
  };

  const formatTime = (seconds: number): string => {
    if (!isFinite(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = x / rect.width;
    const newTime = percentage * duration;
    audioRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const renderHighlightedText = (text: string) => {
    const parts = text.split(/(\[[^\]]+\])/g);
    return parts.map((part, i) => {
      if (part.startsWith('[') && part.endsWith(']')) {
        return <span key={i} className="text-blue-400 bg-blue-500/20 rounded shadow-[0_0_10px_rgba(59,130,246,0.3)]">{part}</span>;
      }
      return <span key={i}>{part}</span>;
    });
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Hero: Script Editor */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card rounded-3xl overflow-hidden relative min-h-[400px] flex flex-col backdrop-blur-xl bg-white/5 border border-white/10"
      >
        {/* Background subtle gradient for hero feel */}
        <div className="absolute inset-0 bg-gradient-to-br from-blue-900/5 to-indigo-900/5 pointer-events-none"></div>
        
        <div className="relative z-10 p-8 flex-1 flex flex-col">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-white tracking-tight">
              Script Editor
            </h2>
            <div className="flex items-center gap-3">
              <motion.button 
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setScript('')}
                disabled={!script.trim()}
                className="text-xs font-medium text-slate-400 hover:text-white px-3 py-2 rounded-xl flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-white/5 hover:bg-white/10"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Clear
              </motion.button>
              <motion.button 
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleSmartTagging}
                disabled={isSmartTagging || !script.trim()}
                className="text-xs font-medium text-white bg-white/10 hover:bg-white/20 px-4 py-2 rounded-xl flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-white/5"
              >
                {isSmartTagging ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
                Smart Tagging
              </motion.button>
            </div>
          </div>
          
          <motion.div 
            animate={flashEditor ? { scale: [1, 1.01, 1], borderColor: ['rgba(255,255,255,0.05)', 'rgba(255,255,255,0.2)', 'rgba(255,255,255,0.05)'] } : {}}
            transition={{ duration: 0.3 }}
            className={`relative flex-1 bg-black/20 rounded-2xl border border-white/5 focus-within:border-white/20 transition-colors overflow-hidden ${flashEditor ? 'bg-white/5' : ''}`}
          >
            <div 
              ref={highlightRef}
              className="absolute inset-0 p-6 text-lg leading-relaxed whitespace-pre-wrap break-words pointer-events-none text-slate-300 overflow-hidden font-mono"
              aria-hidden="true"
            >
              {renderHighlightedText(script)}
              {script.endsWith('\n') ? <br/> : null}
            </div>
            <textarea
              ref={textAreaRef}
              value={script}
              onChange={(e) => {
                setScript(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = `${e.target.scrollHeight}px`;
              }}
              onScroll={handleScroll}
              placeholder="Enter your script here..."
              className="w-full h-full min-h-[200px] p-6 text-lg leading-relaxed whitespace-pre-wrap break-words resize-none outline-none bg-transparent text-transparent caret-white font-mono overflow-hidden"
              spellCheck="false"
            />
          </motion.div>

          <AnimatePresence>
            {error && (
              <motion.div 
                initial={{ opacity: 0, height: 0, marginTop: 0 }}
                animate={{ opacity: 1, height: 'auto', marginTop: 16 }}
                exit={{ opacity: 0, height: 0, marginTop: 0 }}
                className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm shrink-0"
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="mt-6 flex flex-col sm:flex-row gap-4 items-center">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleGenerate}
              disabled={isGenerating || !script.trim()}
              className="bg-white text-black hover:bg-slate-200 font-medium text-sm py-3 px-6 rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0 w-full sm:w-auto"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Synthesizing...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Generate Audio
                </>
              )}
            </motion.button>
            
            {/* Audio Player */}
            <AnimatePresence>
              {audioUrl && (
                <motion.div 
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="flex-1 w-full flex flex-col gap-2 bg-black/20 rounded-xl p-3 border border-white/5"
                >
                  <div className="flex items-center gap-3">
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={togglePlay}
                      className="w-10 h-10 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors shrink-0"
                    >
                      {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
                    </motion.button>
                    
                    <div className="flex-1 flex flex-col gap-1.5">
                      <div 
                        onClick={handleProgressClick}
                        className="relative h-2 rounded-full bg-white/10 overflow-hidden cursor-pointer group"
                      >
                        <motion.div 
                          className="absolute inset-y-0 left-0 bg-white rounded-full"
                          style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }}
                          transition={{ duration: 0.1 }}
                        />
                        <div className="absolute inset-0 bg-white/0 group-hover:bg-white/5 transition-colors" />
                      </div>
                      <div className="flex justify-between items-center px-1">
                        <span className="text-[10px] font-mono text-slate-400">
                          {formatTime(currentTime)}
                        </span>
                        <span className="text-[10px] font-mono text-slate-500">
                          {formatTime(duration)}
                        </span>
                      </div>
                    </div>
                    
                    <a 
                      href={audioUrl} 
                      download="tube-vision-voice.wav"
                      className="w-10 h-10 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white flex items-center justify-center transition-colors shrink-0"
                      title="Download Audio"
                    >
                      <Download className="w-4 h-4" />
                    </a>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>

      {/* Grid below for Tag Library, Voice Selection, Settings */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Tag Library */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass-card rounded-3xl p-6 flex flex-col h-[400px] backdrop-blur-xl bg-white/5 border border-white/10"
        >
          <h3 className="text-sm font-medium text-slate-400 mb-4 flex items-center gap-2">
            <Tags className="w-4 h-4" />
            Tag Library
          </h3>
          <div className="flex-1 overflow-y-auto pr-2 flex flex-col gap-2">
            {TAGS.map((tag, i) => (
              <motion.button
                whileHover={{ scale: 1.02, x: 4 }}
                whileTap={{ scale: 0.98 }}
                key={tag}
                onClick={() => insertTag(tag)}
                className="w-full px-4 py-3 rounded-xl text-sm font-mono text-left transition-colors text-slate-300 bg-white/5 hover:bg-white/10 border border-transparent hover:border-white/10 flex items-center justify-between group shrink-0"
              >
                <span>{tag}</span>
                <Plus className="w-4 h-4 opacity-0 group-hover:opacity-100 text-slate-400 transition-opacity" />
              </motion.button>
            ))}
          </div>
        </motion.div>

        {/* Voice Selection */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="glass-card rounded-3xl p-6 flex flex-col h-[400px] backdrop-blur-xl bg-white/5 border border-white/10"
        >
          <h3 className="text-sm font-medium text-slate-400 mb-4 flex items-center gap-2">
            <Volume2 className="w-4 h-4" />
            Voice Model
          </h3>
          <div className="flex-1 overflow-y-auto pr-2 flex flex-col gap-2">
            {VOICES.map((v) => (
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                key={v}
                onClick={() => setVoice(v)}
                className={`px-4 py-3 rounded-xl text-sm font-medium transition-colors border flex items-center justify-between group shrink-0 ${
                  voice === v 
                    ? 'bg-white/10 text-white border-white/20' 
                    : 'bg-transparent border-transparent text-slate-400 hover:bg-white/5 hover:text-slate-200'
                }`}
              >
                <span>{v}</span>
                <div 
                  onClick={(e) => handlePreviewVoice(e, v)}
                  className={`p-1.5 rounded-lg transition-colors ${
                    playingPreview === v || previewingVoice === v
                      ? 'text-black bg-white'
                      : voice === v 
                        ? 'text-white hover:bg-white/20' 
                        : 'text-slate-500 hover:bg-white/10 hover:text-white opacity-0 group-hover:opacity-100'
                  }`}
                  title="Preview voice"
                >
                   {previewingVoice === v ? (
                     <Loader2 className="w-3.5 h-3.5 animate-spin" />
                   ) : playingPreview === v ? (
                     <Square className="w-3.5 h-3.5 fill-current" />
                   ) : (
                     <Volume2 className="w-3.5 h-3.5" />
                   )}
                </div>
              </motion.button>
            ))}
          </div>
        </motion.div>

        {/* Settings */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="glass-card rounded-3xl p-6 flex flex-col h-[400px] backdrop-blur-xl bg-white/5 border border-white/10"
        >
          <h3 className="text-sm font-medium text-slate-400 mb-6 flex items-center gap-2">
            <Sliders className="w-4 h-4" />
            Parameters
          </h3>
          <div className="flex flex-col gap-8">
            {/* Pitch */}
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <label className="text-sm font-medium text-slate-300">Pitch</label>
                <span className="text-xs font-mono text-slate-500 bg-black/20 px-2 py-1 rounded-md">{pitch > 0 ? '+' : ''}{pitch.toFixed(1)}</span>
              </div>
              <input 
                type="range" 
                min="-1.0" 
                max="1.0" 
                step="0.1"
                value={pitch}
                onChange={(e) => setPitch(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-white hover:accent-slate-200 transition-colors"
              />
              <div className="flex justify-between mt-2">
                <span className="text-[10px] font-bold text-slate-500 uppercase">Deep</span>
                <span className="text-[10px] font-bold text-slate-500 uppercase">Normal</span>
                <span className="text-[10px] font-bold text-slate-500 uppercase">High</span>
              </div>
            </div>

            {/* Speed */}
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <label className="text-sm font-medium text-slate-300">Speed</label>
                <span className="text-xs font-mono text-slate-500 bg-black/20 px-2 py-1 rounded-md">{speed.toFixed(1)}x</span>
              </div>
              <input 
                type="range" 
                min="0.5" 
                max="2.0" 
                step="0.1"
                value={speed}
                onChange={(e) => setSpeed(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-white hover:accent-slate-200 transition-colors"
              />
              <div className="flex justify-between mt-2">
                <span className="text-[10px] font-bold text-slate-500 uppercase">Slow</span>
                <span className="text-[10px] font-bold text-slate-500 uppercase">1.0x</span>
                <span className="text-[10px] font-bold text-slate-500 uppercase">Fast</span>
              </div>
            </div>

            {/* Volume */}
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <label className="text-sm font-medium text-slate-300">Volume</label>
                <span className="text-xs font-mono text-slate-500 bg-black/20 px-2 py-1 rounded-md">{Math.round(volume * 100)}%</span>
              </div>
              <input 
                type="range" 
                min="0.5" 
                max="1.5" 
                step="0.1"
                value={volume}
                onChange={(e) => setVolume(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-white hover:accent-slate-200 transition-colors"
              />
              <div className="flex justify-between mt-2">
                <span className="text-[10px] font-bold text-slate-500 uppercase">Quiet</span>
                <span className="text-[10px] font-bold text-slate-500 uppercase">100%</span>
                <span className="text-[10px] font-bold text-slate-500 uppercase">Loud</span>
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      <audio ref={audioRef} src={audioUrl || undefined} className="hidden" />
    </div>
  );
}
