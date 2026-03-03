/**
 * Public Offer (Оферта) Page
 * Fondy requires this URL with {lang} parameter: /uk/offer or /en/offer
 */

import { useParams, useNavigate } from 'react-router-dom';
import { FileText, ArrowLeft, Globe } from 'lucide-react';

const offerContent = {
  uk: {
    title: 'ПУБЛІЧНА ОФЕРТА',
    subtitle: 'про надання інформаційних послуг',
    backLabel: 'Назад',
    switchLang: 'English',
    switchTo: 'en',
    sections: [
      {
        heading: '',
        content: `Товариство з обмеженою відповідальністю «Лекс ЕйАй»
Код ЄДРПОУ: 46011385
Місцезнаходження: 04132, Україна, м. Київ, 47-Садова, 1а
Email: info@legal.org.ua`,
      },
      {
        heading: '1. Загальні положення',
        content: `Цей документ є офіційною публічною пропозицією (офертою) ТОВ «Лекс ЕйАй» укласти договір надання інформаційних послуг.`,
      },
      {
        heading: '2. Предмет договору',
        content: `Компанія надає доступ до програмного забезпечення Lex AI для автоматизації аналізу юридичних документів.`,
      },
      {
        heading: '3. Порядок укладення договору',
        content: `Договір вважається укладеним з моменту здійснення Клієнтом оплати послуг.`,
      },
      {
        heading: '4. Вартість та порядок оплати',
        content: `Вартість послуг визначається відповідно до обраного тарифу.
Оплата здійснюється онлайн через платіжні системи.`,
      },
      {
        heading: '5. Повернення коштів',
        content: `Повернення можливе у випадках:
— технічної неможливості надання послуг;
— помилкової оплати.
Заява подається протягом 14 календарних днів.`,
      },
      {
        heading: '6. Контактна інформація',
        content: `ТОВ «Лекс ЕйАй», ЄДРПОУ: 46011385
Юридична адреса: 04132, Україна, м. Київ, 47-Садова, 1а
Email: info@legal.org.ua`,
      },
    ],
  },
  en: {
    title: 'PUBLIC OFFER',
    subtitle: 'for the provision of information services',
    backLabel: 'Back',
    switchLang: 'Українська',
    switchTo: 'uk',
    sections: [
      {
        heading: '',
        content: `Limited Liability Company "Lex AI"
EDRPOU Code: 46011385
Address: 04132, Ukraine, Kyiv, 47-Sadova, 1a
Email: info@legal.org.ua`,
      },
      {
        heading: '1. General Provisions',
        content: `This document is an official public offer by LLC "Lex AI" to enter into an agreement for the provision of information services.`,
      },
      {
        heading: '2. Subject of the Agreement',
        content: `The Company provides access to the Lex AI software for automation of legal document analysis.`,
      },
      {
        heading: '3. Conclusion of the Agreement',
        content: `The agreement is considered concluded from the moment the Client makes payment for the services.`,
      },
      {
        heading: '4. Pricing and Payment',
        content: `The cost of services is determined according to the selected plan.
Payment is made online through payment systems.`,
      },
      {
        heading: '5. Refunds',
        content: `Refunds are possible in the following cases:
— technical impossibility of providing services;
— erroneous payment.
The application must be submitted within 14 calendar days.`,
      },
      {
        heading: '6. Contact Information',
        content: `LLC "Lex AI", EDRPOU: 46011385
Legal address: 04132, Ukraine, Kyiv, 47-Sadova, 1a
Email: info@legal.org.ua`,
      },
    ],
  },
};

export function OfferPage() {
  const { lang } = useParams<{ lang: string }>();
  const navigate = useNavigate();

  const currentLang = lang === 'uk' || lang === 'en' ? lang : 'uk';
  const content = offerContent[currentLang];

  const handleSwitchLang = () => {
    navigate(`/${content.switchTo}/offer`, { replace: true });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors text-sm"
          >
            <ArrowLeft size={16} />
            {content.backLabel}
          </button>

          <button
            onClick={handleSwitchLang}
            className="flex items-center gap-2 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-gray-700"
          >
            <Globe size={14} />
            {content.switchLang}
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 md:p-12">
          {/* Title */}
          <div className="text-center mb-10">
            <div className="flex justify-center mb-4">
              <div className="w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center">
                <FileText size={28} className="text-blue-600" />
              </div>
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">{content.title}</h1>
            <p className="text-lg text-gray-600">{content.subtitle}</p>
          </div>

          {/* Sections */}
          <div className="space-y-8">
            {content.sections.map((section, index) => (
              <section key={index}>
                {section.heading && (
                  <h2 className="text-xl font-semibold text-gray-900 mb-3">
                    {section.heading}
                  </h2>
                )}
                <div className="text-gray-700 leading-relaxed whitespace-pre-line">
                  {section.content}
                </div>
              </section>
            ))}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-4xl mx-auto px-4 py-6 text-center">
        <p className="text-xs text-gray-400">
          ТОВ «Лекс ЕйАй» &copy; {new Date().getFullYear()}
        </p>
      </footer>
    </div>
  );
}
