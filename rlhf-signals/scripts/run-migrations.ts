import fs from 'fs';
import path from 'path';
import { getPool, closePool } from '../src/lib/db';
import { logger } from '../src/lib/logger';

async function runMigrations() {
  const migrationsDir = path.resolve(__dirname, '../migrations');
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  const pool = getPool();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS _rlhf_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ DEFAULT now()
    )
  `);

  const applied = await pool.query('SELECT filename FROM _rlhf_migrations');
  const appliedSet = new Set(applied.rows.map(r => r.filename));

  for (const file of files) {
    if (appliedSet.has(file)) {
      logger.info(`Skipping already applied: ${file}`);
      continue;
    }

    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
    logger.info(`Applying migration: ${file}`);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO _rlhf_migrations (filename) VALUES ($1)', [file]);
      await client.query('COMMIT');
      logger.info(`Applied: ${file}`);
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error(`Failed to apply ${file}`, { error: (err as Error).message });
      throw err;
    } finally {
      client.release();
    }
  }

  logger.info('All migrations applied');
  await closePool();
}

runMigrations().catch(err => {
  logger.error('Migration failed', { error: err.message });
  process.exit(1);
});
