import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Download,
  Eye,
  Flame,
  Hash,
  Layers,
  Link as LinkIcon,
  Loader2,
  Play,
  Search,
  Sparkles,
  TrendingUp,
  Upload,
  Video,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import JSZip from 'jszip';
import { Clip } from '../services/viralClipService';
import { fetchWithAI } from '../lib/apiFetch';
import { cutVideo } from '../services/ffmpegService';
import YouTubeShortsIcon from './icons/YouTubeShortsIcon';

type InputType = 'upload' | 'youtube' | 'my-channel';

interface LongFormVideo {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  publishedAt: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  durationSeconds: number;
  durationLabel: string;
  youtubeUrl: string;
}

interface NicheShort {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  channelTitle: string;
  publishedAt: string;
  durationSeconds: number;
  durationLabel: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  viewsPerDay: number;
  engagementRate: number;
  youtubeUrl: string;
}

interface RemixPlan {
  remixAngle: string;
  hook: string;
  titleOptions: string[];
  beatByBeatPlan: string[];
  shotIdeas: string[];
  scriptTemplate: string;
  cta: string;
  hashtagPack: string[];
  originalityGuardrails: string[];
}

function formatCompactNumber(value: number) {
  if (!Number.isFinite(value)) return '0';
  return Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

export default function ViralClipExtractor() {
  const [inputType, setInputType] = useState<InputType>('my-channel');
  const [file, setFile] = useState<File | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState('');

  const [isChannelConnected, setIsChannelConnected] = useState<boolean | null>(null);
  const [loadingChannelVideos, setLoadingChannelVideos] = useState(false);
  const [channelVideos, setChannelVideos] = useState<LongFormVideo[]>([]);
  const [selectedChannelVideoId, setSelectedChannelVideoId] = useState('');

  const [clips, setClips] = useState<Clip[]>([]);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const [error, setError] = useState<string | null>(null);

  const [cuttingClip, setCuttingClip] = useState<number | null>(null);
  const [cutProgress, setCutProgress] = useState<number>(0);
  const [cutUrls, setCutUrls] = useState<Record<number, string>>({});
  const [isZipping, setIsZipping] = useState(false);

  const [nicheQuery, setNicheQuery] = useState('');
  const [nicheShorts, setNicheShorts] = useState<NicheShort[]>([]);
  const [loadingNicheShorts, setLoadingNicheShorts] = useState(false);
  const [nicheError, setNicheError] = useState<string | null>(null);

  const [selectedShort, setSelectedShort] = useState<NicheShort | null>(null);
  const [remixPlan, setRemixPlan] = useState<RemixPlan | null>(null);
  const [loadingRemixPlan, setLoadingRemixPlan] = useState(false);
  const [remixError, setRemixError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedChannelVideo = useMemo(
    () => channelVideos.find((video) => video.id === selectedChannelVideoId) || null,
    [channelVideos, selectedChannelVideoId],
  );

  const ensureChannelVideoSources = async () => {
    setLoadingChannelVideos(true);
    setError(null);

    try {
      const response = await fetch('/api/shorts/my-long-videos');
      if (response.status === 401) {
        setIsChannelConnected(false);
        setChannelVideos([]);
        setSelectedChannelVideoId('');
        return;
      }

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Failed to load your long-form videos');
      }

      const videos = (await response.json()) as LongFormVideo[];
      setIsChannelConnected(true);
      setChannelVideos(videos);
      if (videos.length > 0 && !selectedChannelVideoId) {
        setSelectedChannelVideoId(videos[0].id);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load your long-form videos.');
    } finally {
      setLoadingChannelVideos(false);
    }
  };

  useEffect(() => {
    if (inputType === 'my-channel') {
      ensureChannelVideoSources();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputType]);

  const handleAnalyze = async () => {
    if (inputType === 'upload' && !file) return;
    if (inputType === 'youtube' && !youtubeUrl.trim()) return;
    if (inputType === 'my-channel' && !selectedChannelVideoId) return;

    setLoading(true);
    setError(null);
    setClips([]);
    setVideoUrl(null);
    setCutUrls({});

    try {
      if (inputType === 'my-channel') {
        setLoadingStep('Pulling your selected long-form video and finding Shorts opportunities...');
      } else {
        setLoadingStep('Uploading and analyzing video with Gemini... This may take a few minutes.');
      }

      let response: Response;

      if (inputType === 'upload' && file) {
        const formData = new FormData();
        formData.append('video', file);
        response = await fetchWithAI('/api/analyze', {
          method: 'POST',
          body: formData,
        });
      } else if (inputType === 'youtube') {
        response = await fetchWithAI('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ youtubeUrl: youtubeUrl.trim() }),
        });
      } else {
        response = await fetchWithAI('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ videoId: selectedChannelVideoId }),
        });
      }

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to analyze video');
      }

      const data = await response.json();
      setClips(data.clips || []);
      setVideoUrl(data.videoUrl || null);
    } catch (err: any) {
      setError(err.message || 'An error occurred while analyzing the video.');
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

      setCutUrls((prev) => ({ ...prev, [clip.clipNumber]: url }));
      return url;
    } catch (err: any) {
      console.error('Failed to cut video:', err);
      alert(`Failed to cut video: ${err.message}`);
      return null;
    } finally {
      setCuttingClip(null);
    }
  };

  const handleDownloadAll = async () => {
    if (clips.length === 0 || !videoUrl) return;

    setIsZipping(true);
    const zip = new JSZip();
    const folder = zip.folder('tube-vision-shorts');

    try {
      for (const clip of clips) {
        let url = cutUrls[clip.clipNumber];

        if (!url) {
          url = (await handleCutClip(clip)) || '';
          if (!url) continue;
        }

        const response = await fetch(url);
        const blob = await response.blob();
        folder?.file(`short-${clip.clipNumber}-${clip.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.mp4`, blob);
      }

      const content = await zip.generateAsync({ type: 'blob' });
      const zipUrl = URL.createObjectURL(content);

      const link = document.createElement('a');
      link.href = zipUrl;
      link.download = 'tube-vision-shorts-pack.zip';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err: any) {
      console.error('Error creating zip:', err);
      alert(`Failed to create ZIP: ${err.message}`);
    } finally {
      setIsZipping(false);
    }
  };

  const fetchNicheShorts = async () => {
    if (!nicheQuery.trim()) return;

    setLoadingNicheShorts(true);
    setNicheError(null);
    setNicheShorts([]);
    setSelectedShort(null);
    setRemixPlan(null);
    setRemixError(null);

    try {
      const response = await fetch(`/api/shorts/niche-high-performers?q=${encodeURIComponent(nicheQuery.trim())}`);

      if (response.status === 401) {
        setIsChannelConnected(false);
        throw new Error('Connect your YouTube account to discover high-performing Shorts in your niche.');
      }

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Failed to fetch niche Shorts');
      }

      const data = (await response.json()) as NicheShort[];
      setIsChannelConnected(true);
      setNicheShorts(data);
    } catch (err: any) {
      setNicheError(err.message || 'Failed to fetch high-performing Shorts.');
    } finally {
      setLoadingNicheShorts(false);
    }
  };

  const generateRemixPlan = async (short: NicheShort) => {
    setSelectedShort(short);
    setLoadingRemixPlan(true);
    setRemixError(null);
    setRemixPlan(null);

    try {
      const response = await fetchWithAI('/api/shorts/remix-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          niche: nicheQuery.trim(),
          source: short,
        }),
      });

      if (response.status === 401) {
        setIsChannelConnected(false);
        throw new Error('Connect your YouTube account to generate remix plans.');
      }

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Failed to generate remix plan');
      }

      const plan = (await response.json()) as RemixPlan;
      setRemixPlan(plan);
    } catch (err: any) {
      setRemixError(err.message || 'Failed to generate remix plan.');
    } finally {
      setLoadingRemixPlan(false);
    }
  };

  const canAnalyze =
    !loading &&
    ((inputType === 'upload' && !!file) ||
      (inputType === 'youtube' && !!youtubeUrl.trim()) ||
      (inputType === 'my-channel' && !!selectedChannelVideoId));

  return (
    <div className="flex flex-col gap-8">
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-500/15 border border-red-400/30 flex items-center justify-center text-red-400">
            <YouTubeShortsIcon className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">YouTube Shorts Studio</h1>
            <p className="text-sm text-slate-400 mt-1">
              Turn your long-form content into Shorts, discover niche winners, and generate remix-ready concepts.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 p-5 flex flex-col">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-medium text-white flex items-center gap-2">
                <Video size={18} className="text-slate-400" />
                Source Long-Form Content
              </h2>
              {clips.length > 0 && (
                <button
                  onClick={handleDownloadAll}
                  disabled={isZipping || cuttingClip !== null}
                  className="bg-white text-black hover:bg-slate-200 disabled:bg-slate-700 disabled:text-slate-400 text-sm font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
                >
                  {isZipping ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Creating ZIP...
                    </>
                  ) : (
                    <>
                      <Download size={16} />
                      Export All
                    </>
                  )}
                </button>
              )}
            </div>

            <div className="grid grid-cols-3 gap-1 bg-black/20 p-1 rounded-xl mb-6">
              <button
                className={`py-2 text-xs font-medium rounded-lg transition-colors flex items-center justify-center gap-1.5 ${
                  inputType === 'my-channel' ? 'bg-white text-black shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
                onClick={() => setInputType('my-channel')}
              >
                <Layers size={14} /> My Channel
              </button>
              <button
                className={`py-2 text-xs font-medium rounded-lg transition-colors flex items-center justify-center gap-1.5 ${
                  inputType === 'upload' ? 'bg-white text-black shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
                onClick={() => setInputType('upload')}
              >
                <Upload size={14} /> Upload
              </button>
              <button
                className={`py-2 text-xs font-medium rounded-lg transition-colors flex items-center justify-center gap-1.5 ${
                  inputType === 'youtube' ? 'bg-white text-black shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
                onClick={() => setInputType('youtube')}
              >
                <LinkIcon size={14} /> URL
              </button>
            </div>

            {inputType === 'my-channel' && (
              <div className="space-y-3">
                {loadingChannelVideos ? (
                  <div className="rounded-xl border border-white/10 bg-black/20 p-4 flex items-center gap-3 text-slate-300">
                    <Loader2 size={16} className="animate-spin" />
                    Loading your long-form library...
                  </div>
                ) : isChannelConnected === false ? (
                  <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-200">
                    Connect your YouTube account from the sidebar to pull your long-form videos.
                  </div>
                ) : channelVideos.length === 0 ? (
                  <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-slate-300">
                    No long-form videos found (2+ minutes). Upload one manually or publish long-form content first.
                  </div>
                ) : (
                  <>
                    <label className="text-sm font-medium text-slate-300">Choose one of your long-form videos</label>
                    <select
                      value={selectedChannelVideoId}
                      onChange={(e) => setSelectedChannelVideoId(e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    >
                      {channelVideos.map((video) => (
                        <option key={video.id} value={video.id}>
                          {video.title} ({video.durationLabel})
                        </option>
                      ))}
                    </select>

                    {selectedChannelVideo && (
                      <div className="rounded-xl border border-white/10 bg-black/20 p-3 flex items-start gap-3">
                        <img
                          src={selectedChannelVideo.thumbnail}
                          alt={selectedChannelVideo.title}
                          className="w-20 h-12 rounded-md object-cover"
                          referrerPolicy="no-referrer"
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-white line-clamp-2">{selectedChannelVideo.title}</p>
                          <p className="text-xs text-slate-400 mt-1">
                            {formatCompactNumber(selectedChannelVideo.viewCount)} views • {selectedChannelVideo.durationLabel}
                          </p>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {inputType === 'upload' && (
              <div
                className="border-2 border-dashed border-white/20 rounded-xl p-8 text-center hover:bg-white/5 transition-colors cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  accept="video/*"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                />
                <div className="w-12 h-12 bg-blue-500/10 text-blue-400 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Upload size={24} />
                </div>
                <p className="font-medium text-white mb-1">{file ? file.name : 'Click to upload long-form video'}</p>
                <p className="text-xs text-slate-400">
                  {file ? `${(file.size / (1024 * 1024)).toFixed(2)} MB` : 'MP4, MOV, WEBM up to 2GB'}
                </p>
              </div>
            )}

            {inputType === 'youtube' && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">YouTube URL</label>
                <input
                  type="text"
                  className="w-full rounded-xl border border-white/10 bg-black/20 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-white"
                  placeholder="https://youtube.com/watch?v=..."
                  value={youtubeUrl}
                  onChange={(e) => setYoutubeUrl(e.target.value)}
                />
                <p className="text-xs text-slate-400 mt-2">
                  Best for public videos. For your own channel videos, use the "My Channel" source for faster workflow.
                </p>
              </div>
            )}

            <button
              onClick={handleAnalyze}
              disabled={!canAnalyze}
              className="mt-6 w-full bg-white text-black hover:bg-slate-200 disabled:bg-slate-700 disabled:text-slate-400 font-medium py-3 px-4 rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <YouTubeShortsIcon className="w-4 h-4" />
                  Generate Shorts Candidates
                </>
              )}
            </button>

            {loading && loadingStep && <p className="text-sm text-blue-400 text-center mt-4 font-medium animate-pulse">{loadingStep}</p>}

            {error && (
              <div className="mt-4 p-4 bg-red-500/10 text-red-400 rounded-xl text-sm flex items-start gap-3 border border-red-500/20">
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
                className="h-full flex flex-col items-center justify-center text-center p-12 bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 border-dashed min-h-[400px]"
              >
                <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center text-red-400 mb-4">
                  <YouTubeShortsIcon className="w-7 h-7" />
                </div>
                <h3 className="text-lg font-medium text-white mb-2">Ready to build Shorts from long-form</h3>
                <p className="text-slate-400 max-w-sm text-sm">
                  Pick one of your connected channel videos, upload a file, or paste a URL. Janso Studio will extract high-retention Shorts opportunities.
                </p>
              </motion.div>
            ) : loading ? (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 p-6 animate-pulse">
                    <div className="flex justify-between items-start mb-4">
                      <div className="h-6 bg-white/10 rounded w-1/3"></div>
                      <div className="h-6 bg-white/10 rounded w-16"></div>
                    </div>
                    <div className="space-y-3">
                      <div className="h-4 bg-white/5 rounded w-full"></div>
                      <div className="h-4 bg-white/5 rounded w-5/6"></div>
                      <div className="h-4 bg-white/5 rounded w-4/6"></div>
                    </div>
                  </div>
                ))}
              </motion.div>
            ) : (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold tracking-tight text-white">Short Drafts</h2>
                  <span className="text-sm font-medium text-slate-400 bg-white/5 px-3 py-1 rounded-full">{clips.length} found</span>
                </div>

                <div className="space-y-4">
                  {clips.map((clip, index) => (
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.1 }}
                      key={index}
                      className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 overflow-hidden hover:border-white/20 transition-all"
                    >
                      <div className="p-6">
                        <div className="flex items-start justify-between gap-4 mb-4">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs font-bold text-red-300 uppercase tracking-wider">Short {clip.clipNumber}</span>
                              <span className="text-slate-600">•</span>
                              <span className="text-xs font-medium text-slate-400 flex items-center gap-1">
                                <Play size={12} />
                                {clip.startTime} - {clip.endTime} ({clip.duration}s)
                              </span>
                            </div>
                            <h3 className="text-lg font-semibold text-white leading-tight">{clip.title}</h3>
                          </div>

                          <div className="flex flex-col items-end">
                            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-400 font-bold text-lg border border-emerald-500/20">
                              {clip.score}
                            </div>
                            <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mt-1">Score</span>
                          </div>
                        </div>

                        <div className="space-y-4">
                          <div className="bg-black/20 rounded-xl p-4 border border-white/5">
                            <p className="text-sm text-slate-300 italic">
                              <span className="font-semibold not-italic text-white mr-2">Hook:</span>
                              "{clip.hookText}"
                            </p>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-2">Why it works</h4>
                              <p className="text-sm text-slate-300 leading-relaxed">{clip.rationale}</p>
                            </div>
                            <div>
                              <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-2">Edit Notes</h4>
                              <p className="text-sm text-slate-300 leading-relaxed">{clip.visualEditNotes}</p>
                            </div>
                          </div>

                          <div className="pt-4 border-t border-white/5">
                            <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-2">Social Copy</h4>
                            <p className="text-sm font-medium text-white mb-2">{clip.headline}</p>
                            <div className="flex flex-wrap gap-2">
                              {clip.hashtags.map((tag, i) => (
                                <span key={i} className="inline-flex items-center gap-1 text-xs font-medium text-blue-400 bg-blue-500/10 px-2 py-1 rounded-md">
                                  <Hash size={10} />
                                  {tag.replace('#', '')}
                                </span>
                              ))}
                            </div>
                          </div>

                          <div className="pt-4 border-t border-white/5">
                            {cutUrls[clip.clipNumber] ? (
                              <div className="space-y-3">
                                <video src={cutUrls[clip.clipNumber]} controls className="w-full rounded-xl bg-black aspect-video object-contain" />
                                <a
                                  href={cutUrls[clip.clipNumber]}
                                  download={`short-${clip.clipNumber}.mp4`}
                                  className="w-full bg-white text-black hover:bg-slate-200 font-medium py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 text-sm"
                                >
                                  <Download size={16} />
                                  Download Short
                                </a>
                              </div>
                            ) : (
                              <button
                                onClick={() => handleCutClip(clip)}
                                disabled={cuttingClip !== null}
                                className="w-full bg-white/5 border border-white/10 hover:bg-white/10 disabled:bg-black/20 disabled:text-slate-500 text-white font-medium py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 text-sm"
                              >
                                {cuttingClip === clip.clipNumber ? (
                                  <>
                                    <Loader2 size={16} className="animate-spin" />
                                    Rendering 9:16... {cutProgress}%
                                  </>
                                ) : (
                                  <>
                                    <YouTubeShortsIcon className="w-4 h-4" />
                                    Render Short
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
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
        <div className="flex items-start gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-orange-500/15 border border-orange-400/30 flex items-center justify-center text-orange-300">
            <Flame size={18} />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-white tracking-tight">Niche Shorts Remix Lab</h2>
            <p className="text-sm text-slate-400 mt-1">Identify high-performing Shorts in your niche and generate original remix blueprints.</p>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
            <input
              type="text"
              value={nicheQuery}
              onChange={(e) => setNicheQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && fetchNicheShorts()}
              placeholder="e.g. faceless productivity, ai automation, fitness motivation"
              className="w-full rounded-xl border border-white/10 bg-black/20 pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400"
            />
          </div>
          <button
            onClick={fetchNicheShorts}
            disabled={loadingNicheShorts || !nicheQuery.trim()}
            className="bg-white text-black hover:bg-slate-200 disabled:bg-slate-700 disabled:text-slate-400 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2"
          >
            {loadingNicheShorts ? <Loader2 size={16} className="animate-spin" /> : <TrendingUp size={16} />}
            Find High Performers
          </button>
        </div>

        {nicheError && (
          <div className="mt-4 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-300 flex items-start gap-3">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <p>{nicheError}</p>
          </div>
        )}

        <div className="mt-6 grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="space-y-4">
            <h3 className="text-sm uppercase tracking-[0.18em] text-slate-500 font-bold">Top Shorts in Your Niche</h3>
            {loadingNicheShorts ? (
              <div className="rounded-xl border border-white/10 bg-black/20 p-5 flex items-center gap-3 text-slate-300">
                <Loader2 size={16} className="animate-spin" />
                Scanning high-performing Shorts...
              </div>
            ) : nicheShorts.length === 0 ? (
              <div className="rounded-xl border border-white/10 bg-black/20 p-5 text-sm text-slate-400">
                Search a niche to load top-performing Shorts and remix opportunities.
              </div>
            ) : (
              <div className="space-y-3 max-h-[620px] overflow-y-auto pr-1">
                {nicheShorts.map((short) => (
                  <div key={short.id} className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <div className="flex gap-3">
                      <img src={short.thumbnail} alt={short.title} className="w-28 h-16 rounded-md object-cover" referrerPolicy="no-referrer" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-white line-clamp-2">{short.title}</p>
                        <p className="text-xs text-slate-400 mt-1 truncate">{short.channelTitle}</p>
                        <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-300">
                          <span className="inline-flex items-center gap-1 bg-white/5 px-2 py-0.5 rounded-full">
                            <Eye size={11} /> {formatCompactNumber(short.viewCount)} views
                          </span>
                          <span className="inline-flex items-center gap-1 bg-white/5 px-2 py-0.5 rounded-full">
                            <TrendingUp size={11} /> {formatCompactNumber(short.viewsPerDay)}/day
                          </span>
                          <span className="inline-flex items-center gap-1 bg-white/5 px-2 py-0.5 rounded-full">
                            <Sparkles size={11} /> {short.engagementRate}% ER
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <a
                        href={short.youtubeUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1.5 rounded-lg text-xs font-medium border border-white/15 text-slate-300 hover:text-white hover:bg-white/5 transition-colors"
                      >
                        Open Source
                      </a>
                      <button
                        onClick={() => generateRemixPlan(short)}
                        disabled={loadingRemixPlan && selectedShort?.id === short.id}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white text-black hover:bg-slate-200 disabled:bg-slate-700 disabled:text-slate-400 transition-colors"
                      >
                        {loadingRemixPlan && selectedShort?.id === short.id ? 'Generating...' : 'Generate Remix Plan'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-4">
            <h3 className="text-sm uppercase tracking-[0.18em] text-slate-500 font-bold">Remix Blueprint</h3>
            {!selectedShort && !remixPlan && !loadingRemixPlan ? (
              <div className="rounded-xl border border-white/10 bg-black/20 p-5 text-sm text-slate-400">
                Select a high-performing short and generate a remix plan to get hook, structure, script template, and originality guardrails.
              </div>
            ) : (
              <div className="rounded-xl border border-white/10 bg-black/20 p-5 space-y-4">
                {selectedShort && (
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Reference Short</p>
                    <p className="text-sm font-semibold text-white mt-1 line-clamp-2">{selectedShort.title}</p>
                  </div>
                )}

                {loadingRemixPlan ? (
                  <div className="flex items-center gap-3 text-slate-300 text-sm">
                    <Loader2 size={16} className="animate-spin" />
                    Building remix blueprint...
                  </div>
                ) : remixError ? (
                  <div className="p-4 rounded-xl border border-red-500/25 bg-red-500/10 text-sm text-red-300">{remixError}</div>
                ) : remixPlan ? (
                  <div className="space-y-4 text-sm">
                    <div>
                      <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Remix Angle</p>
                      <p className="text-slate-200 mt-1">{remixPlan.remixAngle}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Hook</p>
                      <p className="text-white mt-1 font-medium">{remixPlan.hook}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.16em] text-slate-500 mb-1">Title Options</p>
                      <div className="space-y-1.5">
                        {remixPlan.titleOptions?.map((title, idx) => (
                          <p key={idx} className="text-slate-200">{idx + 1}. {title}</p>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.16em] text-slate-500 mb-1">Beat-by-Beat Structure</p>
                      <div className="space-y-1.5">
                        {remixPlan.beatByBeatPlan?.map((beat, idx) => (
                          <p key={idx} className="text-slate-300">{idx + 1}. {beat}</p>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.16em] text-slate-500 mb-1">Shot Ideas</p>
                      <div className="space-y-1.5">
                        {remixPlan.shotIdeas?.map((idea, idx) => (
                          <p key={idx} className="text-slate-300">{idx + 1}. {idea}</p>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Script Template</p>
                      <p className="text-slate-200 mt-1 whitespace-pre-wrap">{remixPlan.scriptTemplate}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.16em] text-slate-500">CTA</p>
                      <p className="text-slate-200 mt-1">{remixPlan.cta}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.16em] text-slate-500 mb-1">Hashtag Pack</p>
                      <div className="flex flex-wrap gap-2">
                        {remixPlan.hashtagPack?.map((tag, idx) => (
                          <span key={idx} className="inline-flex items-center gap-1 text-xs font-medium text-blue-300 bg-blue-500/10 px-2 py-1 rounded-md">
                            <Hash size={10} />
                            {tag.replace('#', '')}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.16em] text-slate-500 mb-1">Originality Guardrails</p>
                      <div className="space-y-1.5">
                        {remixPlan.originalityGuardrails?.map((rule, idx) => (
                          <p key={idx} className="text-slate-400">{idx + 1}. {rule}</p>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
