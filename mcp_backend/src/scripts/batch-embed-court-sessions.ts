/**
 * Bedrock Batch Inference for court_sessions embeddings.
 *
 * Pipeline:
 *   1. Export court_sessions → JSONL files (100K records each)
 *   2. Upload JSONL to S3
 *   3. Create Bedrock batch inference jobs
 *   4. Poll for completion
 *   5. Download results → upsert to Qdrant
 *
 * Usage:
 *   npx tsx src/scripts/batch-embed-court-sessions.ts prepare   # Steps 1-2: export + upload
 *   npx tsx src/scripts/batch-embed-court-sessions.ts submit    # Step 3: create batch jobs
 *   npx tsx src/scripts/batch-embed-court-sessions.ts status    # Step 4: check job status
 *   npx tsx src/scripts/batch-embed-court-sessions.ts ingest    # Step 5: download + upsert to Qdrant
 */

import {
  BedrockClient,
  CreateModelInvocationJobCommand,
  GetModelInvocationJobCommand,
  ListModelInvocationJobsCommand,
} from '@aws-sdk/client-bedrock';
import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { QdrantClient } from '@qdrant/js-client-rest';
import { Pool } from 'pg';
import * as fs from 'fs';
import * as readline from 'readline';
import { v4 as uuidv4 } from 'uuid';
import { Readable } from 'stream';

// ── Config ──────────────────────────────────────────────────────────────────
const EMBEDDING_DIM = 1024;
const TITAN_MODEL_ID = 'amazon.titan-embed-text-v2:0';
const S3_BUCKET = 'secondlayer-bedrock-batch';
const S3_PREFIX = 'court-sessions';
const ROLE_ARN = 'arn:aws:iam::272594900302:role/BedrockBatchEmbeddings';
const RECORDS_PER_FILE = 50000; // Bedrock limit: 100K per job, use 50K for safety
const WORK_DIR = '/tmp/bedrock-batch-court-sessions';
const QDRANT_UPSERT_BATCH = 100;

const AWS_CONFIG = {
  region: process.env.AWS_REGION || 'eu-central-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
};

// ── Clients ─────────────────────────────────────────────────────────────────
const s3 = new S3Client(AWS_CONFIG);
const bedrock = new BedrockClient(AWS_CONFIG);
const qdrant = new QdrantClient({ url: process.env.QDRANT_URL || 'http://localhost:6333' });
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  user: process.env.POSTGRES_USER || 'secondlayer',
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DB || 'secondlayer_prod',
  max: 5,
});

// ── Step 1: Prepare JSONL files ─────────────────────────────────────────────

async function prepare(): Promise<void> {
  fs.mkdirSync(WORK_DIR, { recursive: true });

  // Use approximate count to avoid slow count(*) on large table
  const countResult = await pool.query(
    `SELECT reltuples::bigint AS estimate FROM pg_class WHERE relname = 'court_sessions'`
  );
  const total = parseInt(countResult.rows[0].estimate) || 21000000;
  console.log(`Court sessions (estimated): ${total.toLocaleString()}`);
  console.log(`Files to create: ~${Math.ceil(total / RECORDS_PER_FILE)}`);

  const PAGE = 10000;
  // Resume support: find last completed file and its last record ID
  const existingFiles = fs.readdirSync(WORK_DIR).filter((f) => f.endsWith('.jsonl')).sort();
  let lastId = '00000000-0000-0000-0000-000000000000';
  let fileIdx = 0;
  let totalProcessed = 0;

  if (existingFiles.length > 0) {
    // Check all complete files (expect ~31MB each)
    for (const file of existingFiles) {
      const filePath = `${WORK_DIR}/${file}`;
      const stat = fs.statSync(filePath);
      if (stat.size < 30 * 1024 * 1024) {
        // Incomplete file — remove and redo from here
        fs.unlinkSync(filePath);
        console.log(`  Removed incomplete file: ${file}`);
        break;
      }
      fileIdx++;
      totalProcessed += RECORDS_PER_FILE;
    }

    if (fileIdx > 0) {
      // Read last ID from last complete file
      const lastFile = `${WORK_DIR}/${existingFiles[fileIdx - 1]}`;
      const lines = fs.readFileSync(lastFile, 'utf-8').trim().split('\n');
      const lastRecord = JSON.parse(lines[lines.length - 1]);
      lastId = lastRecord.recordId;
      console.log(`  Resuming from file ${fileIdx + 1}, after ID ${lastId} (${totalProcessed.toLocaleString()} records done)`);
    }
  }

  let recordsInFile = 0;
  let fd: fs.WriteStream | null = null;

  while (true) {
    const { rows } = await pool.query(
      `SELECT id, case_number, court_name, judge_name, session_date,
              session_time, session_form, justice_kind, involved_parties, session_place
       FROM court_sessions
       WHERE id > $1::uuid
       ORDER BY id
       LIMIT $2`,
      [lastId, PAGE]
    );

    if (rows.length === 0) break;
    lastId = rows[rows.length - 1].id;

    for (const row of rows) {
      // Skip rows without meaningful text
      const hasText = row.involved_parties || row.court_name || row.case_number;
      if (!hasText) continue;

      // Start new file if needed
      if (!fd || recordsInFile >= RECORDS_PER_FILE) {
        if (fd) {
          fd.end();
          console.log(`  Created file ${fileIdx}: ${recordsInFile.toLocaleString()} records`);
        }
        fileIdx++;
        recordsInFile = 0;
        const filePath = `${WORK_DIR}/batch_${String(fileIdx).padStart(4, '0')}.jsonl`;
        fd = fs.createWriteStream(filePath);
      }

      const text = [
        row.court_name,
        row.justice_kind,
        `Справа ${row.case_number}`,
        row.judge_name ? `Суддя: ${row.judge_name}` : '',
        row.session_form ? `Форма: ${row.session_form}` : '',
        row.involved_parties,
      ].filter(Boolean).join(' | ');

      // Bedrock batch format
      const record = {
        recordId: String(row.id),
        modelInput: {
          inputText: text.slice(0, 8192),
          dimensions: EMBEDDING_DIM,
          normalize: true,
        },
      };

      fd!.write(JSON.stringify(record) + '\n');
      recordsInFile++;
      totalProcessed++;
    }

    if (totalProcessed % 100000 === 0) {
      console.log(`  Exported ${totalProcessed.toLocaleString()}/${total.toLocaleString()} (${((totalProcessed / total) * 100).toFixed(1)}%)`);
    }
  }

  if (fd) {
    fd.end();
    console.log(`  Created file ${fileIdx}: ${recordsInFile.toLocaleString()} records`);
  }

  console.log(`\nExport complete: ${totalProcessed.toLocaleString()} records in ${fileIdx} files`);

  // Upload to S3
  console.log('\nUploading to S3...');
  const files = fs.readdirSync(WORK_DIR).filter((f) => f.endsWith('.jsonl')).sort();
  for (const file of files) {
    const filePath = `${WORK_DIR}/${file}`;
    const fileContent = fs.readFileSync(filePath);
    const s3Key = `${S3_PREFIX}/input/${file}`;

    await s3.send(new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: s3Key,
      Body: fileContent,
      ContentType: 'application/jsonl',
    }));

    const sizeMB = (fileContent.length / 1024 / 1024).toFixed(1);
    console.log(`  Uploaded ${s3Key} (${sizeMB} MB)`);
  }

  console.log('\nAll files uploaded. Run "submit" to create batch jobs.');
}

// ── Step 2: Submit batch jobs ───────────────────────────────────────────────

async function submit(): Promise<void> {
  // List input files in S3
  const listResult = await s3.send(new ListObjectsV2Command({
    Bucket: S3_BUCKET,
    Prefix: `${S3_PREFIX}/input/`,
  }));

  const inputFiles = (listResult.Contents || [])
    .filter((obj) => obj.Key?.endsWith('.jsonl'))
    .sort((a, b) => a.Key!.localeCompare(b.Key!));

  console.log(`Found ${inputFiles.length} input files in S3`);

  // Check existing jobs to avoid duplicates
  const existingJobs = await listJobs();
  const submittedFiles = new Set(existingJobs.map((j) => j.inputKey));

  let submitted = 0;
  for (const file of inputFiles) {
    const inputKey = file.Key!;
    if (submittedFiles.has(inputKey)) {
      console.log(`  Skip ${inputKey} (already submitted)`);
      continue;
    }

    const batchName = inputKey.split('/').pop()!.replace('.jsonl', '');
    const outputPrefix = `${S3_PREFIX}/output/${batchName}/`;

    try {
      const result = await bedrock.send(new CreateModelInvocationJobCommand({
        jobName: `court-sessions-${batchName}-${Date.now()}`,
        modelId: TITAN_MODEL_ID,
        roleArn: ROLE_ARN,
        inputDataConfig: {
          s3InputDataConfig: {
            s3Uri: `s3://${S3_BUCKET}/${inputKey}`,
            s3InputFormat: 'JSONL',
          },
        },
        outputDataConfig: {
          s3OutputDataConfig: {
            s3Uri: `s3://${S3_BUCKET}/${outputPrefix}`,
          },
        },
      }));

      console.log(`  Submitted ${batchName}: ${result.jobArn}`);
      submitted++;

      // Small delay between submissions
      await new Promise((r) => setTimeout(r, 500));
    } catch (err: any) {
      console.error(`  Failed ${batchName}: ${err.message}`);
      if (err.name === 'ThrottlingException') {
        console.log('  Waiting 10s before next submission...');
        await new Promise((r) => setTimeout(r, 10000));
      }
    }
  }

  console.log(`\nSubmitted ${submitted} new jobs. Run "status" to monitor.`);
}

// ── Step 3: Check status ────────────────────────────────────────────────────

interface JobInfo {
  jobArn: string;
  jobName: string;
  status: string;
  inputKey: string;
  message?: string;
}

async function listJobs(): Promise<JobInfo[]> {
  const jobs: JobInfo[] = [];
  let nextToken: string | undefined;

  do {
    const result = await bedrock.send(new ListModelInvocationJobsCommand({
      maxResults: 100,
      nextToken,
      nameContains: 'court-sessions',
    }));

    for (const job of result.invocationJobSummaries || []) {
      jobs.push({
        jobArn: job.jobArn!,
        jobName: job.jobName!,
        status: job.status!,
        inputKey: '', // filled below if needed
        message: job.message,
      });
    }

    nextToken = result.nextToken;
  } while (nextToken);

  return jobs;
}

async function status(): Promise<void> {
  const jobs = await listJobs();

  const byStatus: Record<string, number> = {};
  for (const job of jobs) {
    byStatus[job.status] = (byStatus[job.status] || 0) + 1;
  }

  console.log(`\nBatch jobs summary:`);
  for (const [status, count] of Object.entries(byStatus)) {
    console.log(`  ${status}: ${count}`);
  }
  console.log(`  Total: ${jobs.length}`);

  // Show failed jobs
  const failed = jobs.filter((j) => j.status === 'Failed');
  if (failed.length > 0) {
    console.log('\nFailed jobs:');
    for (const j of failed) {
      console.log(`  ${j.jobName}: ${j.message || 'no message'}`);
    }
  }

  // Check if all done
  const completed = jobs.filter((j) => j.status === 'Completed').length;
  const inProgress = jobs.filter((j) => ['InProgress', 'Submitted', 'Validating', 'Scheduled'].includes(j.status)).length;

  if (inProgress > 0) {
    console.log(`\n${inProgress} jobs still in progress. Check again later.`);
  } else if (completed === jobs.length && jobs.length > 0) {
    console.log(`\nAll ${completed} jobs completed! Run "ingest" to load vectors into Qdrant.`);
  }
}

// ── Step 4: Ingest results into Qdrant ──────────────────────────────────────

async function ensureCollection(): Promise<void> {
  const COLLECTION = 'court_sessions_vectors';
  const collections = await qdrant.getCollections();
  const exists = collections.collections.some((c) => c.name === COLLECTION);
  if (!exists) {
    await qdrant.createCollection(COLLECTION, {
      vectors: { size: EMBEDDING_DIM, distance: 'Cosine' },
      on_disk_payload: true,
    });
    for (const field of ['court_name', 'justice_kind', 'session_date', 'judge_name']) {
      await qdrant.createPayloadIndex(COLLECTION, {
        field_name: field,
        field_schema: 'keyword',
      });
    }
    console.log(`Created collection: ${COLLECTION}`);
  }
}

async function ingest(): Promise<void> {
  const COLLECTION = 'court_sessions_vectors';
  await ensureCollection();

  // Build metadata lookup from DB
  // Skip loading all 21M metadata into memory — fetch on-demand during ingestion
  console.log('Will fetch metadata on-demand during ingestion (21M records too large for memory)');

  // List output files in S3
  const listResult = await s3.send(new ListObjectsV2Command({
    Bucket: S3_BUCKET,
    Prefix: `${S3_PREFIX}/output/`,
  }));

  const outputFiles = (listResult.Contents || [])
    .filter((obj) => obj.Key?.endsWith('.jsonl.out'))
    .sort((a, b) => a.Key!.localeCompare(b.Key!));

  console.log(`\nFound ${outputFiles.length} output files to ingest`);

  // Track progress
  const checkpointPath = `${WORK_DIR}/ingest-checkpoint.json`;
  let processedFiles = new Set<string>();
  if (fs.existsSync(checkpointPath)) {
    processedFiles = new Set(JSON.parse(fs.readFileSync(checkpointPath, 'utf-8')));
    console.log(`Resuming: ${processedFiles.size} files already ingested`);
  }

  let totalPoints = 0;
  let totalTokens = 0;

  for (const file of outputFiles) {
    if (processedFiles.has(file.Key!)) continue;

    console.log(`\nProcessing ${file.Key}...`);

    // Download from S3
    const getResult = await s3.send(new GetObjectCommand({
      Bucket: S3_BUCKET,
      Key: file.Key!,
    }));

    const stream = getResult.Body as Readable;
    const rl = readline.createInterface({ input: stream });

    const points: Array<{ id: string; vector: number[]; payload: Record<string, any> }> = [];

    for await (const line of rl) {
      if (!line.trim()) continue;

      try {
        const result = JSON.parse(line);
        const recordId = result.recordId;
        const output = result.modelOutput;

        if (!output?.embedding) {
          if (result.error) console.warn(`  Error for ${recordId}: ${result.error}`);
          continue;
        }

        // Extract metadata from the input text itself (avoid 21M memory load)
        const inputText = result.modelInput?.inputText || '';
        const parts = inputText.split(' | ');

        points.push({
          id: uuidv4(),
          vector: output.embedding,
          payload: {
            source: 'court_sessions',
            doc_id: recordId,
            court_name: parts[0] || null,
            justice_kind: parts[1] || null,
            case_number: parts[2]?.replace('Справа ', '') || null,
            text: inputText,
            chunk_index: 0,
            total_chunks: 1,
          },
        });

        totalTokens += output.inputTextTokenCount || 0;

        // Flush to Qdrant in batches
        if (points.length >= QDRANT_UPSERT_BATCH) {
          await upsertBatch(COLLECTION, points.splice(0, QDRANT_UPSERT_BATCH));
          totalPoints += QDRANT_UPSERT_BATCH;
        }
      } catch (err: any) {
        console.warn(`  Parse error: ${err.message}`);
      }
    }

    // Flush remaining
    if (points.length > 0) {
      await upsertBatch(COLLECTION, points);
      totalPoints += points.length;
    }

    processedFiles.add(file.Key!);
    fs.mkdirSync(WORK_DIR, { recursive: true });
    fs.writeFileSync(checkpointPath, JSON.stringify(Array.from(processedFiles)));

    const costEst = (totalTokens / 1_000_000 * 0.01).toFixed(2);
    console.log(`  Ingested. Total: ${totalPoints.toLocaleString()} vectors, ${totalTokens.toLocaleString()} tokens (~$${costEst})`);
  }

  console.log(`\n=== Ingest complete ===`);
  console.log(`Vectors: ${totalPoints.toLocaleString()}`);
  console.log(`Tokens: ${totalTokens.toLocaleString()}`);
  console.log(`Cost: ~$${(totalTokens / 1_000_000 * 0.01).toFixed(2)}`);
}

async function upsertBatch(
  collection: string,
  points: Array<{ id: string; vector: number[]; payload: Record<string, any> }>
): Promise<void> {
  let retries = 3;
  while (retries > 0) {
    try {
      await qdrant.upsert(collection, { wait: true, points });
      return;
    } catch (err: any) {
      retries--;
      if (retries === 0) throw err;
      console.warn(`  Qdrant retry: ${err.message}`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const command = process.argv[2];

  if (!command || !['prepare', 'submit', 'status', 'ingest'].includes(command)) {
    console.log('Usage: npx tsx batch-embed-court-sessions.ts <prepare|submit|status|ingest>');
    console.log('  prepare - Export court_sessions to JSONL and upload to S3');
    console.log('  submit  - Create Bedrock batch inference jobs');
    console.log('  status  - Check job status');
    console.log('  ingest  - Download results and upsert to Qdrant');
    process.exit(1);
  }

  console.log(`=== Bedrock Batch: court_sessions (${command}) ===\n`);

  if (command === 'prepare') await prepare();
  if (command === 'submit') await submit();
  if (command === 'status') await status();
  if (command === 'ingest') await ingest();

  await pool.end();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
