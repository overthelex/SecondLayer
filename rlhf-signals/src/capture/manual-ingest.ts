import fs from 'fs';
import { logger } from '../lib/logger';
import { closePool } from '../lib/db';
import { upsertSession, upsertArtifact, insertEdit, contentHash } from '../schema/queries';
import { withTransaction } from '../lib/db';
import levenshtein from 'js-levenshtein';

function simpleTokenize(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

async function main() {
  const args = process.argv.slice(2);
  const getArg = (name: string): string | undefined => {
    const idx = args.indexOf(`--${name}`);
    return idx >= 0 ? args[idx + 1] : undefined;
  };

  const source = getArg('source') || 'manual';
  const promptFile = getArg('prompt-file');
  const outputFile = getArg('output-file');
  const finalFile = getArg('final-file');
  const terminalAction = getArg('terminal-action');

  if (!promptFile) {
    console.error('Usage: pnpm rlhf:ingest --source <source> --prompt-file <path> [--output-file <path>] [--final-file <path>] [--terminal-action <action>]');
    process.exit(1);
  }

  const promptContent = fs.readFileSync(promptFile, 'utf-8');

  await withTransaction(async (client) => {
    const sessionId = await upsertSession({
      source: source as any,
      external_ref: `manual_${Date.now()}`,
      surface_tags: [],
      created_at: new Date(),
      terminal_at: terminalAction ? new Date() : null,
      terminal_action: terminalAction || null,
      thread_position: null,
      capture_mode: 'live',
      consent_status: 'pending',
      metadata: { prompt_file: promptFile, output_file: outputFile, final_file: finalFile },
    }, client);

    let seqIdx = 0;
    const artifactIds: string[] = [];

    const promptId = await upsertArtifact({
      session_id: sessionId,
      role: 'prompt',
      sequence_index: seqIdx++,
      content_raw: promptContent,
      content_redacted: null,
      content_hash: contentHash(promptContent),
      token_count: simpleTokenize(promptContent).length,
      timestamp: new Date(),
      metadata: {},
    }, client);
    artifactIds.push(promptId);

    if (outputFile && fs.existsSync(outputFile)) {
      const outputContent = fs.readFileSync(outputFile, 'utf-8');
      const id = await upsertArtifact({
        session_id: sessionId,
        role: 'llm_output',
        sequence_index: seqIdx++,
        content_raw: outputContent,
        content_redacted: null,
        content_hash: contentHash(outputContent),
        token_count: simpleTokenize(outputContent).length,
        timestamp: new Date(),
        metadata: {},
      }, client);
      artifactIds.push(id);
    }

    if (finalFile && fs.existsSync(finalFile)) {
      const finalContent = fs.readFileSync(finalFile, 'utf-8');
      const id = await upsertArtifact({
        session_id: sessionId,
        role: 'final',
        sequence_index: seqIdx++,
        content_raw: finalContent,
        content_redacted: null,
        content_hash: contentHash(finalContent),
        token_count: simpleTokenize(finalContent).length,
        timestamp: new Date(),
        metadata: {},
      }, client);
      artifactIds.push(id);
    }

    for (let i = 1; i < artifactIds.length; i++) {
      const fromResult = await client.query(
        'SELECT content_raw FROM workflow_artifacts WHERE artifact_id = $1',
        [artifactIds[i - 1]]
      );
      const toResult = await client.query(
        'SELECT content_raw FROM workflow_artifacts WHERE artifact_id = $1',
        [artifactIds[i]]
      );
      const fromContent = fromResult.rows[0]?.content_raw || '';
      const toContent = toResult.rows[0]?.content_raw || '';
      const strA = simpleTokenize(fromContent).join(' ');
      const strB = simpleTokenize(toContent).join(' ');
      const distance = levenshtein(strA, strB);
      const maxLen = Math.max(strA.length, strB.length);
      const normalized = maxLen > 0 ? distance / maxLen : 0;

      await insertEdit({
        session_id: sessionId,
        from_artifact_id: artifactIds[i - 1],
        to_artifact_id: artifactIds[i],
        edit_distance: distance,
        edit_distance_norm: Number(normalized.toFixed(4)),
        semantic_change_class: null,
        edit_seconds: null,
        inferred_class: false,
        metadata: {},
      }, client);
    }

    logger.info(`Ingested session ${sessionId}: ${artifactIds.length} artifacts`);
  });

  await closePool();
}

main().catch(err => {
  logger.error('Manual ingest failed', { error: err.message });
  process.exit(1);
});
