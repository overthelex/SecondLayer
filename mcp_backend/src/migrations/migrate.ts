import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { Database } from '../database/database.js';
import { logger } from '../utils/logger.js';

async function runMigrations() {
  const db = new Database();

  try {
    await db.connect();
    logger.info('Connected to database, running migrations...');

    // Create migration tracking table if it doesn't exist
    await db.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Get all migration files (*.sql) in sorted order
    const migrationsDir = join(process.cwd(), 'src/migrations');
    const files = readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    logger.info(`Found ${files.length} migration files`);

    // Execute each migration
    for (const file of files) {
      // Check if migration was already applied
      const result = await db.query(
        'SELECT 1 FROM schema_migrations WHERE filename = $1',
        [file]
      );

      if (result.rows.length > 0) {
        logger.info(`Migration ${file} already applied, skipping...`);
        continue;
      }

      const migrationPath = join(migrationsDir, file);
      const migrationSql = readFileSync(migrationPath, 'utf-8');

      try {
        await db.query(migrationSql);
        await db.query(
          'INSERT INTO schema_migrations (filename) VALUES ($1)',
          [file]
        );
        logger.info(`✅ Migration ${file} completed successfully`);
      } catch (error: any) {
        // Log but don't fail on "already exists" errors (safety net for pre-tracking migrations)
        if (error.message.includes('already exists') || error.message.includes('duplicate') || error.message.includes('is not unique')) {
          // Record it as applied so it won't be retried
          await db.query(
            'INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING',
            [file]
          );
          logger.info(`Migration ${file} already applied, skipping...`);
        } else {
          throw error;
        }
      }
    }

    logger.info('✅ All migrations completed successfully');
    await db.close();
  } catch (error) {
    logger.error('❌ Migration failed:', error);
    await db.close();
    process.exit(1);
  }
}

runMigrations();
