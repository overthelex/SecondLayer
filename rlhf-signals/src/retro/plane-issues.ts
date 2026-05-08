import { config } from '../lib/config';
import { logger } from '../lib/logger';
import { upsertSession, upsertArtifact, insertEdit, contentHash } from '../schema/queries';
import { withTransaction } from '../lib/db';
import levenshtein from 'js-levenshtein';

interface PlaneIssue {
  id: string;
  sequence_id: number;
  name: string;
  description_html: string | null;
  priority: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  state: string;
  labels: string[];
  parent: string | null;
}

interface PlaneState {
  id: string;
  name: string;
  group: string;
}

interface PlaneLabel {
  id: string;
  name: string;
}

interface PlaneComment {
  id: string;
  comment_html: string;
  created_at: string;
  actor_detail: { display_name: string } | null;
}

interface PaginatedResponse<T> {
  results: T[];
  next_cursor?: string;
  next_page_results: boolean;
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

async function fetchStates(): Promise<Map<string, PlaneState>> {
  const data = await planeGet<PaginatedResponse<PlaneState>>('/states/');
  const map = new Map<string, PlaneState>();
  for (const s of data.results) {
    map.set(s.id, s);
  }
  return map;
}

async function fetchLabels(): Promise<Map<string, PlaneLabel>> {
  const data = await planeGet<PaginatedResponse<PlaneLabel>>('/labels/');
  const map = new Map<string, PlaneLabel>();
  for (const l of data.results) {
    map.set(l.id, l);
  }
  return map;
}

async function fetchAllIssues(): Promise<PlaneIssue[]> {
  const issues: PlaneIssue[] = [];
  let cursor: string | undefined;
  let page = 1;

  while (true) {
    const params = cursor ? `?cursor=${cursor}&per_page=100` : '?per_page=100';
    const data = await planeGet<PaginatedResponse<PlaneIssue>>(`/issues/${params}`);
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
    const data = await planeGet<PaginatedResponse<PlaneComment>>(`/issues/${issueId}/comments/`);
    return Array.isArray(data.results) ? data.results : [];
  } catch {
    return [];
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
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

  const statesMap = await fetchStates();
  const labelsMap = await fetchLabels();
  const issues = await fetchAllIssues();
  let processed = 0;

  for (const issue of issues) {
    await processIssue(issue, statesMap, labelsMap);
    processed++;
  }

  logger.info(`Plane extraction complete: ${processed} sessions`);
}

async function processIssue(
  issue: PlaneIssue,
  statesMap: Map<string, PlaneState>,
  labelsMap: Map<string, PlaneLabel>,
): Promise<void> {
  await withTransaction(async (client) => {
    const state = statesMap.get(issue.state);
    const stateGroup = state?.group?.toLowerCase();
    let ta: string | null = null;
    if (stateGroup === 'completed') ta = 'done';
    else if (stateGroup === 'cancelled') ta = 'cancelled';

    const labelNames = (issue.labels || [])
      .map(id => labelsMap.get(id)?.name)
      .filter((n): n is string => !!n);

    const sessionId = await upsertSession({
      source: 'plane_issue',
      external_ref: issue.id,
      surface_tags: labelNames,
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
        state: state?.name ?? null,
        state_group: state?.group ?? null,
      },
    }, client);

    let seqIdx = 0;
    const artifactIds: string[] = [];

    const descText = issue.description_html ? stripHtml(issue.description_html) : '';
    const promptContent = `${issue.name}\n\n${descText}`.trim();
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

    const comments = await fetchComments(issue.id);
    for (const comment of comments) {
      const commentText = comment.comment_html ? stripHtml(comment.comment_html) : '';
      if (!commentText) continue;
      const id = await upsertArtifact({
        session_id: sessionId,
        role: 'edit',
        sequence_index: seqIdx++,
        content_raw: commentText,
        content_redacted: null,
        content_hash: contentHash(commentText),
        token_count: simpleTokenize(commentText).length,
        timestamp: new Date(comment.created_at),
        metadata: { actor: comment.actor_detail?.display_name },
      }, client);
      artifactIds.push(id);
    }

    const finalContent = `[${state?.name ?? 'unknown'}] ${issue.name}`;
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
