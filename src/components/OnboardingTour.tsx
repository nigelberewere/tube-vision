import { useEffect, useMemo, useState } from 'react';

export interface OnboardingStep {
  targetId: string;
  title: string;
  description: string;
}

interface OnboardingTourProps {
  isOpen: boolean;
  stepIndex: number;
  steps: OnboardingStep[];
  onNext: () => void;
  onSkip: () => void;
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
          className="fixed rounded-xl border-2 border-indigo-400/90 pointer-events-none z-[90]"
          style={{
            top: targetRect.top - 6,
            left: targetRect.left - 6,
            width: targetRect.width + 12,
            height: targetRect.height + 12,
            boxShadow: '0 0 0 9999px rgba(2, 6, 23, 0.66)',
          }}
        />
      ) : (
        <div className="fixed inset-0 bg-slate-950/70 z-[85]" />
      )}

      <div
        className="fixed z-[95] rounded-2xl border border-indigo-300/40 bg-slate-950/95 backdrop-blur-xl p-5 shadow-2xl"
        style={cardStyle}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="inline-flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-indigo-500 text-white text-sm font-bold">
              {stepIndex + 1}
            </span>
            <p className="text-[11px] uppercase tracking-[0.18em] text-indigo-200">Quick Tour</p>
          </div>
          <p className="text-xs text-slate-400">
            {stepIndex + 1}/{steps.length}
          </p>
        </div>

        <h3 className="text-lg font-semibold text-white mt-4">{activeStep.title}</h3>
        <p className="text-sm text-slate-300 mt-2 leading-relaxed">{activeStep.description}</p>

        <div className="mt-6 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onSkip}
            className="px-3 py-2 rounded-lg text-sm font-medium text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
          >
            Skip
          </button>
          <button
            type="button"
            onClick={onNext}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-white text-black hover:bg-slate-200 transition-colors"
          >
            {isLastStep ? 'Finish' : 'Next'}
          </button>
        </div>
      </div>
    </>
  );
}
