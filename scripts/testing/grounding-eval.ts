/**
 * Ground-truth citation grounding eval for chat answers.
 *
 * Replaces the unreliable same-family LLM judge for the one thing that matters in
 * legal answers: are the cited court cases REAL and ON-TOPIC? Both checks are made
 * against the EDRSR registry (hard ground truth), not another LLM.
 *
 * For each answer it:
 *   1. Extracts cited case numbers (regex over Ukrainian case-number format).
 *   2. EXISTS   — does the case number appear in edrsr_documents?
 *   3. ON-TOPIC — does the case fulltext (edrsr_fulltext) contain the query's
 *      distinctive topic terms? A real case cited for an unrelated proposition
 *      ("fabricated relevance") is the failure mode this catches.
 *
 * grounding score = (cases that EXIST and are ON-TOPIC) / (cases cited)
 *
 * DB access: shells out to psql, feeding SQL via stdin (psql -f -) so no shell
 * quoting is needed. Default targets prod EDRSR over ssh+docker; override the argv
 * with env GROUNDING_PSQL (a JSON array) to point at a local EDRSR copy.
 *
 * Usage:
 *   npx tsx scripts/testing/grounding-eval.ts --input=~/ab-model-quality/ab-XXX.json
 *   ... --topics=./topics.json     # { "0": ["окупов","ОРДЛО","непідконтрольн"], ... }
 *   ... --on-topic-min=1           # min distinctive terms a case must contain (default 1)
 */

import { execFileSync } from 'child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

// --- config ---------------------------------------------------------------
const arg = (k: string) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=');
const INPUT = (arg('input') || '').replace(/^~/, homedir());
const TOPICS_FILE = (arg('topics') || '').replace(/^~/, homedir());
const ON_TOPIC_MIN = parseInt(arg('on-topic-min') || '1', 10);
const OUT_DIR = (arg('out') || join(homedir(), 'grounding-eval')).replace(/^~/, homedir());
const PSQL_ARGV: string[] = process.env.GROUNDING_PSQL
  ? JSON.parse(process.env.GROUNDING_PSQL)
  : ['ssh', 'prod', 'docker', 'exec', '-i', 'secondlayer-postgres-prod',
     'psql', '-U', 'secondlayer', '-d', 'secondlayer_prod', '-t', '-A', '-f', '-'];

// Ukrainian case-number format: 826/11557/18, 640/329/20, 2-97/2011, 755/15457/14-ц
const CASE_RE = /\b\d{1,4}-?\d{0,5}\/\d{2,6}(?:\/\d{2})?(?:-[а-яіїєґ]+)?\b/gi;

// Real jurisdiction suffixes present in edrsr_documents.cause_num (proceeding type:
// -ц цивільне, -к, -п, -а адмін, …). The model frequently drops the suffix in prose
// while the registry keeps it; we expand cited bases by these to keep the existence
// match index-free-friendly (pure equality IN). Ordered by registry frequency; the
// long tail is negligible. Keep in sync with stripSuffix's '-[а-яіїєґ]+$'.
const CASE_SUFFIXES = [
  'ц', 'к', 'п', 'а', 'г', 'б', 'ад', 'кп', 'кр', 'цр', 'кс', 'пд', 'нр',
  'н', 'в', 'й', 'у', 'вх', 'с', 'ск', 'о', 'е', 'ар', 'пн', 'з', 'нм', 'т',
];

// short stoplist for auto topic-term derivation (function words / boilerplate)
const STOP = new Set(['яка','який','яке','щодо','після','цьому','такому','разі','коли','якщо','при','для','про','над','під','між','або','осіб','особи','має','мають','наприклад','необхідності','вказує','написала','питання','позиція','верховного','суду']);

// --- helpers --------------------------------------------------------------
function psql(sql: string): string[] {
  const out = execFileSync(PSQL_ARGV[0], PSQL_ARGV.slice(1), {
    input: sql, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
  });
  return out.split('\n').filter(Boolean);
}
const esc = (s: string) => s.replace(/'/g, "''");
// Court case numbers carry an optional jurisdiction suffix (-а адмін / -ц цивільн /
// -к etc.). The model often drops it in prose ("802/436/17") while the registry
// stores it ("802/436/17-а"), so match on the suffix-stripped base to avoid false
// "fabricated" flags. Mirror this exact strip in the SQL (regexp_replace below).
const stripSuffix = (c: string) => c.replace(/-[а-яіїєґ]+$/i, '');
const meta = (r: any) => ({ queryIdx: r.queryIdx, variant: r.variant, label: `q${r.queryIdx ?? '?'}:${r.variant ?? '?'}` });

function deriveTopics(query: string): string[] {
  const words = (query.toLowerCase().match(/[а-яіїєґ’']{5,}/gi) || [])
    .map(w => w.replace(/['’]/g, ''))
    .filter(w => !STOP.has(w));
  // stem-ish: keep a distinctive 6-char prefix so 'окупованій'/'окупованої' both match 'окупов'
  const stems = Array.from(new Set(words.map(w => w.slice(0, 6))));
  return stems.sort((a, b) => b.length - a.length).slice(0, 8);
}

// --- main -----------------------------------------------------------------
if (!INPUT) { console.error('--input=<ab-json> required'); process.exit(1); }
const data = JSON.parse(readFileSync(INPUT, 'utf8'));
const topicsMap: Record<string, string[]> = TOPICS_FILE ? JSON.parse(readFileSync(TOPICS_FILE, 'utf8')) : {};
const runs: any[] = data.runs || data;

const results: any[] = [];
for (const r of runs) {
  if (r.status && r.status !== 'success') continue;
  const cases = Array.from(new Set(((r.answer || '').match(CASE_RE) || []) as string[]));
  if (!cases.length) { results.push({ ...meta(r), cited: 0, note: 'no case numbers cited' }); continue; }

  const provided = topicsMap[String(r.queryIdx)];
  const topics = (provided && provided.length) ? provided : deriveTopics(r.query || '');

  // one SQL per answer: existence + per-term presence across the cited cases.
  // Match on the suffix-stripped base (see stripSuffix) so a cited "802/436/17"
  // still resolves the registry's "802/436/17-а". edrsr_documents has NO index on
  // cause_num (partitioned → parallel seq scan), so the WHERE must stay pure
  // equality: a regexp_replace() in WHERE runs over all ~110M rows and times out.
  // Instead we expand each base into base + every real jurisdiction suffix and
  // keep an equality IN-list; the regexp_replace base-grouping then runs only over
  // the handful of matched rows (cheap) in SELECT/GROUP BY.
  const bases = Array.from(new Set(cases.map(stripSuffix)));
  const matchValues = Array.from(new Set([
    ...cases,                                              // as cited (suffix kept)
    ...bases,                                              // base (registry has no suffix)
    ...bases.flatMap(b => CASE_SUFFIXES.map(s => `${b}-${s}`)), // base + each real suffix
  ]));
  const inList = matchValues.map(c => `'${esc(c)}'`).join(',');
  const termCols = topics.map((t, i) => `BOOL_OR(f.full_text ILIKE '%${esc(t)}%') AS t${i}`).join(', ');
  const sql = `SELECT regexp_replace(d.cause_num, '-[а-яіїєґ]+$', '', 'i') AS base_num,
      COUNT(DISTINCT d.doc_id) AS docs${termCols ? ', ' + termCols : ''}
    FROM edrsr_documents d LEFT JOIN edrsr_fulltext f USING(doc_id)
    WHERE d.cause_num IN (${inList}) GROUP BY base_num;`;

  let rows: string[] = [];
  try { rows = psql(sql); } catch (e: any) { console.error(`psql failed for ${meta(r).label}: ${e.message}`); }

  // psql -t -A default field separator is '|'; key is the suffix-stripped base_num
  const found = new Map<string, boolean[]>();
  for (const line of rows) {
    const cols = line.split('|');
    const base = cols[0];
    const terms = topics.map((_, i) => (cols[2 + i] || '').trim() === 't');
    found.set(base, terms);
  }

  const perCase = cases.map(c => {
    const base = stripSuffix(c);
    const exists = found.has(base);
    const termHits = exists ? found.get(base)!.filter(Boolean).length : 0;
    const onTopic = exists && termHits >= ON_TOPIC_MIN;
    return { case: c, exists, termHits, onTopic };
  });
  const grounded = perCase.filter(p => p.onTopic).length;
  results.push({
    ...meta(r),
    cited: cases.length,
    exist: perCase.filter(p => p.exists).length,
    onTopic: grounded,
    existButOffTopic: perCase.filter(p => p.exists && !p.onTopic).length,
    fabricated: perCase.filter(p => !p.exists).length,
    groundingScore: +(grounded / cases.length).toFixed(2),
    topics,
    perCase,
  });
}

// --- report ---------------------------------------------------------------
mkdirSync(OUT_DIR, { recursive: true });
const stamp = INPUT.split('/').pop()?.replace(/\.json$/, '') || 'run';
const outPath = join(OUT_DIR, `grounding-${stamp}.json`);
writeFileSync(outPath, JSON.stringify(results, null, 2));

console.log('\n## Citation grounding (ground truth: EDRSR registry)\n');
console.log('| answer | cited | exist | on-topic | exist-but-off-topic | fabricated | score |');
console.log('|--------|-------|-------|----------|---------------------|------------|-------|');
for (const r of results) {
  if (r.cited === 0) { console.log(`| ${r.label} | 0 | - | - | - | - | ${r.note || '-'} |`); continue; }
  console.log(`| ${r.label} | ${r.cited} | ${r.exist} | ${r.onTopic} | ${r.existButOffTopic} | ${r.fabricated} | ${r.groundingScore} |`);
}
const byVar: Record<string, { n: number; s: number; off: number; fab: number }> = {};
for (const r of results) {
  if (r.cited === 0) continue;
  const v = r.variant || 'all';
  byVar[v] = byVar[v] || { n: 0, s: 0, off: 0, fab: 0 };
  byVar[v].n++; byVar[v].s += r.groundingScore; byVar[v].off += r.existButOffTopic; byVar[v].fab += r.fabricated;
}
console.log('\n### By variant');
for (const [v, a] of Object.entries(byVar)) {
  console.log(`- ${v}: mean grounding ${(a.s / a.n).toFixed(2)} · off-topic cites ${a.off} · fabricated ${a.fab} (n=${a.n})`);
}
console.log(`\nraw → ${outPath}`);
