import { useEffect, useMemo, useState } from 'react';

export interface OnboardingStep {
  targetId: string;
  title: string;
  description: string;
}

type Theme = 'dark' | 'light';

interface OnboardingTourProps {
  isOpen: boolean;
  stepIndex: number;
  steps: OnboardingStep[];
  onNext: () => void;
  onSkip: () => void;
  theme?: Theme;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max));
}

export default function OnboardingTour({
  isOpen,
  stepIndex,
  steps,
  onNext,
  onSkip,
  theme = 'dark',
}: OnboardingTourProps) {
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });

  const activeStep = steps[stepIndex];
  const isLastStep = stepIndex === steps.length - 1;

  useEffect(() => {
    if (!isOpen || !activeStep) return;

    const update = () => {
      const target = document.querySelector(`[data-tour-id="${activeStep.targetId}"]`) as HTMLElement | null;
      setTargetRect(target ? target.getBoundingClientRect() : null);
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    };

    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);

    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [activeStep, isOpen]);

  const cardStyle = useMemo(() => {
    if (!targetRect || !viewport.width || !viewport.height) {
      return {
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
      } as const;
    }

    const cardWidth = 350;
    const cardHeight = 260;
    const margin = 16;

    const canPlaceRight = viewport.width - targetRect.right > cardWidth + margin;
    const canPlaceLeft = targetRect.left > cardWidth + margin;

    let left = canPlaceRight
      ? targetRect.right + margin
      : canPlaceLeft
        ? targetRect.left - cardWidth - margin
        : targetRect.left;

    left = clamp(left, margin, viewport.width - cardWidth - margin);

    const preferBelow = targetRect.top < 180;
    let top = preferBelow ? targetRect.bottom + margin : targetRect.top - cardHeight / 3;
    top = clamp(top, margin, viewport.height - cardHeight - margin);

    return {
      top,
      left,
      width: cardWidth,
    } as const;
  }, [targetRect, viewport.height, viewport.width]);

  if (!isOpen || !activeStep) {
    return null;
  }

  return (
    <>
      {targetRect ? (
        <div
          className={`fixed rounded-xl border-2 pointer-events-none z-[90] ${
            theme === 'light' ? 'border-blue-400/70' : 'border-indigo-400/90'
          }`}
          style={{
            top: targetRect.top - 6,
            left: targetRect.left - 6,
            width: targetRect.width + 12,
            height: targetRect.height + 12,
            boxShadow: theme === 'light' 
              ? '0 0 0 9999px rgba(255, 255, 255, 0.6)' 
              : '0 0 0 9999px rgba(2, 6, 23, 0.66)',
          }}
        />
      ) : (
        <div className={`fixed inset-0 z-[85] ${
          theme === 'light' ? 'bg-white/50' : 'bg-slate-950/70'
        }`} />
      )}

      <div
        className={`fixed z-[95] rounded-2xl border backdrop-blur-xl p-5 shadow-2xl ${
          theme === 'light'
            ? 'border-blue-300/30 bg-white/95 text-slate-900'
            : 'border-indigo-300/40 bg-slate-950/95 text-white'
        }`}
        style={cardStyle}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="inline-flex items-center gap-2">
            <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-sm font-bold ${
              theme === 'light'
                ? 'bg-blue-500 text-white'
                : 'bg-indigo-500 text-white'
            }`}>
              {stepIndex + 1}
            </span>
            <p className={`text-[11px] uppercase tracking-[0.18em] ${
              theme === 'light' ? 'text-blue-700' : 'text-indigo-200'
            }`}>
              Quick Tour
            </p>
          </div>
          <p className={`text-xs ${
            theme === 'light' ? 'text-slate-500' : 'text-slate-400'
          }`}>
            {stepIndex + 1}/{steps.length}
          </p>
        </div>

        <h3 className={`text-lg font-semibold mt-4 ${
          theme === 'light' ? 'text-slate-900' : 'text-white'
        }`}>
          {activeStep.title}
        </h3>
        <p className={`text-sm mt-2 leading-relaxed ${
          theme === 'light' ? 'text-slate-600' : 'text-slate-300'
        }`}>
          {activeStep.description}
        </p>

        <div className="mt-6 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onSkip}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              theme === 'light'
                ? 'text-slate-600 hover:text-slate-900 hover:bg-black/5'
                : 'text-slate-300 hover:text-white hover:bg-white/10'
            }`}
          >
            Skip
          </button>
          <button
            type="button"
            onClick={onNext}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              theme === 'light'
                ? 'bg-blue-500 text-white hover:bg-blue-600'
                : 'bg-white text-black hover:bg-slate-200'
            }`}
          >
            {isLastStep ? 'Finish' : 'Next'}
          </button>
        </div>
      </div>
    </>
  );
}
