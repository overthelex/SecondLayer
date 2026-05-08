import { graphql } from '@octokit/graphql';
import levenshtein from 'js-levenshtein';
import { config } from '../lib/config';
import { logger } from '../lib/logger';
import { upsertSession, upsertArtifact, insertEdit, contentHash } from '../schema/queries';
import { withTransaction } from '../lib/db';

interface PRNode {
  number: number;
  title: string;
  body: string;
  state: string;
  mergedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  additions: number;
  deletions: number;
  isDraft: boolean;
  labels: { nodes: { name: string }[] };
  commits: {
    nodes: {
      commit: {
        message: string;
        messageBody: string;
        authoredDate: string;
        author: { user: { login: string } | null };
        additions: number;
        deletions: number;
      };
    }[];
    totalCount: number;
  };
  reviews: {
    nodes: {
      body: string;
      author: { login: string } | null;
      createdAt: string;
    }[];
  };
  closingIssuesReferences: {
    nodes: { number: number; title: string; body: string }[];
  };
}

interface PageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

const PR_QUERY = `
  query ($owner: String!, $repo: String!, $cursor: String) {
    repository(owner: $owner, name: $repo) {
      pullRequests(first: 50, after: $cursor, orderBy: {field: CREATED_AT, direction: DESC}) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          number
          title
          body
          state
          mergedAt
          closedAt
          createdAt
          updatedAt
          additions
          deletions
          isDraft
          labels(first: 10) { nodes { name } }
          commits(first: 100) {
            totalCount
            nodes {
              commit {
                message
                messageBody
                authoredDate
                author { user { login } }
                additions
                deletions
              }
            }
          }
          reviews(first: 20) {
            nodes {
              body
              author { login }
              createdAt
            }
          }
          closingIssuesReferences(first: 5) {
            nodes { number title body }
          }
        }
      }
    }
  }
`;

function isClaudeAssisted(pr: PRNode): boolean {
  const markers = ['co-authored-by: claude', 'claude-code', 'claude code', 'anthropic'];
  for (const commit of pr.commits.nodes) {
    const full = `${commit.commit.message} ${commit.commit.messageBody}`.toLowerCase();
    if (markers.some(m => full.includes(m))) return true;
  }
  return false;
}

function hasMultipleHumanAuthors(pr: PRNode): boolean {
  const authors = new Set<string>();
  for (const commit of pr.commits.nodes) {
    const login = commit.commit.author?.user?.login;
    if (login) authors.add(login);
  }
  return authors.size > 1;
}

function isMinimalDiff(pr: PRNode): boolean {
  return (pr.additions + pr.deletions) < 10;
}

function terminalAction(pr: PRNode): string {
  if (pr.mergedAt) return 'merged';
  if (pr.state === 'CLOSED') return 'closed';
  const lastActivity = new Date(pr.updatedAt);
  const daysSince = (Date.now() - lastActivity.getTime()) / (1000 * 60 * 60 * 24);
  if (pr.state === 'OPEN' && daysSince > 90) return 'abandoned';
  return pr.state.toLowerCase();
}

function surfaceTags(pr: PRNode): string[] {
  const tags: string[] = [];
  if (pr.isDraft || /\[wip\]|\[draft\]/i.test(pr.title)) tags.push('wip');
  const labelNames = pr.labels.nodes.map(l => l.name.toLowerCase());
  if (labelNames.some(l => l.includes('bug') || l.includes('fix'))) tags.push('bugfix');
  if (labelNames.some(l => l.includes('feat'))) tags.push('feature');
  if (labelNames.some(l => l.includes('refactor'))) tags.push('refactoring');
  return tags;
}

function simpleTokenize(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

function tokenLevenshtein(a: string, b: string): { distance: number; normalized: number } {
  const tokensA = simpleTokenize(a);
  const tokensB = simpleTokenize(b);
  const strA = tokensA.join(' ');
  const strB = tokensB.join(' ');
  const distance = levenshtein(strA, strB);
  const maxLen = Math.max(strA.length, strB.length);
  return {
    distance,
    normalized: maxLen > 0 ? distance / maxLen : 0,
  };
}

export async function extractGitHubPRs(): Promise<void> {
  if (!config.githubToken || !config.githubRepo) {
    logger.error('GITHUB_TOKEN and GITHUB_REPO are required');
    return;
  }

  const [owner, repo] = config.githubRepo.split('/');
  if (!owner || !repo) {
    logger.error('GITHUB_REPO must be in owner/repo format');
    return;
  }

  const gql = graphql.defaults({
    headers: { authorization: `token ${config.githubToken}` },
  });

  let cursor: string | null = null;
  let totalProcessed = 0;
  let totalSkipped = 0;

  do {
    const data: any = await gql(PR_QUERY, { owner, repo, cursor });
    const prs: PRNode[] = data.repository.pullRequests.nodes;
    const pageInfo: PageInfo = data.repository.pullRequests.pageInfo;

    for (const pr of prs) {
      if (!isClaudeAssisted(pr)) {
        totalSkipped++;
        continue;
      }
      if (hasMultipleHumanAuthors(pr)) {
        logger.debug(`Skipping PR #${pr.number}: multiple human authors`);
        totalSkipped++;
        continue;
      }
      if (isMinimalDiff(pr)) {
        logger.debug(`Skipping PR #${pr.number}: minimal diff (<10 lines)`);
        totalSkipped++;
        continue;
      }

      await processPR(pr);
      totalProcessed++;
    }

    cursor = pageInfo.hasNextPage ? pageInfo.endCursor : null;
    logger.info(`Processed page, ${totalProcessed} sessions created, ${totalSkipped} skipped`);
  } while (cursor);

  logger.info(`GitHub PR extraction complete: ${totalProcessed} sessions, ${totalSkipped} skipped`);
}

async function processPR(pr: PRNode): Promise<void> {
  await withTransaction(async (client) => {
    const ta = terminalAction(pr);
    const sessionId = await upsertSession({
      source: 'github_pr',
      external_ref: `${pr.number}`,
      surface_tags: surfaceTags(pr),
      created_at: new Date(pr.createdAt),
      terminal_at: pr.mergedAt ? new Date(pr.mergedAt) : pr.closedAt ? new Date(pr.closedAt) : null,
      terminal_action: ta,
      thread_position: null,
      capture_mode: 'retro',
      consent_status: 'pending',
      metadata: {
        additions: pr.additions,
        deletions: pr.deletions,
        commit_count: pr.commits.totalCount,
        linked_issues: pr.closingIssuesReferences.nodes.map(i => i.number),
      },
    }, client);

    let seqIdx = 0;
    const artifactIds: string[] = [];

    // Prompt artifact: PR body + linked issues
    const issueContext = pr.closingIssuesReferences.nodes
      .map(i => `Issue #${i.number}: ${i.title}\n${i.body}`)
      .join('\n\n');
    const promptContent = `${pr.title}\n\n${pr.body || ''}${issueContext ? `\n\n--- Linked Issues ---\n${issueContext}` : ''}`;

    const promptId = await upsertArtifact({
      session_id: sessionId,
      role: 'prompt',
      sequence_index: seqIdx++,
      content_raw: promptContent,
      content_redacted: null,
      content_hash: contentHash(promptContent),
      token_count: simpleTokenize(promptContent).length,
      timestamp: new Date(pr.createdAt),
      metadata: {},
    }, client);
    artifactIds.push(promptId);

    // Commit artifacts as llm_output / edit sequence
    for (const commitNode of pr.commits.nodes) {
      const c = commitNode.commit;
      const commitContent = `${c.message}\n${c.messageBody || ''}`.trim();
      const role = seqIdx === 1 ? 'llm_output' : 'edit';
      const aid = await upsertArtifact({
        session_id: sessionId,
        role,
        sequence_index: seqIdx++,
        content_raw: commitContent,
        content_redacted: null,
        content_hash: contentHash(commitContent),
        token_count: simpleTokenize(commitContent).length,
        timestamp: new Date(c.authoredDate),
        metadata: {
          additions: c.additions,
          deletions: c.deletions,
        },
      }, client);
      artifactIds.push(aid);
    }

    // Final artifact (terminal state)
    const reviewComments = pr.reviews.nodes.map(r => r.body).filter(Boolean).join('\n\n');
    const finalContent = `[${ta}] PR #${pr.number}: ${pr.title}${reviewComments ? `\n\nReview comments:\n${reviewComments}` : ''}`;
    const finalId = await upsertArtifact({
      session_id: sessionId,
      role: 'final',
      sequence_index: seqIdx++,
      content_raw: finalContent,
      content_redacted: null,
      content_hash: contentHash(finalContent),
      token_count: simpleTokenize(finalContent).length,
      timestamp: new Date(pr.mergedAt || pr.closedAt || pr.updatedAt),
      metadata: {},
    }, client);
    artifactIds.push(finalId);

    // Compute edits between consecutive artifacts
    for (let i = 1; i < artifactIds.length; i++) {
      const fromResult = await client.query(
        'SELECT artifact_id, content_raw FROM workflow_artifacts WHERE artifact_id = $1',
        [artifactIds[i - 1]]
      );
      const toResult = await client.query(
        'SELECT artifact_id, content_raw FROM workflow_artifacts WHERE artifact_id = $1',
        [artifactIds[i]]
      );
      const fromContent = fromResult.rows[0]?.content_raw || '';
      const toContent = toResult.rows[0]?.content_raw || '';
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

    logger.info(`Processed PR #${pr.number}: ${artifactIds.length} artifacts, ${artifactIds.length - 1} edits`);
  });
}
