import { config } from '../lib/config';
import { logger } from '../lib/logger';
import { upsertSession, upsertArtifact, insertEdit, contentHash } from '../schema/queries';
import { withTransaction } from '../lib/db';
import levenshtein from 'js-levenshtein';

interface PlaneIssue {
  id: string;
  sequence_id: number;
  name: string;
  description_html: string;
  description_stripped: string;
  state: { name: string; group: string };
  priority: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  labels: { id: string; name: string }[];
  link_count: number;
  sub_issues_count: number;
}

interface PlaneComment {
  id: string;
  comment_stripped: string;
  created_at: string;
  actor_detail: { display_name: string } | null;
}

async function planeGet<T>(path: string): Promise<T> {
  const base = `https://plane.legal.org.ua/api/v1/workspaces/${config.planeWorkspace}/projects/${config.planeProject}`;
  const url = `${base}${path}`;
  const resp = await fetch(url, {
    headers: { 'X-API-Key': config.planeApiKey, 'Content-Type': 'application/json' },
  });
  if (!resp.ok) {
    throw new Error(`Plane API ${resp.status}: ${url}`);
  }
  return resp.json() as Promise<T>;
}

async function fetchAllIssues(): Promise<PlaneIssue[]> {
  const issues: PlaneIssue[] = [];
  let cursor: string | undefined;
  let page = 1;

  while (true) {
    const params = cursor ? `?cursor=${cursor}&per_page=100` : '?per_page=100';
    const data = await planeGet<{ results: PlaneIssue[]; next_cursor?: string; next_page_results: boolean }>(`/issues/${params}`);
    issues.push(...data.results);
    logger.info(`Fetched Plane issues page ${page}, total so far: ${issues.length}`);

    if (!data.next_page_results || !data.next_cursor) break;
    cursor = data.next_cursor;
    page++;
  }

  return issues;
}

async function fetchComments(issueId: string): Promise<PlaneComment[]> {
  try {
    const data = await planeGet<PlaneComment[]>(`/issues/${issueId}/comments/`);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function terminalAction(issue: PlaneIssue): string | null {
  const group = issue.state.group.toLowerCase();
  if (group === 'completed') return 'done';
  if (group === 'cancelled') return 'cancelled';
  return null;
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

export async function extractPlaneIssues(): Promise<void> {
  if (!config.planeApiKey || !config.planeWorkspace || !config.planeProject) {
    logger.error('PLANE_API_KEY, PLANE_WORKSPACE, and PLANE_PROJECT are required');
    return;
  }

  const issues = await fetchAllIssues();
  let processed = 0;

  for (const issue of issues) {
    await processIssue(issue);
    processed++;
  }

  logger.info(`Plane extraction complete: ${processed} sessions`);
}

async function processIssue(issue: PlaneIssue): Promise<void> {
  await withTransaction(async (client) => {
    const ta = terminalAction(issue);
    const sessionId = await upsertSession({
      source: 'plane_issue',
      external_ref: issue.id,
      surface_tags: issue.labels.map(l => l.name),
      created_at: new Date(issue.created_at),
      terminal_at: issue.completed_at ? new Date(issue.completed_at) : null,
      terminal_action: ta,
      thread_position: null,
      capture_mode: 'retro',
      consent_status: 'pending',
      metadata: {
        sequence_id: issue.sequence_id,
        name: issue.name,
        priority: issue.priority,
        state: issue.state.name,
        state_group: issue.state.group,
      },
    }, client);

    let seqIdx = 0;
    const artifactIds: string[] = [];

    // Prompt: issue description
    const promptContent = `${issue.name}\n\n${issue.description_stripped || ''}`.trim();
    if (promptContent) {
      const id = await upsertArtifact({
        session_id: sessionId,
        role: 'prompt',
        sequence_index: seqIdx++,
        content_raw: promptContent,
        content_redacted: null,
        content_hash: contentHash(promptContent),
        token_count: simpleTokenize(promptContent).length,
        timestamp: new Date(issue.created_at),
        metadata: {},
      }, client);
      artifactIds.push(id);
    }

    // Comments as edits
    const comments = await fetchComments(issue.id);
    for (const comment of comments) {
      if (!comment.comment_stripped?.trim()) continue;
      const id = await upsertArtifact({
        session_id: sessionId,
        role: 'edit',
        sequence_index: seqIdx++,
        content_raw: comment.comment_stripped,
        content_redacted: null,
        content_hash: contentHash(comment.comment_stripped),
        token_count: simpleTokenize(comment.comment_stripped).length,
        timestamp: new Date(comment.created_at),
        metadata: { actor: comment.actor_detail?.display_name },
      }, client);
      artifactIds.push(id);
    }

    // Final: terminal state description
    const finalContent = `[${issue.state.name}] ${issue.name}`;
    const finalId = await upsertArtifact({
      session_id: sessionId,
      role: 'final',
      sequence_index: seqIdx++,
      content_raw: finalContent,
      content_redacted: null,
      content_hash: contentHash(finalContent),
      token_count: simpleTokenize(finalContent).length,
      timestamp: new Date(issue.updated_at),
      metadata: {},
    }, client);
    artifactIds.push(finalId);

    // Edits between consecutive artifacts
    for (let i = 1; i < artifactIds.length; i++) {
      const fromResult = await client.query(
        'SELECT content_raw FROM workflow_artifacts WHERE artifact_id = $1',
        [artifactIds[i - 1]]
      );
      const toResult = await client.query(
        'SELECT content_raw FROM workflow_artifacts WHERE artifact_id = $1',
        [artifactIds[i]]
      );
      const { distance, normalized } = tokenLevenshtein(
        fromResult.rows[0]?.content_raw || '',
        toResult.rows[0]?.content_raw || ''
      );

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

    logger.debug(`Processed issue ${issue.sequence_id}: ${artifactIds.length} artifacts`);
  });
}
