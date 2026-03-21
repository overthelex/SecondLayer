import { useState } from 'react';
import { Search } from 'lucide-react';

interface Tool {
  name: string;
  category: string;
  description: string;
  cost?: string;
}

const tools: Tool[] = [
  // Pipeline
  { name: 'classify_intent', category: 'Pipeline', description: 'Класифікація запиту: service/task/depth (entry-point для роутингу)', cost: 'Мінімальна' },
  { name: 'retrieve_legal_sources', category: 'Pipeline', description: 'RAG retrieval: повертає сирі джерела без аналізу', cost: 'Залежить від обсягу' },
  { name: 'analyze_legal_patterns', category: 'Pipeline', description: 'Виділяє success_arguments/risk_factors за джерелами', cost: '$0.02–$0.08' },
  { name: 'validate_response', category: 'Pipeline', description: 'Trust layer: перевірка відповіді на галюцинації', cost: '$0.01–$0.03' },
  // Court search
  { name: 'search_legal_precedents', category: 'Court', description: 'Пошук юридичних прецедентів з семантичним аналізом', cost: '$0.03–$0.10' },
  { name: 'search_supreme_court_practice', category: 'Court', description: 'Пошук практики Верховного Суду (ВП/КЦС/КГС/КАС/ККС)', cost: '$0.05–$0.15' },
  { name: 'find_similar_fact_pattern_cases', category: 'Court', description: 'Пошук справ за подібними фактами', cost: '$0.03–$0.10' },
  { name: 'compare_practice_pro_contra', category: 'Court', description: 'Підбірка практики "за/проти" за тезою', cost: '$0.05–$0.15' },
  // Analysis
  { name: 'analyze_case_pattern', category: 'Analysis', description: 'Аналіз патернів: аргументи, ризики, статистика результатів', cost: '$0.02–$0.08' },
  { name: 'get_similar_reasoning', category: 'Analysis', description: 'Подібні судові обґрунтування за векторною схожістю', cost: '$0.01–$0.03' },
  { name: 'get_citation_graph', category: 'Analysis', description: 'Граф цитувань між справами', cost: '$0.005–$0.02' },
  { name: 'check_precedent_status', category: 'Analysis', description: 'Актуальність прецеденту: діючий, скасований, сумнівний', cost: '$0.005–$0.015' },
  { name: 'analyze_judicial_reasoning', category: 'Analysis', description: 'Глибокий аналіз мотивувальної частини', cost: '$0.02–$0.05' },
  { name: 'extract_legal_principles', category: 'Analysis', description: 'Вилучення правових принципів із рішень', cost: '$0.03–$0.08' },
  { name: 'compare_decisions', category: 'Analysis', description: 'Порівняння двох або більше рішень', cost: '$0.02–$0.06' },
  { name: 'track_precedent_evolution', category: 'Analysis', description: 'Еволюція прецеденту в часі', cost: '$0.03–$0.08' },
  { name: 'get_citation_network', category: 'Analysis', description: 'Мережа цитувань для набору справ', cost: '$0.05–$0.15' },
  { name: 'analyze_court_trends', category: 'Analysis', description: 'Тенденції судової практики', cost: '$0.05–$0.12' },
  // Documents
  { name: 'get_court_decision', category: 'Documents', description: 'Повний текст рішення з секціями (ФАКТИ, ОБҐРУНТУВАННЯ, РІШЕННЯ)', cost: '$0.01–$0.04' },
  { name: 'get_case_text', category: 'Documents', description: 'Повний текст судового рішення', cost: '$0.01–$0.04' },
  { name: 'get_case_documents_chain', category: 'Documents', description: 'Всі документи справи через усі інстанції', cost: '$0.005–$0.02' },
  { name: 'semantic_search', category: 'Documents', description: 'Семантичний пошук за ембеддінгами у vault', cost: '$0.01–$0.03' },
  { name: 'extract_document_sections', category: 'Documents', description: 'Структуровані секції з тексту документа', cost: '$0.005–$0.05' },
  { name: 'load_full_texts', category: 'Documents', description: 'Завантаження повних текстів і збереження в базу', cost: '~$0.007/doc' },
  { name: 'get_document_text', category: 'Documents', description: 'Повний текст документа за doc_id', cost: 'Мінімальна' },
  { name: 'get_case_metadata', category: 'Documents', description: 'Метадані справи без повного тексту', cost: 'Мінімальна' },
  // Statistics
  { name: 'count_cases_by_party', category: 'Statistics', description: 'Кількість справ за назвою сторони', cost: '~$0.007/стор' },
  { name: 'get_judge_statistics', category: 'Statistics', description: 'Статистика по судді', cost: '$0.01–$0.03' },
  // Legislation
  { name: 'find_relevant_law_articles', category: 'Legislation', description: 'Статті законів, що застосовуються у справах за темою', cost: '$0.01–$0.02' },
  { name: 'search_procedural_norms', category: 'Legislation', description: 'Пошук процесуальних норм (ЦПК/ГПК)', cost: '$0.005–$0.03' },
  { name: 'get_legislation_article', category: 'Legislation', description: 'Текст конкретної статті закону', cost: 'Мінімальна' },
  { name: 'get_legislation_section', category: 'Legislation', description: 'Фрагмент за посиланням ("ст. 625 ЦК")', cost: 'Мінімальна' },
  { name: 'get_legislation_articles', category: 'Legislation', description: 'Декілька статей одночасно', cost: 'Мінімальна' },
  { name: 'search_legislation', category: 'Legislation', description: 'Семантичний пошук статей законодавства', cost: '$0.01–$0.03' },
  { name: 'get_legislation_structure', category: 'Legislation', description: 'Структура акту (зміст, розділи, глави)', cost: 'Мінімальна' },
  // Procedural
  { name: 'calculate_procedural_deadlines', category: 'Procedural', description: 'Калькулятор процесуальних строків', cost: '$0.02–$0.08' },
  { name: 'build_procedural_checklist', category: 'Procedural', description: 'Процесуальний чекліст з посиланнями на норми', cost: '$0.01–$0.03' },
  { name: 'calculate_monetary_claims', category: 'Procedural', description: 'Розрахунки грошових вимог (3% річних)', cost: 'Мінімальна' },
  // Parsing
  { name: 'parse_document', category: 'Parsing', description: 'Парсинг PDF/DOCX/HTML з OCR', cost: '$0.01–$0.10' },
  { name: 'extract_key_clauses', category: 'Parsing', description: 'Ключові положення контракту', cost: '$0.03–$0.10' },
  { name: 'summarize_document', category: 'Parsing', description: 'Резюме документа (quick/standard/deep)', cost: '$0.02–$0.08' },
  { name: 'compare_documents', category: 'Parsing', description: 'Семантичне порівняння двох версій', cost: '$0.03–$0.12' },
  { name: 'batch_process_documents', category: 'Parsing', description: 'Пакетна обробка документів', cost: 'Залежить від кількості' },
  // Vault
  { name: 'store_document', category: 'Vault', description: 'Збереження документа в vault', cost: 'Мінімальна' },
  { name: 'get_document', category: 'Vault', description: 'Отримання документа з vault за ID', cost: 'Мінімальна' },
  { name: 'list_documents', category: 'Vault', description: 'Список документів з фільтрацією', cost: 'Мінімальна' },
  // Main
  { name: 'get_legal_advice', category: 'Main', description: 'Комплексний юридичний аналіз з перевіркою джерел та детекцією галюцинацій', cost: '$0.10–$0.30' },
  // RADA
  { name: 'search_parliament_bills', category: 'RADA', description: 'Пошук законопроєктів ВРУ', cost: '$0.01–$0.05' },
  { name: 'get_deputy_info', category: 'RADA', description: 'Інформація про депутата (біографія, комітети, фракція)', cost: '$0.005–$0.01' },
  { name: 'search_legislation_text', category: 'RADA', description: 'Пошук у текстах законів з посиланнями на судові рішення', cost: '$0.005–$0.02' },
  { name: 'analyze_voting_record', category: 'RADA', description: 'Аналіз голосувань депутата з AI-інсайтами', cost: '$0.02–$0.10' },
  // Registry
  { name: 'search_entities', category: 'Registry', description: 'Пошук суб\'єктів господарювання (ЮО/ФОП/ГО)', cost: '$0.001–$0.005' },
  { name: 'get_entity_details', category: 'Registry', description: 'Повна інформація: засновники, бенефіціари, керівники', cost: '$0.001–$0.003' },
  { name: 'search_beneficiaries', category: 'Registry', description: 'Пошук бенефіціарних власників компаній', cost: '$0.002–$0.005' },
  { name: 'get_by_edrpou', category: 'Registry', description: 'Пошук за кодом ЄДРПОУ', cost: '$0.001' },
  { name: 'get_statistics', category: 'Registry', description: 'Статистика державного реєстру', cost: '$0.001' },
];

const categories = [...new Set(tools.map(t => t.category))];

const categoryColors: Record<string, string> = {
  Pipeline: 'bg-purple-50 text-purple-700',
  Court: 'bg-blue-50 text-blue-700',
  Analysis: 'bg-indigo-50 text-indigo-700',
  Documents: 'bg-cyan-50 text-cyan-700',
  Statistics: 'bg-teal-50 text-teal-700',
  Legislation: 'bg-emerald-50 text-emerald-700',
  Procedural: 'bg-green-50 text-green-700',
  Parsing: 'bg-amber-50 text-amber-700',
  Vault: 'bg-orange-50 text-orange-700',
  Main: 'bg-red-50 text-red-700',
  RADA: 'bg-yellow-50 text-yellow-700',
  Registry: 'bg-lime-50 text-lime-700',
};

export function McpToolsPage() {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const filtered = tools.filter((tool) => {
    const matchesSearch = !search ||
      tool.name.toLowerCase().includes(search.toLowerCase()) ||
      tool.description.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = !selectedCategory || tool.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-txt-primary">MCP Tools Reference</h1>
        <p className="text-sm text-txt-muted mt-1">
          {tools.length} інструментів доступних через SecondLayer API
        </p>
      </div>

      <div className="space-y-3">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-txt-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Пошук інструментів..."
            className="w-full pl-9 pr-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setSelectedCategory(null)}
            className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${
              !selectedCategory ? 'bg-brand-600 text-white' : 'bg-surface-tertiary text-txt-muted hover:text-txt-primary'
            }`}
          >
            Всі ({tools.length})
          </button>
          {categories.map((cat) => {
            const count = tools.filter(t => t.category === cat).length;
            return (
              <button
                key={cat}
                onClick={() => setSelectedCategory(selectedCategory === cat ? null : cat)}
                className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${
                  selectedCategory === cat ? 'bg-brand-600 text-white' : 'bg-surface-tertiary text-txt-muted hover:text-txt-primary'
                }`}
              >
                {cat} ({count})
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        {filtered.map((tool) => (
          <div
            key={tool.name}
            className="bg-white rounded-xl border border-border p-4 hover:border-brand-200 transition-colors"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <code className="text-sm font-mono font-medium text-brand-700">{tool.name}</code>
                  {tool.name === 'get_legal_advice' && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-medium">Main</span>
                  )}
                </div>
                <p className="text-sm text-txt-secondary mt-1">{tool.description}</p>
                {tool.cost && (
                  <p className="text-xs text-txt-muted mt-1">Вартість: {tool.cost}</p>
                )}
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${
                categoryColors[tool.category] || 'bg-gray-50 text-gray-700'
              }`}>
                {tool.category}
              </span>
            </div>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-8">
          <p className="text-sm text-txt-muted">Інструменти не знайдено</p>
        </div>
      )}

      <div className="text-xs text-txt-muted text-center pt-4">
        Показано {filtered.length} з {tools.length} інструментів
      </div>
    </div>
  );
}
