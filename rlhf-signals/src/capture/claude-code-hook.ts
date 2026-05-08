import chokidar from 'chokidar';
import { config } from '../lib/config';
import { logger } from '../lib/logger';

export function startClaudeCodeWatcher(): void {
  const watchDir = config.claudeCodeProjectsDir;
  logger.info(`Watching Claude Code transcripts at: ${watchDir}`);

  const watcher = chokidar.watch(`${watchDir}/**/*.jsonl`, {
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 2000, pollInterval: 100 },
  });

  watcher.on('add', (filePath) => {
    logger.info(`New transcript detected: ${filePath}`);
    // Phase 1 live capture: process new file
    // Implementation deferred — use retro extractor for now
  });

  watcher.on('change', (filePath) => {
    logger.debug(`Transcript updated: ${filePath}`);
    // Phase 1 live capture: process incremental changes
  });

  watcher.on('error', (err) => {
    logger.error('Watcher error', { error: String(err) });
  });
}
