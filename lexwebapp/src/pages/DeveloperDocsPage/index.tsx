import { useState, useRef, useEffect } from 'react';
import { Copy, Check } from 'lucide-react';
import { useDocumentMeta } from '../../hooks/useDocumentMeta';
import { WebAPIJsonLd } from '../../components/seo/WebAPIJsonLd';

/* ================================================================
   DATA
   ================================================================ */

const API_BASE = 'https://platform.legal.org.ua/api/tools';
const MCP_SSE_URL = 'https://mcp.legal.org.ua/api/v1/sse';

interface ToolDef {
  name: string;
  description: string;
  params?: { name: string; required?: boolean }[];
  cost?: string;
}

interface ToolGroup {
  title: string;
  tools: ToolDef[];
}

const toolGroups: ToolGroup[] = [
  {
    title: 'Пошук судових рішень',
    tools: [
      { name: 'search_legal_precedents', description: 'Пошук юридичних прецедентів із семантичним аналізом', params: [{ name: 'query', required: true }, { name: 'domain' }, { name: 'time_range' }, { name: 'limit' }, { name: 'offset' }], cost: '₴1.25–4.15' },
      { name: 'search_supreme_court_practice', description: 'Пошук практики Верховного Суду (ВП/КЦС/КГС/КАС/ККС)', params: [{ name: 'query', required: true }, { name: 'procedure_code' }, { name: 'court_level' }, { name: 'time_range' }, { name: 'limit' }], cost: '₴2.08–6.22' },
      { name: 'find_similar_fact_pattern_cases', description: 'Пошук справ за схожими фактами', params: [{ name: 'procedure_code', required: true }, { name: 'facts_text', required: true }, { name: 'time_range' }, { name: 'limit' }], cost: '₴1.25–4.15' },
      { name: 'compare_practice_pro_contra', description: 'Підбірка практики «за/проти» за тезою', params: [{ name: 'procedure_code', required: true }, { name: 'query', required: true }, { name: 'time_range' }, { name: 'limit' }], cost: '₴2.08–6.22' },
      { name: 'search_court_decisions', description: 'Єдиний пошук у ЄДРСР (82M+ рішень). Режими: structured (метадані), fulltext (FTS), hybrid (FTS+семантика), semantic', params: [{ name: 'mode', required: true }, { name: 'query' }, { name: 'cause_num' }, { name: 'judge' }, { name: 'court_name' }, { name: 'justice_kind' }, { name: 'date_from' }, { name: 'date_to' }, { name: 'military_preset' }, { name: 'limit' }], cost: '₴0.21–1.25' },
    ],
  },
  {
    title: 'Аналіз судової практики',
    tools: [
      { name: 'analyze_case_pattern', description: 'Аналізує патерни: аргументи, ризики, статистика результатів', params: [{ name: 'intent', required: true }, { name: 'case_ids' }], cost: '₴0.83–3.32' },
      { name: 'get_similar_reasoning', description: 'Знаходить схожі судові обґрунтування за векторним пошуком', params: [{ name: 'query', required: true }, { name: 'section_type' }, { name: 'date_from' }, { name: 'date_to' }], cost: '₴0.42–1.25' },
      { name: 'get_citation_graph', description: 'Будує граф цитувань між справами. case_id приймає UUID/doc_id або номер справи (напр. "756/1234/23")', params: [{ name: 'case_id', required: true }, { name: 'depth' }], cost: '₴0.21–0.83' },
      { name: 'check_precedent_status', description: 'Перевіряє актуальність та статус прецеденту', params: [{ name: 'case_id', required: true }], cost: '₴0.21–0.62' },
      { name: 'count_cases_by_party', description: 'Кількість справ за назвою сторони', params: [{ name: 'party_name', required: true }], cost: '₴0.04–0.21' },
      { name: 'search_court_case_status', description: 'Пошук статусу судової справи', params: [{ name: 'case_number', required: true }], cost: '₴0.04–0.21' },
      { name: 'analyze_data', description: 'Read-only SQL для аналітики: GROUP BY, COUNT, агрегати (таймаут 30с, макс. 500 рядків)', params: [{ name: 'sql', required: true }], cost: '₴0.04' },
    ],
  },
  {
    title: 'Робота з документами',
    tools: [
      { name: 'get_court_decision', description: 'Повний текст рішення з секціями: ФАКТИ, ОБҐРУНТУВАННЯ, РІШЕННЯ', params: [{ name: 'doc_id' }, { name: 'case_number' }, { name: 'depth' }], cost: '₴0.42–1.66' },
      { name: 'get_case_documents_chain', description: 'Всі документи справи через усі інстанції', params: [{ name: 'case_number', required: true }, { name: 'include_full_text' }, { name: 'max_docs' }], cost: '₴0.21–0.83' },
      { name: 'edrsr_get_decision_dispositive', description: 'Резолютивна частина рішення (ВИРІШИВ/УХВАЛИВ/ПОСТАНОВИВ)', params: [{ name: 'doc_id', required: true }], cost: '₴0.04' },
      { name: 'extract_document_sections', description: 'Структуровані секції з тексту документа', params: [{ name: 'text', required: true }], cost: '₴0.21–2.08' },
      { name: 'parse_document', description: 'Парсинг PDF/DOCX/HTML з OCR', params: [{ name: 'fileBase64', required: true }, { name: 'mimeType', required: true }, { name: 'filename' }], cost: '₴0.42–4.15' },
      { name: 'extract_key_clauses', description: 'Витяг ключових положень з контракту', params: [{ name: 'documentText', required: true }, { name: 'documentId' }], cost: '₴1.25–4.15' },
      { name: 'summarize_document', description: 'Резюме документа (quick/standard/deep)', params: [{ name: 'documentText', required: true }, { name: 'detailLevel' }], cost: '₴0.83–3.32' },
      { name: 'compare_documents', description: 'Семантичне порівняння двох версій документа', params: [{ name: 'oldDocumentText', required: true }, { name: 'newDocumentText', required: true }], cost: '₴1.25–4.98' },
      { name: 'batch_process_documents', description: 'Пакетна обробка документів', params: [{ name: 'documents', required: true }, { name: 'operation', required: true }], cost: 'залежить від обсягу' },
    ],
  },
  {
    title: 'Законодавство',
    tools: [
      { name: 'get_legislation_articles', description: 'Текст однієї або декількох статей (аліас: get_legislation_article)', params: [{ name: 'rada_id', required: true }, { name: 'article_numbers', required: true }], cost: '<₴0.42' },
      { name: 'get_legislation_section', description: 'Фрагмент за посиланням («ст. 625 ЦК»)', params: [{ name: 'reference', required: true }], cost: '<₴0.42' },
      { name: 'search_legislation', description: 'Семантичний пошук по законодавству', params: [{ name: 'query', required: true }, { name: 'rada_id' }, { name: 'limit' }], cost: '₴0.42–1.25' },
      { name: 'get_legislation_structure', description: 'Структура акту: зміст, розділи, глави', params: [{ name: 'rada_id', required: true }], cost: '<₴0.42' },
      { name: 'get_legislation_history', description: 'Історія змін законодавчого акту', params: [{ name: 'rada_id', required: true }], cost: '<₴0.42' },
      { name: 'search_procedural_norms', description: 'Пошук процесуальних норм (ЦПК/ГПК/КАС)', params: [{ name: 'query', required: true }, { name: 'procedure_code' }], cost: '₴0.21–1.25' },
      { name: 'find_relevant_law_articles', description: 'Статті, що часто застосовуються у справах за темою (аліас search_legislation)', params: [{ name: 'intent', required: true }, { name: 'limit' }], cost: '₴0.42–0.83' },
      { name: 'search_legal_acts', description: 'Пошук нормативних актів (ЄДРНПА)', params: [{ name: 'query', required: true }, { name: 'limit' }], cost: '₴0.04–0.21' },
    ],
  },
  {
    title: 'Процесуальні інструменти',
    tools: [
      { name: 'calculate_procedural_deadlines', description: 'Калькулятор процесуальних строків', params: [{ name: 'procedure_code', required: true }, { name: 'event_type', required: true }, { name: 'event_date', required: true }], cost: '₴0.83–3.32' },
      { name: 'build_procedural_checklist', description: 'Процесуальний чекліст із посиланням на норму', params: [{ name: 'procedure_code', required: true }, { name: 'stage' }, { name: 'case_category' }], cost: '₴0.42–1.25' },
      { name: 'calculate_monetary_claims', description: 'Розрахунки грошових вимог (3% річних тощо)', params: [{ name: 'amount', required: true }, { name: 'date_from', required: true }, { name: 'date_to', required: true }, { name: 'claim_type' }], cost: '<₴0.42' },
      { name: 'build_legal_decision', description: 'Побудова юридичного рішення на основі аналізу (timeout: 120с)', params: [{ name: 'query', required: true }, { name: 'context', required: true }, { name: 'pro_cases' }, { name: 'contra_cases' }, { name: 'legislation' }], cost: '₴2.08–6.22' },
    ],
  },
  {
    title: 'Pipeline',
    tools: [
      { name: 'classify_intent', description: 'Класифікація запиту для роутингу pipeline', params: [{ name: 'query', required: true }], cost: '<₴0.42' },
      { name: 'retrieve_legal_sources', description: 'RAG retrieval: сирі джерела без аналізу', params: [{ name: 'query', required: true }], cost: 'залежить від обсягу' },
      { name: 'validate_response', description: 'Trust layer: перевірка відповіді на галюцинації', params: [{ name: 'response', required: true }, { name: 'sources', required: true }], cost: '₴0.42–1.25' },
      { name: 'format_answer_pack', description: 'Упаковщик результату в структуру norm/position/conclusion/risks', params: [{ name: 'norm', required: true }, { name: 'position' }, { name: 'conclusion' }, { name: 'risks' }], cost: '<₴0.42' },
    ],
  },
  {
    title: 'Due Diligence',
    tools: [
      { name: 'bulk_review_runner', description: 'Масова перевірка контрагентів', params: [{ name: 'entities', required: true }], cost: '₴2.08–8.30' },
      { name: 'risk_scoring', description: 'Скорінг ризиків по суб\'єкту', params: [{ name: 'entity', required: true }], cost: '₴0.83–3.32' },
      { name: 'generate_dd_report', description: 'Генерація звіту Due Diligence', params: [{ name: 'entity', required: true }, { name: 'depth' }], cost: '₴4.15–12.45' },
    ],
  },
  {
    title: 'ЄСПЛ та міжнародне право',
    tools: [
      { name: 'search_echr_practice', description: 'Пошук практики Європейського суду з прав людини', params: [{ name: 'query', required: true }, { name: 'limit' }], cost: '₴0.42–2.08' },
      { name: 'get_echr_document', description: 'Текст рішення ЄСПЛ', params: [{ name: 'doc_id', required: true }], cost: '₴0.21–0.83' },
    ],
  },
  {
    title: 'Верховна Рада',
    tools: [
      { name: 'rada_search_parliament_bills', description: 'Пошук законопроектів ВР', params: [{ name: 'query', required: true }, { name: 'status' }, { name: 'initiator' }, { name: 'date_from' }, { name: 'date_to' }], cost: '₴0.42–2.08' },
      { name: 'rada_get_deputy_info', description: 'Інформація про народного депутата', params: [{ name: 'name' }, { name: 'rada_id' }, { name: 'include_voting_record' }], cost: '₴0.21–0.42' },
      { name: 'rada_search_legislation_text', description: 'Пошук у текстах законів з посиланнями на судові рішення', params: [{ name: 'law_identifier' }, { name: 'article' }, { name: 'search_text' }], cost: '₴0.21–0.83' },
      { name: 'rada_analyze_voting_record', description: 'Аналіз голосувань депутата з AI-інсайтами', params: [{ name: 'deputy_name', required: true }, { name: 'date_from' }, { name: 'date_to' }], cost: '₴0.83–4.15' },
    ],
  },
  {
    title: 'Реєстри (OpenReyestr)',
    tools: [
      { name: 'openreyestr_search_entities', description: 'Пошук юридичних осіб та ФОП', params: [{ name: 'query', required: true }, { name: 'edrpou' }, { name: 'entityType' }, { name: 'limit' }], cost: '₴0.04–0.21' },
      { name: 'openreyestr_get_entity_details', description: 'Повна інформація: засновники, бенефіціари, керівники', params: [{ name: 'record', required: true }, { name: 'entityType' }], cost: '₴0.04–0.12' },
      { name: 'openreyestr_search_beneficiaries', description: 'Пошук бенефіціарних власників компаній', params: [{ name: 'query', required: true }, { name: 'limit' }], cost: '₴0.08–0.21' },
      { name: 'openreyestr_get_by_edrpou', description: 'Швидкий пошук за кодом ЄДРПОУ', params: [{ name: 'edrpou', required: true }], cost: '₴0.04' },
      { name: 'openreyestr_search_debtors', description: 'Пошук боржників', params: [{ name: 'query', required: true }, { name: 'limit' }], cost: '₴0.04–0.21' },
      { name: 'openreyestr_search_enforcement_proceedings', description: 'Виконавчі провадження', params: [{ name: 'query', required: true }, { name: 'limit' }], cost: '₴0.04–0.21' },
      { name: 'openreyestr_search_bankruptcy_cases', description: 'Справи про банкрутство', params: [{ name: 'query', required: true }, { name: 'limit' }], cost: '₴0.04–0.21' },
      { name: 'openreyestr_search_notaries', description: 'Пошук нотаріусів', params: [{ name: 'query', required: true }, { name: 'limit' }], cost: '₴0.04' },
      { name: 'openreyestr_search_court_experts', description: 'Пошук судових експертів', params: [{ name: 'query', required: true }, { name: 'limit' }], cost: '₴0.04' },
      { name: 'openreyestr_search_arbitration_managers', description: 'Пошук арбітражних керуючих', params: [{ name: 'query', required: true }, { name: 'limit' }], cost: '₴0.04' },
      { name: 'openreyestr_search_prozorro', description: 'Пошук у системі Prozorro', params: [{ name: 'query', required: true }, { name: 'limit' }], cost: '₴0.04–0.21' },
      { name: 'openreyestr_search_vat_payers', description: 'Пошук платників ПДВ', params: [{ name: 'query', required: true }, { name: 'limit' }], cost: '₴0.04' },
      { name: 'openreyestr_search_single_tax_payers', description: 'Пошук платників єдиного податку', params: [{ name: 'query', required: true }, { name: 'limit' }], cost: '₴0.04' },
      { name: 'openreyestr_search_tax_debt', description: 'Пошук податкового боргу', params: [{ name: 'query', required: true }, { name: 'limit' }], cost: '₴0.04' },
      { name: 'openreyestr_search_rnbo_sanctions', description: 'Пошук санкцій РНБО', params: [{ name: 'query', required: true }, { name: 'limit' }], cost: '₴0.04' },
      { name: 'openreyestr_search_termination_started', description: 'Пошук ЮО у стані припинення', params: [{ name: 'query', required: true }, { name: 'limit' }], cost: '₴0.04' },
      { name: 'openreyestr_get_statistics', description: 'Статистика по реєстру', cost: '₴0.04' },
    ],
  },
  {
    title: 'Відкриті дані',
    tools: [
      { name: 'search_registry', description: 'Єдиний інструмент для 22 реєстрів відкритих даних (санкції, адвокати, ТМ, патенти, корупціонери, банки НБУ та ін.)', params: [{ name: 'registry', required: true }, { name: 'filters', required: true }, { name: 'limit' }], cost: '₴0.04' },
      { name: 'search_judges', description: 'Реєстр суддів ВККС (з історією)', params: [{ name: 'full_name' }, { name: 'court_name' }, { name: 'include_history' }, { name: 'limit' }], cost: '₴0.04' },
      { name: 'search_edrnpa', description: 'Реєстр нормативно-правових актів', params: [{ name: 'name' }, { name: 'number' }, { name: 'publisher' }, { name: 'include_text' }, { name: 'limit' }], cost: '₴0.04' },
      { name: 'search_vkks', description: 'Дані ВККС (5 категорій: judges, evaluations, declarations, vacancies, efficiency)', params: [{ name: 'category', required: true }, { name: 'judge_name' }, { name: 'court_name' }, { name: 'limit' }], cost: '₴0.04' },
      { name: 'search_vrp_decisions', description: 'Рішення Вищої ради правосуддя', params: [{ name: 'title' }, { name: 'authority' }, { name: 'decision_num' }, { name: 'limit' }], cost: '₴0.04' },
      { name: 'search_vrp_judges_discipline', description: 'Дисциплінарні дані суддів (звільнені/відсторонені/втручання)', params: [{ name: 'judge_name' }, { name: 'court_name' }, { name: 'type' }, { name: 'limit' }], cost: '₴0.04' },
      { name: 'search_public_spending', description: '��ошук державних витрат (timeout: 120с)', params: [{ name: 'edrpou' }, { name: 'contractor_name' }, { name: 'contractor_edrpou' }, { name: 'date_from' }, { name: 'date_to' }, { name: 'min_amount' }, { name: 'max_amount' }, { name: 'doc_type' }, { name: 'limit' }], cost: '₴0.04–0.21' },
      { name: 'search_invalid_passports', description: 'Перевірка недійсних паспортів (МВС)', params: [{ name: 'd_series' }, { name: 'd_number' }, { name: 'limit' }], cost: '₴0.04' },
      { name: 'search_terrorism_list', description: 'Перелік терористів ДСФМУ', params: [{ name: 'name', required: true }, { name: 'limit' }], cost: '₴0.04' },
    ],
  },
  {
    title: 'Vault',
    tools: [
      { name: 'store_document', description: 'Зберегти документ у vault', params: [{ name: 'title', required: true }, { name: 'content', required: true }, { name: 'metadata' }, { name: 'tags' }], cost: '<₴0.42' },
      { name: 'get_document', description: 'Отримати документ із vault за ID', params: [{ name: 'document_id', required: true }], cost: '<₴0.42' },
      { name: 'list_documents', description: 'Список документів із фільтрацією', params: [{ name: 'filters' }, { name: 'limit' }, { name: 'offset' }], cost: '<₴0.42' },
      { name: 'semantic_search', description: 'Семантичний пошук по vault через Qdrant', params: [{ name: 'query', required: true }, { name: 'limit' }, { name: 'filters' }], cost: '₴0.42–1.25' },
      { name: 'delete_document', description: 'Видалити документ із vault', params: [{ name: 'document_id', required: true }], cost: '<₴0.42' },
      { name: 'update_document', description: 'Оновити документ у vault', params: [{ name: 'document_id', required: true }, { name: 'title' }, { name: 'content' }, { name: 'metadata' }], cost: '<₴0.42' },
    ],
  },
];

/* ================================================================
   TABLE OF CONTENTS
   ================================================================ */

const tocItems = [
  { id: 'overview', label: 'Огляд' },
  { id: 'authentication', label: 'Автентифікація' },
  { id: 'endpoints', label: 'Ендпоінти' },
  { id: 'tools', label: 'Інструменти' },
  { id: 'examples', label: 'Приклади' },
  { id: 'mcp-clients', label: 'MCP клієнти' },
  { id: 'pricing', label: 'Вартість' },
];

/* ================================================================
   MAIN COMPONENT
   ================================================================ */

export function DeveloperDocsPage() {
  const [activeSection, setActiveSection] = useState('overview');
  const contentRef = useRef<HTMLDivElement>(null);

  useDocumentMeta({
    title: 'LEX AI API — документація MCP сервера | 100+ юридичних інструментів',
    description: 'Підключіть Claude Desktop, Cursor, VS Code або ChatGPT до MCP сервера LEX AI (mcp.legal.org.ua/sse). 100+ інструментів: судова практика, законодавство, реєстри, відкриті дані, due diligence. REST API та MCP SSE транспорт.',
    ogTitle: 'LEX AI API — MCP сервер для юридичного аналізу',
    ogDescription: 'Підключіть Claude, Cursor або ChatGPT до 100+ інструментів юридичного аналізу через MCP SSE. Судова практика, законодавство, реєстри України.',
    ogImage: 'https://legal.org.ua/og-image.png',
  });

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // Track active section on scroll
  useEffect(() => {
    const container = contentRef.current;
    if (!container) return;

    const handleScroll = () => {
      const sections = container.querySelectorAll('[data-section]');
      let current = 'overview';
      for (const section of sections) {
        const el = section as HTMLElement;
        if (el.offsetTop - 80 <= container.scrollTop) {
          current = el.id;
        }
      }
      setActiveSection(current);
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div ref={contentRef} className="flex-1 h-full overflow-y-auto">
      <WebAPIJsonLd
        name="LEX AI MCP Server"
        description="MCP сервер для юридичного аналізу: 100+ інструментів — судова практика (110M+ рішень), законодавство, реєстри юридичних осіб, відкриті дані, due diligence. Підключається через SSE до Claude Desktop, Cursor, VS Code, ChatGPT."
        url="https://mcp.legal.org.ua/sse"
        documentationUrl="https://legal.org.ua/developer/docs"
        provider={{ name: "SecondLayer", url: "https://legal.org.ua" }}
        termsOfService="https://legal.org.ua/ua/developer-offer"
      />
      <div className="max-w-[820px] mx-auto px-6 py-8 pb-32">

        {/* Sticky TOC bar */}
        <nav className="sticky top-0 z-10 -mx-6 px-6 py-2.5 mb-6 bg-claude-bg/95 backdrop-blur-sm border-b border-claude-border/50 overflow-x-auto">
          <div className="flex gap-1">
            {tocItems.map(item => (
              <button
                key={item.id}
                onClick={() => scrollTo(item.id)}
                className={`
                  px-3 py-1.5 rounded-md text-[12px] font-medium whitespace-nowrap transition-colors
                  ${activeSection === item.id
                    ? 'bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-900'
                    : 'text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100 dark:hover:text-zinc-200 dark:hover:bg-zinc-800'
                  }
                `}
              >
                {item.label}
              </button>
            ))}
          </div>
        </nav>

        <OverviewSection />
        <Divider />
        <GettingStartedSection />
        <Divider />
        <ToolsSection />
        <Divider />
        <ExamplesSection />
        <Divider />
        <MCPClientsSection />
        <Divider />
        <PricingSection />
      </div>
    </div>
  );
}


/* ================================================================
   SECTION: OVERVIEW
   ================================================================ */

function OverviewSection() {
  return (
    <section id="overview" data-section>
      <h1 className="text-[28px] font-bold text-claude-text tracking-tight leading-tight">
        LEX AI Platform API
      </h1>
      <p className="mt-3 text-[15px] text-claude-subtext leading-relaxed max-w-[640px]">
        Доступ до 100+ інструментів юридичного аналізу через уніфікований API.
        Судова практика, законодавство, реєстри, відкриті дані, парламентські дані.
      </p>

      <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-px bg-claude-border rounded-xl overflow-hidden border border-claude-border">
        <InfoCell label="Інструменти" value="100+" />
        <InfoCell label="Мікросервіси" value="3" />
        <InfoCell label="Транспорти" value="REST, MCP, SSE" />
      </div>

      <h2 className="mt-10 text-[20px] font-semibold text-claude-text">Сервіси</h2>

      <div className="mt-4 space-y-3">
        <ServiceRow name="mcp_backend" count={80} description="Судова практика, аналіз, законодавство, парсинг, vault, відкриті дані, due diligence" />
        <ServiceRow name="mcp_rada" count={4} description="Законопроекти, депутати, голосування, тексти законів" />
        <ServiceRow name="mcp_openreyestr" count={27} description="Юридичні особи, ФОП, бенефіціари, боржники, Prozorro, податки, санкції" />
      </div>

      <h2 className="mt-10 text-[20px] font-semibold text-claude-text">Транспорти</h2>

      <table className="mt-4 w-full text-[13px]">
        <thead>
          <tr className="border-b border-claude-border text-left">
            <Th>Протокол</Th>
            <Th>Ендпоінт</Th>
            <Th>Призначення</Th>
          </tr>
        </thead>
        <tbody className="text-claude-subtext">
          <tr className="border-b border-claude-border/50">
            <Td>HTTP REST</Td>
            <Td><Code>POST {API_BASE}/:tool</Code></Td>
            <Td>Вебдодатки, серверні інтеграції</Td>
          </tr>
          <tr className="border-b border-claude-border/50">
            <Td>MCP SSE</Td>
            <Td><Code>{MCP_SSE_URL}</Code></Td>
            <Td>Claude, Cursor, VS Code, Continue.dev</Td>
          </tr>
          <tr className="border-b border-claude-border/50">
            <Td>SSE Streaming</Td>
            <Td><Code>POST {API_BASE}/:tool/stream</Code></Td>
            <Td>Тривалі операції з поточною відповіддю</Td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}

/* ================================================================
   SECTION: GETTING STARTED
   ================================================================ */

function GettingStartedSection() {
  return (
    <section>
      <div id="getting-started" data-section />

      {/* Authentication */}
      <div id="authentication" data-section>
        <h2 className="text-[20px] font-semibold text-claude-text">Автентифікація</h2>
        <p className="mt-2 text-[14px] text-claude-subtext leading-relaxed">
          Всі запити потребують автентифікації через Bearer Token. Згенеруйте API ключ
          у розділі <strong>Профіль &rarr; API токени</strong>.
        </p>

        <CodeBlock lang="http" code={`Authorization: Bearer YOUR_API_KEY`} />

        <h3 className="mt-6 text-[15px] font-semibold text-claude-text">Методи автентифікації</h3>
        <table className="mt-3 w-full text-[13px]">
          <thead>
            <tr className="border-b border-claude-border text-left">
              <Th>Метод</Th>
              <Th>Призначення</Th>
            </tr>
          </thead>
          <tbody className="text-claude-subtext">
            <tr className="border-b border-claude-border/50">
              <Td>Bearer Token</Td>
              <Td>API клієнти, MCP клієнти, скрипти</Td>
            </tr>
            <tr className="border-b border-claude-border/50">
              <Td>JWT / Google OAuth</Td>
              <Td>Вебдодатки з інтерактивною авторизацією</Td>
            </tr>
          </tbody>
        </table>

        <h3 className="mt-6 text-[15px] font-semibold text-claude-text">Ліміти</h3>
        <div className="mt-3 text-[13px] text-claude-subtext space-y-1">
          <p>Rate limit залежить від тарифного плану.</p>
          <p>Максимальний розмір тіла запиту: <Code>10 MB</Code></p>
          <p>Timeout: <Code>120 с</Code> (SSE streaming &mdash; без обмежень)</p>
        </div>
      </div>

      {/* Endpoints */}
      <div id="endpoints" data-section className="mt-10">
        <h2 className="text-[20px] font-semibold text-claude-text">Ендпоінти</h2>

        <table className="mt-4 w-full text-[13px]">
          <thead>
            <tr className="border-b border-claude-border text-left">
              <Th>Метод</Th>
              <Th>Шлях</Th>
              <Th>Опис</Th>
            </tr>
          </thead>
          <tbody className="text-claude-subtext">
            <EndpointTableRow method="POST" path="/api/tools/:toolName" desc="Виконати інструмент" />
            <EndpointTableRow method="POST" path="/api/tools/:toolName/stream" desc="Виконати з SSE streaming" />
            <EndpointTableRow method="POST" path="/api/tools/batch" desc="Пакетне виконання" />
            <EndpointTableRow method="GET" path="/api/tools" desc="Список доступних інструментів" />
            <EndpointTableRow method="GET" path="/health" desc="Перевірка стану сервісу" />
          </tbody>
        </table>
      </div>

      {/* Quick Start */}
      <div id="quick-start" data-section className="mt-10">
        <h2 className="text-[20px] font-semibold text-claude-text">Швидкий старт</h2>
        <p className="mt-2 text-[14px] text-claude-subtext leading-relaxed">
          Отримайте API ключ та зробіть перший запит:
        </p>
        <CodeBlock lang="bash" code={`curl -X POST ${API_BASE}/search_legal_precedents \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"arguments": {"query": "відшкодування збитків ДТП", "limit": 5}}'`} />
      </div>
    </section>
  );
}

/* ================================================================
   SECTION: TOOLS
   ================================================================ */

function ToolsSection() {
  return (
    <section id="tools" data-section>
      <h1 className="text-[24px] font-bold text-claude-text tracking-tight">Інструменти</h1>
      <p className="mt-2 text-[14px] text-claude-subtext leading-relaxed">
        Всі інструменти доступні через <Code>POST /api/tools/:toolName</Code> з тілом <Code>{`{"arguments": {...}}`}</Code>.
      </p>

      {toolGroups.map((group, i) => (
        <div key={i} id={`tools-${i}`} data-section className="mt-8">
          <h2 className="text-[17px] font-semibold text-claude-text pb-2 border-b border-claude-border">
            {group.title}
          </h2>
          <div className="divide-y divide-claude-border/50">
            {group.tools.map(tool => (
              <ToolEntry key={tool.name} tool={tool} />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

function ToolEntry({ tool }: { tool: ToolDef }) {
  return (
    <div className="py-4">
      <div className="flex items-baseline gap-3">
        <code className="text-[13px] font-mono font-semibold text-claude-text">
          {tool.name}
        </code>
        {tool.cost && (
          <span className="text-[11px] text-zinc-400">{tool.cost}</span>
        )}
      </div>
      <p className="mt-1 text-[13px] text-claude-subtext">{tool.description}</p>
      {tool.params && tool.params.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1">
          {tool.params.map(p => (
            <span key={p.name} className="text-[12px] font-mono text-claude-subtext">
              {p.name}{p.required && <span className="text-claude-accent ml-0.5">*</span>}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ================================================================
   SECTION: EXAMPLES
   ================================================================ */

function ExamplesSection() {
  return (
    <section id="examples" data-section>
      <h1 className="text-[24px] font-bold text-claude-text tracking-tight">Приклади коду</h1>

      <div id="example-curl" data-section className="mt-8">
        <h2 className="text-[17px] font-semibold text-claude-text">cURL</h2>
        <h3 className="mt-4 text-[14px] font-medium text-claude-text">Пошук судових рішень</h3>
        <CodeBlock lang="bash" code={`curl -X POST ${API_BASE}/search_legal_precedents \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "arguments": {
      "query": "відшкодування моральної шкоди при ДТП",
      "limit": 10,
      "time_range": "2023-2024"
    }
  }'`} />

        <h3 className="mt-6 text-[14px] font-medium text-claude-text">Юридичний аналіз</h3>
        <CodeBlock lang="bash" code={`curl -X POST ${API_BASE}/get_legal_advice \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "arguments": {
      "query": "Орендар не платить оренду 3 місяці, які мої права?",
      "reasoning_budget": "standard"
    }
  }'`} />

        <h3 className="mt-6 text-[14px] font-medium text-claude-text">Стаття закону</h3>
        <CodeBlock lang="bash" code={`curl -X POST ${API_BASE}/get_legislation_article \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"arguments": {"rada_id": "435-15", "article_number": "625"}}'`} />

        <div className="mt-3 text-[12px] text-zinc-400">
          Поширені <Code>rada_id</Code>: <Code>254к/96-вр</Code> (Конституція), <Code>435-15</Code> (ЦК), <Code>2341-14</Code> (ККУ), <Code>1618-15</Code> (ЦПК)
        </div>

        <h3 className="mt-6 text-[14px] font-medium text-claude-text">Пошук у реєстрі</h3>
        <CodeBlock lang="bash" code={`curl -X POST ${API_BASE}/openreyestr_search_entities \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"arguments": {"query": "Приватбанк", "entityType": "UO", "limit": 5}}'`} />
      </div>

      <div id="example-js" data-section className="mt-10">
        <h2 className="text-[17px] font-semibold text-claude-text">JavaScript / TypeScript</h2>
        <CodeBlock lang="typescript" code={`const response = await fetch('${API_BASE}/search_legal_precedents', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer YOUR_API_KEY',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    arguments: {
      query: 'стягнення заборгованості за кредитом',
      limit: 5,
    },
  }),
});

const data = await response.json();
console.log(data.result);`} />
      </div>

      <div id="example-python" data-section className="mt-10">
        <h2 className="text-[17px] font-semibold text-claude-text">Python</h2>
        <CodeBlock lang="python" code={`import requests

response = requests.post(
    '${API_BASE}/search_legal_precedents',
    headers={
        'Authorization': 'Bearer YOUR_API_KEY',
        'Content-Type': 'application/json',
    },
    json={
        'arguments': {
            'query': 'стягнення заборгованості за кредитом',
            'limit': 5,
        }
    }
)

print(response.json()['result'])`} />
      </div>

      <div id="example-sse" data-section className="mt-10">
        <h2 className="text-[17px] font-semibold text-claude-text">SSE Streaming</h2>
        <p className="mt-2 text-[13px] text-claude-subtext leading-relaxed">
          Для тривалих операцій використовуйте SSE endpoint. Відповідь надходить потоком подій.
        </p>
        <CodeBlock lang="typescript" code={`const response = await fetch('${API_BASE}/get_legal_advice/stream', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer YOUR_API_KEY',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    arguments: { query: 'трудовий спір звільнення', reasoning_budget: 'deep' }
  }),
});

const reader = response.body!.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  const chunk = decoder.decode(value);
  for (const line of chunk.split('\\n')) {
    if (line.startsWith('data: ')) {
      const event = JSON.parse(line.slice(6));
      console.log(event.type, event.data);
    }
  }
}`} />
      </div>
    </section>
  );
}

/* ================================================================
   SECTION: MCP CLIENTS
   ================================================================ */

function MCPClientsSection() {
  const mcpConfig = `{
  "mcpServers": {
    "secondlayer": {
      "type": "sse",
      "url": "${MCP_SSE_URL}",
      "headers": {
        "Authorization": "Bearer YOUR_API_TOKEN"
      }
    }
  }
}`;

  return (
    <section id="mcp-clients" data-section>
      <h1 className="text-[24px] font-bold text-claude-text tracking-tight">MCP клієнти</h1>
      <p className="mt-2 text-[14px] text-claude-subtext leading-relaxed">
        LEX AI підтримує MCP SSE транспорт. Згенеруйте токен у <a href="/profile" className="text-claude-accent hover:underline">Профілі &rarr; MCP Access Tokens</a>.
      </p>

      <div id="mcp-claude-code" data-section className="mt-8">
        <h2 className="text-[17px] font-semibold text-claude-text">Claude Code</h2>
        <p className="mt-2 text-[13px] text-claude-subtext">
          Додайте до <Code>~/.claude/settings.json</Code> або <Code>.mcp.json</Code> в корені проєкту:
        </p>
        <CodeBlock lang="json" code={mcpConfig} />
        <p className="mt-2 text-[12px] text-zinc-400">
          Після додавання перезапустіть Claude Code або виконайте <Code>/mcp</Code> для перепідключення.
        </p>
      </div>

      <div id="mcp-claude-desktop" data-section className="mt-8">
        <h2 className="text-[17px] font-semibold text-claude-text">Claude Desktop</h2>
        <p className="mt-2 text-[13px] text-claude-subtext">
          Додайте до <Code>claude_desktop_config.json</Code>:
        </p>
        <CodeBlock lang="json" code={mcpConfig} />
      </div>

      <div id="mcp-cursor" data-section className="mt-8">
        <h2 className="text-[17px] font-semibold text-claude-text">Cursor</h2>
        <p className="mt-2 text-[13px] text-claude-subtext">
          Збережіть як <Code>.cursor/mcp.json</Code> в корені проєкту:
        </p>
        <CodeBlock lang="json" code={mcpConfig} />
      </div>

      <div id="mcp-vscode" data-section className="mt-8">
        <h2 className="text-[17px] font-semibold text-claude-text">VS Code</h2>
        <p className="mt-2 text-[13px] text-claude-subtext">
          Збережіть як <Code>.vscode/mcp.json</Code>. Увімкніть: <Code>chat.mcp.discovery.enabled: true</Code>
        </p>
        <CodeBlock lang="json" code={mcpConfig} />
      </div>

      <div id="mcp-chatgpt" data-section className="mt-8">
        <h2 className="text-[17px] font-semibold text-claude-text">ChatGPT</h2>
        <p className="mt-2 text-[13px] text-claude-subtext leading-relaxed">
          ChatGPT підтримує MCP через SSE транспорт (Plus/Team/Enterprise).
        </p>
        <ol className="mt-3 text-[13px] text-claude-subtext space-y-2 list-decimal list-inside">
          <li>Відкрийте <Code>Settings &rarr; Features &rarr; MCP Servers &rarr; Add</Code></li>
          <li>Server URL: <Code>https://mcp.legal.org.ua/sse</Code></li>
          <li>Authorization header: <Code>Bearer YOUR_API_TOKEN</Code></li>
        </ol>
      </div>

      <div id="mcp-continue" data-section className="mt-8">
        <h2 className="text-[17px] font-semibold text-claude-text">Continue.dev</h2>
        <p className="mt-2 text-[13px] text-claude-subtext">
          Збережіть як <Code>.continue/mcpServers/secondlayer.yaml</Code>:
        </p>
        <CodeBlock lang="yaml" code={`name: secondlayer
type: sse
url: ${MCP_SSE_URL}

headers:
  Authorization: "Bearer YOUR_API_TOKEN"`} />
      </div>

      <div className="mt-8">
        <h2 className="text-[17px] font-semibold text-claude-text">Версіонування</h2>
        <table className="mt-3 w-full text-[13px]">
          <thead>
            <tr className="border-b border-claude-border text-left">
              <Th>Версія</Th>
              <Th>URL</Th>
              <Th>Статус</Th>
            </tr>
          </thead>
          <tbody className="text-claude-subtext">
            <tr className="border-b border-claude-border/50">
              <Td>v1</Td>
              <Td><Code>{MCP_SSE_URL}</Code></Td>
              <Td>Stable</Td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ================================================================
   SECTION: PRICING
   ================================================================ */

function PricingSection() {
  return (
    <section id="pricing" data-section>
      <h1 className="text-[24px] font-bold text-claude-text tracking-tight">Вартість</h1>
      <p className="mt-2 text-[14px] text-claude-subtext leading-relaxed">
        Вартість залежить від складності інструменту та обсягу AI обробки.
        Включає OpenAI API виклики, векторний пошук, зовнішні API запити та кешування.
      </p>

      <table className="mt-6 w-full text-[13px]">
        <thead>
          <tr className="border-b border-claude-border text-left">
            <Th>Категорія</Th>
            <Th>Діапазон</Th>
            <Th>Приклади</Th>
          </tr>
        </thead>
        <tbody className="text-claude-subtext">
          <tr className="border-b border-claude-border/50 align-top">
            <Td>Мінімальна</Td>
            <Td>&lt;₴0.42</Td>
            <Td>get_legislation_article, classify_intent, store_document, openreyestr_*</Td>
          </tr>
          <tr className="border-b border-claude-border/50 align-top">
            <Td>Середня</Td>
            <Td>₴0.42–2.08</Td>
            <Td>search_legal_precedents, get_court_decision, search_legislation</Td>
          </tr>
          <tr className="border-b border-claude-border/50 align-top">
            <Td>Висока</Td>
            <Td>₴2.08–6.22</Td>
            <Td>search_supreme_court_practice, compare_practice_pro_contra, analyze_court_trends</Td>
          </tr>
          <tr className="border-b border-claude-border/50 align-top">
            <Td>Максимальна</Td>
            <Td>₴4.15–12.45</Td>
            <Td>get_legal_advice (комплексний аналіз з антигалюцинацією)</Td>
          </tr>
        </tbody>
      </table>

      <h2 className="mt-8 text-[17px] font-semibold text-claude-text">Правові документи</h2>
      <div className="mt-3 space-y-1.5 text-[13px]">
        <DocLink href="/ua/developer-offer" label="Оферта розробника" />
        <DocLink href="/en/api-terms" label="API Terms of Use (EN)" />
        <DocLink href="/ua/privacy" label="Політика конфіденційності" />
        <DocLink href="/ua/dpa" label="DPA (обробка даних)" />
      </div>
    </section>
  );
}

/* ================================================================
   SHARED UI PRIMITIVES
   ================================================================ */

function Divider() {
  return <hr className="my-12 border-claude-border" />;
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="pb-2 pr-4 text-[12px] font-semibold text-zinc-400 uppercase tracking-wider">
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="py-2.5 pr-4">{children}</td>;
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="text-[12px] font-mono bg-claude-bg-secondary text-claude-text px-1.5 py-0.5 rounded">
      {children}
    </code>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-claude-bg-secondary px-5 py-4">
      <div className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">{label}</div>
      <div className="text-[17px] font-semibold text-claude-text mt-1">{value}</div>
    </div>
  );
}

function ServiceRow({ name, count, description }: { name: string; count: number; description: string }) {
  return (
    <div className="flex items-baseline gap-4 py-2">
      <code className="text-[13px] font-mono font-semibold text-claude-text w-[160px] flex-shrink-0">{name}</code>
      <span className="text-[12px] text-zinc-400 w-[36px] flex-shrink-0">{count}+</span>
      <span className="text-[13px] text-claude-subtext">{description}</span>
    </div>
  );
}

function EndpointTableRow({ method, path, desc }: { method: string; path: string; desc: string }) {
  return (
    <tr className="border-b border-claude-border/50">
      <Td>
        <span className={`text-[11px] font-mono font-semibold ${method === 'GET' ? 'text-green-600' : 'text-claude-accent'}`}>
          {method}
        </span>
      </Td>
      <Td><Code>{path}</Code></Td>
      <Td>{desc}</Td>
    </tr>
  );
}

function DocLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="block text-claude-accent hover:underline"
    >
      {label}
    </a>
  );
}

function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mt-3 rounded-lg border border-claude-border overflow-hidden">
      <div className="flex items-center justify-between px-4 py-1.5 bg-claude-bg-secondary border-b border-claude-border">
        <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider">{lang}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-claude-text transition-colors"
        >
          {copied ? <Check size={11} /> : <Copy size={11} />}
          {copied ? 'Скопійовано' : 'Копіювати'}
        </button>
      </div>
      <pre className="px-4 py-3.5 bg-claude-bg overflow-x-auto">
        <code className="text-[12.5px] font-mono text-claude-text leading-relaxed whitespace-pre">{code}</code>
      </pre>
    </div>
  );
}
