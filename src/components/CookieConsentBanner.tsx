import { useEffect, useState } from 'react';

import { cn } from '../lib/utils';

type Theme = 'dark' | 'light';
type CookieConsentChoice = 'all' | 'essential';

type StoredCookieConsent = {
  choice: CookieConsentChoice;
  version: number;
  savedAt: string;
};

const COOKIE_CONSENT_STORAGE_KEY = 'tube_vision_cookie_consent_v1';
const COOKIE_CONSENT_COOKIE_NAME = 'tube_vision_cookie_consent';
const COOKIE_CONSENT_VERSION = 1;
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

function readStoredCookieConsent(): StoredCookieConsent | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<StoredCookieConsent>;
    if (
      (parsed.choice !== 'all' && parsed.choice !== 'essential') ||
      parsed.version !== COOKIE_CONSENT_VERSION
    ) {
      return null;
    }

    return {
      choice: parsed.choice,
      version: COOKIE_CONSENT_VERSION,
      savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

function persistCookieConsent(choice: CookieConsentChoice) {
  if (typeof window === 'undefined') {
    return;
  }

  const payload: StoredCookieConsent = {
    choice,
    version: COOKIE_CONSENT_VERSION,
    savedAt: new Date().toISOString(),
  };

  window.localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, JSON.stringify(payload));

  const secureFlag = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${COOKIE_CONSENT_COOKIE_NAME}=${choice}; Max-Age=${ONE_YEAR_SECONDS}; Path=/; SameSite=Lax${secureFlag}`;
}

interface CookieConsentBannerProps {
  theme?: Theme;
  className?: string;
}

export default function CookieConsentBanner({ theme = 'dark', className }: CookieConsentBannerProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setIsVisible(!readStoredCookieConsent());
  }, []);

  if (!isVisible) {
    return null;
  }

  const handleAcceptAll = () => {
    persistCookieConsent('all');
    setIsVisible(false);
  };

  const handleEssentialOnly = () => {
    persistCookieConsent('essential');
    setIsVisible(false);
  };

  return (
    <div className={cn('pointer-events-none fixed inset-x-0 bottom-4 z-[120] px-4', className)}>
      <section
        role="dialog"
        aria-label="Cookie consent"
        aria-live="polite"
        className={cn(
          'pointer-events-auto mx-auto max-w-3xl rounded-2xl border p-4 shadow-2xl backdrop-blur md:p-5',
          theme === 'light'
            ? 'border-slate-300 bg-white/95 text-slate-900'
            : 'border-white/15 bg-[#090b12]/95 text-slate-100'
        )}
      >
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-semibold">Cookie preferences</p>
            <p className={cn('text-xs leading-relaxed md:text-sm', theme === 'light' ? 'text-slate-700' : 'text-slate-300')}>
              We use essential cookies to keep you signed in and protect your session. You can also allow optional
              analytics cookies to help us improve Janso Studio.
            </p>
            <p className={cn('text-[11px]', theme === 'light' ? 'text-slate-600' : 'text-slate-400')}>
              Read our{' '}
              <a
                href="/privacy"
                className={cn(
                  'underline underline-offset-2 transition-colors',
                  theme === 'light' ? 'hover:text-slate-900' : 'hover:text-white'
                )}
              >
                Privacy Policy
              </a>{' '}
              and{' '}
              <a
                href="/terms"
                className={cn(
                  'underline underline-offset-2 transition-colors',
                  theme === 'light' ? 'hover:text-slate-900' : 'hover:text-white'
                )}
              >
                Terms of Service
              </a>
              .
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={handleEssentialOnly}
              className={cn(
                'rounded-xl border px-4 py-2 text-xs font-semibold transition-colors',
                theme === 'light'
                  ? 'border-slate-300 bg-white text-slate-800 hover:bg-slate-100'
                  : 'border-white/15 bg-white/5 text-slate-200 hover:bg-white/10'
              )}
            >
              Essential only
            </button>
            <button
              type="button"
              onClick={handleAcceptAll}
              className={cn(
                'rounded-xl px-4 py-2 text-xs font-semibold transition-colors',
                theme === 'light' ? 'bg-slate-900 text-white hover:bg-slate-800' : 'bg-white text-black hover:bg-slate-100'
              )}
            >
              Accept all
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}