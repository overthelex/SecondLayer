/**
 * Generate preview JPGs for DOCX/DOC documents via LibreOffice + pdftoppm.
 * Uploads preview to MinIO and stores previewKey in metadata.
 *
 * Requires SSH tunnel: ssh -L 9006:minio-prod:9000 -L 5438:postgres-prod:5432 prod
 *
 * Usage:
 *   DATABASE_URL=postgresql://secondlayer:PASSWORD@localhost:5438/secondlayer_prod \
 *   MINIO_ENDPOINT=localhost MINIO_PORT=9006 \
 *   MINIO_ACCESS_KEY=xxx MINIO_SECRET_KEY=xxx \
 *   node dist/scripts/generate-docx-previews.js
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

function findFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...findFiles(full));
    else if (entry.isFile()) results.push(full);
  }
  return results;
}

function docxToPdf(docPath: string, outputDir: string): string | null {
  try {
    execSync(
      `libreoffice --headless --convert-to pdf --outdir "${outputDir}" "${docPath}"`,
      { timeout: 60000, stdio: 'pipe' },
    );
    const baseName = path.basename(docPath).replace(/\.[^.]+$/, '') + '.pdf';
    const pdfPath = path.join(outputDir, baseName);
    if (fs.existsSync(pdfPath)) return pdfPath;
    // LibreOffice may sanitize the filename — find any new PDF
    const pdfs = fs.readdirSync(outputDir).filter(f => f.endsWith('.pdf'));
    return pdfs.length > 0 ? path.join(outputDir, pdfs[0]) : null;
  } catch (err: any) {
    console.log(`    libreoffice failed: ${err.message.slice(0, 120)}`);
    return null;
  }
}

function pdfToJpg(pdfPath: string, outputDir: string): string[] {
  const prefix = path.join(outputDir, 'page');
  try {
    execSync(`pdftoppm -jpeg -r 200 -f 1 -l 1 "${pdfPath}" "${prefix}"`, { timeout: 30000 });
  } catch (err: any) {
    console.log(`    pdftoppm failed: ${err.message.slice(0, 100)}`);
    return [];
  }
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

  // 1. Get DOCX/DOC docs without previewKey
  const { rows: docs } = await pool.query(
    `SELECT id, title, metadata->>'originalFilename' as orig, metadata->>'minioKey' as minio_key
     FROM documents
     WHERE user_id = $1 AND deleted_at IS NULL
       AND metadata->>'previewKey' IS NULL
       AND (mime_type LIKE '%word%' OR mime_type LIKE '%msword%'
            OR metadata->>'originalFilename' LIKE '%.docx'
            OR metadata->>'originalFilename' LIKE '%.doc')`,
    [ADVOCAT_USER_ID],
  );
  console.log(`DOCX/DOC docs without preview: ${docs.length}`);

  // 2. Build local file map from GORENICHI
  const allFiles = findFiles(GORENICHI_DIR);
  const fileMap = new Map<string, string>();
  for (const f of allFiles) {
    const basename = path.basename(f);
    if (!fileMap.has(basename)) fileMap.set(basename, f);
  }
  console.log(`Local files: ${fileMap.size}`);

  // 3. Match docs to local files
  const matched = docs.filter(d => d.orig && fileMap.has(d.orig));
  const unmatched = docs.filter(d => !d.orig || !fileMap.has(d.orig));
  console.log(`Matched: ${matched.length}, Unmatched: ${unmatched.length}`);

  if (unmatched.length > 0) {
    console.log('\nUnmatched:');
    for (const d of unmatched) console.log(`  ${d.orig || '(no filename)'} | ${d.title.slice(0, 60)}`);
  }

  if (DRY_RUN) {
    console.log('\nMatched (DRY_RUN):');
    for (const d of matched) console.log(`  ${d.orig} | ${d.title.slice(0, 60)}`);
    await pool.end();
    return;
  }

  // 4. Convert and upload
  const tmpDir = '/tmp/docx-convert';
  fs.mkdirSync(tmpDir, { recursive: true });

  let previews = 0;
  let errors = 0;

  for (const doc of matched) {
    const localPath = fileMap.get(doc.orig)!;
    const workDir = path.join(tmpDir, doc.id);
    fs.mkdirSync(workDir, { recursive: true });

    try {
      // DOCX/DOC → PDF
      console.log(`  Converting: ${doc.orig}...`);
      const pdfPath = docxToPdf(localPath, workDir);
      if (!pdfPath) {
        console.log(`  [SKIP] No PDF output for ${doc.orig}`);
        errors++;
        cleanup(workDir);
        continue;
      }

      // PDF → JPG (first page only)
      const jpgFiles = pdfToJpg(pdfPath, workDir);
      if (jpgFiles.length === 0) {
        console.log(`  [SKIP] No JPG output for ${doc.orig}`);
        errors++;
        cleanup(workDir);
        continue;
      }

      // Upload preview JPG to MinIO
      const previewKey = `2026/03/preview_${doc.id}_p1.jpg`;
      const previewBuffer = fs.readFileSync(jpgFiles[0]);
      await mc.putObject(MINIO_BUCKET, previewKey, previewBuffer, previewBuffer.length, {
        'Content-Type': 'image/jpeg',
      });

      // Store previewKey in metadata
      await pool.query(
        `UPDATE documents
         SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{previewKey}', $2::jsonb),
             updated_at = NOW()
         WHERE id = $1`,
        [doc.id, JSON.stringify(previewKey)],
      );

      previews++;
      console.log(`  [OK] ${doc.orig} -> ${previewKey} (${(previewBuffer.length / 1024).toFixed(0)}KB)`);

      cleanup(workDir);
    } catch (err: any) {
      errors++;
      console.error(`  [ERR] ${doc.orig}: ${err.message}`);
      cleanup(workDir);
    }
  }

  // Cleanup
  try { fs.rmdirSync(tmpDir); } catch {}

  console.log(`\nDone! Previews: ${previews}, Errors: ${errors}`);
  await pool.end();
}

function cleanup(dir: string) {
  try {
    for (const f of fs.readdirSync(dir)) fs.unlinkSync(path.join(dir, f));
    fs.rmdirSync(dir);
  } catch {}
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
