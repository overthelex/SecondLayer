/**
 * WorkflowsPage — Lists all workflow sets for the current user.
 */

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Zap, Clock, CheckCircle, AlertCircle, Trash2, Loader2 } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useWorkflowStore } from '../../stores/workflowStore';

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof CheckCircle }> = {
  pending: { label: 'Очікує', color: 'bg-gray-100 text-gray-700', icon: Clock },
  running: { label: 'Виконується', color: 'bg-blue-100 text-blue-700', icon: Loader2 },
  completed: { label: 'Завершено', color: 'bg-green-100 text-green-700', icon: CheckCircle },
  partial: { label: 'Частково', color: 'bg-yellow-100 text-yellow-700', icon: AlertCircle },
  failed: { label: 'Помилка', color: 'bg-red-100 text-red-700', icon: AlertCircle },
};

export function WorkflowsPage() {
  const navigate = useNavigate();
  const { workflowSets, isLoading, error } = useWorkflowStore(
    useShallow(s => ({ workflowSets: s.workflowSets, isLoading: s.isLoading, error: s.error }))
  );
  const fetchWorkflowSets = useWorkflowStore(s => s.fetchWorkflowSets);
  const deleteWorkflowSet = useWorkflowStore(s => s.deleteWorkflowSet);

  useEffect(() => {
    fetchWorkflowSets();
  }, [fetchWorkflowSets]);

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

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
        </div>
      ) : workflowSets.length === 0 ? (
        <div className="text-center py-20">
          <Zap className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-600 mb-2">Робочих процесів поки немає</h3>
          <p className="text-gray-400 max-w-md mx-auto">
            Задайте в чаті запит на глибокий інституційний аналіз (наприклад, "проаналізуй всі рішення суддів Оболонського суду за 15 років") — система автоматично створить набір робочих процесів.
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
