import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  BookOpen, Code, Terminal, Key, Zap, Server, Globe, Copy, Check,
  ChevronDown, ChevronRight, ExternalLink, Shield, DollarSign,
  Search, FileText, Scale, Building2, BarChart3,
} from 'lucide-react';

type TabId = 'overview' | 'tools' | 'auth' | 'examples' | 'mcp-clients' | 'pricing';

interface ToolInfo {
  name: string;
  description: string;
  params?: string[];
  cost?: string;
  badge?: 'new' | 'popular' | 'dev';
}

interface ToolCategory {
  title: string;
  icon: React.ElementType;
  tools: ToolInfo[];
}

const API_BASE = 'https://platform.legal.org.ua/api/tools';

export function DeveloperDocsPage() {
  const [activeTab, setActiveTab] = useState<TabId>('overview');

  const tabs: { id: TabId; label: string; icon: React.ElementType }[] = [
    { id: 'overview', label: 'Огляд', icon: BookOpen },
    { id: 'tools', label: 'Інструменти', icon: Zap },
    { id: 'auth', label: 'Автентифікація', icon: Key },
    { id: 'examples', label: 'Приклади', icon: Code },
    { id: 'mcp-clients', label: 'MCP клієнти', icon: Terminal },
    { id: 'pricing', label: 'Вартість', icon: DollarSign },
  ];

  return (
    <div className="flex-1 h-full overflow-y-auto bg-claude-bg">
      <div className="max-w-4xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-claude-accent/10 rounded-xl">
            <BookOpen size={22} className="text-claude-accent" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-claude-text font-sans tracking-tight">
              API документація
            </h1>
            <p className="text-[13px] text-claude-subtext font-sans">
              LEX AI Platform &mdash; 56+ MCP інструментів для юридичного аналізу
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-6 mb-8 border-b border-claude-border overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-medium transition-colors whitespace-nowrap border-b-2 -mb-px ${
                activeTab === tab.id
                  ? 'text-claude-accent border-claude-accent'
                  : 'text-claude-subtext border-transparent hover:text-claude-text hover:border-claude-border'
              }`}
            >
              <tab.icon size={14} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          {activeTab === 'overview' && <OverviewTab />}
          {activeTab === 'tools' && <ToolsTab />}
          {activeTab === 'auth' && <AuthTab />}
          {activeTab === 'examples' && <ExamplesTab />}
          {activeTab === 'mcp-clients' && <MCPClientsTab />}
          {activeTab === 'pricing' && <PricingTab />}
        </motion.div>
      </div>
    </div>
  );
}

/* ==================== OVERVIEW TAB ==================== */

function OverviewTab() {
  return (
    <div className="space-y-6">
      <Card>
        <h2 className="text-[16px] font-semibold text-claude-text mb-3">Платформа LEX AI</h2>
        <p className="text-[13px] text-claude-subtext leading-relaxed mb-4">
          LEX AI надає API доступ до 56+ інструментів юридичного аналізу через три мікросервіси.
          Підтримуємо REST API, MCP stdio та SSE streaming.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <ServiceCard
            icon={Scale}
            title="mcp_backend"
            count="36+"
            description="Судова практика, аналіз, законодавство, парсинг документів"
          />
          <ServiceCard
            icon={Building2}
            title="mcp_rada"
            count="4"
            description="Парламентські дані, законопроекти, депутати, голосування"
          />
          <ServiceCard
            icon={Search}
            title="mcp_openreyestr"
            count="22"
            description="Реєстр юридичних осіб, ФОП, бенефіціари, боржники"
          />
        </div>
      </Card>

      <Card>
        <h2 className="text-[16px] font-semibold text-claude-text mb-3">Три транспорти</h2>
        <div className="space-y-3">
          <TransportRow
            icon={Globe}
            title="HTTP REST API"
            endpoint={`POST ${API_BASE}/:toolName`}
            description="Для вебдодатків та серверних інтеграцій"
          />
          <TransportRow
            icon={Terminal}
            title="MCP stdio"
            endpoint="node mcp_backend/dist/index.js"
            description="Для Claude Desktop, Cursor, VS Code, Continue.dev"
          />
          <TransportRow
            icon={Server}
            title="SSE Streaming"
            endpoint={`POST ${API_BASE}/:toolName/stream`}
            description="Для тривалих операцій з поточною відповіддю"
          />
        </div>
      </Card>

      <Card>
        <h2 className="text-[16px] font-semibold text-claude-text mb-3">Швидкий старт</h2>
        <CodeBlock language="bash" code={`# 1. Отримайте API ключ в Профіль → API токени
# 2. Зробіть перший запит

curl -X POST ${API_BASE}/search_legal_precedents \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"arguments": {"query": "відшкодування збитків ДТП", "limit": 5}}'`} />
      </Card>
    </div>
  );
}

/* ==================== TOOLS TAB ==================== */

const toolCategories: ToolCategory[] = [
  {
    title: 'Пошук судових рішень',
    icon: Gavel,
    tools: [
      { name: 'search_legal_precedents', description: 'Пошук юридичних прецедентів із семантичним аналізом', params: ['query', 'domain', 'time_range', 'limit'], cost: '$0.03-$0.10', badge: 'popular' },
      { name: 'search_supreme_court_practice', description: 'Пошук практики Верховного Суду (ВП/КЦС/КГС/КАС/ККС)', params: ['procedure_code', 'query', 'time_range', 'limit'], cost: '$0.05-$0.15' },
      { name: 'find_similar_fact_pattern_cases', description: 'Пошук справ за схожими фактами', params: ['procedure_code', 'facts_text', 'time_range', 'limit'], cost: '$0.03-$0.10' },
      { name: 'compare_practice_pro_contra', description: 'Підбірка практики «за/проти» за тезою', params: ['procedure_code', 'query', 'time_range', 'limit'], cost: '$0.05-$0.15' },
    ],
  },
  {
    title: 'Аналіз судової практики',
    icon: BarChart3,
    tools: [
      { name: 'analyze_case_pattern', description: 'Аналізує патерни: аргументи, ризики, статистика результатів', params: ['intent', 'case_ids'], cost: '$0.02-$0.08' },
      { name: 'get_similar_reasoning', description: 'Знаходить схожі судові обґрунтування за векторним пошуком', params: ['query', 'section_type', 'date_from', 'date_to'], cost: '$0.01-$0.03' },
      { name: 'get_citation_graph', description: 'Будує граф цитувань між справами', params: ['case_id', 'depth'], cost: '$0.005-$0.02' },
      { name: 'check_precedent_status', description: 'Перевіряє актуальність та статус прецеденту', params: ['case_id'], cost: '$0.005-$0.015' },
      { name: 'get_judge_statistics', description: 'Статистика по судді: кількість справ, результати', params: ['judge_name', 'court', 'time_range'], cost: '$0.01-$0.03' },
      { name: 'analyze_court_trends', description: 'Аналіз тенденцій судової практики', params: ['query', 'court', 'time_range'], cost: '$0.05-$0.12' },
    ],
  },
  {
    title: 'Робота з документами',
    icon: FileText,
    tools: [
      { name: 'get_court_decision', description: 'Повний текст рішення з секціями: ФАКТИ, ОБҐРУНТУВАННЯ, РІШЕННЯ', params: ['doc_id', 'case_number', 'depth'], cost: '$0.01-$0.04' },
      { name: 'get_case_documents_chain', description: 'Всі документи справи через усі інстанції', params: ['case_number', 'include_full_text', 'max_docs'], cost: '$0.005-$0.02', badge: 'new' },
      { name: 'parse_document', description: 'Парсинг PDF/DOCX/HTML з OCR', params: ['fileBase64', 'mimeType', 'filename'], cost: '$0.01-$0.10' },
      { name: 'extract_key_clauses', description: 'Витяг ключових положень з контракту', params: ['documentText', 'documentId'], cost: '$0.03-$0.10' },
      { name: 'summarize_document', description: 'Резюме документа (quick/standard/deep)', params: ['documentText', 'detailLevel'], cost: '$0.02-$0.08' },
      { name: 'compare_documents', description: 'Семантичне порівняння двох версій документа', params: ['oldDocumentText', 'newDocumentText'], cost: '$0.03-$0.12' },
    ],
  },
  {
    title: 'Законодавство',
    icon: BookOpen,
    tools: [
      { name: 'get_legislation_article', description: 'Повний текст конкретної статті', params: ['rada_id', 'article_number'], cost: 'мін.' },
      { name: 'get_legislation_articles', description: 'Декілька статей одночасно', params: ['rada_id', 'article_numbers[]'], cost: 'мін.' },
      { name: 'search_legislation', description: 'Семантичний пошук по законодавству', params: ['query', 'rada_id', 'limit'], cost: '$0.01-$0.03' },
      { name: 'get_legislation_structure', description: 'Структура акту: зміст, розділи, глави', params: ['rada_id'], cost: 'мін.' },
      { name: 'find_relevant_law_articles', description: 'Статті, що часто застосовуються у справах за темою', params: ['intent', 'limit'], cost: '$0.01-$0.02' },
    ],
  },
  {
    title: 'Процесуальні інструменти',
    icon: Scale,
    tools: [
      { name: 'calculate_procedural_deadlines', description: 'Калькулятор процесуальних строків', params: ['procedure_code', 'event_type', 'event_date'], cost: '$0.02-$0.08' },
      { name: 'build_procedural_checklist', description: 'Процесуальний чекліст із посиланням на норму', params: ['procedure_code', 'stage', 'case_category'], cost: '$0.01-$0.03' },
      { name: 'calculate_monetary_claims', description: 'Розрахунки грошових вимог (3% річних тощо)', params: ['amount', 'date_from', 'date_to', 'claim_type'], cost: 'мін.' },
    ],
  },
  {
    title: 'Комплексний аналіз',
    icon: Zap,
    tools: [
      { name: 'get_legal_advice', description: 'Повний юридичний аналіз з перевіркою джерел та антигалюцинацією', params: ['query', 'reasoning_budget'], cost: '$0.10-$0.30', badge: 'popular' },
      { name: 'classify_intent', description: 'Класифікація запиту для роутингу pipeline', params: ['query'], cost: 'мін.' },
      { name: 'retrieve_legal_sources', description: 'RAG retrieval: сирі джерела без аналізу', params: ['query'], cost: 'залежить від обсягу' },
      { name: 'validate_response', description: 'Trust layer: перевірка відповіді на галюцинації', params: ['response', 'sources'], cost: '$0.01-$0.03' },
    ],
  },
  {
    title: 'Верховна Рада (RADA)',
    icon: Building2,
    tools: [
      { name: 'rada_search_parliament_bills', description: 'Пошук законопроектів ВР', params: ['query', 'status', 'initiator', 'date_from', 'date_to'], cost: '$0.01-$0.05' },
      { name: 'rada_get_deputy_info', description: 'Інформація про народного депутата', params: ['name', 'rada_id', 'include_voting_record'], cost: '$0.005-$0.01' },
      { name: 'rada_search_legislation_text', description: 'Пошук у текстах законів з посиланнями на судові рішення', params: ['law_identifier', 'article', 'search_text'], cost: '$0.005-$0.02' },
      { name: 'rada_analyze_voting_record', description: 'Аналіз голосувань депутата з AI-інсайтами', params: ['deputy_name', 'date_from', 'date_to'], cost: '$0.02-$0.10' },
    ],
  },
  {
    title: 'Реєстри (OpenReyestr)',
    icon: Building2,
    tools: [
      { name: 'openreyestr_search_entities', description: 'Пошук юридичних осіб та ФОП', params: ['query', 'edrpou', 'entityType', 'limit'], cost: '$0.001-$0.005' },
      { name: 'openreyestr_get_entity_details', description: 'Повна інформація: засновники, бенефіціари, керівники', params: ['record', 'entityType'], cost: '$0.001-$0.003' },
      { name: 'openreyestr_search_beneficiaries', description: 'Пошук бенефіціарних власників компаній', params: ['query', 'limit'], cost: '$0.002-$0.005' },
      { name: 'openreyestr_get_by_edrpou', description: 'Швидкий пошук за кодом ЄДРПОУ', params: ['edrpou'], cost: '$0.001' },
      { name: 'openreyestr_search_debtors', description: 'Пошук боржників', params: ['query', 'limit'], cost: '$0.001-$0.005' },
      { name: 'openreyestr_search_enforcement_proceedings', description: 'Виконавчі провадження', params: ['query', 'limit'], cost: '$0.001-$0.005' },
      { name: 'openreyestr_search_bankruptcy_cases', description: 'Справи про банкрутство', params: ['query', 'limit'], cost: '$0.001-$0.005' },
      { name: 'openreyestr_search_notaries', description: 'Пошук нотаріусів', params: ['query', 'limit'], cost: '$0.001' },
      { name: 'openreyestr_search_prozorro', description: 'Пошук у системі Prozorro', params: ['query', 'limit'], cost: '$0.001-$0.005' },
      { name: 'openreyestr_get_statistics', description: 'Статистика по реєстру', cost: '$0.001' },
    ],
  },
  {
    title: 'Vault (сховище документів)',
    icon: Shield,
    tools: [
      { name: 'store_document', description: 'Зберегти документ у vault', params: ['title', 'content', 'metadata', 'tags'], cost: 'мін.' },
      { name: 'get_document', description: 'Отримати документ із vault за ID', params: ['document_id'], cost: 'мін.' },
      { name: 'list_documents', description: 'Список документів із фільтрацією', params: ['filters', 'limit', 'offset'], cost: 'мін.' },
      { name: 'semantic_search', description: 'Семантичний пошук по vault через Qdrant', params: ['query', 'limit', 'filters'], cost: '$0.01-$0.03' },
    ],
  },
];

function ToolsTab() {
  const [expandedCategory, setExpandedCategory] = useState<number | null>(0);

  return (
    <div className="space-y-3">
      <p className="text-[13px] text-claude-subtext mb-4">
        Повний каталог інструментів. Всі доступні через <code className="text-[12px] bg-claude-bg-secondary px-1.5 py-0.5 rounded">POST /api/tools/:toolName</code>
      </p>
      {toolCategories.map((cat, i) => (
        <div key={i} className="bg-white rounded-xl border border-claude-border overflow-hidden">
          <button
            onClick={() => setExpandedCategory(expandedCategory === i ? null : i)}
            className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-claude-bg-secondary/50 transition-colors"
          >
            <cat.icon size={16} className="text-claude-accent flex-shrink-0" />
            <span className="text-[14px] font-semibold text-claude-text flex-1 text-left">{cat.title}</span>
            <span className="text-[11px] text-claude-subtext bg-claude-bg-secondary px-2 py-0.5 rounded-full">
              {cat.tools.length}
            </span>
            {expandedCategory === i ? <ChevronDown size={14} className="text-claude-subtext" /> : <ChevronRight size={14} className="text-claude-subtext" />}
          </button>
          {expandedCategory === i && (
            <div className="border-t border-claude-border divide-y divide-claude-border">
              {cat.tools.map((tool) => (
                <ToolRow key={tool.name} tool={tool} />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function ToolRow({ tool }: { tool: ToolInfo }) {
  return (
    <div className="px-5 py-3 hover:bg-claude-bg-secondary/30 transition-colors">
      <div className="flex items-center gap-2 mb-1">
        <code className="text-[12.5px] font-mono font-semibold text-claude-text">{tool.name}</code>
        {tool.badge === 'new' && <span className="text-[9px] font-semibold bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full uppercase">new</span>}
        {tool.badge === 'popular' && <span className="text-[9px] font-semibold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full uppercase">popular</span>}
        {tool.cost && <span className="text-[11px] text-claude-subtext ml-auto">{tool.cost}</span>}
      </div>
      <p className="text-[12px] text-claude-subtext">{tool.description}</p>
      {tool.params && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {tool.params.map((p) => (
            <span key={p} className="text-[10.5px] font-mono bg-claude-bg-secondary text-claude-subtext px-1.5 py-0.5 rounded">{p}</span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ==================== AUTH TAB ==================== */

function AuthTab() {
  return (
    <div className="space-y-6">
      <Card>
        <h2 className="text-[16px] font-semibold text-claude-text mb-3">Автентифікація</h2>
        <p className="text-[13px] text-claude-subtext leading-relaxed mb-4">
          Платформа підтримує два методи автентифікації: Bearer Token (для API клієнтів) та JWT/OAuth (для веб-користувачів).
        </p>

        <h3 className="text-[14px] font-semibold text-claude-text mt-5 mb-2">Bearer Token</h3>
        <p className="text-[13px] text-claude-subtext mb-3">
          Отримайте API ключ у розділі <strong>Профіль → API токени</strong>. Передавайте його у заголовку кожного запиту:
        </p>
        <CodeBlock language="http" code={`Authorization: Bearer YOUR_API_KEY`} />

        <h3 className="text-[14px] font-semibold text-claude-text mt-5 mb-2">JWT/OAuth</h3>
        <p className="text-[13px] text-claude-subtext mb-3">
          Для вебдодатків використовуйте Google OAuth для отримання JWT токена.
        </p>

        <h3 className="text-[14px] font-semibold text-claude-text mt-5 mb-2">Ліміти</h3>
        <div className="bg-claude-bg-secondary rounded-lg p-4 text-[13px] text-claude-subtext space-y-1">
          <p>Rate limit залежить від вашого тарифного плану</p>
          <p>Максимальний розмір тіла запиту: 10 MB</p>
          <p>Timeout: 120 секунд (для SSE streaming — без обмежень)</p>
        </div>
      </Card>

      <Card>
        <h2 className="text-[16px] font-semibold text-claude-text mb-3">Ендпоінти</h2>
        <div className="space-y-3">
          <EndpointRow method="POST" path="/api/tools/:toolName" description="Виконати інструмент" />
          <EndpointRow method="POST" path="/api/tools/:toolName/stream" description="Виконати з SSE streaming" />
          <EndpointRow method="POST" path="/api/tools/batch" description="Пакетне виконання інструментів" />
          <EndpointRow method="GET" path="/health" description="Перевірка стану сервісу" />
          <EndpointRow method="GET" path="/api/tools" description="Список доступних інструментів" />
        </div>
      </Card>
    </div>
  );
}

/* ==================== EXAMPLES TAB ==================== */

function ExamplesTab() {
  return (
    <div className="space-y-6">
      <Card>
        <h2 className="text-[16px] font-semibold text-claude-text mb-3">Пошук судових рішень</h2>
        <CodeBlock language="bash" code={`curl -X POST ${API_BASE}/search_legal_precedents \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "arguments": {
      "query": "відшкодування моральної шкоди при ДТП",
      "limit": 10,
      "time_range": "2023-2024"
    }
  }'`} />
      </Card>

      <Card>
        <h2 className="text-[16px] font-semibold text-claude-text mb-3">Комплексний юридичний аналіз</h2>
        <CodeBlock language="bash" code={`curl -X POST ${API_BASE}/get_legal_advice \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "arguments": {
      "query": "Орендар не платить оренду 3 місяці, які мої права?",
      "reasoning_budget": "standard"
    }
  }'`} />
      </Card>

      <Card>
        <h2 className="text-[16px] font-semibold text-claude-text mb-3">Отримати статтю закону</h2>
        <CodeBlock language="bash" code={`curl -X POST ${API_BASE}/get_legislation_article \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "arguments": {
      "rada_id": "435-15",
      "article_number": "625"
    }
  }'`} />
        <p className="text-[12px] text-claude-subtext mt-2">
          Популярні rada_id: <code className="bg-claude-bg-secondary px-1 py-0.5 rounded text-[11px]">254к/96-вр</code> (Конституція),
          <code className="bg-claude-bg-secondary px-1 py-0.5 rounded text-[11px] ml-1">435-15</code> (ЦК),
          <code className="bg-claude-bg-secondary px-1 py-0.5 rounded text-[11px] ml-1">2341-14</code> (ККУ),
          <code className="bg-claude-bg-secondary px-1 py-0.5 rounded text-[11px] ml-1">1618-15</code> (ЦПК)
        </p>
      </Card>

      <Card>
        <h2 className="text-[16px] font-semibold text-claude-text mb-3">Пошук у реєстрі</h2>
        <CodeBlock language="bash" code={`curl -X POST ${API_BASE}/openreyestr_search_entities \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "arguments": {
      "query": "Приватбанк",
      "entityType": "UO",
      "limit": 5
    }
  }'`} />
      </Card>

      <Card>
        <h2 className="text-[16px] font-semibold text-claude-text mb-3">JavaScript / TypeScript</h2>
        <CodeBlock language="typescript" code={`const response = await fetch('${API_BASE}/search_legal_precedents', {
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
      </Card>

      <Card>
        <h2 className="text-[16px] font-semibold text-claude-text mb-3">Python</h2>
        <CodeBlock language="python" code={`import requests

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
      </Card>

      <Card>
        <h2 className="text-[16px] font-semibold text-claude-text mb-3">SSE Streaming</h2>
        <CodeBlock language="typescript" code={`const response = await fetch('${API_BASE}/get_legal_advice/stream', {
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
  // Парсимо SSE events: "data: {...}\\n\\n"
  for (const line of chunk.split('\\n')) {
    if (line.startsWith('data: ')) {
      const event = JSON.parse(line.slice(6));
      console.log(event.type, event.data);
    }
  }
}`} />
      </Card>
    </div>
  );
}

/* ==================== MCP CLIENTS TAB ==================== */

function MCPClientsTab() {
  return (
    <div className="space-y-6">
      <Card>
        <h2 className="text-[16px] font-semibold text-claude-text mb-3">Claude Desktop</h2>
        <p className="text-[13px] text-claude-subtext mb-3">
          Додайте до <code className="bg-claude-bg-secondary px-1.5 py-0.5 rounded text-[11px]">claude_desktop_config.json</code>:
        </p>
        <CodeBlock language="json" code={`{
  "mcpServers": {
    "secondlayer": {
      "command": "node",
      "args": ["<project-root>/mcp_backend/dist/index.js"],
      "env": {
        "POSTGRES_HOST": "localhost",
        "POSTGRES_PORT": "5432",
        "POSTGRES_USER": "secondlayer",
        "POSTGRES_PASSWORD": "YOUR_PASSWORD",
        "POSTGRES_DB": "secondlayer_db",
        "QDRANT_URL": "http://localhost:6333",
        "REDIS_URL": "redis://localhost:6379",
        "OPENAI_API_KEY": "YOUR_OPENAI_KEY"
      }
    }
  }
}`} />
      </Card>

      <Card>
        <h2 className="text-[16px] font-semibold text-claude-text mb-3">Cursor</h2>
        <p className="text-[13px] text-claude-subtext mb-3">
          Збережіть як <code className="bg-claude-bg-secondary px-1.5 py-0.5 rounded text-[11px]">.cursor/mcp.json</code> в корені проєкту:
        </p>
        <CodeBlock language="json" code={`{
  "mcpServers": {
    "secondlayer": {
      "command": "node",
      "args": ["<project-root>/mcp_backend/dist/index.js"],
      "env": {
        "POSTGRES_HOST": "localhost",
        "POSTGRES_PORT": "5432",
        "POSTGRES_USER": "secondlayer",
        "POSTGRES_PASSWORD": "YOUR_PASSWORD",
        "POSTGRES_DB": "secondlayer_db",
        "QDRANT_URL": "http://localhost:6333",
        "REDIS_URL": "redis://localhost:6379",
        "OPENAI_API_KEY": "YOUR_OPENAI_KEY"
      }
    }
  }
}`} />
      </Card>

      <Card>
        <h2 className="text-[16px] font-semibold text-claude-text mb-3">VS Code</h2>
        <p className="text-[13px] text-claude-subtext mb-3">
          Збережіть як <code className="bg-claude-bg-secondary px-1.5 py-0.5 rounded text-[11px]">.vscode/mcp.json</code>. Увімкніть: <code className="bg-claude-bg-secondary px-1.5 py-0.5 rounded text-[11px]">chat.mcp.discovery.enabled: true</code>
        </p>
        <CodeBlock language="json" code={`{
  "mcpServers": {
    "secondlayer": {
      "command": "node",
      "args": ["<project-root>/mcp_backend/dist/index.js"],
      "env": {
        "POSTGRES_HOST": "localhost",
        "POSTGRES_PORT": "5432",
        "POSTGRES_USER": "secondlayer",
        "POSTGRES_PASSWORD": "YOUR_PASSWORD",
        "POSTGRES_DB": "secondlayer_db",
        "QDRANT_URL": "http://localhost:6333",
        "REDIS_URL": "redis://localhost:6379",
        "OPENAI_API_KEY": "YOUR_OPENAI_KEY"
      }
    }
  }
}`} />
      </Card>

      <Card>
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-[16px] font-semibold text-claude-text">ChatGPT</h2>
          <span className="px-1.5 py-0.5 bg-emerald-500/10 text-emerald-600 text-[10px] font-semibold rounded tracking-wide uppercase">new</span>
        </div>
        <p className="text-[13px] text-claude-subtext mb-3">
          ChatGPT підтримує MCP через SSE (Server-Sent Events) транспорт. Це дозволяє використовувати всі 56+ інструментів LEX AI безпосередньо у веб-інтерфейсі ChatGPT.
        </p>
        <div className="space-y-3">
          <div>
            <p className="text-[12px] font-medium text-claude-text mb-1.5">1. Відкрийте налаштування ChatGPT</p>
            <p className="text-[12.5px] text-claude-subtext">
              <code className="bg-claude-bg-secondary px-1.5 py-0.5 rounded text-[11px]">Settings → Features → MCP Servers → Add</code>
            </p>
          </div>
          <div>
            <p className="text-[12px] font-medium text-claude-text mb-1.5">2. Додайте SSE endpoint</p>
            <CodeBlock language="text" code={`Server URL: https://platform.legal.org.ua/api/sse
Label: LEX AI — Ukrainian Legal Platform`} />
          </div>
          <div>
            <p className="text-[12px] font-medium text-claude-text mb-1.5">3. Автентифікація</p>
            <p className="text-[12.5px] text-claude-subtext mb-2">
              Згенеруйте API-токен у <a href="/profile" className="text-claude-accent hover:underline">Профілі → MCP Access Tokens</a>, потім додайте як Bearer токен:
            </p>
            <CodeBlock language="text" code={`Header: Authorization
Value: Bearer YOUR_API_TOKEN`} />
          </div>
          <div>
            <p className="text-[12px] font-medium text-claude-text mb-1.5">4. Готово</p>
            <p className="text-[12.5px] text-claude-subtext">
              Після підключення ChatGPT матиме доступ до всіх інструментів: пошук судових рішень, аналіз законодавства, реєстри, моніторинг — прямо в чаті.
            </p>
          </div>
        </div>
        <div className="mt-4 p-3 bg-amber-500/5 border border-amber-500/15 rounded-lg">
          <p className="text-[12px] text-amber-600">
            <strong>Примітка:</strong> MCP у ChatGPT доступний для Plus/Team/Enterprise підписок. Перевірте доступність у вашому акаунті.
          </p>
        </div>
      </Card>

      <Card>
        <h2 className="text-[16px] font-semibold text-claude-text mb-3">Continue.dev</h2>
        <p className="text-[13px] text-claude-subtext mb-3">
          Збережіть як <code className="bg-claude-bg-secondary px-1.5 py-0.5 rounded text-[11px]">.continue/mcpServers/secondlayer.yaml</code>:
        </p>
        <CodeBlock language="yaml" code={`name: secondlayer
command: node
args:
  - /path/to/SecondLayer/mcp_backend/dist/index.js

env:
  POSTGRES_HOST: localhost
  POSTGRES_PORT: "5432"
  POSTGRES_USER: secondlayer
  POSTGRES_PASSWORD: YOUR_PASSWORD
  POSTGRES_DB: secondlayer_db
  QDRANT_URL: http://localhost:6333
  REDIS_URL: redis://localhost:6379
  OPENAI_API_KEY: YOUR_OPENAI_KEY`} />
      </Card>
    </div>
  );
}

/* ==================== PRICING TAB ==================== */

function PricingTab() {
  return (
    <div className="space-y-6">
      <Card>
        <h2 className="text-[16px] font-semibold text-claude-text mb-3">Вартість за категоріями</h2>
        <p className="text-[13px] text-claude-subtext mb-4">
          Вартість залежить від складності інструменту та обсягу AI обробки.
        </p>

        <div className="space-y-4">
          <PricingTier
            title="Мінімальна (<$0.01)"
            color="green"
            tools={[
              'get_legislation_article', 'get_legislation_structure', 'openreyestr_get_by_edrpou',
              'openreyestr_get_statistics', 'openreyestr_search_entities', 'check_precedent_status',
              'classify_intent', 'store_document', 'get_document', 'list_documents',
            ]}
          />
          <PricingTier
            title="Середня ($0.01-$0.05)"
            color="blue"
            tools={[
              'search_legal_precedents', 'get_court_decision', 'search_legislation',
              'rada_search_parliament_bills', 'get_similar_reasoning', 'get_judge_statistics',
            ]}
          />
          <PricingTier
            title="Висока ($0.05-$0.15)"
            color="amber"
            tools={[
              'search_supreme_court_practice', 'compare_practice_pro_contra',
              'rada_analyze_voting_record', 'extract_key_clauses', 'analyze_court_trends',
            ]}
          />
          <PricingTier
            title="Максимальна (>$0.15)"
            color="red"
            tools={['get_legal_advice — $0.10-$0.30 (комплексний аналіз)']}
          />
        </div>
      </Card>

      <Card>
        <h2 className="text-[16px] font-semibold text-claude-text mb-3">Що входить у вартість</h2>
        <div className="text-[13px] text-claude-subtext space-y-2">
          <p>Вартість включає:</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>OpenAI API виклики (embeddings + LLM аналіз)</li>
            <li>Векторний пошук у Qdrant</li>
            <li>Зовнішні API запити (RADA, реєстри)</li>
            <li>Кешування результатів (RADA: 7-30 днів, Backend: Redis + PostgreSQL)</li>
          </ul>
        </div>
      </Card>

      <Card>
        <h2 className="text-[16px] font-semibold text-claude-text mb-3">Правові документи</h2>
        <div className="space-y-2">
          <a href="/ua/developer-offer" target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2 text-[13px] text-claude-accent hover:underline">
            <ExternalLink size={13} />
            Оферта розробника
          </a>
          <a href="/en/api-terms" target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2 text-[13px] text-claude-accent hover:underline">
            <ExternalLink size={13} />
            API Terms of Use (EN)
          </a>
          <a href="/ua/privacy" target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2 text-[13px] text-claude-accent hover:underline">
            <ExternalLink size={13} />
            Політика конфіденційності
          </a>
          <a href="/ua/dpa" target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2 text-[13px] text-claude-accent hover:underline">
            <ExternalLink size={13} />
            DPA (обробка даних)
          </a>
        </div>
      </Card>
    </div>
  );
}

/* ==================== SHARED COMPONENTS ==================== */

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-claude-border p-5">
      {children}
    </div>
  );
}

function ServiceCard({ icon: Icon, title, count, description }: { icon: React.ElementType; title: string; count: string; description: string }) {
  return (
    <div className="bg-claude-bg-secondary rounded-lg p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon size={16} className="text-claude-accent" />
        <span className="text-[13px] font-semibold text-claude-text">{title}</span>
        <span className="text-[11px] font-semibold text-claude-accent bg-claude-accent/10 px-1.5 py-0.5 rounded-full">{count}</span>
      </div>
      <p className="text-[12px] text-claude-subtext">{description}</p>
    </div>
  );
}

function TransportRow({ icon: Icon, title, endpoint, description }: { icon: React.ElementType; title: string; endpoint: string; description: string }) {
  return (
    <div className="flex items-start gap-3 p-3 bg-claude-bg-secondary rounded-lg">
      <Icon size={16} className="text-claude-accent mt-0.5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-semibold text-claude-text">{title}</div>
        <code className="text-[11px] text-claude-accent font-mono">{endpoint}</code>
        <p className="text-[12px] text-claude-subtext mt-0.5">{description}</p>
      </div>
    </div>
  );
}

function EndpointRow({ method, path, description }: { method: string; path: string; description: string }) {
  const color = method === 'GET' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700';
  return (
    <div className="flex items-center gap-3">
      <span className={`text-[10px] font-bold ${color} px-2 py-0.5 rounded uppercase w-12 text-center`}>{method}</span>
      <code className="text-[12px] font-mono text-claude-text flex-1">{path}</code>
      <span className="text-[12px] text-claude-subtext">{description}</span>
    </div>
  );
}

function PricingTier({ title, color, tools }: { title: string; color: string; tools: string[] }) {
  const bgColor = color === 'green' ? 'bg-green-50 border-green-200' : color === 'blue' ? 'bg-blue-50 border-blue-200' : color === 'amber' ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200';
  const textColor = color === 'green' ? 'text-green-700' : color === 'blue' ? 'text-blue-700' : color === 'amber' ? 'text-amber-700' : 'text-red-700';

  return (
    <div className={`rounded-lg border p-4 ${bgColor}`}>
      <h3 className={`text-[13px] font-semibold ${textColor} mb-2`}>{title}</h3>
      <div className="flex flex-wrap gap-1.5">
        {tools.map((t) => (
          <span key={t} className="text-[11px] font-mono bg-white/70 text-claude-subtext px-2 py-0.5 rounded">{t}</span>
        ))}
      </div>
    </div>
  );
}

function CodeBlock({ code, language }: { code: string; language: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group">
      <div className="flex items-center justify-between bg-[#1a1a1a] rounded-t-lg px-4 py-2 border border-b-0 border-[#333]">
        <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-mono">{language}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? 'Скопійовано' : 'Копіювати'}
        </button>
      </div>
      <pre className="bg-[#111] border border-[#333] rounded-b-lg p-4 overflow-x-auto">
        <code className="text-[12px] font-mono text-zinc-300 leading-relaxed whitespace-pre">{code}</code>
      </pre>
    </div>
  );
}

function Gavel(props: any) {
  return <Scale {...props} />;
}
