import { motion, AnimatePresence } from 'framer-motion';
import { Trash2, Loader2 } from 'lucide-react';
import type { VaultDocument } from './types';

interface DeleteConfirmModalProps {
  target: VaultDocument | null;
  deleting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DeleteConfirmModal({ target, deleting, onConfirm, onCancel }: DeleteConfirmModalProps) {
  return (
    <AnimatePresence>
      {target && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => !deleting && onCancel()}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-red-50 rounded-lg">
                <Trash2 size={20} className="text-red-500" />
              </div>
              <h3 className="text-lg font-semibold text-claude-text font-sans">
                Видалити документ?
              </h3>
            </div>
            <p className="text-sm text-claude-subtext/70 mb-6 font-sans">
              Ви впевнені, що хочете видалити &laquo;{target.title}&raquo;? Документ можна буде відновити.
            </p>
            <div className="flex justify-end gap-3">
              <button
                disabled={deleting}
                onClick={onCancel}
                className="px-4 py-2 text-sm font-medium text-claude-text bg-white border border-claude-border rounded-xl hover:bg-claude-bg transition-colors font-sans disabled:opacity-50"
              >
                Скасувати
              </button>
              <button
                disabled={deleting}
                onClick={onConfirm}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-xl hover:bg-red-700 transition-colors font-sans disabled:opacity-50 flex items-center gap-2"
              >
                {deleting && <Loader2 size={14} className="animate-spin" />}
                Видалити
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
