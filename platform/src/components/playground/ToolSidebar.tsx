import { useState, useMemo } from 'react';
import { Search } from 'lucide-react';
import { tools, categories, categoryColors } from '@/utils/tools-data';

interface Props {
  selectedTool: string;
  onSelectTool: (name: string) => void;
}

export function ToolSidebar({ selectedTool, onSelectTool }: Props) {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return tools.filter(t =>
      (!q || t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)) &&
      (!activeCategory || t.category === activeCategory)
    );
  }, [search, activeCategory]);

  const grouped = useMemo(() => {
    const groups: Record<string, typeof tools> = {};
    for (const t of filtered) {
      (groups[t.category] ??= []).push(t);
    }
    return groups;
  }, [filtered]);

  return (
    <div className="w-72 shrink-0 flex flex-col bg-white rounded-xl border border-border overflow-hidden">
      {/* Search */}
      <div className="p-3 border-b border-border-light">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-txt-muted" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search tools..."
            className="w-full pl-8 pr-3 py-1.5 text-xs border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
          />
        </div>
      </div>

      {/* Category Tabs */}
      <div className="px-3 py-2 border-b border-border-light flex flex-wrap gap-1">
        <button
          onClick={() => setActiveCategory(null)}
          className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors ${
            !activeCategory ? 'bg-brand-100 text-brand-700' : 'bg-surface-secondary text-txt-muted hover:text-txt-primary'
          }`}
        >
          All ({tools.length})
        </button>
        {categories.map(cat => {
          const count = tools.filter(t => t.category === cat).length;
          const color = activeCategory === cat
            ? categoryColors[cat]
            : 'bg-surface-secondary text-txt-muted hover:text-txt-primary';
          return (
            <button
              key={cat}
              onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
              className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors ${color}`}
            >
              {cat} ({count})
            </button>
          );
        })}
      </div>

      {/* Tool List */}
      <div className="flex-1 overflow-y-auto">
        {Object.entries(grouped).map(([cat, catTools]) => (
          <div key={cat}>
            <div className="px-3 py-1.5 text-[10px] font-semibold text-txt-muted uppercase tracking-wide bg-surface-secondary sticky top-0">
              {cat}
            </div>
            {catTools.map(t => (
              <button
                key={t.name}
                onClick={() => onSelectTool(t.name)}
                className={`w-full text-left px-3 py-2 border-l-2 transition-colors ${
                  t.name === selectedTool
                    ? 'bg-brand-50 border-brand-600 text-txt-primary'
                    : 'border-transparent hover:bg-surface-secondary text-txt-secondary'
                }`}
              >
                <div className="text-xs font-mono font-medium truncate">{t.name}</div>
                <div className="text-[10px] text-txt-muted truncate mt-0.5">{t.description}</div>
              </button>
            ))}
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="px-3 py-8 text-center text-xs text-txt-muted">No tools found</div>
        )}
      </div>
    </div>
  );
}
