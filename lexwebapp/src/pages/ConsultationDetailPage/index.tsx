import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, Send, Star, CreditCard, CheckCircle, XCircle, Play, MessageSquare } from 'lucide-react';
import { consultationService, type Consultation, type ConsultationMessage } from '../../services/api/ConsultationService';
import { useAuth } from '../../contexts/AuthContext';

const STATUS_STEPS = ['pending', 'accepted', 'paid', 'in_progress', 'completed'];
const STATUS_LABELS: Record<string, string> = {
  pending: 'Очікує', accepted: 'Прийнято', paid: 'Оплачено',
  in_progress: 'В роботі', completed: 'Завершено',
  cancelled: 'Скасовано', declined: 'Відхилено', disputed: 'Спір',
};

export function ConsultationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [consultation, setConsultation] = useState<Consultation | null>(null);
  const [messages, setMessages] = useState<ConsultationMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [actionLoading, setActionLoading] = useState('');
  const [showReview, setShowReview] = useState(false);
  const [rating, setRating] = useState(5);
  const [reviewText, setReviewText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const isClient = consultation?.client_user_id === user?.id;
  const isAttorney = consultation?.attorney_user_id === user?.id;

  const load = async () => {
    if (!id) return;
    try {
      const [c, m] = await Promise.all([
        consultationService.getConsultation(id),
        consultationService.getMessages(id),
      ]);
      setConsultation(c);
      setMessages(m.messages);
    } catch {
      setConsultation(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const handleAction = async (action: string) => {
    if (!id) return;
    setActionLoading(action);
    try {
      let result: Consultation;
      switch (action) {
        case 'accept': result = await consultationService.acceptConsultation(id); break;
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
    } catch (err: any) {
      alert(err.message || 'Помилка');
    } finally {
      setActionLoading('');
    }
  };

  const handleSendMessage = async () => {
    if (!id || !newMessage.trim()) return;
    setSending(true);
    try {
      const msg = await consultationService.sendMessage(id, newMessage.trim());
      setMessages(prev => [...prev, msg]);
      setNewMessage('');
    } catch {
      alert('Не вдалося надіслати повідомлення');
    } finally {
      setSending(false);
    }
  };

  const handleSubmitReview = async () => {
    if (!id) return;
    try {
      await consultationService.submitReview(id, { rating, reviewText: reviewText || undefined });
      setShowReview(false);
      alert('Дякуємо за відгук!');
    } catch (err: any) {
      alert(err.message || 'Помилка');
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-indigo-500" /></div>;
  }

  if (!consultation) {
    return (
      <div className="max-w-4xl mx-auto p-6 text-center py-20">
        <h2 className="text-xl text-gray-600">Консультацію не знайдено</h2>
        <button onClick={() => navigate(-1)} className="mt-4 text-indigo-600 hover:underline">Назад</button>
      </div>
    );
  }

  const currentStepIdx = STATUS_STEPS.indexOf(consultation.status);
  const isTerminal = ['cancelled', 'declined', 'disputed'].includes(consultation.status);

  return (
    <div className="max-w-4xl mx-auto p-6">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6">
        <ArrowLeft className="w-4 h-4" /> Назад до консультацій
      </button>

      <div className="bg-white border rounded-lg p-6 mb-6">
        <h1 className="text-xl font-bold text-gray-900 mb-2">{consultation.request_title}</h1>
        {consultation.request_description && (
          <p className="text-gray-600 mb-4">{consultation.request_description}</p>
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
        <div className="bg-white border rounded-lg p-5 mb-6">
          <div className="flex items-center justify-between">
            {STATUS_STEPS.map((step, i) => {
              const isActive = i <= currentStepIdx;
              const isCurrent = step === consultation.status;
              return (
                <div key={step} className="flex items-center flex-1">
                  <div className={`flex items-center justify-center w-8 h-8 rounded-full text-xs font-medium ${
                    isCurrent ? 'bg-indigo-600 text-white' : isActive ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-500'
                  }`}>
                    {isActive && !isCurrent ? <CheckCircle className="w-4 h-4" /> : i + 1}
                  </div>
                  <span className={`ml-2 text-xs hidden sm:inline ${isCurrent ? 'text-indigo-600 font-semibold' : 'text-gray-400'}`}>
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
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-700 font-medium">{STATUS_LABELS[consultation.status]}</p>
          {consultation.decline_reason && <p className="text-sm text-red-600 mt-1">Причина: {consultation.decline_reason}</p>}
          {consultation.cancel_reason && <p className="text-sm text-red-600 mt-1">Причина: {consultation.cancel_reason}</p>}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2 mb-6">
        {isAttorney && consultation.status === 'pending' && (
          <>
            <button onClick={() => handleAction('accept')} disabled={!!actionLoading}
              className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50">
              {actionLoading === 'accept' ? <Loader2 className="w-4 h-4 animate-spin inline" /> : <CheckCircle className="w-4 h-4 inline mr-1" />}
              Прийняти
            </button>
            <button onClick={() => handleAction('decline')} disabled={!!actionLoading}
              className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 disabled:opacity-50">
              Відхилити
            </button>
          </>
        )}
        {isClient && consultation.status === 'accepted' && (
          <button onClick={() => handleAction('pay')} disabled={!!actionLoading}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50">
            <CreditCard className="w-4 h-4 inline mr-1" />
            Оплатити {consultation.agreed_fee_uah ? `${consultation.agreed_fee_uah} грн` : ''}
          </button>
        )}
        {isAttorney && consultation.status === 'paid' && (
          <button onClick={() => handleAction('start')} disabled={!!actionLoading}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 disabled:opacity-50">
            <Play className="w-4 h-4 inline mr-1" />
            Почати роботу
          </button>
        )}
        {isAttorney && consultation.status === 'in_progress' && (
          <button onClick={() => handleAction('complete')} disabled={!!actionLoading}
            className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50">
            Завершити
          </button>
        )}
        {!isTerminal && consultation.status !== 'completed' && (
          <button onClick={() => handleAction('cancel')} disabled={!!actionLoading}
            className="px-4 py-2 border border-red-300 text-red-600 rounded-lg text-sm hover:bg-red-50 disabled:opacity-50">
            <XCircle className="w-4 h-4 inline mr-1" />
            Скасувати
          </button>
        )}
        {isClient && consultation.status === 'completed' && (
          <button onClick={() => setShowReview(true)}
            className="px-4 py-2 bg-yellow-500 text-white rounded-lg text-sm hover:bg-yellow-600">
            <Star className="w-4 h-4 inline mr-1" />
            Залишити відгук
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="bg-white border rounded-lg">
        <div className="p-4 border-b">
          <h3 className="font-semibold flex items-center gap-2">
            <MessageSquare className="w-4 h-4" />
            Повідомлення
          </h3>
        </div>
        <div className="p-4 max-h-96 overflow-y-auto space-y-3">
          {messages.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">Повідомлень поки немає</p>
          ) : (
            messages.map(msg => {
              const isMine = msg.sender_id === user?.id;
              return (
                <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[75%] px-4 py-2 rounded-lg text-sm ${
                    isMine ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-800'
                  }`}>
                    {!isMine && <p className="text-xs font-medium mb-1 opacity-70">{msg.sender_name}</p>}
                    <p>{msg.content}</p>
                    <p className={`text-xs mt-1 ${isMine ? 'text-indigo-200' : 'text-gray-400'}`}>
                      {new Date(msg.created_at).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>
        {!isTerminal && consultation.status !== 'completed' && (
          <div className="p-4 border-t flex gap-2">
            <input
              type="text"
              placeholder="Написати повідомлення..."
              className="flex-1 px-4 py-2 border rounded-lg text-sm"
              value={newMessage}
              onChange={e => setNewMessage(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
            />
            <button
              onClick={handleSendMessage}
              disabled={sending || !newMessage.trim()}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
        )}
      </div>

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
