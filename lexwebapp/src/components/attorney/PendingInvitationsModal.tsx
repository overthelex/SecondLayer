import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Clock, FileText, MessageSquare } from 'lucide-react';
import { consultationService, type Consultation } from '../../services/api/ConsultationService';
import showToast from '../../utils/toast';

interface PendingInvitationsModalProps {
  open: boolean;
  consultations: Consultation[];
  onClose: (remainingIds: string[]) => void;
}

const URGENCY_LABELS: Record<string, { label: string; color: string }> = {
  low: { label: 'Низька', color: 'text-gray-500 bg-gray-50' },
  normal: { label: 'Звичайна', color: 'text-blue-600 bg-blue-50' },
  high: { label: 'Висока', color: 'text-orange-600 bg-orange-50' },
  urgent: { label: 'Термінова', color: 'text-red-600 bg-red-50' },
};

const TYPE_LABELS: Record<string, string> = {
  consultation: 'Консультація',
  representation: 'Представництво',
  document_review: 'Перевірка документів',
};

export function PendingInvitationsModal({ open, consultations: initialConsultations, onClose }: PendingInvitationsModalProps) {
  const [items, setItems] = useState<Consultation[]>(initialConsultations);
  const [processing, setProcessing] = useState<string | null>(null);

  const handleAccept = async (id: string) => {
    setProcessing(id);
    try {
      await consultationService.acceptConsultation(id);
      setItems(prev => prev.filter(c => c.id !== id));
      showToast.success('Запит прийнято');
    } catch {
      showToast.error('Не вдалося прийняти запит');
    } finally {
      setProcessing(null);
    }
  };

  const handleDecline = async (id: string) => {
    setProcessing(id);
    try {
      await consultationService.declineConsultation(id);
      setItems(prev => prev.filter(c => c.id !== id));
      showToast.success('Запит відхилено');
    } catch {
      showToast.error('Не вдалося відхилити запит');
    } finally {
      setProcessing(null);
    }
  };

  const handleClose = () => {
    const remainingIds = items.map(c => c.id);
    onClose(remainingIds);
  };

  if (items.length === 0 && open) {
    handleClose();
    return null;
  }

  return (
    <AnimatePresence>
      {open && items.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4"
          onClick={handleClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-[16px] font-semibold text-gray-900">Нові запити</h2>
                <p className="text-[13px] text-gray-500 mt-0.5">
                  {items.length} {items.length === 1 ? 'новий запит' : items.length < 5 ? 'нових запити' : 'нових запитів'}
                </p>
              </div>
              <button
                onClick={handleClose}
                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto px-6 py-3 space-y-3">
              {items.map(consultation => {
                const urgency = URGENCY_LABELS[consultation.urgency] || URGENCY_LABELS.normal;
                const isProcessing = processing === consultation.id;

                return (
                  <motion.div
                    key={consultation.id}
                    layout
                    initial={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="border border-gray-200 rounded-xl p-4 hover:border-gray-300 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <h3 className="text-[14px] font-medium text-gray-900 line-clamp-2">
                        {consultation.request_title}
                      </h3>
                      <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${urgency.color}`}>
                        {urgency.label}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-[12px] text-gray-500 mb-3">
                      <span className="flex items-center gap-1">
                        <MessageSquare size={12} />
                        {consultation.client_name}
                      </span>
                      <span className="flex items-center gap-1">
                        <FileText size={12} />
                        {TYPE_LABELS[consultation.consultation_type] || consultation.consultation_type}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock size={12} />
                        {new Date(consultation.created_at).toLocaleDateString('uk-UA')}
                      </span>
                    </div>

                    {consultation.request_description && (
                      <p className="text-[12px] text-gray-500 mb-3 line-clamp-2">
                        {consultation.request_description}
                      </p>
                    )}

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleAccept(consultation.id)}
                        disabled={isProcessing}
                        className="flex-1 px-3 py-2 text-[13px] font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 rounded-lg transition-colors"
                      >
                        {isProcessing ? '...' : 'Прийняти'}
                      </button>
                      <button
                        onClick={() => handleDecline(consultation.id)}
                        disabled={isProcessing}
                        className="flex-1 px-3 py-2 text-[13px] font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 rounded-lg transition-colors"
                      >
                        Відхилити
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
