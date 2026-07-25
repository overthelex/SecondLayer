import { motion, AnimatePresence } from 'framer-motion';
import { X, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

interface RecoveredSession {
  uploadId: string;
  fileName: string;
  status: 'recovering' | 'completed' | 'failed';
  error?: string;
}

interface RecoveryBannerProps {
  recoveredSessions: RecoveredSession[];
  onDismiss: (uploadId: string) => void;
  onClearAll: () => void;
}

export function RecoveryBanner({ recoveredSessions, onDismiss, onClearAll }: RecoveryBannerProps) {
  if (recoveredSessions.length === 0) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: 'auto' }}
        exit={{ opacity: 0, height: 0 }}
        className="mb-4 bg-amber-50 border border-amber-200 rounded-xl p-4"
      >
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-semibold text-amber-800 font-sans">
            Відновлення завантажень
          </h4>
          {recoveredSessions.every((s) => s.status !== 'recovering') && (
            <button
              onClick={onClearAll}
              className="text-xs text-amber-600 hover:text-amber-800 transition-colors font-sans"
            >
              Закрити
            </button>
          )}
        </div>
        <div className="space-y-1.5">
          {recoveredSessions.map((s) => (
            <div key={s.uploadId} className="flex items-center gap-2 text-xs font-sans">
              {s.status === 'recovering' ? (
                <Loader2 size={12} className="text-amber-500 animate-spin flex-shrink-0" />
              ) : s.status === 'completed' ? (
                <CheckCircle size={12} className="text-green-500 flex-shrink-0" />
              ) : (
                <AlertCircle size={12} className="text-red-500 flex-shrink-0" />
              )}
              <span className="text-amber-900 truncate flex-1">{s.fileName}</span>
              <span className={`flex-shrink-0 ${
                s.status === 'recovering' ? 'text-amber-600' :
                s.status === 'completed' ? 'text-green-600' : 'text-red-600'
              }`}>
                {s.status === 'recovering' ? 'Обробка...' :
                 s.status === 'completed' ? 'Готово' : s.error || 'Помилка'}
              </span>
              {s.status !== 'recovering' && (
                <button
                  onClick={() => onDismiss(s.uploadId)}
                  className="text-amber-400 hover:text-amber-700 transition-colors"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          ))}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
