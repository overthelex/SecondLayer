import { useState, useEffect, useRef } from 'react';
import { Shield, Loader2, CheckCircle, XCircle, Clock, Lock, Unlock, RefreshCw } from 'lucide-react';
import { consultationService, type ConsultationPayment } from '../../services/api/ConsultationService';

const STATUS_CONFIG: Record<string, {
  label: string;
  description: string;
  color: string;
  bgColor: string;
  borderColor: string;
  icon: typeof Shield;
}> = {
  pending: {
    label: 'Очікує оплати',
    description: 'Платіж створено, очікуємо переходу на сторінку оплати',
    color: 'text-yellow-700',
    bgColor: 'bg-yellow-50',
    borderColor: 'border-yellow-200',
    icon: Clock,
  },
  processing: {
    label: 'Обробка платежу',
    description: 'Платіж обробляється Monobank. Зачекайте, будь ласка...',
    color: 'text-blue-700',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    icon: Loader2,
  },
  held: {
    label: 'Кошти заморожено (Escrow)',
    description: 'Оплата підтверджена. Кошти утримуються до завершення консультації.',
    color: 'text-indigo-700',
    bgColor: 'bg-indigo-50',
    borderColor: 'border-indigo-200',
    icon: Lock,
  },
  released: {
    label: 'Кошти передано адвокату',
    description: 'Консультацію завершено. Оплату перераховано адвокату.',
    color: 'text-green-700',
    bgColor: 'bg-green-50',
    borderColor: 'border-green-200',
    icon: Unlock,
  },
  refunded: {
    label: 'Кошти повернено',
    description: 'Оплату повернено на вашу картку.',
    color: 'text-red-700',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
    icon: RefreshCw,
  },
};

interface Props {
  consultationId: string;
  consultationStatus: string;
  onPaymentConfirmed?: () => void;
}

export function EscrowStatusBadge({ consultationId, consultationStatus, onPaymentConfirmed }: Props) {
  const [payment, setPayment] = useState<ConsultationPayment | null>(null);
  const [loading, setLoading] = useState(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchPayment = async () => {
    try {
      const p = await consultationService.getPaymentStatus(consultationId);
      setPayment(p);

      // If payment just moved to 'held' and consultation was 'accepted', notify parent
      if (p.status === 'held' && consultationStatus === 'accepted' && onPaymentConfirmed) {
        onPaymentConfirmed();
      }

      // Stop polling once in a terminal state
      if (['held', 'released', 'refunded'].includes(p.status) && pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    } catch {
      // No payment yet — that's fine
      setPayment(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPayment();

    // Poll for status only while payment exists and is in non-terminal state
    // Don't poll if consultation is only 'accepted' (payment not created yet)
    if (consultationStatus === 'paid' || consultationStatus === 'in_progress') {
      pollRef.current = setInterval(fetchPayment, 15000);
    }

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [consultationId, consultationStatus]);

  if (loading || !payment) return null;

  const config = STATUS_CONFIG[payment.status] || STATUS_CONFIG.pending;
  const StatusIcon = config.icon;
  const isAnimated = payment.status === 'processing';
  const platformFeePercent = payment.amount_uah > 0
    ? Math.round((payment.platform_fee_uah / payment.amount_uah) * 100)
    : 0;

  return (
    <div className={`${config.bgColor} border ${config.borderColor} rounded-lg p-4 mb-4`}>
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 ${config.color}`}>
          <StatusIcon className={`w-5 h-5 ${isAnimated ? 'animate-spin' : ''}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h4 className={`text-sm font-semibold ${config.color}`}>
              {config.label}
            </h4>
            <span className={`text-xs font-medium ${config.color}`}>
              {payment.amount_uah} грн
            </span>
          </div>
          <p className="text-xs text-gray-600 mt-1">{config.description}</p>

          {/* Fee breakdown for held/released */}
          {['held', 'released'].includes(payment.status) && (
            <div className="mt-3 pt-2 border-t border-gray-200/50 space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Сума оплати</span>
                <span className="font-medium text-gray-700">{payment.amount_uah} грн</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Комісія платформи ({platformFeePercent}%)</span>
                <span className="font-medium text-gray-700">{payment.platform_fee_uah} грн</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Виплата адвокату</span>
                <span className="font-medium text-gray-700">{payment.attorney_payout_uah} грн</span>
              </div>
            </div>
          )}

          {/* Status-specific messages */}
          {payment.status === 'held' && (
            <div className="mt-2 flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-indigo-500" />
              <span className="text-xs text-indigo-600">Захищено системою Escrow</span>
            </div>
          )}
          {payment.status === 'released' && (
            <div className="mt-2 flex items-center gap-1.5">
              <CheckCircle className="w-3.5 h-3.5 text-green-500" />
              <span className="text-xs text-green-600">Транзакцію завершено</span>
            </div>
          )}
          {payment.status === 'refunded' && (
            <div className="mt-2 flex items-center gap-1.5">
              <XCircle className="w-3.5 h-3.5 text-red-500" />
              <span className="text-xs text-red-600">Кошти повернено на картку</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
