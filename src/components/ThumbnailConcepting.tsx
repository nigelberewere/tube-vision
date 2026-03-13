import { useEffect, useMemo, useState } from 'react';
import { Type } from '@google/genai';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  Download,
  ExternalLink,
  Image as ImageIcon,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Wand2,
} from 'lucide-react';
import { generateThumbnailImage, generateVidVisionInsight } from '../services/geminiService';
import { loadBrandKit } from './BrandKit';
import { parseApiErrorResponse } from '../lib/youtubeApiErrors';

interface VideoItem {
  id: string;
  snippet: {
    title: string;
    description: string;
    thumbnails: {
      medium?: { url: string };
      high?: { url: string };
      default?: { url: string };
    };
    publishedAt: string;
  };
  statistics: {
    viewCount: string;
    likeCount: string;
    commentCount: string;
  };
  contentDetails: {
    duration: string;
  };
}

interface VideoMetrics {
  id: string;
  title: string;
  thumbnailUrl: string;
  publishedAt: string;
  durationLabel: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  viewsPerDay: number;
  engagementRate: number;
  performanceIndex: number;
  youtubeUrl: string;
}

interface AutoInsight {
  videoId: string;
  thumbnailHealthScore: number;
  mainIssue: string;
  proposedTextOverlay: string;
  titleTreatment: string;
  layoutDescription: string;
  colorDirection: string;
  visualHook: string;
  thumbnailImagePrompt: string;
  projectedCtrLiftPercent: number;
  whyThisShouldImproveCtr: string;
  swapPriority: number;
  video?: VideoMetrics;
}

interface ManualConcept {
  title: string;
  layoutDescription: string;
  textOverlay: string;
  colorPalette: string;
  emotionOrVibe: string;
  whyItWorks: string;
  thumbnailImagePrompt: string;
  stylePresetId: ManualStylePresetId;
  stylePresetLabel: string;
  generatedThumbnailUrl?: string;
  imageGenerationError?: string | null;
  isGeneratingImage?: boolean;
}

type ManualStylePresetId = 'documentary' | 'cinematic' | 'high-contrast';

interface ManualStylePreset {
  id: ManualStylePresetId;
  label: string;
  summary: string;
  conceptGuidance: string;
  imageGuidance: string;
}

const MANUAL_STYLE_PRESETS: ManualStylePreset[] = [
  {
    id: 'documentary',
    label: 'Documentary',
    summary: 'Grounded, editorial realism',
    conceptGuidance: 'Favor real-world scenes, clean typography, factual visual cues, and credible framing over hyper-stylized effects.',
    imageGuidance: 'Use natural lighting, realistic textures, restrained contrast, and editorial composition that feels trustworthy.',
  },
  {
    id: 'cinematic',
    label: 'Cinematic',
    summary: 'Dramatic storytelling energy',
    conceptGuidance: 'Use dynamic framing, depth, dramatic subject emphasis, and emotionally charged visual storytelling.',
    imageGuidance: 'Use directional light, rich color grading, atmospheric depth, and bold focal separation suitable for film-like thumbnails.',
  },
  {
    id: 'high-contrast',
    label: 'High-Contrast',
    summary: 'Aggressive scroll-stopping punch',
    conceptGuidance: 'Prioritize immediate readability, stark tonal separation, oversized focal elements, and assertive visual hierarchy.',
    imageGuidance: 'Use high saturation, strong contrast, punchy highlights, deep shadows, and hard-edged composition for maximum impact.',
  },
];

interface AuthorizationItem {
  videoId: string;
  videoTitle: string;
  currentThumbnailUrl: string;
  proposedTextOverlay: string;
  titleTreatment: string;
  layoutDescription: string;
  colorDirection: string;
  thumbnailImagePrompt: string;
  projectedCtrLiftPercent: number;
  swapPriority: number;
  status: string;
  approvedAt: string;
}

function parseISODurationToSeconds(duration: string): number {
  const match = duration?.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;

  const hours = Number(match[1] || 0);
  const minutes = Number(match[2] || 0);
  const seconds = Number(match[3] || 0);
  return hours * 3600 + minutes * 60 + seconds;
}

function formatDurationLabel(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function toNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getBrandKitPromptContext(): string {
  const brandKit = loadBrandKit();
  if (!brandKit.enabled) {
    return 'BRAND KIT: Disabled in Settings. Do not enforce brand colors, fonts, or logo placement unless explicitly requested by the user.';
  }

  const hasLogos = brandKit.logos.main || brandKit.logos.secondary;
  
  return `
BRAND KIT (Use these assets to maintain brand consistency):
- Primary Color: ${brandKit.colors.primary}
- Secondary Color: ${brandKit.colors.secondary}
- Accent Color: ${brandKit.colors.accent}
- Background Color: ${brandKit.colors.background}
- Text Color: ${brandKit.colors.text}
- Heading Font: ${brandKit.fonts.heading}
- Body Font: ${brandKit.fonts.body}
${hasLogos ? '- Logo: Available (incorporate logo placement in layout)' : '- Logo: None uploaded'}

Apply these brand assets in your thumbnail recommendations.
`.trim();
}

function getManualStylePreset(id: ManualStylePresetId): ManualStylePreset {
  return MANUAL_STYLE_PRESETS.find((preset) => preset.id === id) || MANUAL_STYLE_PRESETS[0];
}

function buildManualThumbnailPrompt(topic: string, concept: ManualConcept, stylePreset: ManualStylePreset): string {
  return `Create a high-CTR YouTube thumbnail in 16:9 (1280x720) for this video topic: "${topic}".

Creative direction:
- Style preset: ${stylePreset.label}
- Style intent: ${stylePreset.imageGuidance}
- Concept title: ${concept.title}
- Layout: ${concept.layoutDescription}
- Overlay text (must appear exactly): "${trimToWords(concept.textOverlay, 4)}"
- Color direction: ${concept.colorPalette}
- Emotion/vibe: ${concept.emotionOrVibe}
- Prompt details: ${concept.thumbnailImagePrompt || concept.whyItWorks}

Quality requirements:
- Bold readable text, high contrast, clean hierarchy
- Professional YouTube thumbnail style
- No watermarks, no logos, no tiny unreadable text`;
}

function compact(value: number): string {
  return Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function trimToWords(text: string, maxWords: number): string {
  const words = String(text || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return words.slice(0, maxWords).join(' ');
}

function formatRelativeTime(dateInput: string): string {
  const timestamp = new Date(dateInput).getTime();
  if (!Number.isFinite(timestamp)) return 'recently';

  const diff = Date.now() - timestamp;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < hour) {
    const value = Math.max(1, Math.floor(diff / minute));
    return `${value}m ago`;
  }

  if (diff < day) {
    const value = Math.max(1, Math.floor(diff / hour));
    return `${value}h ago`;
  }

  const value = Math.max(1, Math.floor(diff / day));
  return `${value}d ago`;
}

function predictThumbnailScore(insight: AutoInsight): number {
  const baseline = toNumber(insight.thumbnailHealthScore);
  const lift = toNumber(insight.projectedCtrLiftPercent);
  return clamp(Math.round(baseline + lift), 1, 100);
}

function buildVideoMetrics(videos: VideoItem[]): VideoMetrics[] {
  const now = Date.now();

  return videos.map((video) => {
    const publishedAt = video.snippet?.publishedAt || new Date().toISOString();
    const ageDays = Math.max(1, (now - new Date(publishedAt).getTime()) / (24 * 60 * 60 * 1000));
    const viewCount = toNumber(video.statistics?.viewCount);
    const likeCount = toNumber(video.statistics?.likeCount);
    const commentCount = toNumber(video.statistics?.commentCount);
    const durationSeconds = parseISODurationToSeconds(video.contentDetails?.duration || '');
    const viewsPerDay = viewCount / ageDays;
    const engagementRate = viewCount > 0 ? ((likeCount + commentCount) / viewCount) * 100 : 0;
    const performanceIndex = Math.log10(viewsPerDay + 1) * 70 + engagementRate * 4;

    return {
      id: video.id,
      title: video.snippet?.title || 'Untitled',
      thumbnailUrl:
        video.snippet?.thumbnails?.high?.url ||
        video.snippet?.thumbnails?.medium?.url ||
        video.snippet?.thumbnails?.default?.url ||
        '',
      publishedAt,
      durationLabel: formatDurationLabel(durationSeconds),
      viewCount,
      likeCount,
      commentCount,
      viewsPerDay,
      engagementRate,
      performanceIndex,
      youtubeUrl: `https://www.youtube.com/watch?v=${video.id}`,
    };
  });
}

function getPoorCandidates(metrics: VideoMetrics[]): VideoMetrics[] {
  const matureVideos = metrics.filter((video) => {
    const ageDays = (Date.now() - new Date(video.publishedAt).getTime()) / (24 * 60 * 60 * 1000);
    return ageDays >= 5;
  });

  const source = matureVideos.length > 0 ? matureVideos : metrics;
  return [...source].sort((a, b) => a.performanceIndex - b.performanceIndex).slice(0, 8);
}

function getTopPerformers(metrics: VideoMetrics[]): VideoMetrics[] {
  return [...metrics].sort((a, b) => b.performanceIndex - a.performanceIndex).slice(0, 5);
}

type Mode = 'auto' | 'manual';

export default function ThumbnailConcepting() {
  const [mode, setMode] = useState<Mode>('auto');

  const [topic, setTopic] = useState('');
  const [manualStylePreset, setManualStylePreset] = useState<ManualStylePresetId>('documentary');
  const [manualLoading, setManualLoading] = useState(false);
  const [manualConcepts, setManualConcepts] = useState<ManualConcept[]>([]);
  const [manualError, setManualError] = useState<string | null>(null);
  const [manualGenerationStatus, setManualGenerationStatus] = useState<string | null>(null);

  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [loadingVideos, setLoadingVideos] = useState(false);
  const [videosError, setVideosError] = useState<string | null>(null);
  const [needsConnection, setNeedsConnection] = useState(false);

  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [insights, setInsights] = useState<AutoInsight[]>([]);
  const [channelActions, setChannelActions] = useState<string[]>([]);

  const [authorizingId, setAuthorizingId] = useState<string | null>(null);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [queueLoading, setQueueLoading] = useState(false);
  const [authorizationQueue, setAuthorizationQueue] = useState<AuthorizationItem[]>([]);

  const videoMetrics = useMemo<VideoMetrics[]>(() => buildVideoMetrics(videos), [videos]);

  const poorCandidates = useMemo<VideoMetrics[]>(() => {
    return getPoorCandidates(videoMetrics);
  }, [videoMetrics]);

  const topPerformers = useMemo<VideoMetrics[]>(() => {
    return getTopPerformers(videoMetrics);
  }, [videoMetrics]);

  const authorizedIdSet = useMemo(() => {
    return new Set(authorizationQueue.map((item) => item.videoId));
  }, [authorizationQueue]);

  const activeManualStylePreset = useMemo(() => {
    return getManualStylePreset(manualStylePreset);
  }, [manualStylePreset]);

  const fetchVideos = async (): Promise<VideoItem[]> => {
    setLoadingVideos(true);
    setVideosError(null);

    try {
      const response = await fetch('/api/user/videos');
      if (response.status === 401) {
        setNeedsConnection(true);
        setVideos([]);
        return [];
      }

      if (!response.ok) {
        const message = await parseApiErrorResponse(response, 'Failed to fetch your videos.');
        throw new Error(message);
      }

      const data = (await response.json()) as VideoItem[];
      setNeedsConnection(false);
      setVideos(data || []);
      return data || [];
    } catch (error: any) {
      setVideosError(error.message || 'Failed to fetch videos.');
      return [];
    } finally {
      setLoadingVideos(false);
    }
  };

  const fetchAuthorizationQueue = async () => {
    setQueueLoading(true);
    try {
      const response = await fetch('/api/thumbnails/authorizations');
      if (response.status === 401) {
        setNeedsConnection(true);
        setAuthorizationQueue([]);
        return;
      }

      if (!response.ok) {
        return;
      }

      const data = (await response.json()) as AuthorizationItem[];
      setAuthorizationQueue(data || []);
    } finally {
      setQueueLoading(false);
    }
  };

  useEffect(() => {
    if (mode === 'auto') {
      fetchVideos();
      fetchAuthorizationQueue();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const generateManualThumbnailForConcept = async (
    concept: ManualConcept,
    sourceTopic: string,
    stylePreset: ManualStylePreset,
  ) => {
    const imagePrompt = buildManualThumbnailPrompt(sourceTopic, concept, stylePreset);
    return generateThumbnailImage(imagePrompt, { aspectRatio: '16:9' });
  };

  const handleGenerateManualConcepts = async () => {
    if (!topic.trim()) return;
    const stylePreset = activeManualStylePreset;

    setManualLoading(true);
    setManualError(null);
    setManualGenerationStatus(`Generating ${stylePreset.label.toLowerCase()} concepts...`);
    setManualConcepts([]);

    try {
      const schema = {
        type: Type.OBJECT,
        properties: {
          concepts: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                layoutDescription: { type: Type.STRING },
                textOverlay: { type: Type.STRING },
                colorPalette: { type: Type.STRING },
                emotionOrVibe: { type: Type.STRING },
                whyItWorks: { type: Type.STRING },
                thumbnailImagePrompt: { type: Type.STRING },
              },
            },
          },
        },
      };

      const prompt = `Act as a master YouTube thumbnail strategist. Generate 3 high-CTR thumbnail concepts for: "${topic}".
    Each concept must include: composition, short text overlay (max 4 words), color direction, emotional trigger, conversion logic, and a rich thumbnailImagePrompt for image generation.

    Style preset to enforce:
    - ${stylePreset.label}: ${stylePreset.conceptGuidance}

    Every concept must clearly match this preset style while remaining practical for YouTube CTR.

    ${getBrandKitPromptContext()}`;

      const response = await generateVidVisionInsight(prompt, schema);
      if (!response) {
        throw new Error('No response from AI');
      }

      const parsed = JSON.parse(response);
      const normalizedConcepts = (Array.isArray(parsed.concepts) ? parsed.concepts : [])
        .slice(0, 3)
        .map((concept: any) => ({
          title: String(concept?.title || 'Untitled Concept').trim(),
          layoutDescription: String(concept?.layoutDescription || '').trim(),
          textOverlay: trimToWords(String(concept?.textOverlay || '').trim(), 4),
          colorPalette: String(concept?.colorPalette || '').trim(),
          emotionOrVibe: String(concept?.emotionOrVibe || '').trim(),
          whyItWorks: String(concept?.whyItWorks || '').trim(),
          thumbnailImagePrompt: String(concept?.thumbnailImagePrompt || '').trim(),
          stylePresetId: stylePreset.id,
          stylePresetLabel: stylePreset.label,
          generatedThumbnailUrl: '',
          imageGenerationError: null,
          isGeneratingImage: true,
        })) as ManualConcept[];

      if (normalizedConcepts.length === 0) {
        throw new Error('No concepts were generated. Try a more specific topic.');
      }

      setManualConcepts(normalizedConcepts);

      let successfulImageCount = 0;

      for (let i = 0; i < normalizedConcepts.length; i += 1) {
        const concept = normalizedConcepts[i];
        setManualGenerationStatus(`Rendering thumbnail ${i + 1} of ${normalizedConcepts.length}...`);

        try {
          const generatedThumbnailUrl = await generateManualThumbnailForConcept(concept, topic.trim(), stylePreset);
          successfulImageCount += 1;

          setManualConcepts((previous) =>
            previous.map((item, index) =>
              index === i
                ? {
                    ...item,
                    generatedThumbnailUrl,
                    imageGenerationError: null,
                    isGeneratingImage: false,
                  }
                : item,
            ),
          );
        } catch (imageError: any) {
          const message = imageError?.message || 'Failed to generate thumbnail image.';
          setManualConcepts((previous) =>
            previous.map((item, index) =>
              index === i
                ? {
                    ...item,
                    generatedThumbnailUrl: '',
                    imageGenerationError: message,
                    isGeneratingImage: false,
                  }
                : item,
            ),
          );
        }
      }

      if (successfulImageCount === 0) {
        setManualError('Concepts were generated, but image rendering failed. Check model access in your Gemini key and try again.');
      }
    } catch (error: any) {
      setManualError(error.message || 'Failed to generate thumbnail concepts.');
    } finally {
      setManualGenerationStatus(null);
      setManualLoading(false);
    }
  };

  const regenerateManualThumbnailImage = async (conceptIndex: number) => {
    const concept = manualConcepts[conceptIndex];
    if (!concept) return;
    const stylePreset = activeManualStylePreset;

    setManualError(null);
    setManualConcepts((previous) =>
      previous.map((item, index) =>
        index === conceptIndex
          ? {
              ...item,
              isGeneratingImage: true,
              imageGenerationError: null,
            }
          : item,
      ),
    );

    try {
      const generatedThumbnailUrl = await generateManualThumbnailForConcept(concept, topic.trim() || concept.title, stylePreset);

      setManualConcepts((previous) =>
        previous.map((item, index) =>
          index === conceptIndex
            ? {
                ...item,
                generatedThumbnailUrl,
                imageGenerationError: null,
                isGeneratingImage: false,
                stylePresetId: stylePreset.id,
                stylePresetLabel: stylePreset.label,
              }
            : item,
        ),
      );
    } catch (error: any) {
      const message = error?.message || 'Failed to regenerate thumbnail image.';
      setManualConcepts((previous) =>
        previous.map((item, index) =>
          index === conceptIndex
            ? {
                ...item,
                imageGenerationError: message,
                isGeneratingImage: false,
              }
            : item,
        ),
      );
    }
  };

  const runAutoAudit = async () => {
    setAuditLoading(true);
    setAuditError(null);
    setInsights([]);
    setChannelActions([]);

    try {
      let sourceVideos = videos;
      if (sourceVideos.length === 0) {
        sourceVideos = await fetchVideos();
      }

      const metrics = buildVideoMetrics(sourceVideos);
      const poorCandidatesSource = getPoorCandidates(metrics);
      const topPerformersSource = getTopPerformers(metrics);

      if (sourceVideos.length === 0 || poorCandidatesSource.length === 0) {
        throw new Error('No videos available to audit. Connect channel and publish videos first.');
      }

      const schema = {
        type: Type.OBJECT,
        properties: {
          insights: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                videoId: { type: Type.STRING },
                thumbnailHealthScore: { type: Type.NUMBER },
                mainIssue: { type: Type.STRING },
                proposedTextOverlay: { type: Type.STRING },
                titleTreatment: { type: Type.STRING },
                layoutDescription: { type: Type.STRING },
                colorDirection: { type: Type.STRING },
                visualHook: { type: Type.STRING },
                thumbnailImagePrompt: { type: Type.STRING },
                projectedCtrLiftPercent: { type: Type.NUMBER },
                whyThisShouldImproveCtr: { type: Type.STRING },
                swapPriority: { type: Type.NUMBER },
              },
              required: [
                'videoId',
                'thumbnailHealthScore',
                'mainIssue',
                'proposedTextOverlay',
                'titleTreatment',
                'layoutDescription',
                'colorDirection',
                'visualHook',
                'thumbnailImagePrompt',
                'projectedCtrLiftPercent',
                'whyThisShouldImproveCtr',
                'swapPriority',
              ],
            },
          },
          channelLevelActions: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
        },
        required: ['insights', 'channelLevelActions'],
      };

      const prompt = `You are an elite YouTube thumbnail optimization analyst.

Top-performing baseline videos (for pattern reference):
${JSON.stringify(
  topPerformersSource.map((video) => ({
    id: video.id,
    title: video.title,
    viewsPerDay: Math.round(video.viewsPerDay),
    engagementRate: Number(video.engagementRate.toFixed(2)),
  })),
)}

Potentially underperforming videos to improve:
${JSON.stringify(
  poorCandidatesSource.map((video) => ({
    videoId: video.id,
    title: video.title,
    viewsPerDay: Math.round(video.viewsPerDay),
    engagementRate: Number(video.engagementRate.toFixed(2)),
    currentPerformanceIndex: Number(video.performanceIndex.toFixed(2)),
  })),
)}

Return thumbnail redesign insights for every underperforming video.
Rules:
- proposedTextOverlay must be 4 words or fewer.
- titleTreatment should define font style, sizing, and placement.
- thumbnailImagePrompt must be a ready-to-use prompt for an image generator.
- projectedCtrLiftPercent should be realistic (2 to 35).
- thumbnailHealthScore is 1-100 (higher is better current thumbnail quality).
- swapPriority is 1-100 (higher means apply this swap first).
- Focus on practical visual changes a creator can execute quickly.
- Include 3 to 5 high-impact channel-level actions.

${getBrandKitPromptContext()}`;

      const response = await generateVidVisionInsight(prompt, schema);
      if (!response) {
        throw new Error('No audit response generated.');
      }

      const parsed = JSON.parse(response) as { insights: AutoInsight[]; channelLevelActions: string[] };
      const byId = new Map(poorCandidatesSource.map((video) => [video.id, video]));

      const mergedInsights = (parsed.insights || []).map((insight, index) => {
        const video = byId.get(insight.videoId) || poorCandidatesSource[index];
        return {
          ...insight,
          projectedCtrLiftPercent: Math.max(2, Math.min(35, toNumber(insight.projectedCtrLiftPercent))),
          video,
        };
      }).sort((a, b) => toNumber(b.swapPriority) - toNumber(a.swapPriority));

      setInsights(mergedInsights);
      setChannelActions(parsed.channelLevelActions || []);
    } catch (error: any) {
      setAuditError(error.message || 'Failed to run thumbnail audit.');
    } finally {
      setAuditLoading(false);
    }
  };

  const regenerateThumbnailConcept = async (insight: AutoInsight) => {
    if (!insight.video) return;

    setAuditError(null);
    setRegeneratingId(insight.video.id);
    try {
      const schema = {
        type: Type.OBJECT,
        properties: {
          thumbnailHealthScore: { type: Type.NUMBER },
          mainIssue: { type: Type.STRING },
          proposedTextOverlay: { type: Type.STRING },
          titleTreatment: { type: Type.STRING },
          layoutDescription: { type: Type.STRING },
          colorDirection: { type: Type.STRING },
          visualHook: { type: Type.STRING },
          thumbnailImagePrompt: { type: Type.STRING },
          projectedCtrLiftPercent: { type: Type.NUMBER },
          whyThisShouldImproveCtr: { type: Type.STRING },
          swapPriority: { type: Type.NUMBER },
        },
        required: [
          'thumbnailHealthScore',
          'mainIssue',
          'proposedTextOverlay',
          'titleTreatment',
          'layoutDescription',
          'colorDirection',
          'visualHook',
          'thumbnailImagePrompt',
          'projectedCtrLiftPercent',
          'whyThisShouldImproveCtr',
          'swapPriority',
        ],
      };

      const topPerformerSummary = topPerformers.slice(0, 3).map((video) => ({
        title: video.title,
        viewsPerDay: Math.round(video.viewsPerDay),
        engagementRate: Number(video.engagementRate.toFixed(2)),
      }));

      const prompt = `You are a YouTube thumbnail CRO expert.
Regenerate ONE stronger thumbnail concept for this specific video while staying realistic.

Video to improve:
${JSON.stringify({
  videoId: insight.video.id,
  title: insight.video.title,
  viewsPerDay: Math.round(insight.video.viewsPerDay),
  engagementRate: Number(insight.video.engagementRate.toFixed(2)),
  currentThumbnailHealthScore: Math.round(toNumber(insight.thumbnailHealthScore)),
  currentMainIssue: insight.mainIssue,
  currentOverlay: insight.proposedTextOverlay,
})}

Top performer pattern references:
${JSON.stringify(topPerformerSummary)}

Rules:
- proposedTextOverlay: 4 words max.
- projectedCtrLiftPercent: 2 to 35.
- thumbnailHealthScore: 1 to 100.
- swapPriority: 1 to 100.
- thumbnailImagePrompt: ready for image generation.
- Return JSON only.

${getBrandKitPromptContext()}`;

      const response = await generateVidVisionInsight(prompt, schema);
      if (!response) {
        throw new Error('No regenerated thumbnail concept returned.');
      }

      const regenerated = JSON.parse(response);

      setInsights((previous) =>
        previous
          .map((item) => {
            if (item.videoId !== insight.videoId) return item;

            return {
              ...item,
              thumbnailHealthScore: clamp(toNumber(regenerated.thumbnailHealthScore || item.thumbnailHealthScore), 1, 100),
              mainIssue: regenerated.mainIssue || item.mainIssue,
              proposedTextOverlay: trimToWords(regenerated.proposedTextOverlay || item.proposedTextOverlay, 4),
              titleTreatment: regenerated.titleTreatment || item.titleTreatment,
              layoutDescription: regenerated.layoutDescription || item.layoutDescription,
              colorDirection: regenerated.colorDirection || item.colorDirection,
              visualHook: regenerated.visualHook || item.visualHook,
              thumbnailImagePrompt: regenerated.thumbnailImagePrompt || item.thumbnailImagePrompt,
              projectedCtrLiftPercent: clamp(toNumber(regenerated.projectedCtrLiftPercent || item.projectedCtrLiftPercent), 2, 35),
              whyThisShouldImproveCtr: regenerated.whyThisShouldImproveCtr || item.whyThisShouldImproveCtr,
              swapPriority: clamp(toNumber(regenerated.swapPriority || item.swapPriority), 1, 100),
            };
          })
          .sort((a, b) => toNumber(b.swapPriority) - toNumber(a.swapPriority)),
      );
    } catch (error: any) {
      setAuditError(error.message || 'Failed to regenerate thumbnail concept.');
    } finally {
      setRegeneratingId(null);
    }
  };

  const applyThumbnail = async (insight: AutoInsight) => {
    if (!insight.video) return;

    setAuditError(null);
    setAuthorizingId(insight.video.id);
    try {
      const response = await fetch('/api/thumbnails/authorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoId: insight.video.id,
          videoTitle: insight.video.title,
          currentThumbnailUrl: insight.video.thumbnailUrl,
          proposedTextOverlay: insight.proposedTextOverlay,
          titleTreatment: insight.titleTreatment,
          layoutDescription: insight.layoutDescription,
          colorDirection: insight.colorDirection,
          thumbnailImagePrompt: insight.thumbnailImagePrompt,
          projectedCtrLiftPercent: insight.projectedCtrLiftPercent,
          swapPriority: insight.swapPriority,
          status: 'applied',
        }),
      });

      if (response.status === 401) {
        setNeedsConnection(true);
        throw new Error('Reconnect your YouTube account to apply thumbnail swaps.');
      }

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Failed to apply thumbnail.');
      }

      const payload = await response.json();
      setAuthorizationQueue(payload.queue || []);
    } catch (error: any) {
      setAuditError(error.message || 'Failed to apply thumbnail.');
    } finally {
      setAuthorizingId(null);
    }
  };

  const clearAuthorizationQueue = async () => {
    setQueueLoading(true);
    try {
      const response = await fetch('/api/thumbnails/authorize/clear', { method: 'POST' });
      if (!response.ok) {
        return;
      }
      setAuthorizationQueue([]);
    } finally {
      setQueueLoading(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-10">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-zinc-100">Thumbnail Studio</h1>
        <p className="text-zinc-400 mt-2">
          Detect weak thumbnails, auto-generate stronger concepts, and apply thumbnail upgrade recommendations.
        </p>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 sm:gap-2 w-full md:w-[360px]">
          <button
            onClick={() => setMode('auto')}
            className={`rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors ${
              mode === 'auto' ? 'bg-white text-black' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
            }`}
          >
            Auto Audit
          </button>
          <button
            onClick={() => setMode('manual')}
            className={`rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors ${
              mode === 'manual' ? 'bg-white text-black' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
            }`}
          >
            Thumbnail Generator
          </button>
        </div>
      </div>

      {mode === 'manual' && (
        <>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <label className="block text-sm font-medium text-zinc-300 mb-2">Video Topic or Title</label>
            <p className="text-xs text-zinc-500 mb-3">
              Generates 3 complete 16:9 thumbnail images plus the strategic rationale behind each concept.
            </p>

            <div className="mb-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Visual style preset</p>
              <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2">
                {MANUAL_STYLE_PRESETS.map((preset) => {
                  const isActive = manualStylePreset === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => setManualStylePreset(preset.id)}
                      disabled={manualLoading}
                      className={`rounded-lg border px-3 py-2 text-left transition-colors disabled:opacity-60 ${
                        isActive
                          ? 'border-indigo-400/60 bg-indigo-500/10'
                          : 'border-zinc-800 bg-zinc-950 hover:bg-zinc-900'
                      }`}
                    >
                      <p className={`text-xs font-semibold ${isActive ? 'text-indigo-200' : 'text-zinc-200'}`}>{preset.label}</p>
                      <p className={`mt-0.5 text-[11px] ${isActive ? 'text-indigo-300/90' : 'text-zinc-500'}`}>{preset.summary}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex gap-3">
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g., I tested 10 AI tools in 24 hours"
                className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                onKeyDown={(e) => e.key === 'Enter' && handleGenerateManualConcepts()}
              />
              <button
                onClick={handleGenerateManualConcepts}
                disabled={manualLoading || !topic.trim()}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-2.5 rounded-lg font-medium flex items-center gap-2 transition-colors"
              >
                {manualLoading ? <Loader2 size={18} className="animate-spin" /> : <ImageIcon size={18} />}
                Generate Thumbnails
              </button>
            </div>

            {manualGenerationStatus && (
              <p className="text-xs text-indigo-300 mt-3 animate-pulse">{manualGenerationStatus}</p>
            )}
          </div>

          {manualError && (
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-300 text-sm flex items-start gap-3">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <p>{manualError}</p>
            </div>
          )}

          {manualConcepts.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 md:gap-6">
              {manualConcepts.map((concept, i) => (
                <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden flex flex-col">
                  <div className="relative aspect-video bg-zinc-950 border-b border-zinc-800 overflow-hidden">
                    {concept.generatedThumbnailUrl ? (
                      <img
                        src={concept.generatedThumbnailUrl}
                        alt={`Generated thumbnail concept ${i + 1}`}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
                        <div className="absolute inset-0 opacity-20 bg-gradient-to-br from-indigo-500/20 via-zinc-900 to-zinc-950" />
                        <h3 className="relative z-10 text-2xl font-black tracking-tighter text-white uppercase">{concept.textOverlay}</h3>
                      </div>
                    )}

                    {concept.isGeneratingImage && (
                      <div className="absolute inset-0 bg-black/55 flex items-center justify-center">
                        <div className="inline-flex items-center gap-2 rounded-full bg-black/60 border border-white/10 px-3 py-1.5 text-xs font-semibold text-slate-200">
                          <Loader2 size={14} className="animate-spin" />
                          Rendering image...
                        </div>
                      </div>
                    )}

                    <span className="absolute top-2 left-2 text-[10px] font-bold uppercase tracking-[0.16em] px-2 py-1 rounded bg-black/70 text-zinc-200">
                      Concept {i + 1}
                    </span>
                  </div>
                  <div className="p-5 space-y-3">
                    <div className="inline-flex items-center rounded-full border border-zinc-700 bg-zinc-800/70 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-300">
                      {concept.stylePresetLabel}
                    </div>
                    <h3 className="text-lg font-bold text-zinc-100">{concept.title}</h3>
                    <p className="text-sm text-indigo-400">{concept.emotionOrVibe}</p>
                    <p className="text-sm text-zinc-300"><span className="text-zinc-500">Layout:</span> {concept.layoutDescription}</p>
                    <p className="text-sm text-zinc-300"><span className="text-zinc-500">Colors:</span> {concept.colorPalette}</p>
                    <p className="text-sm text-zinc-400 italic">{concept.whyItWorks}</p>

                    {concept.imageGenerationError && (
                      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-200">
                        {concept.imageGenerationError}
                      </div>
                    )}

                    {concept.thumbnailImagePrompt && (
                      <p className="text-[11px] text-zinc-500 leading-relaxed">
                        <span className="font-semibold text-zinc-400">Image prompt:</span> {concept.thumbnailImagePrompt}
                      </p>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => regenerateManualThumbnailImage(i)}
                        disabled={manualLoading || concept.isGeneratingImage}
                        className="rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-60 text-zinc-200 text-xs font-semibold py-2 px-3 transition-colors inline-flex items-center justify-center gap-2"
                      >
                        {concept.isGeneratingImage ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                        Regenerate
                      </button>

                      {concept.generatedThumbnailUrl ? (
                        <a
                          href={concept.generatedThumbnailUrl}
                          download={`thumbnail-concept-${i + 1}.png`}
                          className="rounded-lg bg-white text-black hover:bg-zinc-200 text-xs font-semibold py-2 px-3 transition-colors inline-flex items-center justify-center gap-2"
                        >
                          <Download size={14} />
                          Download
                        </a>
                      ) : (
                        <div className="rounded-lg border border-zinc-800 text-zinc-600 text-xs font-semibold py-2 px-3 inline-flex items-center justify-center">
                          Not ready
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {mode === 'auto' && (
        <>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-5">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-zinc-100">Automatic Thumbnail Audit</h2>
                <p className="text-sm text-zinc-400 mt-1">
                  Analyze your channel videos, detect weak thumbnail performers, and generate replacement concepts.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={fetchVideos}
                  disabled={loadingVideos}
                  className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm font-medium transition-colors inline-flex items-center gap-2 disabled:opacity-60"
                >
                  {loadingVideos ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                  Refresh Videos
                </button>
                <button
                  onClick={runAutoAudit}
                  disabled={auditLoading || loadingVideos || needsConnection}
                  className="px-4 py-2 rounded-lg bg-white text-black hover:bg-zinc-200 text-sm font-semibold transition-colors inline-flex items-center gap-2 disabled:opacity-60"
                >
                  {auditLoading ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
                  Run Audit
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
              <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
                <p className="text-xs uppercase tracking-wider text-zinc-500 font-bold">Videos Loaded</p>
                <p className="text-2xl font-bold text-zinc-100 mt-1">{videoMetrics.length}</p>
              </div>
              <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
                <p className="text-xs uppercase tracking-wider text-zinc-500 font-bold">Flagged For Improvement</p>
                <p className="text-2xl font-bold text-amber-300 mt-1">{poorCandidates.length}</p>
              </div>
              <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
                <p className="text-xs uppercase tracking-wider text-zinc-500 font-bold">Applied Queue</p>
                <p className="text-2xl font-bold text-emerald-300 mt-1">{authorizationQueue.length}</p>
              </div>
            </div>

            {needsConnection && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
                Connect your YouTube account from the sidebar to use automatic thumbnail auditing.
              </div>
            )}

            {videosError && (
              <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-300 text-sm flex items-start gap-3">
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                <p>{videosError}</p>
              </div>
            )}

            {auditError && (
              <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-300 text-sm flex items-start gap-3">
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                <p>{auditError}</p>
              </div>
            )}

            {channelActions.length > 0 && (
              <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-4">
                <p className="text-xs uppercase tracking-wider text-indigo-300 font-bold mb-2">Channel-Level Thumbnail Actions</p>
                <div className="space-y-2">
                  {channelActions.map((action, i) => (
                    <p key={i} className="text-sm text-zinc-300">{i + 1}. {action}</p>
                  ))}
                </div>
              </div>
            )}
          </div>

          {auditLoading && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
              <Loader2 size={24} className="animate-spin text-indigo-400 mx-auto mb-3" />
              <p className="text-zinc-300">Analyzing thumbnails and generating upgrade concepts...</p>
            </div>
          )}

          {insights.length > 0 && (
            <div className="space-y-6">
              {insights.map((insight, index) => {
                const video = insight.video;
                if (!video) return null;

                return (
                  <div key={`${insight.videoId}-${index}`} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <p className="text-base font-bold text-zinc-100 truncate">Enhanced Thumbnail</p>
                        <span className="text-zinc-600">•</span>
                        <p className="text-xs text-zinc-500">{formatRelativeTime(video.publishedAt)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-1 rounded-full bg-rose-500/15 text-rose-300 text-xs font-bold">
                          {Math.round(insight.thumbnailHealthScore)}
                        </span>
                        <span className="px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-300 text-xs font-bold">
                          {predictThumbnailScore(insight)}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] items-center gap-3">
                      <div className="rounded-lg border border-zinc-800 overflow-hidden bg-zinc-950 relative">
                        <img
                          src={video.thumbnailUrl}
                          alt={`Current thumbnail for ${video.title}`}
                          className="w-full aspect-video object-cover"
                          referrerPolicy="no-referrer"
                        />
                        <span className="absolute top-2 left-2 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded bg-black/70 text-zinc-200">
                          Current
                        </span>
                        <span className="absolute bottom-2 right-2 text-xs font-bold px-2 py-1 rounded bg-black/70 text-rose-300">
                          {Math.round(insight.thumbnailHealthScore)}
                        </span>
                      </div>

                      <div className="hidden md:flex justify-center">
                        <div className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center">
                          <ArrowRight size={14} className="text-zinc-400" />
                        </div>
                      </div>

                      <div className="rounded-lg border border-emerald-500/30 overflow-hidden bg-zinc-950 relative">
                        <img
                          src={video.thumbnailUrl}
                          alt={`Generated thumbnail concept for ${video.title}`}
                          className="w-full aspect-video object-cover brightness-[0.55] contrast-125 saturate-125"
                          referrerPolicy="no-referrer"
                        />
                        <div className="absolute inset-0 bg-gradient-to-br from-black/25 via-transparent to-emerald-500/25" />
                        <p className="absolute inset-0 flex items-center justify-center px-4 text-center text-white text-lg md:text-xl font-black uppercase tracking-tight drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
                          {trimToWords(insight.proposedTextOverlay, 4)}
                        </p>
                        <span className="absolute top-2 left-2 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded bg-black/70 text-emerald-200">
                          Generated
                        </span>
                        <span className="absolute bottom-2 right-2 text-xs font-bold px-2 py-1 rounded bg-black/70 text-emerald-300">
                          {predictThumbnailScore(insight)}
                        </span>
                      </div>
                    </div>

                    <div className="text-center">
                      <p className="text-base font-semibold text-zinc-100">{video.title}</p>
                      <p className="text-zinc-400 text-sm mt-1">
                        {compact(video.viewCount)} views • {formatRelativeTime(video.publishedAt)}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => regenerateThumbnailConcept(insight)}
                        disabled={regeneratingId === video.id || authorizingId === video.id}
                        className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-60 text-zinc-200 text-sm font-semibold transition-colors inline-flex items-center gap-2"
                      >
                        {regeneratingId === video.id ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                        Regenerate
                      </button>
                      <button
                        onClick={() => applyThumbnail(insight)}
                        disabled={authorizingId === video.id || authorizedIdSet.has(video.id)}
                        className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-zinc-400 text-sm font-semibold transition-colors inline-flex items-center gap-2"
                      >
                        {authorizingId === video.id ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
                        {authorizedIdSet.has(video.id) ? 'Applied' : 'Apply Thumbnail'}
                      </button>
                      <a
                        href={video.youtubeUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm font-semibold transition-colors inline-flex items-center gap-2"
                      >
                        <ExternalLink size={14} />
                        Open Video
                      </a>
                    </div>

                    {authorizedIdSet.has(video.id) && (
                      <p className="text-xs text-emerald-300 inline-flex items-center gap-1">
                        <CheckCircle2 size={14} /> Added to apply queue
                      </p>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                      <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                        <p className="text-xs uppercase tracking-wider text-zinc-500 font-bold">Main Issue</p>
                        <p className="text-zinc-300 mt-1">{insight.mainIssue}</p>
                      </div>
                      <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                        <p className="text-xs uppercase tracking-wider text-zinc-500 font-bold">Expected CTR Benefit</p>
                        <p className="text-zinc-300 mt-1">{insight.whyThisShouldImproveCtr}</p>
                        <p className="text-emerald-300 text-xs mt-2">Projected lift: +{Math.round(insight.projectedCtrLiftPercent)}%</p>
                      </div>
                      <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                        <p className="text-xs uppercase tracking-wider text-zinc-500 font-bold">Layout Plan</p>
                        <p className="text-zinc-300 mt-1">{insight.layoutDescription}</p>
                      </div>
                      <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                        <p className="text-xs uppercase tracking-wider text-zinc-500 font-bold">Title Treatment</p>
                        <p className="text-zinc-300 mt-1">{insight.titleTreatment}</p>
                      </div>
                      <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                        <p className="text-xs uppercase tracking-wider text-zinc-500 font-bold">Color Direction</p>
                        <p className="text-zinc-300 mt-1">{insight.colorDirection}</p>
                      </div>
                      <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                        <p className="text-xs uppercase tracking-wider text-zinc-500 font-bold">Visual Hook</p>
                        <p className="text-zinc-300 mt-1">{insight.visualHook}</p>
                      </div>
                      <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 md:col-span-2">
                        <p className="text-xs uppercase tracking-wider text-zinc-500 font-bold">Image Prompt</p>
                        <p className="text-zinc-300 mt-1 text-xs leading-relaxed">{insight.thumbnailImagePrompt}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-zinc-100">Thumbnail Apply Queue</h3>
                <p className="text-sm text-zinc-400 mt-1">
                  Thumbnails you applied are queued for creator review and execution.
                </p>
              </div>
              <button
                onClick={clearAuthorizationQueue}
                disabled={queueLoading || authorizationQueue.length === 0}
                className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-60 text-zinc-200 text-xs font-semibold transition-colors inline-flex items-center gap-2"
              >
                {queueLoading ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                Clear Queue
              </button>
            </div>

            {authorizationQueue.length === 0 ? (
              <p className="text-sm text-zinc-500 mt-4">No approved thumbnail swaps yet.</p>
            ) : (
              <div className="mt-4 space-y-3">
                {[...authorizationQueue]
                  .sort((a, b) => toNumber(b.swapPriority) - toNumber(a.swapPriority))
                  .map((item) => (
                  <div key={item.videoId} className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 flex items-start gap-3">
                    <img
                      src={item.currentThumbnailUrl}
                      alt={item.videoTitle}
                      className="w-24 h-14 object-cover rounded-md border border-zinc-800"
                      referrerPolicy="no-referrer"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-zinc-100">{item.videoTitle}</p>
                      <p className="text-xs text-zinc-400 mt-1">Overlay: {item.proposedTextOverlay}</p>
                      {item.titleTreatment ? (
                        <p className="text-xs text-zinc-500 mt-1">Title style: {item.titleTreatment}</p>
                      ) : null}
                      {toNumber(item.projectedCtrLiftPercent) > 0 ? (
                        <p className="text-xs text-emerald-300 mt-1">Projected CTR lift: +{Math.round(toNumber(item.projectedCtrLiftPercent))}%</p>
                      ) : null}
                      <p className="text-[11px] text-zinc-500 mt-1">Approved {new Date(item.approvedAt).toLocaleString()}</p>
                    </div>
                    <span className="px-2 py-1 text-[10px] uppercase tracking-wider rounded-full bg-emerald-500/15 text-emerald-300 font-bold">
                      {item.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-4 text-sm text-zinc-300 flex items-start gap-3">
            <Clock3 size={16} className="text-indigo-300 mt-0.5 shrink-0" />
            <p>
              Apply Thumbnail marks a swap as creator-approved. Execution is queued for your thumbnail production workflow.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
