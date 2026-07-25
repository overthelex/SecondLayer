/**
 * A/B model quality harness for the chat pipeline (Opus vs Sonnet).
 *
 * Runs the SAME set of practice_analysis queries through POST /api/chat twice —
 * once forcing the Opus tier (budget=deep) and once forcing the Sonnet tier
 * (budget=standard, maxBudget=standard so the classifier can't escalate to deep) —
 * then has a Bedrock judge do a BLIND, order-randomized pairwise comparison.
 *
 * Output: a JSON dump (full answers + costs + response_ids) and a markdown table
 * with per-query cost, savings %, latency and the judge verdict.
 *
 * IMPORTANT
 * - The real chat orchestration lives in the proprietary @secondlayer/core package,
 *   which is only wired up in the deployed backend. Local backend ships a NoOp
 *   ChatService stub, so this must run against a backend that has core (prod).
 * - Running against prod costs REAL money at the Bedrock layer (~$7 Opus / ~$2.7
 *   Sonnet per deep practice_analysis query). Use --dry-run first.
 * - maxBudget semantics are enforced inside proprietary code we can't read here, so
 *   the harness is SELF-VERIFYING: it records every response_id. After a run, confirm
 *   which model each variant actually used via the printed `verify` ssh snippet
 *   (greps the prod "Cost by model" log line per response_id). If the sonnet variant
 *   still shows Opus, the cap didn't hold and the params need adjusting.
 *
 * Auth: Bearer token in AB_TOKEN.
 *   - Use a SECONDARY_LAYER_KEYS value (no userId) to avoid charging any user;
 *     cost still comes back in the `complete` SSE event.
 *   - Or a user JWT to also exercise billing/markup (charged_usd in `cost_summary`).
 *
 * Usage:
 *   AB_BASE_URL=https://legal.org.ua AB_TOKEN=xxxx npx tsx scripts/testing/ab-model-quality.ts --dry-run
 *   AB_BASE_URL=https://legal.org.ua AB_TOKEN=xxxx npx tsx scripts/testing/ab-model-quality.ts
 *   ... --queries-file=./my-queries.json   # override the query set (JSON array of strings)
 *   ... --only=opus|sonnet                 # run a single variant
 */

// Bedrock SDK is imported lazily inside judge() — it lives in the backend/shared
// images, not always in host node_modules, and is only needed for grading.
import { writeFileSync, mkdirSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const BASE_URL = (process.env.AB_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const TOKEN = process.env.AB_TOKEN || '';
const OUT_DIR = process.env.AB_OUT_DIR || join(homedir(), 'ab-model-quality');
const AWS_REGION = process.env.AWS_REGION || 'eu-central-1';
const JUDGE_MODEL = process.env.AB_JUDGE_MODEL || 'eu.anthropic.claude-sonnet-4-6';
const REQUEST_TIMEOUT_MS = 330_000; // > deep wall-clock timeout (300s) + slack

const DRY_RUN = process.argv.includes('--dry-run');
const ONLY = process.argv.find(a => a.startsWith('--only='))?.split('=')[1] as 'opus' | 'sonnet' | undefined;
const QUERIES_FILE = process.argv.find(a => a.startsWith('--queries-file='))?.split('=')[1];

// Forced-tier variants. maxBudget caps the ceiling so the practice_analysis
// classifier (defaultBudget=deep) can't escalate the sonnet arm back to Opus.
const VARIANTS = [
  { name: 'opus', body: { budget: 'deep', maxBudget: 'deep', allowDeepEscalation: true } },
  { name: 'sonnet', body: { budget: 'standard', maxBudget: 'standard', allowDeepEscalation: false } },
].filter(v => !ONLY || v.name === ONLY);

// Default query set: the real prod query (chat-cb0935df) + typical practice_analysis ones.
const DEFAULT_QUERIES = [
  'податкова написала до осіб які мають дррп нерухомість на окупованій території наприклад донецьк після 2014 року у особи є квартира у києві 40 квм в такому разі податкова вказує щодо необхідності впо сумувати податок на площу на нерухомість в києві плюс площа яка на окупованій території, при цьому не має доказів що ця нерухомість існує , можливо вона зруйнована , яка позиція верховного суду з цього питання?',
  'Яка позиція Верховного Суду щодо стягнення моральної шкоди при незаконному звільненні працівника?',
  'Як суди застосовують позовну давність у спорах про визнання договору купівлі-продажу нерухомості недійсним?',
  'Яка судова практика щодо відповідальності поручителя після зміни умов основного зобов’язання без його згоди?',
];

const QUERIES: string[] = QUERIES_FILE
  ? JSON.parse(readFileSync(QUERIES_FILE, 'utf8'))
  : DEFAULT_QUERIES;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RunResult {
  variant: string;
  queryIdx: number;
  query: string;
  responseId: string | null;
  status: 'success' | 'error' | 'timeout' | 'no_answer';
  answer: string;
  totalCostUsd: number;
  chargedUsd: number;
  toolsUsed: string[];
  thinkingSteps: number;
  firstByteMs: number;
  totalMs: number;
  errorMessage: string | null;
}

interface JudgeVerdict {
  winner: 'opus' | 'sonnet' | 'tie';
  margin: 'large' | 'moderate' | 'slight' | 'none';
  opusScore: number;   // 1-5
  sonnetScore: number; // 1-5
  opusHallucination: boolean;
  sonnetHallucination: boolean;
  reason: string;
}

const INTERNAL_TOOLS = new Set(['_init', '_classify', '_summarize', 'request_additional_tools']);

// ---------------------------------------------------------------------------
// Chat call (SSE)
// ---------------------------------------------------------------------------

async function streamChat(query: string, variant: typeof VARIANTS[number], queryIdx: number): Promise<RunResult> {
  const startTime = Date.now();
  const result: RunResult = {
    variant: variant.name, queryIdx, query,
    responseId: null, status: 'no_answer', answer: '',
    totalCostUsd: 0, chargedUsd: 0, toolsUsed: [], thinkingSteps: 0,
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
              case 'cost_summary':
                result.chargedUsd = data.charged_usd || 0;
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

// ---------------------------------------------------------------------------
// Blind pairwise judge (Bedrock)
// ---------------------------------------------------------------------------

async function judge(query: string, opus: RunResult, sonnet: RunResult): Promise<JudgeVerdict | null> {
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    console.warn('[judge] no AWS creds — skipping quality grading'); return null;
  }
  if (opus.status !== 'success' || sonnet.status !== 'success') return null;

  let BedrockRuntimeClient: any, InvokeModelCommand: any;
  try {
    ({ BedrockRuntimeClient, InvokeModelCommand } = await import('@aws-sdk/client-bedrock-runtime'));
  } catch {
    console.warn('[judge] @aws-sdk/client-bedrock-runtime not installed — skipping grading'); return null;
  }
  const client = new BedrockRuntimeClient({ region: AWS_REGION });

  // Randomize position to remove order bias; map back afterwards.
  const opusIsA = Math.random() < 0.5;
  const answerA = opusIsA ? opus.answer : sonnet.answer;
  const answerB = opusIsA ? sonnet.answer : opus.answer;

  const prompt = `You are a senior Ukrainian lawyer grading two AI answers to the same legal question. Be strict about legal accuracy, correct citation of Supreme Court positions, completeness, and absence of fabricated case numbers or invented norms.

Respond ONLY with JSON:
{"winner":"A"|"B"|"tie","margin":"large"|"moderate"|"slight"|"none","scoreA":1-5,"scoreB":1-5,"hallucinationA":true|false,"hallucinationB":true|false,"reason":"<2-3 sentences, in Ukrainian>"}

QUESTION:
${query}

ANSWER A:
${(answerA || '').slice(0, 6000)}

ANSWER B:
${(answerB || '').slice(0, 6000)}`;

  try {
    const resp = await client.send(new InvokeModelCommand({
      modelId: JUDGE_MODEL,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 600,
        temperature: 0,
        messages: [{ role: 'user', content: prompt }],
      }),
    }));
    const content = JSON.parse(new TextDecoder().decode(resp.body)).content?.[0]?.text || '';
    const m = content.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const p = JSON.parse(m[0]);
    const winner = p.winner === 'tie' ? 'tie' : (p.winner === 'A') === opusIsA ? 'opus' : 'sonnet';
    return {
      winner,
      margin: p.margin ?? 'none',
      opusScore: opusIsA ? p.scoreA : p.scoreB,
      sonnetScore: opusIsA ? p.scoreB : p.scoreA,
      opusHallucination: opusIsA ? !!p.hallucinationA : !!p.hallucinationB,
      sonnetHallucination: opusIsA ? !!p.hallucinationB : !!p.hallucinationA,
      reason: p.reason ?? '',
    };
  } catch (err: any) {
    console.warn(`[judge] failed: ${err.message}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  console.log(`\nA/B model quality — Opus vs Sonnet`);
  console.log(`base=${BASE_URL}  variants=[${VARIANTS.map(v => v.name).join(', ')}]  queries=${QUERIES.length}  runId=${runId}\n`);

  if (DRY_RUN) {
    console.log('DRY RUN — no requests sent. Plan:');
    for (const v of VARIANTS) console.log(`  variant ${v.name}: ${JSON.stringify(v.body)}`);
    QUERIES.forEach((q, i) => console.log(`  q${i}: ${q.slice(0, 90)}${q.length > 90 ? '…' : ''}`));
    const opusRuns = VARIANTS.find(v => v.name === 'opus') ? QUERIES.length : 0;
    const sonnetRuns = VARIANTS.find(v => v.name === 'sonnet') ? QUERIES.length : 0;
    console.log(`\n  est. spend (rough): Opus ${opusRuns}×~$6.8 + Sonnet ${sonnetRuns}×~$2.7 ≈ $${(opusRuns * 6.8 + sonnetRuns * 2.7).toFixed(0)}`);
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

  // Judge pairwise per query (only when both variants ran).
  const verdicts: Record<number, JudgeVerdict | null> = {};
  if (!ONLY) {
    for (let i = 0; i < QUERIES.length; i++) {
      const opus = runs.find(r => r.queryIdx === i && r.variant === 'opus');
      const sonnet = runs.find(r => r.queryIdx === i && r.variant === 'sonnet');
      if (opus && sonnet) verdicts[i] = await judge(QUERIES[i], opus, sonnet);
    }
  }

  // Persist raw output (full answers).
  mkdirSync(OUT_DIR, { recursive: true });
  const jsonPath = join(OUT_DIR, `ab-${runId}.json`);
  writeFileSync(jsonPath, JSON.stringify({ runId, baseUrl: BASE_URL, runs, verdicts }, null, 2));

  // Markdown summary.
  console.log('\n## A/B summary\n');
  console.log('| q | opus $ | sonnet $ | savings | opus s | sonnet s | winner | margin | opus/sonnet score | halluc |');
  console.log('|---|--------|----------|---------|--------|----------|--------|--------|-------------------|--------|');
  let totOpus = 0, totSonnet = 0;
  for (let i = 0; i < QUERIES.length; i++) {
    const o = runs.find(r => r.queryIdx === i && r.variant === 'opus');
    const s = runs.find(r => r.queryIdx === i && r.variant === 'sonnet');
    const v = verdicts[i];
    const oc = o?.totalCostUsd ?? 0, sc = s?.totalCostUsd ?? 0;
    totOpus += oc; totSonnet += sc;
    const sav = oc > 0 ? `${(((oc - sc) / oc) * 100).toFixed(0)}%` : '-';
    const halluc = v ? `${v.opusHallucination ? 'O' : '-'}/${v.sonnetHallucination ? 'S' : '-'}` : '-';
    console.log(`| q${i} | $${oc.toFixed(3)} | $${sc.toFixed(3)} | ${sav} | ${((o?.totalMs ?? 0) / 1000).toFixed(0)} | ${((s?.totalMs ?? 0) / 1000).toFixed(0)} | ${v?.winner ?? '-'} | ${v?.margin ?? '-'} | ${v ? `${v.opusScore}/${v.sonnetScore}` : '-'} | ${halluc} |`);
  }
  const totSav = totOpus > 0 ? `${(((totOpus - totSonnet) / totOpus) * 100).toFixed(0)}%` : '-';
  console.log(`| **Σ** | **$${totOpus.toFixed(2)}** | **$${totSonnet.toFixed(2)}** | **${totSav}** | | | | | | |`);

  if (!ONLY) {
    const wins = Object.values(verdicts).filter(Boolean) as JudgeVerdict[];
    const opusWins = wins.filter(v => v.winner === 'opus').length;
    const sonnetWins = wins.filter(v => v.winner === 'sonnet').length;
    const ties = wins.filter(v => v.winner === 'tie').length;
    console.log(`\nJudge: opus ${opusWins} · sonnet ${sonnetWins} · tie ${ties}  (of ${wins.length} judged)`);
    for (let i = 0; i < QUERIES.length; i++) if (verdicts[i]?.reason) console.log(`  q${i}: ${verdicts[i]!.reason}`);
  }

  console.log(`\nraw → ${jsonPath}`);

  // Self-verify which model each arm actually used (maxBudget is enforced in
  // proprietary code we can't see — confirm from the prod "Cost by model" log).
  const ids = runs.filter(r => r.responseId).map(r => `${r.variant}:${r.responseId}`);
  console.log(`\nverify actual model per run (run on prod):`);
  console.log(`  for id in ${runs.filter(r => r.responseId).map(r => r.responseId).join(' ')}; do echo "== $id =="; docker logs secondlayer-app-prod 2>&1 | grep "$id" | grep "Cost by model"; done`);
  console.log(`  (variant→id map: ${ids.join('  ')})`);
}

main().catch(e => { console.error(e); process.exit(1); });
