import { z } from 'zod';

export const SessionSource = z.enum([
  'github_pr',
  'plane_issue',
  'claude_code_transcript',
  'mcp_call',
  'email_thread',
  'linkedin_draft',
  'manual',
]);
export type SessionSource = z.infer<typeof SessionSource>;

export const CaptureMode = z.enum(['retro', 'live']);
export type CaptureMode = z.infer<typeof CaptureMode>;

export const ConsentStatus = z.enum(['pending', 'granted', 'revoked']);
export type ConsentStatus = z.infer<typeof ConsentStatus>;

export const ArtifactRole = z.enum(['prompt', 'llm_output', 'edit', 'final']);
export type ArtifactRole = z.infer<typeof ArtifactRole>;

export const SemanticChangeClass = z.enum([
  'cosmetic',
  'reorganization',
  'factual_correction',
  'tone_adjustment',
  'substantive_rewrite',
  'rejection',
]);
export type SemanticChangeClass = z.infer<typeof SemanticChangeClass>;

export const AttributionConfidence = z.enum(['strong', 'medium', 'weak']);
export type AttributionConfidence = z.infer<typeof AttributionConfidence>;

export const OutcomeType = z.enum([
  'merged_clean',
  'merged_then_reverted',
  'closed_unmerged',
  'followup_fix_pr',
  'still_running_after_30d',
  'issue_resolved',
  'issue_reopened',
  'closed_obsolete',
  'response_received',
  'meeting_booked',
  'partnership_formed',
  'engagement_above_baseline',
  'engagement_below_baseline',
  'content_referenced_externally',
]);
export type OutcomeType = z.infer<typeof OutcomeType>;
