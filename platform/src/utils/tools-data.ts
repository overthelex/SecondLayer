export interface ToolParam {
  name: string;
  type: string;
  required: boolean;
  description: string;
}

export interface Tool {
  name: string;
  category: string;
  description: string;
  cost?: string;
  params?: ToolParam[];
  example?: { request: string; response: string };
}

export const tools: Tool[] = [
  // Pipeline
  { name: 'classify_intent', category: 'Pipeline', description: 'Класифікація запиту: service/task/depth (entry-point для роутингу)', cost: 'Мінімальна' },
  { name: 'retrieve_legal_sources', category: 'Pipeline', description: 'RAG retrieval: повертає сирі джерела без аналізу', cost: 'Залежить від обсягу' },
  { name: 'analyze_legal_patterns', category: 'Pipeline', description: 'Виділяє success_arguments/risk_factors за джерелами', cost: '$0.02–$0.08' },
  { name: 'validate_response', category: 'Pipeline', description: 'Trust layer: перевірка відповіді на галюцинації', cost: '$0.01–$0.03' },

  // Court search
  {
    name: 'search_legal_precedents', category: 'Court',
    description: 'Пошук юридичних прецедентів з семантичним аналізом',
    cost: '$0.03–$0.10',
    params: [
      { name: 'query', type: 'string', required: true, description: 'Пошуковий запит' },
      { name: 'domain', type: 'string', required: false, description: 'Галузь права' },
      { name: 'time_range', type: 'string', required: false, description: 'Часовий діапазон (напр. "2023-2024")' },
      { name: 'limit', type: 'number', required: false, description: 'Кількість результатів (за замовчуванням 10)' },
      { name: 'offset', type: 'number', required: false, description: 'Зміщення для пагінації' },
    ],
    example: {
      request: '{"query": "відшкодування моральної шкоди", "limit": 5}',
      response: '{"decisions": [{"doc_id": "123", "case_number": "756/1234/24", "court": "Верховний Суд", "date": "2024-03-15", "summary": "..."}], "total": 42}',
    },
  },
  {
    name: 'search_supreme_court_practice', category: 'Court',
    description: 'Пошук практики Верховного Суду (ВП/КЦС/КГС/КАС/ККС)',
    cost: '$0.05–$0.15',
    params: [
      { name: 'procedure_code', type: 'string', required: false, description: 'Код процесу (civil/criminal/admin/commercial)' },
      { name: 'query', type: 'string', required: true, description: 'Пошуковий запит' },
      { name: 'time_range', type: 'string', required: false, description: 'Часовий діапазон' },
      { name: 'court_level', type: 'string', required: false, description: 'Рівень суду' },
      { name: 'limit', type: 'number', required: false, description: 'Кількість результатів' },
    ],
  },
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
  {
    name: 'get_court_decision', category: 'Documents',
    description: 'Повний текст рішення з секціями (ФАКТИ, ОБҐРУНТУВАННЯ, РІШЕННЯ)',
    cost: '$0.01–$0.04',
    params: [
      { name: 'doc_id', type: 'string', required: false, description: 'ID документа' },
      { name: 'case_number', type: 'string', required: false, description: 'Номер справи' },
      { name: 'depth', type: 'string', required: false, description: 'Глибина аналізу (quick/standard/deep)' },
    ],
    example: {
      request: '{"case_number": "756/1234/24"}',
      response: '{"doc_id": "123", "case_number": "756/1234/24", "court": "...", "sections": {"facts": "...", "reasoning": "...", "decision": "..."}}',
    },
  },
  { name: 'get_case_text', category: 'Documents', description: 'Повний текст судового рішення', cost: '$0.01–$0.04' },
  {
    name: 'get_case_documents_chain', category: 'Documents',
    description: 'Всі документи справи через усі інстанції',
    cost: '$0.005–$0.02',
    params: [
      { name: 'case_number', type: 'string', required: true, description: 'Номер справи' },
      { name: 'include_full_text', type: 'boolean', required: false, description: 'Включити повні тексти (за замовч.: true)' },
      { name: 'max_docs', type: 'number', required: false, description: 'Макс. кількість документів (за замовч.: 50)' },
    ],
  },
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
  {
    name: 'get_legislation_article', category: 'Legislation',
    description: 'Текст конкретної статті законодавчого акту',
    cost: 'Мінімальна',
    params: [
      { name: 'rada_id', type: 'string', required: true, description: 'ID акту в базі ВРУ (напр. "435-15" для ЦК)' },
      { name: 'article_number', type: 'string', required: true, description: 'Номер статті' },
    ],
    example: {
      request: '{"rada_id": "435-15", "article_number": "625"}',
      response: '{"article_number": "625", "title": "Відповідальність за порушення грошового зобов\'язання", "text": "..."}',
    },
  },
  { name: 'get_legislation_section', category: 'Legislation', description: 'Фрагмент за посиланням ("ст. 625 ЦК")', cost: 'Мінімальна' },
  { name: 'get_legislation_articles', category: 'Legislation', description: 'Декілька статей одночасно', cost: 'Мінімальна' },
  {
    name: 'search_legislation', category: 'Legislation',
    description: 'Семантичний пошук релевантних статей законодавства',
    cost: '$0.01–$0.03',
    params: [
      { name: 'query', type: 'string', required: true, description: 'Пошуковий запит' },
      { name: 'rada_id', type: 'string', required: false, description: 'Обмежити пошук конкретним актом' },
      { name: 'limit', type: 'number', required: false, description: 'Кількість результатів' },
    ],
  },
  { name: 'get_legislation_structure', category: 'Legislation', description: 'Структура акту (зміст, розділи, глави)', cost: 'Мінімальна' },

  // Procedural
  { name: 'calculate_procedural_deadlines', category: 'Procedural', description: 'Калькулятор процесуальних строків', cost: '$0.02–$0.08' },
  { name: 'build_procedural_checklist', category: 'Procedural', description: 'Процесуальний чекліст з посиланнями на норми', cost: '$0.01–$0.03' },
  { name: 'calculate_monetary_claims', category: 'Procedural', description: 'Розрахунки грошових вимог (3% річних)', cost: 'Мінімальна' },

  // Parsing
  {
    name: 'parse_document', category: 'Parsing',
    description: 'Парсинг PDF/DOCX/HTML з OCR',
    cost: '$0.01–$0.10',
    params: [
      { name: 'fileBase64', type: 'string', required: true, description: 'Файл в base64' },
      { name: 'mimeType', type: 'string', required: true, description: 'MIME тип (application/pdf, application/vnd.openxmlformats...)' },
      { name: 'filename', type: 'string', required: true, description: 'Назва файлу' },
    ],
  },
  { name: 'extract_key_clauses', category: 'Parsing', description: 'Ключові положення контракту', cost: '$0.03–$0.10' },
  {
    name: 'summarize_document', category: 'Parsing',
    description: 'Резюме документа (quick/standard/deep)',
    cost: '$0.02–$0.08',
    params: [
      { name: 'documentText', type: 'string', required: true, description: 'Текст документа' },
      { name: 'detailLevel', type: 'string', required: false, description: 'Рівень деталізації: quick | standard | deep' },
    ],
  },
  { name: 'compare_documents', category: 'Parsing', description: 'Семантичне порівняння двох версій', cost: '$0.03–$0.12' },
  { name: 'batch_process_documents', category: 'Parsing', description: 'Пакетна обробка документів', cost: 'Залежить від кількості' },

  // Vault
  { name: 'store_document', category: 'Vault', description: 'Збереження документа в vault', cost: 'Мінімальна' },
  { name: 'get_document', category: 'Vault', description: 'Отримання документа з vault за ID', cost: 'Мінімальна' },
  { name: 'list_documents', category: 'Vault', description: 'Список документів з фільтрацією', cost: 'Мінімальна' },

  // Main
  {
    name: 'get_legal_advice', category: 'Main',
    description: 'Комплексний юридичний аналіз з перевіркою джерел та детекцією галюцинацій',
    cost: '$0.10–$0.30',
    params: [
      { name: 'query', type: 'string', required: true, description: 'Юридичне питання' },
      { name: 'reasoning_budget', type: 'string', required: false, description: 'Бюджет аналізу: quick ($0.10) | standard ($0.15-$0.20) | deep ($0.25-$0.30)' },
    ],
    example: {
      request: '{"query": "Які строки позовної давності для відшкодування збитків?", "reasoning_budget": "standard"}',
      response: '{"analysis": "...", "sources": [...], "confidence": 0.92, "cost_usd": 0.18}',
    },
  },

  // RADA
  {
    name: 'search_parliament_bills', category: 'RADA',
    description: 'Пошук законопроєктів ВРУ',
    cost: '$0.01–$0.05',
    params: [
      { name: 'query', type: 'string', required: true, description: 'Пошуковий запит' },
      { name: 'status', type: 'string', required: false, description: 'Статус: registered | first_reading | adopted | rejected | all' },
      { name: 'limit', type: 'number', required: false, description: 'Кількість результатів' },
    ],
  },
  {
    name: 'get_deputy_info', category: 'RADA',
    description: 'Інформація про депутата (біографія, комітети, фракція)',
    cost: '$0.005–$0.01',
    params: [
      { name: 'name', type: 'string', required: true, description: 'Ім\'я депутата' },
    ],
    example: {
      request: '{"name": "Стефанчук"}',
      response: '{"name": "Стефанчук Руслан Олексійович", "faction": "Слуга народу", "committees": [...]}',
    },
  },
  { name: 'search_legislation_text', category: 'RADA', description: 'Пошук у текстах законів з посиланнями на судові рішення', cost: '$0.005–$0.02' },
  { name: 'analyze_voting_record', category: 'RADA', description: 'Аналіз голосувань депутата з AI-інсайтами', cost: '$0.02–$0.10' },

  // Registry
  {
    name: 'search_entities', category: 'Registry',
    description: 'Пошук суб\'єктів господарювання (ЮО/ФОП/ГО)',
    cost: '$0.001–$0.005',
    params: [
      { name: 'query', type: 'string', required: true, description: 'Назва або код ЄДРПОУ' },
      { name: 'entityType', type: 'string', required: false, description: 'Тип: UO | FOP | FSU | ALL' },
      { name: 'limit', type: 'number', required: false, description: 'Кількість результатів' },
    ],
    example: {
      request: '{"query": "Приватбанк", "entityType": "UO", "limit": 5}',
      response: '{"entities": [{"name": "АТ КБ ПРИВАТБАНК", "edrpou": "14360570", "status": "зареєстровано"}], "total": 3}',
    },
  },
  {
    name: 'get_entity_details', category: 'Registry',
    description: 'Повна інформація: засновники, бенефіціари, керівники',
    cost: '$0.001–$0.003',
    params: [
      { name: 'record', type: 'string', required: true, description: 'Запис або код ЄДРПОУ' },
      { name: 'entityType', type: 'string', required: false, description: 'Тип суб\'єкта' },
    ],
  },
  { name: 'search_beneficiaries', category: 'Registry', description: 'Пошук бенефіціарних власників компаній', cost: '$0.002–$0.005' },
  { name: 'get_by_edrpou', category: 'Registry', description: 'Пошук за кодом ЄДРПОУ', cost: '$0.001' },
  { name: 'get_statistics', category: 'Registry', description: 'Статистика державного реєстру', cost: '$0.001' },
];

export const categories = [...new Set(tools.map(t => t.category))];

export const categoryColors: Record<string, string> = {
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
