import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { MessageSquare, Clock, CheckCircle, XCircle, AlertCircle, Loader2, CreditCard } from 'lucide-react';
import { consultationService, type Consultation } from '../../services/api/ConsultationService';
import { generateRoute } from '../../router/routes';

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  pending: { label: 'Очікує', color: 'bg-yellow-100 text-yellow-700', icon: Clock },
  accepted: { label: 'Прийнято', color: 'bg-blue-100 text-blue-700', icon: CheckCircle },
  paid: { label: 'Оплачено', color: 'bg-indigo-100 text-indigo-700', icon: CreditCard },
  in_progress: { label: 'В роботі', color: 'bg-purple-100 text-purple-700', icon: MessageSquare },
  completed: { label: 'Завершено', color: 'bg-green-100 text-green-700', icon: CheckCircle },
  cancelled: { label: 'Скасовано', color: 'bg-gray-100 text-gray-500', icon: XCircle },
  declined: { label: 'Відхилено', color: 'bg-red-100 text-red-700', icon: XCircle },
  disputed: { label: 'Спір', color: 'bg-orange-100 text-orange-700', icon: AlertCircle },
};

export function ConsultationsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Redirect to last viewed consultation unless explicitly navigating to list
  useEffect(() => {
    if (searchParams.has('list')) return;
    const lastId = sessionStorage.getItem('lastConsultationId');
    if (lastId) {
      navigate(generateRoute.consultationDetail(lastId), { replace: true });
    }
  }, []);
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');

  useEffect(() => {
    setLoading(true);
    consultationService.listConsultations({
      role: role || undefined,
      status: statusFilter || undefined,
      limit: 50,
    })
      .then(result => {
        setConsultations(result.consultations);
        setTotal(result.total);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [role, statusFilter]);

  return (
    <div className="h-full overflow-y-auto">
    <div className="max-w-5xl mx-auto p-6">
      <div className="flex items-center gap-3 mb-8">
        <MessageSquare className="w-7 h-7 text-indigo-600" />
        <h1 className="text-2xl font-bold text-gray-900">Консультації</h1>
      </div>

      <div className="flex gap-3 mb-6">
        <select
          className="px-3 py-2 border rounded-md text-sm bg-white"
          value={role}
          onChange={e => setRole(e.target.value)}
        >
          <option value="">Всі ролі</option>
          <option value="client">Як клієнт</option>
          <option value="attorney">Як адвокат</option>
        </select>
        <select
          className="px-3 py-2 border rounded-md text-sm bg-white"
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
        >
          <option value="">Всі статуси</option>
          {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
            <option key={key} value={key}>{cfg.label}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
        </div>
      ) : consultations.length === 0 ? (
        <div className="text-center py-20">
          <MessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-600 mb-2">Консультацій поки немає</h3>
          <p className="text-gray-400 max-w-md mx-auto">
            Знайдіть адвоката та створіть запит на консультацію
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-gray-500">Всього: {total}</p>
          {consultations.map(c => {
            const statusCfg = STATUS_CONFIG[c.status] || STATUS_CONFIG.pending;
            const StatusIcon = statusCfg.icon;
            return (
              <div
                key={c.id}
                onClick={() => navigate(generateRoute.consultationDetail(c.id))}
                className="border rounded-lg p-4 hover:border-indigo-300 hover:shadow-sm transition-all cursor-pointer bg-white"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-gray-900 truncate">{c.request_title}</h3>
                    <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
                      <span>Клієнт: {c.client_name || 'N/A'}</span>
                      <span>Адвокат: {c.attorney_name || 'N/A'}</span>
                      {c.matter_name && <span>Справа: {c.matter_name}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {c.agreed_fee_uah && (
                      <span className="text-sm font-medium text-gray-700">{c.agreed_fee_uah} грн</span>
                    )}
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${statusCfg.color}`}>
                      <StatusIcon className="w-3.5 h-3.5" />
                      {statusCfg.label}
                    </span>
                  </div>
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  {new Date(c.created_at).toLocaleDateString('uk-UA')}
                  {c.consultation_type === 'representation' && ' | Представництво'}
                  {c.consultation_type === 'document_review' && ' | Аналіз документів'}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
    </div>
  );
}
