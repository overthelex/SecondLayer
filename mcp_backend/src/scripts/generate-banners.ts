/**
 * Generate Ishihara-style banners for all users without banners
 * Usage: npx tsx src/scripts/generate-banners.ts
 */

import { Database } from '../database/database.js';
import { MinioService } from '../services/minio-service.js';
import { BannerService } from '../services/banner-service.js';
import { logger } from '../utils/logger.js';
import dotenv from 'dotenv';

dotenv.config();

async function generateBanners() {
  const db = new Database();
  const minioService = new MinioService();
  const bannerService = new BannerService(minioService, db);

  try {
    await db.connect();
    console.log('\n========================================');
    console.log('Generate User Banners');
    console.log('========================================\n');

    // Find all users without banners
    const result = await db.query(
      'SELECT id, name, email FROM users WHERE banner IS NULL'
    );

    const users = result.rows;
    console.log(`Found ${users.length} users without banners\n`);

    let success = 0;
    let failed = 0;

    for (const user of users) {
      try {
        const displayName = user.name || user.email;
        await bannerService.generateBanner(user.id, displayName);
        success++;
        console.log(`  [OK] ${user.email} (${displayName})`);
      } catch (err: any) {
        failed++;
        console.error(`  [FAIL] ${user.email}: ${err.message}`);
      }
    }

    console.log(`\nDone: ${success} generated, ${failed} failed`);
  } catch (error) {
    logger.error('Failed to generate banners:', error);
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await db.close();
  }
}

generateBanners();
