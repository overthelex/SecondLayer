/**
 * Load & Quality Test for lexwebapp chat pipeline
 * Tests Bedrock Haiku under concurrent load across all user-facing tools.
 *
 * Usage: npx tsx scripts/testing/load-test-quality.ts
 * Env:   LOAD_TEST_BASE_URL (default: https://local.legal.org.ua)
 */

import pg from 'pg';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { randomUUID } from 'crypto';
import { Dashboard, type ResultEntry } from './tui-dashboard.ts';

dotenv.config({ path: new URL('../../mcp_backend/.env', import.meta.url).pathname });

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const BASE_URL = process.env.LOAD_TEST_BASE_URL || 'http://localhost:3000';
const JWT_SECRET = process.env.JWT_SECRET || 'local-dev-jwt-secret-change-in-production';
const DB_CONFIG = {
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  database: process.env.POSTGRES_DB || 'secondlayer_local',
  user: process.env.POSTGRES_USER || 'secondlayer',
  password: process.env.POSTGRES_PASSWORD || 'local_dev_password',
};
const TEST_USER_PASSWORD = 'LoadTest2026!';
const TEST_USER_COUNT = 10;
const INITIAL_BALANCE_USD = 100.0;
const BUDGET_ARG = process.argv.find(a => a.startsWith('--budget='))?.split('=')[1];
const BUDGET = BUDGET_ARG || 'standard';
const MODEL_ARG = process.argv.find(a => a.startsWith('--model='))?.split('=')[1];
const FORCE_MODEL = MODEL_ARG || '';  // e.g. --model=haiku forces all tiers to Haiku
const REQUEST_TIMEOUT_MS = 240_000;
const BATCH_SIZE_SIMPLE = 10;
const BATCH_SIZE_COMPLEX = 5;
const PAUSE_BETWEEN_BATCHES_MS = 3_000;
const PAUSE_BETWEEN_BATCHES_COMPLEX_MS = 8_000;
const PAUSE_BETWEEN_PHASES_MS = 30_000;
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 3_000;
const INTERNAL_TOOLS = new Set(['_init', '_classify', '_summarize', 'request_additional_tools']);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TestUser {
  email: string;
  userId: string;
  name: string;
  jwt: string;
}

interface QueryEntry {
  tool: string;
  simple: string;
  complex: string;
}

interface SSEResult {
  responseId: string | null;
  answer: string;
  toolsUsed: string[];
  thinkingSteps: number;
  totalCostUsd: number;
  chargedUsd: number;
  conversationId: string | null;
  status: 'success' | 'error' | 'timeout' | 'no_answer';
  errorMessage: string | null;
  firstByteMs: number;
  totalMs: number;
  events: Array<{ type: string; data: any; ts: number }>;
}

// ---------------------------------------------------------------------------
// Query Catalog — 45 tools x 2 queries
// ---------------------------------------------------------------------------

const QUERY_CATALOG: QueryEntry[] = [
  // Court Decisions (7)
  { tool: 'search_court_decisions', simple: 'Рішення ВС 2024 про визнання правочину недійсним', complex: 'КГС ВС стягнення упущеної вигоди за договором поставки 2023-2024 де позов задоволено' },
  { tool: 'get_court_decision', simple: 'Покажи повний текст рішення у справі 904/3256/23', complex: 'Покажи мотивувальну та резолютивну частину рішення у справі 910/5678/24 з аналізом' },
  { tool: 'get_case_documents_chain', simple: 'Всі документи по справі 904/3256/23', complex: 'Повна хронологія справи 910/1234/24 по всіх інстанціях від першої до касації' },
  { tool: 'analyze_case_pattern', simple: 'Практика стягнення моральної шкоди у трудових спорах', complex: 'Аналіз паттернів практики ВС щодо стягнення збитків за порушення авторських прав: аргументи сторін, ризики, статистика задоволення' },
  { tool: 'count_cases_by_party', simple: 'Скільки справ у ПАТ Укрзалізниця', complex: 'Скільки справ у ТОВ Епіцентр К за 2023-2024 по категоріях: господарські, цивільні, адміністративні' },
  { tool: 'search_court_sessions', simple: 'Засідання суду по справі 904/3256/23', complex: 'Всі найближчі засідання Господарського суду м. Києва за участю АТ Ощадбанк' },
  { tool: 'search_court_case_status', simple: 'Статус справи 904/3256/23', complex: 'Статус та хронологія руху справи 910/1234/24 по всіх інстанціях' },

  // EDRSR Search (4)
  { tool: 'search_edrsr_decisions', simple: 'Рішення суддів Київського апеляційного суду за 2024 рік', complex: 'Рішення КГС ВС у категорії корпоративних спорів про виключення учасника з ТОВ за 2023-2024' },
  { tool: 'search_edrsr_fulltext', simple: 'Судові рішення про самовільне будівництво', complex: 'Рішення де визнано недійсним договір оренди земельної ділянки через порушення порядку узгодження з ОМС' },
  { tool: 'edrsr_hybrid_search', simple: 'Стягнення боргу за кредитним договором', complex: 'Судова практика щодо визнання недійсним договору іпотеки укладеного без згоди подружжя з аналізом правових позицій' },
  { tool: 'search_court_decisions_semantic', simple: 'Справи про захист честі та гідності', complex: 'Практика щодо відповідальності інтернет-провайдерів за розповсюдження недостовірної інформації користувачами' },

  // Legislation (3)
  { tool: 'rada_search_legislation_text', simple: 'Стаття 16 Цивільного кодексу України', complex: 'Порівняй статті 203 та 215 ЦК щодо підстав недійсності правочинів та наведи судову практику застосування' },
  { tool: 'search_legal_acts', simple: 'Закон про захист персональних даних', complex: 'Знайди всі нормативні акти що регулюють криптовалюту в Україні: закони, постанови НБУ, рішення НКЦПФР' },
  { tool: 'search_procedural_norms', simple: 'Строки подання апеляції у ЦПК', complex: 'Порівняй порядок забезпечення позову в ГПК та ЦПК з прикладами судової практики' },

  // Parliament (3)
  { tool: 'rada_search_parliament_bills', simple: 'Законопроекти про штучний інтелект', complex: 'Які законопроекти про регулювання криптовалют та цифрових активів розглядалися у ВРУ за останній рік та їх статус' },
  { tool: 'rada_get_deputy_info', simple: 'Інформація про народного депутата Стефанчук', complex: 'Повна інформація про депутата Стефанчук: комітети, фракція, законопроекти, голосування' },
  { tool: 'rada_analyze_voting_record', simple: 'Голосування за закон про мобілізацію', complex: 'Аналіз голосувань фракції Слуга Народу за законопроекти у сфері оборони за 2024 рік' },

  // OpenReyestr (10)
  { tool: 'openreyestr_search_entities', simple: 'Знайди компанію Нова Пошта в реєстрі', complex: 'Всі компанії з назвою Приватбанк, їх статус та дата реєстрації' },
  { tool: 'openreyestr_get_by_edrpou', simple: 'ЄДРПОУ 32510235', complex: 'Повна інформація за ЄДРПОУ 32510235 включно з бенефіціарами та видами діяльності' },
  { tool: 'openreyestr_search_beneficiaries', simple: 'Бенефіціари Нової Пошти', complex: 'Знайди всіх бенефіціарних власників компаній де фігурує прізвище Ахметов' },
  { tool: 'openreyestr_search_debtors', simple: 'Чи є ТОВ Рога і Копита у реєстрі боржників', complex: 'Знайди всі компанії-боржники у Харківській області з сумою боргу понад 1 мільйон' },
  { tool: 'openreyestr_search_enforcement_proceedings', simple: 'Виконавчі провадження по ТОВ Альфа', complex: 'Знайди всі виконавчі провадження проти ПАТ Укрзалізниця за 2024 рік' },
  { tool: 'openreyestr_search_bankruptcy_cases', simple: 'Справи про банкрутство у Києві', complex: 'Справи про банкрутство будівельних компаній за 2023-2024 з деталями процедури' },
  { tool: 'openreyestr_search_prozorro', simple: 'Тендери Міноборони за 2024', complex: 'Тендери на закупівлю IT-послуг державними органами на суму понад 10 мільйонів за 2024' },
  { tool: 'openreyestr_search_rnbo_sanctions', simple: 'Перевір компанію Яндекс у санкціях РНБО', complex: 'Всі фізичні та юридичні особи під санкціями РНБО повязані з Росією у банківській сфері' },
  { tool: 'openreyestr_search_arma_seized_assets', simple: 'Арештоване майно АРМА', complex: 'Знайди всі арештовані активи повязані з російськими компаніями в енергетичному секторі' },
  { tool: 'openreyestr_search_nazk_declarations', simple: 'Декларація мера Києва', complex: 'Знайди декларації посадовців Міноборони за 2023-2024 з найбільшим задекларованим доходом' },

  // ECHR (2)
  { tool: 'search_echr_practice', simple: 'Практика ЄСПЛ про право на справедливий суд', complex: 'Рішення ЄСПЛ проти України щодо порушення статті 6 Конвенції про розумні строки розгляду цивільних справ та тенденції' },
  { tool: 'get_echr_document', simple: 'Рішення ЄСПЛ у справі Україна проти Росії', complex: 'Повний текст рішення ЄСПЛ у справі Бурмич та інші проти України 2017' },

  // Registries & Open Data (6)
  { tool: 'search_judges', simple: 'Інформація про суддю Іванов', complex: 'Всі судді Господарського суду м. Києва та їх кваліфікація' },
  { tool: 'search_nbu_banks', simple: 'Банки з ліцензією НБУ', complex: 'Які банки втратили ліцензію НБУ за останні 3 роки' },
  { tool: 'search_edrnpa', simple: 'Знайди постанову КМУ про карантин', complex: 'Всі нормативні акти щодо воєнного стану прийняті у 2024' },
  { tool: 'search_vkks', simple: 'Оцінювання суддів ВККС', complex: 'Результати кваліфікаційного оцінювання суддів апеляційних судів' },
  { tool: 'search_public_spending', simple: 'Публічні закупівлі Мінюсту', complex: 'Всі контракти Міноборони на IT-послуги за 2024 з сумами та постачальниками' },
  { tool: 'search_registry', simple: 'Перевір компанію ТОВ Альфа у реєстрах', complex: 'Комплексна перевірка ПАТ Укрзалізниця: реєстр, борги, санкції, виконавчі провадження' },

  // Legal Analysis (6)
  { tool: 'search_legal_precedents', simple: 'Правові позиції ВС щодо позовної давності', complex: 'Прецеденти Великої Палати ВС щодо земельних спорів: порівняння позитивної та негативної практики 2023-2024' },
  { tool: 'compare_practice_pro_contra', simple: 'Практика за і проти стягнення моральної шкоди без доказів', complex: 'Знайди аргументи за і проти визнання договору дарування недійсним з підстав удаваності при наявності зустрічного виконання' },
  { tool: 'find_similar_fact_pattern_cases', simple: 'Справи де орендар не платив оренду 6 місяців', complex: 'Знайди справи подібні до: директор ТОВ підписав договір поруки від імені товариства без згоди учасників, поручитель оскаржує' },
  { tool: 'calculate_procedural_deadlines', simple: 'Строки апеляції в господарському процесі', complex: 'Розрахуй всі строки для позову про недійсність договору: давність, апеляція, касація з урахуванням воєнного стану' },
  { tool: 'calculate_monetary_claims', simple: 'Розрахуй 3% річних та інфляційні за борг 100000 грн за 6 місяців', complex: 'Розрахуй повну суму позову: основний борг 500000 грн, пеня 0.5% за день, 3% річних, інфляційні з 01.01.2024 по сьогодні' },
  { tool: 'get_citation_graph', simple: 'Цитування рішення ВС у справі 904/3256/23', complex: 'Побудуй граф цитувань між рішеннями ВС щодо визнання правочинів недійсними за ст. 234 ЦК за 2023-2024' },

  // OSINT (4)
  { tool: 'osint_search_sanctions', simple: 'Перевір Іванова Петра у санкціях', complex: 'Перевір компанію Газпром та її керівництво у глобальних санкційних списках: ЄС, США, Великобританія' },
  { tool: 'osint_search_interpol', simple: 'Перевір Іванова у розшуку Інтерполу', complex: 'Пошук у червоних картках Інтерполу осіб повязаних з фінансовими злочинами з України' },
  { tool: 'osint_search_corporate_registry', simple: 'Перевір компанію у GLEIF реєстрі', complex: 'Знайди у GLEIF та ICIJ Offshore Leaks офшорні компанії повязані з українськими політиками' },
  { tool: 'osint_search_media_mentions', simple: 'Згадки Нафтогазу у світових ЗМІ', complex: 'Аналіз згадок України у глобальних медіа GDELT за останній місяць: тональність, теми, тенденції' },
];

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

const MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS load_test_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_run_id VARCHAR(100) NOT NULL,
  wave VARCHAR(20) NOT NULL,
  user_email VARCHAR(255) NOT NULL,
  user_id UUID,
  query TEXT NOT NULL,
  expected_tool VARCHAR(200),
  tool_triggered VARCHAR(200),
  tools_used JSONB DEFAULT '[]',
  response_text TEXT,
  response_time_ms INTEGER,
  first_byte_ms INTEGER,
  tokens_used INTEGER,
  cost_usd DECIMAL(10,6),
  charged_usd DECIMAL(10,6),
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  error_message TEXT,
  thinking_steps INTEGER DEFAULT 0,
  response_id VARCHAR(255),
  conversation_id UUID,
  raw_events JSONB DEFAULT '[]',
  quality_score VARCHAR(30),
  quality_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_load_test_run ON load_test_results(test_run_id);
CREATE INDEX IF NOT EXISTS idx_load_test_status ON load_test_results(status);
CREATE INDEX IF NOT EXISTS idx_load_test_created ON load_test_results(created_at DESC);
ALTER TABLE load_test_results ADD COLUMN IF NOT EXISTS quality_score VARCHAR(30);
ALTER TABLE load_test_results ADD COLUMN IF NOT EXISTS quality_reason TEXT;
`;

async function ensureResultsTable(pool: pg.Pool): Promise<void> {
  await pool.query(MIGRATION_SQL);
  console.log('[DB] load_test_results table ready');
}

async function insertResult(pool: pg.Pool, r: Record<string, any>): Promise<void> {
  await pool.query(
    `INSERT INTO load_test_results
     (test_run_id, wave, user_email, user_id, query, expected_tool,
      tool_triggered, tools_used, response_text, response_time_ms,
      first_byte_ms, cost_usd, charged_usd, status, error_message,
      thinking_steps, response_id, conversation_id, raw_events,
      quality_score, quality_reason)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,
    [
      r.testRunId, r.wave, r.userEmail, r.userId,
      r.query, r.expectedTool,
      r.toolTriggered, JSON.stringify(r.toolsUsed),
      (r.responseText || '').substring(0, 50000),
      r.responseTimeMs, r.firstByteMs,
      r.costUsd, r.chargedUsd,
      r.status, r.errorMessage,
      r.thinkingSteps, r.responseId,
      r.conversationId, JSON.stringify(r.rawEvents),
      r.qualityScore || null, r.qualityReason || null,
    ]
  );
}

// ---------------------------------------------------------------------------
// User management
// ---------------------------------------------------------------------------

async function createTestUsers(pool: pg.Pool): Promise<TestUser[]> {
  const users: TestUser[] = [];
  const passwordHash = await bcrypt.hash(TEST_USER_PASSWORD, 10);

  for (let i = 1; i <= TEST_USER_COUNT; i++) {
    const email = `loadtest-user-${String(i).padStart(2, '0')}@test.local`;
    const name = `Load Test User ${i}`;

    const userResult = await pool.query(
      `INSERT INTO users (email, name, password_hash, email_verified, is_beta_tester)
       VALUES ($1, $2, $3, TRUE, TRUE)
       ON CONFLICT (email) DO UPDATE SET
         password_hash = $3, email_verified = TRUE, is_beta_tester = TRUE,
         updated_at = NOW()
       RETURNING id`,
      [email, name, passwordHash]
    );
    const userId = userResult.rows[0].id;

    await pool.query(
      `INSERT INTO user_billing (user_id, balance_usd, balance_uah, daily_limit_usd,
         monthly_limit_usd, total_spent_usd, total_requests, is_active, billing_enabled)
       VALUES ($1, $2, 0, 100.00, 1000.00, 0, 0, TRUE, TRUE)
       ON CONFLICT (user_id) DO UPDATE SET
         balance_usd = $2, is_active = TRUE, billing_enabled = TRUE`,
      [userId, INITIAL_BALANCE_USD]
    );

    await pool.query(
      `INSERT INTO user_credits (user_id, balance, total_earned, total_spent)
       VALUES ($1, $2, 0, 0)
       ON CONFLICT (user_id) DO UPDATE SET balance = $2`,
      [userId, INITIAL_BALANCE_USD]
    );

    const token = jwt.sign(
      { userId, email, googleId: null },
      JWT_SECRET,
      { expiresIn: '2h', algorithm: 'HS256' }
    );

    users.push({ email, userId, name, jwt: token });
  }

  console.log(`[Users] Created ${users.length} test users with $${INITIAL_BALANCE_USD} balance`);
  return users;
}

async function deleteTestUsers(pool: pg.Pool): Promise<void> {
  await pool.query('BEGIN');
  try {
    // audit_log has DO INSTEAD NOTHING rules preventing DELETE — temporarily drop
    await pool.query('DROP RULE IF EXISTS no_delete_audit_log ON audit_log');
    await pool.query(
      `DELETE FROM audit_log WHERE user_id IN
       (SELECT id FROM users WHERE email LIKE 'loadtest-user-%@test.local')`
    );
    await pool.query(
      'CREATE RULE no_delete_audit_log AS ON DELETE TO audit_log DO INSTEAD NOTHING'
    );
    const result = await pool.query(
      `DELETE FROM users WHERE email LIKE 'loadtest-user-%@test.local' RETURNING email`
    );
    await pool.query('COMMIT');
    console.log(`[Users] Deleted ${result.rowCount} test users (results preserved in load_test_results)`);
  } catch (err: any) {
    await pool.query('ROLLBACK');
    console.error(`[Users] Cleanup failed: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// SSE Client
// ---------------------------------------------------------------------------

async function sendChatQuery(baseUrl: string, token: string, query: string): Promise<SSEResult> {
  const startTime = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  const result: SSEResult = {
    responseId: null,
    answer: '',
    toolsUsed: [],
    thinkingSteps: 0,
    totalCostUsd: 0,
    chargedUsd: 0,
    conversationId: null,
    status: 'no_answer',
    errorMessage: null,
    firstByteMs: 0,
    totalMs: 0,
    events: [],
  };

  try {
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ query, budget: BUDGET, ...(FORCE_MODEL ? { maxBudget: FORCE_MODEL } : {}) }),
      signal: controller.signal,
    });

    if (!response.ok) {
      result.status = 'error';
      result.errorMessage = `HTTP ${response.status}: ${await response.text()}`;
      result.totalMs = Date.now() - startTime;
      return result;
    }

    result.firstByteMs = Date.now() - startTime;

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let currentEvent = '';
    let currentData = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith(':')) continue;
        if (line.startsWith('event: ')) {
          currentEvent = line.slice(7).trim();
        } else if (line.startsWith('data: ')) {
          currentData = line.slice(6);
        } else if (line === '' && currentEvent && currentData) {
          try {
            const data = JSON.parse(currentData);
            result.events.push({ type: currentEvent, data, ts: Date.now() - startTime });

            switch (currentEvent) {
              case 'response_id':
                result.responseId = data.response_id;
                break;
              case 'thinking':
                result.thinkingSteps++;
                if (data.tool && !INTERNAL_TOOLS.has(data.tool)) {
                  result.toolsUsed.push(data.tool);
                }
                break;
              case 'tool_result':
                if (data.tool && !INTERNAL_TOOLS.has(data.tool)) {
                  result.toolsUsed.push(data.tool);
                }
                break;
              case 'tool_call':
                if (data.name || data.tool) {
                  const toolName = data.name || data.tool;
                  if (!INTERNAL_TOOLS.has(toolName)) {
                    result.toolsUsed.push(toolName);
                  }
                }
                break;
              case 'decision':
                if (data.tools_to_call) {
                  for (const t of data.tools_to_call) {
                    const name = typeof t === 'string' ? t : t.name;
                    if (name && !INTERNAL_TOOLS.has(name)) result.toolsUsed.push(name);
                  }
                }
                break;
              case 'answer':
                if (data.text) result.answer = data.text;
                else if (data.content) result.answer = data.content;
                result.status = 'success';
                break;
              case 'complete':
                result.totalCostUsd = data.total_cost_usd || 0;
                if (data.conversationId) result.conversationId = data.conversationId;
                if (data.tools_used) {
                  result.toolsUsed = [...new Set([...result.toolsUsed, ...data.tools_used])];
                }
                if (data.answer && !result.answer) {
                  result.answer = data.answer;
                }
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
          } catch {
            // skip malformed JSON
          }
          currentEvent = '';
          currentData = '';
        }
      }
    }
  } catch (err: any) {
    if (err.name === 'AbortError') {
      result.status = 'timeout';
      result.errorMessage = `Timeout after ${REQUEST_TIMEOUT_MS}ms`;
    } else {
      result.status = 'error';
      result.errorMessage = err.message;
    }
  } finally {
    clearTimeout(timeout);
    result.totalMs = Date.now() - startTime;
    result.toolsUsed = [...new Set(result.toolsUsed)];
  }

  return result;
}

// ---------------------------------------------------------------------------
// Retry wrapper
// ---------------------------------------------------------------------------

async function sendChatQueryWithRetry(
  baseUrl: string,
  token: string,
  query: string
): Promise<SSEResult> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const result = await sendChatQuery(baseUrl, token, query);

    if (result.status === 'success' || result.status === 'no_answer') {
      return result;
    }

    const isRetryable =
      result.errorMessage?.includes('429') ||
      result.errorMessage?.includes('fetch failed') ||
      result.errorMessage?.includes('ECONNRESET') ||
      result.status === 'timeout';

    if (!isRetryable || attempt === MAX_RETRIES) {
      return result;
    }

    const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
    console.log(`      [retry ${attempt}/${MAX_RETRIES}] ${result.errorMessage?.substring(0, 50)}... waiting ${delay / 1000}s`);
    await sleep(delay);
  }

  return { responseId: null, answer: '', toolsUsed: [], thinkingSteps: 0, totalCostUsd: 0, chargedUsd: 0, conversationId: null, status: 'error', errorMessage: 'max retries exceeded', firstByteMs: 0, totalMs: 0, events: [] };
}

// ---------------------------------------------------------------------------
// Wave runner
// ---------------------------------------------------------------------------

interface QueryAssignment {
  query: string;
  expectedTool: string;
  userIndex: number;
}

async function runBatch(
  batchNum: number,
  wave: 'simple' | 'complex',
  assignments: QueryAssignment[],
  users: TestUser[],
  pool: pg.Pool,
  testRunId: string,
  dashboard: Dashboard | null
): Promise<{ succeeded: number; failed: number }> {
  if (!dashboard) console.log(`\n  [Batch ${batchNum}] ${assignments.length} queries (${wave})`);

  const promises = assignments.map(async (a) => {
    const user = users[a.userIndex % users.length];
    const shortQuery = a.query.length > 60 ? a.query.substring(0, 60) + '...' : a.query;
    if (!dashboard) console.log(`    [${user.email.split('@')[0]}] -> ${a.expectedTool}: ${shortQuery}`);

    const result = await sendChatQueryWithRetry(BASE_URL, user.jwt, a.query);

    const primaryTool = result.toolsUsed.length > 0 ? result.toolsUsed[0] : null;

    dashboard?.recordResult({
      tool: a.expectedTool,
      status: result.status === 'success' ? 'success' : result.status === 'timeout' ? 'timeout' : 'error',
      timeMs: result.totalMs,
      cost: result.totalCostUsd,
      errorMsg: result.errorMessage?.substring(0, 30),
    });

    await insertResult(pool, {
      testRunId,
      wave,
      userEmail: user.email,
      userId: user.userId,
      query: a.query,
      expectedTool: a.expectedTool,
      toolTriggered: primaryTool,
      toolsUsed: result.toolsUsed,
      responseText: result.answer,
      responseTimeMs: result.totalMs,
      firstByteMs: result.firstByteMs,
      costUsd: result.totalCostUsd,
      chargedUsd: result.chargedUsd,
      status: result.status,
      errorMessage: result.errorMessage,
      thinkingSteps: result.thinkingSteps,
      responseId: result.responseId,
      conversationId: result.conversationId,
      rawEvents: result.events,
    });

    const icon = result.status === 'success' ? 'OK' : result.status === 'timeout' ? 'TIMEOUT' : 'ERR';
    if (!dashboard) console.log(`    [${user.email.split('@')[0]}] ${icon} ${result.totalMs}ms cost=$${result.totalCostUsd.toFixed(4)} tools=[${result.toolsUsed.join(',')}]`);

    return result;
  });

  const results = await Promise.allSettled(promises);
  let succeeded = 0;
  let failed = 0;
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value.status === 'success') succeeded++;
    else failed++;
  }

  if (!dashboard) console.log(`  [Batch ${batchNum}] Done: ${succeeded} ok, ${failed} failed`);
  return { succeeded, failed };
}

async function runPhase(
  wave: 'simple' | 'complex',
  users: TestUser[],
  pool: pg.Pool,
  testRunId: string,
  dashboard: Dashboard | null
): Promise<void> {
  dashboard?.setWave(wave);
  if (!dashboard) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`  PHASE: ${wave.toUpperCase()} (${QUERY_CATALOG.length} queries)`);
    console.log(`${'='.repeat(60)}`);
  }

  const allAssignments: QueryAssignment[] = QUERY_CATALOG.map((q, i) => ({
    query: wave === 'simple' ? q.simple : q.complex,
    expectedTool: q.tool,
    userIndex: i,
  }));

  const batchSize = wave === 'simple' ? BATCH_SIZE_SIMPLE : BATCH_SIZE_COMPLEX;
  const batchPause = wave === 'simple' ? PAUSE_BETWEEN_BATCHES_MS : PAUSE_BETWEEN_BATCHES_COMPLEX_MS;
  const totalBatches = Math.ceil(allAssignments.length / batchSize);

  let batchNum = 1;
  for (let offset = 0; offset < allAssignments.length; offset += batchSize) {
    const batch = allAssignments.slice(offset, offset + batchSize);
    dashboard?.setBatch(batchNum, totalBatches, batch.map(a => a.expectedTool));
    await runBatch(batchNum, wave, batch, users, pool, testRunId, dashboard);
    batchNum++;

    if (offset + batchSize < allAssignments.length) {
      if (!dashboard) console.log(`  ... pause ${batchPause / 1000}s ...`);
      await sleep(batchPause);
    }
  }
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

async function printSummary(pool: pg.Pool, testRunId: string): Promise<void> {
  console.log(`\n${'='.repeat(60)}`);
  console.log('  SUMMARY');
  console.log(`${'='.repeat(60)}\n`);

  const byWave = await pool.query(`
    SELECT wave,
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE status = 'success') as success,
      COUNT(*) FILTER (WHERE status = 'error') as errors,
      COUNT(*) FILTER (WHERE status = 'timeout') as timeouts,
      ROUND(AVG(response_time_ms)) as avg_ms,
      MAX(response_time_ms) as max_ms,
      MIN(response_time_ms) as min_ms,
      ROUND(AVG(cost_usd)::numeric, 4) as avg_cost,
      ROUND(SUM(cost_usd)::numeric, 4) as total_cost
    FROM load_test_results WHERE test_run_id = $1
    GROUP BY wave ORDER BY wave
  `, [testRunId]);

  console.log('By wave:');
  console.log('-'.repeat(100));
  console.log('Wave     | Total | OK  | Err | Timeout | Avg ms | Max ms | Min ms | Avg cost | Total cost');
  console.log('-'.repeat(100));
  for (const row of byWave.rows) {
    console.log(
      `${row.wave.padEnd(8)} | ${String(row.total).padStart(5)} | ${String(row.success).padStart(3)} | ${String(row.errors).padStart(3)} | ${String(row.timeouts).padStart(7)} | ${String(row.avg_ms).padStart(6)} | ${String(row.max_ms).padStart(6)} | ${String(row.min_ms).padStart(6)} | $${String(row.avg_cost).padStart(7)} | $${String(row.total_cost).padStart(9)}`
    );
  }

  const routing = await pool.query(`
    SELECT expected_tool,
      tool_triggered,
      tools_used,
      status,
      wave,
      response_time_ms as ms
    FROM load_test_results WHERE test_run_id = $1 AND status = 'success'
    ORDER BY wave, expected_tool
  `, [testRunId]);

  console.log('\nTool routing:');
  console.log('-'.repeat(100));
  console.log('Wave     | Expected Tool                    | Tools Used                             | Match | ms');
  console.log('-'.repeat(100));
  let exactMatch = 0;
  let containsMatch = 0;
  for (const row of routing.rows) {
    const toolsUsed: string[] = row.tools_used || [];
    const isExact = row.expected_tool === row.tool_triggered;
    const isContains = toolsUsed.includes(row.expected_tool);
    if (isExact) exactMatch++;
    if (isContains) containsMatch++;
    const match = isExact ? 'EXACT' : isContains ? 'YES' : 'NO';
    const toolsStr = toolsUsed.slice(0, 3).join(',') + (toolsUsed.length > 3 ? '...' : '');
    console.log(
      `${(row.wave || '').padEnd(8)} | ${(row.expected_tool || '').padEnd(32)} | ${toolsStr.padEnd(38)} | ${match.padStart(5)} | ${String(row.ms || 0).padStart(6)}`
    );
  }
  const total = routing.rows.length;
  console.log(`\nRouting accuracy: exact=${exactMatch}/${total} (${total > 0 ? Math.round(exactMatch/total*100) : 0}%) | contains=${containsMatch}/${total} (${total > 0 ? Math.round(containsMatch/total*100) : 0}%)`);

  const totals = await pool.query(`
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE status = 'success') as success,
      ROUND(SUM(cost_usd)::numeric, 4) as total_cost,
      ROUND(SUM(charged_usd)::numeric, 4) as total_charged
    FROM load_test_results WHERE test_run_id = $1
  `, [testRunId]);

  const t = totals.rows[0];
  console.log(`\nTotals: ${t.success}/${t.total} succeeded | Cost: $${t.total_cost} | Charged: $${t.total_charged}`);

  const quality = await pool.query(`
    SELECT quality_score, COUNT(*) as cnt
    FROM load_test_results WHERE test_run_id = $1 AND quality_score IS NOT NULL
    GROUP BY quality_score ORDER BY cnt DESC
  `, [testRunId]);

  if (quality.rows.length > 0) {
    console.log('\nQuality scores:');
    for (const row of quality.rows) {
      console.log(`  ${row.quality_score}: ${row.cnt}`);
    }
  }

  console.log(`\nTest run ID: ${testRunId}`);
}

// ---------------------------------------------------------------------------
// Pre-flight checks
// ---------------------------------------------------------------------------

async function preflightCheck(baseUrl: string, token: string): Promise<void> {
  console.log('[Preflight] Checking backend health...');

  // 1. Health endpoint
  try {
    const healthResp = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(10_000) });
    if (!healthResp.ok) {
      throw new Error(`Health check failed: HTTP ${healthResp.status}`);
    }
    const health = await healthResp.json() as Record<string, any>;
    console.log(`[Preflight] Health OK: ${JSON.stringify(health).substring(0, 200)}`);
  } catch (err: any) {
    throw new Error(`Backend unreachable at ${baseUrl}: ${err.message}`);
  }

  // 2. Auth check — send a minimal chat query to verify JWT + API key chain
  console.log('[Preflight] Verifying auth + LLM API key with test query...');
  const testResult = await sendChatQuery(baseUrl, token, 'тест');
  if (testResult.status === 'error') {
    if (testResult.errorMessage?.includes('401')) {
      throw new Error(`API key invalid: ${testResult.errorMessage}`);
    }
    if (testResult.errorMessage?.includes('429') && testResult.errorMessage?.includes('not active')) {
      throw new Error(`LLM account not active: ${testResult.errorMessage}`);
    }
    // 429 quota is ok — just means rate limit, key itself works
    if (testResult.errorMessage?.includes('429')) {
      console.log('[Preflight] Got rate limit (429) — key is valid, quota will recover');
      return;
    }
    console.warn(`[Preflight] Warning: test query failed: ${testResult.errorMessage?.substring(0, 100)}`);
  } else {
    console.log(`[Preflight] Auth OK — test query returned in ${testResult.totalMs}ms`);
  }
}

// ---------------------------------------------------------------------------
// Quality scoring (Bedrock Claude Haiku)
// ---------------------------------------------------------------------------

import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';

const GRADING_MODEL = process.env.BEDROCK_GRADING_MODEL || 'eu.anthropic.claude-haiku-4-5-20251001-v1:0';
const AWS_REGION = process.env.AWS_REGION || 'eu-central-1';

interface QualityScore {
  score: 'relevant' | 'partially_relevant' | 'not_relevant' | 'hallucinated' | 'skip';
  reason: string;
}

function getBedrockClient(): BedrockRuntimeClient | null {
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) return null;
  return new BedrockRuntimeClient({ region: AWS_REGION });
}

async function gradeAnswer(query: string, answer: string, expectedTool: string): Promise<QualityScore> {
  const client = getBedrockClient();
  if (!client || !answer || answer.length < 20) {
    return { score: 'skip', reason: 'no AWS credentials or empty answer' };
  }

  try {
    const body = JSON.stringify({
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 150,
      temperature: 0,
      messages: [
        {
          role: 'user',
          content: `You grade legal AI assistant answers. Respond ONLY with JSON: {"score": "relevant"|"partially_relevant"|"not_relevant"|"hallucinated", "reason": "<short reason>"}

Scoring:
- relevant: directly answers the query with correct legal info
- partially_relevant: related but incomplete or tangential
- not_relevant: doesn't address the query at all
- hallucinated: contains fabricated case numbers, fake citations, or invented legal norms

Query: ${query}
Expected tool: ${expectedTool}
Answer (first 1000 chars): ${answer.substring(0, 1000)}`,
        },
      ],
    });

    const command = new InvokeModelCommand({
      modelId: GRADING_MODEL,
      contentType: 'application/json',
      accept: 'application/json',
      body,
    });

    const resp = await client.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(resp.body));
    const content = responseBody.content?.[0]?.text || '';
    const jsonMatch = content.match(/\{[^}]+\}/);
    if (!jsonMatch) return { score: 'skip', reason: 'no JSON in grading response' };
    const parsed = JSON.parse(jsonMatch[0]);
    return { score: parsed.score, reason: parsed.reason };
  } catch (err: any) {
    return { score: 'skip', reason: `grading failed: ${err.message}` };
  }
}

async function gradeResults(pool: pg.Pool, testRunId: string): Promise<void> {
  if (!process.env.AWS_ACCESS_KEY_ID) {
    console.log('[Quality] Skipping grading — no AWS credentials');
    return;
  }

  console.log('\n[Quality] Grading successful answers...');
  const rows = await pool.query(
    `SELECT id, query, response_text, expected_tool FROM load_test_results
     WHERE test_run_id = $1 AND status = 'success' AND quality_score IS NULL`,
    [testRunId]
  );

  let graded = 0;
  for (const row of rows.rows) {
    const { score, reason } = await gradeAnswer(row.query, row.response_text, row.expected_tool);
    await pool.query(
      'UPDATE load_test_results SET quality_score = $1, quality_reason = $2 WHERE id = $3',
      [score, reason, row.id]
    );
    graded++;
    if (graded % 10 === 0) console.log(`[Quality] Graded ${graded}/${rows.rows.length}`);
  }
  console.log(`[Quality] Done — graded ${graded} answers`);
}

// ---------------------------------------------------------------------------
// Utils
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Report generator
// ---------------------------------------------------------------------------

async function generateReport(pool: pg.Pool, runId?: string): Promise<void> {
  const targetRun = runId || (await pool.query(
    `SELECT test_run_id FROM load_test_results ORDER BY created_at DESC LIMIT 1`
  )).rows[0]?.test_run_id;

  if (!targetRun) {
    console.log('No test runs found.');
    return;
  }

  console.log(`# Load Test Report: ${targetRun}\n`);

  const summary = await pool.query(`
    SELECT wave,
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE status = 'success') as success,
      COUNT(*) FILTER (WHERE status = 'error') as errors,
      COUNT(*) FILTER (WHERE status = 'timeout') as timeouts,
      ROUND(AVG(response_time_ms) FILTER (WHERE status='success')) as avg_ms,
      ROUND(MIN(response_time_ms) FILTER (WHERE status='success')) as min_ms,
      ROUND(MAX(response_time_ms) FILTER (WHERE status='success')) as max_ms,
      ROUND(AVG(cost_usd::numeric) FILTER (WHERE status='success'), 4) as avg_cost,
      ROUND(SUM(cost_usd::numeric), 4) as total_cost
    FROM load_test_results WHERE test_run_id = $1 GROUP BY wave ORDER BY wave
  `, [targetRun]);

  console.log('## Summary by Wave\n');
  console.log('| Wave | Total | OK | Err | Timeout | Avg ms | Min ms | Max ms | Avg $ | Total $ |');
  console.log('|------|-------|----|-----|---------|--------|--------|--------|-------|---------|');
  for (const r of summary.rows) {
    console.log(`| ${r.wave} | ${r.total} | ${r.success} | ${r.errors} | ${r.timeouts} | ${r.avg_ms || '-'} | ${r.min_ms || '-'} | ${r.max_ms || '-'} | ${r.avg_cost || '-'} | ${r.total_cost || '-'} |`);
  }

  const errors = await pool.query(`
    SELECT LEFT(error_message, 80) as error_type, COUNT(*) as cnt
    FROM load_test_results WHERE test_run_id = $1 AND status = 'error'
    GROUP BY LEFT(error_message, 80) ORDER BY cnt DESC
  `, [targetRun]);

  console.log('\n## Error Breakdown\n');
  console.log('| Error | Count |');
  console.log('|-------|-------|');
  for (const r of errors.rows) {
    console.log(`| ${r.error_type} | ${r.cnt} |`);
  }

  const routing = await pool.query(`
    SELECT expected_tool, tool_triggered, tools_used,
      response_time_ms, cost_usd, quality_score
    FROM load_test_results WHERE test_run_id = $1 AND status = 'success'
    ORDER BY expected_tool
  `, [targetRun]);

  const exact = routing.rows.filter((r: any) => r.expected_tool === r.tool_triggered).length;
  const contains = routing.rows.filter((r: any) => (r.tools_used || []).includes(r.expected_tool)).length;
  const total = routing.rows.length;

  console.log(`\n## Tool Routing Accuracy: exact=${exact}/${total} (${total > 0 ? Math.round(exact / total * 100) : 0}%) | contains=${contains}/${total} (${total > 0 ? Math.round(contains / total * 100) : 0}%)\n`);
  console.log('| Expected Tool | Tools Used | Match | ms | Cost | Quality |');
  console.log('|---------------|-----------|-------|-----|------|---------|');
  for (const r of routing.rows) {
    const toolsUsed: string[] = r.tools_used || [];
    const isContains = toolsUsed.includes(r.expected_tool);
    const isExact = r.expected_tool === r.tool_triggered;
    const match = isExact ? 'EXACT' : isContains ? 'YES' : 'NO';
    const toolsStr = toolsUsed.slice(0, 3).join(', ') + (toolsUsed.length > 3 ? '...' : '');
    console.log(`| ${r.expected_tool} | ${toolsStr || 'none'} | ${match} | ${r.response_time_ms} | $${r.cost_usd || 0} | ${r.quality_score || '-'} |`);
  }

  const quality = await pool.query(`
    SELECT quality_score, COUNT(*) as cnt
    FROM load_test_results WHERE test_run_id = $1 AND quality_score IS NOT NULL AND quality_score != 'skip'
    GROUP BY quality_score ORDER BY cnt DESC
  `, [targetRun]);

  if (quality.rows.length > 0) {
    console.log('\n## Quality Distribution\n');
    for (const r of quality.rows) {
      console.log(`- **${r.quality_score}**: ${r.cnt}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--report')) {
    const pool = new pg.Pool(DB_CONFIG);
    const runIdArg = args[args.indexOf('--report') + 1];
    const runId = runIdArg && !runIdArg.startsWith('--') ? runIdArg : undefined;
    await generateReport(pool, runId);
    await pool.end();
    return;
  }

  const testRunId = `loadtest-${new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').substring(0, 19)}`;
  const totalQueries = QUERY_CATALOG.length * 2;

  const useTui = process.stdout.isTTY && !args.includes('--no-tui');
  let dashboard: Dashboard | null = null;

  if (useTui) {
    dashboard = new Dashboard({ testRunId, totalQueries });
    dashboard.start();
  } else {
    console.log(`${'='.repeat(60)}`);
    console.log(`  LOAD & QUALITY TEST`);
    console.log(`  Run ID: ${testRunId}`);
    console.log(`  Target: ${BASE_URL}`);
    console.log(`  Queries: ${QUERY_CATALOG.length} tools x 2 = ${totalQueries}`);
    console.log(`  Users: ${TEST_USER_COUNT} concurrent`);
    console.log(`  Budget: ${BUDGET}`);
    console.log(`${'='.repeat(60)}\n`);
  }

  const pool = new pg.Pool(DB_CONFIG);

  try {
    await ensureResultsTable(pool);

    const users = await createTestUsers(pool);

    if (!useTui) console.log('[Preflight] Checking...');
    await preflightCheck(BASE_URL, users[0].jwt);

    await runPhase('simple', users, pool, testRunId, dashboard);

    if (!useTui) console.log(`\n  ... pause ${PAUSE_BETWEEN_PHASES_MS / 1000}s between phases ...`);
    await sleep(PAUSE_BETWEEN_PHASES_MS);

    await runPhase('complex', users, pool, testRunId, dashboard);

    dashboard?.stop();
    dashboard = null;

    await gradeResults(pool, testRunId);

    await printSummary(pool, testRunId);

    await deleteTestUsers(pool);

    console.log('\nDone.');
  } catch (error: any) {
    dashboard?.stop();
    console.error('Fatal error:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
