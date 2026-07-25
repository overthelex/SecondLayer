// CORE-21 P1.eval — N-query A/B for FTS IDF selection (P1.5a) + strict relevance gate (P1.5b).
//
// For each curated query, calls search_court_decisions (hybrid) twice — treatment (current)
// and baseline (_eval_baseline: bypasses IDF + strict gate) — then an INDEPENDENT Bedrock judge
// scores each returned case's topical relevance from its own snippet. Reports precision@10
// (fraction scored >= 7) per arm + deltas.
//
// Run inside the backend container (has localhost API + Bedrock creds):
//   docker exec -e EVAL_JWT="$JWT" <backend> node /tmp/fts-ab-eval.mjs
//
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';

const API = process.env.EVAL_API || 'http://localhost:3000';
const JWT = process.env.EVAL_JWT;
const MODEL = process.env.BEDROCK_MODEL_QUICK || 'eu.anthropic.claude-haiku-4-5-20251001-v1:0';
const REGION = process.env.AWS_REGION || process.env.BEDROCK_REGION || 'eu-central-1';
const RELEVANT = 7; // judge score >= this counts as on-topic

if (!JWT) { console.error('EVAL_JWT env required'); process.exit(1); }
const bedrock = new BedrockRuntimeClient({ region: REGION });

const QUERIES = [
  { q: 'податок на нерухоме майно сумування площі квартири на окупованій території Донецьк ДРРП', jk: 4 },
  { q: 'оскарження податкового повідомлення-рішення з ПДВ безтоварні операції', jk: 4 },
  { q: 'поновлення на роботі після незаконного звільнення працівника', jk: 1 },
  { q: 'стягнення аліментів на утримання неповнолітньої дитини у твердій грошовій сумі', jk: 1 },
  { q: 'визнання права власності на спадкове майно за заповітом', jk: 1 },
  { q: 'розірвання шлюбу та поділ спільного майна подружжя', jk: 1 },
  { q: 'відшкодування шкоди завданої внаслідок ДТП страхове відшкодування', jk: 1 },
  { q: 'самовільне залишення військової частини військовослужбовцем під час воєнного стану', jk: 2 },
  { q: 'керування транспортним засобом у стані алкогольного сп’яніння позбавлення права', jk: 5 },
  { q: 'дрібне хуліганство адміністративний арешт', jk: 5 },
  { q: 'банкрутство фізичної особи відновлення платоспроможності боржника', jk: 3 },
  { q: 'визнання протиправним рішення про відмову у державній реєстрації права на нерухомість', jk: 4 },
  { q: 'невиплата заробітної плати стягнення середнього заробітку за час затримки', jk: 1 },
  { q: 'оскарження дій державного виконавця у виконавчому провадженні', jk: 4 },
  { q: 'визнання недійсним договору купівлі-продажу нерухомого майна', jk: 1 },
];

async function search(query, jk, baseline) {
  const body = { mode: 'hybrid', query, limit: 10, ...(jk ? { justice_kind: jk } : {}), ...(baseline ? { _eval_baseline: true } : {}) };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 90_000);
  try {
    const r = await fetch(`${API}/api/tools/search_court_decisions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${JWT}` },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const j = await r.json();
    // HTTP wraps the tool result: { success, tool, result: { content: [{type:'text', text}] } }
    const content = j?.result?.content ?? j?.content;
    const textBlock = Array.isArray(content) ? content.find(c => c.type === 'text')?.text : null;
    const parsed = textBlock ? JSON.parse(textBlock) : (j?.result ?? j);
    return { results: parsed.results || [], legs: parsed.legs || {} };
  } catch (e) {
    return { results: [], legs: {}, error: e.name === 'AbortError' ? 'timeout' : e.message };
  } finally {
    clearTimeout(timer);
  }
}

function snippet(r) {
  return (r.qdrant_best_chunk_text || r.fts_headline || r.headline || '').replace(/\s+/g, ' ').slice(0, 280);
}

async function judge(query, results) {
  if (!results.length) return { scored: {}, precision: null, n: 0 };
  const items = results.map(r => ({ doc_id: r.doc_id, cause_num: r.cause_num, court: r.court_name, snippet: snippet(r) }));
  const prompt =
    `Запит користувача: "${query}"\n\n` +
    `Нижче — судові рішення (номер, суд, фрагмент тексту). Для КОЖНОГО оціни, наскільки воно ПРЯМО ` +
    `відповідає на правове питання запиту, за шкалою 0-10:\n` +
    `- 8-10: прямо про те саме питання/статтю/обставини\n- 5-7: та сама галузь, але інше питання\n- 0-4: не стосується\n` +
    `Суди СТРОГО за фрагментом тексту, не за номером. Поверни ЛИШЕ JSON-масив: [{"doc_id":N,"score":M}]\n\n` +
    JSON.stringify(items);
  const payload = { anthropic_version: 'bedrock-2023-05-31', max_tokens: 1024, temperature: 0, messages: [{ role: 'user', content: prompt }] };
  try {
    const resp = await bedrock.send(new InvokeModelCommand({ modelId: MODEL, contentType: 'application/json', body: JSON.stringify(payload) }));
    const out = JSON.parse(new TextDecoder().decode(resp.body));
    const text = out.content?.[0]?.text || '';
    const arr = JSON.parse((text.match(/\[[\s\S]*\]/) || ['[]'])[0]);
    const scored = {};
    for (const s of arr) if (typeof s.doc_id !== 'undefined' && typeof s.score === 'number') scored[s.doc_id] = s.score;
    const vals = results.map(r => scored[r.doc_id] ?? 0);
    const rel = vals.filter(v => v >= RELEVANT).length;
    return { scored, precision: rel / results.length, n: results.length, relevant: rel, avg: vals.reduce((a, b) => a + b, 0) / vals.length };
  } catch (e) {
    return { scored: {}, precision: null, n: results.length, error: e.message };
  }
}

const rows = [];
let bN = 0, tN = 0, bSum = 0, tSum = 0, collapseN = 0, strictN = 0;
const pct = x => x == null ? ' n/a' : (x * 100).toFixed(0).padStart(3) + '%';
for (const { q, jk } of QUERIES) {
  try {
    const [base, treat] = await Promise.all([search(q, jk, true), search(q, jk, false)]);
    const [bj, tj] = await Promise.all([judge(q, base.results), judge(q, treat.results)]);
    if (treat.legs.fts_collapsed) collapseN++;
    if (treat.legs.strict_relevance_gate) strictN++;
    if (bj.precision != null) { bN++; bSum += bj.precision; }
    if (tj.precision != null) { tN++; tSum += tj.precision; }
    rows.push({ q: q.slice(0, 42), jk,
      base_n: base.results.length, base_p: bj.precision, base_avg: bj.avg,
      treat_n: treat.results.length, treat_p: tj.precision, treat_avg: tj.avg,
      collapsed: !!treat.legs.fts_collapsed, eval_ok: !!base.legs.eval_baseline,
      err: base.error || treat.error || null });
    console.log(`${pct(bj.precision)} → ${pct(tj.precision)}  [${base.results.length}/${treat.results.length}]  ${treat.legs.fts_collapsed ? 'COLLAPSE' : '        '}  ${base.error || treat.error ? '(' + (base.error || treat.error) + ') ' : ''}${q.slice(0, 48)}`);
  } catch (e) {
    console.log(` ERR  ${q.slice(0, 48)} :: ${e.message}`);
    rows.push({ q: q.slice(0, 42), jk, err: e.message });
  }
}

const bMean = bN ? bSum / bN : null, tMean = tN ? tSum / tN : null;
console.log('\n=== A/B summary (precision@10, judge score >= 7) ===');
console.log(`queries: ${QUERIES.length}  scored arms: base ${bN}, treat ${tN}  |  baseline mean: ${pct(bMean)}  treatment mean: ${pct(tMean)}  |  delta: ${bMean != null && tMean != null ? ((tMean - bMean) * 100).toFixed(1) + ' pp' : 'n/a'}`);
console.log(`FTS-collapse rate: ${collapseN}/${QUERIES.length}  |  strict-gate fired: ${strictN}/${QUERIES.length}  |  eval_baseline honored: ${rows.filter(r => r.eval_ok).length}/${rows.length}`);
console.log('\nJSON:', JSON.stringify({ rows, baseline_mean: bSum / bN, treatment_mean: tSum / tN }, null, 0));
