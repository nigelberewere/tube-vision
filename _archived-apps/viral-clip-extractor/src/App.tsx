import React, { useState, useRef } from 'react';
import { Scissors, Loader2, Play, TrendingUp, Hash, Video, AlertCircle, Upload, Link as LinkIcon, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Clip } from './services/gemini';
import { cutVideo } from './services/ffmpeg';
import JSZip from 'jszip';

export default function App() {
  const [inputType, setInputType] = useState<'upload' | 'youtube'>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  
  const [clips, setClips] = useState<Clip[]>([]);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const [error, setError] = useState<string | null>(null);
  
  const [cuttingClip, setCuttingClip] = useState<number | null>(null);
  const [cutProgress, setCutProgress] = useState<number>(0);
  const [cutUrls, setCutUrls] = useState<Record<number, string>>({});
  const [isZipping, setIsZipping] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAnalyze = async () => {
    if (inputType === 'upload' && !file) return;
    if (inputType === 'youtube' && !youtubeUrl.trim()) return;
    
    setLoading(true);
    setError(null);
    setClips([]);
    setVideoUrl(null);
    setCutUrls({});
    
    try {
      setLoadingStep('Uploading and analyzing video with Gemini... This may take a few minutes.');
      
      const formData = new FormData();
      if (inputType === 'upload' && file) {
        formData.append('video', file);
      } else if (inputType === 'youtube') {
        formData.append('youtubeUrl', youtubeUrl);
      }
      
      const response = await fetch('/api/analyze', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to analyze video');
      }
      
      const data = await response.json();
      setClips(data.clips);
      setVideoUrl(data.videoUrl);
      
    } catch (err: any) {
      setError(err.message || "An error occurred while analyzing the video.");
    } finally {
      setLoading(false);
      setLoadingStep('');
    }
  };

  const handleCutClip = async (clip: Clip): Promise<string | null> => {
    if (!videoUrl) return null;
    
    setCuttingClip(clip.clipNumber);
    setCutProgress(0);
    
    try {
      const url = await cutVideo(videoUrl, clip.startTime, clip.endTime, (progress) => {
        setCutProgress(Math.round(progress * 100));
      });
      
      setCutUrls(prev => ({ ...prev, [clip.clipNumber]: url }));
      return url;
    } catch (err: any) {
      console.error('Failed to cut video:', err);
      alert('Failed to cut video: ' + err.message);
      return null;
    } finally {
      setCuttingClip(null);
    }
  };

  const handleDownloadAll = async () => {
    if (clips.length === 0 || !videoUrl) return;
    
    setIsZipping(true);
    const zip = new JSZip();
    const folder = zip.folder("viral-clips");
    
    try {
      for (const clip of clips) {
        let url = cutUrls[clip.clipNumber];
        
        // If not already cut, cut it now
        if (!url) {
          url = await handleCutClip(clip) || '';
          if (!url) continue;
        }
        
        const response = await fetch(url);
        const blob = await response.blob();
        folder?.file(`clip-${clip.clipNumber}-${clip.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.mp4`, blob);
      }
      
      const content = await zip.generateAsync({ type: "blob" });
      const zipUrl = URL.createObjectURL(content);
      
      const link = document.createElement('a');
      link.href = zipUrl;
      link.download = "viral-clips-collection.zip";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
    } catch (err: any) {
      console.error("Error creating zip:", err);
      alert("Failed to create ZIP: " + err.message);
    } finally {
      setIsZipping(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 font-sans selection:bg-indigo-100 selection:text-indigo-900">
      <header className="bg-white border-b border-zinc-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white shadow-sm">
              <Scissors size={18} />
            </div>
            <h1 className="font-semibold text-lg tracking-tight">Viral Clip Extractor</h1>
          </div>
          
          {clips.length > 0 && (
            <button
              onClick={handleDownloadAll}
              disabled={isZipping || cuttingClip !== null}
              className="bg-zinc-900 hover:bg-zinc-800 disabled:bg-zinc-200 disabled:text-zinc-400 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-2 shadow-sm"
            >
              {isZipping ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Creating ZIP...
                </>
              ) : (
                <>
                  <Download size={16} />
                  Export All (.zip)
                </>
              )}
            </button>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-5 flex flex-col sticky top-24">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-medium text-zinc-800 flex items-center gap-2">
                <Video size={18} className="text-zinc-400" />
                Source Video
              </h2>
            </div>
            
            <div className="flex bg-zinc-100 p-1 rounded-xl mb-6">
              <button
                className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2 ${inputType === 'upload' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}
                onClick={() => setInputType('upload')}
              >
                <Upload size={16} /> Upload File
              </button>
              <button
                className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2 ${inputType === 'youtube' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}
                onClick={() => setInputType('youtube')}
              >
                <LinkIcon size={16} /> YouTube Link
              </button>
            </div>

            {inputType === 'upload' ? (
              <div 
                className="border-2 border-dashed border-zinc-200 rounded-xl p-8 text-center hover:bg-zinc-50 transition-colors cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
              >
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  className="hidden" 
                  accept="video/*"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                />
                <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Upload size={24} />
                </div>
                <p className="font-medium text-zinc-900 mb-1">
                  {file ? file.name : 'Click to upload video'}
                </p>
                <p className="text-xs text-zinc-500">
                  {file ? `${(file.size / (1024 * 1024)).toFixed(2)} MB` : 'MP4, MOV, WEBM up to 2GB'}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-700">YouTube URL</label>
                <input
                  type="text"
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                  placeholder="https://youtube.com/watch?v=..."
                  value={youtubeUrl}
                  onChange={(e) => setYoutubeUrl(e.target.value)}
                />
                <p className="text-xs text-zinc-500 mt-2">Note: Downloading YouTube videos might take longer and depends on availability.</p>
              </div>
            )}
            
            <button
              onClick={handleAnalyze}
              disabled={loading || (inputType === 'upload' ? !file : !youtubeUrl.trim())}
              className="mt-6 w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-zinc-200 disabled:text-zinc-400 text-white font-medium py-3 px-4 rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Scissors size={18} />
                  Find Viral Clips
                </>
              )}
            </button>

            {loading && loadingStep && (
              <p className="text-sm text-indigo-600 text-center mt-4 font-medium animate-pulse">
                {loadingStep}
              </p>
            )}

            {error && (
              <div className="mt-4 p-4 bg-red-50 text-red-700 rounded-xl text-sm flex items-start gap-3 border border-red-100">
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                <p>{error}</p>
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-7">
          <AnimatePresence mode="wait">
            {clips.length === 0 && !loading ? (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="h-full flex flex-col items-center justify-center text-center p-12 bg-white rounded-2xl border border-zinc-200 border-dashed min-h-[400px]"
              >
                <div className="w-16 h-16 bg-indigo-50 rounded-full flex items-center justify-center text-indigo-600 mb-4">
                  <TrendingUp size={28} />
                </div>
                <h3 className="text-lg font-medium text-zinc-900 mb-2">Ready to find viral moments</h3>
                <p className="text-zinc-500 max-w-sm text-sm">
                  Upload a video or paste a YouTube link on the left and our AI will identify the most engaging segments optimized for TikTok, Reels, and Shorts.
                </p>
              </motion.div>
            ) : loading ? (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-4"
              >
                {[1, 2, 3].map((i) => (
                  <div key={i} className="bg-white rounded-2xl border border-zinc-200 p-6 animate-pulse">
                    <div className="flex justify-between items-start mb-4">
                      <div className="h-6 bg-zinc-200 rounded w-1/3"></div>
                      <div className="h-6 bg-zinc-200 rounded w-16"></div>
                    </div>
                    <div className="space-y-3">
                      <div className="h-4 bg-zinc-100 rounded w-full"></div>
                      <div className="h-4 bg-zinc-100 rounded w-5/6"></div>
                      <div className="h-4 bg-zinc-100 rounded w-4/6"></div>
                    </div>
                  </div>
                ))}
              </motion.div>
            ) : (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-6"
              >
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold tracking-tight">Extracted Clips</h2>
                  <span className="text-sm font-medium text-zinc-500 bg-zinc-100 px-3 py-1 rounded-full">
                    {clips.length} found
                  </span>
                </div>
                
                <div className="space-y-4">
                  {clips.map((clip, index) => (
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.1 }}
                      key={index}
                      className="bg-white rounded-2xl border border-zinc-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow"
                    >
                      <div className="p-6">
                        <div className="flex items-start justify-between gap-4 mb-4">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider">Clip {clip.clipNumber}</span>
                              <span className="text-zinc-300">•</span>
                              <span className="text-xs font-medium text-zinc-500 flex items-center gap-1">
                                <Play size={12} />
                                {clip.startTime} - {clip.endTime} ({clip.duration}s)
                              </span>
                            </div>
                            <h3 className="text-lg font-semibold text-zinc-900 leading-tight">{clip.title}</h3>
                          </div>
                          
                          <div className="flex flex-col items-end">
                            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 font-bold text-lg border border-emerald-100">
                              {clip.score}
                            </div>
                            <span className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider mt-1">Score</span>
                          </div>
                        </div>

                        <div className="space-y-4">
                          <div className="bg-zinc-50 rounded-xl p-4 border border-zinc-100">
                            <p className="text-sm text-zinc-700 italic">
                              <span className="font-semibold not-italic text-zinc-900 mr-2">Hook:</span>
                              "{clip.hookText}"
                            </p>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <h4 className="text-xs font-bold text-zinc-900 uppercase tracking-wider mb-2">Why it works</h4>
                              <p className="text-sm text-zinc-600 leading-relaxed">{clip.rationale}</p>
                            </div>
                            <div>
                              <h4 className="text-xs font-bold text-zinc-900 uppercase tracking-wider mb-2">Edit Notes</h4>
                              <p className="text-sm text-zinc-600 leading-relaxed">{clip.visualEditNotes}</p>
                            </div>
                          </div>

                          <div className="pt-4 border-t border-zinc-100">
                            <h4 className="text-xs font-bold text-zinc-900 uppercase tracking-wider mb-2">Social Copy</h4>
                            <p className="text-sm font-medium text-zinc-800 mb-2">{clip.headline}</p>
                            <div className="flex flex-wrap gap-2">
                              {clip.hashtags.map((tag, i) => (
                                <span key={i} className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 bg-indigo-50 px-2 py-1 rounded-md">
                                  <Hash size={10} />
                                  {tag.replace('#', '')}
                                </span>
                              ))}
                            </div>
                          </div>

                          {/* Video Player / Cut Button */}
                          <div className="pt-4 border-t border-zinc-100">
                            {cutUrls[clip.clipNumber] ? (
                              <div className="space-y-3">
                                <video 
                                  src={cutUrls[clip.clipNumber]} 
                                  controls 
                                  className="w-full rounded-xl bg-black aspect-video object-contain"
                                />
                                <a 
                                  href={cutUrls[clip.clipNumber]} 
                                  download={`clip-${clip.clipNumber}.mp4`}
                                  className="w-full bg-zinc-900 hover:bg-zinc-800 text-white font-medium py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 text-sm"
                                >
                                  <Download size={16} />
                                  Download Clip
                                </a>
                              </div>
                            ) : (
                              <button
                                onClick={() => handleCutClip(clip)}
                                disabled={cuttingClip !== null}
                                className="w-full bg-white border border-zinc-200 hover:bg-zinc-50 disabled:bg-zinc-50 disabled:text-zinc-400 text-zinc-900 font-medium py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 text-sm"
                              >
                                {cuttingClip === clip.clipNumber ? (
                                  <>
                                    <Loader2 size={16} className="animate-spin" />
                                    Cutting Video... {cutProgress}%
                                  </>
                                ) : (
                                  <>
                                    <Scissors size={16} />
                                    Generate Video Clip
                                  </>
                                )}
                              </button>
                            )}
                          </div>

                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
