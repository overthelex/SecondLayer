import { Scale, CheckCircle } from 'lucide-react';

interface Step1WelcomeProps {
  onContinue: () => void;
  onSkip: () => void;
}

export function Step1Welcome({ onContinue, onSkip }: Step1WelcomeProps) {
  return (
    <div className="flex flex-col items-center text-center px-6 py-4">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-claude-accent to-orange-600 flex items-center justify-center mb-6">
        <Scale className="w-8 h-8 text-white" />
      </div>

      <h2 className="text-2xl font-bold text-gray-900 mb-2">
        Ласкаво просимо до SecondLayer!
      </h2>
      <p className="text-gray-500 text-sm mb-8 max-w-md">
        Створіть свій профіль адвоката та отримайте доступ до повного набору інструментів для юридичної практики.
      </p>

      <div className="w-full max-w-sm space-y-3 mb-8 text-left">
        {[
          'Пошук та аналіз судових рішень з AI',
          'Консультації з клієнтами через платформу',
          'Автоматичне заповнення профілю з ЄРАУ',
        ].map((text) => (
          <div key={text} className="flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
            <span className="text-sm text-gray-700">{text}</span>
          </div>
        ))}
      </div>

      <button
        onClick={onContinue}
        className="w-full max-w-sm py-3 bg-gradient-to-r from-claude-accent to-orange-600 text-white rounded-lg font-medium hover:opacity-90 transition-opacity"
      >
        Продовжити як адвокат
      </button>

      <button
        onClick={onSkip}
        className="mt-3 text-sm text-gray-400 hover:text-gray-600 transition-colors"
      >
        Пропустити
      </button>
    </div>
  );
}
