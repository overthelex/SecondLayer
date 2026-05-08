import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { query, closePool } from '../lib/db';
import { logger } from '../lib/logger';
import { detectPII } from '../redaction/pii-detector';
import type { CrowdSample, CrowdPlatformRow, PopulationRow } from './types';

const TASK_INSTRUCTION =
  'Edit this output to improve it for use in a professional legal context. ' +
  'Make any changes you think are necessary — from minor fixes to complete rewrites.';

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag: string, def: string) => {
    const idx = args.findIndex((a) => a.startsWith(`--${flag}=`));
    return idx >= 0 ? args[idx].split('=')[1] : def;
  };
  return {
    n: parseInt(get('n', '200'), 10),
    seed: get('seed', 'experiment1-phase-a'),
    outputDir: get('output', 'output/experiment1'),
    minPerClass: parseInt(get('min-per-class', '10'), 10),
  };
}

function mulberry32(seed: number): () => number {
  let t = seed;
  return () => {
    t = (t + 0x6d2b79f5) | 0;
    let v = Math.imul(t ^ (t >>> 15), t | 1);
    v ^= v + Math.imul(v ^ (v >>> 7), v | 61);
    return ((v ^ (v >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFromString(s: string): number {
  const hash = crypto.createHash('sha256').update(s).digest();
  return hash.readUInt32BE(0);
}

function deterministicUUID(seed: string, index: number): string {
  const hash = crypto.createHash('sha256').update(`${seed}:${index}`).digest('hex');
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    '4' + hash.slice(13, 16),
    ((parseInt(hash.slice(16, 17), 16) & 0x3) | 0x8).toString(16) + hash.slice(17, 20),
    hash.slice(20, 32),
  ].join('-');
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function fetchPopulation(): Promise<PopulationRow[]> {
  const result = await query<PopulationRow>(`
    SELECT
      wa.artifact_id,
      wa.session_id,
      COALESCE(wa.content_redacted, wa.content_raw) AS llm_content,
      COALESCE(ta.content_redacted, ta.content_raw) AS edit_content,
      we.edit_id,
      we.edit_distance_norm,
      we.semantic_change_class,
      ws.source AS session_source
    FROM workflow_artifacts wa
    JOIN workflow_edits we ON we.from_artifact_id = wa.artifact_id
    JOIN workflow_artifacts ta ON ta.artifact_id = we.to_artifact_id
    JOIN workflow_sessions ws ON ws.session_id = wa.session_id
    WHERE wa.role = 'llm_output'
      AND we.semantic_change_class IS NOT NULL
      AND (wa.content_redacted IS NOT NULL OR wa.content_raw IS NOT NULL)
      AND (ta.content_redacted IS NOT NULL OR ta.content_raw IS NOT NULL)
  `);
  return result.rows;
}

function allocateStrata(
  classCounts: Map<string, number>,
  n: number,
  minPerClass: number
): Map<string, number> {
  const classes = [...classCounts.keys()];
  const total = [...classCounts.values()].reduce((s, c) => s + c, 0);
  const allocation = new Map<string, number>();

  let reserved = 0;
  const needsFloor: string[] = [];
  for (const cls of classes) {
    const proportional = Math.round((classCounts.get(cls)! / total) * n);
    if (proportional < minPerClass) {
      const available = classCounts.get(cls)!;
      const actual = Math.min(minPerClass, available);
      allocation.set(cls, actual);
      reserved += actual;
      needsFloor.push(cls);
    }
  }

  const remaining = n - reserved;
  const unfloored = classes.filter((c) => !needsFloor.includes(c));
  const unflooredTotal = unfloored.reduce((s, c) => s + classCounts.get(c)!, 0);

  let allocated = 0;
  for (let i = 0; i < unfloored.length; i++) {
    const cls = unfloored[i];
    const available = classCounts.get(cls)!;
    if (i === unfloored.length - 1) {
      allocation.set(cls, Math.min(remaining - allocated, available));
    } else {
      const share = Math.round((classCounts.get(cls)! / unflooredTotal) * remaining);
      const actual = Math.min(share, available);
      allocation.set(cls, actual);
      allocated += actual;
    }
  }

  return allocation;
}

function filterPII(rows: PopulationRow[]): PopulationRow[] {
  return rows.filter((row) => {
    const llmPII = detectPII(row.llm_content);
    const editPII = detectPII(row.edit_content);
    if (llmPII.length > 0 || editPII.length > 0) {
      logger.debug('Filtered sample with PII', {
        artifact_id: row.artifact_id,
        llm_pii: llmPII.length,
        edit_pii: editPII.length,
      });
      return false;
    }
    return true;
  });
}

async function main() {
  const opts = parseArgs();
  logger.info('Experiment 1: sampling for crowd annotation', opts);

  const population = await fetchPopulation();
  logger.info(`Population size: ${population.length} eligible LLM output → edit pairs`);

  const clean = filterPII(population);
  logger.info(`After PII filter: ${clean.length} (removed ${population.length - clean.length})`);

  const byClass = new Map<string, PopulationRow[]>();
  for (const row of clean) {
    const cls = row.semantic_change_class;
    if (!byClass.has(cls)) byClass.set(cls, []);
    byClass.get(cls)!.push(row);
  }

  const classCounts = new Map<string, number>();
  for (const [cls, rows] of byClass) classCounts.set(cls, rows.length);

  logger.info('Population by class:', Object.fromEntries(classCounts));

  const allocation = allocateStrata(classCounts, opts.n, opts.minPerClass);
  const totalAllocated = [...allocation.values()].reduce((s, v) => s + v, 0);
  logger.info('Allocation:', Object.fromEntries(allocation));
  logger.info(`Total allocated: ${totalAllocated}`);

  const rng = mulberry32(seedFromString(opts.seed));
  const samples: CrowdSample[] = [];
  let sampleIndex = 0;

  for (const [cls, count] of allocation) {
    const pool = byClass.get(cls) || [];
    if (pool.length < count) {
      logger.warn(`Class '${cls}' has only ${pool.length} samples, requested ${count}`);
    }
    const shuffled = shuffle(pool, rng);
    const selected = shuffled.slice(0, count);

    for (const row of selected) {
      samples.push({
        sample_id: deterministicUUID(opts.seed, sampleIndex++),
        llm_output: row.llm_content,
        founder_edit: row.edit_content,
        task_instruction: TASK_INSTRUCTION,
        metadata: {
          session_source: row.session_source,
          edit_class: row.semantic_change_class,
          edit_distance_norm: row.edit_distance_norm,
          artifact_id: row.artifact_id,
          edit_id: row.edit_id,
          session_id: row.session_id,
        },
      });
    }
  }

  const outDir = path.resolve(opts.outputDir);
  fs.mkdirSync(outDir, { recursive: true });

  const fullPath = path.join(outDir, 'crowd-samples.jsonl');
  const fullStream = fs.createWriteStream(fullPath);
  for (const s of samples) fullStream.write(JSON.stringify(s) + '\n');
  fullStream.end();
  logger.info(`Wrote ${samples.length} full samples to ${fullPath}`);

  const platformPath = path.join(outDir, 'crowd-platform.jsonl');
  const platformStream = fs.createWriteStream(platformPath);
  for (const s of samples) {
    const row: CrowdPlatformRow = {
      sample_id: s.sample_id,
      llm_output: s.llm_output,
      task_instruction: s.task_instruction,
    };
    platformStream.write(JSON.stringify(row) + '\n');
  }
  platformStream.end();
  logger.info(`Wrote ${samples.length} platform rows to ${platformPath}`);

  const classSummary: Record<string, number> = {};
  for (const s of samples) {
    classSummary[s.metadata.edit_class] = (classSummary[s.metadata.edit_class] || 0) + 1;
  }
  logger.info('Final sample distribution:', classSummary);

  await closePool();
  logger.info('Done');
}

main().catch((err) => {
  logger.error('Fatal error', { error: err.message, stack: err.stack });
  closePool().then(() => process.exit(1));
});
