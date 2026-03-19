import { useState, useEffect, useRef } from 'react';
import { CheckCircle, Loader2, CreditCard, Shield, Lock } from 'lucide-react';

interface Props {
  attorneyName: string;
  consultationFee?: number;
  serviceType: string;
  onPaymentComplete: () => void;
  onBack: () => void;
  submitting: boolean;
  error: string;
}

const TYPE_LABELS: Record<string, string> = {
  consultation: 'Консультація',
  representation: 'Представництво в суді',
  document_review: 'Аналіз документів',
};

export function PaymentStep({ attorneyName, consultationFee, serviceType, onPaymentComplete, onBack, submitting, error }: Props) {
  const [confirmed, setConfirmed] = useState(false);
  const isFree = !consultationFee || consultationFee === 0;
  const submittedRef = useRef(false);

  useEffect(() => {
    if (isFree && !submittedRef.current) {
      submittedRef.current = true;
      onPaymentComplete();
    }
  }, [isFree]);

  const handleConfirm = () => {
    setConfirmed(true);
    onPaymentComplete();
  };

  if (isFree) {
    return (
      <div className="flex flex-col items-center justify-center p-8 gap-3">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
        <p className="text-sm text-gray-500">Безкоштовно — створюємо запит...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">{error}</div>
        )}

        <div className="bg-gray-50 rounded-lg p-4 space-y-2">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Замовлення</p>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Адвокат</span>
            <span className="font-medium text-gray-800">{attorneyName}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Послуга</span>
            <span className="font-medium text-gray-800">{TYPE_LABELS[serviceType] || serviceType}</span>
          </div>
          <div className="border-t pt-2 mt-2 flex justify-between">
            <span className="text-sm font-medium text-gray-700">Вартість</span>
            <span className="text-lg font-bold text-gray-900">{consultationFee} грн</span>
          </div>
        </div>

        {confirmed || submitting ? (
          <div className="flex flex-col items-center gap-3 py-4">
            {submitting ? (
              <>
                <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
                <p className="text-sm text-gray-500">Створюємо запит на консультацію...</p>
              </>
            ) : (
              <>
                <CheckCircle className="w-12 h-12 text-green-500" />
                <p className="text-sm font-medium text-green-700">Запит створено</p>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 space-y-3">
              <div className="flex gap-2.5">
                <Shield className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-blue-800">
                  Після того, як адвокат прийме ваш запит, ви зможете здійснити <strong>безпечну оплату через Monobank</strong> на сторінці консультації.
                </p>
              </div>
              <div className="flex gap-2.5">
                <Lock className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-blue-800">
                  Кошти будуть <strong>заморожені (escrow)</strong> і передані адвокату лише після завершення консультації.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleConfirm}
              disabled={submitting}
              className="w-full py-3 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-70 bg-indigo-600 text-white hover:bg-indigo-700"
            >
              <CreditCard className="w-4 h-4" />
              Підтвердити та створити запит
            </button>

            <p className="text-xs text-center text-gray-400">
              Оплата здійснюється після прийняття запиту адвокатом
            </p>
          </div>
        )}
      </div>

      {!confirmed && !submitting && (
        <div className="flex gap-3 p-5 pt-3 border-t">
          <button
            type="button"
            onClick={onBack}
            className="flex-1 py-2.5 border rounded-lg text-sm hover:bg-gray-50"
          >
            Назад
          </button>
        </div>
      )}
    </div>
  );
}
