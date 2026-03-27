import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Loader2, Star, CreditCard, CheckCircle, XCircle, Play, MessageSquare, Shield, Lock, Video, Phone } from 'lucide-react';
import { consultationService, type Consultation } from '../../services/api/ConsultationService';
import { useAuth } from '../../contexts/AuthContext';
import { getErrorMessage } from '../../utils/errors';
import showToast from '../../utils/toast';
import { toastT } from '../../i18n/toast-i18n';
import { ConsultationChatTab } from '../../components/chat/ConsultationChatTab';
import { EscrowStatusBadge } from '../../components/consultation/EscrowStatusBadge';
import { SharedDocumentsSection } from '../../components/consultation/SharedDocumentsSection';
import { ConfirmModal } from '../../components/ui/ConfirmModal';
import { useConsultationStore } from '../../stores/consultationStore';
import { VideoCallOverlay } from '../../components/video-call/VideoCallOverlay';
import { CallNotification } from '../../components/video-call/CallNotification';
import { useVideoCallStore } from '../../stores/videoCallStore';
import { useVideoSignaling } from '../../hooks/useVideoSignaling';

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
  const [activeModal, setActiveModal] = useState<'decline' | 'complete' | 'cancel' | null>(null);

  const callState = useVideoCallStore(s => s.callState);
  const incomingCall = useVideoCallStore(s => s.incomingCall);
  const setConsultationIdForCall = useVideoCallStore(s => s.setConsultationId);

  // Set consultation ID in video call store
  useEffect(() => {
    if (id) setConsultationIdForCall(id);
    return () => setConsultationIdForCall(null);
  }, [id, setConsultationIdForCall]);

  // Always connect signaling WebSocket when viewing a consultation
  const signaling = useVideoSignaling(id || null);

  // When caller clicks call button and state goes to 'initiating', send the call-initiate message
  const prevCallStateRef = useRef(callState);
  useEffect(() => {
    if (prevCallStateRef.current === 'idle' && callState === 'initiating' && consultation) {
      const { remoteUserId, callType } = useVideoCallStore.getState();
      if (remoteUserId && signaling.isConnected) {
        signaling.initiateCall(callType, remoteUserId);
      }
    }
    prevCallStateRef.current = callState;
  }, [callState, consultation, signaling, signaling.isConnected]);

  // Handle accept/reject events from CallNotification
  useEffect(() => {
    const handleAccept = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.sessionId) {
        signaling.acceptCall(detail.sessionId);
      }
    };
    const handleReject = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.sessionId) {
        signaling.rejectCall(detail.sessionId);
      }
    };
    window.addEventListener('video-call-accept', handleAccept);
    window.addEventListener('video-call-reject', handleReject);
    return () => {
      window.removeEventListener('video-call-accept', handleAccept);
      window.removeEventListener('video-call-reject', handleReject);
    };
  }, [signaling]);

  const handleStartVideoCall = () => {
    if (!consultation || !id) return;
    const otherUserId = isClient ? consultation.attorney_user_id : consultation.client_user_id;
    const otherUserName = isClient ? consultation.attorney_name : consultation.client_name;
    useVideoCallStore.getState().setRemoteUser(otherUserId, otherUserName || null);
    useVideoCallStore.getState().setCallState('initiating');
  };

  const handleStartAudioCall = () => {
    if (!consultation || !id) return;
    const otherUserId = isClient ? consultation.attorney_user_id : consultation.client_user_id;
    const otherUserName = isClient ? consultation.attorney_name : consultation.client_name;
    useVideoCallStore.getState().setRemoteUser(otherUserId, otherUserName || null);
    useVideoCallStore.getState().setCallState('initiating');
    useVideoCallStore.getState().toggleVideo(); // start as audio-only
  };

  // Resizable divider state
  const [topPanelHeight, setTopPanelHeight] = useState(45); // percentage of container
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const handleDragStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    isDragging.current = true;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';

    const handleMove = (moveEvent: MouseEvent | TouchEvent) => {
      if (!isDragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const clientY = 'touches' in moveEvent ? moveEvent.touches[0].clientY : moveEvent.clientY;
      const pct = ((clientY - rect.top) / rect.height) * 100;
      setTopPanelHeight(Math.min(Math.max(pct, 15), 80));
    };

    const handleEnd = () => {
      isDragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleEnd);
      document.removeEventListener('touchmove', handleMove);
      document.removeEventListener('touchend', handleEnd);
    };

    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleEnd);
    document.addEventListener('touchmove', handleMove);
    document.addEventListener('touchend', handleEnd);
  }, []);

  const addStatusListener = useConsultationStore(s => s.addStatusListener);

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

  // Subscribe to real-time consultation status changes (user-level SSE)
  useEffect(() => {
    if (!id) return;
    const unsub = addStatusListener(id, (updated) => {
      setConsultation(updated);
    });
    return unsub;
  }, [id, addStatusListener]);

  // Fallback: listen to per-conversation SSE via window event
  useEffect(() => {
    if (!id) return;
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail && detail.id === id) {
        setConsultation(detail);
      } else {
        load();
      }
    };
    window.addEventListener('consultation-updated', handler);
    return () => window.removeEventListener('consultation-updated', handler);
  }, [id]);

  // Polling fallback: refetch consultation every 5s to catch status/fee changes
  // SSE through Cloudflare is unreliable
  useEffect(() => {
    if (!id) return;
    const poll = setInterval(() => {
      consultationService.getConsultation(id).then((c) => {
        if (!c) return;
        setConsultation(prev => {
          if (!prev) return c;
          // Only update if something changed
          if (prev.status !== c.status || prev.agreed_fee_uah !== c.agreed_fee_uah || prev.updated_at !== c.updated_at) {
            return c;
          }
          return prev;
        });
      }).catch(() => {});
    }, 15000);
    return () => clearInterval(poll);
  }, [id]);

  const handleAction = async (action: string, inputValue?: string) => {
    if (!id) return;
    setActionLoading(action);
    try {
      let result: Consultation;
      switch (action) {
        case 'accept': {
          const fee = parseFloat(acceptFee);
          if (!fee || fee <= 0) { showToast.error(toastT('invalidFeeAmount')); return; }
          result = await consultationService.acceptConsultation(id, fee);
          setShowAcceptModal(false);
          showToast.success(toastT('consultationAccepted'));
          break;
        }
        case 'decline': {
          result = await consultationService.declineConsultation(id, inputValue || undefined);
          setActiveModal(null);
          showToast.success(toastT('consultationDeclined'));
          break;
        }
        case 'start': {
          result = await consultationService.startConsultation(id);
          showToast.success(toastT('consultationStarted'));
          break;
        }
        case 'complete': {
          result = await consultationService.completeConsultation(id, inputValue || undefined);
          setActiveModal(null);
          showToast.success(toastT('consultationCompleted'));
          break;
        }
        case 'cancel': {
          result = await consultationService.cancelConsultation(id, inputValue || undefined);
          setActiveModal(null);
          showToast.success(toastT('consultationCancelled'));
          break;
        }
        case 'pay': {
          const payResult = await consultationService.initiatePayment(id);
          if (payResult.paymentUrl) {
            window.location.href = payResult.paymentUrl;
          } else {
            showToast.error(toastT('monobankPaymentFailed'));
          }
          return;
        }
        default: return;
      }
      setConsultation(result);
    } catch (err: unknown) {
      showToast.error(getErrorMessage(err));
    } finally {
      setActionLoading('');
    }
  };

  const handleSubmitReview = async () => {
    if (!id) return;
    try {
      await consultationService.submitReview(id, { rating, reviewText: reviewText || undefined });
      setShowReview(false);
      showToast.success(toastT('thankYouForFeedback'));
    } catch (err: unknown) {
      showToast.error(getErrorMessage(err));
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
    <div ref={containerRef} className="h-full flex flex-col overflow-hidden">
      <div className="overflow-y-auto flex-shrink-0" style={{ height: `${topPanelHeight}%` }}>
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
                <button onClick={() => setActiveModal('decline')} disabled={!!actionLoading}
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
              <button onClick={() => setActiveModal('complete')} disabled={!!actionLoading}
                className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50">
                Завершити
              </button>
            )}
            {/* Video/Audio call buttons — available when consultation is paid or in_progress */}
            {['paid', 'in_progress'].includes(consultation.status) && callState === 'idle' && (
              <>
                <button onClick={handleStartVideoCall}
                  className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 flex items-center gap-1.5">
                  <Video className="w-4 h-4" />
                  Відеодзвінок
                </button>
                <button onClick={handleStartAudioCall}
                  className="px-3 py-1.5 bg-teal-600 text-white rounded-lg text-sm hover:bg-teal-700 flex items-center gap-1.5">
                  <Phone className="w-4 h-4" />
                  Аудіодзвінок
                </button>
              </>
            )}
            {!isTerminal && consultation.status !== 'completed' && (
              <button onClick={() => setActiveModal('cancel')} disabled={!!actionLoading}
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

      {/* Drag handle */}
      <div
        onMouseDown={handleDragStart}
        onTouchStart={handleDragStart}
        className="flex-shrink-0 h-2 bg-gray-100 border-y border-gray-200 cursor-row-resize hover:bg-indigo-100 active:bg-indigo-200 transition-colors flex items-center justify-center group"
      >
        <div className="w-8 h-0.5 rounded-full bg-gray-300 group-hover:bg-indigo-400 transition-colors" />
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

      {/* Decline modal */}
      <ConfirmModal
        isOpen={activeModal === 'decline'}
        title="Відхилити консультацію"
        description="Ви впевнені, що хочете відхилити цей запит?"
        confirmLabel="Відхилити"
        variant="danger"
        inputLabel="Причина відмови"
        inputPlaceholder="Вкажіть причину відмови (необов'язково)..."
        loading={actionLoading === 'decline'}
        onConfirm={(reason) => handleAction('decline', reason)}
        onCancel={() => setActiveModal(null)}
      />

      {/* Complete modal */}
      <ConfirmModal
        isOpen={activeModal === 'complete'}
        title="Завершити консультацію"
        description="Після завершення клієнт зможе залишити відгук, а кошти будуть звільнені."
        confirmLabel="Завершити"
        inputLabel="Підсумок консультації"
        inputPlaceholder="Опишіть результати консультації..."
        loading={actionLoading === 'complete'}
        onConfirm={(summary) => handleAction('complete', summary)}
        onCancel={() => setActiveModal(null)}
      />

      {/* Cancel modal */}
      <ConfirmModal
        isOpen={activeModal === 'cancel'}
        title="Скасувати консультацію"
        description="Ви впевнені? Якщо оплата вже здійснена, кошти будуть повернені."
        confirmLabel="Скасувати консультацію"
        variant="danger"
        inputLabel="Причина скасування"
        inputPlaceholder="Вкажіть причину скасування..."
        loading={actionLoading === 'cancel'}
        onConfirm={(reason) => handleAction('cancel', reason)}
        onCancel={() => setActiveModal(null)}
      />

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
              <div className="border-t pt-2 mt-2 space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-gray-700">Сума резервування</span>
                  <span className="text-xl font-bold text-gray-900">{consultation.agreed_fee_uah} грн</span>
                </div>
                <div className="flex justify-between text-xs text-gray-500">
                  <span>Виплата адвокату (70%)</span>
                  <span>{(consultation.agreed_fee_uah! * 0.7).toFixed(2)} грн</span>
                </div>
                <div className="flex justify-between text-xs text-gray-500">
                  <span>Комісія платформи (30%)</span>
                  <span>{(consultation.agreed_fee_uah! * 0.3).toFixed(2)} грн</span>
                </div>
                <div className="flex justify-between text-xs text-gray-400">
                  <span>Еквайрінг Monobank</span>
                  <span>включено</span>
                </div>
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

      {/* Incoming call notification (shown even when idle) */}
      {incomingCall && callState === 'idle' && (
        <CallNotification />
      )}

      {/* Video/Audio call overlay (active call) */}
      {id && callState !== 'idle' && (
        <VideoCallOverlay signaling={signaling} />
      )}
    </div>
  );
}
