/**
 * Upload missing original files from local GORENICHI directory to MinIO on prod,
 * convert PDFs to preview JPGs via pdftoppm, and link to DB documents.
 *
 * Requires SSH tunnel: ssh -L 9006:minio-prod:9000 -L 5438:postgres-prod:5432 prod
 *
 * Usage:
 *   DATABASE_URL=postgresql://secondlayer:PASSWORD@localhost:5438/secondlayer_prod \
 *   MINIO_ENDPOINT=localhost MINIO_PORT=9006 \
 *   MINIO_ACCESS_KEY=xxx MINIO_SECRET_KEY=xxx \
 *   node dist/scripts/upload-missing-originals.js
 *
 *   DRY_RUN=true ... (preview only)
 */

import { Client as MinioClient } from 'minio';
import * as pg from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const ADVOCAT_USER_ID = '7be91480-b8f9-449e-b025-493e8dd95c64';
const MINIO_BUCKET = 'user-944dc3c8-fb78-48fc-b479-0dd339067837';
const DRY_RUN = process.env.DRY_RUN === 'true';
const GORENICHI_DIR = process.env.GORENICHI_DIR || '/home/vovkes/Downloads/GORENICHI';

function getMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const mimes: Record<string, string> = {
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    txt: 'text/plain',
    eml: 'message/rfc822',
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  };
  return mimes[ext] || 'application/octet-stream';
}

function findFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...findFiles(full));
    else if (entry.isFile()) results.push(full);
  }
  return results;
}

function pdfToJpg(pdfPath: string, outputDir: string): string[] {
  // Convert PDF pages to JPG using pdftoppm
  const prefix = path.join(outputDir, 'page');
  try {
    execSync(`pdftoppm -jpeg -r 200 "${pdfPath}" "${prefix}"`, { timeout: 30000 });
  } catch (err: any) {
    console.log(`    pdftoppm failed: ${err.message.slice(0, 100)}`);
    return [];
  }
  // pdftoppm creates page-1.jpg, page-2.jpg, etc.
  const pages = fs.readdirSync(outputDir)
    .filter(f => f.startsWith('page-') && f.endsWith('.jpg'))
    .sort();
  return pages.map(f => path.join(outputDir, f));
}

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const mc = new MinioClient({
    endPoint: process.env.MINIO_ENDPOINT || 'localhost',
    port: parseInt(process.env.MINIO_PORT || '9006', 10),
    useSSL: false,
    accessKey: process.env.MINIO_ACCESS_KEY || '',
    secretKey: process.env.MINIO_SECRET_KEY || '',
  });

  // 1. Get docs without minioKey
  const { rows: docs } = await pool.query(
    `SELECT id, title, metadata->>'originalFilename' as orig, metadata->>'mimeType' as mime
     FROM documents
     WHERE user_id = $1 AND deleted_at IS NULL
       AND metadata->>'minioKey' IS NULL
       AND metadata->>'originalFilename' IS NOT NULL`,
    [ADVOCAT_USER_ID],
  );
  console.log(`Documents without minioKey: ${docs.length}`);

  // 2. Build local file map
  const allFiles = findFiles(GORENICHI_DIR);
  const fileMap = new Map<string, string>();
  for (const f of allFiles) {
    const basename = path.basename(f);
    if (!fileMap.has(basename)) fileMap.set(basename, f);
  }
  console.log(`Local files: ${fileMap.size}`);

  // 3. Match docs to local files
  const matched = docs.filter(d => fileMap.has(d.orig));
  const unmatched = docs.filter(d => !fileMap.has(d.orig));
  console.log(`Matched: ${matched.length}, Unmatched: ${unmatched.length}`);

  if (unmatched.length > 0) {
    console.log('\nUnmatched files (not in GORENICHI):');
    for (const d of unmatched) console.log(`  ${d.orig} | ${d.title.slice(0, 50)}`);
  }

  if (DRY_RUN) {
    console.log('\nMatched files (DRY_RUN):');
    for (const d of matched) console.log(`  ${d.orig} -> MinIO | ${d.title.slice(0, 50)}`);
    await pool.end();
    return;
  }

  // 4. Process each matched doc
  const tmpDir = '/tmp/pdf-convert';
  fs.mkdirSync(tmpDir, { recursive: true });

  let uploaded = 0;
  let previewCount = 0;
  let errors = 0;

  for (const doc of matched) {
    const localPath = fileMap.get(doc.orig)!;
    const mime = getMimeType(doc.orig);
    const minioKey = `2026/03/${doc.orig}`;

    try {
      // Upload original to MinIO
      const fileBuffer = fs.readFileSync(localPath);
      await mc.putObject(MINIO_BUCKET, minioKey, fileBuffer, fileBuffer.length, {
        'Content-Type': mime,
      });

      // Update DB
      await pool.query(
        `UPDATE documents
         SET storage_type = 'minio',
             mime_type = $2,
             file_size = $3,
             metadata = jsonb_set(
               jsonb_set(
                 jsonb_set(
                   COALESCE(metadata, '{}'::jsonb),
                   '{minioKey}', $4::jsonb
                 ),
                 '{minioBucket}', $5::jsonb
               ),
               '{fileSize}', $6::jsonb
             ),
             updated_at = NOW()
         WHERE id = $1`,
        [doc.id, mime, fileBuffer.length, JSON.stringify(minioKey),
         JSON.stringify(MINIO_BUCKET), JSON.stringify(fileBuffer.length)],
      );

      uploaded++;
      console.log(`[OK] ${doc.orig} (${(fileBuffer.length / 1024).toFixed(0)}KB) | ${doc.title.slice(0, 55)}`);

      // For PDFs: convert to preview images
      if (doc.orig.toLowerCase().endsWith('.pdf')) {
        const pageDir = path.join(tmpDir, doc.id);
        fs.mkdirSync(pageDir, { recursive: true });

        const pageFiles = pdfToJpg(localPath, pageDir);
        if (pageFiles.length > 0) {
          // Upload first page as preview
          const previewKey = `2026/03/preview_${doc.id}_p1.jpg`;
          const previewBuffer = fs.readFileSync(pageFiles[0]);
          await mc.putObject(MINIO_BUCKET, previewKey, previewBuffer, previewBuffer.length, {
            'Content-Type': 'image/jpeg',
          });

          // Store preview key in metadata
          await pool.query(
            `UPDATE documents
             SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{previewKey}', $2::jsonb),
                 updated_at = NOW()
             WHERE id = $1`,
            [doc.id, JSON.stringify(previewKey)],
          );

          previewCount++;
          console.log(`  [PREVIEW] ${pageFiles.length} pages, preview: ${previewKey}`);
        }

        // Cleanup temp files
        for (const f of pageFiles) fs.unlinkSync(f);
        fs.rmdirSync(pageDir);
      }
    } catch (err: any) {
      errors++;
      console.error(`[ERR] ${doc.orig}: ${err.message}`);
    }
  }

  // Cleanup
  try { fs.rmdirSync(tmpDir); } catch {}

  console.log(`\nDone! Uploaded: ${uploaded}, PDF previews: ${previewCount}, Errors: ${errors}`);
  await pool.end();
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
