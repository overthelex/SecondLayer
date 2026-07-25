import { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Search, Filter, Star, MapPin, Briefcase, Loader2, Scale, BookOpen } from 'lucide-react';
import { attorneyService, type AttorneyProfile, type AttorneySearchParams } from '../../services/api/AttorneyService';
import { generateRoute } from '../../router/routes';
import { getErrorMessage } from '../../utils/errors';
import { useLocaleStore } from '../../stores/localeStore';

const SPECIALIZATIONS = [
  { value: 'criminal', label: 'Кримінальне' },
  { value: 'civil', label: 'Цивільне' },
  { value: 'administrative', label: 'Адміністративне' },
  { value: 'commercial', label: 'Господарське' },
  { value: 'family', label: 'Сімейне' },
  { value: 'labor', label: 'Трудове' },
  { value: 'tax', label: 'Податкове' },
  { value: 'ip', label: 'Інтелектуальна власність' },
  { value: 'real_estate', label: 'Нерухомість' },
];

const SORT_OPTIONS = [
  { value: 'rating', label: 'За рейтингом' },
  { value: 'price_asc', label: 'Ціна (зростання)' },
  { value: 'price_desc', label: 'Ціна (спадання)' },
  { value: 'experience', label: 'За досвідом' },
];

export function AttorneySearchPage() {
  const navigate = useNavigate();
  const lang = useLocaleStore(s => s.language === 'en' ? 'en' : 'uk');
  const [attorneys, setAttorneys] = useState<AttorneyProfile[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const [filters, setFilters] = useState<AttorneySearchParams>({
    sortBy: 'rating',
    limit: 20,
    offset: 0,
  });

  const search = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await attorneyService.searchAttorneys(filters);
      setAttorneys(result.attorneys);
      setTotal(result.total);
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    search();
  }, [search]);

  const updateFilter = (key: string, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value, offset: 0 }));
  };

  return (
    <div className="h-full overflow-y-auto">
    <div className="max-w-7xl mx-auto p-6">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <Scale className="w-7 h-7 text-indigo-600" />
          <h1 className="text-2xl font-bold text-gray-900">Знайти адвоката</h1>
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="flex items-center gap-2 px-4 py-2 border rounded-lg hover:bg-gray-50 text-sm"
        >
          <Filter className="w-4 h-4" />
          Фільтри
        </button>
      </div>

      <Link
        to={`/${lang}/marketplace-rules`}
        target="_blank"
        className="flex items-center gap-3 mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors group"
      >
        <BookOpen className="w-5 h-5 text-emerald-600 shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-emerald-800">Правила маркетплейсу юридичних консультацій</p>
          <p className="text-xs text-emerald-600 mt-0.5">Ознайомтесь з умовами замовлення консультацій, оплати та захисту ваших прав як клієнта</p>
        </div>
        <span className="text-emerald-500 text-xs shrink-0 group-hover:underline">Відкрити →</span>
      </Link>

      {showFilters && (
        <div className="mb-6 p-4 bg-gray-50 rounded-lg border grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Спеціалізація</label>
            <select
              className="w-full px-3 py-2 border rounded-md text-sm bg-white"
              value={filters.specialization || ''}
              onChange={e => updateFilter('specialization', e.target.value || undefined)}
            >
              <option value="">Всі</option>
              {SPECIALIZATIONS.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Регіон</label>
            <input
              type="text"
              placeholder="Напр. Київ"
              className="w-full px-3 py-2 border rounded-md text-sm"
              value={filters.region || ''}
              onChange={e => updateFilter('region', e.target.value || undefined)}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Макс. вартість (грн)</label>
            <input
              type="number"
              placeholder="5000"
              className="w-full px-3 py-2 border rounded-md text-sm"
              value={filters.maxFee || ''}
              onChange={e => updateFilter('maxFee', e.target.value ? parseFloat(e.target.value) : undefined)}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Сортування</label>
            <select
              className="w-full px-3 py-2 border rounded-md text-sm bg-white"
              value={filters.sortBy || 'rating'}
              onChange={e => updateFilter('sortBy', e.target.value)}
            >
              {SORT_OPTIONS.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={filters.freeConsultation || false}
                onChange={e => updateFilter('freeConsultation', e.target.checked || undefined)}
                className="rounded"
              />
              Безкоштовна консультація
            </label>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
        </div>
      ) : attorneys.length === 0 ? (
        <div className="text-center py-20">
          <Search className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-600 mb-2">Адвокатів не знайдено</h3>
          <p className="text-gray-400">Спробуйте змінити фільтри пошуку</p>
        </div>
      ) : (
        <>
          <p className="text-sm text-gray-500 mb-4">Знайдено: {total}</p>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {attorneys.map(attorney => (
              <AttorneyCard
                key={attorney.id}
                attorney={attorney}
                onClick={() => navigate(generateRoute.attorneyDetail(attorney.user_id))}
              />
            ))}
          </div>
          {total > (filters.limit || 20) && (
            <div className="flex justify-center gap-2 mt-6">
              <button
                disabled={!filters.offset}
                onClick={() => updateFilter('offset', Math.max(0, (filters.offset || 0) - (filters.limit || 20)))}
                className="px-4 py-2 border rounded-lg text-sm disabled:opacity-50 hover:bg-gray-50"
              >
                Назад
              </button>
              <button
                disabled={(filters.offset || 0) + (filters.limit || 20) >= total}
                onClick={() => updateFilter('offset', (filters.offset || 0) + (filters.limit || 20))}
                className="px-4 py-2 border rounded-lg text-sm disabled:opacity-50 hover:bg-gray-50"
              >
                Далі
              </button>
            </div>
          )}
        </>
      )}
    </div>
    </div>
  );
}

function AttorneyCard({ attorney, onClick }: { attorney: AttorneyProfile; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className="border rounded-lg p-5 hover:border-indigo-300 hover:shadow-md transition-all cursor-pointer bg-white"
    >
      <div className="flex items-start gap-3 mb-3">
        <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-semibold text-lg shrink-0">
          {(attorney.user_name || '?')[0].toUpperCase()}
        </div>
        <div className="min-w-0">
          <h3 className="font-semibold text-gray-900 truncate">{attorney.user_name}</h3>
          {attorney.organization_name && (
            <p className="text-xs text-gray-500 truncate">{attorney.organization_name}</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 mb-3">
        {[1, 2, 3, 4, 5].map(i => (
          <Star
            key={i}
            className={`w-4 h-4 ${i <= Math.round(attorney.average_rating) ? 'text-yellow-400 fill-yellow-400' : 'text-gray-200'}`}
          />
        ))}
        <span className="text-xs text-gray-500 ml-1">
          {Number(attorney.average_rating || 0).toFixed(1)} ({attorney.rating_count})
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-3">
        {attorney.specializations.slice(0, 3).map(spec => (
          <span key={spec} className="px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded text-xs">
            {SPECIALIZATIONS.find(s => s.value === spec)?.label || spec}
          </span>
        ))}
        {attorney.specializations.length > 3 && (
          <span className="px-2 py-0.5 bg-gray-100 text-gray-500 rounded text-xs">+{attorney.specializations.length - 3}</span>
        )}
      </div>

      <div className="flex items-center gap-4 text-xs text-gray-500">
        {attorney.city && (
          <span className="flex items-center gap-1">
            <MapPin className="w-3 h-3" />
            {attorney.city}
          </span>
        )}
        {attorney.years_experience && (
          <span className="flex items-center gap-1">
            <Briefcase className="w-3 h-3" />
            {attorney.years_experience} р. досвіду
          </span>
        )}
      </div>

      <div className="mt-3 pt-3 border-t flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-900">
          {attorney.consultation_fee_uah ? `${attorney.consultation_fee_uah} грн` : 'За домовленістю'}
        </span>
        {attorney.free_initial_consultation && (
          <span className="text-xs text-green-600 font-medium">Перша безкоштовно</span>
        )}
      </div>
    </div>
  );
}
