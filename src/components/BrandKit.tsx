import { useState, useEffect, useRef } from 'react';
import { Palette, Type as TypeIcon, Image as ImageIcon, Upload, Trash2, Plus, Save, Check, X, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export interface BrandKitData {
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    text: string;
  };
  fonts: {
    heading: string;
    body: string;
  };
  logos: {
    main: { url: string; filename: string } | null;
    secondary: { url: string; filename: string } | null;
  };
}

const DEFAULT_BRAND_KIT: BrandKitData = {
  colors: {
    primary: '#6366f1',
    secondary: '#8b5cf6',
    accent: '#ec4899',
    background: '#ffffff',
    text: '#000000'
  },
  fonts: {
    heading: 'Inter',
    body: 'Inter'
  },
  logos: {
    main: null,
    secondary: null
  }
};

const POPULAR_FONTS = [
  'Inter',
  'Roboto',
  'Montserrat',
  'Poppins',
  'Open Sans',
  'Lato',
  'Oswald',
  'Raleway',
  'Bebas Neue',
  'Playfair Display',
  'Merriweather',
  'Source Sans Pro',
  'Nunito',
  'Ubuntu',
  'Work Sans'
];

const STORAGE_KEY = 'vidvision_brand_kit';

export function loadBrandKit(): BrandKitData {
  if (typeof window === 'undefined') return DEFAULT_BRAND_KIT;
  
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.error('Failed to load brand kit:', e);
  }
  return DEFAULT_BRAND_KIT;
}

export function saveBrandKit(data: BrandKitData) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export default function BrandKit() {
  const [brandKit, setBrandKit] = useState<BrandKitData>(loadBrandKit());
  const [saved, setSaved] = useState(false);
  const [editingColor, setEditingColor] = useState<keyof BrandKitData['colors'] | null>(null);
  const mainLogoInputRef = useRef<HTMLInputElement>(null);
  const secondaryLogoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    saveBrandKit(brandKit);
  }, [brandKit]);

  const handleColorChange = (colorKey: keyof BrandKitData['colors'], value: string) => {
    setBrandKit(prev => ({
      ...prev,
      colors: {
        ...prev.colors,
        [colorKey]: value
      }
    }));
  };

  const handleFontChange = (fontKey: keyof BrandKitData['fonts'], value: string) => {
    setBrandKit(prev => ({
      ...prev,
      fonts: {
        ...prev.fonts,
        [fontKey]: value
      }
    }));
  };

  const handleLogoUpload = async (file: File, logoType: 'main' | 'secondary') => {
    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file');
      return;
    }

    try {
      const reader = new FileReader();
      reader.onload = (e) => {
        const url = e.target?.result as string;
        setBrandKit(prev => ({
          ...prev,
          logos: {
            ...prev.logos,
            [logoType]: { url, filename: file.name }
          }
        }));
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error('Failed to upload logo:', err);
    }
  };

  const handleRemoveLogo = (logoType: 'main' | 'secondary') => {
    setBrandKit(prev => ({
      ...prev,
      logos: {
        ...prev.logos,
        [logoType]: null
      }
    }));
  };

  const handleSave = () => {
    saveBrandKit(brandKit);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const resetToDefaults = () => {
    if (confirm('Are you sure you want to reset your brand kit to defaults? This cannot be undone.')) {
      setBrandKit(DEFAULT_BRAND_KIT);
    }
  };

  const colorEntries: Array<{ key: keyof BrandKitData['colors']; label: string; description: string }> = [
    { key: 'primary', label: 'Primary Color', description: 'Main brand color for buttons and highlights' },
    { key: 'secondary', label: 'Secondary Color', description: 'Supporting brand color for accents' },
    { key: 'accent', label: 'Accent Color', description: 'Call-to-action and emphasis color' },
    { key: 'background', label: 'Background Color', description: 'Default background for thumbnails' },
    { key: 'text', label: 'Text Color', description: 'Primary text color for overlays' }
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-10">
      {/* Header */}
      <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-indigo-500/10 via-purple-500/10 to-pink-500/10 p-6">
        <div className="flex items-center gap-3 mb-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500">
            <Palette className="text-white" size={20} />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-indigo-400 font-bold">Settings</p>
            <h2 className="text-2xl font-bold text-white">Brand Kit</h2>
          </div>
        </div>
        <p className="text-slate-300 max-w-3xl">
          Define your brand identity once and use it across all generated content. Upload logos, set brand colors, and choose fonts to maintain consistency in thumbnails and social posts.
        </p>
        
        <div className="mt-4 flex gap-3">
          <button
            onClick={handleSave}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition-all"
          >
            {saved ? <Check size={16} /> : <Save size={16} />}
            {saved ? 'Saved!' : 'Save Changes'}
          </button>
          <button
            onClick={resetToDefaults}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-medium transition-all"
          >
            <X size={16} />
            Reset to Defaults
          </button>
        </div>
      </div>

      {/* Brand Colors */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-800 bg-zinc-900/50">
          <div className="flex items-center gap-2">
            <Palette className="text-indigo-400" size={20} />
            <h3 className="text-lg font-semibold text-zinc-100">Brand Colors</h3>
          </div>
          <p className="text-sm text-zinc-400 mt-1">Your brand color palette for consistent visual identity</p>
        </div>

        <div className="p-6 space-y-4">
          {colorEntries.map(({ key, label, description }) => (
            <div key={key} className="flex items-center justify-between gap-4 p-4 bg-zinc-950/50 rounded-lg border border-zinc-800 hover:border-zinc-700 transition-colors">
              <div className="flex items-center gap-4 flex-1">
                <div className="relative group">
                  <button
                    onClick={() => setEditingColor(editingColor === key ? null : key)}
                    className="w-16 h-16 rounded-lg border-2 border-zinc-700 hover:border-zinc-600 transition-all cursor-pointer shadow-lg"
                    style={{ backgroundColor: brandKit.colors[key] }}
                  />
                  <div className="absolute inset-0 rounded-lg bg-black/0 group-hover:bg-black/10 transition-colors pointer-events-none" />
                </div>
                <div className="flex-1">
                  <h4 className="text-sm font-medium text-zinc-100">{label}</h4>
                  <p className="text-xs text-zinc-500 mt-0.5">{description}</p>
                  <code className="text-xs text-indigo-400 font-mono mt-1 block">{brandKit.colors[key]}</code>
                </div>
              </div>
              
              <AnimatePresence>
                {editingColor === key && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="flex items-center gap-2"
                  >
                    <input
                      type="color"
                      value={brandKit.colors[key]}
                      onChange={(e) => handleColorChange(key, e.target.value)}
                      className="w-12 h-12 rounded-lg border-2 border-indigo-500 cursor-pointer"
                    />
                    <input
                      type="text"
                      value={brandKit.colors[key]}
                      onChange={(e) => handleColorChange(key, e.target.value)}
                      className="w-28 px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-lg text-zinc-100 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                      placeholder="#000000"
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
      </div>

      {/* Brand Fonts */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-800 bg-zinc-900/50">
          <div className="flex items-center gap-2">
            <TypeIcon className="text-purple-400" size={20} />
            <h3 className="text-lg font-semibold text-zinc-100">Brand Fonts</h3>
          </div>
          <p className="text-sm text-zinc-400 mt-1">Typography preferences for thumbnails and social content</p>
        </div>

        <div className="p-6 space-y-4">
          <div className="space-y-3">
            <label className="block">
              <span className="text-sm font-medium text-zinc-300 mb-2 block">Heading Font</span>
              <select
                value={brandKit.fonts.heading}
                onChange={(e) => handleFontChange('heading', e.target.value)}
                className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                style={{ fontFamily: brandKit.fonts.heading }}
              >
                {POPULAR_FONTS.map(font => (
                  <option key={font} value={font} style={{ fontFamily: font }}>
                    {font}
                  </option>
                ))}
              </select>
              <p className="text-xs text-zinc-500 mt-1">Used for thumbnail text overlays and social post headlines</p>
            </label>
          </div>

          <div className="space-y-3">
            <label className="block">
              <span className="text-sm font-medium text-zinc-300 mb-2 block">Body Font</span>
              <select
                value={brandKit.fonts.body}
                onChange={(e) => handleFontChange('body', e.target.value)}
                className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                style={{ fontFamily: brandKit.fonts.body }}
              >
                {POPULAR_FONTS.map(font => (
                  <option key={font} value={font} style={{ fontFamily: font }}>
                    {font}
                  </option>
                ))}
              </select>
              <p className="text-xs text-zinc-500 mt-1">Used for descriptions and body copy in generated content</p>
            </label>
          </div>

          {/* Font Preview */}
          <div className="mt-6 p-6 bg-zinc-950/50 rounded-lg border border-zinc-800">
            <p className="text-xs text-zinc-500 mb-3">Preview:</p>
            <h1 className="text-3xl font-bold text-zinc-100 mb-2" style={{ fontFamily: brandKit.fonts.heading }}>
              This is Your Heading Font
            </h1>
            <p className="text-zinc-400" style={{ fontFamily: brandKit.fonts.body }}>
              This is your body font. It will be used for descriptions, subtitles, and paragraph content across all generated materials.
            </p>
          </div>
        </div>
      </div>

      {/* Brand Logos */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-800 bg-zinc-900/50">
          <div className="flex items-center gap-2">
            <ImageIcon className="text-pink-400" size={20} />
            <h3 className="text-lg font-semibold text-zinc-100">Brand Logos</h3>
          </div>
          <p className="text-sm text-zinc-400 mt-1">Upload logo variations for automatic placement in thumbnails</p>
        </div>

        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Main Logo */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-zinc-300">Main Logo</h4>
            {brandKit.logos.main ? (
              <div className="relative group">
                <div className="bg-zinc-950/50 border border-zinc-800 rounded-lg p-6 flex items-center justify-center min-h-[200px]">
                  <img
                    src={brandKit.logos.main.url}
                    alt="Main logo"
                    className="max-w-full max-h-[180px] object-contain"
                  />
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-xs text-zinc-500 truncate">{brandKit.logos.main.filename}</span>
                  <button
                    onClick={() => handleRemoveLogo('main')}
                    className="p-2 rounded-lg hover:bg-red-500/20 text-red-400 hover:text-red-300 transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ) : (
              <div
                onClick={() => mainLogoInputRef.current?.click()}
                className="border-2 border-dashed border-zinc-700 hover:border-indigo-500/50 rounded-lg p-12 flex flex-col items-center justify-center gap-3 cursor-pointer transition-all hover:bg-zinc-800/30 group min-h-[200px]"
              >
                <div className="p-3 rounded-full bg-zinc-800 group-hover:bg-indigo-500/20 transition-colors">
                  <Upload className="text-zinc-400 group-hover:text-indigo-400 transition-colors" size={24} />
                </div>
                <div className="text-center">
                  <p className="text-zinc-300 font-medium">Upload Main Logo</p>
                  <p className="text-zinc-500 text-xs mt-1">PNG, SVG, or JPG</p>
                </div>
              </div>
            )}
            <input
              ref={mainLogoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleLogoUpload(e.target.files[0], 'main')}
            />
            <p className="text-xs text-zinc-500">Primary logo for standard thumbnail placements</p>
          </div>

          {/* Secondary Logo */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-zinc-300">Secondary Logo (Optional)</h4>
            {brandKit.logos.secondary ? (
              <div className="relative group">
                <div className="bg-zinc-950/50 border border-zinc-800 rounded-lg p-6 flex items-center justify-center min-h-[200px]">
                  <img
                    src={brandKit.logos.secondary.url}
                    alt="Secondary logo"
                    className="max-w-full max-h-[180px] object-contain"
                  />
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-xs text-zinc-500 truncate">{brandKit.logos.secondary.filename}</span>
                  <button
                    onClick={() => handleRemoveLogo('secondary')}
                    className="p-2 rounded-lg hover:bg-red-500/20 text-red-400 hover:text-red-300 transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ) : (
              <div
                onClick={() => secondaryLogoInputRef.current?.click()}
                className="border-2 border-dashed border-zinc-700 hover:border-purple-500/50 rounded-lg p-12 flex flex-col items-center justify-center gap-3 cursor-pointer transition-all hover:bg-zinc-800/30 group min-h-[200px]"
              >
                <div className="p-3 rounded-full bg-zinc-800 group-hover:bg-purple-500/20 transition-colors">
                  <Plus className="text-zinc-400 group-hover:text-purple-400 transition-colors" size={24} />
                </div>
                <div className="text-center">
                  <p className="text-zinc-300 font-medium">Upload Secondary Logo</p>
                  <p className="text-zinc-500 text-xs mt-1">Icon or monogram version</p>
                </div>
              </div>
            )}
            <input
              ref={secondaryLogoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleLogoUpload(e.target.files[0], 'secondary')}
            />
            <p className="text-xs text-zinc-500">Compact logo for smaller thumbnail placements</p>
          </div>
        </div>
      </div>

      {/* AI Integration Info */}
      <div className="bg-gradient-to-r from-indigo-500/10 to-purple-500/10 border border-indigo-500/30 rounded-xl p-6">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-indigo-500/20">
            <Sparkles className="text-indigo-400" size={20} />
          </div>
          <div>
            <h3 className="text-sm font-medium text-indigo-300 mb-1">AI-Powered Brand Consistency</h3>
            <p className="text-zinc-300 text-sm leading-relaxed">
              Your brand kit is automatically applied when generating:
            </p>
            <ul className="mt-3 space-y-2 text-sm text-zinc-400">
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                <span><strong className="text-zinc-300">Thumbnail concepts</strong> - AI uses your colors, fonts, and logo placement recommendations</span>
              </li>
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                <span><strong className="text-zinc-300">Social media posts</strong> - Generated copy maintains your brand voice and style</span>
              </li>
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-pink-400" />
                <span><strong className="text-zinc-300">Content designs</strong> - All visual assets stay on-brand automatically</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
