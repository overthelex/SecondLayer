import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, ExternalLink, Gavel, BookOpen, FileText, Copy, Check, Download, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import type { DocumentViewerItem, DocumentViewerModalProps } from './types';
import { ContentRenderer } from './ContentRenderer';

export type { DocumentViewerItem, DocumentViewerModalProps };

const typeIcons = {
  decision: Gavel,
  citation: BookOpen,
  document: FileText,
};

export function DocumentViewerModal({ isOpen, onClose, item, isLoading, errorMessage, onSaveOcrText, onPrevious, onNext, hasPrevious, hasNext, currentIndex, totalCount, onDelete }: DocumentViewerModalProps) {
  const [copied, setCopied] = React.useState(false);

  const isImageWithOcr = item?.previewUrl && item?.mimeType?.startsWith('image/') && item?.ocrText !== undefined;

  React.useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  React.useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      // Skip navigation when user is typing in a textarea/input
      const tag = (e.target as HTMLElement)?.tagName;
      const isTyping = tag === 'TEXTAREA' || tag === 'INPUT';

      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft' && !isTyping && onPrevious && hasPrevious) {
        e.preventDefault();
        onPrevious();
      } else if (e.key === 'ArrowRight' && !isTyping && onNext && hasNext) {
        e.preventDefault();
        onNext();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && !isTyping && onDelete) {
        e.preventDefault();
        onDelete();
      }
    };
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [isOpen, onClose, onPrevious, onNext, hasPrevious, hasNext, onDelete]);

  const handleCopy = () => {
    if (!item) return;
    navigator.clipboard.writeText(item.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSave = () => {
    if (!item) return;
    const blob = new Blob([item.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${item.title.replace(/[^a-zA-Z0-9\u0400-\u04FF_]/g, '_')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!item) return null;

  const Icon = typeIcons[item.type];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-[1040]"
            onClick={onClose}
          />

          <div className="fixed inset-0 z-[1050] overflow-y-auto">
            {/* Left arrow navigation */}
            {onPrevious && hasPrevious && (
              <button
                onClick={onPrevious}
                className="fixed left-3 top-1/2 -translate-y-1/2 z-[1060] p-2 bg-white/90 hover:bg-white rounded-full shadow-lg text-claude-subtext hover:text-claude-text transition-all backdrop-blur-sm"
                title="Попередній (←)"
              >
                <ChevronLeft size={24} strokeWidth={2} />
              </button>
            )}
            {/* Right arrow navigation */}
            {onNext && hasNext && (
              <button
                onClick={onNext}
                className="fixed right-3 top-1/2 -translate-y-1/2 z-[1060] p-2 bg-white/90 hover:bg-white rounded-full shadow-lg text-claude-subtext hover:text-claude-text transition-all backdrop-blur-sm"
                title="Наступний (→)"
              >
                <ChevronRight size={24} strokeWidth={2} />
              </button>
            )}
            <div className="flex min-h-full items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                className={`bg-white rounded-xl shadow-2xl w-full max-h-[85vh] flex flex-col ${isImageWithOcr ? 'max-w-6xl' : 'max-w-3xl'}`}
                onClick={(e) => e.stopPropagation()}
              >
                {/* Header */}
                <div className="flex items-start justify-between px-6 py-4 border-b border-claude-border/50 flex-shrink-0">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div className="p-2 bg-claude-bg rounded-lg flex-shrink-0 mt-0.5">
                      <Icon size={18} className="text-claude-text" strokeWidth={2} />
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-base font-semibold text-claude-text leading-tight">
                        {item.title}
                      </h2>
                      {item.subtitle && (
                        <p className="text-[12px] text-claude-subtext mt-1">{item.subtitle}</p>
                      )}
                      <div className="flex items-center gap-2 mt-2">
                        {item.badge && (
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide border ${
                            item.badgeVariant === 'active'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : item.badgeVariant === 'overturned'
                              ? 'bg-red-50 text-red-600 border-red-200'
                              : item.badgeVariant === 'modified'
                              ? 'bg-amber-50 text-amber-700 border-amber-200'
                              : 'bg-claude-bg text-claude-subtext border-claude-border'
                          }`}>
                            {item.badge}
                          </span>
                        )}
                        {item.relevance != null && (
                          <div className="flex items-center gap-1.5">
                            <div className="w-16 h-1.5 bg-claude-bg rounded-full overflow-hidden">
                              <div
                                className="h-full bg-claude-text/50 rounded-full"
                                style={{ width: `${item.relevance}%` }}
                              />
                            </div>
                            <span className="text-[10px] text-claude-subtext font-medium">
                              {item.relevance}%
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0 ml-4">
                    {currentIndex != null && totalCount != null && totalCount > 1 && (
                      <span className="text-[11px] text-claude-subtext font-medium mr-2 tabular-nums">
                        {currentIndex + 1} / {totalCount}
                      </span>
                    )}
                    <button
                      onClick={handleCopy}
                      disabled={isLoading}
                      className="p-2 text-claude-subtext hover:text-claude-text hover:bg-claude-bg rounded-lg transition-all disabled:opacity-40"
                      title="Копіювати"
                    >
                      {copied ? <Check size={16} strokeWidth={2} /> : <Copy size={16} strokeWidth={2} />}
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={isLoading}
                      className="p-2 text-claude-subtext hover:text-claude-text hover:bg-claude-bg rounded-lg transition-all disabled:opacity-40"
                      title="Зберегти як .txt"
                    >
                      <Download size={16} strokeWidth={2} />
                    </button>
                    {item.externalUrl && (
                      <a
                        href={item.externalUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 text-claude-subtext hover:text-claude-text hover:bg-claude-bg rounded-lg transition-all"
                        title="Відкрити зовнішнє посилання"
                      >
                        <ExternalLink size={16} strokeWidth={2} />
                      </a>
                    )}
                    {onDelete && (
                      <button
                        onClick={onDelete}
                        disabled={isLoading}
                        className="p-2 text-claude-subtext hover:text-red-500 hover:bg-red-50 rounded-lg transition-all disabled:opacity-40"
                        title="Видалити (Delete)"
                      >
                        <Trash2 size={16} strokeWidth={2} />
                      </button>
                    )}
                    <button
                      onClick={onClose}
                      className="p-2 text-claude-subtext hover:text-claude-text hover:bg-claude-bg rounded-lg transition-all"
                    >
                      <X size={18} strokeWidth={2} />
                    </button>
                  </div>
                </div>

                {/* Content — binary preview or Markdown rendered */}
                <div className="flex-1 overflow-y-auto px-6 py-5">
                  <ContentRenderer
                    item={item}
                    isLoading={isLoading}
                    errorMessage={errorMessage}
                    onSaveOcrText={onSaveOcrText}
                  />
                </div>
              </motion.div>
            </div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
