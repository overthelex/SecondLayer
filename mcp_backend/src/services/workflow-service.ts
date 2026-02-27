/**
 * WorkflowService — CRUD for workflow_sets and workflows tables.
 */

import { logger } from '../utils/logger.js';
import type { BaseDatabase } from '@secondlayer/shared';

export interface WorkflowSetRow {
  id: string;
  user_id: string;
  conversation_id: string | null;
  title: string;
  description: string | null;
  source_query: string;
  status: string;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface WorkflowRow {
  id: string;
  workflow_set_id: string;
  sequence_number: number;
  title: string;
  description: string | null;
  status: string;
  progress: Record<string, any>;
  plan: Record<string, any>;
  results: Record<string, any> | null;
  error_message: string | null;
  cost_usd: number;
  created_at: string;
  updated_at: string;
}

export interface CreateWorkflowSetInput {
  userId: string;
  conversationId?: string;
  title: string;
  description?: string;
  sourceQuery: string;
  metadata?: Record<string, any>;
  workflows: Array<{
    sequenceNumber: number;
    title: string;
    description?: string;
    plan: Record<string, any>;
  }>;
}

export class WorkflowService {
  constructor(private db: BaseDatabase) {}

  async createWorkflowSet(input: CreateWorkflowSetInput): Promise<WorkflowSetRow & { workflows: WorkflowRow[] }> {
    const pool = this.db.getPool();

    const setResult = await pool.query(
      `INSERT INTO workflow_sets (user_id, conversation_id, title, description, source_query, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [input.userId, input.conversationId || null, input.title, input.description || null, input.sourceQuery, JSON.stringify(input.metadata || {})]
    );
    const workflowSet = setResult.rows[0] as WorkflowSetRow;

    const workflows: WorkflowRow[] = [];
    for (const wf of input.workflows) {
      const wfResult = await pool.query(
        `INSERT INTO workflows (workflow_set_id, sequence_number, title, description, plan)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [workflowSet.id, wf.sequenceNumber, wf.title, wf.description || null, JSON.stringify(wf.plan)]
      );
      workflows.push(wfResult.rows[0] as WorkflowRow);
    }

    logger.info('[WorkflowService] Created workflow set', { id: workflowSet.id, workflowCount: workflows.length });
    return { ...workflowSet, workflows };
  }

  async listWorkflowSets(userId: string): Promise<WorkflowSetRow[]> {
    const pool = this.db.getPool();
    const result = await pool.query(
      `SELECT ws.*,
              (SELECT COUNT(*) FROM workflows w WHERE w.workflow_set_id = ws.id) as workflow_count,
              (SELECT COUNT(*) FROM workflows w WHERE w.workflow_set_id = ws.id AND w.status = 'completed') as completed_count
       FROM workflow_sets ws
       WHERE ws.user_id = $1
       ORDER BY ws.created_at DESC
       LIMIT 50`,
      [userId]
    );
    return result.rows;
  }

  async getWorkflowSet(id: string, userId: string): Promise<(WorkflowSetRow & { workflows: WorkflowRow[] }) | null> {
    const pool = this.db.getPool();
    const setResult = await pool.query(
      `SELECT * FROM workflow_sets WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
    if (setResult.rows.length === 0) return null;

    const workflowSet = setResult.rows[0] as WorkflowSetRow;
    const wfResult = await pool.query(
      `SELECT * FROM workflows WHERE workflow_set_id = $1 ORDER BY sequence_number`,
      [id]
    );

    return { ...workflowSet, workflows: wfResult.rows as WorkflowRow[] };
  }

  async getWorkflow(id: string): Promise<WorkflowRow | null> {
    const pool = this.db.getPool();
    const result = await pool.query(`SELECT * FROM workflows WHERE id = $1`, [id]);
    return result.rows[0] as WorkflowRow || null;
  }

  async getWorkflowWithOwner(id: string): Promise<(WorkflowRow & { user_id: string }) | null> {
    const pool = this.db.getPool();
    const result = await pool.query(
      `SELECT w.*, ws.user_id FROM workflows w
       JOIN workflow_sets ws ON ws.id = w.workflow_set_id
       WHERE w.id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  async updateWorkflowStatus(id: string, status: string, errorMessage?: string): Promise<void> {
    const pool = this.db.getPool();
    await pool.query(
      `UPDATE workflows SET status = $2, error_message = $3 WHERE id = $1`,
      [id, status, errorMessage || null]
    );

    // Update parent set status based on child workflows
    await this.syncSetStatus(id);
  }

  async updateWorkflowProgress(id: string, progress: Record<string, any>): Promise<void> {
    const pool = this.db.getPool();
    await pool.query(
      `UPDATE workflows SET progress = $2 WHERE id = $1`,
      [id, JSON.stringify(progress)]
    );
  }

  async updateWorkflowResults(id: string, results: Record<string, any>, costUsd: number): Promise<void> {
    const pool = this.db.getPool();
    await pool.query(
      `UPDATE workflows SET results = $2, cost_usd = $3, status = 'completed' WHERE id = $1`,
      [id, JSON.stringify(results), costUsd]
    );
    await this.syncSetStatus(id);
  }

  async deleteWorkflowSet(id: string, userId: string): Promise<boolean> {
    const pool = this.db.getPool();
    const result = await pool.query(
      `DELETE FROM workflow_sets WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
    return (result.rowCount || 0) > 0;
  }

  private async syncSetStatus(workflowId: string): Promise<void> {
    const pool = this.db.getPool();
    // Get set id from workflow
    const wfResult = await pool.query(`SELECT workflow_set_id FROM workflows WHERE id = $1`, [workflowId]);
    if (wfResult.rows.length === 0) return;
    const setId = wfResult.rows[0].workflow_set_id;

    // Determine set status from child workflows
    const statusResult = await pool.query(
      `SELECT status, COUNT(*) as cnt FROM workflows WHERE workflow_set_id = $1 GROUP BY status`,
      [setId]
    );
    const statuses: Record<string, number> = {};
    for (const row of statusResult.rows) {
      statuses[row.status] = parseInt(row.cnt);
    }

    let setStatus = 'pending';
    if (statuses['running'] > 0) setStatus = 'running';
    else if (statuses['failed'] > 0 && !statuses['pending'] && !statuses['running']) setStatus = 'partial';
    else if (statuses['completed'] > 0 && !statuses['pending'] && !statuses['running'] && !statuses['failed']) setStatus = 'completed';
    else if (statuses['completed'] > 0) setStatus = 'partial';

    await pool.query(`UPDATE workflow_sets SET status = $2 WHERE id = $1`, [setId, setStatus]);
  }
}
