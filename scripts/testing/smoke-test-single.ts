/**
 * Smoke test: 1 direct call per user-facing tool via POST /api/tools/:toolName
 * Tests tool availability and basic functionality without LLM routing.
 */

import { execSync } from 'child_process';

const BASE_URL = 'http://localhost:3000';
const API_KEY = execSync(
  "docker exec secondlayer-app-local env | grep SECONDARY_LAYER_KEYS | cut -d= -f2 | cut -d, -f1"
).toString().trim();
const TIMEOUT_MS = 120_000;

interface ToolTest {
  tool: string;
  args: Record<string, any>;
}

const TESTS: ToolTest[] = [
  // Court Decisions (7)
  { tool: 'search_court_decisions', args: { mode: 'fulltext', query: 'визнання правочину недійсним', limit: 3 } },
  { tool: 'get_court_decision', args: { case_number: '904/3256/23' } },
  { tool: 'get_case_documents_chain', args: { case_number: '904/3256/23', max_docs: 3 } },
  { tool: 'analyze_case_pattern', args: { intent: 'стягнення моральної шкоди', query: 'трудові спори' } },
  { tool: 'count_cases_by_party', args: { party_name: 'Укрзалізниця' } },
  { tool: 'search_court_sessions', args: { query: '904/3256/23', source: 'opendata', limit: 3 } },
  { tool: 'search_court_case_status', args: { case_number: '904/3256/23' } },

  // EDRSR (2)
  { tool: 'edrsr_court_decisions_by_court', args: { court_code: '2890', fts_query: 'кредит', date_from: '2024-01-01', limit: 3 } },
  { tool: 'edrsr_get_decision_dispositive', args: { doc_id: '128060413' } },

  // Legislation (5)
  { tool: 'get_legislation_section', args: { query: 'ст. 16 ЦК' } },
  { tool: 'get_legislation_articles', args: { rada_id: '435-15', article_numbers: ['16'] } },
  { tool: 'get_legislation_structure', args: { rada_id: '435-15' } },
  { tool: 'get_legislation_history', args: { rada_id: '435-15' } },
  { tool: 'list_legislation_editions', args: { rada_id: '435-15' } },
  { tool: 'rada_search_legislation_text', args: { law_identifier: 'Цивільний кодекс', article: '625' } },
  { tool: 'search_legal_acts', args: { query: 'захист персональних даних', limit: 3 } },
  { tool: 'search_procedural_norms', args: { code: 'cpc', query: 'строки апеляції' } },
  { tool: 'search_legislation', args: { query: 'закон про ІТ', limit: 3 } },

  // Parliament (3)
  { tool: 'rada_search_parliament_bills', args: { query: 'штучний інтелект', limit: 3 } },
  { tool: 'rada_get_deputy_info', args: { name: 'Стефанчук' } },
  { tool: 'rada_analyze_voting_record', args: { deputy_name: 'Стефанчук' } },

  // OpenReyestr (18)
  { tool: 'openreyestr_search_entities', args: { query: 'Нова Пошта', limit: 3 } },
  { tool: 'openreyestr_get_by_edrpou', args: { edrpou: '32510235' } },
  { tool: 'openreyestr_search_beneficiaries', args: { query: 'Нова Пошта', limit: 3 } },
  { tool: 'openreyestr_search_debtors', args: { query: 'Рога і Копита', limit: 3 } },
  { tool: 'openreyestr_search_enforcement_proceedings', args: { query: 'Альфа', limit: 3 } },
  { tool: 'openreyestr_search_bankruptcy_cases', args: { query: 'Київ', limit: 3 } },
  { tool: 'openreyestr_search_prozorro', args: { query: 'Міноборони', limit: 3 } },
  { tool: 'openreyestr_search_rnbo_sanctions', args: { query: 'Яндекс', limit: 3 } },
  { tool: 'openreyestr_search_arma_seized_assets', args: { limit: 3 } },
  { tool: 'openreyestr_search_nazk_declarations', args: { declarant_name: 'Кличко', limit: 3 } },
  { tool: 'openreyestr_search_tax_debt', args: { query: 'Альфа', limit: 3 } },
  // openreyestr_search_vat_payers — excluded from proxy (served locally as search_vat_payers_registry, needs container rebuild)
  { tool: 'openreyestr_search_single_tax_payers', args: { query: 'Іванов', limit: 3 } },
  { tool: 'openreyestr_search_esv_debt', args: { query: 'Будівельник', limit: 3 } },
  { tool: 'openreyestr_search_notaries', args: { query: 'Львів', limit: 3 } },
  // openreyestr_search_court_experts — excluded from proxy (served locally, needs container rebuild)
  { tool: 'openreyestr_search_arbitration_managers', args: { query: 'Харків', limit: 3 } },
  { tool: 'openreyestr_search_termination_started', args: { query: 'Одеса', limit: 3 } },

  // ECHR (2)
  { tool: 'search_echr_practice', args: { query: 'fair trial', limit: 3 } },
  { tool: 'get_echr_document', args: { id: '001-139185' } },

  // Registries & Open Data (7)
  { tool: 'search_judges', args: { full_name: 'Іванов', limit: 3 } },
  { tool: 'search_edrnpa', args: { keywords: 'карантин', limit: 3 } },
  { tool: 'search_vkks', args: { category: 'judges', limit: 3 } },
  { tool: 'search_public_spending', args: { edrpou: '00015622', limit: 3 } },
  { tool: 'search_registry', args: { registry: 'public_organizations', filters: { query: 'Альфа' }, limit: 3 } },
  { tool: 'search_vrp_judges_discipline', args: { limit: 3 } },
  { tool: 'search_invalid_passports', args: { d_series: 'АА', d_number: '000001', limit: 3 } },

  // Legal Analysis (6)
  { tool: 'search_legal_precedents', args: { query: 'позовна давність', limit: 3 } },
  { tool: 'compare_practice_pro_contra', args: { procedure_code: 'cpc', query: 'моральна шкода без доказів' } },
  { tool: 'find_similar_fact_pattern_cases', args: { procedure_code: 'cpc', facts_text: 'орендар не платив оренду 6 місяців' } },
  { tool: 'calculate_procedural_deadlines', args: { procedure_code: 'gpc', event_date: '2024-06-01', appeal_type: 'апеляція' } },
  { tool: 'calculate_monetary_claims', args: { amount: 100000, date_from: '2024-01-01', date_to: '2024-07-01' } },
  { tool: 'get_citation_graph', args: { case_id: '904/3256/23' } },

  // India (2)
  { tool: 'search_india_supreme_court', args: { query: 'contract law', limit: 3 } },
  { tool: 'search_india_high_courts', args: { query: 'intellectual property', limit: 3 } },

  // Data Analysis (1)
  { tool: 'analyze_data', args: { sql: 'SELECT COUNT(*) as total FROM edrsr_documents LIMIT 1' } },

  // Semantic search (1)
  { tool: 'semantic_search', args: { query: 'захист прав споживачів', limit: 3 } },
];

interface TestResult {
  tool: string;
  status: 'ok' | 'error' | 'timeout' | 'empty';
  timeMs: number;
  preview: string;
  error?: string;
}

async function callTool(test: ToolTest): Promise<TestResult> {
  const start = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${BASE_URL}/api/tools/${test.tool}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
      },
      body: JSON.stringify(test.args),
      signal: controller.signal,
    });

    clearTimeout(timeout);
    const timeMs = Date.now() - start;

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      const msg = body.slice(0, 200);
      return { tool: test.tool, status: 'error', timeMs, preview: '', error: `HTTP ${res.status}: ${msg}` };
    }

    const json = await res.json();
    const resultText = json.result?.content?.[0]?.text || JSON.stringify(json.result || json).slice(0, 300);

    if (!resultText || resultText === '{}' || resultText === '[]') {
      return { tool: test.tool, status: 'empty', timeMs, preview: '(empty result)' };
    }

    return { tool: test.tool, status: 'ok', timeMs, preview: resultText.replace(/\n/g, ' ').slice(0, 80) };
  } catch (err: any) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      return { tool: test.tool, status: 'timeout', timeMs: TIMEOUT_MS, preview: '', error: 'Timeout' };
    }
    return { tool: test.tool, status: 'error', timeMs: Date.now() - start, preview: '', error: err.message };
  }
}

async function main() {
  console.log(`\nSmoke test: ${TESTS.length} tools via POST /api/tools/:toolName\n`);
  console.log('─'.repeat(130));
  console.log(
    `${'#'.padEnd(3)} ${'Tool'.padEnd(45)} ${'Status'.padEnd(10)} ${'Time'.padEnd(10)} Preview`
  );
  console.log('─'.repeat(130));

  const results: TestResult[] = [];

  for (let i = 0; i < TESTS.length; i++) {
    const test = TESTS[i];
    const result = await callTool(test);
    results.push(result);

    const icon = result.status === 'ok' ? '\x1b[32m✓' : result.status === 'empty' ? '\x1b[33m○' : '\x1b[31m✗';
    const preview = result.status === 'error' ? (result.error || '').slice(0, 70) : result.preview.slice(0, 70);
    console.log(
      `${String(i + 1).padEnd(3)} ${test.tool.padEnd(45)} ${icon} ${result.status.padEnd(8)}\x1b[0m ${String(result.timeMs + 'ms').padEnd(10)} ${preview}`
    );

    if (i < TESTS.length - 1) await new Promise(r => setTimeout(r, 500));
  }

  console.log('─'.repeat(130));

  const ok = results.filter(r => r.status === 'ok').length;
  const empty = results.filter(r => r.status === 'empty').length;
  const errors = results.filter(r => r.status === 'error').length;
  const timeouts = results.filter(r => r.status === 'timeout').length;
  const avgMs = Math.round(results.reduce((s, r) => s + r.timeMs, 0) / results.length);

  console.log(`\nSummary: ${ok} ok, ${empty} empty, ${errors} errors, ${timeouts} timeouts (avg ${avgMs}ms)`);

  if (errors > 0 || timeouts > 0) {
    console.log(`\nFailures:`);
    for (const r of results.filter(r => r.status === 'error' || r.status === 'timeout')) {
      console.log(`  ${r.tool}: ${r.error}`);
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
