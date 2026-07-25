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
                className="fixed left-4 top-1/2 -translate-y-1/2 z-[1060] p-2.5 bg-white hover:bg-zinc-50 rounded-full shadow-lg border border-zinc-200 text-zinc-500 hover:text-zinc-900 transition-all duration-150"
                title="Попередній (←)"
              >
                <ChevronLeft size={20} strokeWidth={2} />
              </button>
            )}
            {/* Right arrow navigation */}
            {onNext && hasNext && (
              <button
                onClick={onNext}
                className="fixed right-4 top-1/2 -translate-y-1/2 z-[1060] p-2.5 bg-white hover:bg-zinc-50 rounded-full shadow-lg border border-zinc-200 text-zinc-500 hover:text-zinc-900 transition-all duration-150"
                title="Наступний (→)"
              >
                <ChevronRight size={20} strokeWidth={2} />
              </button>
            )}
            <div className="flex min-h-full items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.97, y: 16 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97, y: 16 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                className={`bg-white rounded-xl shadow-2xl border border-zinc-200/80 flex flex-col resize overflow-hidden ${isImageWithOcr ? 'w-[90vw] h-[90vh]' : 'w-[52rem] h-[85vh]'}`}
                style={{ minWidth: '24rem', minHeight: '20rem', maxWidth: '98vw', maxHeight: '96vh' }}
                onClick={(e) => e.stopPropagation()}
              >
                {/* Header — dark stripe for premium feel */}
                <div className="flex items-start justify-between px-5 py-3.5 border-b border-zinc-200/80 flex-shrink-0 bg-zinc-50">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div className="p-1.5 bg-zinc-900 rounded-md flex-shrink-0 mt-0.5">
                      <Icon size={14} className="text-white" strokeWidth={2} />
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-[13.5px] font-semibold text-zinc-900 leading-snug tracking-tight">
                        {item.title}
                      </h2>
                      {item.subtitle && (
                        <p className="text-[11px] text-zinc-500 mt-0.5 leading-snug">{item.subtitle}</p>
                      )}
                      <div className="flex items-center gap-2 mt-1.5">
                        {item.badge && (
                          <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-[0.06em] border ${
                            item.badgeVariant === 'active'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : item.badgeVariant === 'overturned'
                              ? 'bg-red-50 text-red-600 border-red-200'
                              : item.badgeVariant === 'modified'
                              ? 'bg-zinc-100 text-zinc-600 border-zinc-200'
                              : 'bg-zinc-100 text-zinc-500 border-zinc-200'
                          }`}>
                            {item.badge}
                          </span>
                        )}
                        {item.relevance != null && (
                          <div className="flex items-center gap-1.5">
                            <div className="w-14 h-1 bg-zinc-200 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-zinc-700 rounded-full"
                                style={{ width: `${item.relevance}%` }}
                              />
                            </div>
                            <span className="text-[10px] text-zinc-400 font-medium tabular-nums">
                              {item.relevance}%
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-0.5 flex-shrink-0 ml-3">
                    {currentIndex != null && totalCount != null && totalCount > 1 && (
                      <span className="text-[11px] text-zinc-400 font-medium mr-2 tabular-nums">
                        {currentIndex + 1} / {totalCount}
                      </span>
                    )}
                    <button
                      onClick={handleCopy}
                      disabled={isLoading}
                      className="p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-md transition-all duration-150 disabled:opacity-40"
                      title="Копіювати"
                    >
                      {copied ? <Check size={15} strokeWidth={2} /> : <Copy size={15} strokeWidth={2} />}
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={isLoading}
                      className="p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-md transition-all duration-150 disabled:opacity-40"
                      title="Зберегти як .txt"
                    >
                      <Download size={15} strokeWidth={2} />
                    </button>
                    {item.externalUrl && (
                      <a
                        href={item.externalUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-md transition-all duration-150"
                        title="Відкрити зовнішнє посилання"
                      >
                        <ExternalLink size={15} strokeWidth={2} />
                      </a>
                    )}
                    {onDelete && (
                      <button
                        onClick={onDelete}
                        disabled={isLoading}
                        className="p-1.5 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-all duration-150 disabled:opacity-40"
                        title="Видалити (Delete)"
                      >
                        <Trash2 size={15} strokeWidth={2} />
                      </button>
                    )}
                    <div className="w-px h-4 bg-zinc-200 mx-1" />
                    <button
                      onClick={onClose}
                      className="p-1.5 text-zinc-400 hover:text-zinc-800 hover:bg-zinc-100 rounded-md transition-all duration-150"
                    >
                      <X size={16} strokeWidth={2} />
                    </button>
                  </div>
                </div>

                {/* Content — binary preview or Markdown rendered */}
                <div className="flex-1 min-h-0 overflow-y-auto px-7 py-6">
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
