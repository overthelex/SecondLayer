/**
 * WorkflowCard — Individual workflow card with status, progress, and actions.
 */

import { useState } from 'react';
import { Play, Square, ChevronDown, ChevronRight, CheckCircle, AlertCircle, Clock, Loader2 } from 'lucide-react';
import type { Workflow } from '../../types/models/Workflow';
import { useCurrencyRate } from '../../hooks/useCurrencyRate';

interface WorkflowCardProps {
  workflow: Workflow;
  onExecute: (id: string) => void;
  onCancel: (id: string) => void;
  isExecuting: boolean;
}

const STATUS_BADGES: Record<string, { label: string; color: string; icon: typeof CheckCircle }> = {
  pending: { label: 'Очікує', color: 'bg-gray-100 text-gray-600', icon: Clock },
  running: { label: 'Виконується', color: 'bg-blue-100 text-blue-700', icon: Loader2 },
  completed: { label: 'Завершено', color: 'bg-green-100 text-green-700', icon: CheckCircle },
  failed: { label: 'Помилка', color: 'bg-red-100 text-red-700', icon: AlertCircle },
  cancelled: { label: 'Скасовано', color: 'bg-gray-100 text-gray-500', icon: Square },
};

export function WorkflowCard({ workflow, onExecute, onCancel, isExecuting }: WorkflowCardProps) {
  const [expanded, setExpanded] = useState(false);
  const { formatUah } = useCurrencyRate();
  const status = STATUS_BADGES[workflow.status] || STATUS_BADGES.pending;
  const StatusIcon = status.icon;

  const progress = workflow.progress;
  const progressPercent = progress.totalSteps
    ? Math.round(((progress.currentStep || 0) / progress.totalSteps) * 100)
    : 0;

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-lg">
              #{workflow.sequence_number}
            </span>
            <h4 className="text-base font-semibold text-gray-900">{workflow.title}</h4>
          </div>
          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${status.color}`}>
            <StatusIcon className={`w-3 h-3 ${workflow.status === 'running' ? 'animate-spin' : ''}`} />
            {status.label}
          </span>
        </div>

        {workflow.description && (
          <p className="text-sm text-gray-500 mb-3">{workflow.description}</p>
        )}

        {/* Progress bar */}
        {workflow.status === 'running' && progress.totalSteps && (
          <div className="mb-3">
            <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
              <span>Крок {progress.currentStep || 0} / {progress.totalSteps}</span>
              {progress.currentTool && <span className="font-mono text-indigo-600">{progress.currentTool}</span>}
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        )}

        {/* Error message */}
        {workflow.error_message && (
          <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg mb-3">
            {workflow.error_message}
          </div>
        )}

        {/* Cost */}
        {workflow.cost_usd > 0 && (
          <div className="text-xs text-gray-400 mb-3">
            Вартість: {formatUah(workflow.cost_usd)}
          </div>
        )}

        {/* Actions + expand */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
          >
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            {workflow.plan.steps.length} кроків
          </button>

          <div className="flex items-center gap-2">
            {workflow.status === 'pending' && (
              <button
                onClick={() => onExecute(workflow.id)}
                disabled={isExecuting}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 rounded-lg transition-colors"
              >
                <Play className="w-3.5 h-3.5" />
                Запустити
              </button>
            )}
            {workflow.status === 'running' && (
              <button
                onClick={() => onCancel(workflow.id)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
              >
                <Square className="w-3.5 h-3.5" />
                Скасувати
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Expanded plan steps */}
      {expanded && (
        <div className="border-t border-gray-100 bg-gray-50 px-5 py-4">
          <h5 className="text-xs font-semibold text-gray-500 uppercase mb-3">План виконання</h5>
          <div className="space-y-2">
            {workflow.plan.steps.map((step) => (
              <div key={step.id} className="flex items-start gap-3 text-sm">
                <span className="flex-shrink-0 w-6 h-6 bg-white border border-gray-200 rounded-full flex items-center justify-center text-xs font-medium text-gray-500">
                  {step.id}
                </span>
                <div>
                  <span className="font-mono text-xs text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">
                    {step.tool}
                  </span>
                  <p className="text-gray-600 mt-0.5">{step.purpose}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Results */}
          {workflow.results && workflow.status === 'completed' && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <h5 className="text-xs font-semibold text-gray-500 uppercase mb-2">Результати</h5>
              <pre className="text-xs text-gray-600 bg-white p-3 rounded-lg overflow-auto max-h-60">
                {JSON.stringify(workflow.results, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
