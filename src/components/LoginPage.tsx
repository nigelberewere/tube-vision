import { useState } from 'react';
import { BarChart4, FileText, Mic, Search, Lightbulb, Image as ImageIcon, Play } from 'lucide-react';

interface LoginPageProps {
  onConnect: () => void | Promise<void>;
  isBusy?: boolean;
  busyLabel?: string;
}

const features = [
  { icon: BarChart4, label: 'Channel Analytics', color: 'text-indigo-400' },
  { icon: Search, label: 'SEO Optimizer', color: 'text-violet-400' },
  { icon: Mic, label: 'Neural Voice Studio', color: 'text-blue-400' },
  { icon: FileText, label: 'Script Architect', color: 'text-sky-400' },
  { icon: ImageIcon, label: 'Thumbnail Studio', color: 'text-emerald-400' },
  { icon: Lightbulb, label: 'Video Idea Generator', color: 'text-amber-400' },
  { icon: Play, label: 'YouTube Shorts Studio', color: 'text-red-400' },
];

export default function LoginPage({ onConnect, isBusy = false, busyLabel = 'Finalizing sign out...' }: LoginPageProps) {
  const [loading, setLoading] = useState(false);

  const handleSignIn = async () => {
    if (loading || isBusy) {
      return;
    }

    setLoading(true);
    try {
      await onConnect();
    } catch (error) {
      console.error('Failed to start OAuth flow:', error);
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-[#050505] flex flex-col items-center justify-center overflow-hidden px-4">
      {/* Ambient glow layers */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 80% 60% at 50% -10%, rgba(99,102,241,0.18) 0%, transparent 70%), radial-gradient(ellipse 60% 40% at 80% 110%, rgba(239,68,68,0.12) 0%, transparent 70%)',
        }}
      />

      {/* Subtle grid texture */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.8) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      <div className="relative z-10 w-full max-w-sm flex flex-col items-center gap-8">
        {/* Logo + brand */}
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div
              aria-hidden="true"
              className="absolute inset-0 rounded-2xl blur-xl opacity-60"
              style={{ background: 'linear-gradient(135deg, #6366f1, #ef4444)' }}
            />
            <div className="relative w-16 h-16 rounded-2xl bg-[#0b0b0f] border border-white/10 flex items-center justify-center shadow-2xl">
              <img src="/favicon.svg" alt="Janso Studio" className="w-10 h-10" />
            </div>
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight text-white">Janso Studio</h1>
            <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500 mt-0.5">New Heights Everyday</p>
          </div>
        </div>

        {/* Headline */}
        <div className="text-center space-y-2">
          <p className="text-slate-300 text-base leading-relaxed">
            Your AI-powered YouTube growth engine — analytics, content tools, and voice production in one place.
          </p>
        </div>

        {/* Feature pills */}
        <div className="flex flex-wrap justify-center gap-2 w-full">
          {features.map(({ icon: Icon, label, color }) => (
            <span
              key={label}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.05] border border-white/10 text-[11px] font-medium text-slate-300"
            >
              <Icon size={12} className={color} />
              {label}
            </span>
          ))}
        </div>

        {/* CTA card */}
        <div className="w-full rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl p-6 space-y-4">
          <div className="text-center space-y-1">
            <p className="text-sm font-semibold text-white">Sign in to get started</p>
            <p className="text-xs text-slate-400">Connect your YouTube account to unlock all tools.</p>
          </div>

          <button
            onClick={handleSignIn}
            disabled={loading || isBusy}
            className="w-full flex items-center justify-center gap-3 bg-white hover:bg-slate-100 active:bg-slate-200 disabled:opacity-60 disabled:cursor-not-allowed text-black font-semibold text-sm rounded-xl px-5 py-3 transition-colors shadow-lg"
          >
            {isBusy && !loading ? (
              <>
                <svg
                  className="animate-spin w-4 h-4 text-black/60"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                {busyLabel}
              </>
            ) : loading ? (
              <>
                <svg
                  className="animate-spin w-4 h-4 text-black/60"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                Redirecting…
              </>
            ) : (
              <>
                {/* YouTube wordmark icon inline */}
                <svg
                  width="20"
                  height="14"
                  viewBox="0 0 90 63"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  aria-hidden="true"
                >
                  <path
                    d="M88.1 9.8C87.1 6.2 84 3.1 80.4 2.1 73.4 0 45 0 45 0S16.6 0 9.6 2.1C6 3.1 2.9 6.2 1.9 9.8 0 16.8 0 31.5 0 31.5s0 14.7 1.9 21.7c1 3.6 4.1 6.7 7.7 7.7C16.6 63 45 63 45 63s28.4 0 35.4-2.1c3.6-1 6.7-4.1 7.7-7.7C90 46.2 90 31.5 90 31.5S90 16.8 88.1 9.8z"
                    fill="#FF0000"
                  />
                  <polygon points="36,45 59.4,31.5 36,18" fill="#FFFFFF" />
                </svg>
                Continue with YouTube
              </>
            )}
          </button>

          <p className="text-[10px] text-center text-slate-500 leading-relaxed">
            By continuing, you agree to our{' '}
            <a href="https://janso.studio/terms" className="underline underline-offset-2 hover:text-slate-300 transition-colors">
              Terms of Service
            </a>{' '}
            and{' '}
            <a href="https://janso.studio/privacy" className="underline underline-offset-2 hover:text-slate-300 transition-colors">
              Privacy Policy
            </a>
            .
          </p>
        </div>

        {/* Footer */}
        <p className="text-[10px] text-slate-600 text-center">
          Already using the app?{' '}
          <span className="text-slate-400">Click the button above</span> — your session will be restored automatically.
        </p>
      </div>
    </div>
  );
}
