/**
 * Workflow REST API routes.
 * Provides CRUD for workflow sets and SSE-based workflow execution.
 */

import { Router, Response } from 'express';
import { logger } from '../utils/logger.js';
import { WorkflowService } from '../services/workflow-service.js';
import { WorkflowExecutorService } from '../services/workflow-executor-service.js';
import { getWorkflowPreset, WORKFLOW_PRESET_LIST } from '../services/workflow-presets.js';

interface DualAuthRequest {
  user?: { id: string; email?: string };
  body: any;
  params: any;
  query: any;
}

/**
 * Workflow-sets routes — mounted at /api/workflow-sets
 */
export function createWorkflowSetRoutes(
  workflowService: WorkflowService
): Router {
  const router = Router();

  // GET /api/workflow-sets/presets — List available presets (MUST be before /:id)
  router.get('/presets', (async (_req: DualAuthRequest, res: Response): Promise<any> => {
    res.json({ presets: WORKFLOW_PRESET_LIST });
  }) as any);

  // GET /api/workflow-sets — List user's workflow sets
  router.get('/', (async (req: DualAuthRequest, res: Response): Promise<any> => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    try {
      const sets = await workflowService.listWorkflowSets(userId);
      res.json({ workflow_sets: sets });
    } catch (error: any) {
      logger.error('[WorkflowRoutes] Failed to list workflow sets', { error: error.message });
      res.status(500).json({ error: 'Failed to list workflow sets' });
    }
  }) as any);

  // GET /api/workflow-sets/:id — Get workflow set with all workflows
  router.get('/:id', (async (req: DualAuthRequest, res: Response): Promise<any> => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    try {
      const set = await workflowService.getWorkflowSet(req.params.id, userId);
      if (!set) return res.status(404).json({ error: 'Workflow set not found' });
      res.json(set);
    } catch (error: any) {
      logger.error('[WorkflowRoutes] Failed to get workflow set', { error: error.message });
      res.status(500).json({ error: 'Failed to get workflow set' });
    }
  }) as any);

  // POST /api/workflow-sets/presets/:presetId — Create workflow set from preset
  router.post('/presets/:presetId', (async (req: DualAuthRequest, res: Response): Promise<any> => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const preset = getWorkflowPreset(req.params.presetId);
    if (!preset) {
      return res.status(404).json({
        error: `Preset "${req.params.presetId}" not found`,
        available: WORKFLOW_PRESET_LIST.map(p => p.id),
      });
    }

    try {
      const workflowSet = await workflowService.createWorkflowSet({
        userId,
        title: preset.title,
        description: preset.description,
        sourceQuery: `[preset:${req.params.presetId}] ${preset.title}`,
        metadata: { preset: req.params.presetId },
        workflows: preset.workflows.map(wf => ({
          sequenceNumber: wf.sequenceNumber,
          title: wf.title,
          description: wf.description,
          plan: wf.plan,
        })),
      });

      logger.info('[WorkflowRoutes] Created workflow set from preset', {
        presetId: req.params.presetId,
        workflowSetId: workflowSet.id,
        workflowCount: preset.workflows.length,
      });

      res.json(workflowSet);
    } catch (error: any) {
      logger.error('[WorkflowRoutes] Failed to create from preset', { error: error.message });
      res.status(500).json({ error: 'Failed to create workflow set from preset' });
    }
  }) as any);

  // DELETE /api/workflow-sets/:id — Delete workflow set
  router.delete('/:id', (async (req: DualAuthRequest, res: Response): Promise<any> => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    try {
      const deleted = await workflowService.deleteWorkflowSet(req.params.id, userId);
      if (!deleted) return res.status(404).json({ error: 'Workflow set not found' });
      res.json({ success: true });
    } catch (error: any) {
      logger.error('[WorkflowRoutes] Failed to delete workflow set', { error: error.message });
      res.status(500).json({ error: 'Failed to delete workflow set' });
    }
  }) as any);

  return router;
}

/**
 * Workflow routes — mounted at /api/workflows
 */
export function createWorkflowRoutes(
  workflowService: WorkflowService,
  workflowExecutor: WorkflowExecutorService
): Router {
  const router = Router();

  // GET /api/workflows/:id — Get single workflow detail
  router.get('/:id', (async (req: DualAuthRequest, res: Response): Promise<any> => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    try {
      const workflow = await workflowService.getWorkflowWithOwner(req.params.id);
      if (!workflow || workflow.user_id !== userId) {
        return res.status(404).json({ error: 'Workflow not found' });
      }
      res.json(workflow);
    } catch (error: any) {
      logger.error('[WorkflowRoutes] Failed to get workflow', { error: error.message });
      res.status(500).json({ error: 'Failed to get workflow' });
    }
  }) as any);

  // POST /api/workflows/:id/execute — Execute workflow (SSE stream)
  router.post('/:id/execute', (async (req: DualAuthRequest, res: Response): Promise<any> => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    try {
      const workflow = await workflowService.getWorkflowWithOwner(req.params.id);
      if (!workflow || workflow.user_id !== userId) {
        return res.status(404).json({ error: 'Workflow not found' });
      }

      if (workflow.status === 'running') {
        return res.status(409).json({ error: 'Workflow is already running' });
      }

      if (workflow.status === 'completed') {
        return res.status(409).json({ error: 'Workflow is already completed' });
      }

      // Set up SSE
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      });

      const abortController = new AbortController();
      req.body?._req?.on?.('close', () => abortController.abort());

      for await (const event of workflowExecutor.execute(workflow, userId, abortController.signal)) {
        if (abortController.signal.aborted) break;
        res.write(`event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`);
      }

      res.write('event: done\ndata: {}\n\n');
      res.end();
    } catch (error: any) {
      logger.error('[WorkflowRoutes] Failed to execute workflow', { error: error.message });
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to execute workflow' });
      } else {
        res.write(`event: error\ndata: ${JSON.stringify({ error: error.message })}\n\n`);
        res.end();
      }
    }
  }) as any);

  // POST /api/workflows/:id/cancel — Cancel running workflow
  router.post('/:id/cancel', (async (req: DualAuthRequest, res: Response): Promise<any> => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    try {
      const workflow = await workflowService.getWorkflowWithOwner(req.params.id);
      if (!workflow || workflow.user_id !== userId) {
        return res.status(404).json({ error: 'Workflow not found' });
      }

      const cancelled = workflowExecutor.cancel(req.params.id);
      if (cancelled) {
        await workflowService.updateWorkflowStatus(req.params.id, 'cancelled');
        res.json({ success: true });
      } else {
        res.status(404).json({ error: 'Workflow is not running' });
      }
    } catch (error: any) {
      logger.error('[WorkflowRoutes] Failed to cancel workflow', { error: error.message });
      res.status(500).json({ error: 'Failed to cancel workflow' });
    }
  }) as any);

  return router;
}
