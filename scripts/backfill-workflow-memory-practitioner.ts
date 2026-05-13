#!/usr/bin/env npx tsx
/**
 * Phase 1.2 — Practitioner layer bootstrap: summarize captured prompt-corpus
 * sessions into embeddable practitioner knowledge entries.
 *
 * Reads: ~/.claude/prompt-corpus.git (bare repo from UserPromptSubmit hook)
 * Writes: workflow_memory_practitioner table + wm_practitioner Qdrant collection
 *
 * Usage:
 *   npx tsx scripts/backfill-workflow-memory-practitioner.ts [--dry-run] [--min-prompts N]
 */

import dotenv from 'dotenv';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

dotenv.config({ path: path.join(ROOT, 'mcp_backend', '.env') });
dotenv.config({ path: path.join(ROOT, '.env.local'), override: true });

import { Database } from '../mcp_backend/src/database/database.js';
import { EmbeddingService } from '../mcp_backend/src/services/embedding-service.js';
import { WorkflowMemoryService } from '../mcp_backend/src/services/workflow-memory-service.js';
// Summarization via local backend API (has LLM access inside Docker)

import fs from 'fs';

const DRY_RUN = process.argv.includes('--dry-run');
const MIN_PROMPTS = parseInt(process.argv.find(a => a.startsWith('--min-prompts='))?.split('=')[1] ?? '5');
const CORPUS_FILE = process.argv.find(a => a.startsWith('--corpus-file='))?.split('=')[1];

const CORPUS_DIR = path.join(process.env.HOME ?? '/home/vovkes', '.claude', 'prompt-corpus.git');

interface PromptRecord {
  timestamp: string;
  prompt: string;
  prompt_length: number;
  session_id: string;
  repo: string;
  branch: string;
  cwd: string;
  permission_mode: string;
}

interface SessionGroup {
  sessionId: string;
  prompts: PromptRecord[];
  branches: Set<string>;
  repos: Set<string>;
  firstTs: string;
  lastTs: string;
  totalChars: number;
}

// ── Extract prompts from git corpus ─────────────────────────

function extractPrompts(): PromptRecord[] {
  if (CORPUS_FILE) {
    try {
      return JSON.parse(fs.readFileSync(CORPUS_FILE, 'utf-8'));
    } catch (err: any) {
      console.warn(`⚠ Failed to read corpus file ${CORPUS_FILE}: ${err.message}`);
      return [];
    }
  }
  const hashes = execSync(`git -C "${CORPUS_DIR}" log corpus --format=%H`, { encoding: 'utf-8' })
    .trim().split('\n').filter(Boolean);

  const records: PromptRecord[] = [];
  for (const hash of hashes) {
    try {
      const json = execSync(`git -C "${CORPUS_DIR}" show ${hash}:prompt.json`, { encoding: 'utf-8' });
      records.push(JSON.parse(json));
    } catch { /* skip corrupted entries */ }
  }
  return records;
}

// ── Group prompts by session ────────────────────────────────

function groupBySessions(prompts: PromptRecord[]): SessionGroup[] {
  const map = new Map<string, SessionGroup>();

  for (const p of prompts) {
    let group = map.get(p.session_id);
    if (!group) {
      group = {
        sessionId: p.session_id,
        prompts: [],
        branches: new Set(),
        repos: new Set(),
        firstTs: p.timestamp,
        lastTs: p.timestamp,
        totalChars: 0,
      };
      map.set(p.session_id, group);
    }
    group.prompts.push(p);
    group.branches.add(p.branch);
    group.repos.add(p.repo);
    group.totalChars += p.prompt_length;
    if (p.timestamp < group.firstTs) group.firstTs = p.timestamp;
    if (p.timestamp > group.lastTs) group.lastTs = p.timestamp;
  }

  return [...map.values()]
    .filter(g => g.prompts.length >= MIN_PROMPTS)
    .sort((a, b) => b.prompts.length - a.prompts.length);
}

// ── Summarize session via LLM ───────────────────────────────

function buildSessionSummary(group: SessionGroup): { title: string; body: string; tags: string[] } {
  const sorted = group.prompts.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const branches = [...group.branches].filter(b => b !== 'main');
  const branchStr = branches.length > 0 ? branches.join(', ') : 'main';

  // Infer what happened from branch names and prompts
  const allText = sorted.map(p => p.prompt).join(' ').toLowerCase();
  const title = branches.length > 0
    ? `Session: ${branchStr.slice(0, 70)}`
    : `Session ${group.firstTs.slice(0, 10)}: ${sorted[0].prompt.slice(0, 60)}`;

  const promptSample = sorted
    .filter(p => p.prompt_length > 10)
    .slice(0, 15)
    .map(p => `- ${p.prompt.slice(0, 120)}`)
    .join('\n');

  const body = `${group.prompts.length} prompts over ${group.firstTs.slice(0, 16)} to ${group.lastTs.slice(0, 16)}.\n` +
    `Repos: ${[...group.repos].join(', ')}. Branches: ${[...group.branches].join(', ')}.\n` +
    `Total input: ${group.totalChars} chars.\n\nKey prompts:\n${promptSample}`;

  const tags = inferBranchTags(group.branches);
  if (allText.includes('deploy')) tags.push('deployment');
  if (allText.includes('test')) tags.push('testing');
  if (allText.includes('fix')) tags.push('bug-fix');
  if (allText.includes('docker') || allText.includes('container')) tags.push('docker');
  if (allText.includes('migration') || allText.includes('database')) tags.push('database');
  if (allText.includes('frontend') || allText.includes('lexwebapp')) tags.push('frontend');
  if (allText.includes('paper') || allText.includes('arxiv') || allText.includes('статт')) tags.push('documentation');

  return { title, body, tags: [...new Set(tags)] };
}

// ── Infer tags from branches ────────────────────────────────

function inferBranchTags(branches: Set<string>): string[] {
  const tags = new Set<string>();
  for (const b of branches) {
    if (b.includes('feat/')) tags.add('feature');
    if (b.includes('fix/')) tags.add('bug-fix');
    if (b.includes('test/')) tags.add('testing');
    if (b.includes('deploy') || b.includes('ci-')) tags.add('deployment');
    if (b.includes('refactor')) tags.add('refactoring');
    if (b.includes('docs') || b.includes('blog')) tags.add('documentation');
  }
  return [...tags];
}

// ── Main ────────────────────────────────────────────────────

async function main() {
  console.log('=== Phase 1.2: Practitioner Layer Bootstrap ===\n');

  const allPrompts = extractPrompts();
  console.log(`Prompt corpus: ${allPrompts.length} prompts`);

  const sessions = groupBySessions(allPrompts);
  console.log(`Sessions with >= ${MIN_PROMPTS} prompts: ${sessions.length}`);

  if (DRY_RUN) {
    console.log('\n--- Dry run: sessions to process ---');
    for (const s of sessions) {
      console.log(`  [${s.sessionId.slice(0, 12)}] ${s.prompts.length}p, ${s.totalChars}c, ${s.firstTs.slice(0, 10)}..${s.lastTs.slice(0, 10)}, branches: ${[...s.branches].join(', ')}`);
    }
    console.log('\nDry run complete.');
    process.exit(0);
  }

  const db = new Database();
  const embeddingService = new EmbeddingService();
  const wmService = new WorkflowMemoryService(db, embeddingService);

  // Check which sessions already exist
  const existingRes = await db.query(
    'SELECT session_id FROM workflow_memory_practitioner WHERE knowledge_type = $1',
    ['session_summary'],
  );
  const existing = new Set(existingRes.rows.map((r: any) => r.session_id));

  const toProcess = sessions.filter(s => !existing.has(s.sessionId));
  console.log(`Already ingested: ${existing.size}, new: ${toProcess.length}\n`);

  let ingested = 0;
  let failed = 0;

  for (const session of toProcess) {
    try {
      const summary = buildSessionSummary(session);
      const branchTags = inferBranchTags(session.branches);
      const allTags = [...new Set([...summary.tags, ...branchTags])];

      await wmService.ingestPractitioner({
        knowledgeType: 'session_summary',
        title: summary.title,
        body: summary.body,
        sessionId: session.sessionId,
        tags: allTags,
      });

      ingested++;
      console.log(`  [${ingested}/${toProcess.length}] ${session.sessionId.slice(0, 8)} — ${summary.title}`);
    } catch (err: any) {
      failed++;
      console.error(`  FAIL ${session.sessionId.slice(0, 8)}: ${err.message}`);
    }
  }

  const stats = await wmService.getStats();

  console.log(`\n=== Backfill Summary ===`);
  console.log(`Sessions processed: ${ingested}`);
  console.log(`Failed: ${failed}`);
  console.log(`\nCurrent DB state: ${stats.principles} principles, ${stats.patterns} patterns, ${stats.practitioner} practitioner entries`);
  console.log('Done.');

  await db.close();
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
