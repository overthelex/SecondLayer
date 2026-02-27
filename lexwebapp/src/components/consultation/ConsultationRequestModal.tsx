import { useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { consultationService, type CreateConsultationRequest } from '../../services/api/ConsultationService';
import { generateRoute } from '../../router/routes';

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

export function ConsultationRequestModal({ attorneyId, attorneyName, consultationFee, matterId, onClose }: Props) {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.requestTitle.trim()) {
      setError('Введіть тему запиту');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const consultation = await consultationService.createConsultation(form);
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
      <div className="bg-white rounded-lg max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="text-lg font-bold">Запит на консультацію</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
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
            <button type="submit" disabled={submitting} className="flex-1 py-2.5 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2">
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              Надіслати запит
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
