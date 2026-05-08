import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { query, closePool } from '../lib/db';
import { logger } from '../lib/logger';
import { detectPII } from '../redaction/pii-detector';

interface DatasetRow {
  session_id: string;
  source_class: string;
  prompt: string | null;
  llm_output: string | null;
  final: string | null;
  edit_chain: {
    from_seq: number;
    to_seq: number;
    edit_distance_norm: number;
    semantic_change_class: string | null;
  }[];
  outcomes: {
    type: string;
    confidence: string;
    window_days: number;
  }[];
  metadata: Record<string, unknown>;
}

interface ExportRow {
  session_id: string;
  source: string;
  surface_tags: string[];
  capture_mode: string;
  artifacts: ArtifactEntry[] | null;
  edits: EditEntry[] | null;
  outcomes: OutcomeEntry[] | null;
  [key: string]: unknown;
}

interface ArtifactEntry {
  role: string;
  sequence_index: number;
  content_redacted: string | null;
  content_raw: string | null;
}

interface EditEntry {
  from_seq: string;
  to_seq: string;
  edit_distance_norm: number;
  semantic_change_class: string | null;
}

interface OutcomeEntry {
  type: string;
  confidence: string;
  window_days: number;
}

function sourceToClass(source: string): string {
  switch (source) {
    case 'github_pr': return 'code';
    case 'plane_issue': return 'task';
    case 'email_thread':
    case 'linkedin_draft': return 'communication';
    case 'claude_code_transcript':
    case 'mcp_call': return 'code';
    default: return 'other';
  }
}

function anonymizeId(id: string): string {
  return crypto.createHash('sha256').update(id).digest('hex').slice(0, 16);
}

async function main() {
  const confirmPublic = process.argv.includes('--confirm-public-release');
  if (!confirmPublic) {
    console.error('Safety check: add --confirm-public-release to export');
    process.exit(1);
  }

  const outputPath = process.argv.find(a => a.startsWith('--output='))?.split('=')[1]
    || path.resolve(__dirname, '../../output/dataset.jsonl');

  logger.info('Building dataset...');

  const sessions = await query<ExportRow>(`
    SELECT ws.session_id, ws.source, ws.surface_tags, ws.capture_mode,
      json_agg(DISTINCT jsonb_build_object(
        'role', wa.role,
        'sequence_index', wa.sequence_index,
        'content_redacted', wa.content_redacted,
        'content_raw', wa.content_raw
      )) FILTER (WHERE wa.artifact_id IS NOT NULL) as artifacts,
      json_agg(DISTINCT jsonb_build_object(
        'from_seq', we.from_artifact_id,
        'to_seq', we.to_artifact_id,
        'edit_distance_norm', we.edit_distance_norm,
        'semantic_change_class', we.semantic_change_class
      )) FILTER (WHERE we.edit_id IS NOT NULL) as edits,
      json_agg(DISTINCT jsonb_build_object(
        'type', wo.outcome_type,
        'confidence', wo.attribution_confidence,
        'window_days', wo.attribution_window_days
      )) FILTER (WHERE wo.outcome_id IS NOT NULL) as outcomes
    FROM workflow_sessions ws
    LEFT JOIN workflow_artifacts wa ON ws.session_id = wa.session_id
    LEFT JOIN workflow_edits we ON ws.session_id = we.session_id
    LEFT JOIN workflow_outcomes wo ON ws.session_id = wo.session_id
    WHERE ws.consent_status = 'granted'
    GROUP BY ws.session_id
  `);

  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const stream = fs.createWriteStream(outputPath);
  let exported = 0;
  let blocked = 0;

  for (const row of sessions.rows) {
    const artifacts = (row.artifacts || []) as ArtifactEntry[];
    const prompt = artifacts.find(a => a.role === 'prompt');
    const llmOutput = artifacts.find(a => a.role === 'llm_output');
    const final = artifacts.find(a => a.role === 'final');

    const getContent = (a: ArtifactEntry | undefined): string | null => {
      if (!a) return null;
      return a.content_redacted || null;
    };

    const allContent = [getContent(prompt), getContent(llmOutput), getContent(final)]
      .filter((c): c is string => c !== null)
      .join(' ');
    const piiMatches = detectPII(allContent);
    if (piiMatches.length > 0) {
      logger.warn(`Blocking session ${row.session_id}: PII detected in redacted content`, {
        pii_types: piiMatches.map(m => m.type),
      });
      blocked++;
      continue;
    }

    const edits = (row.edits || []) as EditEntry[];
    const outcomes = (row.outcomes || []) as OutcomeEntry[];

    const datasetRow: DatasetRow = {
      session_id: anonymizeId(row.session_id),
      source_class: sourceToClass(row.source),
      prompt: getContent(prompt),
      llm_output: getContent(llmOutput),
      final: getContent(final),
      edit_chain: edits.map(e => ({
        from_seq: 0,
        to_seq: 0,
        edit_distance_norm: e.edit_distance_norm,
        semantic_change_class: e.semantic_change_class,
      })),
      outcomes: outcomes.map(o => ({
        type: o.type,
        confidence: o.confidence,
        window_days: o.window_days,
      })),
      metadata: {
        source_class: sourceToClass(row.source),
        surface_tags: row.surface_tags,
        capture_mode: row.capture_mode,
      },
    };

    stream.write(JSON.stringify(datasetRow) + '\n');
    exported++;
  }

  stream.end();
  logger.info(`Dataset exported: ${exported} sessions, ${blocked} blocked for PII`);
  logger.info(`Output: ${outputPath}`);
  await closePool();
}

main().catch(err => {
  logger.error('Dataset export failed', { error: err.message });
  process.exit(1);
});
