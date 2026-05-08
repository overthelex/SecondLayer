import { logger } from '../src/lib/logger';
import { closePool } from '../src/lib/db';
import { classifyEdits } from '../src/retro/edit-classifier';

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const limitArg = process.argv.find(a => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : undefined;

  logger.info(`Edit classification starting (dryRun=${dryRun}, limit=${limit ?? 'none'})`);
  await classifyEdits({ dryRun, limit });
  await closePool();
}

main().catch(err => {
  logger.error('Edit classification failed', { error: err.message });
  process.exit(1);
});
