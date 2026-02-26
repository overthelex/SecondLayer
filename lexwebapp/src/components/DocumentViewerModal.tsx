import React from 'react';
import ReactMarkdown from 'react-markdown';
import { AnimatePresence, motion } from 'framer-motion';
import { X, ExternalLink, Gavel, BookOpen, FileText, Copy, Check, Download, Loader2, AlertTriangle } from 'lucide-react';

export interface DocumentViewerItem {
  type: 'decision' | 'citation' | 'document';
  title: string;
  subtitle?: string;
  badge?: string;
  badgeVariant?: 'active' | 'overturned' | 'modified' | 'default';
  content: string;
  relevance?: number;
  externalUrl?: string;
  previewUrl?: string;
  mimeType?: string;
}

interface DocumentViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: DocumentViewerItem | null;
  isLoading?: boolean;
  errorMessage?: string | null;
}

const typeIcons = {
  decision: Gavel,
  citation: BookOpen,
  document: FileText,
};

export function DocumentViewerModal({ isOpen, onClose, item, isLoading, errorMessage }: DocumentViewerModalProps) {
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  React.useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

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
    a.download = `${item.title.replace(/[^\wа-яА-ЯёЁa-zA-Z0-9]/g, '_')}.txt`;
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
            <div className="flex min-h-full items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col"
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
                  {errorMessage && (
                    <div className="flex items-start gap-3 p-3 mb-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-[13px]">
                      <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" strokeWidth={2} />
                      <span>{errorMessage}</span>
                    </div>
                  )}
                  {isLoading ? (
                    <div className="flex flex-col items-center justify-center py-16 text-claude-subtext">
                      <Loader2 size={28} className="animate-spin mb-3" strokeWidth={2} />
                      <p className="text-[13px]">Завантаження...</p>
                    </div>
                  ) : item.previewUrl && item.mimeType?.startsWith('image/') ? (
                    <div className="flex items-center justify-center">
                      <img
                        src={item.previewUrl}
                        alt={item.title}
                        className="max-w-full max-h-[70vh] rounded-lg object-contain"
                      />
                    </div>
                  ) : item.previewUrl && item.mimeType === 'application/pdf' ? (
                    <iframe
                      src={item.previewUrl}
                      className="w-full h-[70vh] rounded-lg border border-claude-border"
                      title={item.title}
                    />
                  ) : item.previewUrl && item.mimeType?.startsWith('video/') ? (
                    <div className="flex items-center justify-center">
                      <video
                        src={item.previewUrl}
                        controls
                        className="max-w-full max-h-[70vh] rounded-lg"
                      />
                    </div>
                  ) : (
                    <div className="prose prose-sm max-w-none prose-headings:text-claude-text prose-p:text-claude-text prose-p:leading-relaxed prose-a:text-blue-600 prose-strong:text-claude-text prose-code:text-[13px] prose-code:bg-claude-bg prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-pre:bg-claude-bg prose-pre:border prose-pre:border-claude-border prose-blockquote:border-claude-border prose-blockquote:text-claude-subtext">
                      <ReactMarkdown>{item.content}</ReactMarkdown>
                    </div>
                  )}
                </div>
              </motion.div>
            </div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
