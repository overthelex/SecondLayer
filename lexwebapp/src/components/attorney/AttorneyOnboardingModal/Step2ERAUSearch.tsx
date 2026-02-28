import { useState } from 'react';
import { Search, Loader2, MapPin, Award, Calendar } from 'lucide-react';
import { erauService, type ERAULawyer } from '../../../services/api/ERAUService';

interface Step2ERAUSearchProps {
  onSelect: (lawyer: ERAULawyer) => void;
  onSkip: () => void;
}

export function Step2ERAUSearch({ onSelect, onSkip }: Step2ERAUSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ERAULawyer[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [error, setError] = useState('');

  const handleSearch = async () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    setLoading(true);
    setError('');
    setSelectedId(null);
    try {
      const data = await erauService.searchLawyers(trimmed);
      setResults(data);
      setSearched(true);
    } catch {
      setError('Помилка пошуку. Спробуйте ще раз.');
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  const selectedLawyer = results.find((r) => r.id === selectedId);

  return (
    <div className="px-6 py-4">
      <h2 className="text-lg font-bold text-gray-900 mb-1">
        Знайдіть себе в ЄРАУ
      </h2>
      <p className="text-sm text-gray-500 mb-5">
        Пошук в Єдиному реєстрі адвокатів України для автозаповнення профілю.
      </p>

      <div className="flex gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Введіть прізвище..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full pl-9 pr-3 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-claude-accent/30 focus:border-claude-accent"
            autoFocus
          />
        </div>
        <button
          onClick={handleSearch}
          disabled={loading || !query.trim()}
          className="px-4 py-2.5 bg-claude-accent text-white rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Шукати'}
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {searched && results.length === 0 && !loading && (
        <div className="text-center py-8 text-gray-400 text-sm">
          Нічого не знайдено. Спробуйте інше прізвище.
        </div>
      )}

      {results.length > 0 && (
        <div className="space-y-2 max-h-[280px] overflow-y-auto mb-4">
          {results.map((lawyer) => (
            <button
              key={lawyer.id}
              type="button"
              onClick={() => setSelectedId(lawyer.id)}
              className={`w-full text-left p-3 rounded-lg border transition-all ${
                selectedId === lawyer.id
                  ? 'border-claude-accent bg-claude-accent/5 ring-1 ring-claude-accent/30'
                  : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              <div className="font-medium text-sm text-gray-900">
                {lawyer.surname} {lawyer.firstname} {lawyer.middlename}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5">
                <span className="flex items-center gap-1 text-xs text-gray-500">
                  <Award className="w-3 h-3" />
                  {lawyer.certnum}
                </span>
                <span className="flex items-center gap-1 text-xs text-gray-500">
                  <MapPin className="w-3 h-3" />
                  {lawyer.racalc}
                </span>
                <span className="flex items-center gap-1 text-xs text-gray-500">
                  <Calendar className="w-3 h-3" />
                  {lawyer.certat}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between pt-2">
        <button
          onClick={onSkip}
          className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
        >
          Пропустити цей крок
        </button>
        {selectedLawyer && (
          <button
            onClick={() => onSelect(selectedLawyer)}
            className="px-5 py-2.5 bg-claude-accent text-white rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Обрати
          </button>
        )}
      </div>
    </div>
  );
}
