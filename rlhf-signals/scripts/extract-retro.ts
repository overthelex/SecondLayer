import { logger } from '../src/lib/logger';
import { closePool } from '../src/lib/db';

const SOURCES = ['github', 'plane', 'claude-code'] as const;

async function main() {
  const sourceArg = process.argv.find(a => a.startsWith('--source='))?.split('=')[1];
  const sources = sourceArg ? [sourceArg] : SOURCES;

  for (const source of sources) {
    logger.info(`Extracting retro signals from: ${source}`);

    switch (source) {
      case 'github': {
        const { extractGitHubPRs } = await import('../src/retro/github-pr');
        await extractGitHubPRs();
        break;
      }
      case 'plane': {
        const { extractPlaneIssues } = await import('../src/retro/plane-issues');
        await extractPlaneIssues();
        break;
      }
      case 'claude-code': {
        const { extractClaudeCodeHistory } = await import('../src/retro/claude-code-history');
        await extractClaudeCodeHistory();
        break;
      }
      default:
        logger.warn(`Unknown source: ${source}`);
    }
  }

  await closePool();
  logger.info('Retro extraction complete');
}

main().catch(err => {
  logger.error('Retro extraction failed', { error: err.message });
  process.exit(1);
});
