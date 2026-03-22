/**
 * Payment Success Page
 * Monobank redirects here after a successful payment.
 * Supports both balance top-up and consultation escrow payments.
 */

import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle, ArrowRight, MessageSquare } from 'lucide-react';
import { ROUTES } from '../router/routes';

export function PaymentSuccessPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [orderInfo, setOrderInfo] = useState<{
    orderId?: string;
    amount?: string;
    currency?: string;
  }>({});

  // Check if this payment was for a consultation (stored before redirect)
  const consultationId = sessionStorage.getItem('lastConsultationId');

  useEffect(() => {
    // Monobank redirects with query params after payment
    const orderId = searchParams.get('order_id') || '';
    const amount = searchParams.get('amount') || '';
    const currency = searchParams.get('currency') || 'UAH';

    if (orderId) {
      const amountNum = amount ? parseInt(amount, 10) / 100 : 0;
      setOrderInfo({
        orderId,
        amount: amountNum ? amountNum.toFixed(2) : undefined,
        currency,
      });

      // Track as Google Ads Purchase conversion
      if (typeof window.gtag === 'function') {
        window.gtag('event', 'conversion', {
          send_to: 'AW-18033840618/bnTSCJqpwI0cEOqjmpdD',
          value: amountNum || 1.0,
          currency: currency,
          transaction_id: orderId,
        });
      }
    }
  }, [searchParams]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50 to-white flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-lg border border-green-100 p-8 text-center">
        <div className="flex justify-center mb-6">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center">
            <CheckCircle size={48} className="text-green-600" />
          </div>
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Оплата успішна
        </h1>

        <p className="text-gray-600 mb-6">
          {consultationId
            ? 'Ваш платіж успішно оброблено. Кошти заморожено в системі Escrow до завершення консультації.'
            : 'Ваш платіж успішно оброблено. Баланс буде оновлено найближчим часом.'}
        </p>

        {orderInfo.orderId && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6 text-left">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Номер замовлення:</span>
                <span className="font-medium text-gray-800">{orderInfo.orderId}</span>
              </div>
              {orderInfo.amount && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Сума:</span>
                  <span className="font-medium text-gray-800">
                    {orderInfo.currency === 'UAH' ? '₴' : '$'}{orderInfo.amount}
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-500">Статус:</span>
                <span className="font-medium text-green-700">Підтверджено</span>
              </div>
              {consultationId && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Тип:</span>
                  <span className="font-medium text-indigo-700">Escrow (консультація)</span>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="space-y-3">
          {consultationId ? (
            <button
              onClick={() => navigate(`/consultations/${consultationId}`)}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium"
            >
              <MessageSquare size={18} />
              Перейти до консультації
            </button>
          ) : (
            <button
              onClick={() => navigate(ROUTES.BILLING)}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
            >
              Перейти до білінгу
              <ArrowRight size={18} />
            </button>
          )}

          {consultationId && (
            <button
              onClick={() => navigate(ROUTES.BILLING)}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
            >
              Перейти до білінгу
              <ArrowRight size={18} />
            </button>
          )}
        </div>

        <p className="text-xs text-gray-400 mt-4">
          Підтвердження буде надіслано на вашу електронну пошту.
        </p>
      </div>
    </div>
  );
}
