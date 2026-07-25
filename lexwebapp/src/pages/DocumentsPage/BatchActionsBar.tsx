import { motion, AnimatePresence } from 'framer-motion';
import { X, Trash2, FolderInput } from 'lucide-react';

interface BatchActionsBarProps {
  selectedCount: number;
  onBatchMove: () => void;
  onBatchDelete: () => void;
  onClearSelection: () => void;
}

export function BatchActionsBar({
  selectedCount,
  onBatchMove,
  onBatchDelete,
  onClearSelection,
}: BatchActionsBarProps) {
  return (
    <AnimatePresence>
      {selectedCount > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          className="mb-4 flex items-center gap-3 px-4 py-2.5 bg-claude-accent/5 border border-claude-accent/20 rounded-xl"
        >
          <span className="text-sm font-medium text-claude-text font-sans">
            Вибрано: {selectedCount}
          </span>
          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={onBatchMove}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-claude-border rounded-lg hover:bg-claude-bg transition-colors font-sans"
            >
              <FolderInput size={12} />
              Перемістити
            </button>
            <button
              onClick={onBatchDelete}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors font-sans"
            >
              <Trash2 size={12} />
              Видалити
            </button>
            <button
              onClick={onClearSelection}
              className="p-1 text-claude-subtext/40 hover:text-claude-text transition-colors"
              title="Зняти виділення"
            >
              <X size={14} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
