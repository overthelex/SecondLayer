import { useState } from 'react';
import { Search } from 'lucide-react';

interface Tool {
  name: string;
  category: string;
  description: string;
}

const tools: Tool[] = [
  // Backend tools
  { name: 'search_court_decisions', category: 'Court', description: 'Семантичний пошук судових рішень за текстовим запитом' },
  { name: 'get_court_decision', category: 'Court', description: 'Отримати повний текст судового рішення за номером справи' },
  { name: 'analyze_court_decision', category: 'Court', description: 'AI-аналіз судового рішення з виділенням ключових аргументів' },
  { name: 'search_similar_cases', category: 'Court', description: 'Пошук аналогічних справ за заданим рішенням' },
  { name: 'get_case_documents', category: 'Court', description: 'Отримати всі документи справи' },
  { name: 'get_court_statistics', category: 'Court', description: 'Статистика судових рішень за суддею, судом або категорією' },
  { name: 'search_by_judge', category: 'Court', description: 'Пошук рішень конкретного судді' },
  { name: 'search_by_parties', category: 'Court', description: 'Пошук справ за назвою сторони' },
  { name: 'get_legislation', category: 'Legislation', description: 'Отримати текст нормативного акту або конкретну статтю' },
  { name: 'search_legislation', category: 'Legislation', description: 'Пошук по базі законодавства' },
  { name: 'get_legislation_article', category: 'Legislation', description: 'Отримати конкретну статтю закону' },
  { name: 'compare_legislation_versions', category: 'Legislation', description: 'Порівняти редакції закону' },
  { name: 'semantic_search', category: 'Search', description: 'Семантичний пошук по всій базі даних' },
  { name: 'full_text_search', category: 'Search', description: 'Повнотекстовий пошук з фільтрами' },
  { name: 'search_legal_patterns', category: 'Patterns', description: 'Пошук правових патернів та аргументацій' },
  { name: 'save_legal_pattern', category: 'Patterns', description: 'Зберегти правовий патерн' },
  { name: 'validate_citation', category: 'Analysis', description: 'Перевірити юридичне посилання на відповідність джерелу' },
  { name: 'check_hallucination', category: 'Analysis', description: 'Перевірити AI-відповідь на галюцинації' },
  { name: 'create_vault_project', category: 'Vault', description: 'Створити проєкт у сховищі документів' },
  { name: 'upload_vault_document', category: 'Vault', description: 'Завантажити документ у сховище' },
  { name: 'search_vault', category: 'Vault', description: 'Пошук по документах у сховищі' },
  { name: 'analyze_document', category: 'Vault', description: 'AI-аналіз завантаженого документа' },
  // RADA tools
  { name: 'rada_search_deputies', category: 'RADA', description: 'Пошук народних депутатів' },
  { name: 'rada_search_bills', category: 'RADA', description: 'Пошук законопроєктів' },
  { name: 'rada_get_legislation', category: 'RADA', description: 'Отримати текст закону з бази ВРУ' },
  { name: 'rada_get_voting', category: 'RADA', description: 'Результати голосувань' },
  // OpenReyestr tools
  { name: 'openreyestr_search_entities', category: 'Registry', description: 'Пошук юридичних осіб в реєстрі' },
  { name: 'openreyestr_get_entity', category: 'Registry', description: 'Деталі юридичної особи за кодом ЄДРПОУ' },
  { name: 'openreyestr_search_beneficiaries', category: 'Registry', description: 'Пошук бенефіціарних власників' },
  { name: 'openreyestr_search_debtors', category: 'Registry', description: 'Пошук боржників у реєстрі' },
  { name: 'openreyestr_get_company_relations', category: 'Registry', description: 'Зв\'язки між компаніями та особами' },
];

const categories = [...new Set(tools.map(t => t.category))];

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
          {tools.length} інструментів доступних через SecondLayer MCP API
        </p>
      </div>

      {/* Search and filters */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-txt-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Пошук інструментів..."
            className="w-full pl-9 pr-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <div className="flex gap-1.5">
          <button
            onClick={() => setSelectedCategory(null)}
            className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${
              !selectedCategory ? 'bg-brand-600 text-white' : 'bg-surface-tertiary text-txt-muted hover:text-txt-primary'
            }`}
          >
            Всі
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(selectedCategory === cat ? null : cat)}
              className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${
                selectedCategory === cat ? 'bg-brand-600 text-white' : 'bg-surface-tertiary text-txt-muted hover:text-txt-primary'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Tools list */}
      <div className="space-y-2">
        {filtered.map((tool) => (
          <div
            key={tool.name}
            className="bg-white rounded-xl border border-border p-4 hover:border-brand-200 transition-colors"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <code className="text-sm font-mono font-medium text-brand-700">{tool.name}</code>
                <p className="text-sm text-txt-secondary mt-1">{tool.description}</p>
              </div>
              <span className="text-xs px-2 py-0.5 rounded-full bg-surface-tertiary text-txt-muted font-medium whitespace-nowrap">
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
    </div>
  );
}
