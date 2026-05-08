import { query } from '../lib/db';
import { logger } from '../lib/logger';

interface LinkCandidate {
  transcript_id: string;
  pr_id: string;
  pr_number: string;
  hours_apart: number;
  [key: string]: unknown;
}

function classifyConfidence(hoursApart: number): 'strong' | 'medium' | 'weak' {
  if (hoursApart < 1) return 'strong';
  if (hoursApart < 4) return 'medium';
  return 'weak';
}

export async function linkTranscriptsToPRs(): Promise<void> {
  // Find best temporal match for each SecondLayer transcript
  const matches = await query<LinkCandidate>(`
    WITH secondlayer_transcripts AS (
      SELECT session_id, created_at, terminal_at
      FROM workflow_sessions
      WHERE source = 'claude_code_transcript'
      AND external_ref LIKE '-home-vovkes-SecondLayer%'
    ),
    ranked AS (
      SELECT
        t.session_id as transcript_id,
        pr.session_id as pr_id,
        pr.external_ref as pr_number,
        ABS(EXTRACT(EPOCH FROM (t.created_at - pr.created_at))) / 3600 as hours_apart,
        ROW_NUMBER() OVER (
          PARTITION BY t.session_id
          ORDER BY ABS(EXTRACT(EPOCH FROM (t.created_at - pr.created_at)))
        ) as rn
      FROM secondlayer_transcripts t
      JOIN workflow_sessions pr ON pr.source = 'github_pr'
      WHERE t.created_at BETWEEN pr.created_at - interval '4 hours'
        AND COALESCE(pr.terminal_at, pr.created_at) + interval '1 hour'
    )
    SELECT transcript_id, pr_id, pr_number, hours_apart
    FROM ranked
    WHERE rn = 1
  `);

  logger.info(`Found ${matches.rows.length} transcript-PR temporal matches`);

  let linked = 0;
  let outcomesPropagated = 0;

  for (const match of matches.rows) {
    const confidence = classifyConfidence(match.hours_apart);

    // Insert link
    await query(`
      INSERT INTO session_links (source_session, target_session, link_type, confidence, hours_apart, metadata)
      VALUES ($1, $2, 'temporal_proximity', $3, $4, $5)
      ON CONFLICT (source_session, target_session) DO UPDATE SET
        confidence = EXCLUDED.confidence,
        hours_apart = EXCLUDED.hours_apart
    `, [
      match.transcript_id,
      match.pr_id,
      confidence,
      match.hours_apart,
      JSON.stringify({ pr_number: match.pr_number }),
    ]);
    linked++;

    // Propagate outcomes from PR to transcript (if transcript has none)
    const existingOutcomes = await query(
      'SELECT count(*) as cnt FROM workflow_outcomes WHERE session_id = $1',
      [match.transcript_id]
    );

    if (Number(existingOutcomes.rows[0]?.cnt) === 0) {
      const prOutcomes = await query(
        'SELECT outcome_type, outcome_value, observed_at, attribution_window_days, attribution_confidence, metadata FROM workflow_outcomes WHERE session_id = $1',
        [match.pr_id]
      );

      for (const outcome of prOutcomes.rows) {
        await query(`
          INSERT INTO workflow_outcomes
            (session_id, outcome_type, outcome_value, observed_at,
             attribution_window_days, attribution_confidence, source, metadata)
          VALUES ($1, $2, $3, $4, $5, $6, 'linked_pr', $7)
          ON CONFLICT (session_id, outcome_type, source) DO NOTHING
        `, [
          match.transcript_id,
          outcome.outcome_type,
          outcome.outcome_value,
          outcome.observed_at,
          outcome.attribution_window_days,
          confidence === 'strong' ? outcome.attribution_confidence : 'weak',
          JSON.stringify({
            ...(typeof outcome.metadata === 'object' ? outcome.metadata : {}),
            linked_from_pr: match.pr_number,
            hours_apart: match.hours_apart,
            link_confidence: confidence,
          }),
        ]);
        outcomesPropagated++;
      }
    }
  }

  // Stats
  const linkStats = await query(`
    SELECT confidence, count(*) as cnt
    FROM session_links
    GROUP BY confidence
    ORDER BY cnt DESC
  `);

  const transcriptOutcomes = await query(`
    SELECT count(DISTINCT session_id) as cnt
    FROM workflow_outcomes
    WHERE session_id IN (
      SELECT session_id FROM workflow_sessions WHERE source = 'claude_code_transcript'
    )
  `);

  logger.info(`Linked ${linked} transcripts to PRs`);
  logger.info(`Propagated ${outcomesPropagated} outcomes to transcripts`);
  logger.info(`Link confidence: ${linkStats.rows.map(r => `${r.confidence}=${r.cnt}`).join(', ')}`);
  logger.info(`Claude Code transcripts with outcomes: ${transcriptOutcomes.rows[0]?.cnt}`);
}
