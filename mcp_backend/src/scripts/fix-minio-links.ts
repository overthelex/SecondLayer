/**
 * Fix documents that have originalFilename but no minioKey.
 * Links them to existing MinIO objects by matching filenames.
 *
 * Usage: node dist/scripts/fix-minio-links.js
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

  // 1. Build MinIO filename -> full key map
  const filenameToKey = new Map<string, string>();
  const stream = mc.listObjects(BUCKET, '', true);
  await new Promise<void>((resolve, reject) => {
    stream.on('data', (obj) => {
      if (obj.name) {
        const filename = obj.name.split('/').pop() || '';
        filenameToKey.set(filename, obj.name);
      }
    });
    stream.on('end', resolve);
    stream.on('error', reject);
  });
  console.log(`MinIO objects: ${filenameToKey.size}`);

  // 2. Get broken docs: have image mimeType but no minioKey
  const { rows: broken } = await pool.query(
    `SELECT id, title, metadata->>'originalFilename' as orig
     FROM documents
     WHERE user_id = $1 AND deleted_at IS NULL
       AND metadata->>'mimeType' LIKE 'image/%'
       AND metadata->>'minioKey' IS NULL`,
    [ADVOCAT_USER_ID]
  );
  console.log(`Broken docs (image, no minioKey): ${broken.length}`);

  // 3. Fix each one
  let fixed = 0;
  for (const doc of broken) {
    const minioKey = filenameToKey.get(doc.orig);
    if (!minioKey) {
      console.log(`  SKIP ${doc.orig} — not found in MinIO | ${doc.title.slice(0, 50)}`);
      continue;
    }

    await pool.query(
      `UPDATE documents
       SET storage_type = 'minio',
           mime_type = 'image/jpeg',
           metadata = jsonb_set(
             jsonb_set(
               COALESCE(metadata, '{}'::jsonb),
               '{minioKey}', $2::jsonb
             ),
             '{minioBucket}', $3::jsonb
           ),
           updated_at = NOW()
       WHERE id = $1`,
      [doc.id, JSON.stringify(minioKey), JSON.stringify(BUCKET)]
    );
    fixed++;
    console.log(`  OK ${doc.orig} -> ${minioKey} | ${doc.title.slice(0, 50)}`);
  }

  console.log(`\nFixed: ${fixed}/${broken.length}`);
  await pool.end();
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
