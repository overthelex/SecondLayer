/**
 * Privacy Policy Page
 * Bilingual (UK/EN) with {lang} parameter: /uk/privacy or /en/privacy
 */

import { useParams, useNavigate } from 'react-router-dom';
import { Shield, ArrowLeft, Globe } from 'lucide-react';

const privacyContent = {
  uk: {
    title: 'ПОЛІТИКА КОНФІДЕНЦІЙНОСТІ',
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
Email: info@legal.org.ua
Відповідальний за захист даних: info@legal.org.ua`,
      },
      {
        heading: '1. Загальні положення',
        content: `Ця Політика конфіденційності описує, як ТОВ «Лекс ЕйАй» (далі — «Компанія», «ми») збирає, обробляє, зберігає та захищає персональні дані користувачів сервісу LEX AI (далі — «Сервіс»).

Компанія обробляє персональні дані відповідно до:
— Закону України «Про захист персональних даних» (№ 2297-VI);
— Загального регламенту захисту даних ЄС (GDPR, Регламент 2016/679) — для користувачів з ЄС/ЄЕЗ;
— інших застосовних нормативних актів.

Використовуючи Сервіс, ви підтверджуєте ознайомлення з цією Політикою та надаєте згоду на обробку ваших персональних даних у порядку, визначеному нижче.`,
      },
      {
        heading: '2. Які дані ми збираємо',
        content: `2.1. Дані, які ви надаєте безпосередньо:
— ім'я, прізвище, email (при реєстрації);
— фото профілю (при авторизації через Google або Дію);
— документи, які ви завантажуєте для AI-аналізу;
— текстові запити до AI-системи;
— коментарі до статей блогу.

2.2. Дані, які збираються автоматично:
— IP-адреса та приблизна геолокація;
— тип браузера та операційної системи;
— час та тривалість сесій;
— дії в інтерфейсі Сервісу (переглянуті сторінки, використані інструменти);
— використання API (кількість запитів, типи інструментів).

2.3. Дані від третіх сторін:
— профіль Google (ім'я, email, фото) — при авторизації через Google OAuth;
— дані з Дія.Підпис (ПІБ, РНОКПП) — при авторизації через Дію;
— платіжна інформація від Monobank (статус транзакції, без номера картки).`,
      },
      {
        heading: '3. Цілі обробки даних',
        content: `Ми обробляємо персональні дані для таких цілей:

3.1. Надання послуг Сервісу:
— створення та управління обліковим записом;
— виконання AI-аналізу завантажених документів;
— семантичний пошук та отримання юридичної інформації;
— зберігання документів у захищеному сховищі.

3.2. Безпека та якість:
— захист від несанкціонованого доступу;
— моніторинг якості та продуктивності Сервісу;
— виявлення та запобігання зловживанням.

3.3. Комунікація:
— відправлення сервісних повідомлень (підтвердження реєстрації, скидання пароля);
— повідомлення про зміни в Умовах або Політиці.

3.4. Юридичні зобов'язання:
— виконання вимог законодавства;
— ведення бухгалтерського обліку (дані оплат).`,
      },
      {
        heading: '4. Правові підстави обробки (GDPR)',
        content: `Для користувачів з ЄС/ЄЕЗ ми обробляємо дані на підставі:
— Згоди (ст. 6(1)(a) GDPR) — для необов'язкових функцій та маркетингу;
— Виконання договору (ст. 6(1)(b) GDPR) — для надання послуг Сервісу;
— Законного інтересу (ст. 6(1)(f) GDPR) — для безпеки та покращення Сервісу;
— Юридичного зобов'язання (ст. 6(1)(c) GDPR) — для виконання вимог законодавства.`,
      },
      {
        heading: '5. Обробка документів через AI (OpenAI)',
        content: `ВАЖЛИВО: При використанні AI-аналізу, вміст ваших документів та запити передаються до OpenAI API для обробки.

Умови обробки даних через OpenAI:
— OpenAI виступає як субобробник (sub-processor) і обробляє дані виключно за нашими інструкціями;
— OpenAI НЕ використовує дані API для тренування своїх моделей (за замовчуванням з 1 березня 2023 р.);
— дані зберігаються OpenAI до 30 днів виключно для моніторингу зловживань, після чого видаляються;
— обробка регулюється Data Processing Addendum (DPA) між Компанією та OpenAI;
— OpenAI має сертифікацію SOC 2 Type 2.

Рекомендації для користувачів:
— не завантажуйте документи з особливо чутливими персональними даними (медичні, фінансові), якщо це не є необхідним для аналізу;
— за можливості знеособлюйте документи перед завантаженням;
— зв'язуйтесь з нами, якщо потребуєте додаткових гарантій обробки чутливих даних.`,
      },
      {
        heading: '6. Зберігання та захист даних',
        content: `6.1. Де зберігаються дані:
— облікові записи та метадані — PostgreSQL (зашифрований зв'язок);
— документи — MinIO (S3-сумісне сховище з шифруванням);
— векторні embeddings — Qdrant (для семантичного пошуку);
— кеш сесій — Redis (дані зберігаються тимчасово).

6.2. Заходи безпеки:
— шифрування даних при передачі (TLS 1.2+);
— автентифікація через JWT-токени;
— рольовий контроль доступу;
— аудит-лог з хеш-ланцюгом для відстеження доступу;
— ізоляція даних між клієнтами (matter segregation);
— регулярне резервне копіювання.

6.3. Строки зберігання:
— дані облікового запису — протягом дії акаунту + 30 днів після видалення;
— завантажені документи — протягом дії акаунту, видаляються за запитом;
— логи використання — 90 днів;
— дані оплат — 5 років (вимога законодавства);
— дані AI-запитів — 30 днів (abuse monitoring OpenAI).`,
      },
      {
        heading: '7. Передача даних третім сторонам',
        content: `Ми передаємо персональні дані виключно таким категоріям одержувачів:

7.1. Субобробники (sub-processors):
— OpenAI, LP (США) — AI-аналіз документів та запитів;
— Monobank / АТ «Універсал Банк» (Україна) — обробка платежів;
— Cloudflare, Inc. (США) — CDN та захист від DDoS;
— Hetzner Online GmbH (Німеччина) — хостинг серверів.

7.2. Державні органи:
— на вимогу суду або органів влади відповідно до законодавства України.

Ми НЕ продаємо та НЕ передаємо персональні дані для маркетингових цілей третіх сторін.

Для передачі даних за межі ЄС/ЄЕЗ ми використовуємо Стандартні договірні умови (SCC) відповідно до рішення Європейської Комісії.`,
      },
      {
        heading: '8. Права користувачів',
        content: `Відповідно до законодавства та GDPR, ви маєте такі права:

— Право на доступ (ст. 15 GDPR) — отримати інформацію про те, які ваші дані ми обробляємо;
— Право на виправлення (ст. 16 GDPR) — виправити неточні дані;
— Право на видалення (ст. 17 GDPR) — вимагати повного видалення ваших даних;
— Право на обмеження обробки (ст. 18 GDPR) — обмежити обробку ваших даних;
— Право на перенесення (ст. 20 GDPR) — отримати ваші дані у структурованому форматі;
— Право на заперечення (ст. 21 GDPR) — заперечити проти обробки на підставі законного інтересу;
— Право на відкликання згоди — в будь-який час без впливу на законність обробки до відкликання.

Для реалізації цих прав:
— Експорт даних: Профіль → Privacy & Data → Export;
— Видалення акаунту: Профіль → Privacy & Data → Delete;
— Інші запити: info@legal.org.ua.

Ми відповідаємо на запити протягом 30 днів.

Ви також маєте право подати скаргу до Уповноваженого Верховної Ради з прав людини (Україна) або до наглядового органу у вашій країні ЄС.`,
      },
      {
        heading: '9. Файли cookie',
        content: `Сервіс використовує:
— необхідні cookie — для автентифікації та підтримки сесії (JWT-токени);
— функціональні cookie — для збереження мовних налаштувань та преференцій інтерфейсу.

Ми НЕ використовуємо рекламні або аналітичні cookie третіх сторін. Ми НЕ відстежуємо користувачів на інших веб-сайтах.`,
      },
      {
        heading: '10. Захист даних дітей',
        content: `Сервіс не призначений для осіб молодших за 18 років. Ми свідомо не збираємо персональні дані неповнолітніх. Якщо ви вважаєте, що неповнолітня особа надала нам свої дані, зв'яжіться з нами для їх видалення.`,
      },
      {
        heading: '11. Зміни до Політики',
        content: `Ми можемо оновлювати цю Політику конфіденційності. Про суттєві зміни ми повідомляємо:
— через email, зареєстрований в обліковому записі;
— через повідомлення в інтерфейсі Сервісу;
— не менше ніж за 14 днів до набуття чинності.

Продовження використання Сервісу після змін означає прийняття оновленої Політики.`,
      },
      {
        heading: '12. Контактна інформація',
        content: `З питань захисту персональних даних звертайтеся:

ТОВ «Лекс ЕйАй»
ЄДРПОУ: 46011385
Адреса: 04132, Україна, м. Київ, 47-Садова, 1а
Email: info@legal.org.ua
Веб-сайт: https://legal.org.ua`,
      },
    ],
  },
  en: {
    title: 'PRIVACY POLICY',
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
Email: info@legal.org.ua
Data Protection Contact: info@legal.org.ua`,
      },
      {
        heading: '1. Introduction',
        content: `This Privacy Policy describes how LLC "Lex AI" (hereinafter — "Company", "we") collects, processes, stores, and protects personal data of users of the LEX AI service (hereinafter — "Service").

The Company processes personal data in accordance with:
— the Law of Ukraine "On Personal Data Protection" (No. 2297-VI);
— the General Data Protection Regulation (GDPR, Regulation 2016/679) — for EU/EEA users;
— other applicable regulations.

By using the Service, you confirm that you have read this Policy and consent to the processing of your personal data as described below.`,
      },
      {
        heading: '2. Data We Collect',
        content: `2.1. Data you provide directly:
— name, surname, email (during registration);
— profile photo (when authorizing via Google or Diia);
— documents you upload for AI analysis;
— text queries to the AI system;
— comments on blog articles.

2.2. Data collected automatically:
— IP address and approximate geolocation;
— browser type and operating system;
— session time and duration;
— actions within the Service interface (pages viewed, tools used);
— API usage (number of requests, tool types).

2.3. Data from third parties:
— Google profile (name, email, photo) — when authorizing via Google OAuth;
— Diia.Signature data (full name, tax ID) — when authorizing via Diia;
— payment information from Monobank (transaction status, without card number).`,
      },
      {
        heading: '3. Purposes of Data Processing',
        content: `We process personal data for the following purposes:

3.1. Service provision:
— creating and managing user accounts;
— performing AI analysis of uploaded documents;
— semantic search and retrieval of legal information;
— storing documents in the secure vault.

3.2. Security and quality:
— protection against unauthorized access;
— monitoring service quality and performance;
— detecting and preventing abuse.

3.3. Communication:
— sending service notifications (registration confirmation, password reset);
— notifying about changes to Terms or Policy.

3.4. Legal obligations:
— compliance with legal requirements;
— accounting records (payment data).`,
      },
      {
        heading: '4. Legal Basis for Processing (GDPR)',
        content: `For EU/EEA users, we process data based on:
— Consent (Art. 6(1)(a) GDPR) — for optional features and marketing;
— Performance of contract (Art. 6(1)(b) GDPR) — for providing the Service;
— Legitimate interest (Art. 6(1)(f) GDPR) — for security and Service improvement;
— Legal obligation (Art. 6(1)(c) GDPR) — for compliance with legal requirements.`,
      },
      {
        heading: '5. Document Processing via AI (OpenAI)',
        content: `IMPORTANT: When using AI analysis, the content of your documents and queries is transmitted to the OpenAI API for processing.

Terms of data processing through OpenAI:
— OpenAI acts as a sub-processor and processes data solely according to our instructions;
— OpenAI does NOT use API data for training its models (by default since March 1, 2023);
— data is retained by OpenAI for up to 30 days solely for abuse monitoring, after which it is deleted;
— processing is governed by a Data Processing Addendum (DPA) between the Company and OpenAI;
— OpenAI holds SOC 2 Type 2 certification.

Recommendations for users:
— do not upload documents with particularly sensitive personal data (medical, financial) unless necessary for analysis;
— anonymize documents before uploading when possible;
— contact us if you require additional safeguards for processing sensitive data.`,
      },
      {
        heading: '6. Data Storage and Security',
        content: `6.1. Where data is stored:
— user accounts and metadata — PostgreSQL (encrypted connections);
— documents — MinIO (S3-compatible storage with encryption);
— vector embeddings — Qdrant (for semantic search);
— session cache — Redis (temporary storage).

6.2. Security measures:
— data encryption in transit (TLS 1.2+);
— JWT token authentication;
— role-based access control;
— audit log with hash chain for access tracking;
— data isolation between clients (matter segregation);
— regular backups.

6.3. Retention periods:
— account data — duration of the account + 30 days after deletion;
— uploaded documents — duration of the account, deleted upon request;
— usage logs — 90 days;
— payment data — 5 years (legal requirement);
— AI query data — 30 days (OpenAI abuse monitoring).`,
      },
      {
        heading: '7. Data Sharing with Third Parties',
        content: `We share personal data exclusively with the following categories of recipients:

7.1. Sub-processors:
— OpenAI, LP (USA) — AI analysis of documents and queries;
— Monobank / JSC "Universal Bank" (Ukraine) — payment processing;
— Cloudflare, Inc. (USA) — CDN and DDoS protection;
— Hetzner Online GmbH (Germany) — server hosting.

7.2. Government authorities:
— upon court order or lawful request in accordance with Ukrainian law.

We do NOT sell or share personal data for third-party marketing purposes.

For data transfers outside the EU/EEA, we use Standard Contractual Clauses (SCCs) pursuant to European Commission decisions.`,
      },
      {
        heading: '8. Your Rights',
        content: `Under applicable law and the GDPR, you have the following rights:

— Right of access (Art. 15 GDPR) — obtain information about what data we process;
— Right to rectification (Art. 16 GDPR) — correct inaccurate data;
— Right to erasure (Art. 17 GDPR) — request complete deletion of your data;
— Right to restriction (Art. 18 GDPR) — restrict processing of your data;
— Right to data portability (Art. 20 GDPR) — receive your data in a structured format;
— Right to object (Art. 21 GDPR) — object to processing based on legitimate interest;
— Right to withdraw consent — at any time without affecting the lawfulness of prior processing.

To exercise these rights:
— Data export: Profile → Privacy & Data → Export;
— Account deletion: Profile → Privacy & Data → Delete;
— Other requests: info@legal.org.ua.

We respond to requests within 30 days.

You also have the right to lodge a complaint with the Ukrainian Parliament Commissioner for Human Rights (Ukraine) or the supervisory authority in your EU country.`,
      },
      {
        heading: '9. Cookies',
        content: `The Service uses:
— essential cookies — for authentication and session support (JWT tokens);
— functional cookies — for storing language settings and interface preferences.

We do NOT use third-party advertising or analytics cookies. We do NOT track users across other websites.`,
      },
      {
        heading: '10. Children\'s Data Protection',
        content: `The Service is not intended for persons under the age of 18. We do not knowingly collect personal data from minors. If you believe a minor has provided us with their data, please contact us for its deletion.`,
      },
      {
        heading: '11. Changes to This Policy',
        content: `We may update this Privacy Policy. We will notify you of material changes:
— via the email registered with your account;
— through notifications in the Service interface;
— at least 14 days before the changes take effect.

Continued use of the Service after changes constitutes acceptance of the updated Policy.`,
      },
      {
        heading: '12. Contact Information',
        content: `For data protection inquiries, please contact:

LLC "Lex AI"
EDRPOU: 46011385
Address: 04132, Ukraine, Kyiv, 47-Sadova, 1a
Email: info@legal.org.ua
Website: https://legal.org.ua`,
      },
    ],
  },
};

export function PrivacyPolicyPage() {
  const { lang } = useParams<{ lang: string }>();
  const navigate = useNavigate();

  const currentLang = lang === 'uk' || lang === 'en' ? lang : 'uk';
  const content = privacyContent[currentLang];

  const handleSwitchLang = () => {
    navigate(`/${content.switchTo}/privacy`, { replace: true });
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
              <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center">
                <Shield size={28} className="text-green-600" />
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
