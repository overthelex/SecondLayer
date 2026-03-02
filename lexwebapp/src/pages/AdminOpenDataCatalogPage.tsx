/**
 * Admin OpenData Catalog Page
 * Comprehensive catalog of ALL known open data sources from the OpenData project.
 * Each source shows integration status, dataset counts, formats, and linked Linear tasks.
 */

import { useState } from 'react';
import {
  ExternalLink, Search, ChevronDown, ChevronUp,
  Scale, BookOpen, Building2, Database, Landmark, Shield,
  CheckCircle2, Clock, Microscope, CalendarClock,
  FileSpreadsheet, Globe, Code, FileText, Link2, HardDrive, Timer,
} from 'lucide-react';

type IntegrationStatus = 'integrated' | 'in_progress' | 'researched' | 'planned';

interface DataLink {
  label: string;
  url: string;
}

interface OpenDataSource {
  name: string;
  nameUa: string;
  url: string;
  description: string;
  status: IntegrationStatus;
  datasets?: string;
  records?: string;
  formats: string[];
  license?: string;
  linearTasks: string[];
  notes?: string;
  apiAvailable?: boolean;
  updateFrequency?: string;
  dataUrls?: DataLink[];
  volume?: string;
  integrationEta?: string;
}

interface SourceDomain {
  title: string;
  icon: React.ReactNode;
  sources: OpenDataSource[];
}

const STATUS_CONFIG: Record<IntegrationStatus, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  integrated: { label: 'Інтегровано', color: 'text-green-700', bg: 'bg-green-50 border-green-200', icon: <CheckCircle2 size={12} /> },
  in_progress: { label: 'В роботі', color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200', icon: <Clock size={12} /> },
  researched: { label: 'Досліджено', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200', icon: <Microscope size={12} /> },
  planned: { label: 'Заплановано', color: 'text-gray-600', bg: 'bg-gray-50 border-gray-200', icon: <CalendarClock size={12} /> },
};

const FORMAT_ICONS: Record<string, React.ReactNode> = {
  'CSV': <FileSpreadsheet size={11} />,
  'XLS': <FileSpreadsheet size={11} />,
  'XLSX': <FileSpreadsheet size={11} />,
  'XML': <Code size={11} />,
  'JSON': <Code size={11} />,
  'API': <Globe size={11} />,
  'HTML': <FileText size={11} />,
  'ZIP': <Database size={11} />,
};

const domains: SourceDomain[] = [
  {
    title: 'Судові рішення та реєстри',
    icon: <Scale className="w-5 h-5" />,
    sources: [
      {
        name: 'EDRSR Bulk Dumps (data.gov.ua)',
        nameUa: 'ЄДРСР — щоденні дампи на data.gov.ua',
        url: 'https://data.gov.ua/dataset/d9ad7a57-96ab-4e42-b8bc-3b9dbb949e13',
        description: 'Повні щоденні вивантаження Єдиного державного реєстру судових рішень. Безкоштовна альтернатива ZakonOnline API з ліцензією CC BY 4.0.',
        status: 'integrated',
        records: '8,805,306 документів (2025)',
        formats: ['CSV', 'ZIP'],
        license: 'CC BY 4.0',
        linearTasks: ['LEG-210', 'LEG-212'],
        updateFrequency: 'Щоденно',
        notes: 'Імпорт метаданих завершено на проді. Довідники: 843 суди, 4106 категорій, 5 видів судочинства.',
        dataUrls: [
          { label: 'Набір даних (CSV/ZIP)', url: 'https://data.gov.ua/dataset/d9ad7a57-96ab-4e42-b8bc-3b9dbb949e13' },
        ],
        volume: '~50 GB (щоденні ZIP-дампи CSV, 8.8M записів)',
      },
      {
        name: 'Court Decisions Registry',
        nameUa: 'Реєстр судових рішень (reyestr.court.gov.ua)',
        url: 'https://reyestr.court.gov.ua/',
        description: 'Єдиний державний реєстр судових рішень — повнотекстовий пошук усіх рішень з 2006 року. Playwright scraper з checkpoint/resume та anti-detection.',
        status: 'integrated',
        records: '100M+ рішень',
        formats: ['HTML'],
        linearTasks: ['LEG-91', 'LEG-53', 'LEG-76'],
        notes: 'Document-service offload, semaphore (max 10), rate limiter (200ms). Admin control panel для управління скрапером.',
        dataUrls: [
          { label: 'Пошук рішень', url: 'https://reyestr.court.gov.ua/' },
        ],
        volume: '100M+ рішень, ~500 GB повних текстів (HTML)',
      },
      {
        name: 'Court Statistics',
        nameUa: 'Судова статистика court.gov.ua',
        url: 'https://court.gov.ua/inshe/sudova_statystyka/',
        description: 'Офіційна квартальна статистика ДСАУ за 2008-2025 роки: 5 форм по юрисдикціях, воєнні злочини (помісячно), домашнє насильство, торгівля людьми, корупція.',
        status: 'in_progress',
        datasets: '~300 файлів (2008-2025)',
        formats: ['XLS', 'XLSX'],
        linearTasks: ['LEG-209'],
        updateFrequency: 'Щоквартально',
        notes: 'URL-патерн передбачуваний, можна автоматизувати. Дані по кожному суду — можна збагатити профіль судді.',
        dataUrls: [
          { label: 'Статистичні форми', url: 'https://court.gov.ua/inshe/sudova_statystyka/' },
        ],
        volume: '~300 XLS файлів, ~150 MB',
        integrationEta: '1–2 тижні (парсинг XLS + ETL)',
      },
      {
        name: 'Judiciary Open Data Portal',
        nameUa: 'Відкриті дані судової влади (court.gov.ua)',
        url: 'https://court.gov.ua/opendata/',
        description: 'Портал відкритих даних судової системи: річні вивантаження ЄДРСР, статистичні звіти, закупівлі, нормативні акти, публічна інформація.',
        status: 'integrated',
        datasets: '814 наборів',
        formats: ['XLS', 'XLSX', 'CSV', 'JSON'],
        linearTasks: ['LEG-47', 'LEG-112'],
        notes: 'Покриває 7 категорій: ЄДРСР (25), статистика (197), кримінальна (22), закупівлі (103), ПІ запити (302), нормативні акти (21), судочинство (126).',
        dataUrls: [
          { label: 'Портал відкритих даних', url: 'https://court.gov.ua/opendata/' },
        ],
        volume: '814 наборів, ~2 GB (XLS/CSV/JSON)',
      },
      {
        name: 'Register of Debtors',
        nameUa: 'Єдиний реєстр боржників (erb.minjust.gov.ua)',
        url: 'https://erb.minjust.gov.ua/',
        description: 'Реєстр фізичних та юридичних осіб з невиконаними фінансовими зобовязаннями. Виконавчі провадження, аліментні боржники.',
        status: 'integrated',
        formats: ['API', 'XML'],
        linearTasks: ['LEG-48', 'LEG-105'],
        notes: 'Інтегровано через OpenReyestr MCP tools.',
        dataUrls: [
          { label: 'Пошук боржників', url: 'https://erb.minjust.gov.ua/' },
        ],
        volume: '~2M записів (виконавчі провадження)',
      },
      {
        name: 'Court Cases Bulk Loader',
        nameUa: 'Масове завантаження судових рішень (ZakonOnline)',
        url: 'https://zakononline.com.ua/',
        description: 'Платний API ZakonOnline для пошуку та отримання повних текстів рішень. 6 категорій цивільних справ, 10-потокове паралельне скрапінг.',
        status: 'integrated',
        formats: ['API', 'JSON'],
        linearTasks: ['LEG-43', 'LEG-31'],
        notes: 'Поступово замінюється безкоштовними дампами ЄДРСР з data.gov.ua.',
        dataUrls: [
          { label: 'ZakonOnline API', url: 'https://zakononline.com.ua/' },
        ],
        volume: '~1M рішень завантажено, ~20 GB текстів',
      },
    ],
  },
  {
    title: 'Верховний Суд та кваліфікаційні органи',
    icon: <Scale className="w-5 h-5" />,
    sources: [
      {
        name: 'Supreme Court Open Data',
        nameUa: 'Відкриті дані Верховного Суду',
        url: 'https://supreme.court.gov.ua/',
        description: 'Відкриті дані ВС: правові позиції (so.supreme.court.gov.ua/digests), щомісячні огляди 4 касаційних судів (КАС/КГС/ККС/КЦС), дайджести ВП ВС, тематичні аналізи, статистика.',
        status: 'researched',
        datasets: '9 наборів на data.gov.ua + 200+ PDF оглядів',
        formats: ['HTML', 'JSON', 'PDF', 'XLSX'],
        linearTasks: ['LEG-211'],
        notes: 'Портал правових позицій має JSON-метадані з PDF-посиланнями. 4 касаційні суди публікують щомісячні огляди з 2018 р. data.gov.ua має 9 адмін-наборів (структура, звіти, акти). CC BY-SA 4.0.',
        dataUrls: [
          { label: 'Правові позиції (дайджести)', url: 'https://so.supreme.court.gov.ua/digests' },
          { label: 'Аналіз судової практики', url: 'https://supreme.court.gov.ua/supreme/pokazniki-diyalnosti/analiz/' },
          { label: 'data.gov.ua (9 наборів)', url: 'https://data.gov.ua/organization/verkhovnyi-sud' },
          { label: 'Огляди касаційних судів', url: 'https://supreme.court.gov.ua/supreme/pres-centr/info_anons_daidgest_oglyad/' },
        ],
        volume: '200+ PDF (огляди 2018–2026), 9 XLSX наборів, ~500 MB',
        integrationEta: '2–3 тижні (парсинг PDF + JSON-метадані)',
      },
      {
        name: 'VKKS — High Qualification Commission of Judges',
        nameUa: 'ВККС — Вища кваліфікаційна комісія суддів',
        url: 'https://data.gov.ua/organization/vyshcha-kvalifikatsiina-komisiia-suddiv-ukrayiny',
        description: 'Відкриті дані ВККС: результати кваліфікаційного оцінювання, рішення, список суддів (~4820), вакансії, рейтинг кандидатів, декларації доброчесності.',
        status: 'researched',
        datasets: '19 наборів, 311+ ресурсів на data.gov.ua',
        formats: ['XLSX', '7Z', 'ZIP', 'CSV'],
        linearTasks: ['LEG-213'],
        apiAvailable: false,
        notes: 'Пріоритет: VERY HIGH. Рішення ВККС: 139 файлів (541 MB). Список суддів: 86 снапшотів (~4820 суддів). Офіційний сайт vkksu.gov.ua/rubric/vidkryti-dani повертає 403.',
        dataUrls: [
          { label: 'data.gov.ua (19 наборів)', url: 'https://data.gov.ua/organization/vyshcha-kvalifikatsiina-komisiia-suddiv-ukrayiny' },
          { label: 'Рішення ВККС (541 MB)', url: 'https://data.gov.ua/dataset/832a5ac3-ad33-40bc-9d03-f51103aa4b2f' },
          { label: 'Список суддів (86 файлів)', url: 'https://data.gov.ua/dataset/354d406b-53cc-4788-a384-78b9abaf2ea0' },
        ],
        volume: '~600 MB (рішення 541 MB + судді 57 MB)',
        integrationEta: '1–2 тижні (імпорт XLSX + зв\'язка з профілями суддів)',
      },
      {
        name: 'HACC — High Anti-Corruption Court',
        nameUa: 'ВАКС — Вищий антикорупційний суд',
        url: 'https://hcac.court.gov.ua/',
        description: 'Відкриті дані ВАКС: справи, статистика розгляду, рішення. Високопрофільні антикорупційні провадження.',
        status: 'researched',
        formats: ['HTML'],
        linearTasks: ['LEG-213'],
        notes: 'Розглядається в рамках додаткових джерел судової системи. Рішення ВАКС також доступні в ЄДРСР.',
        dataUrls: [
          { label: 'Офіційний сайт ВАКС', url: 'https://hcac.court.gov.ua/' },
        ],
        volume: '~5,000 рішень (HTML-скрапінг)',
        integrationEta: '1 тиждень (рішення вже в ЄДРСР)',
      },
      {
        name: 'HCJ — High Council of Justice',
        nameUa: 'ВРП — Вища рада правосуддя',
        url: 'https://hcj.gov.ua/page/vidkryti-dani',
        description: 'Рішення ВРП, дисциплінарна відповідальність суддів, відсторонення, звільнення, реєстр втручань у діяльність суддів, конкурсні комісії.',
        status: 'researched',
        datasets: '22 набори на data.gov.ua',
        formats: ['JSON', 'XLSX', 'CSV', 'ZIP'],
        linearTasks: ['LEG-213'],
        notes: 'Пріоритет: HIGH. Рішення ВРП: 16,533 з поіменним голосуванням (350 MB). Дисципліна: 934 записи (JSON, оновлення 2022). Втручання: 2,637 записів (JSON). Доповнює профіль судді.',
        dataUrls: [
          { label: 'data.gov.ua (22 набори)', url: 'https://data.gov.ua/organization/vyshcha-rada-pravosuddia' },
          { label: 'Рішення ВРП (350 MB)', url: 'https://data.gov.ua/dataset/16a4fb23-e65d-4a4a-956d-32f5f2d14dd4' },
          { label: 'Дисциплінарна відповідальність', url: 'https://data.gov.ua/dataset/305877d5-f250-4849-a1b7-96d2344fea4e' },
          { label: 'Реєстр втручань (2637)', url: 'https://data.gov.ua/dataset/a1eaafbc-241d-4099-a752-e99b95ec492c' },
        ],
        volume: '22 набори, ~460 MB (рішення 350 MB + інші JSON/XLSX)',
        integrationEta: '1–2 тижні (JSON-набори — легко парсити)',
      },
      {
        name: 'KDKP — Council of Prosecutors Discipline',
        nameUa: 'КДКП — Кваліфікаційно-дисциплінарна комісія прокурорів',
        url: 'https://kdkp.gov.ua/',
        description: 'Дисциплінарні провадження прокурорів, кваліфікаційне оцінювання, рішення комісії.',
        status: 'researched',
        formats: ['HTML'],
        linearTasks: ['LEG-213'],
        notes: 'Дані для розширення охоплення правоохоронної системи. Немає API або структурованих даних на data.gov.ua.',
        dataUrls: [
          { label: 'Офіційний сайт КДКП', url: 'https://kdkp.gov.ua/' },
        ],
        volume: '~500 рішень (HTML-скрапінг)',
        integrationEta: '1 тиждень (скрапер + парсинг HTML)',
      },
    ],
  },
  {
    title: 'Верховна Рада та законодавство',
    icon: <BookOpen className="w-5 h-5" />,
    sources: [
      {
        name: 'Rada Open Data Portal',
        nameUa: 'Портал відкритих даних Верховної Ради',
        url: 'https://data.rada.gov.ua/',
        description: 'Офіційний портал відкритих даних ВРУ: депутати, голосування, законопроекти, пленарні засідання, фракції, комітети. Повний API.',
        status: 'integrated',
        datasets: '633+ наборів у 8 категоріях',
        formats: ['API', 'JSON', 'XML'],
        linearTasks: ['LEG-99', 'LEG-54', 'LEG-27'],
        apiAvailable: true,
        updateFrequency: 'Щоденно (deputies 7d, bills 1d, laws 30d cache)',
        notes: 'Інтегровано: deputies, bills, factions, voting, cron sync. Категорії: депутати (179), порядок денний (140), пленарні (115), законопроекти (66), НПБ (61), фінанси (62).',
        dataUrls: [
          { label: 'API документація', url: 'https://data.rada.gov.ua/open/main/api' },
          { label: 'Депутати', url: 'https://data.rada.gov.ua/open/data/mps-sklikanna' },
          { label: 'Законопроекти', url: 'https://data.rada.gov.ua/open/data/bills_main-sklikanna' },
        ],
        volume: '633 наборів, ~2 GB (JSON/XML)',
      },
      {
        name: 'Legislation of Ukraine',
        nameUa: 'Законодавство України (zakon.rada.gov.ua)',
        url: 'https://zakon.rada.gov.ua/',
        description: 'Офіційна база законодавства ВРУ з консолідованими текстами. RadaLegislationAdapter: Constitution, Latin/Cyrillic normalization.',
        status: 'integrated',
        records: '12 кодексів, 5191 стаття',
        formats: ['API', 'HTML'],
        linearTasks: ['LEG-106', 'LEG-59', 'LEG-43'],
        apiAvailable: true,
        notes: 'Aliases: constitution, цивільний кодекс, кримінальний кодекс тощо. Секціонування: статті/частини/глави. TCC legislation loader з bylaws та military law.',
        dataUrls: [
          { label: 'Пошук законодавства', url: 'https://zakon.rada.gov.ua/laws/main' },
        ],
        volume: '12 кодексів (5191 стаття), ~500 MB повних текстів',
      },
      {
        name: 'Draft Legislation System',
        nameUa: 'Система електронного документообігу ВРУ',
        url: 'https://itd.rada.gov.ua/billInfo/Bills/CardBillSearch',
        description: 'Пошук та відстеження законопроектів через Верховну Раду: номер, назва, автор, комітет.',
        status: 'integrated',
        formats: ['HTML', 'API'],
        linearTasks: ['LEG-99'],
        notes: 'Bills sync з active API endpoint, incremental mode поки не реалізовано (LEG-54).',
        dataUrls: [
          { label: 'Пошук законопроектів', url: 'https://itd.rada.gov.ua/billInfo/Bills/CardBillSearch' },
        ],
        volume: '~30,000 законопроектів (HTML/API)',
      },
    ],
  },
  {
    title: 'Державні реєстри (OpenReyestr / NAIS)',
    icon: <Building2 className="w-5 h-5" />,
    sources: [
      {
        name: 'Legal Entities Registry',
        nameUa: 'Єдиний державний реєстр юридичних осіб, ФОП та ГО',
        url: 'https://data.gov.ua/dataset/03cc1239-3988-4451-aa0d-aadb77448714',
        description: 'Реєстр усіх юридичних осіб та ФОП України. EDRPOU import pipeline: validation, resume, diff-based updates.',
        status: 'integrated',
        formats: ['ZIP', 'XML'],
        linearTasks: ['LEG-105', 'LEG-48', 'LEG-56'],
        apiAvailable: true,
        notes: '14 MCP tools для всіх таблиць OpenReyestr. tsvector FTS замість ILIKE. UO.zip (359 MB) + FOP.zip (508 MB) + FSU.zip.',
        dataUrls: [
          { label: 'Набір даних (ЄДР)', url: 'https://data.gov.ua/dataset/03cc1239-3988-4451-aa0d-aadb77448714' },
          { label: 'UO.zip (359 MB)', url: 'https://data.gov.ua/dataset/03cc1239-3988-4451-aa0d-aadb77448714/resource/d40cc921-39bb-44fd-be06-dc02589f45c6/download/uo.zip' },
        ],
        volume: '~1.8M юридичних осіб, ~868 MB (ZIP/XML)',
      },
      {
        name: 'Beneficiaries Registry',
        nameUa: 'Реєстр кінцевих бенефіціарних власників',
        url: 'https://data.gov.ua/dataset/af0f5e2c-d5a4-4c83-b6a9-0ce5a8a7c579',
        description: 'Інформація про кінцевих бенефіціарних власників юридичних осіб.',
        status: 'integrated',
        formats: ['XML', 'CSV'],
        linearTasks: ['LEG-48'],
        dataUrls: [
          { label: 'Набір даних', url: 'https://data.gov.ua/dataset/af0f5e2c-d5a4-4c83-b6a9-0ce5a8a7c579' },
        ],
        volume: '~800K записів, ~500 MB',
      },
      {
        name: 'Notary Registry',
        nameUa: 'Єдиний реєстр нотаріусів',
        url: 'https://data.gov.ua/dataset/1603f092-68b3-4c25-afef-8632aed79daf',
        description: 'Єдиний державний реєстр нотаріусів — всі діючі нотаріуси з номерами ліцензій.',
        status: 'integrated',
        formats: ['XML', 'CSV'],
        linearTasks: ['LEG-27', 'LEG-57'],
        dataUrls: [
          { label: 'Набір даних', url: 'https://data.gov.ua/dataset/1603f092-68b3-4c25-afef-8632aed79daf' },
        ],
        volume: '~8,000 нотаріусів, ~5 MB',
      },
      {
        name: 'Forensic Experts Registry',
        nameUa: 'Реєстр атестованих судових експертів',
        url: 'https://data.gov.ua/dataset/0a556891-d6ef-4a5f-a182-caac2f7aa9c9',
        description: 'Державний реєстр атестованих судових експертів зі спеціалізаціями.',
        status: 'integrated',
        formats: ['XML', 'CSV'],
        linearTasks: ['LEG-27', 'LEG-57'],
        dataUrls: [
          { label: 'Набір даних', url: 'https://data.gov.ua/dataset/0a556891-d6ef-4a5f-a182-caac2f7aa9c9' },
        ],
        volume: '~12,000 експертів, ~8 MB',
      },
      {
        name: 'Arbitration Managers Registry',
        nameUa: 'Реєстр арбітражних керуючих',
        url: 'https://data.gov.ua/dataset/78531b7b-e0b1-489f-9924-64144faa7abd',
        description: 'Реєстр арбітражних керуючих у справах про банкрутство.',
        status: 'integrated',
        formats: ['XML', 'CSV'],
        linearTasks: ['LEG-27', 'LEG-57'],
        dataUrls: [
          { label: 'Набір даних', url: 'https://data.gov.ua/dataset/78531b7b-e0b1-489f-9924-64144faa7abd' },
        ],
        volume: '~1,500 керуючих, ~2 MB',
      },
      {
        name: 'Advocates Registry',
        nameUa: 'Єдиний реєстр адвокатів України (ЄРАУ)',
        url: 'https://data.gov.ua/dataset/e1af20b8-c80b-4f2c-bf82-566567ef936e',
        description: 'Повний реєстр адвокатів України з інформацією про свідоцтва, статус, регіон діяльності.',
        status: 'integrated',
        formats: ['JSON', 'CSV'],
        linearTasks: ['LEG-27', 'LEG-57'],
        dataUrls: [
          { label: 'Набір даних', url: 'https://data.gov.ua/dataset/e1af20b8-c80b-4f2c-bf82-566567ef936e' },
          { label: 'register-2026-01-27.json (215 MB)', url: 'https://data.gov.ua/dataset/e1af20b8-c80b-4f2c-bf82-566567ef936e/resource/94f6f8b4-8800-4220-8b6d-8769bae283bb/download/register-2026-01-27.json' },
        ],
        volume: '~65,000 адвокатів, ~215 MB (JSON)',
      },
      {
        name: 'Appraisers Registry',
        nameUa: 'Реєстр оцінювачів',
        url: 'https://data.gov.ua/dataset/23490f8d-d11d-409a-9ead-5c9ca2b1d7f4',
        description: 'Реєстр суб\'єктів оціночної діяльності. Щотижневі снапшоти з 2018 року.',
        status: 'integrated',
        formats: ['CSV', 'XLSX'],
        linearTasks: ['LEG-27', 'LEG-57'],
        dataUrls: [
          { label: 'Набір даних (763 ресурси)', url: 'https://data.gov.ua/dataset/23490f8d-d11d-409a-9ead-5c9ca2b1d7f4' },
        ],
        volume: '~5,000 оцінювачів, ~1 MB (CSV щотижня)',
      },
      {
        name: 'Enforcement Proceedings',
        nameUa: 'Реєстр виконавчих проваджень',
        url: 'https://data.gov.ua/dataset/783b9b50-faba-4cc9-a393-60485e395b1d',
        description: 'Відомості про виконавчі провадження від Державної виконавчої служби.',
        status: 'integrated',
        formats: ['CSV', 'ZIP'],
        linearTasks: ['LEG-48'],
        dataUrls: [
          { label: 'Набір даних', url: 'https://data.gov.ua/dataset/783b9b50-faba-4cc9-a393-60485e395b1d' },
          { label: '29-ex_csv_erb.zip (678 MB)', url: 'https://data.gov.ua/dataset/783b9b50-faba-4cc9-a393-60485e395b1d/resource/e6ea76c1-01f4-4bd0-a282-7d92d6ecc2a1/download/29-ex_csv_erb.zip' },
        ],
        volume: '~3M проваджень, ~678 MB (ZIP/CSV)',
      },
      {
        name: 'NAIS Legal Acts (EDRNPA)',
        nameUa: 'Нормативно-правові акти (ЕДРНПА)',
        url: 'https://data.gov.ua/dataset/b22d184c-4826-4e1d-8577-972effc5700c',
        description: 'Єдиний державний реєстр нормативно-правових актів. Щотижневий ZIP-дамп ~566 MB.',
        status: 'planned',
        formats: ['ZIP', 'XML'],
        linearTasks: ['LEG-37', 'LEG-57'],
        notes: 'URL оновлено — набір доступний на data.gov.ua. Щотижневе оновлення.',
        dataUrls: [
          { label: 'Набір даних', url: 'https://data.gov.ua/dataset/b22d184c-4826-4e1d-8577-972effc5700c' },
          { label: '25-edrnpa.zip (566 MB)', url: 'https://data.gov.ua/dataset/b22d184c-4826-4e1d-8577-972effc5700c/resource/5616dd04-949a-489c-8efc-54004293b238/download/25-edrnpa.zip' },
        ],
        volume: '~100,000 НПА, ~566 MB (ZIP/XML)',
        integrationEta: '2–3 тижні (після вирішення проблеми доступу)',
      },
      {
        name: 'FOP (Individual Entrepreneurs)',
        nameUa: 'Реєстр фізичних осіб-підприємців',
        url: 'https://data.gov.ua/dataset/03cc1239-3988-4451-aa0d-aadb77448714',
        description: 'Повний реєстр ФОП. Паралельний імпорт (streaming + 10 workers), але поки без incremental updates.',
        status: 'integrated',
        formats: ['ZIP', 'XML'],
        linearTasks: ['LEG-56'],
        notes: 'Повний ре-імпорт кожного разу. FOP.zip (508 MB) + UO.zip (359 MB) + FSU.zip (65 KB). XSD-схеми додаються.',
        dataUrls: [
          { label: 'Набір даних (ЄДР)', url: 'https://data.gov.ua/dataset/03cc1239-3988-4451-aa0d-aadb77448714' },
          { label: 'FOP.zip (508 MB)', url: 'https://data.gov.ua/dataset/03cc1239-3988-4451-aa0d-aadb77448714/resource/c262938f-cce7-4489-a805-2fd7c5a44e0b/download/fop.zip' },
        ],
        volume: '~2M ФОП, ~508 MB ZIP (XML windows-1251)',
      },
      {
        name: 'Administrative Units & Streets',
        nameUa: 'Адміністративно-територіальні одиниці та вулиці',
        url: 'https://data.gov.ua/dataset/2f4beef4-6bba-43d3-9e9e-120c696f1123',
        description: 'Кодифікатор КАТОТТГ (замінив КОАТУУ). Адміністративно-територіальні одиниці України.',
        status: 'integrated',
        formats: ['XLSX'],
        linearTasks: ['LEG-48'],
        dataUrls: [
          { label: 'КАТОТТГ (XLSX)', url: 'https://data.gov.ua/dataset/2f4beef4-6bba-43d3-9e9e-120c696f1123' },
        ],
        volume: '~1.4 MB (XLSX кодифікатор)',
      },
    ],
  },
  {
    title: 'Національний портал відкритих даних',
    icon: <Database className="w-5 h-5" />,
    sources: [
      {
        name: 'data.gov.ua',
        nameUa: 'Єдиний державний вебпортал відкритих даних',
        url: 'https://data.gov.ua/',
        description: 'Центральний портал відкритих даних України. CKAN v2.7.2 з повним API. 11,689 розпорядників.',
        status: 'integrated',
        datasets: '39,612 наборів, 330,845 ресурсів',
        formats: ['XLS', 'XLSX', 'CSV', 'JSON', 'XML', 'ZIP'],
        linearTasks: ['LEG-47', 'LEG-112'],
        apiAvailable: true,
        notes: 'Розподіл ресурсів: XLS (152K), XLSX (103K), CSV (39K), ZIP (39K), JSON (17K), PDF (14K), XML (14K). Ліміт API: 1000 rows/запит. Без rate limiting.',
        dataUrls: [
          { label: 'Каталог наборів', url: 'https://data.gov.ua/dataset' },
          { label: 'CKAN API v3', url: 'https://data.gov.ua/api/3/' },
        ],
        volume: '39,612 наборів, 330,845 файлів',
      },
      {
        name: 'Diia Open Data',
        nameUa: 'Дія Відкриті дані',
        url: 'https://diia.data.gov.ua/',
        description: 'Центр компетенцій з відкритих даних, частина ініціативи цифрового урядування Дія.',
        status: 'researched',
        formats: ['JSON', 'API'],
        linearTasks: ['LEG-47'],
        dataUrls: [
          { label: 'Портал Дія', url: 'https://diia.data.gov.ua/' },
        ],
        volume: 'Агрегатор — посилання на data.gov.ua наборі',
        integrationEta: '1 тиждень (аналіз унікальних наборів)',
      },
    ],
  },
  {
    title: 'Антикорупція та декларації',
    icon: <Shield className="w-5 h-5" />,
    sources: [
      {
        name: 'NAZK Asset Declarations',
        nameUa: 'НАЗК — Реєстр декларацій',
        url: 'https://public.nazk.gov.ua/',
        description: 'Єдиний державний реєстр декларацій осіб, уповноважених на виконання функцій держави. Публічний API v2 з пошуком, фільтрацією по типу, року, даті.',
        status: 'researched',
        formats: ['API', 'JSON'],
        linearTasks: ['LEG-47'],
        apiAvailable: true,
        dataUrls: [
          { label: 'API v2 документація', url: 'https://public.nazk.gov.ua/public_api' },
          { label: 'Статистика', url: 'https://public.nazk.gov.ua/documents/stats' },
          { label: 'Пошук декларацій', url: 'https://public.nazk.gov.ua/' },
        ],
        volume: '9.8M документів (декларації 2015–2026)',
        integrationEta: '2–3 тижні (API v2, пагінація до 100 сторінок)',
      },
      {
        name: 'Corruption Offenders Registry',
        nameUa: 'Реєстр осіб з корупційних правопорушень',
        url: 'https://data.gov.ua/dataset/1b80e5ef-3c57-4090-8c4f-cda687f67721',
        description: 'Реєстр осіб, які вчинили корупційні правопорушення.',
        status: 'researched',
        formats: ['CSV', 'JSON'],
        linearTasks: ['LEG-47'],
        dataUrls: [
          { label: 'Набір даних', url: 'https://data.gov.ua/dataset/1b80e5ef-3c57-4090-8c4f-cda687f67721' },
        ],
        volume: '~15,000 записів, ~5 MB',
        integrationEta: '2–3 дні (простий CSV імпорт)',
      },
      {
        name: 'Lustration Registry',
        nameUa: 'Реєстр осіб за законом "Про очищення влади"',
        url: 'https://data.gov.ua/dataset/8faa71c1-3a54-45e8-8f6e-06c92b1ff8bc',
        description: 'Реєстр осіб, які підпадають під дію закону про люстрацію.',
        status: 'researched',
        formats: ['CSV'],
        linearTasks: ['LEG-47'],
        dataUrls: [
          { label: 'Набір даних', url: 'https://data.gov.ua/dataset/8faa71c1-3a54-45e8-8f6e-06c92b1ff8bc' },
        ],
        volume: '~1,000 записів, ~500 KB',
        integrationEta: '1–2 дні (простий CSV імпорт)',
      },
    ],
  },
  {
    title: 'Закупівлі та публічні фінанси',
    icon: <Landmark className="w-5 h-5" />,
    sources: [
      {
        name: 'ProZorro',
        nameUa: 'Прозорро — публічні закупівлі',
        url: 'https://prozorro.gov.ua/',
        description: 'Електронна система публічних закупівель. Усі державні тендери в стандарті OCDS.',
        status: 'researched',
        formats: ['API', 'JSON'],
        linearTasks: ['LEG-47'],
        apiAvailable: true,
        dataUrls: [
          { label: 'API (OCDS)', url: 'https://public-api.prozorro.gov.ua/' },
          { label: 'Пошук тендерів', url: 'https://prozorro.gov.ua/search' },
        ],
        volume: '~10M тендерів, десятки GB (OCDS JSON)',
        integrationEta: '3–4 тижні (великий обсяг, OCDS парсинг)',
      },
      {
        name: 'E-Data / Spending.gov.ua',
        nameUa: 'Є-Data — витрати державних коштів',
        url: 'https://spending.gov.ua/',
        description: 'Портал прозорості публічних фінансів. Транзакції в реальному часі.',
        status: 'researched',
        formats: ['API', 'JSON', 'CSV'],
        linearTasks: ['LEG-47'],
        apiAvailable: true,
        dataUrls: [
          { label: 'Портал Є-Data', url: 'https://spending.gov.ua/' },
          { label: 'API транзакцій', url: 'https://api.spending.gov.ua/' },
        ],
        volume: 'Мільйони транзакцій, десятки GB',
        integrationEta: '2–3 тижні (API + агрегація)',
      },
      {
        name: 'SETAM — Seized Property Auctions',
        nameUa: 'СЕТАМ — Аукціони арештованого майна',
        url: 'https://setam.net.ua/',
        description: 'Державне підприємство з реалізації конфіскованого та арештованого майна.',
        status: 'researched',
        formats: ['HTML', 'API'],
        linearTasks: ['LEG-47'],
        dataUrls: [
          { label: 'Пошук аукціонів', url: 'https://setam.net.ua/auctions' },
        ],
        volume: '~100,000 лотів, ~500 MB',
        integrationEta: '1–2 тижні (API/скрапінг)',
      },
    ],
  },
];

// Counts
const totalSources = domains.reduce((sum, d) => sum + d.sources.length, 0);
const countByStatus = (status: IntegrationStatus) =>
  domains.reduce((sum, d) => sum + d.sources.filter(s => s.status === status).length, 0);

export function AdminOpenDataCatalogPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<IntegrationStatus | 'all'>('all');
  const [collapsedDomains, setCollapsedDomains] = useState<Set<string>>(new Set());

  const toggleDomain = (title: string) => {
    setCollapsedDomains(prev => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  };

  const filtered = domains
    .map(d => ({
      ...d,
      sources: d.sources.filter(s => {
        const matchesStatus = statusFilter === 'all' || s.status === statusFilter;
        if (!matchesStatus) return false;
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        return (
          s.name.toLowerCase().includes(q) ||
          s.nameUa.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q) ||
          s.linearTasks.some(t => t.toLowerCase().includes(q))
        );
      }),
    }))
    .filter(d => d.sources.length > 0);

  const filteredCount = filtered.reduce((sum, d) => sum + d.sources.length, 0);

  return (
    <div className="flex-1 overflow-y-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-claude-text font-sans">Каталог OpenData</h1>
          <p className="text-sm text-claude-subtext mt-1">
            Усі відкриті джерела даних з проєкту OpenData — статус інтеграції та деталі
          </p>
        </div>
        <a
          href="https://linear.app/legalorgua/project/opendata-81a9bb8be5e4/issues"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-4 py-2 bg-white border border-claude-border rounded-lg text-sm text-claude-text hover:bg-claude-bg transition-colors"
        >
          <ExternalLink size={14} />
          Linear Project
        </a>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
        <button
          onClick={() => setStatusFilter('all')}
          className={`rounded-xl border p-4 shadow-sm text-left transition-colors ${statusFilter === 'all' ? 'bg-claude-accent/5 border-claude-accent/30 ring-1 ring-claude-accent/20' : 'bg-white border-claude-border hover:bg-claude-bg/50'}`}
        >
          <p className="text-xs text-claude-subtext">Всього</p>
          <p className="text-2xl font-semibold text-claude-text mt-1">{totalSources}</p>
        </button>
        {(Object.entries(STATUS_CONFIG) as [IntegrationStatus, typeof STATUS_CONFIG[IntegrationStatus]][]).map(([key, cfg]) => (
          <button
            key={key}
            onClick={() => setStatusFilter(statusFilter === key ? 'all' : key)}
            className={`rounded-xl border p-4 shadow-sm text-left transition-colors ${statusFilter === key ? `${cfg.bg} ring-1 ring-current/20` : 'bg-white border-claude-border hover:bg-claude-bg/50'}`}
          >
            <p className="text-xs text-claude-subtext">{cfg.label}</p>
            <p className={`text-2xl font-semibold mt-1 ${statusFilter === key ? cfg.color : 'text-claude-text'}`}>
              {countByStatus(key)}
            </p>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-claude-subtext" />
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Пошук джерел: назва, опис, LEG-номер..."
          className="w-full pl-10 pr-4 py-2.5 bg-white border border-claude-border rounded-lg text-sm text-claude-text placeholder:text-claude-subtext/50 focus:outline-none focus:ring-2 focus:ring-claude-text/20 focus:border-claude-text/30"
        />
        {searchQuery && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-claude-subtext">
            {filteredCount} / {totalSources}
          </span>
        )}
      </div>

      {/* Domains */}
      <div className="space-y-4">
        {filtered.map(domain => {
          const isCollapsed = collapsedDomains.has(domain.title);
          return (
            <section key={domain.title} className="bg-white rounded-xl border border-claude-border shadow-sm overflow-hidden">
              <button
                onClick={() => toggleDomain(domain.title)}
                className="w-full flex items-center justify-between p-4 hover:bg-claude-bg/50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <div className="text-claude-subtext">{domain.icon}</div>
                  <h2 className="text-sm font-semibold text-claude-text font-sans">{domain.title}</h2>
                  <span className="text-xs text-claude-subtext bg-claude-bg px-2 py-0.5 rounded-full">
                    {domain.sources.length}
                  </span>
                </div>
                {isCollapsed ? <ChevronDown size={16} className="text-claude-subtext" /> : <ChevronUp size={16} className="text-claude-subtext" />}
              </button>
              {!isCollapsed && (
                <div className="border-t border-claude-border divide-y divide-claude-border/50">
                  {domain.sources.map(source => {
                    const st = STATUS_CONFIG[source.status];
                    return (
                      <div key={source.name} className="p-4 hover:bg-claude-bg/20 transition-colors">
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <a
                                href={source.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm font-semibold text-claude-text hover:text-blue-600 transition-colors inline-flex items-center gap-1"
                              >
                                {source.name}
                                <ExternalLink size={11} className="text-claude-subtext/40" />
                              </a>
                              <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border font-medium ${st.bg} ${st.color}`}>
                                {st.icon}
                                {st.label}
                              </span>
                            </div>
                            <p className="text-[11px] text-claude-subtext/60 mt-0.5">{source.nameUa}</p>
                          </div>
                        </div>

                        <p className="text-xs text-claude-subtext mb-3 leading-relaxed">{source.description}</p>

                        {/* Meta row */}
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-claude-subtext">
                          {source.datasets && (
                            <span className="flex items-center gap-1">
                              <Database size={11} className="text-claude-subtext/50" />
                              {source.datasets}
                            </span>
                          )}
                          {source.records && (
                            <span className="flex items-center gap-1">
                              <Database size={11} className="text-claude-subtext/50" />
                              {source.records}
                            </span>
                          )}
                          {source.updateFrequency && (
                            <span className="flex items-center gap-1">
                              <Clock size={11} className="text-claude-subtext/50" />
                              {source.updateFrequency}
                            </span>
                          )}
                          {source.license && (
                            <span className="flex items-center gap-1">
                              <Shield size={11} className="text-claude-subtext/50" />
                              {source.license}
                            </span>
                          )}
                          {source.apiAvailable && (
                            <span className="flex items-center gap-1 text-green-600 font-medium">
                              <Globe size={11} />
                              API
                            </span>
                          )}
                          {source.volume && (
                            <span className="flex items-center gap-1">
                              <HardDrive size={11} className="text-claude-subtext/50" />
                              {source.volume}
                            </span>
                          )}
                          {source.integrationEta && (
                            <span className="flex items-center gap-1 text-orange-600 font-medium">
                              <Timer size={11} />
                              ETA: {source.integrationEta}
                            </span>
                          )}
                        </div>

                        {/* Data links */}
                        {source.dataUrls && source.dataUrls.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1.5 mt-2">
                            <span className="flex items-center gap-1 text-[11px] text-claude-subtext/60 mr-1">
                              <Link2 size={11} />
                              Дані:
                            </span>
                            {source.dataUrls.map(dl => (
                              <a
                                key={dl.url}
                                href={dl.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 hover:bg-sky-100 transition-colors font-medium"
                              >
                                {dl.label}
                                <ExternalLink size={9} className="opacity-40" />
                              </a>
                            ))}
                          </div>
                        )}

                        {/* Formats */}
                        <div className="flex flex-wrap items-center gap-1.5 mt-2">
                          {source.formats.map(f => (
                            <span key={f} className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-mono">
                              {FORMAT_ICONS[f]}
                              {f}
                            </span>
                          ))}
                          <span className="mx-1 text-claude-subtext/20">|</span>
                          {source.linearTasks.map(task => (
                            <a
                              key={task}
                              href={`https://linear.app/legalorgua/issue/${task}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded bg-violet-50 text-violet-600 hover:bg-violet-100 transition-colors font-medium"
                            >
                              {task}
                            </a>
                          ))}
                        </div>

                        {/* Notes */}
                        {source.notes && (
                          <p className="text-[11px] text-claude-subtext/70 mt-2 pl-2 border-l-2 border-claude-border/50 leading-relaxed">
                            {source.notes}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
      </div>

      {searchQuery && filtered.length === 0 && (
        <div className="text-center py-12">
          <Search size={32} className="text-claude-subtext/30 mx-auto mb-3" />
          <p className="text-claude-subtext">Нічого не знайдено за запитом &ldquo;{searchQuery}&rdquo;</p>
        </div>
      )}
    </div>
  );
}
