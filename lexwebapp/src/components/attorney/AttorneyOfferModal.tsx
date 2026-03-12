/**
 * Attorney Offer Modal
 * Shows attorney public offer that must be accepted before using the platform
 */

import React, { useState, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Scale, Globe, CheckCircle } from 'lucide-react';
import { Modal } from '../ui/Modal/Modal';
import { authService } from '../../services';
import { useAuth } from '../../contexts/AuthContext';
import toast from 'react-hot-toast';
import contentUk from '../../content/legal/attorney-offer-uk.md?raw';
import contentEn from '../../content/legal/attorney-offer-en.md?raw';

interface AttorneyOfferModalProps {
  isOpen: boolean;
  onAccepted: () => void;
}

export const AttorneyOfferModal: React.FC<AttorneyOfferModalProps> = ({
  isOpen,
  onAccepted,
}) => {
  const { updateUser } = useAuth();
  const [lang, setLang] = useState<'uk' | 'en'>('uk');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const content = lang === 'uk' ? contentUk : contentEn;

  const handleScroll = () => {
    if (!contentRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = contentRef.current;
    if (scrollTop + clientHeight >= scrollHeight - 50) {
      setHasScrolledToBottom(true);
    }
  };

  const handleAccept = async () => {
    setIsSubmitting(true);
    try {
      await authService.acceptAttorneyOffer();
      updateUser({ attorneyOfferAccepted: true });
      toast.success(lang === 'uk' ? 'Оферту прийнято!' : 'Offer accepted!');
      onAccepted();
    } catch (error: any) {
      toast.error(error.message || 'Помилка при прийнятті оферти');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {}}
      size="xl"
      showCloseButton={false}
      closeOnBackdrop={false}
    >
      <div className="flex flex-col h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
              <Scale size={20} className="text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                {lang === 'uk' ? 'Публічна оферта для адвокатів' : 'Public Offer for Attorneys'}
              </h2>
              <p className="text-sm text-gray-500">
                {lang === 'uk'
                  ? 'Будь ласка, ознайомтеся та прийміть оферту для продовження роботи'
                  : 'Please review and accept the offer to continue'}
              </p>
            </div>
          </div>
          <button
            onClick={() => setLang(lang === 'uk' ? 'en' : 'uk')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-white transition-colors text-gray-600"
          >
            <Globe size={14} />
            {lang === 'uk' ? 'English' : 'Українська'}
          </button>
        </div>

        {/* Content */}
        <div
          ref={contentRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-6 py-6"
        >
          <div className="prose prose-gray max-w-none prose-sm
            prose-headings:text-gray-900
            prose-h1:text-2xl prose-h1:font-bold prose-h1:text-center prose-h1:mb-2
            prose-h2:text-lg prose-h2:font-semibold prose-h2:mt-6 prose-h2:mb-2
            prose-p:text-gray-700 prose-p:leading-relaxed
            prose-li:text-gray-700
            prose-strong:text-gray-900
            prose-em:text-gray-500
            prose-hr:my-4
          ">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {content}
            </ReactMarkdown>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
          {!hasScrolledToBottom && (
            <p className="text-xs text-gray-400 text-center mb-3">
              {lang === 'uk'
                ? 'Прокрутіть до кінця документу, щоб прийняти оферту'
                : 'Scroll to the bottom of the document to accept the offer'}
            </p>
          )}
          <button
            onClick={handleAccept}
            disabled={!hasScrolledToBottom || isSubmitting}
            className={`w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-sm font-medium transition-all ${
              hasScrolledToBottom && !isSubmitting
                ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}
          >
            {isSubmitting ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <CheckCircle size={18} />
            )}
            {lang === 'uk' ? 'Прийняти оферту' : 'Accept Offer'}
          </button>
        </div>
      </div>
    </Modal>
  );
};
