import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';
import { query, closePool } from '../lib/db';
import { logger } from '../lib/logger';
import { classifyWindow, countResearchSwitches } from './window-classifier';
import type {
  EditWithTimestamps, ActivityScoreRow, WindowSessionRow,
  ProcessFeatures, EngagementRow, LinkerOptions, WindowCategory,
} from './types';

const BUCKET_SECONDS = 30;
const WINDOW_PADDING_MS = 30_000;

function parseArgs(): LinkerOptions {
  const args = process.argv.slice(2);
  return {
    batchSize: parseInt(args.find((a) => a.startsWith('--batch-size='))?.split('=')[1] ?? '500', 10),
    dryRun: args.includes('--dry-run'),
    exportJsonl: args.includes('--export-jsonl'),
  };
}

function createXsistantPool(): Pool {
  const url = process.env.XSISTANT_DATABASE_URL;
  if (!url) {
    throw new Error('XSISTANT_DATABASE_URL not set. Add it to .env (e.g. postgres://aisisstant:aisisstant_dev@localhost:5438/aisisstant)');
  }
  return new Pool({ connectionString: url });
}

async function fetchEditsInOverlap(): Promise<EditWithTimestamps[]> {
  const result = await query<EditWithTimestamps>(`
    SELECT we.edit_id, we.session_id, we.from_artifact_id, we.to_artifact_id,
           we.edit_distance_norm, we.semantic_change_class, we.edit_seconds,
           fa.timestamp AS t_from, ta.timestamp AS t_to,
           fa.token_count AS token_count_from, ta.token_count AS token_count_to
    FROM workflow_edits we
    JOIN workflow_artifacts fa ON we.from_artifact_id = fa.artifact_id
    JOIN workflow_artifacts ta ON we.to_artifact_id = ta.artifact_id
    WHERE fa.timestamp >= '2026-04-17T00:00:00Z'
      AND ta.timestamp <= '2026-05-09T00:00:00Z'
      AND fa.timestamp IS NOT NULL
      AND ta.timestamp IS NOT NULL
    ORDER BY fa.timestamp
  `);
  return result.rows;
}

async function fetchActivityScores(pool: Pool, start: Date, end: Date): Promise<ActivityScoreRow[]> {
  const result = await pool.query<ActivityScoreRow>(
    `SELECT id, window_start, window_end, wm_class, score_label,
            key_presses, mouse_distance, clicks, scroll, mic_active, window_title
     FROM activity_scores
     WHERE window_start >= $1 AND window_start <= $2
     ORDER BY window_start`,
    [start, end]
  );
  return result.rows;
}

async function fetchWindowSessions(pool: Pool, start: Date, end: Date): Promise<WindowSessionRow[]> {
  const result = await pool.query<WindowSessionRow>(
    `SELECT id, started_at, ended_at, wm_class, window_title, pid
     FROM window_sessions
     WHERE started_at <= $2 AND (ended_at >= $1 OR ended_at IS NULL)
     ORDER BY started_at`,
    [start, end]
  );
  return result.rows;
}

function binarySearchStart(rows: ActivityScoreRow[], targetMs: number): number {
  let lo = 0, hi = rows.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (new Date(rows[mid].window_start).getTime() < targetMs) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function computeProcessFeatures(
  actRows: ActivityScoreRow[],
  winSessions: WindowSessionRow[],
  tFrom: Date,
  tTo: Date,
): ProcessFeatures {
  const qStart = new Date(tFrom.getTime() - WINDOW_PADDING_MS);
  const qEnd = new Date(tTo.getTime() + WINDOW_PADDING_MS);

  const startIdx = binarySearchStart(actRows, qStart.getTime());
  const matched: ActivityScoreRow[] = [];
  for (let i = startIdx; i < actRows.length; i++) {
    const ws = new Date(actRows[i].window_start).getTime();
    if (ws > qEnd.getTime()) break;
    matched.push(actRows[i]);
  }

  let active = 0, passive = 0, idle = 0;
  let keyPresses = 0, mouseDist = 0, clicks = 0;
  let voiceCtx = false;
  const appTimes = new Map<string, number>();

  for (const r of matched) {
    const label = r.score_label;
    if (label === 'active') active++;
    else if (label === 'passive') passive++;
    else idle++;
    keyPresses += r.key_presses || 0;
    mouseDist += r.mouse_distance || 0;
    clicks += r.clicks || 0;
    if (r.mic_active) voiceCtx = true;
    appTimes.set(r.wm_class, (appTimes.get(r.wm_class) || 0) + BUCKET_SECONDS);
  }

  let idleGapCount = 0, idleGapTotal = 0, currentGap = 0;
  for (const r of matched) {
    if (r.score_label === 'idle') {
      currentGap++;
    } else {
      if (currentGap >= 2) {
        idleGapCount++;
        idleGapTotal += currentGap * BUCKET_SECONDS;
      }
      currentGap = 0;
    }
  }
  if (currentGap >= 2) {
    idleGapCount++;
    idleGapTotal += currentGap * BUCKET_SECONDS;
  }

  const totalTime = [...appTimes.values()].reduce((s, v) => s + v, 0) || 1;
  let entropy = 0;
  for (const t of appTimes.values()) {
    const p = t / totalTime;
    if (p > 0) entropy -= p * Math.log2(p);
  }

  const qStartMs = qStart.getTime();
  const qEndMs = qEnd.getTime();
  const catSeconds: Record<WindowCategory, number> = {
    code_editing: 0, research: 0, communication: 0, documentation: 0, unrelated: 0,
  };
  for (const ws of winSessions) {
    const wsStart = new Date(ws.started_at).getTime();
    const wsEnd = ws.ended_at ? new Date(ws.ended_at).getTime() : qEndMs;
    const overlapStart = Math.max(wsStart, qStartMs);
    const overlapEnd = Math.min(wsEnd, qEndMs);
    if (overlapEnd > overlapStart) {
      const cat = classifyWindow(ws.wm_class, ws.window_title);
      catSeconds[cat] += (overlapEnd - overlapStart) / 1000;
    }
  }

  return {
    active_seconds: active * BUCKET_SECONDS,
    passive_seconds: passive * BUCKET_SECONDS,
    idle_seconds: idle * BUCKET_SECONDS,
    total_key_presses: keyPresses,
    total_mouse_distance: mouseDist,
    total_clicks: clicks,
    idle_gap_count: idleGapCount,
    idle_gap_total_seconds: idleGapTotal,
    apps_touched: appTimes.size,
    research_switches: countResearchSwitches(matched),
    voice_context: voiceCtx,
    window_dwell_entropy: Math.round(entropy * 1e6) / 1e6,
    window_category_seconds: catSeconds,
  };
}

async function batchUpsert(rows: EngagementRow[], batchSize: number): Promise<number> {
  let total = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const values: unknown[] = [];
    const placeholders: string[] = [];
    let idx = 1;
    for (const r of batch) {
      placeholders.push(`($${idx++},$${idx++},$${idx++},$${idx++},$${idx++},$${idx++},$${idx++},$${idx++},$${idx++},$${idx++},$${idx++},$${idx++},$${idx++},$${idx++},$${idx++},$${idx++},$${idx++},$${idx++},$${idx++},$${idx++},$${idx++},$${idx++})`);
      values.push(
        r.edit_id, r.session_id, r.t_from, r.t_to,
        r.query_window_start, r.query_window_end,
        r.active_seconds, r.passive_seconds, r.idle_seconds,
        r.total_key_presses, r.total_mouse_distance, r.total_clicks,
        r.idle_gap_count, r.idle_gap_total_seconds,
        r.apps_touched, r.research_switches, r.voice_context,
        r.window_dwell_entropy, JSON.stringify(r.window_category_seconds),
        r.process_data_available, r.xsistant_rows_matched,
        JSON.stringify({}),
      );
    }
    await query(
      `INSERT INTO workflow_edit_engagement
        (edit_id, session_id, t_from, t_to, query_window_start, query_window_end,
         active_seconds, passive_seconds, idle_seconds,
         total_key_presses, total_mouse_distance, total_clicks,
         idle_gap_count, idle_gap_total_seconds,
         apps_touched, research_switches, voice_context,
         window_dwell_entropy, window_category_seconds,
         process_data_available, xsistant_rows_matched, metadata)
       VALUES ${placeholders.join(',')}
       ON CONFLICT (edit_id) DO UPDATE SET
         active_seconds = EXCLUDED.active_seconds,
         passive_seconds = EXCLUDED.passive_seconds,
         idle_seconds = EXCLUDED.idle_seconds,
         total_key_presses = EXCLUDED.total_key_presses,
         total_mouse_distance = EXCLUDED.total_mouse_distance,
         total_clicks = EXCLUDED.total_clicks,
         idle_gap_count = EXCLUDED.idle_gap_count,
         idle_gap_total_seconds = EXCLUDED.idle_gap_total_seconds,
         apps_touched = EXCLUDED.apps_touched,
         research_switches = EXCLUDED.research_switches,
         voice_context = EXCLUDED.voice_context,
         window_dwell_entropy = EXCLUDED.window_dwell_entropy,
         window_category_seconds = EXCLUDED.window_category_seconds,
         process_data_available = EXCLUDED.process_data_available,
         xsistant_rows_matched = EXCLUDED.xsistant_rows_matched,
         linked_at = now()`,
      values,
    );
    total += batch.length;
  }
  return total;
}

async function main() {
  const opts = parseArgs();
  logger.info('Experiment 2: cross-source linking', opts);

  const xPool = createXsistantPool();

  try {
    const edits = await fetchEditsInOverlap();
    logger.info(`Fetched ${edits.length} edits in overlap window`);

    if (edits.length === 0) {
      logger.warn('No edits found in overlap window');
      return;
    }

    const globalStart = new Date(Math.min(...edits.map((e) => new Date(e.t_from).getTime())) - WINDOW_PADDING_MS);
    const globalEnd = new Date(Math.max(...edits.map((e) => new Date(e.t_to).getTime())) + WINDOW_PADDING_MS);
    logger.info(`Global query range: ${globalStart.toISOString()} to ${globalEnd.toISOString()}`);

    const activityRows = await fetchActivityScores(xPool, globalStart, globalEnd);
    logger.info(`Fetched ${activityRows.length} activity_scores from xsistant`);

    const windowSessions = await fetchWindowSessions(xPool, globalStart, globalEnd);
    logger.info(`Fetched ${windowSessions.length} window_sessions from xsistant`);

    const engagementRows: EngagementRow[] = [];
    let withProcess = 0, withoutProcess = 0;

    for (const edit of edits) {
      const tFrom = new Date(edit.t_from);
      const tTo = new Date(edit.t_to);
      const qStart = new Date(tFrom.getTime() - WINDOW_PADDING_MS);
      const qEnd = new Date(tTo.getTime() + WINDOW_PADDING_MS);

      const features = computeProcessFeatures(activityRows, windowSessions, tFrom, tTo);
      const hasData = features.active_seconds > 0 || features.passive_seconds > 0 || features.total_key_presses > 0;

      if (hasData) withProcess++;
      else withoutProcess++;

      engagementRows.push({
        ...features,
        edit_id: edit.edit_id,
        session_id: edit.session_id,
        t_from: tFrom,
        t_to: tTo,
        query_window_start: qStart,
        query_window_end: qEnd,
        process_data_available: hasData,
        xsistant_rows_matched: features.active_seconds / BUCKET_SECONDS + features.passive_seconds / BUCKET_SECONDS + features.idle_seconds / BUCKET_SECONDS,
      });
    }

    logger.info(`Process data: ${withProcess} with, ${withoutProcess} without (${(withProcess / edits.length * 100).toFixed(1)}% coverage)`);

    if (!opts.dryRun) {
      const inserted = await batchUpsert(engagementRows, opts.batchSize);
      logger.info(`Upserted ${inserted} engagement rows`);
    } else {
      logger.info(`Dry run — would upsert ${engagementRows.length} rows`);
    }

    if (opts.exportJsonl) {
      const outDir = path.resolve('output/experiment2');
      fs.mkdirSync(outDir, { recursive: true });
      const outPath = path.join(outDir, 'edit_engagement.jsonl');
      const stream = fs.createWriteStream(outPath);
      for (const r of engagementRows) stream.write(JSON.stringify(r) + '\n');
      stream.end();
      logger.info(`Exported ${engagementRows.length} rows to ${outPath}`);
    }

    const withData = engagementRows.filter((r) => r.process_data_available);
    if (withData.length > 0) {
      const avg = (arr: number[]) => arr.reduce((s, v) => s + v, 0) / arr.length;
      logger.info('Process feature summary (available edits only):', {
        count: withData.length,
        avg_active_seconds: avg(withData.map((r) => r.active_seconds)).toFixed(1),
        avg_key_presses: avg(withData.map((r) => r.total_key_presses)).toFixed(1),
        avg_idle_gap_count: avg(withData.map((r) => r.idle_gap_count)).toFixed(2),
        avg_apps_touched: avg(withData.map((r) => r.apps_touched)).toFixed(2),
        pct_voice_context: (withData.filter((r) => r.voice_context).length / withData.length * 100).toFixed(1) + '%',
        avg_entropy: avg(withData.map((r) => r.window_dwell_entropy)).toFixed(4),
      });
    }

  } finally {
    await xPool.end();
    await closePool();
    logger.info('Done');
  }
}

main().catch((err) => {
  logger.error('Fatal error', { error: err.message, stack: err.stack });
  process.exit(1);
});
