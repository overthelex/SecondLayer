/**
 * OpenData Sync Service
 *
 * Lightweight cron scheduler that triggers data imports from Ukrainian
 * government open data sources at configured frequencies.
 *
 * Architecture:
 * - Backend data sources (MVS, NAZK, UIPV): triggers via backend /api/tools/start_import
 * - NAIS registries (11 sources): triggers via openreyestr /api/admin/sync-registry
 *
 * Runs as a Docker container alongside the main services.
 * Does NOT download data itself — delegates to existing import infrastructure.
 */

import cron from 'node-cron';
import http from 'http';
import { ALL_SOURCES, loadConfig, type DataSourceSchedule } from './config.js';
import { runSync, runAllOnce, getSyncHistory, getLastSync } from './sync-runner.js';

const config = loadConfig();
const scheduledJobs: cron.ScheduledTask[] = [];

// ─── Health endpoint ───────────────────────────────────────────────

function startHealthServer(): void {
  const server = http.createServer((req, res) => {
    if (req.url === '/health' || req.url === '/health/ready') {
      const history = getSyncHistory();
      const recentFails = history.slice(-20).filter((h) => !h.success).length;

      const body = JSON.stringify({
        status: 'ok',
        service: 'opendata-sync',
        uptime: process.uptime(),
        scheduledSources: ALL_SOURCES.filter((s) => s.enabled).length,
        totalSyncsRun: history.length,
        recentFailures: recentFails,
        lastSync: history[history.length - 1] || null,
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(body);
      return;
    }

    if (req.url === '/status') {
      const enabledSources = ALL_SOURCES.filter((s) => s.enabled);
      const sourceStatus = enabledSources.map((s) => {
        const last = getLastSync(s.name);
        return {
          name: s.name,
          title: s.title,
          cron: s.cron,
          target: s.target,
          lastRun: last
            ? {
                success: last.success,
                message: last.message,
                durationMs: last.durationMs,
                at: last.startedAt,
              }
            : null,
        };
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ sources: sourceStatus }, null, 2));
      return;
    }

    if (req.url === '/history') {
      const history = getSyncHistory().slice(-100);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(history, null, 2));
      return;
    }

    res.writeHead(404);
    res.end('Not Found');
  });

  server.listen(config.healthPort, '0.0.0.0', () => {
    console.log(`[HEALTH] Сервер здоров'я запущено на порті ${config.healthPort}`);
  });
}

// ─── Schedule all sources ──────────────────────────────────────────

function scheduleAll(): void {
  const enabled = ALL_SOURCES.filter((s) => s.enabled);
  console.log(`\n[SCHEDULER] Планування ${enabled.length} джерел даних:`);

  for (const source of enabled) {
    if (!cron.validate(source.cron)) {
      console.error(`[SCHEDULER] Невалідний cron: ${source.cron} для ${source.name}`);
      continue;
    }

    const job = cron.schedule(
      source.cron,
      async () => {
        try {
          await runSync(config, source);
        } catch (error: any) {
          console.error(`[SCHEDULER] Необроблена помилка для ${source.name}: ${error.message}`);
        }
      },
      { timezone: config.timezone },
    );

    scheduledJobs.push(job);
    console.log(`  ${source.cron.padEnd(15)} ${source.title} → ${source.target}`);
  }

  console.log('');
}

// ─── Main ──────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  OpenData Sync Service v1.0');
  console.log('  Автоматичне оновлення державних реєстрів');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  Backend:      ${config.backendUrl}`);
  console.log(`  OpenReyestr:  ${config.openreyestrUrl}`);
  console.log(`  Health port:  ${config.healthPort}`);
  console.log(`  Timezone:     ${config.timezone}`);
  console.log(`  Джерел:       ${ALL_SOURCES.filter((s) => s.enabled).length} активних`);

  // --run-once mode: trigger all sources immediately and exit
  if (process.argv.includes('--run-once')) {
    console.log('\n[MODE] Разовий запуск (--run-once)');
    const results = await runAllOnce(config, ALL_SOURCES);
    const ok = results.filter((r) => r.success).length;
    const fail = results.filter((r) => !r.success).length;
    console.log(`\n[DONE] Завершено: ${ok} успішних, ${fail} невдалих`);
    process.exit(fail > 0 ? 1 : 0);
  }

  // Normal mode: schedule + health endpoint
  startHealthServer();
  scheduleAll();

  console.log('[SCHEDULER] Сервіс запущено. Очікування за розкладом...\n');
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[SHUTDOWN] Отримано SIGTERM, зупинка...');
  for (const job of scheduledJobs) job.stop();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('[SHUTDOWN] Отримано SIGINT, зупинка...');
  for (const job of scheduledJobs) job.stop();
  process.exit(0);
});

main().catch((error) => {
  console.error('[FATAL]', error);
  process.exit(1);
});
