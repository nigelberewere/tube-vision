import { useState, useRef } from 'react';
import { generateVidVisionInsight } from '../services/geminiService';
import { Type } from '@google/genai';
import { Loader2, Upload, Eye, Trophy, TrendingUp, AlertCircle, X, Zap, Target, Image as ImageIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ThumbnailAnalysis {
  visualSalienceScore: number;
  clickabilityScore: number;
  emotionalImpact: number;
  textReadability: number;
  colorContrast: number;
  faceExpressionScore: number;
  compositionBalance: number;
  brandingClarity: number;
  overallCTRPrediction: number;
  strengths: string[];
  weaknesses: string[];
  mainFocalPoint: string;
  attentionGrabbers: string[];
  improvementSuggestions: string[];
  predictedPerformance: string;
}

interface UploadedThumbnail {
  id: string;
  url: string;
  base64: string;
  filename: string;
  analysis: ThumbnailAnalysis | null;
  analyzing: boolean;
}

interface ABTestResult {
  winner: 'A' | 'B' | 'tie';
  winnerScore: number;
  loserScore: number;
  scoreDifference: number;
  confidence: number;
  reasoning: string;
  recommendation: string;
  keyDifferentiators: string[];
}

export default function ThumbnailABTester() {
  const [thumbnails, setThumbnails] = useState<{ A: UploadedThumbnail | null; B: UploadedThumbnail | null }>({
    A: null,
    B: null
  });
  const [testResult, setTestResult] = useState<ABTestResult | null>(null);
  const [comparing, setComparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const fileInputRefA = useRef<HTMLInputElement>(null);
  const fileInputRefB = useRef<HTMLInputElement>(null);

  const handleImageUpload = async (file: File, slot: 'A' | 'B') => {
    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file');
      return;
    }

    setError(null);

    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64 = (e.target?.result as string).split(',')[1];
        const uploaded: UploadedThumbnail = {
          id: slot,
          url: e.target?.result as string,
          base64,
          filename: file.name,
          analysis: null,
          analyzing: false
        };
        
        setThumbnails(prev => ({ ...prev, [slot]: uploaded }));
        
        // Auto-analyze on upload
        await analyzeThumbnail(uploaded, slot);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      setError('Failed to process image');
    }
  };

  const analyzeThumbnail = async (thumbnail: UploadedThumbnail, slot: 'A' | 'B') => {
    setThumbnails(prev => ({
      ...prev,
      [slot]: prev[slot] ? { ...prev[slot]!, analyzing: true } : null
    }));

    try {
      const schema = {
        type: Type.OBJECT,
        properties: {
          visualSalienceScore: {
            type: Type.NUMBER,
            description: 'How eye-catching and attention-grabbing (0-100). High contrast, bright colors, faces score higher.'
          },
          clickabilityScore: {
            type: Type.NUMBER,
            description: 'Overall likelihood to get clicks (0-100). Combines curiosity, emotion, clarity.'
          },
          emotionalImpact: {
            type: Type.NUMBER,
            description: 'Emotional resonance and expressiveness (0-100). Strong facial expressions, dramatic scenes score higher.'
          },
          textReadability: {
            type: Type.NUMBER,
            description: 'How readable text is at thumbnail size 168x94px (0-100). Bold, contrasted, minimal text scores higher.'
          },
          colorContrast: {
            type: Type.NUMBER,
            description: 'Color contrast and visual pop (0-100). High saturation, complementary colors score higher.'
          },
          faceExpressionScore: {
            type: Type.NUMBER,
            description: 'Human face presence and expression quality (0-100). Expressive faces in frame score 80+, no faces score 0.'
          },
          compositionBalance: {
            type: Type.NUMBER,
            description: 'Visual composition and layout quality (0-100). Rule of thirds, focal points, balance.'
          },
          brandingClarity: {
            type: Type.NUMBER,
            description: 'Brand elements visibility (0-100). Clear logos, consistent style score higher.'
          },
          overallCTRPrediction: {
            type: Type.NUMBER,
            description: 'Predicted Click-Through Rate percentage (0-100). Weighted average of all factors.'
          },
          strengths: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: '3-5 specific strengths of this thumbnail'
          },
          weaknesses: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: '2-3 areas for improvement'
          },
          mainFocalPoint: {
            type: Type.STRING,
            description: 'What the eye is drawn to first'
          },
          attentionGrabbers: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Elements that attract viewer attention'
          },
          improvementSuggestions: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Specific, actionable improvements to boost CTR'
          },
          predictedPerformance: {
            type: Type.STRING,
            description: 'One-sentence performance prediction'
          }
        },
        required: ['visualSalienceScore', 'clickabilityScore', 'emotionalImpact', 'textReadability', 'colorContrast', 'faceExpressionScore', 'compositionBalance', 'brandingClarity', 'overallCTRPrediction', 'strengths', 'weaknesses', 'mainFocalPoint', 'attentionGrabbers', 'improvementSuggestions', 'predictedPerformance']
      };

      const prompt = `You are a YouTube thumbnail expert analyzing visual performance. Analyze this thumbnail image for CTR potential.

Evaluate these factors:
1. **Visual Salience**: Contrast, brightness, color saturation, visual "pop" in a crowded feed
2. **Clickability**: Curiosity gap, emotional hook, value proposition clarity
3. **Emotional Impact**: Facial expressions, dramatic elements, mood
4. **Text Readability**: At 168x94px (YouTube display size), is text legible and punchy?
5. **Color Contrast**: Does it stand out? High contrast = more clicks
6. **Face Expression**: Clear, expressive human faces are proven CTR boosters
7. **Composition**: Visual balance, focal points, rule of thirds
8. **Branding**: Logo/brand elements visibility

Score each factor 0-100. Calculate overallCTRPrediction as weighted average:
- Visual Salience: 25%
- Clickability: 20%
- Emotional Impact: 20%
- Face Expression: 15%
- Text Readability: 10%
- Color Contrast: 5%
- Composition: 3%
- Branding: 2%

Predict performance compared to average YouTube thumbnails. Be specific about what works and what doesn't.

Return ONLY valid JSON.`;

      const response = await generateVidVisionInsight(
        prompt,
        schema,
        {
          systemInstruction: 'You are a YouTube thumbnail performance analyst. Score thumbnails on visual salience, clickability, and CTR potential. Return only valid JSON.',
          imageBase64: thumbnail.base64,
          imageMediaType: 'image/png'
        }
      );

      if (response) {
        const analysis = JSON.parse(response) as ThumbnailAnalysis;
        setThumbnails(prev => ({
          ...prev,
          [slot]: prev[slot] ? { ...prev[slot]!, analysis, analyzing: false } : null
        }));
      }
    } catch (err: any) {
      console.error('Analysis error:', err);
      setError(`Failed to analyze Thumbnail ${slot}`);
      setThumbnails(prev => ({
        ...prev,
        [slot]: prev[slot] ? { ...prev[slot]!, analyzing: false } : null
      }));
    }
  };

  const compareTestResult = async () => {
    if (!thumbnails.A?.analysis || !thumbnails.B?.analysis) {
      setError('Both thumbnails must be analyzed before comparison');
      return;
    }

    setComparing(true);
    setError(null);

    try {
      const schema = {
        type: Type.OBJECT,
        properties: {
          winner: {
            type: Type.STRING,
            description: 'A, B, or tie',
            enum: ['A', 'B', 'tie']
          },
          winnerScore: { type: Type.NUMBER },
          loserScore: { type: Type.NUMBER },
          scoreDifference: { type: Type.NUMBER },
          confidence: {
            type: Type.NUMBER,
            description: 'Confidence in prediction 0-100%'
          },
          reasoning: {
            type: Type.STRING,
            description: 'Why the winner will outperform (3-4 sentences)'
          },
          recommendation: {
            type: Type.STRING,
            description: 'Final recommendation on which to publish'
          },
          keyDifferentiators: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: '3-4 key factors that tip the scales'
          }
        },
        required: ['winner', 'winnerScore', 'loserScore', 'scoreDifference', 'confidence', 'reasoning', 'recommendation', 'keyDifferentiators']
      };

      const prompt = `Compare these two thumbnail analyses and predict which will perform better on YouTube.

**Thumbnail A Analysis:**
- Overall CTR Prediction: ${thumbnails.A.analysis.overallCTRPrediction}%
- Visual Salience: ${thumbnails.A.analysis.visualSalienceScore}
- Clickability: ${thumbnails.A.analysis.clickabilityScore}
- Emotional Impact: ${thumbnails.A.analysis.emotionalImpact}
- Face Expression: ${thumbnails.A.analysis.faceExpressionScore}
- Text Readability: ${thumbnails.A.analysis.textReadability}
- Color Contrast: ${thumbnails.A.analysis.colorContrast}
- Composition: ${thumbnails.A.analysis.compositionBalance}
- Strengths: ${thumbnails.A.analysis.strengths.join(', ')}
- Weaknesses: ${thumbnails.A.analysis.weaknesses.join(', ')}

**Thumbnail B Analysis:**
- Overall CTR Prediction: ${thumbnails.B.analysis.overallCTRPrediction}%
- Visual Salience: ${thumbnails.B.analysis.visualSalienceScore}
- Clickability: ${thumbnails.B.analysis.clickabilityScore}
- Emotional Impact: ${thumbnails.B.analysis.emotionalImpact}
- Face Expression: ${thumbnails.B.analysis.faceExpressionScore}
- Text Readability: ${thumbnails.B.analysis.textReadability}
- Color Contrast: ${thumbnails.B.analysis.colorContrast}
- Composition: ${thumbnails.B.analysis.compositionBalance}
- Strengths: ${thumbnails.B.analysis.strengths.join(', ')}
- Weaknesses: ${thumbnails.B.analysis.weaknesses.join(', ')}

Determine the winner based on:
1. Overall CTR prediction
2. Visual salience (most important for initial click)
3. Clickability and emotional hooks
4. Comparative strengths/weaknesses

If scores are within 5 points, consider it a tie. Provide confidence level and specific reasoning.`;

      const response = await generateVidVisionInsight(prompt, schema, {
        systemInstruction: 'You are a YouTube A/B testing expert. Compare thumbnails and predict which will drive more clicks. Be decisive but honest about confidence. Return only valid JSON.'
      });

      if (response) {
        const result = JSON.parse(response) as ABTestResult;
        setTestResult(result);
      }
    } catch (err: any) {
      console.error('Comparison error:', err);
      setError('Failed to compare thumbnails');
    } finally {
      setComparing(false);
    }
  };

  const removeThumbnail = (slot: 'A' | 'B') => {
    setThumbnails(prev => ({ ...prev, [slot]: null }));
    setTestResult(null);
    setError(null);
  };

  const canCompare = thumbnails.A?.analysis && thumbnails.B?.analysis && !thumbnails.A.analyzing && !thumbnails.B.analyzing;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-zinc-100">A/B Testing Simulator</h1>
        <p className="text-zinc-400 mt-2">Upload two thumbnail concepts and discover which one will drive more clicks before you publish.</p>
      </div>

      {/* Error Message */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-center gap-3"
          >
            <AlertCircle className="text-red-400" size={20} />
            <p className="text-red-200 text-sm">{error}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Upload Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {(['A', 'B'] as const).map((slot) => {
          const thumbnail = thumbnails[slot];
          
          return (
            <div key={slot} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold text-lg ${
                    slot === 'A' 
                      ? 'bg-gradient-to-br from-blue-500 to-indigo-500' 
                      : 'bg-gradient-to-br from-purple-500 to-pink-500'
                  } text-white`}>
                    {slot}
                  </div>
                  <h2 className="text-lg font-semibold text-zinc-100">Thumbnail {slot}</h2>
                </div>
                {thumbnail && (
                  <button
                    onClick={() => removeThumbnail(slot)}
                    className="p-2 rounded-lg hover:bg-red-500/20 text-zinc-400 hover:text-red-400 transition-colors"
                  >
                    <X size={18} />
                  </button>
                )}
              </div>

              <div className="p-6">
                {!thumbnail ? (
                  <div className="space-y-4">
                    <div
                      onClick={() => slot === 'A' ? fileInputRefA.current?.click() : fileInputRefB.current?.click()}
                      className="border-2 border-dashed border-zinc-700 hover:border-indigo-500/50 rounded-xl p-12 flex flex-col items-center justify-center gap-4 cursor-pointer transition-all hover:bg-zinc-800/30 group"
                    >
                      <div className="p-4 rounded-full bg-zinc-800 group-hover:bg-indigo-500/20 transition-colors">
                        <Upload className="text-zinc-400 group-hover:text-indigo-400 transition-colors" size={32} />
                      </div>
                      <div className="text-center">
                        <p className="text-zinc-300 font-medium">Upload Thumbnail {slot}</p>
                        <p className="text-zinc-500 text-sm mt-1">PNG, JPG up to 10MB</p>
                      </div>
                    </div>
                    <input
                      ref={slot === 'A' ? fileInputRefA : fileInputRefB}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => e.target.files?.[0] && handleImageUpload(e.target.files[0], slot)}
                    />
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Thumbnail Preview */}
                    <div className="relative rounded-lg overflow-hidden bg-zinc-950">
                      <img
                        src={thumbnail.url}
                        alt={`Thumbnail ${slot}`}
                        className="w-full h-auto"
                      />
                      {thumbnail.analyzing && (
                        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center">
                          <div className="flex flex-col items-center gap-3">
                            <Loader2 className="animate-spin text-indigo-400" size={32} />
                            <p className="text-sm text-zinc-300">Analyzing...</p>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Analysis Results */}
                    {thumbnail.analysis && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="space-y-4"
                      >
                        {/* Overall CTR Score */}
                        <div className="bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 rounded-lg p-4">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm text-zinc-300">Predicted CTR</span>
                            <Trophy className="text-yellow-400" size={18} />
                          </div>
                          <div className="text-3xl font-bold text-white">
                            {thumbnail.analysis.overallCTRPrediction.toFixed(1)}%
                          </div>
                          <p className="text-xs text-zinc-400 mt-1">{thumbnail.analysis.predictedPerformance}</p>
                        </div>

                        {/* Score Breakdown */}
                        <div className="grid grid-cols-2 gap-3">
                          {[
                            { label: 'Visual Salience', value: thumbnail.analysis.visualSalienceScore, icon: Zap },
                            { label: 'Clickability', value: thumbnail.analysis.clickabilityScore, icon: Target },
                            { label: 'Emotional Impact', value: thumbnail.analysis.emotionalImpact, icon: Eye },
                            { label: 'Face Expression', value: thumbnail.analysis.faceExpressionScore, icon: ImageIcon },
                          ].map((metric) => (
                            <div key={metric.label} className="bg-zinc-950/50 rounded-lg p-3">
                              <div className="flex items-center gap-2 mb-1">
                                <metric.icon size={14} className="text-indigo-400" />
                                <span className="text-xs text-zinc-400">{metric.label}</span>
                              </div>
                              <div className="text-xl font-bold text-zinc-100">{metric.value}</div>
                              <div className="mt-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-500"
                                  style={{ width: `${metric.value}%` }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Strengths & Weaknesses */}
                        <div className="space-y-3">
                          <div>
                            <h4 className="text-xs font-medium text-emerald-400 mb-2">✓ Strengths</h4>
                            <ul className="space-y-1">
                              {thumbnail.analysis.strengths.map((strength, i) => (
                                <li key={i} className="text-sm text-zinc-300 flex items-start gap-2">
                                  <span className="text-emerald-400 mt-0.5">•</span>
                                  <span>{strength}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                          <div>
                            <h4 className="text-xs font-medium text-amber-400 mb-2">⚠ Weaknesses</h4>
                            <ul className="space-y-1">
                              {thumbnail.analysis.weaknesses.map((weakness, i) => (
                                <li key={i} className="text-sm text-zinc-300 flex items-start gap-2">
                                  <span className="text-amber-400 mt-0.5">•</span>
                                  <span>{weakness}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Compare Button */}
      {canCompare && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex justify-center"
        >
          <button
            onClick={compareTestResult}
            disabled={comparing}
            className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 text-white px-8 py-4 rounded-xl font-semibold text-lg flex items-center gap-3 transition-all shadow-lg shadow-indigo-500/20"
          >
            {comparing ? (
              <>
                <Loader2 size={24} className="animate-spin" />
                <span>Running A/B Test...</span>
              </>
            ) : (
              <>
                <Trophy size={24} />
                <span>Compare & Predict Winner</span>
              </>
            )}
          </button>
        </motion.div>
      )}

      {/* Test Results */}
      <AnimatePresence>
        {testResult && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="bg-gradient-to-br from-emerald-900/20 to-zinc-900 border border-emerald-500/30 rounded-xl overflow-hidden"
          >
            <div className="px-6 py-4 border-b border-emerald-500/30 bg-emerald-900/20">
              <div className="flex items-center gap-3">
                <Trophy className="text-emerald-400" size={24} />
                <h2 className="text-xl font-bold text-zinc-100">Test Results</h2>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {/* Winner Announcement */}
              <div className="text-center py-8">
                {testResult.winner === 'tie' ? (
                  <div>
                    <div className="text-6xl font-bold text-zinc-300 mb-2">TIE</div>
                    <p className="text-zinc-400 text-lg">Both thumbnails are equally strong</p>
                  </div>
                ) : (
                  <div>
                    <div className="text-sm text-emerald-400 font-medium mb-2">PREDICTED WINNER</div>
                    <div className={`text-8xl font-bold mb-4 bg-clip-text text-transparent ${
                      testResult.winner === 'A'
                        ? 'bg-gradient-to-r from-blue-400 to-indigo-400'
                        : 'bg-gradient-to-r from-purple-400 to-pink-400'
                    }`}>
                      {testResult.winner}
                    </div>
                    <div className="flex items-center justify-center gap-4 text-zinc-300 text-lg">
                      <span className="font-bold">{testResult.winnerScore.toFixed(1)}%</span>
                      <TrendingUp className="text-emerald-400" size={20} />
                      <span>vs</span>
                      <span className="font-bold">{testResult.loserScore.toFixed(1)}%</span>
                    </div>
                    <p className="text-sm text-zinc-500 mt-2">
                      +{testResult.scoreDifference.toFixed(1)} point advantage
                    </p>
                  </div>
                )}
              </div>

              {/* Confidence */}
              <div className="bg-zinc-950/50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm text-zinc-400">Prediction Confidence</span>
                  <span className="text-2xl font-bold text-zinc-100">{testResult.confidence}%</span>
                </div>
                <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-500 to-green-500 rounded-full transition-all duration-1000"
                    style={{ width: `${testResult.confidence}%` }}
                  />
                </div>
              </div>

              {/* Reasoning */}
              <div>
                <h3 className="text-sm font-medium text-zinc-300 mb-3">Why This Prediction?</h3>
                <p className="text-zinc-400 leading-relaxed">{testResult.reasoning}</p>
              </div>

              {/* Key Differentiators */}
              <div>
                <h3 className="text-sm font-medium text-zinc-300 mb-3">Key Differentiators</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {testResult.keyDifferentiators.map((diff, i) => (
                    <div key={i} className="bg-zinc-950/50 rounded-lg p-3 flex items-start gap-3">
                      <div className="p-1.5 rounded bg-emerald-500/20">
                        <Target className="text-emerald-400" size={16} />
                      </div>
                      <p className="text-sm text-zinc-300 flex-1">{diff}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Recommendation */}
              <div className="bg-gradient-to-r from-emerald-500/10 to-green-500/10 border border-emerald-500/30 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <Trophy className="text-emerald-400 mt-0.5" size={20} />
                  <div>
                    <h3 className="text-sm font-medium text-emerald-300 mb-1">Recommendation</h3>
                    <p className="text-zinc-300">{testResult.recommendation}</p>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Info Section */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
        <h3 className="text-sm font-medium text-zinc-300 mb-3">How A/B Testing Works</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-indigo-500/10">
              <Eye className="text-indigo-400" size={16} />
            </div>
            <div>
              <p className="text-zinc-300 font-medium">Visual Analysis</p>
              <p className="text-zinc-500 text-xs mt-1">AI evaluates salience, contrast, composition, and emotional impact</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-purple-500/10">
              <Target className="text-purple-400" size={16} />
            </div>
            <div>
              <p className="text-zinc-300 font-medium">CTR Prediction</p>
              <p className="text-zinc-500 text-xs mt-1">Scores based on proven YouTube thumbnail performance factors</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/10">
              <Trophy className="text-emerald-400" size={16} />
            </div>
            <div>
              <p className="text-zinc-300 font-medium">Winner Selection</p>
              <p className="text-zinc-500 text-xs mt-1">Data-driven recommendation on which thumbnail to publish</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
