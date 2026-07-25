/**
 * A/B grounding+latency harness for the PARALLEL SEED feature (CORE-36).
 *
 * Runs the SAME practice_analysis queries through POST /api/chat twice — once
 * with parallel-seed OFF and once ON — holding the model tier fixed (deep), so
 * the ONLY variable is whether independent plan steps are batch-seeded before
 * the agentic loop. It does NOT judge quality with an LLM; instead it dumps the
 * answers in the shape scripts/testing/grounding-eval.ts consumes, so grounding
 * (cited cases EXIST + ON-TOPIC vs the EDRSR registry) is measured against hard
 * ground truth. It also reports per-variant latency and cost.
 *
 * Why this exists: parallel-seed batches independent seed searches, which removes
 * the model's ability to refine each seed search from the others' results. The
 * PR (#42) mandates a grounding-eval A/B confirming parity BEFORE enabling
 * CHAT_PARALLEL_SEED_MIN on prod. This is that A/B.
 *
 * Mechanism: relies on the per-request `parallelSeedMin` override (core +
 * mcp_backend) — the env CHAT_PARALLEL_SEED_MIN stays 0/unset on prod, so live
 * traffic is unaffected; only THIS harness's requests get seeding (variant on).
 *
 * IMPORTANT
 * - Chat orchestration lives in @secondlayer/core, only wired in the deployed
 *   backend. Run against prod (the per-request override must be deployed first).
 * - Costs REAL Bedrock money (~$2.7 Sonnet / deep practice_analysis). --dry-run first.
 *
 * Auth: Bearer token in AB_TOKEN (a SECONDARY_LAYER_KEYS value → no user billed).
 *
 * Usage:
 *   AB_BASE_URL=https://legal.org.ua AB_TOKEN=xxxx npx tsx scripts/testing/ab-parallel-seed.ts --dry-run
 *   AB_BASE_URL=https://legal.org.ua AB_TOKEN=xxxx npx tsx scripts/testing/ab-parallel-seed.ts
 *   ... --queries-file=./q.json    # override query set (JSON array of strings)
 *   ... --seed-min=2               # parallelSeedMin for the "on" arm (default 2)
 *   ... --only=seed-off|seed-on    # run a single arm
 *
 * Then score grounding (ground truth = EDRSR):
 *   npx tsx scripts/testing/grounding-eval.ts --input=~/ab-parallel-seed/ab-<runId>.json
 */

import { writeFileSync, mkdirSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const BASE_URL = (process.env.AB_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const TOKEN = process.env.AB_TOKEN || '';
const OUT_DIR = process.env.AB_OUT_DIR || join(homedir(), 'ab-parallel-seed');
const REQUEST_TIMEOUT_MS = 330_000; // > deep wall-clock timeout (300s) + slack

const DRY_RUN = process.argv.includes('--dry-run');
const ONLY = process.argv.find(a => a.startsWith('--only='))?.split('=')[1] as 'seed-off' | 'seed-on' | undefined;
const QUERIES_FILE = process.argv.find(a => a.startsWith('--queries-file='))?.split('=')[1];
const SEED_MIN = parseInt(process.argv.find(a => a.startsWith('--seed-min='))?.split('=')[1] || '2', 10);

// Both arms force the SAME tier (deep) so the only variable is parallel-seed.
// budget=deep + maxBudget=deep keeps the classifier from changing tiers between
// arms; deep practice_analysis is where multi-step independent searches arise.
const VARIANTS = [
  { name: 'seed-off', body: { budget: 'deep', maxBudget: 'deep', allowDeepEscalation: true, parallelSeedMin: 0 } },
  { name: 'seed-on', body: { budget: 'deep', maxBudget: 'deep', allowDeepEscalation: true, parallelSeedMin: SEED_MIN } },
].filter(v => !ONLY || v.name === ONLY);

// Default query set: deep practice_analysis questions that tend to produce
// multiple INDEPENDENT searches (so seeding actually triggers; needs >=2).
const DEFAULT_QUERIES = [
  'податкова написала до осіб які мають дррп нерухомість на окупованій території наприклад донецьк після 2014 року у особи є квартира у києві 40 квм в такому разі податкова вказує щодо необхідності впо сумувати податок на площу на нерухомість в києві плюс площа яка на окупованій території, при цьому не має доказів що ця нерухомість існує , можливо вона зруйнована , яка позиція верховного суду з цього питання?',
  'Яка позиція Верховного Суду щодо стягнення моральної шкоди при незаконному звільненні працівника?',
  'Як суди застосовують позовну давність у спорах про визнання договору купівлі-продажу нерухомості недійсним?',
  'Яка судова практика щодо відповідальності поручителя після зміни умов основного зобов’язання без його згоди?',
];

const QUERIES: string[] = QUERIES_FILE ? JSON.parse(readFileSync(QUERIES_FILE, 'utf8')) : DEFAULT_QUERIES;

const INTERNAL_TOOLS = new Set(['_init', '_classify', '_summarize', 'request_additional_tools']);

interface RunResult {
  variant: string;
  queryIdx: number;
  query: string;
  responseId: string | null;
  status: 'success' | 'error' | 'timeout' | 'no_answer';
  answer: string;
  totalCostUsd: number;
  toolsUsed: string[];
  thinkingSteps: number;
  firstByteMs: number;
  totalMs: number;
  errorMessage: string | null;
}

async function streamChat(query: string, variant: typeof VARIANTS[number], queryIdx: number): Promise<RunResult> {
  const startTime = Date.now();
  const result: RunResult = {
    variant: variant.name, queryIdx, query,
    responseId: null, status: 'no_answer', answer: '',
    totalCostUsd: 0, toolsUsed: [], thinkingSteps: 0,
    firstByteMs: 0, totalMs: 0, errorMessage: null,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN}` },
      body: JSON.stringify({ query, ...variant.body }),
      signal: controller.signal,
    });

    if (!response.ok) {
      result.status = 'error';
      result.errorMessage = `HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`;
      result.totalMs = Date.now() - startTime;
      return result;
    }
    result.firstByteMs = Date.now() - startTime;

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '', currentEvent = '', currentData = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (line.startsWith(':')) continue;
        if (line.startsWith('event: ')) currentEvent = line.slice(7).trim();
        else if (line.startsWith('data: ')) currentData = line.slice(6);
        else if (line === '' && currentEvent && currentData) {
          try {
            const data = JSON.parse(currentData);
            switch (currentEvent) {
              case 'response_id': result.responseId = data.response_id; break;
              case 'thinking':
                result.thinkingSteps++;
                if (data.tool && !INTERNAL_TOOLS.has(data.tool)) result.toolsUsed.push(data.tool);
                break;
              case 'tool_call': {
                const t = data.name || data.tool;
                if (t && !INTERNAL_TOOLS.has(t)) result.toolsUsed.push(t);
                break;
              }
              case 'tool_result':
                if (data.tool && !INTERNAL_TOOLS.has(data.tool)) result.toolsUsed.push(data.tool);
                break;
              case 'answer':
                result.answer = data.text || data.content || result.answer;
                result.status = 'success';
                break;
              case 'complete':
                result.totalCostUsd = data.total_cost_usd || 0;
                if (data.answer && !result.answer) result.answer = data.answer;
                result.status = 'success';
                break;
              case 'error':
                result.status = 'error';
                result.errorMessage = data.message || data.error || JSON.stringify(data);
                break;
            }
          } catch { /* skip malformed */ }
          currentEvent = ''; currentData = '';
        }
      }
    }
  } catch (err: any) {
    result.status = err.name === 'AbortError' ? 'timeout' : 'error';
    result.errorMessage = err.message;
  } finally {
    clearTimeout(timer);
  }

  result.toolsUsed = [...new Set(result.toolsUsed)];
  result.totalMs = Date.now() - startTime;
  return result;
}

function mean(xs: number[]): number { return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0; }

async function main() {
  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  console.log(`\nA/B parallel-seed — grounding + latency (CORE-36)`);
  console.log(`base=${BASE_URL}  variants=[${VARIANTS.map(v => v.name).join(', ')}]  seedMin(on)=${SEED_MIN}  queries=${QUERIES.length}  runId=${runId}\n`);

  if (DRY_RUN) {
    console.log('DRY RUN — no requests sent. Plan:');
    for (const v of VARIANTS) console.log(`  variant ${v.name}: ${JSON.stringify(v.body)}`);
    QUERIES.forEach((q, i) => console.log(`  q${i}: ${q.slice(0, 90)}${q.length > 90 ? '…' : ''}`));
    const n = QUERIES.length * VARIANTS.length;
    console.log(`\n  est. spend (rough): ${n} deep runs × ~$2.7 ≈ $${(n * 2.7).toFixed(0)}`);
    return;
  }

  if (!TOKEN) { console.error('AB_TOKEN is required.'); process.exit(1); }

  const runs: RunResult[] = [];
  // Sequential: deep runs are slow & expensive; keep billing/load clean.
  for (let i = 0; i < QUERIES.length; i++) {
    for (const v of VARIANTS) {
      process.stdout.write(`[q${i} ${v.name}] running… `);
      const r = await streamChat(QUERIES[i], v, i);
      runs.push(r);
      console.log(`${r.status}  $${r.totalCostUsd.toFixed(4)}  ${(r.totalMs / 1000).toFixed(1)}s  tools=${r.toolsUsed.length}  id=${r.responseId}`);
    }
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const jsonPath = join(OUT_DIR, `ab-${runId}.json`);
  writeFileSync(jsonPath, JSON.stringify({ runId, baseUrl: BASE_URL, seedMin: SEED_MIN, runs }, null, 2));

  // Latency + cost summary per query.
  console.log('\n## Latency / cost (model tier held at deep; only parallel-seed differs)\n');
  console.log('| q | off s | on s | Δ latency | off $ | on $ | off tools | on tools |');
  console.log('|---|-------|------|-----------|-------|------|-----------|----------|');
  for (let i = 0; i < QUERIES.length; i++) {
    const off = runs.find(r => r.queryIdx === i && r.variant === 'seed-off');
    const on = runs.find(r => r.queryIdx === i && r.variant === 'seed-on');
    const offS = (off?.totalMs ?? 0) / 1000, onS = (on?.totalMs ?? 0) / 1000;
    const delta = offS > 0 && onS > 0 ? `${(((offS - onS) / offS) * 100).toFixed(0)}%` : '-';
    console.log(`| q${i} | ${offS.toFixed(0)} | ${onS.toFixed(0)} | ${delta} | $${(off?.totalCostUsd ?? 0).toFixed(3)} | $${(on?.totalCostUsd ?? 0).toFixed(3)} | ${off?.toolsUsed.length ?? '-'} | ${on?.toolsUsed.length ?? '-'} |`);
  }
  const offMs = runs.filter(r => r.variant === 'seed-off' && r.status === 'success').map(r => r.totalMs);
  const onMs = runs.filter(r => r.variant === 'seed-on' && r.status === 'success').map(r => r.totalMs);
  const offMean = mean(offMs) / 1000, onMean = mean(onMs) / 1000;
  const meanDelta = offMean > 0 ? `${(((offMean - onMean) / offMean) * 100).toFixed(0)}%` : '-';
  console.log(`\nmean latency: seed-off ${offMean.toFixed(1)}s · seed-on ${onMean.toFixed(1)}s · improvement ${meanDelta}`);

  console.log(`\nraw → ${jsonPath}`);
  console.log(`\nNEXT — score grounding parity against EDRSR (ground truth):`);
  console.log(`  npx tsx scripts/testing/grounding-eval.ts --input=${jsonPath}`);
  console.log(`  → compare "By variant": seed-on mean grounding must NOT regress vs seed-off (off-topic + fabricated must not rise).`);

  // Self-verify seeding actually fired in seed-on and NOT in seed-off.
  const ids = runs.filter(r => r.responseId).map(r => `${r.variant}:${r.responseId}`);
  console.log(`\nverify seeding fired per arm (run on prod):`);
  console.log(`  for id in ${runs.filter(r => r.responseId).map(r => r.responseId).join(' ')}; do echo "== $id =="; docker logs secondlayer-app-prod-green 2>&1 | grep "$id" | grep -i "PARALLEL SEED" | head -1; done`);
  console.log(`  (expect a PARALLEL SEED line for seed-on ids, none for seed-off. variant→id: ${ids.join('  ')})`);
}

main().catch(e => { console.error(e); process.exit(1); });
