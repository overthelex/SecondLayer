/**
 * WorkflowExecutorService — Executes a workflow's plan steps via ToolRegistry.
 * Streams SSE events and updates progress in DB after each step.
 */

import { logger } from '../utils/logger.js';
import { ToolRegistry } from '../api/tool-registry.js';
import { WorkflowService, WorkflowRow } from './workflow-service.js';
import { CostTracker } from './cost-tracker.js';

export interface WorkflowSSEEvent {
  type: 'step_start' | 'step_complete' | 'step_error' | 'workflow_complete' | 'heartbeat';
  data: any;
}

export class WorkflowExecutorService {
  private runningWorkflows = new Map<string, AbortController>();

  constructor(
    private toolRegistry: ToolRegistry,
    private workflowService: WorkflowService,
    private costTracker: CostTracker
  ) {}

  /**
   * Execute a single workflow. Yields SSE events for streaming.
   */
  async *execute(workflow: WorkflowRow, userId: string, signal?: AbortSignal): AsyncGenerator<WorkflowSSEEvent> {
    const controller = new AbortController();
    this.runningWorkflows.set(workflow.id, controller);

    // Link external signal
    if (signal) {
      signal.addEventListener('abort', () => controller.abort());
    }

    const plan = workflow.plan as { goal: string; steps: Array<{ id: number; tool: string; params: Record<string, any>; purpose: string }> };
    if (!plan.steps || plan.steps.length === 0) {
      yield { type: 'workflow_complete', data: { workflowId: workflow.id, status: 'completed', results: {} } };
      return;
    }

    await this.workflowService.updateWorkflowStatus(workflow.id, 'running');

    const stepResults: Record<number, any> = {};
    let totalCostUsd = 0;

    // Heartbeat interval (15 seconds) for proxy keepalive
    const heartbeatInterval = setInterval(() => {
      // Heartbeat is yielded via a flag checked in the main loop
    }, 15000);
    let lastHeartbeat = Date.now();

    try {
      for (let i = 0; i < plan.steps.length; i++) {
        if (controller.signal.aborted) {
          await this.workflowService.updateWorkflowStatus(workflow.id, 'cancelled');
          break;
        }

        const step = plan.steps[i];

        // Emit step_start
        yield {
          type: 'step_start',
          data: {
            workflowId: workflow.id,
            stepId: step.id,
            stepIndex: i,
            totalSteps: plan.steps.length,
            tool: step.tool,
            purpose: step.purpose,
          },
        };

        // Update progress
        await this.workflowService.updateWorkflowProgress(workflow.id, {
          currentStep: i + 1,
          totalSteps: plan.steps.length,
          currentTool: step.tool,
        });

        try {
          // Inject userId for vault tools
          const VAULT_TOOLS = new Set(['store_document', 'get_document', 'list_documents', 'semantic_search', 'list_folders', 'delete_document', 'update_document']);
          const toolArgs = VAULT_TOOLS.has(step.tool)
            ? { ...step.params, userId }
            : step.params;

          const result = await this.toolRegistry.executeTool(step.tool, toolArgs);
          stepResults[step.id] = result;

          yield {
            type: 'step_complete',
            data: {
              workflowId: workflow.id,
              stepId: step.id,
              stepIndex: i,
              tool: step.tool,
              result,
            },
          };
        } catch (err: any) {
          logger.error('[WorkflowExecutor] Step failed', { workflowId: workflow.id, step: step.id, tool: step.tool, error: err.message });
          stepResults[step.id] = { error: err.message };

          yield {
            type: 'step_error',
            data: {
              workflowId: workflow.id,
              stepId: step.id,
              tool: step.tool,
              error: err.message,
            },
          };
          // Continue with remaining steps even if one fails
        }

        // Heartbeat if more than 15s since last event
        if (Date.now() - lastHeartbeat > 15000) {
          yield { type: 'heartbeat', data: {} };
          lastHeartbeat = Date.now();
        }
      }

      // Save results
      if (!controller.signal.aborted) {
        await this.workflowService.updateWorkflowResults(workflow.id, stepResults, totalCostUsd);
        yield {
          type: 'workflow_complete',
          data: {
            workflowId: workflow.id,
            status: 'completed',
            stepCount: plan.steps.length,
            costUsd: totalCostUsd,
          },
        };
      }
    } catch (err: any) {
      logger.error('[WorkflowExecutor] Workflow failed', { workflowId: workflow.id, error: err.message });
      await this.workflowService.updateWorkflowStatus(workflow.id, 'failed', err.message);
      yield {
        type: 'step_error',
        data: {
          workflowId: workflow.id,
          error: err.message,
        },
      };
    } finally {
      clearInterval(heartbeatInterval);
      this.runningWorkflows.delete(workflow.id);
    }
  }

  cancel(workflowId: string): boolean {
    const controller = this.runningWorkflows.get(workflowId);
    if (controller) {
      controller.abort();
      return true;
    }
    return false;
  }

  isRunning(workflowId: string): boolean {
    return this.runningWorkflows.has(workflowId);
  }
}
