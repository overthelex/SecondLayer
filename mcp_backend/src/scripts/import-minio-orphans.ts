/**
 * Import MinIO orphan files into Vault for advocat@legal.org.ua.
 * Creates document records in DB pointing to existing MinIO objects.
 *
 * Usage:
 *   node dist/scripts/import-minio-orphans.js
 *   DRY_RUN=true node dist/scripts/import-minio-orphans.js
 */

import { Client as MinioClient } from 'minio';
import * as pg from 'pg';
import { v4 as uuidv4 } from 'uuid';

const ADVOCAT_USER_ID = '7be91480-b8f9-449e-b025-493e8dd95c64';
const BUCKET = 'user-944dc3c8-fb78-48fc-b479-0dd339067837';
const DRY_RUN = process.env.DRY_RUN === 'true';

// Map file extensions to doc types
function getDocType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'tiff', 'webp'].includes(ext)) return 'other';
  if (ext === 'eml') return 'internal';
  return 'other';
}

function getMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const mimes: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    gif: 'image/gif', bmp: 'image/bmp', tiff: 'image/tiff',
    webp: 'image/webp', eml: 'message/rfc822',
  };
  return mimes[ext] || 'application/octet-stream';
}

function cleanTitle(minioKey: string): string {
  // Extract filename from key like "2026/02/IMG_20220915_170316.jpg"
  const parts = minioKey.split('/');
  const filename = parts[parts.length - 1];
  // Remove extension
  return filename.replace(/\.[^.]+$/, '');
}

async function main() {
  const mc = new MinioClient({
    endPoint: process.env.MINIO_ENDPOINT || 'minio-prod',
    port: parseInt(process.env.MINIO_PORT || '9000', 10),
    useSSL: false,
    accessKey: process.env.MINIO_ACCESS_KEY || process.env.MINIO_ROOT_USER || '',
    secretKey: process.env.MINIO_SECRET_KEY || process.env.MINIO_ROOT_PASSWORD || '',
  });

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

  // 1. List MinIO objects
  const objects: Array<{ name: string; size: number; etag?: string }> = [];
  const stream = mc.listObjects(BUCKET, '', true);
  await new Promise<void>((resolve, reject) => {
    stream.on('data', (obj) => {
      if (obj.name) objects.push({ name: obj.name, size: obj.size || 0, etag: obj.etag });
    });
    stream.on('end', resolve);
    stream.on('error', reject);
  });

  // 2. Get existing minioKeys
  const { rows } = await pool.query(
    `SELECT metadata->>'minioKey' as mkey FROM documents
     WHERE user_id = $1 AND metadata->>'minioKey' IS NOT NULL`,
    [ADVOCAT_USER_ID]
  );
  const dbKeys = new Set(rows.map((r: any) => r.mkey));

  // 3. Find orphans
  const orphans = objects.filter((o) => !dbKeys.has(o.name));
  console.log(`Found ${orphans.length} orphan files to import`);

  if (orphans.length === 0) {
    console.log('Nothing to import.');
    await pool.end();
    return;
  }

  if (DRY_RUN) {
    for (const o of orphans) {
      console.log(`  [DRY] Would import: ${o.name} (${(o.size / 1024).toFixed(0)}KB)`);
    }
    console.log('DRY_RUN — no changes.');
    await pool.end();
    return;
  }

  // 4. Import each orphan
  let imported = 0;
  let errors = 0;

  for (const o of orphans) {
    const docId = uuidv4();
    const title = cleanTitle(o.name);
    const docType = getDocType(o.name);
    const mimeType = getMimeType(o.name);

    const metadata = {
      minioKey: o.name,
      minioBucket: BUCKET,
      minioEtag: o.etag || null,
      mimeType,
      fileSize: o.size,
      originalFilename: o.name.split('/').pop(),
      uploadedAt: new Date().toISOString(),
      source: 'minio-orphan-import',
      folderPath: 'TimeLine/10_Без_дат',
    };

    try {
      await pool.query(
        `INSERT INTO documents (id, title, type, user_id, metadata, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5::jsonb, NOW(), NOW())`,
        [docId, title, docType, ADVOCAT_USER_ID, JSON.stringify(metadata)]
      );
      imported++;
      console.log(`  [OK] ${title} (${mimeType}, ${(o.size / 1024).toFixed(0)}KB)`);
    } catch (err: any) {
      errors++;
      console.error(`  [ERR] ${o.name}: ${err.message}`);
    }
  }

  console.log(`\nDone! Imported: ${imported}, Errors: ${errors}`);
  await pool.end();
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
