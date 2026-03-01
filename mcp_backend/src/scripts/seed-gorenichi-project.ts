/**
 * Seed Script: Гореничі Project
 * Creates a personal matter "Гореничі" for shepherdvovkes user
 * and assigns all user documents to it.
 *
 * Usage:
 *   npx ts-node src/scripts/seed-gorenichi-project.ts
 *   # or via docker exec:
 *   docker exec -it secondlayer-app-local npx ts-node src/scripts/seed-gorenichi-project.ts
 */

import { Database } from '../database/database.js';
import { logger } from '../utils/logger.js';

const USER_MATCH = 'shepherdvovkes';

async function seedGorenichiProject() {
  const db = new Database();

  try {
    await db.connect();
    logger.info('Starting Гореничі project seed...');

    // Find user by name or email containing "shepherdvovkes"
    const userResult = await db.query(
      `SELECT id, email, name FROM users WHERE email ILIKE $1 OR name ILIKE $1 LIMIT 1`,
      [`%${USER_MATCH}%`]
    );
    if (userResult.rows.length === 0) {
      throw new Error(`User matching "${USER_MATCH}" not found.`);
    }
    const user = userResult.rows[0];
    logger.info(`Found user: ${user.name || user.email} (${user.id})`);

    // Get or create organization
    let orgId: string;
    const orgResult = await db.query('SELECT id FROM organizations WHERE owner_id = $1', [user.id]);
    if (orgResult.rows.length > 0) {
      orgId = orgResult.rows[0].id;
      logger.info(`Using existing organization: ${orgId}`);
    } else {
      const newOrg = await db.query(
        `INSERT INTO organizations (name, owner_id, plan, max_members)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        ['Особистий кабінет', user.id, 'professional', 5]
      );
      orgId = newOrg.rows[0].id;
      logger.info(`Created organization: ${orgId}`);

      // Add user as org owner
      await db.query(
        `INSERT INTO organization_members (organization_id, user_id, email, role, status, joined_at)
         VALUES ($1, $2, $3, 'owner', 'active', now())
         ON CONFLICT (organization_id, user_id) DO NOTHING`,
        [orgId, user.id, user.email]
      );
    }

    // Create or find client "Особисте"
    let clientId: string;
    const existingClient = await db.query(
      `SELECT id FROM clients WHERE organization_id = $1 AND client_name = $2`,
      [orgId, 'Особисте']
    );
    if (existingClient.rows.length > 0) {
      clientId = existingClient.rows[0].id;
      logger.info(`Client "Особисте" already exists: ${clientId}`);
    } else {
      const newClient = await db.query(
        `INSERT INTO clients (organization_id, client_name, client_type, status, conflict_status, created_by)
         VALUES ($1, $2, 'individual', 'active', 'clear', $3)
         RETURNING id`,
        [orgId, 'Особисте', user.id]
      );
      clientId = newClient.rows[0].id;
      logger.info(`Created client "Особисте": ${clientId}`);
    }

    // Create or find matter "Гореничі"
    const matterNumber = 'GOR-2026-001';
    let matterId: string;
    const existingMatter = await db.query(
      `SELECT id FROM matters WHERE matter_number = $1`,
      [matterNumber]
    );
    if (existingMatter.rows.length > 0) {
      matterId = existingMatter.rows[0].id;
      logger.info(`Matter "Гореничі" already exists: ${matterId}`);
    } else {
      const newMatter = await db.query(
        `INSERT INTO matters (client_id, matter_number, matter_name, matter_type, status,
         responsible_attorney, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $6)
         RETURNING id`,
        [clientId, matterNumber, 'Гореничі', 'advisory', 'active', user.id]
      );
      matterId = newMatter.rows[0].id;
      logger.info(`Created matter "Гореничі": ${matterId} (${matterNumber})`);
    }

    // Add user to matter_team as lead_attorney
    await db.query(
      `INSERT INTO matter_team (matter_id, user_id, role, access_level, added_by)
       VALUES ($1, $2, 'lead_attorney', 'full', $2)
       ON CONFLICT (matter_id, user_id) DO NOTHING`,
      [matterId, user.id]
    );
    logger.info('User added to matter team as lead_attorney');

    // Assign all user documents to this matter
    const assignResult = await db.query(
      `UPDATE documents SET matter_id = $1, updated_at = NOW()
       WHERE user_id = $2 AND deleted_at IS NULL AND matter_id IS NULL`,
      [matterId, user.id]
    );
    const assignedCount = assignResult.rowCount || 0;
    logger.info(`Assigned ${assignedCount} documents to matter "Гореничі"`);

    // Count total docs on matter
    const totalResult = await db.query(
      `SELECT COUNT(*) FROM documents WHERE matter_id = $1 AND deleted_at IS NULL`,
      [matterId]
    );
    const totalDocs = parseInt(totalResult.rows[0].count, 10);

    logger.info('');
    logger.info('Гореничі seed complete:');
    logger.info(`  User: ${user.name || user.email}`);
    logger.info(`  Client: Особисте (${clientId})`);
    logger.info(`  Matter: Гореничі (${matterNumber})`);
    logger.info(`  Newly assigned: ${assignedCount} documents`);
    logger.info(`  Total on matter: ${totalDocs} documents`);

  } catch (error: any) {
    logger.error('Гореничі seed failed:', error);
    throw error;
  } finally {
    await db.close();
  }
}

seedGorenichiProject()
  .then(() => process.exit(0))
  .catch((error) => {
    logger.error('Fatal error:', error);
    process.exit(1);
  });
