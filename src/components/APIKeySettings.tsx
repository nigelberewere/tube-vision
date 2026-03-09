import { useState, useEffect } from 'react';
import { Key, Eye, EyeOff, CheckCircle, AlertCircle, ExternalLink, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';
import {
  saveGeminiKey,
  loadGeminiKey,
  deleteGeminiKey,
  hasGeminiKey,
  getUsageStats,
  getKeyFingerprint,
} from '../lib/geminiKeyStorage';
import { classifyGeminiError, getStatusMessage } from '../lib/geminiErrorClassifier';
import { getModel } from '../lib/modelStorage';
import { GoogleGenAI } from '@google/genai';

type KeyStatus = 'none' | 'connected' | 'invalid_key' | 'rate_limited' | 'quota_exhausted' | 'testing';

export default function APIKeySettings() {
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [status, setStatus] = useState<KeyStatus>('none');
  const [statusMessage, setStatusMessage] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [keyFingerprint, setKeyFingerprint] = useState<string | null>(null);

  // Load saved key status on mount
  useEffect(() => {
    loadKeyStatus();
  }, []);

  async function loadKeyStatus() {
    if (hasGeminiKey()) {
      const key = await loadGeminiKey();
      if (key) {
        setKeyFingerprint(getKeyFingerprint(key));
        
        // Check usage stats for error status
        const usage = getUsageStats();
        if (usage?.lastError) {
          const errorType = usage.lastError.type;
          setStatus(errorType);
          setStatusMessage(getStatusMessage(errorType));
        } else {
          setStatus('connected');
          setStatusMessage('Connected');
        }
      }
    } else {
      setStatus('none');
      setStatusMessage('No API key saved');
    }
  }

  async function handleSaveKey() {
    if (!apiKey.trim()) {
      setStatusMessage('Please enter an API key');
      return;
    }

    try {
      await saveGeminiKey(apiKey);
      setApiKey(''); // Clear input for security
      setShowKey(false);
      setStatusMessage('API key saved successfully');
      await loadKeyStatus();
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Failed to save API key');
    }
  }

  async function handleDeleteKey() {
    if (confirm('Are you sure you want to delete your API key? This cannot be undone.')) {
      deleteGeminiKey();
      setApiKey('');
      setKeyFingerprint(null);
      setStatus('none');
      setStatusMessage('API key deleted');
    }
  }

  async function handleTestConnection() {
    setIsTesting(true);
    setStatus('testing');
    setStatusMessage('Testing connection...');

    try {
      const key = await loadGeminiKey();
      if (!key) {
        throw new Error('No API key found');
      }

      // Make a lightweight test request using the general model
      const modelId = getModel('general');
      const ai = new GoogleGenAI({ apiKey: key });
      await ai.models.generateContent({
        model: modelId,
        contents: 'Say "test successful" in exactly 2 words.',
        config: {
          maxOutputTokens: 10,
        },
      });

      setStatus('connected');
      setStatusMessage('Connection successful');
    } catch (error) {
      const classified = classifyGeminiError(error);
      setStatus(classified.type as KeyStatus);
      setStatusMessage(classified.userMessage);
    } finally {
      setIsTesting(false);
    }
  }

  const getStatusColor = () => {
    switch (status) {
      case 'connected':
        return 'text-green-400';
      case 'invalid_key':
      case 'quota_exhausted':
        return 'text-red-400';
      case 'rate_limited':
        return 'text-yellow-400';
      case 'testing':
        return 'text-blue-400';
      default:
        return 'text-zinc-400';
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'connected':
        return <CheckCircle size={16} className="text-green-400" />;
      case 'invalid_key':
      case 'quota_exhausted':
      case 'rate_limited':
        return <AlertCircle size={16} className="text-yellow-400" />;
      case 'testing':
        return <Loader2 size={16} className="text-blue-400 animate-spin" />;
      default:
        return <Key size={16} className="text-zinc-400" />;
    }
  };

  const usage = getUsageStats();

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
        <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-bold">Settings</p>
        <h2 className="text-2xl font-bold text-white mt-2">API Keys</h2>
        <p className="text-slate-400 mt-2 max-w-2xl">
          Add your own Gemini API key to use VidVision's AI features. Your key is encrypted and stored only in your browser's local storage.
        </p>
      </div>

      {/* Security Notice */}
      <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
        <div className="flex gap-3">
          <Key size={18} className="text-blue-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-200">
            <p className="font-semibold">Your key stays in your browser</p>
            <p className="text-blue-300/80 mt-1">
              VidVision never sends your API key to our servers. It's encrypted and stored in your browser's site data, and will only be deleted when you clear your cookies.
            </p>
          </div>
        </div>
      </div>

      {/* Status Card */}
      {keyFingerprint && (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-zinc-400">Status</p>
              <div className="flex items-center gap-2 mt-2">
                {getStatusIcon()}
                <span className={cn('text-sm font-medium', getStatusColor())}>
                  {statusMessage}
                </span>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm text-zinc-400">Key</p>
              <p className="text-sm font-mono text-zinc-200 mt-2">{keyFingerprint}</p>
            </div>
          </div>

          {usage && (
            <div className="mt-4 pt-4 border-t border-zinc-800">
              <p className="text-xs text-zinc-400">
                API calls today: <span className="text-zinc-200 font-medium">{usage.count}</span>
              </p>
            </div>
          )}
        </div>
      )}

      {/* API Key Input */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 space-y-4">
        <div>
          <label className="text-sm font-medium text-white block mb-2">
            Gemini API Key
          </label>
          <div className="relative">
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="AIzaSy..."
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 pr-12 text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 font-mono text-sm"
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              {showKey ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          <p className="text-xs text-zinc-500 mt-2">
            Enter your Google Gemini API key. You can get one from{' '}
            <a
              href="https://aistudio.google.com/app/apikey"
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-400 hover:text-indigo-300 inline-flex items-center gap-1"
            >
              Google AI Studio
              <ExternalLink size={12} />
            </a>
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleSaveKey}
            disabled={!apiKey.trim()}
            className={cn(
              'flex-1 px-4 py-2.5 rounded-lg font-medium transition-all',
              apiKey.trim()
                ? 'bg-indigo-500 text-white hover:bg-indigo-600'
                : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
            )}
          >
            Save Key
          </button>

          {keyFingerprint && (
            <>
              <button
                onClick={handleTestConnection}
                disabled={isTesting}
                className="px-4 py-2.5 rounded-lg font-medium bg-zinc-800 text-white hover:bg-zinc-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isTesting ? 'Testing...' : 'Test Connection'}
              </button>
              <button
                onClick={handleDeleteKey}
                className="px-4 py-2.5 rounded-lg font-medium bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 transition-colors"
              >
                Delete
              </button>
            </>
          )}
        </div>
      </div>

      {/* Help Links */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
        <p className="text-sm font-medium text-white mb-3">Need help?</p>
        <div className="space-y-2">
          <a
            href="https://ai.google.dev/gemini-api/docs/api-key"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-sm text-zinc-400 hover:text-indigo-400 transition-colors"
          >
            <ExternalLink size={14} />
            How to get a Gemini API key
          </a>
          <a
            href="https://ai.google.dev/pricing"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-sm text-zinc-400 hover:text-indigo-400 transition-colors"
          >
            <ExternalLink size={14} />
            Understanding quotas and rate limits
          </a>
          <a
            href="https://aistudio.google.com/app/billing/overview"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-sm text-zinc-400 hover:text-indigo-400 transition-colors"
          >
            <ExternalLink size={14} />
            Check your API usage
          </a>
        </div>
      </div>
    </div>
  );
}
