/**
 * compute-judge-analytics.ts
 *
 * Multi-pass bulk SQL computation of per-judge analytics from EDRSR data.
 * Designed to run as a standalone script: npx tsx src/scripts/compute-judge-analytics.ts
 *
 * Pass 1a-1e: Base counts, year/form/justice-kind breakdowns, top categories
 * Pass 2:    Court info + dossier matching from judges_current
 * Pass 3:    Appeal rate (first instance → appeal self-join)
 * Pass 4:    Appeal outcomes from fulltext (20 parallel workers, 4 DB shards)
 * Pass 5:    VKKSU efficiency join
 * Pass 6:    Peer ranking via window functions
 */

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const PERIOD_START = '2022-01-01';
const PERIOD_END = '2026-12-31';
const WORKER_COUNT = 20;

// Shard DB URLs for fulltext analysis (Pass 4)
const SHARD_URLS = [
  process.env.DATABASE_URL || process.env.EDRSR_SHARD_1_URL || '',
  process.env.EDRSR_SHARD_2_URL || '',
  process.env.EDRSR_SHARD_3_URL || '',
  process.env.EDRSR_SHARD_4_URL || '',
].filter(Boolean);

function createPool(connectionString: string): pg.Pool {
  return new Pool({
    connectionString,
    max: 6,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });
}

const mainPool = createPool(process.env.DATABASE_URL || '');

function log(msg: string) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

// ── Pass 1a: Base counts ──────────────────────────────────────────────────
async function pass1a() {
  log('Pass 1a: Base counts (total_decisions, unique_cases)');
  await mainPool.query(`
    INSERT INTO judge_analytics (judge_name, court_code, total_decisions, unique_cases, period_start, period_end)
    SELECT
      d.judge,
      d.court_code,
      COUNT(*)::INTEGER AS total_decisions,
      COUNT(DISTINCT d.cause_num)::INTEGER AS unique_cases,
      $1::DATE,
      $2::DATE
    FROM edrsr_documents d
    WHERE d.judge IS NOT NULL
      AND d.adjudication_date >= $1::DATE
      AND d.adjudication_date <= $2::DATE
    GROUP BY d.judge, d.court_code
    ON CONFLICT (judge_name, court_code) DO UPDATE SET
      total_decisions = EXCLUDED.total_decisions,
      unique_cases = EXCLUDED.unique_cases,
      period_start = EXCLUDED.period_start,
      period_end = EXCLUDED.period_end,
      computed_at = now()
  `, [PERIOD_START, PERIOD_END]);
  const { rows } = await mainPool.query('SELECT COUNT(*) AS cnt FROM judge_analytics');
  log(`Pass 1a done: ${rows[0].cnt} judges inserted`);
}

// ── Pass 1b: Year breakdown ────────────────────────────────────────────────
async function pass1b() {
  log('Pass 1b: Decisions by year');
  await mainPool.query(`
    WITH year_data AS (
      SELECT judge, court_code,
        jsonb_object_agg(yr::TEXT, cnt) AS by_year
      FROM (
        SELECT judge, court_code,
          EXTRACT(YEAR FROM adjudication_date)::INTEGER AS yr,
          COUNT(*) AS cnt
        FROM edrsr_documents
        WHERE judge IS NOT NULL
          AND adjudication_date >= $1::DATE
          AND adjudication_date <= $2::DATE
        GROUP BY judge, court_code, EXTRACT(YEAR FROM adjudication_date)
      ) t
      GROUP BY judge, court_code
    )
    UPDATE judge_analytics ja
    SET decisions_by_year = yd.by_year
    FROM year_data yd
    WHERE ja.judge_name = yd.judge AND ja.court_code = yd.court_code
  `, [PERIOD_START, PERIOD_END]);
  log('Pass 1b done');
}

// ── Pass 1c: Form breakdown ───────────────────────────────────────────────
async function pass1c() {
  log('Pass 1c: Decisions by judgment form');
  await mainPool.query(`
    WITH form_data AS (
      SELECT d.judge, d.court_code,
        jsonb_object_agg(COALESCE(jf.name, d.judgment_code::TEXT), cnt) AS by_form
      FROM (
        SELECT judge, court_code, judgment_code, COUNT(*) AS cnt
        FROM edrsr_documents
        WHERE judge IS NOT NULL
          AND adjudication_date >= $1::DATE
          AND adjudication_date <= $2::DATE
        GROUP BY judge, court_code, judgment_code
      ) d
      LEFT JOIN edrsr_judgment_forms jf ON jf.judgment_code = d.judgment_code
      GROUP BY d.judge, d.court_code
    )
    UPDATE judge_analytics ja
    SET decisions_by_form = fd.by_form
    FROM form_data fd
    WHERE ja.judge_name = fd.judge AND ja.court_code = fd.court_code
  `, [PERIOD_START, PERIOD_END]);
  log('Pass 1c done');
}

// ── Pass 1d: Justice kind breakdown ───────────────────────────────────────
async function pass1d() {
  log('Pass 1d: Decisions by justice kind');
  await mainPool.query(`
    WITH jk_data AS (
      SELECT d.judge, d.court_code,
        jsonb_object_agg(COALESCE(jk.name, d.justice_kind::TEXT), cnt) AS by_jk
      FROM (
        SELECT judge, court_code, justice_kind, COUNT(*) AS cnt
        FROM edrsr_documents
        WHERE judge IS NOT NULL
          AND adjudication_date >= $1::DATE
          AND adjudication_date <= $2::DATE
        GROUP BY judge, court_code, justice_kind
      ) d
      LEFT JOIN edrsr_justice_kinds jk ON jk.justice_kind = d.justice_kind
      GROUP BY d.judge, d.court_code
    )
    UPDATE judge_analytics ja
    SET decisions_by_justice_kind = jkd.by_jk
    FROM jk_data jkd
    WHERE ja.judge_name = jkd.judge AND ja.court_code = jkd.court_code
  `, [PERIOD_START, PERIOD_END]);
  log('Pass 1d done');
}

// ── Pass 1e: Top categories ───────────────────────────────────────────────
async function pass1e() {
  log('Pass 1e: Top 10 categories per judge');
  await mainPool.query(`
    WITH ranked AS (
      SELECT d.judge, d.court_code, d.category_code,
        COALESCE(cc.name, d.category_code::TEXT) AS category_name,
        COUNT(*) AS cnt,
        ROW_NUMBER() OVER (PARTITION BY d.judge, d.court_code ORDER BY COUNT(*) DESC) AS rn
      FROM edrsr_documents d
      LEFT JOIN edrsr_cause_categories cc ON cc.category_code = d.category_code
      WHERE d.judge IS NOT NULL
        AND d.adjudication_date >= $1::DATE
        AND d.adjudication_date <= $2::DATE
        AND d.category_code IS NOT NULL
      GROUP BY d.judge, d.court_code, d.category_code, cc.name
    ),
    top10 AS (
      SELECT judge, court_code,
        jsonb_agg(
          jsonb_build_object('code', category_code, 'name', category_name, 'count', cnt)
          ORDER BY cnt DESC
        ) AS cats
      FROM ranked
      WHERE rn <= 10
      GROUP BY judge, court_code
    )
    UPDATE judge_analytics ja
    SET top_categories = t.cats
    FROM top10 t
    WHERE ja.judge_name = t.judge AND ja.court_code = t.court_code
  `, [PERIOD_START, PERIOD_END]);
  log('Pass 1e done');
}

// ── Pass 2: Court info + dossier ──────────────────────────────────────────
async function pass2() {
  log('Pass 2: Court name, instance, dossier number');
  await mainPool.query(`
    UPDATE judge_analytics ja
    SET
      court_name = c.name,
      instance_code = c.instance_code,
      instance_name = i.name
    FROM edrsr_courts c
    LEFT JOIN edrsr_instances i ON i.instance_code = c.instance_code
    WHERE ja.court_code = c.court_code
  `);
  // Match dossier numbers from judges_current
  await mainPool.query(`
    UPDATE judge_analytics ja
    SET dossier_number = jc.dossier_number
    FROM judges_current jc
    WHERE ja.judge_name = jc.full_name
      AND ja.dossier_number IS NULL
  `);
  log('Pass 2 done');
}

// ── Pass 3: Appeal rate ───────────────────────────────────────────────────
async function pass3() {
  log('Pass 3: Appeal rate (first instance → appeal court join)');
  // Count cases where the cause_num from a first-instance judge appears in an appeal court
  await mainPool.query(`
    WITH first_instance_cases AS (
      SELECT ja.judge_name, ja.court_code, d.cause_num
      FROM judge_analytics ja
      JOIN edrsr_documents d ON d.judge = ja.judge_name AND d.court_code = ja.court_code
      WHERE ja.instance_code = 1
        AND d.cause_num IS NOT NULL
        AND d.adjudication_date >= $1::DATE
        AND d.adjudication_date <= $2::DATE
      GROUP BY ja.judge_name, ja.court_code, d.cause_num
    ),
    appealed AS (
      SELECT fic.judge_name, fic.court_code, COUNT(DISTINCT fic.cause_num) AS cnt
      FROM first_instance_cases fic
      WHERE EXISTS (
        SELECT 1 FROM edrsr_documents ap
        JOIN edrsr_courts ac ON ac.court_code = ap.court_code AND ac.instance_code = 2
        WHERE ap.cause_num = fic.cause_num
          AND ap.adjudication_date >= $1::DATE
      )
      GROUP BY fic.judge_name, fic.court_code
    )
    UPDATE judge_analytics ja
    SET
      cases_appealed = COALESCE(a.cnt, 0),
      appeal_rate = CASE
        WHEN ja.unique_cases > 0 THEN ROUND(COALESCE(a.cnt, 0)::NUMERIC / ja.unique_cases * 100, 2)
        ELSE 0
      END
    FROM (
      SELECT ja2.judge_name, ja2.court_code
      FROM judge_analytics ja2
      WHERE ja2.instance_code = 1
    ) j
    LEFT JOIN appealed a ON a.judge_name = j.judge_name AND a.court_code = j.court_code
    WHERE ja.judge_name = j.judge_name AND ja.court_code = j.court_code
  `, [PERIOD_START, PERIOD_END]);
  log('Pass 3 done');
}

// ── Pass 4: Appeal outcomes from fulltext (parallel workers) ──────────────
async function pass4() {
  if (SHARD_URLS.length === 0) {
    log('Pass 4: SKIPPED (no shard DB URLs configured)');
    return;
  }
  log(`Pass 4: Appeal outcomes from fulltext (${WORKER_COUNT} workers, ${SHARD_URLS.length} shards)`);

  const shardPools = SHARD_URLS.map(url => createPool(url));

  // Get judges with appealed cases (first instance only)
  const { rows: judges } = await mainPool.query(`
    SELECT judge_name, court_code, cases_appealed
    FROM judge_analytics
    WHERE instance_code = 1 AND cases_appealed > 0
    ORDER BY cases_appealed DESC
  `);
  log(`Pass 4: ${judges.length} judges with appealed cases`);

  if (judges.length === 0) {
    for (const p of shardPools) await p.end();
    return;
  }

  // Split into batches for workers
  const batchSize = Math.ceil(judges.length / WORKER_COUNT);
  const batches: typeof judges[] = [];
  for (let i = 0; i < judges.length; i += batchSize) {
    batches.push(judges.slice(i, i + batchSize));
  }

  const outcomePatterns = {
    upheld: /залиш(ити|ено)\s+(без\s+змін|в\s+силі)|апеляцій(ну|ну)\s+скаргу\s+без\s+задоволення|скаргу\s+відхил/i,
    overturned: /скасува(ти|но)\s+(рішення|вирок|ухвалу|постанову)|скасовано\s+повністю|направити\s+на\s+новий\s+розгляд/i,
    modified: /змін(ити|ено)\s+(рішення|вирок|ухвалу|постанову)|частково\s+задовол/i,
  };

  async function classifyOutcome(fulltext: string): Promise<'upheld' | 'overturned' | 'modified' | 'unknown'> {
    if (!fulltext) return 'unknown';
    // Check last 2000 chars (operative part is usually at the end)
    const tail = fulltext.slice(-2000);
    if (outcomePatterns.overturned.test(tail)) return 'overturned';
    if (outcomePatterns.modified.test(tail)) return 'modified';
    if (outcomePatterns.upheld.test(tail)) return 'upheld';
    return 'unknown';
  }

  async function searchShards(docIds: number[]): Promise<Map<number, string>> {
    const results = new Map<number, string>();
    if (docIds.length === 0) return results;

    const promises = shardPools.map(async (pool) => {
      try {
        const { rows } = await pool.query(
          `SELECT doc_id, full_text FROM edrsr_fulltext WHERE doc_id = ANY($1) AND full_text IS NOT NULL`,
          [docIds]
        );
        for (const row of rows) {
          results.set(row.doc_id, row.full_text);
        }
      } catch {
        // Shard may be unavailable
      }
    });
    await Promise.all(promises);
    return results;
  }

  async function processWorkerBatch(batch: typeof judges) {
    for (const judge of batch) {
      // Get appeal doc_ids for this judge's cases
      const { rows: appealDocs } = await mainPool.query(`
        SELECT DISTINCT ap.doc_id
        FROM edrsr_documents orig
        JOIN edrsr_documents ap ON ap.cause_num = orig.cause_num
        JOIN edrsr_courts ac ON ac.court_code = ap.court_code AND ac.instance_code = 2
        WHERE orig.judge = $1
          AND orig.court_code = $2
          AND orig.cause_num IS NOT NULL
          AND orig.adjudication_date >= $3::DATE
          AND ap.adjudication_date >= $3::DATE
          AND ap.judgment_code IN (3, 4)
        LIMIT 500
      `, [judge.judge_name, judge.court_code, PERIOD_START]);

      if (appealDocs.length === 0) continue;

      const docIds = appealDocs.map((r: { doc_id: number }) => r.doc_id);
      const fulltexts = await searchShards(docIds);

      const outcomes = { upheld: 0, overturned: 0, modified: 0, unknown: 0, analyzed: 0 };
      for (const [, text] of fulltexts) {
        const result = await classifyOutcome(text);
        outcomes[result]++;
        outcomes.analyzed++;
      }

      if (outcomes.analyzed > 0) {
        await mainPool.query(`
          UPDATE judge_analytics
          SET appeal_outcomes = $3::JSONB
          WHERE judge_name = $1 AND court_code = $2
        `, [judge.judge_name, judge.court_code, JSON.stringify(outcomes)]);
      }
    }
  }

  const workerPromises = batches.map(batch => processWorkerBatch(batch));
  await Promise.all(workerPromises);

  for (const p of shardPools) await p.end();
  log('Pass 4 done');
}

// ── Pass 5: VKKSU efficiency data ─────────────────────────────────────────
async function pass5() {
  log('Pass 5: VKKSU efficiency join');
  // Check if judge_efficiency table exists
  const { rows: tableCheck } = await mainPool.query(`
    SELECT 1 FROM information_schema.tables WHERE table_name = 'judge_efficiency' LIMIT 1
  `);
  if (tableCheck.length === 0) {
    log('Pass 5: SKIPPED (judge_efficiency table not found)');
    return;
  }

  await mainPool.query(`
    UPDATE judge_analytics ja
    SET vkksu_data = jsonb_build_object(
      'workload', jsonb_build_object(
        'criminal', jsonb_build_object('judge', je.workload_criminal_judge, 'court', je.workload_criminal_court, 'region', je.workload_criminal_region),
        'civil', jsonb_build_object('judge', je.workload_civil_judge, 'court', je.workload_civil_court, 'region', je.workload_civil_region),
        'admin', jsonb_build_object('judge', je.workload_admin_judge, 'court', je.workload_admin_court, 'region', je.workload_admin_region),
        'commercial', jsonb_build_object('judge', je.workload_commercial_judge, 'court', je.workload_commercial_court, 'region', je.workload_commercial_region),
        'misdemeanor', jsonb_build_object('judge', je.workload_misdemeanor_judge, 'court', je.workload_misdemeanor_court, 'region', je.workload_misdemeanor_region)
      ),
      'overturned', jsonb_build_object(
        'criminal', je.overturned_criminal_total,
        'civil', je.overturned_civil_total,
        'admin', je.overturned_admin_total,
        'commercial', je.overturned_commercial_total,
        'misdemeanor', je.overturned_misdemeanor_total
      ),
      'deadline_violations', jsonb_build_object(
        'criminal', je.deadline_violations_criminal,
        'civil', je.deadline_violations_civil,
        'admin', je.deadline_violations_admin,
        'commercial', je.deadline_violations_commercial,
        'misdemeanor', je.deadline_violations_misdemeanor
      ),
      'year', je.year
    )
    FROM judge_efficiency je
    WHERE ja.judge_name = je.judge_name
  `);
  log('Pass 5 done');
}

// ── Pass 6: Peer ranking ──────────────────────────────────────────────────
async function pass6() {
  log('Pass 6: Peer ranking within court');
  await mainPool.query(`
    WITH ranked AS (
      SELECT id,
        RANK() OVER (PARTITION BY court_code ORDER BY total_decisions DESC) AS rnk,
        COUNT(*) OVER (PARTITION BY court_code) AS total_in_court,
        AVG(total_decisions) OVER (PARTITION BY court_code) AS avg_decisions
      FROM judge_analytics
    )
    UPDATE judge_analytics ja
    SET
      peer_rank_in_court = r.rnk,
      peer_total_in_court = r.total_in_court,
      court_avg_decisions = r.avg_decisions
    FROM ranked r
    WHERE ja.id = r.id
  `);
  log('Pass 6 done');
}

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  log('=== Judge Analytics Computation Started ===');
  const start = Date.now();

  try {
    // Pass 1: parallel sub-passes
    await pass1a();
    await Promise.all([pass1b(), pass1c(), pass1d(), pass1e()]);

    // Pass 2-6: sequential
    await pass2();
    await pass3();
    await pass4();
    await pass5();
    await pass6();

    const { rows } = await mainPool.query('SELECT COUNT(*) AS cnt FROM judge_analytics');
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    log(`=== Done: ${rows[0].cnt} judges computed in ${elapsed}s ===`);
  } catch (err) {
    console.error('FATAL:', err);
    process.exit(1);
  } finally {
    await mainPool.end();
  }
}

main();
