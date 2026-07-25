/**
 * Support Widget (Floating Action Button)
 * LEXAI-869 — bottom-right FAB that opens a drop-up menu with three actions:
 *   1. Написати зауваження    → FeedbackModal
 *   2. Написати питання       → QuestionModal
 *   3. Записатись на консультацію → ConsultationBookingModal (calendary.biz)
 */

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CalendarClock, HelpCircle, LifeBuoy, MessageSquareWarning, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { FeedbackModal } from './FeedbackModal';
import { QuestionModal } from './QuestionModal';
import { ConsultationBookingModal } from './ConsultationBookingModal';

type ActiveModal = null | 'feedback' | 'question' | 'consultation';

export function SupportWidget() {
  const { isAuthenticated } = useAuth();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<ActiveModal>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close drop-up on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [open]);

  // Close drop-up on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  // Hide widget for unauthenticated users — feedback API requires login.
  if (!isAuthenticated) return null;

  const items = [
    {
      key: 'feedback' as const,
      label: 'Написати зауваження',
      icon: MessageSquareWarning,
      iconClass: 'text-amber-600 bg-amber-50',
    },
    {
      key: 'question' as const,
      label: 'Написати питання',
      icon: HelpCircle,
      iconClass: 'text-sky-600 bg-sky-50',
    },
    {
      key: 'consultation' as const,
      label: 'Записатись на консультацію',
      icon: CalendarClock,
      iconClass: 'text-emerald-600 bg-emerald-50',
    },
  ];

  return (
    <>
      <div
        ref={containerRef}
        className="fixed bottom-5 right-5 z-[1000] flex flex-col items-end gap-3"
      >
        <AnimatePresence>
          {open && (
            <motion.div
              key="menu"
              initial={{ opacity: 0, y: 8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.96 }}
              transition={{ duration: 0.15 }}
              className="w-[260px] rounded-xl bg-white shadow-xl border border-zinc-200 overflow-hidden"
              role="menu"
              aria-label="Опції підтримки"
            >
              {items.map(({ key, label, icon: Icon, iconClass }) => (
                <button
                  key={key}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setActive(key);
                    setOpen(false);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm text-zinc-800 hover:bg-zinc-50 transition-colors border-b last:border-b-0 border-zinc-100"
                >
                  <span className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${iconClass}`}>
                    <Icon size={16} strokeWidth={2} />
                  </span>
                  <span className="font-medium">{label}</span>
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={open ? 'Закрити меню підтримки' : 'Відкрити меню підтримки'}
          className="w-14 h-14 rounded-full bg-claude-text text-white shadow-lg hover:shadow-xl active:scale-95 flex items-center justify-center transition-all"
        >
          <AnimatePresence mode="wait" initial={false}>
            {open ? (
              <motion.span
                key="x"
                initial={{ rotate: -45, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                exit={{ rotate: 45, opacity: 0 }}
                transition={{ duration: 0.12 }}
              >
                <X size={22} strokeWidth={2.2} />
              </motion.span>
            ) : (
              <motion.span
                key="help"
                initial={{ rotate: 45, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                exit={{ rotate: -45, opacity: 0 }}
                transition={{ duration: 0.12 }}
              >
                <LifeBuoy size={22} strokeWidth={2} />
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </div>

      <FeedbackModal isOpen={active === 'feedback'} onClose={() => setActive(null)} />
      <QuestionModal isOpen={active === 'question'} onClose={() => setActive(null)} />
      <ConsultationBookingModal isOpen={active === 'consultation'} onClose={() => setActive(null)} />
    </>
  );
}
