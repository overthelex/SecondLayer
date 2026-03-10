import { useEffect, useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import type { VaultDocument } from './types';

interface EditDocumentModalProps {
  target: VaultDocument | null;
  editText: string;
  onEditTextChange: (text: string) => void;
  editLoading: boolean;
  editSaving: boolean;
  onSave: () => void;
  onClose: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onDelete: () => void;
  currentIndex: number;
  totalCount: number;
}

export function EditDocumentModal({
  target,
  editText,
  onEditTextChange,
  editLoading,
  editSaving,
  onSave,
  onClose,
  onPrevious,
  onNext,
  onDelete,
  currentIndex,
  totalCount,
}: EditDocumentModalProps) {
  const [pendingDelete, setPendingDelete] = useState(false);

  // Reset pending delete when target changes
  useEffect(() => {
    setPendingDelete(false);
  }, [target?.id]);

  const handleDeleteClick = useCallback(() => {
    if (pendingDelete) {
      onDelete();
      setPendingDelete(false);
    } else {
      setPendingDelete(true);
      setTimeout(() => setPendingDelete(false), 3000);
    }
  }, [pendingDelete, onDelete]);

  // Keyboard navigation
  useEffect(() => {
    if (!target) return;
    const handleKeydown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'TEXTAREA' || tag === 'INPUT') return;
      if (e.key === 'ArrowLeft' && currentIndex > 0) {
        e.preventDefault();
        onPrevious();
      } else if (e.key === 'ArrowRight' && currentIndex < totalCount - 1) {
        e.preventDefault();
        onNext();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [target, currentIndex, totalCount, onPrevious, onNext, onClose]);

  return (
    <AnimatePresence>
      {target && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => !editSaving && onClose()}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-3xl mx-4 max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <button
                  disabled={editSaving || currentIndex <= 0}
                  onClick={onPrevious}
                  className="p-1 text-claude-subtext hover:text-claude-text transition-colors disabled:opacity-30"
                  title="Попередній (←)"
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  disabled={editSaving || currentIndex >= totalCount - 1}
                  onClick={onNext}
                  className="p-1 text-claude-subtext hover:text-claude-text transition-colors disabled:opacity-30"
                  title="Наступний (→)"
                >
                  <ChevronRight size={18} />
                </button>
                {totalCount > 1 && (
                  <span className="text-[11px] text-claude-subtext font-medium tabular-nums mr-1">
                    {currentIndex + 1} / {totalCount}
                  </span>
                )}
                <h3 className="text-lg font-semibold text-claude-text font-sans truncate">
                  Редагувати: {target.title}
                </h3>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={handleDeleteClick}
                  disabled={editSaving}
                  className={`p-1 transition-colors disabled:opacity-30 ${
                    pendingDelete
                      ? 'text-red-500 bg-red-50 rounded-lg'
                      : 'text-claude-subtext/40 hover:text-red-500'
                  }`}
                  title={pendingDelete ? 'Натисніть ще раз для підтвердження' : 'Видалити'}
                >
                  <Trash2 size={16} />
                </button>
                <button
                  onClick={() => !editSaving && onClose()}
                  className="p-1 text-claude-subtext/40 hover:text-claude-text transition-colors"
                >
                  <X size={18} />
                </button>
              </div>
            </div>
            {editLoading ? (
              <div className="flex-1 flex items-center justify-center py-20">
                <Loader2 size={24} className="animate-spin text-claude-subtext/40" />
              </div>
            ) : (
              <>
                <textarea
                  value={editText}
                  onChange={(e) => onEditTextChange(e.target.value)}
                  className="flex-1 min-h-[400px] w-full p-4 border border-claude-border rounded-xl text-sm text-claude-text font-mono resize-none focus:outline-none focus:border-claude-subtext/40 transition-colors"
                  placeholder="Вміст документа..."
                />
                <div className="flex justify-end gap-3 mt-4">
                  <button
                    disabled={editSaving}
                    onClick={onClose}
                    className="px-4 py-2 text-sm font-medium text-claude-text bg-white border border-claude-border rounded-xl hover:bg-claude-bg transition-colors font-sans disabled:opacity-50"
                  >
                    Скасувати
                  </button>
                  <button
                    disabled={editSaving}
                    onClick={onSave}
                    className="px-4 py-2 text-sm font-medium text-white bg-claude-text rounded-xl hover:bg-claude-text/90 transition-colors font-sans disabled:opacity-50 flex items-center gap-2"
                  >
                    {editSaving && <Loader2 size={14} className="animate-spin" />}
                    Зберегти
                  </button>
                </div>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
