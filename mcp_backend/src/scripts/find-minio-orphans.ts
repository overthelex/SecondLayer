/**
 * Find objects in MinIO that are NOT in the Vault (documents table).
 *
 * Usage: node dist/scripts/find-minio-orphans.js
 */

import { Client as MinioClient } from 'minio';
import * as pg from 'pg';

const ADVOCAT_USER_ID = '7be91480-b8f9-449e-b025-493e8dd95c64';
const BUCKET = 'user-944dc3c8-fb78-48fc-b479-0dd339067837';

async function main() {
  const mc = new MinioClient({
    endPoint: process.env.MINIO_ENDPOINT || 'minio-prod',
    port: parseInt(process.env.MINIO_PORT || '9000', 10),
    useSSL: false,
    accessKey: process.env.MINIO_ACCESS_KEY || process.env.MINIO_ROOT_USER || '',
    secretKey: process.env.MINIO_SECRET_KEY || process.env.MINIO_ROOT_PASSWORD || '',
  });

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

  // 1. List all objects in bucket
  const objects: Array<{ name: string; size: number }> = [];
  const stream = mc.listObjects(BUCKET, '', true);
  await new Promise<void>((resolve, reject) => {
    stream.on('data', (obj) => {
      if (obj.name) objects.push({ name: obj.name, size: obj.size || 0 });
    });
    stream.on('end', resolve);
    stream.on('error', reject);
  });

  console.log(`Total MinIO objects in ${BUCKET}: ${objects.length}`);

  // 2. Get all minioKeys from DB (including deleted docs to avoid re-importing)
  const { rows } = await pool.query(
    `SELECT metadata->>'minioKey' as mkey FROM documents
     WHERE user_id = $1 AND metadata->>'minioKey' IS NOT NULL`,
    [ADVOCAT_USER_ID]
  );
  const dbKeys = new Set(rows.map((r: any) => r.mkey));
  console.log(`DB minioKeys (inc. deleted): ${dbKeys.size}`);

  // 3. Find orphans
  const orphans = objects.filter((o) => !dbKeys.has(o.name));
  console.log(`\nIn MinIO but NOT in Vault: ${orphans.length}`);

  if (orphans.length === 0) {
    console.log('Nothing to import.');
    await pool.end();
    return;
  }

  // 4. Categorize by extension
  const byExt = new Map<string, number>();
  for (const o of orphans) {
    const ext = o.name.split('.').pop()?.toLowerCase() || 'unknown';
    byExt.set(ext, (byExt.get(ext) || 0) + 1);
  }

  console.log('\nBy extension:');
  for (const [ext, count] of Array.from(byExt.entries()).sort()) {
    console.log(`  .${ext}: ${count}`);
  }

  console.log('\nOrphan files:');
  for (const o of orphans) {
    const ext = o.name.split('.').pop()?.toLowerCase() || '';
    const sizeKB = (o.size / 1024).toFixed(0);
    console.log(`  ${ext.padEnd(5)} ${sizeKB.padStart(7)}KB  ${o.name}`);
  }

  await pool.end();
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
