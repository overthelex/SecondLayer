import { useState, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { FileText, Loader2 } from 'lucide-react';
import { api } from '@/utils/api-client';
import toast from 'react-hot-toast';
import content from '@/content/developer-offer-uk.md?raw';

interface Props {
  onAccepted: () => void;
}

export function DeveloperOfferModal({ onAccepted }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [scrolledToBottom, setScrolledToBottom] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const handleScroll = () => {
    if (!contentRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = contentRef.current;
    if (scrollTop + clientHeight >= scrollHeight - 50) {
      setScrolledToBottom(true);
    }
  };

  const handleAccept = async () => {
    setSubmitting(true);
    try {
      const { data } = await api.post('/auth/accept-developer-offer');
      toast.success(`Оферту прийнято! Договір №${data.contractNumber} від ${data.contractDate}`);
      onAccepted();
    } catch {
      toast.error('Не вдалося прийняти оферту');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-border bg-surface-secondary rounded-t-2xl">
          <div className="p-2 bg-brand-50 rounded-lg">
            <FileText size={20} className="text-brand-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-txt-primary">Публічна оферта</h2>
            <p className="text-xs text-txt-muted">Ознайомтесь та прийміть умови для продовження</p>
          </div>
        </div>

        {/* Content */}
        <div
          ref={contentRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-6 py-4"
        >
          <div className="prose prose-sm max-w-none prose-headings:text-txt-primary prose-p:text-txt-secondary prose-li:text-txt-secondary prose-strong:text-txt-primary">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border bg-surface-secondary rounded-b-2xl">
          {!scrolledToBottom && (
            <p className="text-xs text-txt-muted text-center mb-3">
              Прокрутіть документ до кінця, щоб прийняти оферту
            </p>
          )}
          <button
            onClick={handleAccept}
            disabled={!scrolledToBottom || submitting}
            className="w-full px-4 py-2.5 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {submitting ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              'Прийняти оферту'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
