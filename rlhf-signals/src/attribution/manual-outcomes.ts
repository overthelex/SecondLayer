import { logger } from '../lib/logger';
import { closePool } from '../lib/db';
import { insertOutcome } from '../schema/queries';
import type { OutcomeType, AttributionConfidence } from '../schema/enums';

async function main() {
  const args = process.argv.slice(2);
  const getArg = (name: string): string | undefined => {
    const idx = args.indexOf(`--${name}`);
    return idx >= 0 ? args[idx + 1] : undefined;
  };

  const sessionId = getArg('session-id');
  const outcomeType = getArg('type') as OutcomeType | undefined;
  const confidence = (getArg('confidence') || 'medium') as AttributionConfidence;
  const observedAt = getArg('observed-at') || new Date().toISOString();
  const value = getArg('value');

  if (!sessionId || !outcomeType) {
    console.error('Usage: pnpm rlhf:outcome --session-id <uuid> --type <outcome_type> [--confidence strong|medium|weak] [--observed-at <date>] [--value <text>]');
    process.exit(1);
  }

  if (!['strong', 'medium', 'weak'].includes(confidence)) {
    console.error('--confidence must be strong, medium, or weak');
    process.exit(1);
  }

  const outcomeId = await insertOutcome({
    session_id: sessionId,
    outcome_type: outcomeType,
    outcome_value: value ?? null,
    observed_at: new Date(observedAt),
    attribution_window_days: 0,
    attribution_confidence: confidence,
    source: 'manual',
    metadata: {},
  });

  logger.info(`Outcome recorded: ${outcomeId}`);
  await closePool();
}

main().catch(err => {
  logger.error('Manual outcome failed', { error: err.message });
  process.exit(1);
});
