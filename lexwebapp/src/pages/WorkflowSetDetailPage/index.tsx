/**
 * WorkflowSetDetailPage — Shows a workflow set with all its workflows.
 */

import { useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Zap, Play, Loader2 } from 'lucide-react';
import { useWorkflowStore } from '../../stores/workflowStore';
import { WorkflowCard } from './WorkflowCard';
import { ROUTES } from '../../router/routes';

export function WorkflowSetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const cancelRef = useRef<(() => void) | null>(null);

  const {
    activeWorkflowSet,
    isLoading,
    error,
    executingWorkflowId,
    fetchWorkflowSet,
    executeWorkflow,
    cancelWorkflow,
  } = useWorkflowStore();

  useEffect(() => {
    if (id) fetchWorkflowSet(id);
  }, [id, fetchWorkflowSet]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (cancelRef.current) cancelRef.current();
    };
  }, []);

  const handleExecute = (workflowId: string) => {
    cancelRef.current = executeWorkflow(workflowId);
  };

  const handleCancel = async (workflowId: string) => {
    if (cancelRef.current) {
      cancelRef.current();
      cancelRef.current = null;
    }
    await cancelWorkflow(workflowId);
  };

  const handleLaunchAll = async () => {
    if (!activeWorkflowSet?.workflows) return;
    const pending = activeWorkflowSet.workflows.filter((w) => w.status === 'pending');
    if (pending.length > 0) {
      handleExecute(pending[0].id);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  if (!activeWorkflowSet) {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <button
          onClick={() => navigate(ROUTES.WORKFLOWS)}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Назад до списку
        </button>
        <p className="text-gray-500">Набір робочих процесів не знайдено.</p>
      </div>
    );
  }

  const pendingCount = activeWorkflowSet.workflows?.filter((w) => w.status === 'pending').length || 0;

  return (
    <div className="h-full overflow-y-auto">
    <div className="max-w-6xl mx-auto p-6">
      {/* Back button */}
      <button
        onClick={() => navigate(ROUTES.WORKFLOWS)}
        className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Назад до списку
      </button>

      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Zap className="w-6 h-6 text-indigo-600" />
          <h1 className="text-2xl font-bold text-gray-900">{activeWorkflowSet.title}</h1>
        </div>
        {activeWorkflowSet.description && (
          <p className="text-gray-500 mb-3">{activeWorkflowSet.description}</p>
        )}
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-400">
            Запит: "{activeWorkflowSet.source_query.slice(0, 100)}{activeWorkflowSet.source_query.length > 100 ? '...' : ''}"
          </span>
          <span className="text-sm text-gray-400">
            {new Date(activeWorkflowSet.created_at).toLocaleString('uk-UA')}
          </span>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Launch all button */}
      {pendingCount > 1 && !executingWorkflowId && (
        <div className="mb-6">
          <button
            onClick={handleLaunchAll}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
          >
            <Play className="w-4 h-4" />
            Запустити перший ({pendingCount} очікують)
          </button>
        </div>
      )}

      {/* Workflow cards */}
      <div className="space-y-4">
        {activeWorkflowSet.workflows?.map((workflow) => (
          <WorkflowCard
            key={workflow.id}
            workflow={workflow}
            onExecute={handleExecute}
            onCancel={handleCancel}
            isExecuting={executingWorkflowId === workflow.id}
          />
        ))}
      </div>
    </div>
    </div>
  );
}
