import { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Gavel, BookOpen, Archive } from 'lucide-react';
import { useOnboardingStore } from '../../stores/onboardingStore';
import { LexLogo3D } from '../LexLogo3D';
import { useMiscT, type MiscKey } from '../../i18n/misc-i18n';

interface TourStep {
  target: string;
  titleKey: MiscKey;
  descriptionKey: MiscKey;
  icon: React.ElementType | 'logo';
  position: 'above' | 'right';
}

const STEPS: TourStep[] = [
  {
    target: '[data-tour="chat-input"]',
    titleKey: 'tourStep1Title',
    descriptionKey: 'tourStep1Desc',
    icon: 'logo',
    position: 'above',
  },
  {
    target: '[data-tour="research"]',
    titleKey: 'tourStep2Title',
    descriptionKey: 'tourStep2Desc',
    icon: Gavel,
    position: 'right',
  },
  {
    target: '[data-tour="legislation"]',
    titleKey: 'tourStep3Title',
    descriptionKey: 'tourStep3Desc',
    icon: BookOpen,
    position: 'right',
  },
  {
    target: '[data-tour="vault"]',
    titleKey: 'tourStep4Title',
    descriptionKey: 'tourStep4Desc',
    icon: Archive,
    position: 'right',
  },
];

const SPOTLIGHT_PADDING = 8;
const SPOTLIGHT_RADIUS = 12;
const CARD_GAP = 16;

export function OnboardingTour() {
  const isActive = useOnboardingStore((s) => s.isActive);
  const currentStep = useOnboardingStore((s) => s.currentStep);
  const nextStep = useOnboardingStore((s) => s.nextStep);
  const skipTour = useOnboardingStore((s) => s.skipTour);
  const completeTour = useOnboardingStore((s) => s.completeTour);

  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [cardStyle, setCardStyle] = useState<React.CSSProperties>({});
  const rafRef = useRef<number>(0);

  const measure = useCallback(() => {
    if (!isActive || currentStep >= STEPS.length) return;
    const step = STEPS[currentStep];
    const el = document.querySelector(step.target);
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setTargetRect(rect);

    const style: React.CSSProperties = { position: 'fixed', zIndex: 71, maxWidth: 340 };
    if (step.position === 'above') {
      style.bottom = window.innerHeight - rect.top + CARD_GAP;
      style.left = rect.left + rect.width / 2;
      style.transform = 'translateX(-50%)';
    } else {
      style.left = rect.right + CARD_GAP;
      style.top = rect.top;
    }
    setCardStyle(style);
  }, [isActive, currentStep]);

  // Measure on step change
  useEffect(() => {
    if (!isActive) return;

    // Skip on mobile
    if (window.innerWidth < 1024) {
      skipTour();
      return;
    }

    const step = STEPS[currentStep];
    if (!step) return;

    // For sidebar sections, expand them first
    if (['research', 'legislation', 'vault'].includes(step.target.replace('[data-tour="', '').replace('"]', ''))) {
      const sectionId = step.target.replace('[data-tour="', '').replace('"]', '');
      window.dispatchEvent(new CustomEvent('tour-expand-section', { detail: sectionId }));
    }

    // Delay measurement to allow DOM updates
    const timer = setTimeout(() => {
      measure();
    }, 150);

    return () => clearTimeout(timer);
  }, [isActive, currentStep, measure, skipTour]);

  // Re-measure on resize
  useEffect(() => {
    if (!isActive) return;
    const onResize = () => {
      if (window.innerWidth < 1024) {
        skipTour();
        return;
      }
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(measure);
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      cancelAnimationFrame(rafRef.current);
    };
  }, [isActive, measure, skipTour]);

  const { t } = useMiscT();

  if (!isActive || currentStep >= STEPS.length || !targetRect) return null;

  const step = STEPS[currentStep];
  const isLast = currentStep === STEPS.length - 1;

  const sx = targetRect.left - SPOTLIGHT_PADDING;
  const sy = targetRect.top - SPOTLIGHT_PADDING;
  const sw = targetRect.width + SPOTLIGHT_PADDING * 2;
  const sh = targetRect.height + SPOTLIGHT_PADDING * 2;

  const handleNext = () => {
    if (isLast) {
      completeTour();
    } else {
      nextStep();
    }
  };

  return (
    <>
      {/* Overlay with spotlight cutout */}
      <div className="fixed inset-0 z-[70]" onClick={skipTour}>
        <svg width="100%" height="100%" className="block">
          <defs>
            <mask id="tour-spotlight">
              <rect width="100%" height="100%" fill="white" />
              <rect
                x={sx}
                y={sy}
                width={sw}
                height={sh}
                rx={SPOTLIGHT_RADIUS}
                ry={SPOTLIGHT_RADIUS}
                fill="black"
              />
            </mask>
          </defs>
          <rect
            width="100%"
            height="100%"
            fill="black"
            fillOpacity={0.6}
            mask="url(#tour-spotlight)"
          />
        </svg>
      </div>

      {/* Card */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentStep}
          initial={{ opacity: 0, y: 10, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.97 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          style={cardStyle}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="bg-white rounded-xl shadow-2xl border border-claude-border p-6 max-w-[340px]">
            {/* Icon */}
            {step.icon === 'logo' ? (
              <div className="w-10 h-10 rounded-lg overflow-hidden flex items-center justify-center mb-3">
                <LexLogo3D size={36} />
              </div>
            ) : (
              <div className="w-10 h-10 rounded-xl bg-zinc-100 flex items-center justify-center mb-3">
                {(() => { const Icon = step.icon as React.ElementType; return <Icon size={20} strokeWidth={1.8} className="text-zinc-600" />; })()}
              </div>
            )}

            {/* Content */}
            <h3 className="text-[17px] font-bold text-claude-text mb-1.5">{t(step.titleKey)}</h3>
            <p className="text-[13px] text-claude-subtext leading-relaxed mb-5">{t(step.descriptionKey)}</p>

            {/* Footer */}
            <div className="flex items-center justify-between">
              {/* Progress dots */}
              <div className="flex items-center gap-1.5">
                {STEPS.map((_, i) => (
                  <div
                    key={i}
                    className={`h-1.5 rounded-full transition-all duration-300 ${
                      i === currentStep ? 'w-6 bg-claude-accent' : 'w-2 bg-zinc-200'
                    }`}
                  />
                ))}
              </div>

              {/* Buttons */}
              <div className="flex items-center gap-3">
                <button
                  onClick={skipTour}
                  className="text-claude-subtext hover:text-claude-text text-[12px] transition-colors"
                >
                  {t('skip')}
                </button>
                <button
                  onClick={handleNext}
                  className="bg-claude-accent hover:bg-zinc-700 text-white px-5 py-2 rounded-lg text-[13px] font-medium transition-colors"
                >
                  {isLast ? t('startWorking') : t('next')}
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </>
  );
}
