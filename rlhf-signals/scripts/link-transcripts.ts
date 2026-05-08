import { logger } from '../src/lib/logger';
import { closePool } from '../src/lib/db';
import { linkTranscriptsToPRs } from '../src/attribution/transcript-pr-linker';

async function main() {
  logger.info('Linking Claude Code transcripts to GitHub PRs...');
  await linkTranscriptsToPRs();
  await closePool();
}

main().catch(err => {
  logger.error('Linking failed', { error: err.message });
  process.exit(1);
});
