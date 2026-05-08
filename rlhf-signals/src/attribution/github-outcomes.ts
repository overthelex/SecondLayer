import { graphql } from '@octokit/graphql';
import { config } from '../lib/config';
import { logger } from '../lib/logger';
import { query as dbQuery } from '../lib/db';
import { insertOutcome } from '../schema/queries';

interface SessionRow {
  session_id: string;
  external_ref: string;
  terminal_at: string;
  terminal_action: string;
  [key: string]: unknown;
}

const REVERT_QUERY = `
  query ($owner: String!, $repo: String!, $prNumber: Int!) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $prNumber) {
        timelineItems(first: 100, itemTypes: [REFERENCED_EVENT, CROSS_REFERENCED_EVENT]) {
          nodes {
            ... on CrossReferencedEvent {
              source {
                ... on PullRequest {
                  number
                  title
                  state
                  mergedAt
                  createdAt
                }
              }
            }
          }
        }
      }
    }
  }
`;

export async function attributeGitHubOutcomes(): Promise<void> {
  if (!config.githubToken || !config.githubRepo) {
    logger.error('GITHUB_TOKEN and GITHUB_REPO required for attribution');
    return;
  }

  const [owner, repo] = config.githubRepo.split('/');
  const gql = graphql.defaults({
    headers: { authorization: `token ${config.githubToken}` },
  });

  const sessions = await dbQuery<SessionRow>(`
    SELECT session_id, external_ref, terminal_at, terminal_action
    FROM workflow_sessions
    WHERE source = 'github_pr' AND terminal_action = 'merged'
    AND NOT EXISTS (SELECT 1 FROM workflow_outcomes WHERE session_id = workflow_sessions.session_id)
  `);

  let attributed = 0;

  for (const session of sessions.rows) {
    const prNumber = parseInt(session.external_ref, 10);
    if (!prNumber) continue;

    try {
      const data: any = await gql(REVERT_QUERY, { owner, repo, prNumber });
      const timelineItems = data.repository.pullRequest?.timelineItems?.nodes ?? [];

      let hasRevert = false;
      let hasFollowup = false;

      for (const item of timelineItems) {
        const refPr = item.source;
        if (!refPr?.number) continue;

        const refTitle = (refPr.title || '').toLowerCase();
        if (refTitle.includes('revert') && refTitle.includes(`#${prNumber}`)) {
          hasRevert = true;
        }
        if (refTitle.includes('fix') || refTitle.includes('follow')) {
          hasFollowup = true;
        }
      }

      const terminalAt = new Date(session.terminal_at);
      const now = new Date();
      const daysSince = Math.floor((now.getTime() - terminalAt.getTime()) / (1000 * 60 * 60 * 24));

      if (hasRevert) {
        await insertOutcome({
          session_id: session.session_id,
          outcome_type: 'merged_then_reverted',
          outcome_value: null,
          observed_at: now,
          attribution_window_days: daysSince,
          attribution_confidence: 'strong',
          source: 'github',
          metadata: { pr_number: prNumber },
        });
        attributed++;
      } else if (hasFollowup) {
        await insertOutcome({
          session_id: session.session_id,
          outcome_type: 'followup_fix_pr',
          outcome_value: null,
          observed_at: now,
          attribution_window_days: daysSince,
          attribution_confidence: 'medium',
          source: 'github',
          metadata: { pr_number: prNumber },
        });
        attributed++;
      } else if (daysSince >= 30) {
        await insertOutcome({
          session_id: session.session_id,
          outcome_type: 'merged_clean',
          outcome_value: null,
          observed_at: now,
          attribution_window_days: daysSince,
          attribution_confidence: 'strong',
          source: 'github',
          metadata: { pr_number: prNumber },
        });
        attributed++;
      }
    } catch (err) {
      logger.warn(`Failed to attribute PR #${prNumber}`, { error: (err as Error).message });
    }
  }

  const closedSessions = await dbQuery<SessionRow>(`
    SELECT session_id, external_ref, terminal_at, terminal_action
    FROM workflow_sessions
    WHERE source = 'github_pr' AND terminal_action = 'closed'
    AND NOT EXISTS (SELECT 1 FROM workflow_outcomes WHERE session_id = workflow_sessions.session_id)
  `);

  for (const session of closedSessions.rows) {
    const terminalAt = new Date(session.terminal_at);
    const daysSince = Math.floor((Date.now() - terminalAt.getTime()) / (1000 * 60 * 60 * 24));

    await insertOutcome({
      session_id: session.session_id,
      outcome_type: 'closed_unmerged',
      outcome_value: null,
      observed_at: new Date(),
      attribution_window_days: daysSince,
      attribution_confidence: 'strong',
      source: 'github',
      metadata: {},
    });
    attributed++;
  }

  logger.info(`GitHub attribution complete: ${attributed} outcomes recorded`);
}
