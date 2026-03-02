import { useState } from 'react';
import { X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { consultationService, type CreateConsultationRequest } from '../../services/api/ConsultationService';
import { generateRoute } from '../../router/routes';
import { StepIndicator } from '../attorney/AttorneyOnboardingModal/StepIndicator';
import { ConversationPicker } from './ConversationPicker';
import { DocumentPicker } from './DocumentPicker';
import { ConfirmStep } from './ConfirmStep';
import { PaymentStep } from './PaymentStep';
import type { VaultDocument } from '../../pages/DocumentsPage/types';
import type { Conversation } from '../../services/api/ConversationService';

interface Props {
  attorneyId: string;
  attorneyName: string;
  consultationFee?: number;
  matterId?: string;
  onClose: () => void;
}

const CONSULTATION_TYPES = [
  { value: 'consultation', label: 'Консультація' },
  { value: 'representation', label: 'Представництво в суді' },
  { value: 'document_review', label: 'Аналіз документів' },
];

const URGENCY_OPTIONS = [
  { value: 'low', label: 'Низька' },
  { value: 'normal', label: 'Звичайна' },
  { value: 'high', label: 'Висока' },
  { value: 'urgent', label: 'Термінова' },
];

const STEP_TITLES = ['Деталі запиту', 'Чати', 'Документи', 'Підтвердження', 'Оплата'];

export function ConsultationRequestModal({ attorneyId, attorneyName, consultationFee, matterId, onClose }: Props) {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [allDocs, setAllDocs] = useState<VaultDocument[]>([]);
  const [selectedConversationIds, setSelectedConversationIds] = useState<string[]>([]);
  const [allConversations, setAllConversations] = useState<Conversation[]>([]);
  const [form, setForm] = useState<CreateConsultationRequest>({
    attorneyUserId: attorneyId,
    matterId: matterId || undefined,
    consultationType: 'consultation',
    requestTitle: '',
    requestDescription: '',
    urgency: 'normal',
    shareDocuments: !!matterId,
    shareConversations: !!matterId,
    feeType: 'fixed',
  });

  const handleNext = () => {
    if (step === 1) {
      if (!form.requestTitle.trim()) {
        setError('Введіть тему запиту');
        return;
      }
      setError('');
      setStep(2);
    }
  };

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const payload: CreateConsultationRequest = {
        ...form,
        documentIds: selectedDocIds.length > 0 ? selectedDocIds : undefined,
        conversationIds: selectedConversationIds.length > 0 ? selectedConversationIds : undefined,
      };
      const consultation = await consultationService.createConsultation(payload);
      onClose();
      navigate(generateRoute.consultationDetail(consultation.id));
    } catch (err: any) {
      setError(err.message || 'Помилка створення запиту');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-lg max-w-lg w-full max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 pb-2 border-b">
          <div>
            <h2 className="text-lg font-bold">{STEP_TITLES[step - 1]}</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <StepIndicator currentStep={step} totalSteps={5} />

        <div className="flex-1 overflow-y-auto min-h-0">
          {step === 1 && (
            <div className="p-5 pt-2 space-y-4">
              <p className="text-sm text-gray-500">
                Адвокат: <strong>{attorneyName}</strong>
                {consultationFee && <> | Вартість: <strong>{consultationFee} грн</strong></>}
              </p>

              {error && <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">{error}</div>}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Тип послуги</label>
                <select
                  className="w-full px-3 py-2 border rounded-md text-sm bg-white"
                  value={form.consultationType}
                  onChange={e => setForm(f => ({ ...f, consultationType: e.target.value }))}
                >
                  {CONSULTATION_TYPES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Тема запиту *</label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border rounded-md text-sm"
                  placeholder="Коротко опишіть проблему"
                  value={form.requestTitle}
                  onChange={e => setForm(f => ({ ...f, requestTitle: e.target.value }))}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Детальний опис</label>
                <textarea
                  rows={4}
                  className="w-full px-3 py-2 border rounded-md text-sm"
                  placeholder="Опишіть ситуацію детальніше..."
                  value={form.requestDescription}
                  onChange={e => setForm(f => ({ ...f, requestDescription: e.target.value }))}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Терміновість</label>
                <select
                  className="w-full px-3 py-2 border rounded-md text-sm bg-white"
                  value={form.urgency}
                  onChange={e => setForm(f => ({ ...f, urgency: e.target.value }))}
                >
                  {URGENCY_OPTIONS.map(u => (
                    <option key={u.value} value={u.value}>{u.label}</option>
                  ))}
                </select>
              </div>

              {matterId && (
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" className="rounded" checked={form.shareDocuments} onChange={e => setForm(f => ({ ...f, shareDocuments: e.target.checked }))} />
                    Надати доступ до документів справи
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" className="rounded" checked={form.shareConversations} onChange={e => setForm(f => ({ ...f, shareConversations: e.target.checked }))} />
                    Надати доступ до чатів справи
                  </label>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={onClose} className="flex-1 py-2.5 border rounded-lg text-sm hover:bg-gray-50">
                  Скасувати
                </button>
                <button type="button" onClick={handleNext} className="flex-1 py-2.5 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700">
                  Далі
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <ConversationPicker
              selectedIds={selectedConversationIds}
              onChange={setSelectedConversationIds}
              onConversationsLoaded={setAllConversations}
              onBack={() => setStep(1)}
              onNext={() => setStep(3)}
            />
          )}

          {step === 3 && (
            <DocumentPicker
              selectedIds={selectedDocIds}
              onChange={setSelectedDocIds}
              onDocsLoaded={setAllDocs}
              onBack={() => setStep(2)}
              onNext={() => setStep(4)}
            />
          )}

          {step === 4 && (
            <ConfirmStep
              form={form}
              selectedDocIds={selectedDocIds}
              allDocs={allDocs}
              selectedConversationIds={selectedConversationIds}
              allConversations={allConversations}
              attorneyName={attorneyName}
              consultationFee={consultationFee}
              onBack={() => setStep(3)}
              onNext={() => setStep(5)}
            />
          )}

          {step === 5 && (
            <PaymentStep
              attorneyName={attorneyName}
              consultationFee={consultationFee}
              serviceType={form.consultationType || 'consultation'}
              onPaymentComplete={handleSubmit}
              onBack={() => setStep(4)}
              submitting={submitting}
              error={error}
            />
          )}
        </div>
      </div>
    </div>
  );
}
