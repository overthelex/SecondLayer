/**
 * WorkflowsPage — Lists all workflow sets for the current user.
 * Includes a preset template picker with search and category filters.
 */

import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Zap, Clock, CheckCircle, AlertCircle, Trash2, Loader2, Shield, UserX, ShieldAlert, Plus, Search, X, ListChecks } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useWorkflowStore } from '../../stores/workflowStore';
import { workflowService } from '../../services/api/WorkflowService';

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof CheckCircle }> = {
  pending: { label: 'Очікує', color: 'bg-gray-100 text-gray-700', icon: Clock },
  running: { label: 'Виконується', color: 'bg-blue-100 text-blue-700', icon: Loader2 },
  completed: { label: 'Завершено', color: 'bg-green-100 text-green-700', icon: CheckCircle },
  partial: { label: 'Частково', color: 'bg-yellow-100 text-yellow-700', icon: AlertCircle },
  failed: { label: 'Помилка', color: 'bg-red-100 text-red-700', icon: AlertCircle },
};

const PRESET_ICONS: Record<string, typeof Shield> = {
  shield: Shield,
  'user-x': UserX,
  'shield-alert': ShieldAlert,
};

const CATEGORY_LABELS: Record<string, string> = {
  military: 'Військове право',
};

type PresetItem = {
  id: string;
  title: string;
  description: string;
  icon: string;
  category: string;
  tags: string[];
  stepsCount: number;
};

export function WorkflowsPage() {
  const navigate = useNavigate();
  const { workflowSets, isLoading, error } = useWorkflowStore(
    useShallow(s => ({ workflowSets: s.workflowSets, isLoading: s.isLoading, error: s.error }))
  );
  const fetchWorkflowSets = useWorkflowStore(s => s.fetchWorkflowSets);
  const deleteWorkflowSet = useWorkflowStore(s => s.deleteWorkflowSet);

  const [presets, setPresets] = useState<PresetItem[]>([]);
  const [creatingPreset, setCreatingPreset] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  useEffect(() => {
    fetchWorkflowSets();
    workflowService.listPresets().then(setPresets).catch(() => {});
  }, [fetchWorkflowSets]);

  // Derive unique categories from presets
  const categories = useMemo(() => {
    const cats = [...new Set(presets.map(p => p.category))];
    return cats.map(c => ({ id: c, label: CATEGORY_LABELS[c] || c }));
  }, [presets]);

  // Filter presets by search + category
  const filteredPresets = useMemo(() => {
    let result = presets;
    if (activeCategory) {
      result = result.filter(p => p.category === activeCategory);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(p =>
        p.title.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.tags.some(t => t.toLowerCase().includes(q))
      );
    }
    return result;
  }, [presets, searchQuery, activeCategory]);

  const handleCreateFromPreset = async (presetId: string) => {
    setCreatingPreset(presetId);
    try {
      const result = await workflowService.createFromPreset(presetId);
      await fetchWorkflowSets();
      navigate(`/workflows/${result.id}`);
    } catch (err) {
      console.error('Failed to create from preset:', err);
    } finally {
      setCreatingPreset(null);
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (window.confirm('Видалити цей набір робочих процесів?')) {
      await deleteWorkflowSet(id);
    }
  };

  return (
    <div className="h-full overflow-y-auto">
    <div className="max-w-6xl mx-auto p-6">
      <div className="flex items-center gap-3 mb-8">
        <Zap className="w-7 h-7 text-indigo-600" />
        <h1 className="text-2xl font-bold text-gray-900">Workflows</h1>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* ── Preset Templates Section ── */}
      {presets.length > 0 && (
        <div className="mb-10">
          <div className="flex items-center gap-2 mb-4">
            <Plus className="w-5 h-5 text-indigo-500" />
            <h2 className="text-lg font-semibold text-gray-800">Готові шаблони аналізу</h2>
          </div>

          {/* Search + Filters */}
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            {/* Search input */}
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Пошук шаблонів..."
                className="w-full pl-10 pr-9 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-indigo-400 transition-colors"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Category filters */}
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setActiveCategory(null)}
                className={`px-3 py-2 rounded-xl text-xs font-medium border transition-all ${
                  !activeCategory
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300'
                }`}
              >
                Всі
              </button>
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(activeCategory === cat.id ? null : cat.id)}
                  className={`px-3 py-2 rounded-xl text-xs font-medium border transition-all ${
                    activeCategory === cat.id
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* Preset cards */}
          {filteredPresets.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">
              Шаблонів за запитом не знайдено
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredPresets.map((preset) => {
                const IconComponent = PRESET_ICONS[preset.icon] || Shield;
                const isCreating = creatingPreset === preset.id;
                return (
                  <button
                    key={preset.id}
                    onClick={() => handleCreateFromPreset(preset.id)}
                    disabled={isCreating}
                    className="text-left bg-gradient-to-br from-indigo-50 to-white border border-indigo-200 rounded-xl p-4 hover:border-indigo-400 hover:shadow-md transition-all disabled:opacity-50 group"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      {isCreating ? (
                        <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
                      ) : (
                        <IconComponent className="w-5 h-5 text-indigo-600" />
                      )}
                      <span className="font-medium text-gray-900 text-sm flex-1">{preset.title}</span>
                    </div>
                    <p className="text-xs text-gray-500 line-clamp-2 mb-3">{preset.description}</p>
                    <div className="flex items-center justify-between">
                      <div className="flex flex-wrap gap-1">
                        {preset.tags.slice(0, 3).map((tag) => (
                          <span key={tag} className="inline-flex px-1.5 py-0.5 rounded-md bg-indigo-100/60 text-indigo-600 text-[10px] font-medium">
                            {tag}
                          </span>
                        ))}
                      </div>
                      <span className="inline-flex items-center gap-1 text-[10px] text-gray-400">
                        <ListChecks size={10} />
                        {preset.stepsCount}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Existing Workflow Sets ── */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
        </div>
      ) : workflowSets.length === 0 ? (
        <div className="text-center py-20">
          <Zap className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-600 mb-2">Робочих процесів поки немає</h3>
          <p className="text-gray-400 max-w-md mx-auto">
            Задайте в чаті запит на глибокий інституційний аналіз (наприклад, &quot;проаналізуй всі рішення суддів Оболонського суду за 15 років&quot;) — система автоматично створить набір робочих процесів.
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {workflowSets.map((set) => {
            const status = STATUS_CONFIG[set.status] || STATUS_CONFIG.pending;
            const StatusIcon = status.icon;
            const workflowCount = (set as any).workflow_count || 0;
            const completedCount = (set as any).completed_count || 0;

            return (
              <div
                key={set.id}
                onClick={() => navigate(`/workflows/${set.id}`)}
                className="bg-white border border-gray-200 rounded-xl p-5 hover:border-indigo-300 hover:shadow-md transition-all cursor-pointer group"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold text-gray-900 truncate">{set.title}</h3>
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${status.color}`}>
                        <StatusIcon className="w-3 h-3" />
                        {status.label}
                      </span>
                    </div>
                    {set.description && (
                      <p className="text-sm text-gray-500 mb-2 line-clamp-2">{set.description}</p>
                    )}
                    <div className="flex items-center gap-4 text-xs text-gray-400">
                      <span>{workflowCount} процесів ({completedCount} завершено)</span>
                      <span>{new Date(set.created_at).toLocaleDateString('uk-UA')}</span>
                    </div>
                  </div>
                  <button
                    onClick={(e) => handleDelete(e, set.id)}
                    className="p-2 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Видалити"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
    </div>
  );
}
