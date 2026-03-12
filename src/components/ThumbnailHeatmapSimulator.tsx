import { useState, useRef, useEffect } from 'react';
import { generateVidVisionInsight } from '../services/geminiService';
import { Type } from '@google/genai';
import { Loader2, Upload, Eye, AlertCircle, CheckCircle, Zap } from 'lucide-react';
import { cn } from '../lib/utils';

interface AttentionZone {
  zone: string; // "top-left", "top-center", "top-right", "center-left", "center", "center-right", "bottom-left", "bottom-center", "bottom-right"
  attentionScore: number; // 0-100
  description: string;
  elements: string[];
}

interface HeatmapAnalysis {
  primaryFocusZone: string;
  secondaryFocusZones: string[];
  attentionZones: AttentionZone[];
  eyeTrackingPath: string[];
  layoutScore: number;
  strengths: string[];
  weaknesses: string[];
  improvements: string[];
  overallRecommendation: string;
}

interface UploadedImage {
  url: string;
  base64: string;
  filename: string;
}

export default function ThumbnailHeatmapSimulator() {
  const [uploadedImage, setUploadedImage] = useState<UploadedImage | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<HeatmapAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const handleImageUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64 = (e.target?.result as string).split(',')[1];
        setUploadedImage({
          url: e.target?.result as string,
          base64,
          filename: file.name
        });
        setImageFile(file);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      setError('Failed to process image');
    } finally {
      setLoading(false);
    }
  };

  const handleAnalyzeHeatmap = async () => {
    if (!uploadedImage) {
      setError('Please upload a thumbnail image first');
      return;
    }

    setError(null);
    setAnalysis(null);
    setAnalyzing(true);

    try {
      const schema = {
        type: Type.OBJECT,
        properties: {
          primaryFocusZone: {
            type: Type.STRING,
            description: 'The zone where viewers will look first (top-left, top-center, top-right, center-left, center, center-right, bottom-left, bottom-center, bottom-right)'
          },
          secondaryFocusZones: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Zones that receive secondary attention'
          },
          attentionZones: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                zone: { type: Type.STRING },
                attentionScore: { type: Type.NUMBER, description: 'Attention level 0-100' },
                description: { type: Type.STRING, description: 'What draws attention here' },
                elements: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Visual elements in this zone' }
              },
              required: ['zone', 'attentionScore', 'description', 'elements']
            }
          },
          eyeTrackingPath: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Likely path viewers eyes follow through the thumbnail (sequence of zones)'
          },
          layoutScore: {
            type: Type.NUMBER,
            description: 'Overall layout effectiveness (0-100). Measures how well elements guide attention.'
          },
          strengths: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: '2-3 things the thumbnail does well visually'
          },
          weaknesses: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: '2-3 visual design issues or attention problems'
          },
          improvements: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Specific, actionable changes to improve eye tracking and CTR'
          },
          overallRecommendation: {
            type: Type.STRING,
            description: 'Brief summary with primary recommendation (2-3 sentences)'
          }
        },
        required: ['primaryFocusZone', 'secondaryFocusZones', 'attentionZones', 'eyeTrackingPath', 'layoutScore', 'strengths', 'weaknesses', 'improvements', 'overallRecommendation']
      };

      const prompt = `You are an expert in YouTube thumbnail visual design and eye-tracking patterns. Analyze this thumbnail image and provide detailed attention mapping.

Analyze the thumbnail as a 3x3 grid:
- Top row: top-left, top-center, top-right
- Middle row: center-left, center, center-right
- Bottom row: bottom-left, bottom-center, bottom-right

For each zone, determine:
1. Attention score (0-100): How likely a viewer's eye lands there
2. What visual elements attract attention (color, contrast, faces, text, movement cues)
3. How this guides the overall visual journey

Consider:
- Contrast and brightness (high contrast attracts eyes)
- Faces and expressions (primary attention magnet)
- Text placement and readability
- Color psychology (warm colors vs cool, saturated vs muted)
- Subject positioning (rule of thirds, central placement)
- Visual weight and balance
- Directional cues (arrows, gaze direction)
- Text legibility at small sizes (YouTube thumbnail = ~168x94px display)

Provide:
- Primary focus zone (where eyes land first)
- Secondary zones (where they look next)
- Full attention mapping for all zones
- The natural eye-tracking sequence through the thumbnail
- Layout effectiveness score
- Specific, actionable improvements to maximize CTR

Return ONLY valid JSON matching the schema.`;

      const response = await generateVidVisionInsight(
        prompt,
        schema,
        {
          systemInstruction: 'You are an expert in YouTube thumbnail design and viewer eye-tracking. Analyze thumbnails for optimal visual hierarchy and attention flow. Return only valid JSON.',
          imageBase64: uploadedImage.base64,
          imageMediaType: 'image/png'
        }
      );

      if (response) {
        const parsed = JSON.parse(response);
        setAnalysis(parsed as HeatmapAnalysis);
        
        // Draw heatmap visualization
        setTimeout(() => drawHeatmap(parsed as HeatmapAnalysis), 100);
      }
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'Failed to analyze thumbnail. Please try again.');
    } finally {
      setAnalyzing(false);
    }
  };

  const drawHeatmap = (data: HeatmapAnalysis) => {
    const canvas = canvasRef.current;
    if (!canvas || !uploadedImage) return;

    const img = new Image();
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Draw original image
      ctx.drawImage(img, 0, 0);

      // Create heatmap overlay
      const zoneSize = {
        width: canvas.width / 3,
        height: canvas.height / 3
      };

      const zoneMap: { [key: string]: { x: number; y: number } } = {
        'top-left': { x: 0, y: 0 },
        'top-center': { x: 1, y: 0 },
        'top-right': { x: 2, y: 0 },
        'center-left': { x: 0, y: 1 },
        'center': { x: 1, y: 1 },
        'center-right': { x: 2, y: 1 },
        'bottom-left': { x: 0, y: 2 },
        'bottom-center': { x: 1, y: 2 },
        'bottom-right': { x: 2, y: 2 }
      };

      // Draw heatmap zones
      data.attentionZones.forEach((zone) => {
        const coords = zoneMap[zone.zone];
        if (!coords) return;

        const x = coords.x * zoneSize.width;
        const y = coords.y * zoneSize.height;

        // Heatmap color based on attention score
        const intensity = zone.attentionScore / 100;
        const hue = 360 - intensity * 120; // Red (hot) to green (cold)
        const color = `hsla(${hue}, 100%, 50%, ${0.3 * intensity})`;

        ctx.fillStyle = color;
        ctx.fillRect(x, y, zoneSize.width, zoneSize.height);

        // Add border to zones with attention
        if (zone.attentionScore > 20) {
          ctx.strokeStyle = `hsla(${hue}, 100%, 50%, 0.8)`;
          ctx.lineWidth = 2;
          ctx.strokeRect(x, y, zoneSize.width, zoneSize.height);

          // Add score text
          ctx.fillStyle = 'white';
          ctx.font = 'bold 12px Arial';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.shadowColor = 'rgba(0,0,0,0.8)';
          ctx.shadowBlur = 4;
          ctx.fillText(
            `${zone.attentionScore}%`,
            x + zoneSize.width / 2,
            y + zoneSize.height / 2
          );
          ctx.shadowColor = 'transparent';
        }
      });
    };
    img.src = uploadedImage.url;
  };

  return (
    <div className="space-y-6 sm:space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-100">Thumbnail Heatmap Simulator</h1>
        <p className="text-sm sm:text-base text-zinc-400 mt-2">Analyze where viewers' eyes land on your thumbnail and optimize for maximum CTR.</p>
      </div>

      {/* Upload Section */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 sm:p-6">
        <div className="flex flex-col lg:flex-row gap-4 sm:gap-6">
          {/* Upload Area */}
          <div className="flex-1">
            <label className="block text-sm font-medium text-zinc-300 mb-3">
              Thumbnail Image
            </label>
            <div
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                'border-2 border-dashed rounded-lg p-4 sm:p-8 text-center cursor-pointer transition-colors',
                uploadedImage
                  ? 'border-indigo-500/30 bg-indigo-500/5'
                  : 'border-zinc-700 bg-zinc-800/30 hover:border-zinc-600'
              )}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={(e) => {
                  if (e.target.files?.[0]) {
                    handleImageUpload(e.target.files[0]);
                  }
                }}
                className="hidden"
              />

              {loading ? (
                <div className="space-y-2">
                  <Loader2 className="w-8 h-8 animate-spin text-indigo-400 mx-auto" />
                  <p className="text-sm text-zinc-400">Processing image...</p>
                </div>
              ) : uploadedImage ? (
                <div className="space-y-2">
                  <CheckCircle className="w-8 h-8 text-emerald-400 mx-auto" />
                  <p className="text-sm text-zinc-300 font-medium">{uploadedImage.filename}</p>
                  <p className="text-xs text-zinc-500">Click to replace</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <Upload className="w-8 h-8 text-zinc-500 mx-auto" />
                  <p className="text-sm text-zinc-300 font-medium">Drop thumbnail or click to upload</p>
                  <p className="text-xs text-zinc-500">PNG, JPG, or WebP (recommended: 1280x720)</p>
                </div>
              )}
            </div>
          </div>

          {/* Preview */}
          {uploadedImage && (
            <div className="w-full max-w-xs lg:w-48">
              <p className="text-sm font-medium text-zinc-300 mb-2">Preview</p>
              <img
                src={uploadedImage.url}
                alt="Thumbnail preview"
                className="w-full rounded-lg object-cover border border-zinc-700"
              />
            </div>
          )}
        </div>

        {uploadedImage && (
          <button
            onClick={handleAnalyzeHeatmap}
            disabled={analyzing}
            className="mt-6 w-full h-11 sm:h-12 bg-indigo-500 hover:bg-indigo-600 disabled:bg-indigo-900 disabled:text-zinc-600 text-white text-sm sm:text-base font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {analyzing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Analyzing Heatmap...
              </>
            ) : (
              <>
                <Eye className="w-4 h-4" />
                Generate Heatmap Analysis
              </>
            )}
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start gap-3 text-sm text-red-300">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <p>{error}</p>
        </div>
      )}

      {/* Results */}
      {analysis && uploadedImage && (
        <div className="space-y-8">
          {/* Heatmap Canvas */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 sm:p-6">
            <h2 className="text-lg font-bold text-zinc-100 mb-4">Eye-Tracking Heatmap</h2>
            <div className="bg-zinc-950 rounded-lg p-3 sm:p-4 flex justify-center overflow-x-auto">
              <canvas
                ref={canvasRef}
                className="w-full h-auto max-w-2xl max-h-96 rounded border border-zinc-700"
              />
            </div>
            <p className="text-xs text-zinc-500 mt-3">
              Red = Hot zones (high attention) | Green = Cold zones (low attention)
            </p>
          </div>

          {/* Layout Score */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 sm:p-6 text-center">
              <div className="text-sm text-zinc-400 uppercase tracking-wider font-semibold mb-2">
                Layout Score
              </div>
              <div className="text-4xl font-bold text-indigo-400">{analysis.layoutScore}</div>
              <div className="text-xs text-zinc-500 mt-1">/100 effectiveness</div>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 sm:p-6">
              <div className="text-sm text-zinc-400 uppercase tracking-wider font-semibold mb-3">
                Primary Focus
              </div>
              <div className="text-sm font-semibold text-emerald-400 capitalize">
                {analysis.primaryFocusZone.replace('-', ' ')}
              </div>
              <div className="text-xs text-zinc-500 mt-2">
                {analysis.attentionZones.find((z) => z.zone === analysis.primaryFocusZone)?.description}
              </div>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 sm:p-6">
              <div className="text-sm text-zinc-400 uppercase tracking-wider font-semibold mb-3">
                Eye-Tracking Path
              </div>
              <div className="text-xs text-zinc-300 space-y-1">
                {analysis.eyeTrackingPath.map((zone, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-indigo-400 font-semibold">{i + 1}.</span>
                    <span className="capitalize">{zone.replace('-', ' ')}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Attention Zones Grid */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 sm:p-6">
            <h2 className="text-lg font-bold text-zinc-100 mb-4">Attention Zone Analysis</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 sm:gap-3">
              {analysis.attentionZones.map((zone) => {
                const intensity = zone.attentionScore / 100;
                return (
                  <div
                    key={zone.zone}
                    className="bg-zinc-950 border border-zinc-800 rounded-lg p-4"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-semibold text-zinc-100 capitalize">
                        {zone.zone.replace('-', ' ')}
                      </h3>
                      <div
                        className="w-8 h-8 rounded flex items-center justify-center text-xs font-bold"
                        style={{
                          backgroundColor: `hsla(${360 - intensity * 120}, 100%, 50%, 0.3)`,
                          color: `hsl(${360 - intensity * 120}, 100%, 50%)`
                        }}
                      >
                        {zone.attentionScore}
                      </div>
                    </div>
                    <p className="text-xs text-zinc-400 mb-2">{zone.description}</p>
                    <div className="flex flex-wrap gap-1">
                      {zone.elements.map((el, i) => (
                        <span
                          key={i}
                          className="text-[10px] bg-zinc-800 text-zinc-300 px-1.5 py-0.5 rounded"
                        >
                          {el}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Strengths, Weaknesses, Improvements */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
            {/* Strengths */}
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 sm:p-6">
              <h3 className="text-lg font-bold text-emerald-400 mb-4">Strengths ✓</h3>
              <ul className="space-y-2">
                {analysis.strengths.map((strength, i) => (
                  <li key={i} className="text-sm text-emerald-300 flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>{strength}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Weaknesses */}
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 sm:p-6">
              <h3 className="text-lg font-bold text-red-400 mb-4">Weaknesses ⚠</h3>
              <ul className="space-y-2">
                {analysis.weaknesses.map((weakness, i) => (
                  <li key={i} className="text-sm text-red-300 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>{weakness}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Improvements */}
          <div className="bg-amber-900/20 border border-amber-500/20 rounded-xl p-4 sm:p-6">
            <h3 className="text-lg font-bold text-amber-400 mb-4 flex items-center gap-2">
              <Zap className="w-5 h-5" />
              Actionable Improvements
            </h3>
            <ul className="space-y-3">
              {analysis.improvements.map((improvement, i) => (
                <li key={i} className="text-sm text-amber-200 flex items-start gap-3">
                  <span className="font-bold text-amber-400 flex-shrink-0 w-6">→</span>
                  <span>{improvement}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Recommendation */}
          <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-4 sm:p-6">
            <h3 className="text-lg font-bold text-indigo-400 mb-3">Overall Recommendation</h3>
            <p className="text-sm text-indigo-200 leading-relaxed">
              {analysis.overallRecommendation}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
