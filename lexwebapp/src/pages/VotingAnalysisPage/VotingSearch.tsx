import { motion } from 'framer-motion';
import { Search } from 'lucide-react';
import { quickAccessBills } from './types';

interface VotingSearchProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  votingType: string;
  onVotingTypeChange: (value: string) => void;
  resultFilter: string;
  onResultFilterChange: (value: string) => void;
  onSelectBill: () => void;
}

export function VotingSearch({
  searchQuery,
  onSearchChange,
  votingType,
  onVotingTypeChange,
  resultFilter,
  onResultFilterChange,
  onSelectBill,
}: VotingSearchProps) {
  return (
    <div className="bg-white rounded-2xl border border-claude-border shadow-sm p-6 space-y-6">
      <div>
        <label className="block text-sm font-medium text-claude-text font-sans mb-2">
          Знайдіть законопроект
        </label>
        <div className="flex gap-2">
          <div className="relative flex-1 group">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-claude-subtext group-focus-within:text-claude-accent transition-colors" />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Введіть номер або назву законопроекту..."
              className="block w-full pl-11 pr-4 py-3 bg-white border border-claude-border rounded-xl text-claude-text placeholder-claude-subtext/50 focus:outline-none focus:ring-2 focus:ring-claude-accent/20 focus:border-claude-accent transition-all shadow-sm font-sans"
            />
          </div>
          <button
            onClick={onSelectBill}
            className="px-6 py-3 bg-claude-accent text-white rounded-xl font-medium hover:bg-[#C66345] transition-colors shadow-sm font-sans"
          >
            <Search size={18} />
          </button>
        </div>
      </div>

      {/* Quick Access */}
      <div>
        <h3 className="text-sm font-medium text-claude-text font-sans mb-3">
          Швидкий доступ до важливих законопроектів
        </h3>
        <div className="space-y-2">
          {quickAccessBills.map((bill, index) => (
            <motion.button
              key={bill}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
              onClick={onSelectBill}
              className="w-full text-left px-4 py-3 bg-claude-bg hover:bg-claude-border border border-claude-border rounded-xl transition-all font-sans text-sm text-claude-text"
            >
              • {bill}
            </motion.button>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-claude-border">
        <div>
          <label className="block text-sm font-medium text-claude-text font-sans mb-2">
            Тип голосування
          </label>
          <select
            value={votingType}
            onChange={(e) => onVotingTypeChange(e.target.value)}
            className="w-full px-4 py-2.5 bg-white border border-claude-border rounded-lg text-claude-text focus:outline-none focus:ring-2 focus:ring-claude-accent/20 focus:border-claude-accent transition-all font-sans"
          >
            <option value="all">Усі</option>
            <option value="first">1-ше читання</option>
            <option value="second">2-ге читання</option>
            <option value="basis">Основа</option>
            <option value="whole">В цілому</option>
            <option value="repeat">Повторне</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-claude-text font-sans mb-2">
            Результат
          </label>
          <select
            value={resultFilter}
            onChange={(e) => onResultFilterChange(e.target.value)}
            className="w-full px-4 py-2.5 bg-white border border-claude-border rounded-lg text-claude-text focus:outline-none focus:ring-2 focus:ring-claude-accent/20 focus:border-claude-accent transition-all font-sans"
          >
            <option value="all">Усі</option>
            <option value="approved">Прийнято</option>
            <option value="not-approved">Не прийнято</option>
            <option value="rejected">Відхилено</option>
          </select>
        </div>
      </div>
    </div>
  );
}
