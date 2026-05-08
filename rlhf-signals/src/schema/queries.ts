import crypto from 'crypto';
import { query, withTransaction } from '../lib/db';
import { PoolClient } from 'pg';
import type {
  WorkflowSessionInsert,
  WorkflowArtifactInsert,
  WorkflowEditInsert,
  WorkflowOutcomeInsert,
  WorkflowSession,
  WorkflowArtifact,
  WorkflowEdit,
  WorkflowOutcome,
} from './models';

export function contentHash(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

export async function upsertSession(
  session: WorkflowSessionInsert,
  client?: PoolClient
): Promise<string> {
  const sql = `
    INSERT INTO workflow_sessions
      (source, external_ref, surface_tags, created_at, terminal_at, terminal_action,
       thread_position, capture_mode, consent_status, metadata)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    ON CONFLICT (source, external_ref) DO UPDATE SET
      terminal_at = EXCLUDED.terminal_at,
      terminal_action = EXCLUDED.terminal_action,
      surface_tags = EXCLUDED.surface_tags,
      metadata = EXCLUDED.metadata
    RETURNING session_id
  `;
  const params = [
    session.source,
    session.external_ref,
    session.surface_tags,
    session.created_at,
    session.terminal_at,
    session.terminal_action,
    session.thread_position,
    session.capture_mode,
    session.consent_status,
    JSON.stringify(session.metadata),
  ];
  const result = client
    ? await client.query(sql, params)
    : await query(sql, params);
  return result.rows[0].session_id;
}

export async function upsertArtifact(
  artifact: WorkflowArtifactInsert,
  client?: PoolClient
): Promise<string> {
  const sql = `
    INSERT INTO workflow_artifacts
      (session_id, role, sequence_index, content_raw, content_redacted,
       content_hash, token_count, timestamp, metadata)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    ON CONFLICT (session_id, sequence_index) DO UPDATE SET
      content_raw = EXCLUDED.content_raw,
      content_hash = EXCLUDED.content_hash,
      token_count = EXCLUDED.token_count,
      metadata = EXCLUDED.metadata
    RETURNING artifact_id
  `;
  const params = [
    artifact.session_id,
    artifact.role,
    artifact.sequence_index,
    artifact.content_raw,
    artifact.content_redacted,
    artifact.content_hash,
    artifact.token_count,
    artifact.timestamp,
    JSON.stringify(artifact.metadata),
  ];
  const result = client
    ? await client.query(sql, params)
    : await query(sql, params);
  return result.rows[0].artifact_id;
}

export async function insertEdit(
  edit: WorkflowEditInsert,
  client?: PoolClient
): Promise<string> {
  const sql = `
    INSERT INTO workflow_edits
      (session_id, from_artifact_id, to_artifact_id, edit_distance,
       edit_distance_norm, semantic_change_class, edit_seconds, inferred_class, metadata)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING edit_id
  `;
  const params = [
    edit.session_id,
    edit.from_artifact_id,
    edit.to_artifact_id,
    edit.edit_distance,
    edit.edit_distance_norm,
    edit.semantic_change_class,
    edit.edit_seconds,
    edit.inferred_class,
    JSON.stringify(edit.metadata),
  ];
  const result = client
    ? await client.query(sql, params)
    : await query(sql, params);
  return result.rows[0].edit_id;
}

export async function insertOutcome(
  outcome: WorkflowOutcomeInsert,
  client?: PoolClient
): Promise<string> {
  const sql = `
    INSERT INTO workflow_outcomes
      (session_id, outcome_type, outcome_value, observed_at,
       attribution_window_days, attribution_confidence, source, metadata)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING outcome_id
  `;
  const params = [
    outcome.session_id,
    outcome.outcome_type,
    outcome.outcome_value,
    outcome.observed_at,
    outcome.attribution_window_days,
    outcome.attribution_confidence,
    outcome.source,
    JSON.stringify(outcome.metadata),
  ];
  const result = client
    ? await client.query(sql, params)
    : await query(sql, params);
  return result.rows[0].outcome_id;
}

export async function getSessionByRef(
  source: string,
  externalRef: string
): Promise<WorkflowSession | null> {
  const result = await query(
    'SELECT * FROM workflow_sessions WHERE source = $1 AND external_ref = $2',
    [source, externalRef]
  );
  return result.rows[0] as WorkflowSession | null;
}

export async function getArtifactsBySession(sessionId: string): Promise<WorkflowArtifact[]> {
  const result = await query(
    'SELECT * FROM workflow_artifacts WHERE session_id = $1 ORDER BY sequence_index',
    [sessionId]
  );
  return result.rows as unknown as WorkflowArtifact[];
}

export async function getEditsBySession(sessionId: string): Promise<WorkflowEdit[]> {
  const result = await query(
    'SELECT * FROM workflow_edits WHERE session_id = $1',
    [sessionId]
  );
  return result.rows as unknown as WorkflowEdit[];
}

export async function getOutcomesBySession(sessionId: string): Promise<WorkflowOutcome[]> {
  const result = await query(
    'SELECT * FROM workflow_outcomes WHERE session_id = $1',
    [sessionId]
  );
  return result.rows as unknown as WorkflowOutcome[];
}
