import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Loader2 } from 'lucide-react';
import { miscT } from '../../i18n/misc-i18n';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  inputLabel?: string;
  inputPlaceholder?: string;
  variant?: 'default' | 'danger';
  loading?: boolean;
  onConfirm: (inputValue?: string) => void;
  onCancel: () => void;
}

export function ConfirmModal({
  isOpen,
  title,
  description,
  confirmLabel = miscT('confirm'),
  cancelLabel = miscT('cancel'),
  inputLabel,
  inputPlaceholder,
  variant = 'default',
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const [inputValue, setInputValue] = useState('');

  const handleConfirm = () => {
    onConfirm(inputLabel ? inputValue : undefined);
    setInputValue('');
  };

  const handleCancel = () => {
    setInputValue('');
    onCancel();
  };

  const confirmBg = variant === 'danger'
    ? 'bg-red-600 hover:bg-red-700'
    : 'bg-indigo-600 hover:bg-indigo-700';

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-[60]"
            onClick={handleCancel}
          />
          <div className="fixed inset-0 z-[61] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2 }}
              className="bg-white rounded-xl shadow-2xl w-full max-w-md"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
                <button
                  onClick={handleCancel}
                  className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="px-5 py-4">
                {description && (
                  <p className="text-sm text-gray-600 mb-4">{description}</p>
                )}

                {inputLabel && (
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {inputLabel}
                    </label>
                    <textarea
                      value={inputValue}
                      onChange={e => setInputValue(e.target.value)}
                      placeholder={inputPlaceholder}
                      rows={3}
                      className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none"
                      autoFocus
                    />
                  </div>
                )}
              </div>

              <div className="flex gap-3 px-5 py-4 border-t border-gray-100">
                <button
                  onClick={handleCancel}
                  disabled={loading}
                  className="flex-1 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  {cancelLabel}
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={loading}
                  className={`flex-1 py-2.5 text-white rounded-lg text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2 ${confirmBg}`}
                >
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {confirmLabel}
                </button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
