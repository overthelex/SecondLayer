#!/usr/bin/env npx tsx
/**
 * Import MISSING cited laws (LEXAI-1770)
 *
 * Imports a curated worklist of Ukrainian laws that are CITED by court
 * decisions (law_court_citations) but MISSING from public.legislation, so the
 * citations can resolve. Many are OLD / repealed laws, imported anyway for
 * historical resolution.
 *
 * Uses RadaLegislationAdapter (fetch text from zakon.rada.gov.ua print
 * endpoint -> sectionize into articles -> upsert into public.legislation +
 * legislation_articles). 100% ADDITIVE: ON CONFLICT (rada_id) DO UPDATE and
 * ON CONFLICT (legislation_id, article_number, version_date) DO UPDATE.
 *
 * Usage:
 *   DATABASE_URL=... npx tsx scripts/rada/import-missing-cited-laws.ts [--only=2343-12,697-12] [--delay=4000] [--dry-run]
 *
 * Rate limit: sequential with --delay ms between docs (default 4000ms) to
 * respect zakon.rada.gov.ua throttling. Checkpoints to import-missing-progress.json.
 */

import * as fs from 'fs';
import * as path from 'path';
import pg from 'pg';
import { RadaLegislationAdapter } from '../../mcp_backend/src/adapters/rada-legislation-adapter';
import type { IDatabase, IQueryResult, ITransactionClient } from '../../mcp_backend/src/domain/ports/database';

const PROGRESS_FILE = path.join(__dirname, 'import-missing-progress.json');

// ─── Worklist: cited-name -> rada_id (verified on zakon.rada.gov.ua) ──────────
// cites = citation volume in law_court_citations (for prioritisation/logging)
interface WorkItem { rada_id: string; cited_name: string; cites: number; note?: string; }

const WORKLIST: WorkItem[] = [
  { rada_id: '5464-10',   cited_name: 'Житловий кодекс України', cites: 5502, note: 'Housing Code УРСР (active)' },
  { rada_id: '2343-12',   cited_name: 'Про відновлення платоспроможності боржника або визнання його банкрутом', cites: 4734, note: 'old bankruptcy law (repealed 2019)' },
  { rada_id: '1251-12',   cited_name: 'Про систему оподаткування', cites: 746, note: 'repealed 2011' },
  { rada_id: '697-12',    cited_name: 'Про власність', cites: 734, note: 'repealed 2007' },
  { rada_id: '606-14',    cited_name: 'Про виконавче провадження', cites: 706, note: 'old, repealed 2017' },
  { rada_id: '213/95-вр', cited_name: 'Водний кодекс України', cites: 690, note: 'active' },
  { rada_id: '755-15',    cited_name: 'Про державну реєстрацію юридичних осіб та фізичних осіб - підприємців', cites: 1140, note: 'covers all spelling variants; active (renamed)' },
  { rada_id: '509-12',    cited_name: 'Про державну податкову службу в Україні', cites: 692, note: 'covers вариант без В Україні; repealed 2012' },
  { rada_id: '2181-14',   cited_name: 'Про порядок погашення зобовязань платників податків перед бюджетами та державними цільовими фондами', cites: 618, note: 'covers №2181- + variants; repealed 2011' },
  { rada_id: '1788-12',   cited_name: 'Про пенсійне забезпечення', cites: 260, note: 'active' },
  { rada_id: '168/97-вр', cited_name: 'Про податок на додану вартість', cites: 210, note: 'repealed 2011' },
  { rada_id: '334/94-вр', cited_name: 'Про оподаткування прибутку підприємств', cites: 194, note: 'repealed 2013' },
  { rada_id: '280/97-вр', cited_name: 'Про місцеве самоврядування в Україні', cites: 258, note: 'covers скороч. variant; active' },
  { rada_id: '1105-14',   cited_name: 'Про загальнообовязкове державне соціальне страхування від нещасного випадку на виробництві та професійного захворювання, які спричинили втрату працездатності', cites: 178, note: 'active (now generic social insurance law)' },
  { rada_id: '2633-15',   cited_name: 'Про теплопостачання', cites: 176, note: 'active' },
  { rada_id: '108/95-вр', cited_name: 'Про оплату праці', cites: 160, note: 'active' },
  { rada_id: '265/95-вр', cited_name: 'Про застосування реєстраторів розрахункових операцій у сфері торгівлі, громадського харчування та послуг', cites: 156, note: 'active' },
  { rada_id: '889-15',    cited_name: 'Про податок з доходів фізичних осіб', cites: 144, note: 'repealed 2011' },
  { rada_id: '2482-12',   cited_name: 'Про приватизацію державного житлового фонду', cites: 144, note: 'active' },
  { rada_id: '1058-15',   cited_name: 'Про загальнообовязкове державне пенсійне страхування', cites: 214, note: 'covers №1058-; active' },
  { rada_id: '575/97-вр', cited_name: 'Про електроенергетику', cites: 136, note: 'repealed 2019' },
  { rada_id: '1875-15',   cited_name: 'Про житлово-комунальні послуги', cites: 132, note: 'old, repealed 2019' },
  { rada_id: '875-12',    cited_name: 'Про основи соціальної захищеності осіб з інвалідністю в Україні', cites: 112, note: 'active' },
  { rada_id: '2344-14',   cited_name: 'Про автомобільний транспорт', cites: 100, note: 'active' },
];

// ─── Minimal IDatabase wrapper over a pg.Pool ─────────────────────────────────
class PgPoolDatabase implements IDatabase {
  constructor(private pool: pg.Pool) {}

  async query<T = any>(text: string, params?: unknown[]): Promise<IQueryResult<T>> {
    const r = await this.pool.query(text, params as any[]);
    return { rows: r.rows as T[], rowCount: r.rowCount ?? 0 } as IQueryResult<T>;
  }

  async transaction<T>(callback: (client: ITransactionClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const txClient: ITransactionClient = {
        query: async (text: string, p?: unknown[]) => {
          const r = await client.query(text, p as any[]);
          return { rows: r.rows, rowCount: r.rowCount ?? 0 } as any;
        },
      } as ITransactionClient;
      const result = await callback(txClient);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async connect(): Promise<void> { /* pool auto-connects */ }
  async close(): Promise<void> { await this.pool.end(); }
  // Optional members some IDatabase impls expose; not used by the adapter.
  getPool(): pg.Pool { return this.pool; }
}

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

function loadProgress(): { done: string[]; failed: Record<string, string> } {
  if (fs.existsSync(PROGRESS_FILE)) return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'));
  return { done: [], failed: {} };
}
function saveProgress(p: { done: string[]; failed: Record<string, string> }) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(p, null, 2));
}

async function main() {
  const args = process.argv.slice(2);
  const only = args.find((a) => a.startsWith('--only='))?.split('=')[1]?.split(',').map((s) => s.trim());
  const delay = parseInt(args.find((a) => a.startsWith('--delay='))?.split('=')[1] || '4000', 10);
  const dryRun = args.includes('--dry-run');

  let work = WORKLIST.filter((w) => !w.note?.includes('do not use'));
  if (only) work = work.filter((w) => only.includes(w.rada_id));

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) { console.error('DATABASE_URL required'); process.exit(1); }

  const pool = new pg.Pool({ connectionString: dbUrl, max: 4 });
  const db = new PgPoolDatabase(pool);
  const adapter = new RadaLegislationAdapter(db);

  const before = await pool.query('SELECT count(*)::int c FROM legislation');
  console.log(`Legislation rows before: ${before.rows[0].c}`);
  console.log(`Worklist: ${work.length} laws, delay ${delay}ms, dryRun=${dryRun}\n`);

  const progress = loadProgress();
  let imported = 0, failed = 0, skipped = 0;

  for (const item of work) {
    if (progress.done.includes(item.rada_id)) { console.log(`SKIP (done) ${item.rada_id}`); skipped++; continue; }

    // Skip if already present by rada_id (additive: never re-fetch existing)
    const exists = await pool.query('SELECT id FROM legislation WHERE rada_id = $1', [item.rada_id]);
    if (exists.rows.length > 0) {
      console.log(`SKIP (exists) ${item.rada_id} (legislation id ${exists.rows[0].id})`);
      progress.done.push(item.rada_id); saveProgress(progress); skipped++; continue;
    }

    try {
      console.log(`FETCH ${item.rada_id} — ${item.cited_name.slice(0, 50)} (${item.cites} cites)`);
      const { metadata, articles } = await adapter.fetchLegislation(item.rada_id);
      console.log(`  parsed: "${metadata.title.slice(0, 60)}" — ${articles.length} articles`);

      if (articles.length === 0) {
        console.warn(`  WARN: 0 articles for ${item.rada_id}, skipping save`);
        progress.failed[item.rada_id] = '0 articles parsed';
        saveProgress(progress); failed++;
        await sleep(delay); continue;
      }

      if (!dryRun) {
        const { legislationId } = await adapter.saveLegislationToDatabase(metadata, articles);
        console.log(`  SAVED legislation id=${legislationId}, ${articles.length} articles`);
        progress.done.push(item.rada_id); saveProgress(progress);
      } else {
        console.log(`  DRY-RUN: would save ${articles.length} articles`);
      }
      imported++;
    } catch (err: any) {
      console.error(`  FAIL ${item.rada_id}: ${err.message}`);
      progress.failed[item.rada_id] = err.message; saveProgress(progress); failed++;
    }

    await sleep(delay);
  }

  const after = await pool.query('SELECT count(*)::int c FROM legislation');
  console.log(`\nDone. imported=${imported} skipped=${skipped} failed=${failed}`);
  console.log(`Legislation rows after: ${after.rows[0].c}`);
  await pool.end();
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
