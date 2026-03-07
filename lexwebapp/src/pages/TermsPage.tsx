/**
 * Terms of Service Page
 * Bilingual (UK/EN) with {lang} parameter: /uk/terms or /en/terms
 */

import { useParams, useNavigate } from 'react-router-dom';
import { FileText, ArrowLeft, Globe } from 'lucide-react';

const termsContent = {
  uk: {
    title: 'УМОВИ ВИКОРИСТАННЯ',
    subtitle: 'сервісу LEX AI',
    lastUpdated: 'Останнє оновлення: 7 березня 2026 р.',
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
        heading: '1. Визначення термінів',
        content: `«Сервіс» — програмне забезпечення LEX AI, доступне за адресою legal.org.ua, включаючи API, MCP-сервери та веб-додаток.
«Компанія» — ТОВ «Лекс ЕйАй», оператор Сервісу.
«Користувач» — фізична або юридична особа, яка використовує Сервіс.
«Контент» — будь-які дані, документи, запити та результати аналізу, створені або завантажені Користувачем.
«AI-аналіз» — автоматизована обробка юридичних документів із використанням штучного інтелекту.
«MCP-токен» — ключ доступу для підключення зовнішніх MCP-клієнтів (Claude Desktop тощо).`,
      },
      {
        heading: '2. Прийняття умов',
        content: `Реєстрація облікового запису або використання Сервісу означає повне прийняття цих Умов використання, Політики конфіденційності та Публічної оферти. Якщо ви не погоджуєтесь з будь-яким положенням, припиніть використання Сервісу.

Компанія залишає за собою право змінювати ці Умови. Про суттєві зміни Користувачі будуть повідомлені електронною поштою або через інтерфейс Сервісу не менше ніж за 14 днів до набуття чинності.`,
      },
      {
        heading: '3. Опис Сервісу',
        content: `LEX AI надає:
— AI-аналіз юридичних документів (договорів, позовів, судових рішень);
— семантичний пошук по судовій практиці України;
— пошук та аналіз законодавства;
— перевірку контрагентів у державних реєстрах (ЄДР, ЄДРСР);
— зберігання документів у захищеному сховищі;
— доступ до парламентських даних (законопроєкти, голосування);
— інтеграцію через MCP-токени з Claude Desktop та іншими клієнтами.

Сервіс використовує технології штучного інтелекту (OpenAI API) для обробки та аналізу юридичної інформації.`,
      },
      {
        heading: '4. Обмеження відповідальності щодо AI-аналізу',
        content: `ВАЖЛИВО: Результати AI-аналізу мають виключно інформаційний характер і НЕ є юридичною консультацією.

Компанія НЕ гарантує:
— повну точність, актуальність чи повноту результатів аналізу;
— відповідність результатів конкретній юридичній ситуації;
— відсутність помилок у цитуванні нормативних актів чи судових рішень.

Користувач зобов'язаний самостійно перевіряти результати AI-аналізу перед використанням у юридичній практиці. Компанія не несе відповідальності за збитки, завдані внаслідок використання результатів аналізу без належної перевірки.

Система включає механізми HallucinationGuard та CitationValidator для мінімізації помилок, проте вони не гарантують абсолютну точність.`,
      },
      {
        heading: '5. Реєстрація та обліковий запис',
        content: `Для використання Сервісу необхідно створити обліковий запис одним із способів:
— реєстрація через email та пароль;
— авторизація через Google OAuth;
— авторизація через Дію (Дія.Підпис).

Користувач зобов'язаний:
— надавати достовірну інформацію при реєстрації;
— забезпечити конфіденційність пароля та MCP-токенів;
— негайно повідомити Компанію про несанкціонований доступ;
— не передавати обліковий запис третім особам.

Компанія має право заблокувати або видалити обліковий запис у разі порушення цих Умов.`,
      },
      {
        heading: '6. Допустиме використання',
        content: `Користувач зобов'язується використовувати Сервіс виключно для законних цілей. Забороняється:
— використання для порушення прав інтелектуальної власності;
— завантаження шкідливого програмного забезпечення;
— спроби несанкціонованого доступу до систем або даних інших користувачів;
— масове автоматизоване завантаження даних (scraping) без дозволу;
— використання Сервісу для створення конкуруючих продуктів;
— перевищення встановлених лімітів API без узгодження;
— використання результатів аналізу для введення в оману суду чи клієнтів.`,
      },
      {
        heading: '7. Інтелектуальна власність',
        content: `Сервіс LEX AI, включаючи програмний код, дизайн, алгоритми та документацію, є інтелектуальною власністю Компанії та захищений законодавством про авторське право.

Контент, завантажений Користувачем, залишається його власністю. Користувач надає Компанії обмежену ліцензію на обробку Контенту виключно для надання послуг Сервісу.

Результати AI-аналізу, створені Сервісом на основі Контенту Користувача, належать Користувачу.`,
      },
      {
        heading: '8. Тарифи та оплата',
        content: `Вартість послуг визначається відповідно до обраного тарифного плану, опублікованого на сайті Сервісу.

Оплата здійснюється онлайн через платіжну систему Monobank. Ціни вказуються в гривнях (UAH) з урахуванням ПДВ.

Компанія залишає за собою право змінювати тарифи з попереднім повідомленням за 30 днів. Зміна тарифів не впливає на вже оплачені періоди.`,
      },
      {
        heading: '9. Повернення коштів',
        content: `Повернення коштів можливе у випадках:
— технічної неможливості надання послуг протягом більше ніж 72 години;
— помилкового списання коштів;
— суттєвого зниження якості послуг, підтвердженого документально.

Заява на повернення подається на info@legal.org.ua протягом 14 календарних днів з моменту виникнення підстави. Повернення здійснюється протягом 10 робочих днів.`,
      },
      {
        heading: '10. Обмеження відповідальності',
        content: `Сервіс надається «як є» (as is). Компанія не гарантує безперебійну роботу Сервісу та не несе відповідальності за:
— тимчасову недоступність Сервісу з технічних причин;
— втрату даних внаслідок дій третіх осіб або форс-мажорних обставин;
— збитки, що виникли внаслідок неправильного використання Сервісу;
— дії або рішення, прийняті на основі результатів AI-аналізу.

Сукупна відповідальність Компанії обмежується сумою, сплаченою Користувачем за останні 12 місяців.`,
      },
      {
        heading: '11. Припинення використання',
        content: `Користувач може припинити використання Сервісу в будь-який час, видаливши обліковий запис через налаштування профілю або надіславши запит на info@legal.org.ua.

Компанія може припинити надання послуг:
— за 30 днів письмового повідомлення;
— негайно — у разі суттєвого порушення цих Умов.

Після припинення Компанія зберігає дані протягом 30 днів для можливості відновлення, після чого видаляє їх відповідно до Політики конфіденційності.`,
      },
      {
        heading: '12. Застосовне право та вирішення спорів',
        content: `Ці Умови регулюються законодавством України.

Спори вирішуються шляхом переговорів. Якщо сторони не досягнуть згоди протягом 30 днів, спір передається на розгляд до суду за місцезнаходженням Компанії (м. Київ, Україна).

Для користувачів з ЄС також застосовуються положення GDPR (Регламент ЄС 2016/679).`,
      },
      {
        heading: '13. Контактна інформація',
        content: `ТОВ «Лекс ЕйАй»
ЄДРПОУ: 46011385
Адреса: 04132, Україна, м. Київ, 47-Садова, 1а
Email: info@legal.org.ua
Веб-сайт: https://legal.org.ua`,
      },
    ],
  },
  en: {
    title: 'TERMS OF SERVICE',
    subtitle: 'LEX AI Platform',
    lastUpdated: 'Last updated: March 7, 2026',
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
        heading: '1. Definitions',
        content: `"Service" — the LEX AI software available at legal.org.ua, including APIs, MCP servers, and the web application.
"Company" — LLC "Lex AI", the operator of the Service.
"User" — any individual or legal entity using the Service.
"Content" — any data, documents, queries, and analysis results created or uploaded by the User.
"AI Analysis" — automated processing of legal documents using artificial intelligence.
"MCP Token" — an access key for connecting external MCP clients (Claude Desktop, etc.).`,
      },
      {
        heading: '2. Acceptance of Terms',
        content: `By registering an account or using the Service, you fully accept these Terms of Service, the Privacy Policy, and the Public Offer. If you disagree with any provision, discontinue use of the Service.

The Company reserves the right to modify these Terms. Users will be notified of material changes via email or through the Service interface at least 14 days before the changes take effect.`,
      },
      {
        heading: '3. Description of the Service',
        content: `LEX AI provides:
— AI analysis of legal documents (contracts, claims, court decisions);
— semantic search across Ukrainian court practice;
— legislation search and analysis;
— counterparty verification in state registries (EDR, EDRSR);
— secure document storage (vault);
— access to parliamentary data (bills, voting records);
— integration via MCP tokens with Claude Desktop and other clients.

The Service uses artificial intelligence technologies (OpenAI API) for processing and analyzing legal information.`,
      },
      {
        heading: '4. AI Analysis Disclaimer',
        content: `IMPORTANT: AI analysis results are for informational purposes only and do NOT constitute legal advice.

The Company does NOT guarantee:
— complete accuracy, currency, or completeness of analysis results;
— suitability of results for any specific legal situation;
— absence of errors in citations of legal acts or court decisions.

The User is obligated to independently verify AI analysis results before using them in legal practice. The Company shall not be liable for damages caused by the use of analysis results without proper verification.

The system includes HallucinationGuard and CitationValidator mechanisms to minimize errors; however, they do not guarantee absolute accuracy.`,
      },
      {
        heading: '5. Registration and Account',
        content: `To use the Service, you must create an account using one of the following methods:
— registration via email and password;
— authorization via Google OAuth;
— authorization via Diia (Diia.Signature).

The User is obligated to:
— provide accurate information during registration;
— maintain the confidentiality of passwords and MCP tokens;
— immediately notify the Company of any unauthorized access;
— not transfer the account to third parties.

The Company reserves the right to block or delete an account in case of violation of these Terms.`,
      },
      {
        heading: '6. Acceptable Use',
        content: `The User agrees to use the Service exclusively for lawful purposes. The following is prohibited:
— use for infringement of intellectual property rights;
— uploading malicious software;
— attempting unauthorized access to systems or data of other users;
— mass automated data downloading (scraping) without permission;
— using the Service to create competing products;
— exceeding established API limits without agreement;
— using analysis results to mislead courts or clients.`,
      },
      {
        heading: '7. Intellectual Property',
        content: `The LEX AI Service, including source code, design, algorithms, and documentation, is the intellectual property of the Company and is protected by copyright law.

Content uploaded by the User remains the User's property. The User grants the Company a limited license to process the Content solely for the purpose of providing the Service.

AI analysis results generated by the Service based on the User's Content belong to the User.`,
      },
      {
        heading: '8. Pricing and Payment',
        content: `The cost of services is determined by the selected plan published on the Service website.

Payments are made online through the Monobank payment system. Prices are listed in Ukrainian hryvnia (UAH) inclusive of VAT.

The Company reserves the right to change pricing with 30 days' prior notice. Price changes do not affect already paid periods.`,
      },
      {
        heading: '9. Refunds',
        content: `Refunds are available in the following cases:
— technical inability to provide services for more than 72 hours;
— erroneous charges;
— substantial documented deterioration in service quality.

Refund requests should be sent to info@legal.org.ua within 14 calendar days of the event. Refunds are processed within 10 business days.`,
      },
      {
        heading: '10. Limitation of Liability',
        content: `The Service is provided "as is." The Company does not guarantee uninterrupted operation and shall not be liable for:
— temporary unavailability of the Service for technical reasons;
— data loss due to actions of third parties or force majeure;
— damages resulting from improper use of the Service;
— actions or decisions made based on AI analysis results.

The Company's aggregate liability is limited to the amount paid by the User in the preceding 12 months.`,
      },
      {
        heading: '11. Termination',
        content: `The User may discontinue use of the Service at any time by deleting their account through profile settings or by sending a request to info@legal.org.ua.

The Company may terminate services:
— with 30 days' written notice;
— immediately — in case of material breach of these Terms.

After termination, the Company retains data for 30 days for possible recovery, after which it is deleted in accordance with the Privacy Policy.`,
      },
      {
        heading: '12. Governing Law and Dispute Resolution',
        content: `These Terms are governed by the laws of Ukraine.

Disputes shall be resolved through negotiation. If the parties fail to reach agreement within 30 days, the dispute shall be submitted to the court at the Company's registered address (Kyiv, Ukraine).

For users within the EU, the provisions of the GDPR (EU Regulation 2016/679) also apply.`,
      },
      {
        heading: '13. Contact Information',
        content: `LLC "Lex AI"
EDRPOU: 46011385
Address: 04132, Ukraine, Kyiv, 47-Sadova, 1a
Email: info@legal.org.ua
Website: https://legal.org.ua`,
      },
    ],
  },
};

export function TermsPage() {
  const { lang } = useParams<{ lang: string }>();
  const navigate = useNavigate();

  const currentLang = lang === 'uk' || lang === 'en' ? lang : 'uk';
  const content = termsContent[currentLang];

  const handleSwitchLang = () => {
    navigate(`/${content.switchTo}/terms`, { replace: true });
  };

  return (
    <div className="min-h-screen bg-gray-50">
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

      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 md:p-12">
          <div className="text-center mb-10">
            <div className="flex justify-center mb-4">
              <div className="w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center">
                <FileText size={28} className="text-blue-600" />
              </div>
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">{content.title}</h1>
            <p className="text-lg text-gray-600">{content.subtitle}</p>
            <p className="text-sm text-gray-400 mt-2">{content.lastUpdated}</p>
          </div>

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

      <footer className="max-w-4xl mx-auto px-4 py-6 text-center">
        <p className="text-xs text-gray-400">
          ТОВ «Лекс ЕйАй» &copy; {new Date().getFullYear()}
        </p>
      </footer>
    </div>
  );
}
