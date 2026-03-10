/**
 * WorkflowService — API client for workflow sets and workflow execution.
 */

import { BaseService } from '../base/BaseService';
import type { WorkflowSet, Workflow } from '../../types/models/Workflow';

export interface WorkflowSSECallbacks {
  onStepStart?: (data: { workflowId: string; stepId: number; stepIndex: number; totalSteps: number; tool: string; purpose: string }) => void;
  onStepComplete?: (data: { workflowId: string; stepId: number; stepIndex: number; tool: string; result: any }) => void;
  onStepError?: (data: { workflowId: string; stepId?: number; tool?: string; error: string }) => void;
  onWorkflowComplete?: (data: { workflowId: string; status: string; stepCount: number; costUsd: number }) => void;
  onError?: (error: string) => void;
}

export class WorkflowService extends BaseService {
  async listWorkflowSets(): Promise<WorkflowSet[]> {
    return this.request(
      () => this.client.get('/api/workflow-sets'),
      (data: any) => data.workflow_sets || []
    );
  }

  async getWorkflowSet(id: string): Promise<WorkflowSet> {
    return this.request(() => this.client.get(`/api/workflow-sets/${id}`));
  }

  async getWorkflow(id: string): Promise<Workflow> {
    return this.request(() => this.client.get(`/api/workflows/${id}`));
  }

  async deleteWorkflowSet(id: string): Promise<void> {
    return this.requestVoid(() => this.client.delete(`/api/workflow-sets/${id}`));
  }

  async cancelWorkflow(id: string): Promise<void> {
    return this.requestVoid(() => this.client.post(`/api/workflows/${id}/cancel`));
  }

  executeWorkflow(id: string, callbacks: WorkflowSSECallbacks): () => void {
    const token = localStorage.getItem('auth_token');
    const baseUrl = import.meta.env.VITE_API_URL || 'https://stage.legal.org.ua';

    const abortController = new AbortController();

    fetch(`${baseUrl}/api/workflows/${id}/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      signal: abortController.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          const error = await response.json().catch(() => ({ error: 'Unknown error' }));
          callbacks.onError?.(error.error || `HTTP ${response.status}`);
          return;
        }

        const reader = response.body?.getReader();
        if (!reader) return;

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          let eventType = '';
          for (const line of lines) {
            if (line.startsWith('event: ')) {
              eventType = line.slice(7).trim();
            } else if (line.startsWith('data: ') && eventType) {
              try {
                const data = JSON.parse(line.slice(6));
                this.handleSSEEvent(eventType, data, callbacks);
              } catch {
                // skip malformed
              }
              eventType = '';
            }
          }
        }
      })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          callbacks.onError?.(err.message);
        }
      });

    return () => abortController.abort();
  }

  private handleSSEEvent(type: string, data: any, callbacks: WorkflowSSECallbacks): void {
    switch (type) {
      case 'step_start':
        callbacks.onStepStart?.(data);
        break;
      case 'step_complete':
        callbacks.onStepComplete?.(data);
        break;
      case 'step_error':
        callbacks.onStepError?.(data);
        break;
      case 'workflow_complete':
        callbacks.onWorkflowComplete?.(data);
        break;
      case 'error':
        callbacks.onError?.(data.error || 'Unknown error');
        break;
    }
  }
}

export const workflowService = new WorkflowService();
