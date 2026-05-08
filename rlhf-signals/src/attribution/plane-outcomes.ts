import { config } from '../lib/config';
import { logger } from '../lib/logger';
import { query as dbQuery } from '../lib/db';
import { insertOutcome } from '../schema/queries';

interface PlaneSessionRow {
  session_id: string;
  external_ref: string;
  terminal_at: string | null;
  terminal_action: string | null;
  metadata: { state_group?: string } & Record<string, unknown>;
  [key: string]: unknown;
}

export async function attributePlaneOutcomes(): Promise<void> {
  if (!config.planeApiKey) {
    logger.error('PLANE_API_KEY required for Plane attribution');
    return;
  }

  const sessions = await dbQuery<PlaneSessionRow>(`
    SELECT session_id, external_ref, terminal_at, terminal_action, metadata
    FROM workflow_sessions
    WHERE source = 'plane_issue'
    AND NOT EXISTS (SELECT 1 FROM workflow_outcomes WHERE session_id = workflow_sessions.session_id)
  `);

  let attributed = 0;

  for (const session of sessions.rows) {
    const stateGroup = session.metadata?.state_group;
    const terminalAt = session.terminal_at ? new Date(session.terminal_at) : new Date();
    const daysSince = Math.floor((Date.now() - terminalAt.getTime()) / (1000 * 60 * 60 * 24));

    let outcomeType: string | null = null;
    let confidence: 'strong' | 'medium' | 'weak' = 'medium';

    switch (stateGroup) {
      case 'completed':
        outcomeType = 'issue_resolved';
        confidence = 'strong';
        break;
      case 'cancelled':
        outcomeType = 'closed_obsolete';
        confidence = 'strong';
        break;
      default:
        if (daysSince > 60) {
          outcomeType = 'closed_obsolete';
          confidence = 'weak';
        }
        break;
    }

    if (outcomeType) {
      await insertOutcome({
        session_id: session.session_id,
        outcome_type: outcomeType as any,
        outcome_value: null,
        observed_at: new Date(),
        attribution_window_days: daysSince,
        attribution_confidence: confidence,
        source: 'plane',
        metadata: { state_group: stateGroup },
      });
      attributed++;
    }
  }

  logger.info(`Plane attribution complete: ${attributed} outcomes recorded`);
}
