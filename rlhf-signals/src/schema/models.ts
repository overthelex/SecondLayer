import { z } from 'zod';
import {
  SessionSource,
  CaptureMode,
  ConsentStatus,
  ArtifactRole,
  SemanticChangeClass,
  AttributionConfidence,
  OutcomeType,
} from './enums';

export const WorkflowSession = z.object({
  session_id: z.string().uuid(),
  source: SessionSource,
  external_ref: z.string().min(1),
  surface_tags: z.array(z.string()).default([]),
  created_at: z.coerce.date(),
  terminal_at: z.coerce.date().nullable().default(null),
  terminal_action: z.string().nullable().default(null),
  thread_position: z.number().int().nullable().default(null),
  capture_mode: CaptureMode,
  consent_status: ConsentStatus.default('pending'),
  metadata: z.record(z.unknown()).default({}),
});
export type WorkflowSession = z.infer<typeof WorkflowSession>;

export const WorkflowSessionInsert = WorkflowSession.omit({ session_id: true });
export type WorkflowSessionInsert = z.infer<typeof WorkflowSessionInsert>;

export const WorkflowArtifact = z.object({
  artifact_id: z.string().uuid(),
  session_id: z.string().uuid(),
  role: ArtifactRole,
  sequence_index: z.number().int(),
  content_raw: z.string().nullable().default(null),
  content_redacted: z.string().nullable().default(null),
  content_hash: z.string(),
  token_count: z.number().int().nullable().default(null),
  timestamp: z.coerce.date(),
  metadata: z.record(z.unknown()).default({}),
});
export type WorkflowArtifact = z.infer<typeof WorkflowArtifact>;

export const WorkflowArtifactInsert = WorkflowArtifact.omit({ artifact_id: true });
export type WorkflowArtifactInsert = z.infer<typeof WorkflowArtifactInsert>;

export const WorkflowEdit = z.object({
  edit_id: z.string().uuid(),
  session_id: z.string().uuid(),
  from_artifact_id: z.string().uuid(),
  to_artifact_id: z.string().uuid(),
  edit_distance: z.number().int(),
  edit_distance_norm: z.number().nullable().default(null),
  semantic_change_class: SemanticChangeClass.nullable().default(null),
  edit_seconds: z.number().int().nullable().default(null),
  inferred_class: z.boolean().default(false),
  metadata: z.record(z.unknown()).default({}),
});
export type WorkflowEdit = z.infer<typeof WorkflowEdit>;

export const WorkflowEditInsert = WorkflowEdit.omit({ edit_id: true });
export type WorkflowEditInsert = z.infer<typeof WorkflowEditInsert>;

export const WorkflowOutcome = z.object({
  outcome_id: z.string().uuid(),
  session_id: z.string().uuid(),
  outcome_type: OutcomeType,
  outcome_value: z.string().nullable().default(null),
  observed_at: z.coerce.date(),
  attribution_window_days: z.number().int(),
  attribution_confidence: AttributionConfidence,
  source: z.string(),
  metadata: z.record(z.unknown()).default({}),
});
export type WorkflowOutcome = z.infer<typeof WorkflowOutcome>;

export const WorkflowOutcomeInsert = WorkflowOutcome.omit({ outcome_id: true });
export type WorkflowOutcomeInsert = z.infer<typeof WorkflowOutcomeInsert>;
