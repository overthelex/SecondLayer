import { logger } from '../src/lib/logger';
import { closePool } from '../src/lib/db';

async function main() {
  logger.info('Starting outcome attribution...');

  const { attributeGitHubOutcomes } = await import('../src/attribution/github-outcomes');
  await attributeGitHubOutcomes();

  const { attributePlaneOutcomes } = await import('../src/attribution/plane-outcomes');
  await attributePlaneOutcomes();

  await closePool();
  logger.info('Outcome attribution complete');
}

main().catch(err => {
  logger.error('Attribution failed', { error: err.message });
  process.exit(1);
});
