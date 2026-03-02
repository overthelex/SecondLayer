import { Search } from 'lucide-react';
import { TIERS } from './types';

interface UserFiltersProps {
  searchInput: string;
  setSearchInput: (v: string) => void;
  handleSearch: () => void;
  tierFilter: string;
  setTierFilter: (v: string) => void;
  tagFilter: string;
  setTagFilter: (v: string) => void;
}

export function UserFilters({
  searchInput, setSearchInput, handleSearch,
  tierFilter, setTierFilter,
  tagFilter, setTagFilter,
}: UserFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 mb-6">
      <div className="flex items-center gap-2 flex-1 min-w-[200px] max-w-md">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-claude-subtext" />
          <input
            type="text"
            placeholder="Search by email or name..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            className="w-full pl-9 pr-3 py-2 border border-claude-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
        </div>
        <button onClick={handleSearch} className="px-3 py-2 bg-claude-text text-white rounded-lg text-sm">
          Search
        </button>
      </div>
      <select
        value={tierFilter}
        onChange={(e) => setTierFilter(e.target.value)}
        className="px-3 py-2 border border-claude-border rounded-lg text-sm bg-white focus:outline-none"
      >
        <option value="">All Tiers</option>
        {TIERS.map((t) => (
          <option key={t} value={t}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </option>
        ))}
      </select>
      <select
        value={tagFilter}
        onChange={(e) => setTagFilter(e.target.value)}
        className="px-3 py-2 border border-claude-border rounded-lg text-sm bg-white focus:outline-none"
      >
        <option value="">All Tags</option>
        <option value="test">Test</option>
        <option value="crypto">Crypto</option>
      </select>
    </div>
  );
}
