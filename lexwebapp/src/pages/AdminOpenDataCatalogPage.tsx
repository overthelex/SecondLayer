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
  FileSpreadsheet, Globe, Code, FileText,
} from 'lucide-react';

type IntegrationStatus = 'integrated' | 'in_progress' | 'researched' | 'planned';

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
        description: 'Відкриті дані Верховного Суду України: правові позиції, огляди практики, статистика касаційних проваджень.',
        status: 'researched',
        formats: ['HTML', 'JSON'],
        linearTasks: ['LEG-211'],
        notes: 'Дослідження джерела в рамках OpenData проєкту.',
      },
      {
        name: 'VKKS — High Qualification Commission of Judges',
        nameUa: 'ВККС — Вища кваліфікаційна комісія суддів',
        url: 'https://new.vkksu.gov.ua/rubric/vidkryti-dani',
        description: 'Відкриті дані ВККС: результати кваліфікаційного оцінювання суддів, рішення щодо кандидатів, дисциплінарні провадження.',
        status: 'researched',
        datasets: '8 наборів на data.gov.ua',
        formats: ['XLS', 'XLSX', 'CSV'],
        linearTasks: ['LEG-213'],
        apiAvailable: false,
        notes: 'Оцінка пріоритетності: VERY HIGH. Дані можна зв\'язати з профілями суддів.',
      },
      {
        name: 'HACC — High Anti-Corruption Court',
        nameUa: 'ВАКС — Вищий антикорупційний суд',
        url: 'https://hcac.court.gov.ua/',
        description: 'Відкриті дані ВАКС: справи, статистика розгляду, рішення. Високопрофільні антикорупційні провадження.',
        status: 'researched',
        formats: ['HTML'],
        linearTasks: ['LEG-213'],
        notes: 'Розглядається в рамках додаткових джерел судової системи.',
      },
      {
        name: 'HCJ — High Council of Justice',
        nameUa: 'ВРП — Вища рада правосуддя',
        url: 'https://hcj.gov.ua/page/vidkryti-dani',
        description: 'Реєстр судових справ, дисциплінарні справи суддів, рішення ВРП, скарги на суддів.',
        status: 'researched',
        datasets: '6 наборів на data.gov.ua',
        formats: ['XLS', 'CSV'],
        linearTasks: ['LEG-213'],
        notes: 'Пріоритет: HIGH. Дані доповнюють профіль судді — дисциплінарна історія.',
      },
      {
        name: 'KDKP — Council of Prosecutors Discipline',
        nameUa: 'КДКП — Кваліфікаційно-дисциплінарна комісія прокурорів',
        url: 'https://kdkp.gov.ua/',
        description: 'Дисциплінарні провадження прокурорів, кваліфікаційне оцінювання, рішення комісії.',
        status: 'researched',
        formats: ['HTML'],
        linearTasks: ['LEG-213'],
        notes: 'Дані для розширення охоплення правоохоронної системи.',
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
        url: 'https://data.gov.ua/dataset/1c7f3815-3259-45e0-bdf1-64dca07ddc10',
        description: 'Реєстр усіх юридичних осіб та ФОП України. EDRPOU import pipeline: validation, resume, diff-based updates.',
        status: 'integrated',
        formats: ['XML', 'CSV', 'ZIP'],
        linearTasks: ['LEG-105', 'LEG-48', 'LEG-56'],
        apiAvailable: true,
        notes: '14 MCP tools для всіх таблиць OpenReyestr. tsvector FTS замість ILIKE. pg_class.reltuples для instant stats.',
      },
      {
        name: 'Beneficiaries Registry',
        nameUa: 'Реєстр кінцевих бенефіціарних власників',
        url: 'https://data.gov.ua/dataset/af0f5e2c-d5a4-4c83-b6a9-0ce5a8a7c579',
        description: 'Інформація про кінцевих бенефіціарних власників юридичних осіб.',
        status: 'integrated',
        formats: ['XML', 'CSV'],
        linearTasks: ['LEG-48'],
      },
      {
        name: 'Notary Registry',
        nameUa: 'Єдиний реєстр нотаріусів',
        url: 'https://data.gov.ua/dataset/1603f092-68b3-4c25-afef-8632aed79daf',
        description: 'Єдиний державний реєстр нотаріусів — всі діючі нотаріуси з номерами ліцензій.',
        status: 'integrated',
        formats: ['XML', 'CSV'],
        linearTasks: ['LEG-27', 'LEG-57'],
      },
      {
        name: 'Forensic Experts Registry',
        nameUa: 'Реєстр атестованих судових експертів',
        url: 'https://data.gov.ua/dataset/0a556891-d6ef-4a5f-a182-caac2f7aa9c9',
        description: 'Державний реєстр атестованих судових експертів зі спеціалізаціями.',
        status: 'integrated',
        formats: ['XML', 'CSV'],
        linearTasks: ['LEG-27', 'LEG-57'],
      },
      {
        name: 'Arbitration Managers Registry',
        nameUa: 'Реєстр арбітражних керуючих',
        url: 'https://data.gov.ua/dataset/78531b7b-e0b1-489f-9924-64144faa7abd',
        description: 'Реєстр арбітражних керуючих у справах про банкрутство.',
        status: 'integrated',
        formats: ['XML', 'CSV'],
        linearTasks: ['LEG-27', 'LEG-57'],
      },
      {
        name: 'Advocates Registry',
        nameUa: 'Єдиний реєстр адвокатів України (ЄРАУ)',
        url: 'https://data.gov.ua/dataset/0f420daa-efa9-44c1-a3c0-43f1feae55d8',
        description: 'Повний реєстр адвокатів України з інформацією про свідоцтва, статус, регіон діяльності.',
        status: 'integrated',
        formats: ['CSV', 'XML'],
        linearTasks: ['LEG-27', 'LEG-57'],
      },
      {
        name: 'Appraisers Registry',
        nameUa: 'Реєстр оцінювачів',
        url: 'https://data.gov.ua/dataset/appraisers',
        description: 'Реєстр суб\'єктів оціночної діяльності.',
        status: 'integrated',
        formats: ['CSV', 'XML'],
        linearTasks: ['LEG-27', 'LEG-57'],
      },
      {
        name: 'Enforcement Proceedings',
        nameUa: 'Реєстр виконавчих проваджень',
        url: 'https://data.gov.ua/dataset/enforcement',
        description: 'Відомості про виконавчі провадження від Державної виконавчої служби.',
        status: 'integrated',
        formats: ['CSV', 'XML'],
        linearTasks: ['LEG-48'],
      },
      {
        name: 'NAIS Legal Acts (EDRNPA)',
        nameUa: 'Нормативно-правові акти (ЕДРНПА)',
        url: 'https://data.gov.ua/dataset/legal_acts',
        description: 'Єдиний державний реєстр нормативно-правових актів. Custom EDRNPA parser для multi-section XML.',
        status: 'planned',
        formats: ['XML'],
        linearTasks: ['LEG-37', 'LEG-57'],
        notes: 'Домен повертає 403 з data.gov.ua. Потрібно знайти альтернативний endpoint.',
      },
      {
        name: 'FOP (Individual Entrepreneurs)',
        nameUa: 'Реєстр фізичних осіб-підприємців',
        url: 'https://data.gov.ua/dataset/fop',
        description: 'Повний реєстр ФОП. Паралельний імпорт (streaming + 10 workers), але поки без incremental updates.',
        status: 'integrated',
        formats: ['XML', 'CSV'],
        linearTasks: ['LEG-56'],
        notes: 'Повний ре-імпорт кожного разу. Потрібен hash-based dedup та COPY оптимізація.',
      },
      {
        name: 'Administrative Units & Streets',
        nameUa: 'Адміністративно-територіальні одиниці та вулиці',
        url: 'https://data.gov.ua/dataset/admin-units',
        description: 'Довідник АТО та вулиць України. Додано до OpenReyestr stats endpoint.',
        status: 'integrated',
        formats: ['CSV', 'XML'],
        linearTasks: ['LEG-48'],
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
        description: 'Центральний портал відкритих даних України з 80,000+ наборами від усіх державних органів. 3-тє місце в Європі (97% зрілості).',
        status: 'integrated',
        datasets: '80,000+ наборів',
        formats: ['CSV', 'XLSX', 'XLS', 'JSON', 'XML', 'ZIP'],
        linearTasks: ['LEG-47', 'LEG-112'],
        apiAvailable: true,
        notes: 'Розподіл форматів: XLSX (16173), CSV (12179), XLS (6992), DOCX (2007), ZIP (1999), JSON (1714), XML (1682), PDF (1521).',
      },
      {
        name: 'Diia Open Data',
        nameUa: 'Дія Відкриті дані',
        url: 'https://diia.data.gov.ua/',
        description: 'Центр компетенцій з відкритих даних, частина ініціативи цифрового урядування Дія.',
        status: 'researched',
        formats: ['JSON', 'API'],
        linearTasks: ['LEG-47'],
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
        description: 'Єдиний державний реєстр декларацій осіб, уповноважених на виконання функцій держави. Є API.',
        status: 'researched',
        formats: ['API', 'JSON'],
        linearTasks: ['LEG-47'],
        apiAvailable: true,
      },
      {
        name: 'Corruption Offenders Registry',
        nameUa: 'Реєстр осіб з корупційних правопорушень',
        url: 'https://data.gov.ua/dataset/1b80e5ef-3c57-4090-8c4f-cda687f67721',
        description: 'Реєстр осіб, які вчинили корупційні правопорушення.',
        status: 'researched',
        formats: ['CSV', 'JSON'],
        linearTasks: ['LEG-47'],
      },
      {
        name: 'Lustration Registry',
        nameUa: 'Реєстр осіб за законом "Про очищення влади"',
        url: 'https://data.gov.ua/dataset/8faa71c1-3a54-45e8-8f6e-06c92b1ff8bc',
        description: 'Реєстр осіб, які підпадають під дію закону про люстрацію.',
        status: 'researched',
        formats: ['CSV'],
        linearTasks: ['LEG-47'],
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
      },
      {
        name: 'SETAM — Seized Property Auctions',
        nameUa: 'СЕТАМ — Аукціони арештованого майна',
        url: 'https://setam.net.ua/',
        description: 'Державне підприємство з реалізації конфіскованого та арештованого майна.',
        status: 'researched',
        formats: ['HTML', 'API'],
        linearTasks: ['LEG-47'],
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
                        </div>

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
