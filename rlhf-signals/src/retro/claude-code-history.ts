import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { config } from '../lib/config';
import { logger } from '../lib/logger';
import { upsertSession, upsertArtifact, insertEdit, contentHash } from '../schema/queries';
import { withTransaction } from '../lib/db';
import levenshtein from 'js-levenshtein';

const MAX_ARTIFACT_TOKENS = 50_000;

interface TranscriptLine {
  type: string;
  message?: {
    role?: string;
    content?: string | ContentBlock[];
    model?: string;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  timestamp?: string;
  uuid?: string;
  sessionId?: string;
}

interface ContentBlock {
  type: string;
  text?: string;
  name?: string;
}

export function extractTextContent(message: TranscriptLine['message']): string {
  if (!message?.content) return '';
  if (typeof message.content === 'string') return message.content;
  if (Array.isArray(message.content)) {
    return message.content
      .filter(c => c.type === 'text' && c.text)
      .map(c => c.text!)
      .join('\n');
  }
  return '';
}

export function extractToolNames(message: TranscriptLine['message']): string[] {
  if (!message?.content || !Array.isArray(message.content)) return [];
  return message.content
    .filter(c => c.type === 'tool_use' && c.name)
    .map(c => c.name!);
}

function simpleTokenize(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

function tokenLevenshtein(a: string, b: string): { distance: number; normalized: number } {
  const strA = simpleTokenize(a).join(' ');
  const strB = simpleTokenize(b).join(' ');
  const distance = levenshtein(strA, strB);
  const maxLen = Math.max(strA.length, strB.length);
  return { distance, normalized: maxLen > 0 ? distance / maxLen : 0 };
}

async function parseTranscriptFile(filePath: string): Promise<TranscriptLine[]> {
  const messages: TranscriptLine[] = [];
  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed) as TranscriptLine;
      if (parsed.type === 'user' || parsed.type === 'assistant') {
        messages.push(parsed);
      }
    } catch {
      // skip malformed lines
    }
  }

  return messages;
}

function findTranscriptFiles(baseDir: string): string[] {
  const results: string[] = [];

  function walk(dir: string) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith('.jsonl')) {
        results.push(full);
      }
    }
  }

  walk(baseDir);
  return results;
}

export async function extractClaudeCodeHistory(): Promise<void> {
  const projectsDir = config.claudeCodeProjectsDir;
  if (!fs.existsSync(projectsDir)) {
    logger.error(`Claude Code projects directory not found: ${projectsDir}`);
    return;
  }

  const files = findTranscriptFiles(projectsDir);
  logger.info(`Found ${files.length} transcript files in ${projectsDir}`);

  let processed = 0;
  let skipped = 0;

  for (const filePath of files) {
    const messages = await parseTranscriptFile(filePath);
    if (messages.length < 2) {
      skipped++;
      continue;
    }

    await processTranscript(filePath, messages);
    processed++;

    if (processed % 100 === 0) {
      logger.info(`Progress: ${processed} transcripts processed, ${skipped} skipped`);
    }
  }

  logger.info(`Claude Code extraction complete: ${processed} sessions, ${skipped} skipped`);
}

async function processTranscript(filePath: string, messages: TranscriptLine[]): Promise<void> {
  const relativePath = path.relative(config.claudeCodeProjectsDir, filePath);
  const stat = fs.statSync(filePath);

  await withTransaction(async (client) => {
    const firstTimestamp = messages[0].timestamp || stat.birthtime.toISOString();
    const lastTimestamp = messages[messages.length - 1].timestamp || stat.mtime.toISOString();

    const sessionId = await upsertSession({
      source: 'claude_code_transcript',
      external_ref: relativePath,
      surface_tags: [],
      created_at: new Date(firstTimestamp),
      terminal_at: new Date(lastTimestamp),
      terminal_action: null,
      thread_position: null,
      capture_mode: 'retro',
      consent_status: 'pending',
      metadata: {
        message_count: messages.length,
        file_size: stat.size,
      },
    }, client);

    let seqIdx = 0;
    const artifactIds: string[] = [];
    let hadUserMessage = false;

    for (const msg of messages) {
      const text = extractTextContent(msg.message);
      if (!text.trim()) continue;

      const tokenCount = simpleTokenize(text).length;
      const shouldStore = tokenCount <= MAX_ARTIFACT_TOKENS;
      const storedContent = shouldStore ? text : `[truncated: ${tokenCount} tokens, see file: ${relativePath}]`;
      const toolNames = extractToolNames(msg.message);

      let role: 'prompt' | 'llm_output' | 'edit';
      if (msg.type === 'user') {
        role = !hadUserMessage ? 'prompt' : 'edit';
        hadUserMessage = true;
      } else {
        role = 'llm_output';
      }

      const id = await upsertArtifact({
        session_id: sessionId,
        role,
        sequence_index: seqIdx++,
        content_raw: storedContent,
        content_redacted: null,
        content_hash: contentHash(text),
        token_count: tokenCount,
        timestamp: new Date(msg.timestamp || stat.mtime.toISOString()),
        metadata: toolNames.length > 0 ? { tool_calls: toolNames } : {},
      }, client);
      artifactIds.push(id);
    }

    // Add final artifact
    if (artifactIds.length > 0) {
      const lastMsg = messages[messages.length - 1];
      const lastText = extractTextContent(lastMsg.message);
      if (lastText.trim()) {
        const finalContent = lastText.slice(0, 2000);
        const id = await upsertArtifact({
          session_id: sessionId,
          role: 'final',
          sequence_index: seqIdx++,
          content_raw: finalContent,
          content_redacted: null,
          content_hash: contentHash(finalContent),
          token_count: simpleTokenize(finalContent).length,
          timestamp: new Date(lastTimestamp),
          metadata: {},
        }, client);
        artifactIds.push(id);
      }
    }

    // Edits between consecutive artifacts (skip truncated)
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

      if (fromContent.startsWith('[truncated') || toContent.startsWith('[truncated')) continue;

      const { distance, normalized } = tokenLevenshtein(fromContent, toContent);

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

    logger.debug(`Processed transcript ${relativePath}: ${artifactIds.length} artifacts`);
  });
}
