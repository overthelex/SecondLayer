/**
 * Cookie Consent Banner
 * GDPR/ePrivacy compliant consent banner for legal tech service.
 * Shows on first visit, allows granular category selection.
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import { useConsentStore, type ConsentPreferences } from '../stores/consentStore';

interface CategoryToggleProps {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}

function CategoryToggle({ label, description, checked, disabled, onChange }: CategoryToggleProps) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-stone-100 last:border-0">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-stone-800">{label}</div>
        <div className="text-xs text-stone-500 mt-0.5">{description}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`
          relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full
          transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2
          ${disabled ? 'opacity-60 cursor-not-allowed' : ''}
          ${checked ? 'bg-amber-500' : 'bg-stone-300'}
        `}
      >
        <span
          className={`
            pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm
            ring-0 transition duration-200 ease-in-out mt-0.5
            ${checked ? 'translate-x-4 ml-0.5' : 'translate-x-0.5'}
          `}
        />
      </button>
    </div>
  );
}

export function CookieConsent() {
  const hasConsented = useConsentStore(s => s.hasConsented);
  const showBanner = useConsentStore(s => s.showBanner);
  const showSettings = useConsentStore(s => s.showSettings);
  const acceptAll = useConsentStore(s => s.acceptAll);
  const rejectNonEssential = useConsentStore(s => s.rejectNonEssential);
  const savePreferences = useConsentStore(s => s.savePreferences);
  const openSettings = useConsentStore(s => s.openSettings);
  const closeSettings = useConsentStore(s => s.closeSettings);

  const [localPrefs, setLocalPrefs] = useState<Omit<ConsentPreferences, 'essential'>>({
    functional: false,
    analytics: false,
    marketing: false,
  });
  const [expandedInfo, setExpandedInfo] = useState(false);

  // Don't render if user already consented
  if (hasConsented && !showBanner) return null;

  const handleSaveCustom = () => {
    savePreferences(localPrefs);
  };

  return (
    <AnimatePresence>
      {(showBanner || showSettings) && (
        <>
          {/* Backdrop for settings modal */}
          {showSettings && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/30 z-[9998]"
              onClick={closeSettings}
            />
          )}

          {/* Settings Modal */}
          {showSettings && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
            >
              <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[80vh] overflow-y-auto p-6">
                <div className="flex items-center gap-3 mb-4">
                  <Shield className="w-5 h-5 text-amber-600" />
                  <h2 className="text-lg font-semibold text-stone-800">
                    Налаштування файлів cookie
                  </h2>
                </div>

                <p className="text-sm text-stone-600 mb-4">
                  Оберіть, які категорії файлів cookie ви дозволяєте. Необхідні файли cookie
                  потрібні для роботи сайту і не можуть бути вимкнені.
                </p>

                <div className="space-y-1">
                  <CategoryToggle
                    label="Необхідні"
                    description="Автентифікація, безпека, базова функціональність сайту"
                    checked={true}
                    disabled={true}
                    onChange={() => {}}
                  />
                  <CategoryToggle
                    label="Функціональні"
                    description="Мова інтерфейсу, валюта, регіональні налаштування, збереження вподобань"
                    checked={localPrefs.functional}
                    onChange={(v) => setLocalPrefs((p) => ({ ...p, functional: v }))}
                  />
                  <CategoryToggle
                    label="Аналітичні"
                    description="Статистика використання, виявлення помилок, покращення продукту"
                    checked={localPrefs.analytics}
                    onChange={(v) => setLocalPrefs((p) => ({ ...p, analytics: v }))}
                  />
                  <CategoryToggle
                    label="Маркетингові"
                    description="Персоналізовані рекомендації та рекламні повідомлення"
                    checked={localPrefs.marketing}
                    onChange={(v) => setLocalPrefs((p) => ({ ...p, marketing: v }))}
                  />
                </div>

                <div className="flex gap-3 mt-6">
                  <button
                    onClick={handleSaveCustom}
                    className="flex-1 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-xl transition-colors"
                  >
                    Зберегти вибір
                  </button>
                  <button
                    onClick={acceptAll}
                    className="flex-1 px-4 py-2.5 bg-stone-800 hover:bg-stone-900 text-white text-sm font-medium rounded-xl transition-colors"
                  >
                    Прийняти всі
                  </button>
                </div>

                <button
                  onClick={closeSettings}
                  className="w-full mt-3 px-4 py-2 text-sm text-stone-500 hover:text-stone-700 transition-colors"
                >
                  Скасувати
                </button>
              </div>
            </motion.div>
          )}

          {/* Bottom Banner */}
          {showBanner && !showSettings && (
            <motion.div
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 z-[9997] p-4 pb-6"
            >
              <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-2xl border border-stone-200 overflow-hidden">
                <div className="p-5">
                  {/* Header */}
                  <div className="flex items-start gap-3 mb-3">
                    <Shield className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <h3 className="text-sm font-semibold text-stone-800">
                        Ми використовуємо файли cookie
                      </h3>
                      <p className="text-xs text-stone-500 mt-1 leading-relaxed">
                        SecondLayer використовує файли cookie для забезпечення роботи сайту,
                        збереження ваших налаштувань та покращення сервісу. Ви можете обрати,
                        якими саме даними ділитися з нами.
                      </p>
                    </div>
                  </div>

                  {/* Expandable info */}
                  <button
                    onClick={() => setExpandedInfo(!expandedInfo)}
                    className="flex items-center gap-1 text-xs text-amber-600 hover:text-amber-700 mb-3 transition-colors"
                  >
                    {expandedInfo ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    Детальніше про категорії
                  </button>

                  <AnimatePresence>
                    {expandedInfo && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden mb-3"
                      >
                        <div className="text-xs text-stone-500 space-y-2 bg-stone-50 rounded-xl p-3">
                          <div>
                            <span className="font-medium text-stone-700">Необхідні</span> — автентифікація, CSRF-захист, сесії. Завжди активні.
                          </div>
                          <div>
                            <span className="font-medium text-stone-700">Функціональні</span> — мова, валюта, тема оформлення, регіон пошуку.
                          </div>
                          <div>
                            <span className="font-medium text-stone-700">Аналітичні</span> — анонімна статистика використання для покращення продукту.
                          </div>
                          <div>
                            <span className="font-medium text-stone-700">Маркетингові</span> — персоналізовані рекомендації (наразі не використовуються).
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Policy links */}
                  <div className="flex items-center gap-3 text-xs text-stone-400 mb-4">
                    <a href="/ua/privacy" target="_blank" rel="noopener" className="hover:text-amber-600 flex items-center gap-1 transition-colors">
                      Політика конфіденційності <ExternalLink className="w-3 h-3" />
                    </a>
                    <span>·</span>
                    <a href="/ua/terms" target="_blank" rel="noopener" className="hover:text-amber-600 flex items-center gap-1 transition-colors">
                      Умови використання <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>

                  {/* Action buttons */}
                  <div className="flex gap-2">
                    <button
                      onClick={rejectNonEssential}
                      className="px-4 py-2 text-sm text-stone-600 hover:text-stone-800 border border-stone-200 hover:border-stone-300 rounded-xl transition-colors"
                    >
                      Лише необхідні
                    </button>
                    <button
                      onClick={openSettings}
                      className="px-4 py-2 text-sm text-stone-600 hover:text-stone-800 border border-stone-200 hover:border-stone-300 rounded-xl transition-colors"
                    >
                      Налаштувати
                    </button>
                    <button
                      onClick={acceptAll}
                      className="flex-1 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-xl transition-colors"
                    >
                      Прийняти всі
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </>
      )}
    </AnimatePresence>
  );
}
