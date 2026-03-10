import { Search, X, LayoutGrid, List } from 'lucide-react';
import type { DocType, ViewMode } from './types';
import { DOC_TYPE_LABELS } from './constants';

interface DocumentSearchBarProps {
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  onSearch: () => void;
  onClearSearch: () => void;
  filterType: DocType | '';
  onFilterTypeChange: (value: DocType | '') => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
}

export function DocumentSearchBar({
  searchQuery,
  onSearchQueryChange,
  onSearch,
  onClearSearch,
  filterType,
  onFilterTypeChange,
  viewMode,
  onViewModeChange,
}: DocumentSearchBarProps) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <div className="flex-1 relative">
        <Search
          size={16}
          className="absolute left-3.5 top-1/2 -translate-y-1/2 text-claude-subtext/40"
        />
        <input
          type="text"
          placeholder="Пошук за назвою або змістом..."
          value={searchQuery}
          onChange={(e) => onSearchQueryChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onSearch()}
          className="w-full pl-10 pr-9 py-2.5 bg-white border border-claude-border rounded-xl text-sm text-claude-text placeholder:text-claude-subtext/40 focus:outline-none focus:border-claude-subtext/40 transition-colors font-sans"
        />
        {searchQuery && (
          <button
            onClick={onClearSearch}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 text-claude-subtext/40 hover:text-claude-text transition-colors"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Type filter */}
      <select
        value={filterType}
        onChange={(e) => onFilterTypeChange(e.target.value as DocType | '')}
        className="px-3 py-2.5 bg-white border border-claude-border rounded-xl text-sm text-claude-text focus:outline-none focus:border-claude-subtext/40 transition-colors font-sans"
        title="Фільтр за типом документа"
      >
        <option value="">Всі типи</option>
        {(Object.keys(DOC_TYPE_LABELS) as DocType[]).map((t) => (
          <option key={t} value={t}>
            {DOC_TYPE_LABELS[t]}
          </option>
        ))}
      </select>

      {/* View mode toggle */}
      <div className="flex border border-claude-border rounded-xl overflow-hidden">
        <button
          onClick={() => onViewModeChange('list')}
          className={`p-2.5 transition-colors ${
            viewMode === 'list'
              ? 'bg-claude-text text-white'
              : 'bg-white text-claude-subtext hover:bg-claude-bg'
          }`}
          title="Таблиця"
        >
          <List size={16} />
        </button>
        <button
          onClick={() => onViewModeChange('grid')}
          className={`p-2.5 transition-colors ${
            viewMode === 'grid'
              ? 'bg-claude-text text-white'
              : 'bg-white text-claude-subtext hover:bg-claude-bg'
          }`}
          title="Сітка"
        >
          <LayoutGrid size={16} />
        </button>
      </div>
    </div>
  );
}
