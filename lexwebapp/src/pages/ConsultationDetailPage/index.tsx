import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Loader2, Star, CreditCard, CheckCircle, XCircle, Play, MessageSquare, Shield, Lock } from 'lucide-react';
import { consultationService, type Consultation } from '../../services/api/ConsultationService';
import { useAuth } from '../../contexts/AuthContext';
import { getErrorMessage } from '../../utils/errors';
import { ConsultationChatTab } from '../../components/chat/ConsultationChatTab';
import { EscrowStatusBadge } from '../../components/consultation/EscrowStatusBadge';
import { SharedDocumentsSection } from '../../components/consultation/SharedDocumentsSection';

const STATUS_STEPS = ['pending', 'accepted', 'paid', 'in_progress', 'completed'];
const STATUS_LABELS: Record<string, string> = {
  pending: 'Очікує', accepted: 'Прийнято', paid: 'Оплачено',
  in_progress: 'В роботі', completed: 'Завершено',
  cancelled: 'Скасовано', declined: 'Відхилено', disputed: 'Спір',
};

export function ConsultationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [consultation, setConsultation] = useState<Consultation | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');
  const [showReview, setShowReview] = useState(false);
  const [showEscrow, setShowEscrow] = useState(false);
  const [rating, setRating] = useState(5);
  const [reviewText, setReviewText] = useState('');
  const [showAcceptModal, setShowAcceptModal] = useState(false);
  const [acceptFee, setAcceptFee] = useState('');

  const isClient = consultation?.client_user_id === user?.id;
  const isAttorney = consultation?.attorney_user_id === user?.id;

  const load = async () => {
    if (!id) return;
    try {
      const c = await consultationService.getConsultation(id);
      setConsultation(c);
    } catch {
      setConsultation(null);
      sessionStorage.removeItem('lastConsultationId');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    if (id) sessionStorage.setItem('lastConsultationId', id);
  }, [id]);

  const handleAction = async (action: string) => {
    if (!id) return;
    setActionLoading(action);
    try {
      let result: Consultation;
      switch (action) {
        case 'accept': {
          const fee = parseFloat(acceptFee);
          if (!fee || fee <= 0) { alert('Вкажіть коректну суму гонорару'); return; }
          result = await consultationService.acceptConsultation(id, fee);
          setShowAcceptModal(false);
          break;
        }
        case 'decline': {
          const reason = prompt('Причина відмови:');
          result = await consultationService.declineConsultation(id, reason || undefined);
          break;
        }
        case 'start': result = await consultationService.startConsultation(id); break;
        case 'complete': {
          const summary = prompt('Підсумок консультації:');
          result = await consultationService.completeConsultation(id, summary || undefined);
          break;
        }
        case 'cancel': {
          const reason = prompt('Причина скасування:');
          result = await consultationService.cancelConsultation(id, reason || undefined);
          break;
        }
        case 'pay': {
          const payResult = await consultationService.initiatePayment(id);
          if (payResult.paymentUrl) window.location.href = payResult.paymentUrl;
          return;
        }
        default: return;
      }
      setConsultation(result);
    } catch (err: unknown) {
      alert(getErrorMessage(err));
    } finally {
      setActionLoading('');
    }
  };

  const handleSubmitReview = async () => {
    if (!id) return;
    try {
      await consultationService.submitReview(id, { rating, reviewText: reviewText || undefined });
      setShowReview(false);
      alert('Дякуємо за відгук!');
    } catch (err: unknown) {
      alert(getErrorMessage(err));
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-indigo-500" /></div>;
  }

  if (!consultation) {
    return (
      <div className="max-w-4xl mx-auto p-6 text-center py-20">
        <h2 className="text-xl text-gray-600">Консультацію не знайдено</h2>
        <Link to="/consultations?list" className="mt-4 text-indigo-600 hover:underline">Назад</Link>
      </div>
    );
  }

  const currentStepIdx = STATUS_STEPS.indexOf(consultation.status);
  const isTerminal = ['cancelled', 'declined', 'disputed'].includes(consultation.status);
  const isChatDisabled = isTerminal || consultation.status === 'completed';

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-shrink-0 overflow-y-auto max-h-[45vh] border-b border-gray-200">
        <div className="max-w-4xl mx-auto p-6">
          <Link to="/consultations?list" className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4">
            <ArrowLeft className="w-4 h-4" /> Назад до консультацій
          </Link>

          <div className="bg-white border rounded-lg p-5 mb-4">
            <h1 className="text-lg font-bold text-gray-900 mb-2">{consultation.request_title}</h1>
            {consultation.request_description && (
              <p className="text-sm text-gray-600 mb-3">{consultation.request_description}</p>
            )}
            <div className="flex flex-wrap gap-4 text-sm text-gray-500">
              <span>Клієнт: <strong>{consultation.client_name}</strong></span>
              <span>Адвокат: <strong>{consultation.attorney_name}</strong></span>
              {consultation.matter_name && <span>Справа: <strong>{consultation.matter_name}</strong></span>}
              {consultation.agreed_fee_uah && <span>Вартість: <strong>{consultation.agreed_fee_uah} грн</strong></span>}
            </div>
          </div>

          {/* Status timeline */}
          {!isTerminal && (
            <div className="bg-white border rounded-lg p-4 mb-4">
              <div className="flex items-center justify-between">
                {STATUS_STEPS.map((step, i) => {
                  const isActive = i <= currentStepIdx;
                  const isCurrent = step === consultation.status;
                  return (
                    <div key={step} className="flex items-center flex-1">
                      <div className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-medium ${
                        isCurrent ? 'bg-indigo-600 text-white' : isActive ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-500'
                      }`}>
                        {isActive && !isCurrent ? <CheckCircle className="w-3.5 h-3.5" /> : i + 1}
                      </div>
                      <span className={`ml-1.5 text-xs hidden sm:inline ${isCurrent ? 'text-indigo-600 font-semibold' : 'text-gray-400'}`}>
                        {STATUS_LABELS[step]}
                      </span>
                      {i < STATUS_STEPS.length - 1 && (
                        <div className={`flex-1 h-0.5 mx-2 ${isActive ? 'bg-green-300' : 'bg-gray-200'}`} />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {isTerminal && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-700 font-medium text-sm">{STATUS_LABELS[consultation.status]}</p>
              {consultation.decline_reason && <p className="text-xs text-red-600 mt-1">Причина: {consultation.decline_reason}</p>}
              {consultation.cancel_reason && <p className="text-xs text-red-600 mt-1">Причина: {consultation.cancel_reason}</p>}
            </div>
          )}

          {/* Escrow payment status */}
          {consultation.agreed_fee_uah && consultation.agreed_fee_uah > 0 && !['pending', 'declined'].includes(consultation.status) && (
            <EscrowStatusBadge
              consultationId={consultation.id}
              consultationStatus={consultation.status}
              onPaymentConfirmed={load}
            />
          )}

          {/* Shared documents */}
          {consultation.document_ids?.length > 0 && (
            <SharedDocumentsSection
              documentIds={consultation.document_ids}
              attorneyUserId={consultation.attorney_user_id}
              isClient={isClient}
              consultationStatus={consultation.status}
            />
          )}

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2">
            {isAttorney && consultation.status === 'pending' && (
              <>
                <button onClick={() => { setAcceptFee(''); setShowAcceptModal(true); }} disabled={!!actionLoading}
                  className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50">
                  {actionLoading === 'accept' ? <Loader2 className="w-4 h-4 animate-spin inline" /> : <CheckCircle className="w-4 h-4 inline mr-1" />}
                  Прийняти
                </button>
                <button onClick={() => handleAction('decline')} disabled={!!actionLoading}
                  className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 disabled:opacity-50">
                  Відхилити
                </button>
              </>
            )}
            {isClient && consultation.status === 'accepted' && (
              <button onClick={() => setShowEscrow(true)} disabled={!!actionLoading}
                className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50">
                <CreditCard className="w-4 h-4 inline mr-1" />
                Оплатити {consultation.agreed_fee_uah ? `${consultation.agreed_fee_uah} грн` : ''}
              </button>
            )}
            {isAttorney && consultation.status === 'paid' && (
              <button onClick={() => handleAction('start')} disabled={!!actionLoading}
                className="px-3 py-1.5 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 disabled:opacity-50">
                <Play className="w-4 h-4 inline mr-1" />
                Почати роботу
              </button>
            )}
            {isAttorney && consultation.status === 'in_progress' && (
              <button onClick={() => handleAction('complete')} disabled={!!actionLoading}
                className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50">
                Завершити
              </button>
            )}
            {!isTerminal && consultation.status !== 'completed' && (
              <button onClick={() => handleAction('cancel')} disabled={!!actionLoading}
                className="px-3 py-1.5 border border-red-300 text-red-600 rounded-lg text-sm hover:bg-red-50 disabled:opacity-50">
                <XCircle className="w-4 h-4 inline mr-1" />
                Скасувати
              </button>
            )}
            {isClient && consultation.status === 'completed' && (
              <button onClick={() => setShowReview(true)}
                className="px-3 py-1.5 bg-yellow-500 text-white rounded-lg text-sm hover:bg-yellow-600">
                <Star className="w-4 h-4 inline mr-1" />
                Залишити відгук
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Chat section — takes remaining space */}
      <div className="flex-1 min-h-0 flex flex-col bg-white">
        <div className="px-4 py-2.5 border-b bg-gray-50/80 flex-shrink-0">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <MessageSquare className="w-4 h-4" />
            Повідомлення
          </h3>
        </div>
        <div className="flex-1 min-h-0">
          <ConsultationChatTab
            consultationId={id || null}
            onUnreadCountChange={() => {}}
            disabled={isChatDisabled}
          />
        </div>
      </div>

      {/* Escrow confirmation modal */}
      {showEscrow && consultation && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowEscrow(false)}>
          <div className="bg-white rounded-xl p-6 max-w-md w-full shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center">
                <Shield className="w-5 h-5 text-indigo-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">Безпечна оплата Escrow</h3>
                <p className="text-xs text-gray-500">Захист покупця через Monobank</p>
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-4 mb-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Адвокат</span>
                <span className="font-medium text-gray-800">{consultation.attorney_name}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Послуга</span>
                <span className="font-medium text-gray-800">{consultation.request_title}</span>
              </div>
              <div className="border-t pt-2 mt-2 flex justify-between items-center">
                <span className="text-sm font-medium text-gray-700">Сума резервування</span>
                <span className="text-xl font-bold text-gray-900">{consultation.agreed_fee_uah} грн</span>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 mb-4 space-y-3">
              <div className="flex gap-2.5">
                <Lock className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-blue-800">
                  Кошти будуть <strong>заморожені</strong> на вашій картці Visa/Mastercard, а не списані. Адвокат отримає оплату лише після завершення консультації.
                </p>
              </div>
              <div className="flex gap-2.5">
                <Shield className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-blue-800">
                  Ви можете <strong>відмовитися</strong> від консультації в будь-який момент до її початку — кошти будуть автоматично розморожені.
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowEscrow(false)}
                className="flex-1 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Скасувати
              </button>
              <button
                onClick={() => { setShowEscrow(false); handleAction('pay'); }}
                disabled={!!actionLoading}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white flex items-center justify-center gap-2 disabled:opacity-70"
                style={{ backgroundColor: '#000000' }}
              >
                {actionLoading === 'pay' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CreditCard className="w-4 h-4" />
                )}
                Підтвердити та оплатити
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Accept fee modal */}
      {showAcceptModal && consultation && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowAcceptModal(false)}>
          <div className="bg-white rounded-xl p-6 max-w-sm w-full shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-900 mb-1">Прийняти консультацію</h3>
            <p className="text-sm text-gray-500 mb-4">Вкажіть суму гонорару, яку буде зарезервовано на картці клієнта</p>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Сума гонорару (грн)</label>
              <input
                type="number"
                min="1"
                step="1"
                value={acceptFee}
                onChange={e => setAcceptFee(e.target.value)}
                placeholder="Наприклад: 2000"
                className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
                autoFocus
                onKeyDown={e => { if (e.key === 'Enter') handleAction('accept'); }}
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowAcceptModal(false)}
                className="flex-1 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Скасувати
              </button>
              <button
                onClick={() => handleAction('accept')}
                disabled={!!actionLoading || !acceptFee || parseFloat(acceptFee) <= 0}
                className="flex-1 py-2.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {actionLoading === 'accept' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                Прийняти за {acceptFee ? `${acceptFee} грн` : '...'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Review modal */}
      {showReview && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowReview(false)}>
          <div className="bg-white rounded-lg p-6 max-w-md w-full" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">Оцініть консультацію</h3>
            <div className="flex gap-1 mb-4">
              {[1, 2, 3, 4, 5].map(i => (
                <button key={i} onClick={() => setRating(i)}>
                  <Star className={`w-8 h-8 ${i <= rating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-200'}`} />
                </button>
              ))}
            </div>
            <textarea
              rows={3}
              className="w-full px-3 py-2 border rounded-md text-sm mb-4"
              placeholder="Ваш відгук (необов'язково)..."
              value={reviewText}
              onChange={e => setReviewText(e.target.value)}
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowReview(false)} className="px-4 py-2 border rounded-lg text-sm">Скасувати</button>
              <button onClick={handleSubmitReview} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm">Надіслати</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
