import { query, closePool } from '../lib/db';
import { logger } from '../lib/logger';
import { redactText } from './pii-detector';

async function main() {
  const deleteRaw = process.argv.includes('--delete-raw-after-redact');

  logger.info('Starting content redaction...');

  const artifacts = await query(`
    SELECT artifact_id, content_raw
    FROM workflow_artifacts
    WHERE content_raw IS NOT NULL AND content_redacted IS NULL
  `);

  let redacted = 0;

  for (const row of artifacts.rows) {
    const content = row.content_raw as string;
    const redactedContent = redactText(content);

    if (deleteRaw) {
      await query(
        'UPDATE workflow_artifacts SET content_redacted = $1, content_raw = NULL WHERE artifact_id = $2',
        [redactedContent, row.artifact_id]
      );
    } else {
      await query(
        'UPDATE workflow_artifacts SET content_redacted = $1 WHERE artifact_id = $2',
        [redactedContent, row.artifact_id]
      );
    }

    redacted++;
  }

  logger.info(`Redaction complete: ${redacted} artifacts processed${deleteRaw ? ' (raw content deleted)' : ''}`);
  await closePool();
}

main().catch(err => {
  logger.error('Redaction failed', { error: err.message });
  process.exit(1);
});
