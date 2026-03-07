/**
 * Data Processing Agreement (DPA) Page
 * Bilingual (UK/EN) with {lang} parameter: /uk/dpa or /en/dpa
 */

import { useParams, useNavigate } from 'react-router-dom';
import { ShieldCheck, ArrowLeft, Globe } from 'lucide-react';

const dpaContent = {
  uk: {
    title: 'УГОДА ПРО ОБРОБКУ ДАНИХ',
    subtitle: 'Data Processing Agreement (DPA)',
    lastUpdated: 'Останнє оновлення: 8 березня 2026 р.',
    backLabel: 'Назад',
    switchLang: 'English',
    switchTo: 'en',
    sections: [
      {
        heading: '',
        content: `Ця Угода про обробку даних («DPA») є невід'ємною частиною Умов використання сервісу LEX AI («Основний договір») між:

Обробником:
Товариство з обмеженою відповідальністю «Лекс ЕйАй»
Код ЄДРПОУ: 46011385
Місцезнаходження: 04132, Україна, м. Київ, 47-Садова, 1а
Email: info@legal.org.ua
(далі — «Обробник», «Компанія», «LEX AI»)

та

Контролером:
Користувач або організація, яка використовує Сервіс LEX AI
(далі — «Контролер», «Клієнт»)

Ця DPA набуває чинності з моменту прийняття Клієнтом Умов використання Сервісу.`,
      },
      {
        heading: '1. Визначення',
        content: `«Персональні дані» — будь-яка інформація, що стосується ідентифікованої або ідентифікованої фізичної особи, відповідно до ст. 4(1) GDPR та Закону України «Про захист персональних даних».

«Обробка» — будь-яка операція з Персональними даними: збирання, запис, організація, зберігання, адаптація, зміна, витяг, перегляд, використання, розкриття, поширення, узгодження, обмеження, стирання або знищення.

«Дані Клієнта» — Персональні дані, які Клієнт завантажує, передає або іншим чином надає через Сервіс, включаючи документи для AI-аналізу, текстові запити та метадані.

«Субобробник» — третя сторона, яка обробляє Дані Клієнта від імені Обробника.

«Порушення безпеки» — випадкове або незаконне знищення, втрата, зміна, несанкціоноване розкриття або доступ до Даних Клієнта.

«Стандартні договірні умови» (SCC) — стандартні договірні умови для передачі персональних даних, затверджені Європейською Комісією (Рішення 2021/914).

«Застосовне законодавство про захист даних» — GDPR, Закон України «Про захист персональних даних» та інші застосовні нормативні акти.`,
      },
      {
        heading: '2. Ролі та відповідальність',
        content: `2.1. Клієнт є Контролером даних — він визначає цілі та засоби обробки Персональних даних.

2.2. Компанія є Обробником даних — вона обробляє Дані Клієнта виключно за задокументованими інструкціями Контролера та для цілей надання Сервісу.

2.3. Якщо Клієнт сам є обробником (діє від імені свого клієнта), Компанія виступає як Субобробник. У цьому випадку застосовується Модуль 3 (Обробник → Субобробник) SCC.

2.4. Компанія не визначає самостійно цілі обробки Даних Клієнта та не використовує їх для власних цілей, крім випадків, передбачених цією DPA.`,
      },
      {
        heading: '3. Предмет та обсяг обробки',
        content: `3.1. Предмет: обробка Даних Клієнта з метою надання послуг AI-аналізу юридичних документів, семантичного пошуку, зберігання документів та пов'язаних функцій Сервісу.

3.2. Категорії суб'єктів даних:
— клієнти та контрагенти Клієнта, згадані в документах;
— сторони судових справ;
— фізичні особи, зазначені в юридичних документах.

3.3. Типи персональних даних:
— ідентифікаційні дані (ПІБ, ІПН/РНОКПП, паспортні дані);
— контактні дані (адреси, телефони, email);
— юридичні дані (дані судових справ, договорів, правочинів);
— фінансові дані (якщо містяться в завантажених документах).

3.4. Тривалість обробки: протягом строку дії Основного договору + 30 днів після його припинення для видалення даних.`,
      },
      {
        heading: '4. Інструкції Контролера',
        content: `4.1. Обробник обробляє Дані Клієнта виключно відповідно до задокументованих інструкцій Контролера, які включають:
— завантаження документів для AI-аналізу;
— виконання пошукових запитів;
— зберігання документів у сховищі (vault);
— використання MCP-інструментів через API або веб-інтерфейс.

4.2. Використання Сервісу Клієнтом становить задокументовані інструкції щодо обробки.

4.3. Обробник негайно повідомить Контролера, якщо, на його думку, інструкція порушує Застосовне законодавство про захист даних.

4.4. Обробник не обробляє Дані Клієнта для цілей, не передбачених інструкціями Контролера, за винятком випадків, коли це вимагається законодавством. У такому випадку Обробник повідомить Контролера до початку обробки, якщо це не заборонено законом.`,
      },
      {
        heading: '5. Конфіденційність',
        content: `5.1. Обробник забезпечує, що особи, уповноважені обробляти Дані Клієнта:
— прийняли на себе зобов'язання щодо конфіденційності або пов'язані відповідним законодавчим зобов'язанням;
— обробляють дані виключно за інструкціями Контролера.

5.2. Обробник обмежує доступ до Даних Клієнта тільки тими працівниками, яким доступ необхідний для виконання зобов'язань за цією DPA.`,
      },
      {
        heading: '6. Безпека обробки',
        content: `6.1. Обробник впроваджує та підтримує відповідні технічні та організаційні заходи для забезпечення рівня безпеки, що відповідає ризику (ст. 32 GDPR):

Технічні заходи:
— шифрування даних при передачі (TLS 1.2+);
— шифрування даних у стані спокою (PostgreSQL, MinIO);
— автентифікація через JWT-токени з обмеженим терміном дії;
— рольовий контроль доступу (RBAC);
— ізоляція даних між клієнтами (matter segregation);
— аудит-лог з хеш-ланцюгом для забезпечення цілісності;
— автоматичне сканування на вразливості.

Організаційні заходи:
— принципи privacy by design та privacy by default;
— політика мінімізації даних;
— регулярне резервне копіювання з тестуванням відновлення;
— процедури реагування на інциденти безпеки;
— навчання персоналу з питань захисту даних.

6.2. Обробник регулярно тестує та оцінює ефективність цих заходів.`,
      },
      {
        heading: '7. Субобробники',
        content: `7.1. Контролер надає загальну попередню згоду на залучення Субобробників. Перелік затверджених Субобробників:

| Субобробник | Юрисдикція | Функція | Механізм передачі |
|---|---|---|---|
| OpenAI, LP | США | AI-аналіз документів та запитів | SCC + DPA |
| Monobank (АТ «Універсал Банк») | Україна | Обробка платежів | Національне законодавство |
| Cloudflare, Inc. | США | CDN, DDoS-захист, SSL | SCC |
| Hetzner Online GmbH | Німеччина | Хостинг серверів | Адекватність (ЄС) |

7.2. Обробник повідомить Контролера про будь-яке додавання або заміну Субобробника не менше ніж за 14 днів до початку обробки. Контролер має право заперечити протягом 14 днів з моменту повідомлення.

7.3. Обробник укладає з кожним Субобробником угоду, яка забезпечує рівень захисту не нижчий, ніж передбачений цією DPA.

7.4. Обробник несе повну відповідальність за дії та бездіяльність своїх Субобробників.

7.5. Особливості обробки через OpenAI:
— OpenAI НЕ використовує дані API для тренування моделей;
— дані зберігаються до 30 днів для моніторингу зловживань;
— обробка регулюється окремою DPA між Компанією та OpenAI;
— OpenAI має сертифікацію SOC 2 Type 2.`,
      },
      {
        heading: '8. Міжнародна передача даних',
        content: `8.1. Дані Клієнта можуть передаватися до наступних юрисдикцій:
— Німеччина (Hetzner) — рішення про адекватність ЄС;
— США (OpenAI, Cloudflare) — Стандартні договірні умови (SCC).

8.2. При передачі до третіх країн без рішення про адекватність Обробник забезпечує:
— укладення SCC (Рішення Комісії 2021/914);
— проведення оцінки впливу на передачу (Transfer Impact Assessment);
— впровадження додаткових заходів захисту, якщо необхідно.

8.3. Обробник надає Контролеру копію відповідних SCC на запит.`,
      },
      {
        heading: '9. Права суб\'єктів даних',
        content: `9.1. Обробник сприяє Контролеру у виконанні запитів суб'єктів даних щодо:
— права на доступ (ст. 15 GDPR);
— права на виправлення (ст. 16 GDPR);
— права на видалення (ст. 17 GDPR);
— права на обмеження обробки (ст. 18 GDPR);
— права на перенесення даних (ст. 20 GDPR);
— права на заперечення (ст. 21 GDPR).

9.2. Якщо Обробник отримає запит безпосередньо від суб'єкта даних, він негайно перенаправить його Контролеру, якщо інше не вимагається законодавством.

9.3. Технічні засоби реалізації:
— експорт даних користувача (Профіль → Privacy & Data → Export);
— видалення облікового запису (Профіль → Privacy & Data → Delete);
— API-запити через info@legal.org.ua.`,
      },
      {
        heading: '10. Повідомлення про порушення безпеки',
        content: `10.1. Обробник повідомить Контролера про Порушення безпеки без невиправданої затримки, але не пізніше ніж через 48 годин після виявлення.

10.2. Повідомлення містить:
— опис характеру порушення;
— категорії та приблизну кількість постраждалих суб'єктів даних;
— ім'я та контактні дані відповідальної особи;
— опис можливих наслідків;
— вжиті або запропоновані заходи для усунення порушення.

10.3. Обробник надає Контролеру достатню інформацію для виконання його зобов'язань щодо повідомлення наглядового органу (ст. 33 GDPR) та суб'єктів даних (ст. 34 GDPR).

10.4. Обробник документує всі Порушення безпеки, включаючи факти, наслідки та вжиті заходи.`,
      },
      {
        heading: '11. Оцінка впливу на захист даних (DPIA)',
        content: `11.1. Обробник сприяє Контролеру у проведенні оцінки впливу на захист даних (ст. 35 GDPR) та попередніх консультацій з наглядовим органом (ст. 36 GDPR), надаючи необхідну інформацію про заходи безпеки та характер обробки.`,
      },
      {
        heading: '12. Аудит',
        content: `12.1. Обробник надає Контролеру всю інформацію, необхідну для демонстрації виконання зобов'язань за цією DPA.

12.2. Обробник дозволяє та сприяє проведенню аудитів та перевірок Контролером або уповноваженим аудитором:
— з попереднім повідомленням не менше ніж за 30 днів;
— не частіше одного разу на рік (крім випадків Порушення безпеки);
— за умови дотримання зобов'язань щодо конфіденційності;
— у робочий час та без істотного порушення роботи Обробника.

12.3. Якщо аудит вимагає доступу до даних інших клієнтів, Обробник може запропонувати альтернативні заходи підтвердження (звіти SOC 2, сертифікати).`,
      },
      {
        heading: '13. Видалення та повернення даних',
        content: `13.1. Після припинення Основного договору Обробник, за вибором Контролера:
— повертає всі Дані Клієнта у стандартному машиночитаному форматі (JSON); або
— видаляє всі Дані Клієнта та наявні копії.

13.2. Видалення здійснюється протягом 30 днів після припинення договору.

13.3. Обробник може зберігати копії даних тільки якщо це вимагається Застосовним законодавством, з повідомленням Контролера про підстави та обсяг збереження.

13.4. Дані, передані Субобробникам, видаляються відповідно до умов угод із Субобробниками:
— OpenAI: автоматичне видалення через 30 днів;
— Cloudflare: видалення з кешу протягом 72 годин.`,
      },
      {
        heading: '14. Відповідальність',
        content: `14.1. Кожна сторона несе відповідальність за порушення цієї DPA відповідно до Застосовного законодавства про захист даних та Основного договору.

14.2. Обробник відшкодовує Контролеру прямі збитки, завдані порушенням цієї DPA, у межах, визначених Основним договором.

14.3. Обмеження відповідальності, встановлені Основним договором, застосовуються до цієї DPA, за винятком випадків, коли таке обмеження суперечить Застосовному законодавству про захист даних.`,
      },
      {
        heading: '15. Строк дії та зміни',
        content: `15.1. Ця DPA діє протягом строку дії Основного договору та автоматично припиняється разом з ним.

15.2. Зобов'язання щодо конфіденційності та видалення даних залишаються чинними після припинення DPA.

15.3. Обробник може оновлювати цю DPA для відображення змін у законодавстві або практиці обробки. Про суттєві зміни Контролер буде повідомлений за 14 днів.`,
      },
      {
        heading: '16. Застосовне право',
        content: `16.1. Ця DPA регулюється законодавством України.

16.2. Для Контролерів з ЄС/ЄЕЗ також застосовується GDPR. У разі протиріччя між цією DPA та GDPR, положення GDPR мають пріоритет.

16.3. Спори вирішуються відповідно до процедури, визначеної Основним договором.`,
      },
      {
        heading: '17. Контактна інформація',
        content: `З питань обробки даних та цієї DPA:

ТОВ «Лекс ЕйАй»
ЄДРПОУ: 46011385
Адреса: 04132, Україна, м. Київ, 47-Садова, 1а
Email: info@legal.org.ua
Веб-сайт: https://legal.org.ua`,
      },
      {
        heading: 'Додаток A. Стандартні договірні умови (SCC)',
        content: `Для передачі Даних Клієнта до третіх країн без рішення про адекватність, сторони погоджуються з застосуванням Стандартних договірних умов, затверджених Рішенням Європейської Комісії 2021/914 від 4 червня 2021 року.

Застосовуються:
— Модуль 2 (Контролер → Обробник): коли Клієнт є Контролером;
— Модуль 3 (Обробник → Субобробник): коли Клієнт є Обробником.

Повний текст SCC: https://eur-lex.europa.eu/eli/dec_impl/2021/914/oj`,
      },
    ],
  },
  en: {
    title: 'DATA PROCESSING AGREEMENT',
    subtitle: 'DPA — LEX AI Platform',
    lastUpdated: 'Last updated: March 8, 2026',
    backLabel: 'Back',
    switchLang: 'Українська',
    switchTo: 'uk',
    sections: [
      {
        heading: '',
        content: `This Data Processing Agreement ("DPA") is an integral part of the Terms of Service of the LEX AI platform ("Main Agreement") between:

Processor:
Limited Liability Company "Lex AI"
EDRPOU Code: 46011385
Address: 04132, Ukraine, Kyiv, 47-Sadova, 1a
Email: info@legal.org.ua
(hereinafter — "Processor", "Company", "LEX AI")

and

Controller:
The user or organization using the LEX AI Service
(hereinafter — "Controller", "Client")

This DPA becomes effective upon the Client's acceptance of the Service Terms of Use.`,
      },
      {
        heading: '1. Definitions',
        content: `"Personal Data" — any information relating to an identified or identifiable natural person, as defined in Art. 4(1) GDPR and the Law of Ukraine "On Personal Data Protection."

"Processing" — any operation performed on Personal Data: collection, recording, organization, storage, adaptation, alteration, retrieval, consultation, use, disclosure, dissemination, alignment, restriction, erasure, or destruction.

"Client Data" — Personal Data that the Client uploads, transmits, or otherwise provides through the Service, including documents for AI analysis, text queries, and metadata.

"Sub-processor" — a third party that processes Client Data on behalf of the Processor.

"Security Breach" — accidental or unlawful destruction, loss, alteration, unauthorized disclosure of, or access to Client Data.

"Standard Contractual Clauses" (SCCs) — standard contractual clauses for the transfer of personal data approved by the European Commission (Decision 2021/914).

"Applicable Data Protection Law" — GDPR, the Law of Ukraine "On Personal Data Protection," and other applicable regulations.`,
      },
      {
        heading: '2. Roles and Responsibilities',
        content: `2.1. The Client is the Data Controller — it determines the purposes and means of processing Personal Data.

2.2. The Company is the Data Processor — it processes Client Data solely based on the Controller's documented instructions and for the purpose of providing the Service.

2.3. If the Client is itself a processor (acting on behalf of its own client), the Company acts as a Sub-processor. In this case, Module 3 (Processor → Sub-processor) of the SCCs applies.

2.4. The Company does not independently determine the purposes of processing Client Data and does not use it for its own purposes, except as provided in this DPA.`,
      },
      {
        heading: '3. Subject Matter and Scope of Processing',
        content: `3.1. Subject matter: processing of Client Data for the purpose of providing AI analysis of legal documents, semantic search, document storage, and related Service functions.

3.2. Categories of data subjects:
— clients and counterparties of the Client mentioned in documents;
— parties to legal proceedings;
— natural persons referenced in legal documents.

3.3. Types of personal data:
— identification data (full name, tax ID, passport details);
— contact data (addresses, phone numbers, email);
— legal data (court case data, contracts, transactions);
— financial data (if contained in uploaded documents).

3.4. Duration of processing: for the term of the Main Agreement + 30 days after its termination for data deletion.`,
      },
      {
        heading: '4. Controller\'s Instructions',
        content: `4.1. The Processor processes Client Data solely in accordance with the Controller's documented instructions, which include:
— uploading documents for AI analysis;
— executing search queries;
— storing documents in the vault;
— using MCP tools via API or web interface.

4.2. The Client's use of the Service constitutes documented instructions for processing.

4.3. The Processor shall immediately inform the Controller if, in its opinion, an instruction violates Applicable Data Protection Law.

4.4. The Processor shall not process Client Data for purposes not covered by the Controller's instructions, except where required by law. In such cases, the Processor shall inform the Controller before processing, unless prohibited by law.`,
      },
      {
        heading: '5. Confidentiality',
        content: `5.1. The Processor ensures that persons authorized to process Client Data:
— have committed themselves to confidentiality or are under an appropriate statutory obligation;
— process data solely in accordance with the Controller's instructions.

5.2. The Processor limits access to Client Data to only those employees who require access to fulfill obligations under this DPA.`,
      },
      {
        heading: '6. Security of Processing',
        content: `6.1. The Processor implements and maintains appropriate technical and organizational measures to ensure a level of security appropriate to the risk (Art. 32 GDPR):

Technical measures:
— data encryption in transit (TLS 1.2+);
— data encryption at rest (PostgreSQL, MinIO);
— JWT token authentication with limited validity;
— role-based access control (RBAC);
— data isolation between clients (matter segregation);
— audit log with hash chain for integrity assurance;
— automated vulnerability scanning.

Organizational measures:
— privacy by design and privacy by default principles;
— data minimization policy;
— regular backups with recovery testing;
— security incident response procedures;
— staff training on data protection.

6.2. The Processor regularly tests and evaluates the effectiveness of these measures.`,
      },
      {
        heading: '7. Sub-processors',
        content: `7.1. The Controller grants general prior authorization for the engagement of Sub-processors. List of approved Sub-processors:

| Sub-processor | Jurisdiction | Function | Transfer mechanism |
|---|---|---|---|
| OpenAI, LP | USA | AI analysis of documents and queries | SCCs + DPA |
| Monobank (JSC "Universal Bank") | Ukraine | Payment processing | National law |
| Cloudflare, Inc. | USA | CDN, DDoS protection, SSL | SCCs |
| Hetzner Online GmbH | Germany | Server hosting | Adequacy (EU) |

7.2. The Processor shall notify the Controller of any addition or replacement of a Sub-processor at least 14 days before processing begins. The Controller has the right to object within 14 days of notification.

7.3. The Processor enters into an agreement with each Sub-processor that provides a level of protection no less than that provided in this DPA.

7.4. The Processor bears full responsibility for the acts and omissions of its Sub-processors.

7.5. Specifics of processing through OpenAI:
— OpenAI does NOT use API data for model training;
— data is retained for up to 30 days for abuse monitoring;
— processing is governed by a separate DPA between the Company and OpenAI;
— OpenAI holds SOC 2 Type 2 certification.`,
      },
      {
        heading: '8. International Data Transfers',
        content: `8.1. Client Data may be transferred to the following jurisdictions:
— Germany (Hetzner) — EU adequacy decision;
— USA (OpenAI, Cloudflare) — Standard Contractual Clauses (SCCs).

8.2. For transfers to third countries without an adequacy decision, the Processor ensures:
— execution of SCCs (Commission Decision 2021/914);
— conducting a Transfer Impact Assessment;
— implementing supplementary measures if necessary.

8.3. The Processor provides the Controller with a copy of the relevant SCCs upon request.`,
      },
      {
        heading: '9. Data Subject Rights',
        content: `9.1. The Processor assists the Controller in fulfilling data subject requests regarding:
— right of access (Art. 15 GDPR);
— right to rectification (Art. 16 GDPR);
— right to erasure (Art. 17 GDPR);
— right to restriction of processing (Art. 18 GDPR);
— right to data portability (Art. 20 GDPR);
— right to object (Art. 21 GDPR).

9.2. If the Processor receives a request directly from a data subject, it shall promptly redirect it to the Controller, unless otherwise required by law.

9.3. Technical means of implementation:
— user data export (Profile → Privacy & Data → Export);
— account deletion (Profile → Privacy & Data → Delete);
— API requests via info@legal.org.ua.`,
      },
      {
        heading: '10. Security Breach Notification',
        content: `10.1. The Processor shall notify the Controller of a Security Breach without undue delay, but no later than 48 hours after discovery.

10.2. The notification shall include:
— a description of the nature of the breach;
— the categories and approximate number of affected data subjects;
— the name and contact details of the responsible person;
— a description of the likely consequences;
— measures taken or proposed to address the breach.

10.3. The Processor shall provide the Controller with sufficient information to fulfill its obligations regarding notification of the supervisory authority (Art. 33 GDPR) and data subjects (Art. 34 GDPR).

10.4. The Processor shall document all Security Breaches, including the facts, effects, and remedial actions taken.`,
      },
      {
        heading: '11. Data Protection Impact Assessment (DPIA)',
        content: `11.1. The Processor assists the Controller in conducting data protection impact assessments (Art. 35 GDPR) and prior consultations with the supervisory authority (Art. 36 GDPR) by providing necessary information about security measures and the nature of processing.`,
      },
      {
        heading: '12. Audit',
        content: `12.1. The Processor makes available to the Controller all information necessary to demonstrate compliance with obligations under this DPA.

12.2. The Processor permits and contributes to audits and inspections by the Controller or an authorized auditor:
— with prior notice of at least 30 days;
— no more than once per year (except in case of a Security Breach);
— subject to confidentiality obligations;
— during business hours and without material disruption to the Processor's operations.

12.3. If an audit requires access to other clients' data, the Processor may propose alternative verification measures (SOC 2 reports, certificates).`,
      },
      {
        heading: '13. Deletion and Return of Data',
        content: `13.1. Upon termination of the Main Agreement, the Processor shall, at the Controller's choice:
— return all Client Data in a standard machine-readable format (JSON); or
— delete all Client Data and existing copies.

13.2. Deletion shall be completed within 30 days of agreement termination.

13.3. The Processor may retain copies of data only if required by Applicable Law, with notification to the Controller of the grounds and scope of retention.

13.4. Data transferred to Sub-processors is deleted according to the terms of agreements with Sub-processors:
— OpenAI: automatic deletion after 30 days;
— Cloudflare: cache deletion within 72 hours.`,
      },
      {
        heading: '14. Liability',
        content: `14.1. Each party is liable for breaches of this DPA in accordance with Applicable Data Protection Law and the Main Agreement.

14.2. The Processor shall indemnify the Controller for direct damages caused by breach of this DPA, within the limits defined in the Main Agreement.

14.3. Limitations of liability established in the Main Agreement apply to this DPA, except where such limitation contradicts Applicable Data Protection Law.`,
      },
      {
        heading: '15. Term and Amendments',
        content: `15.1. This DPA is effective for the term of the Main Agreement and automatically terminates together with it.

15.2. Obligations regarding confidentiality and data deletion survive termination of this DPA.

15.3. The Processor may update this DPA to reflect changes in legislation or processing practices. The Controller will be notified of material changes 14 days in advance.`,
      },
      {
        heading: '16. Governing Law',
        content: `16.1. This DPA is governed by the laws of Ukraine.

16.2. For Controllers within the EU/EEA, the GDPR also applies. In case of conflict between this DPA and the GDPR, the provisions of the GDPR shall prevail.

16.3. Disputes shall be resolved in accordance with the procedure defined in the Main Agreement.`,
      },
      {
        heading: '17. Contact Information',
        content: `For data processing and DPA inquiries:

LLC "Lex AI"
EDRPOU: 46011385
Address: 04132, Ukraine, Kyiv, 47-Sadova, 1a
Email: info@legal.org.ua
Website: https://legal.org.ua`,
      },
      {
        heading: 'Annex A. Standard Contractual Clauses (SCCs)',
        content: `For the transfer of Client Data to third countries without an adequacy decision, the parties agree to the application of Standard Contractual Clauses approved by European Commission Decision 2021/914 of June 4, 2021.

Applicable modules:
— Module 2 (Controller → Processor): when the Client is a Controller;
— Module 3 (Processor → Sub-processor): when the Client is a Processor.

Full text of the SCCs: https://eur-lex.europa.eu/eli/dec_impl/2021/914/oj`,
      },
    ],
  },
};

export function DpaPage() {
  const { lang } = useParams<{ lang: string }>();
  const navigate = useNavigate();

  const currentLang = lang === 'uk' || lang === 'en' ? lang : 'uk';
  const content = dpaContent[currentLang];

  const handleSwitchLang = () => {
    navigate(`/${content.switchTo}/dpa`, { replace: true });
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
              <div className="w-14 h-14 bg-indigo-100 rounded-full flex items-center justify-center">
                <ShieldCheck size={28} className="text-indigo-600" />
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
