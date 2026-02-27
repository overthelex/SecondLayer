/**
 * Workflow Store — Zustand store for workflow sets and execution state.
 */

import { create } from 'zustand';
import { workflowService } from '../services';
import type { WorkflowSet, Workflow } from '../types/models/Workflow';

interface WorkflowState {
  workflowSets: WorkflowSet[];
  activeWorkflowSet: WorkflowSet | null;
  isLoading: boolean;
  executingWorkflowId: string | null;
  error: string | null;

  fetchWorkflowSets: () => Promise<void>;
  fetchWorkflowSet: (id: string) => Promise<void>;
  executeWorkflow: (id: string) => () => void;
  cancelWorkflow: (id: string) => Promise<void>;
  deleteWorkflowSet: (id: string) => Promise<void>;
  updateWorkflowProgress: (workflowId: string, update: Partial<Workflow>) => void;
  clearError: () => void;
}

export const useWorkflowStore = create<WorkflowState>((set, get) => ({
  workflowSets: [],
  activeWorkflowSet: null,
  isLoading: false,
  executingWorkflowId: null,
  error: null,

  fetchWorkflowSets: async () => {
    set({ isLoading: true, error: null });
    try {
      const sets = await workflowService.listWorkflowSets();
      set({ workflowSets: sets, isLoading: false });
    } catch (err: any) {
      set({ error: err.message || 'Failed to load workflows', isLoading: false });
    }
  },

  fetchWorkflowSet: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      const workflowSet = await workflowService.getWorkflowSet(id);
      set({ activeWorkflowSet: workflowSet, isLoading: false });
    } catch (err: any) {
      set({ error: err.message || 'Failed to load workflow set', isLoading: false });
    }
  },

  executeWorkflow: (id: string) => {
    set({ executingWorkflowId: id });

    const cancel = workflowService.executeWorkflow(id, {
      onStepStart: (data) => {
        const { activeWorkflowSet } = get();
        if (!activeWorkflowSet?.workflows) return;
        const workflows = activeWorkflowSet.workflows.map((w) =>
          w.id === data.workflowId
            ? {
                ...w,
                status: 'running' as const,
                progress: {
                  currentStep: data.stepIndex + 1,
                  totalSteps: data.totalSteps,
                  currentTool: data.tool,
                },
              }
            : w
        );
        set({ activeWorkflowSet: { ...activeWorkflowSet, workflows } });
      },
      onStepComplete: (data) => {
        const { activeWorkflowSet } = get();
        if (!activeWorkflowSet?.workflows) return;
        const workflows = activeWorkflowSet.workflows.map((w) =>
          w.id === data.workflowId
            ? {
                ...w,
                progress: {
                  ...w.progress,
                  currentStep: data.stepIndex + 1,
                },
              }
            : w
        );
        set({ activeWorkflowSet: { ...activeWorkflowSet, workflows } });
      },
      onWorkflowComplete: (data) => {
        const { activeWorkflowSet } = get();
        if (!activeWorkflowSet?.workflows) return;
        const workflows = activeWorkflowSet.workflows.map((w) =>
          w.id === data.workflowId
            ? { ...w, status: 'completed' as const, cost_usd: data.costUsd || 0 }
            : w
        );
        set({
          activeWorkflowSet: { ...activeWorkflowSet, workflows },
          executingWorkflowId: null,
        });
      },
      onStepError: (data) => {
        const { activeWorkflowSet } = get();
        if (!activeWorkflowSet?.workflows) return;
        const workflows = activeWorkflowSet.workflows.map((w) =>
          w.id === data.workflowId
            ? { ...w, error_message: data.error }
            : w
        );
        set({ activeWorkflowSet: { ...activeWorkflowSet, workflows } });
      },
      onError: (error) => {
        set({ error, executingWorkflowId: null });
      },
    });

    return cancel;
  },

  cancelWorkflow: async (id: string) => {
    try {
      await workflowService.cancelWorkflow(id);
      set({ executingWorkflowId: null });
    } catch (err: any) {
      set({ error: err.message || 'Failed to cancel workflow' });
    }
  },

  deleteWorkflowSet: async (id: string) => {
    try {
      await workflowService.deleteWorkflowSet(id);
      set((state) => ({
        workflowSets: state.workflowSets.filter((s) => s.id !== id),
        activeWorkflowSet: state.activeWorkflowSet?.id === id ? null : state.activeWorkflowSet,
      }));
    } catch (err: any) {
      set({ error: err.message || 'Failed to delete workflow set' });
    }
  },

  updateWorkflowProgress: (workflowId: string, update: Partial<Workflow>) => {
    const { activeWorkflowSet } = get();
    if (!activeWorkflowSet?.workflows) return;
    const workflows = activeWorkflowSet.workflows.map((w) =>
      w.id === workflowId ? { ...w, ...update } : w
    );
    set({ activeWorkflowSet: { ...activeWorkflowSet, workflows } });
  },

  clearError: () => set({ error: null }),
}));
