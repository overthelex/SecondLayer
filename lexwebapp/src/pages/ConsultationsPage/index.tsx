import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageSquare, Clock, CheckCircle, XCircle, AlertCircle, Loader2, CreditCard, Wallet } from 'lucide-react';
import { consultationService } from '../../services/api/ConsultationService';
import { generateRoute, ROUTES } from '../../router/routes';

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
  const location = useLocation();
  const queryClient = useQueryClient();
  const activeTab = location.pathname === ROUTES.CONSULTATIONS_PAYOUTS ? 'payouts' : 'list';

  const setActiveTab = (tab: 'list' | 'payouts') => {
    navigate(tab === 'payouts' ? ROUTES.CONSULTATIONS_PAYOUTS : ROUTES.CONSULTATIONS, { replace: true });
  };

  // Clear stale redirect so attorney always sees full list first
  useEffect(() => {
    sessionStorage.removeItem('lastConsultationId');
  }, []);

  const [role, setRole] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');

  const { data, isLoading } = useQuery({
    queryKey: ['consultations', role, statusFilter],
    queryFn: () => consultationService.listConsultations({
      role: role || undefined,
      status: statusFilter || undefined,
      limit: 50,
    }),
  });

  const consultations = data?.consultations ?? [];
  const total = data?.total ?? 0;

  const { data: payouts, isLoading: payoutsLoading } = useQuery({
    queryKey: ['my-payouts'],
    queryFn: () => consultationService.getMyPayouts(),
    enabled: activeTab === 'payouts',
  });

  const totalEarned = (payouts ?? [])
    .filter(p => p.status === 'completed')
    .reduce((sum, p) => sum + Number(p.amount_uah), 0);
  const totalPending = (payouts ?? [])
    .filter(p => p.status === 'pending')
    .reduce((sum, p) => sum + Number(p.amount_uah), 0);

  // Invalidate query on SSE consultation status events
  useEffect(() => {
    const handler = () => {
      queryClient.invalidateQueries({ queryKey: ['consultations'] });
      queryClient.invalidateQueries({ queryKey: ['my-payouts'] });
    };
    window.addEventListener('consultation-updated', handler);
    return () => window.removeEventListener('consultation-updated', handler);
  }, [queryClient]);

  return (
    <div className="h-full overflow-y-auto">
    <div className="max-w-5xl mx-auto p-6">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <MessageSquare className="w-7 h-7 text-indigo-600" />
          <h1 className="text-2xl font-bold text-gray-900">Консультації</h1>
        </div>
        <div className="flex bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setActiveTab('list')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === 'list' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <MessageSquare className="w-4 h-4 inline mr-1.5" />
            Список
          </button>
          <button
            onClick={() => setActiveTab('payouts')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === 'payouts' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Wallet className="w-4 h-4 inline mr-1.5" />
            Виплати
          </button>
        </div>
      </div>

      {activeTab === 'payouts' ? (
        <div>
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
              <p className="text-sm text-emerald-600 mb-1">Зараховано</p>
              <p className="text-2xl font-bold text-emerald-800">{totalEarned.toFixed(2)} грн</p>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <p className="text-sm text-amber-600 mb-1">Очікує</p>
              <p className="text-2xl font-bold text-amber-800">{totalPending.toFixed(2)} грн</p>
            </div>
          </div>

          {payoutsLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
            </div>
          ) : !payouts || payouts.length === 0 ? (
            <div className="text-center py-20">
              <Wallet className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-600 mb-2">Виплат поки немає</h3>
              <p className="text-gray-400">Виплати з'являться після завершення консультацій</p>
            </div>
          ) : (
            <div className="space-y-3">
              {payouts.map(p => {
                const statusLabels: Record<string, { label: string; color: string }> = {
                  pending: { label: 'Очікує', color: 'bg-yellow-100 text-yellow-700' },
                  processing: { label: 'Обробка', color: 'bg-blue-100 text-blue-700' },
                  completed: { label: 'Зараховано', color: 'bg-green-100 text-green-700' },
                  failed: { label: 'Помилка', color: 'bg-red-100 text-red-700' },
                };
                const cfg = statusLabels[p.status] || statusLabels.pending;
                return (
                  <div
                    key={p.id}
                    onClick={() => p.consultation_id && navigate(generateRoute.consultationDetail(p.consultation_id))}
                    className="border rounded-lg p-4 bg-white hover:border-indigo-300 hover:shadow-sm transition-all cursor-pointer"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-gray-900">{p.request_title || 'Консультація'}</p>
                        <p className="text-xs text-gray-400 mt-1">
                          {new Date(p.created_at).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' })}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-lg font-bold text-gray-900">{Number(p.amount_uah).toFixed(2)} грн</span>
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${cfg.color}`}>
                          {cfg.label}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
      <>
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

      {isLoading ? (
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
      </>
      )}
    </div>
    </div>
  );
}
