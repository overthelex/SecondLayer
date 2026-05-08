import { query, closePool } from '../src/lib/db';
import { logger } from '../src/lib/logger';

async function main() {
  logger.info('Generating feasibility report...');

  const totalSessions = await query('SELECT count(*) as cnt FROM workflow_sessions');
  const bySource = await query(
    'SELECT source, count(*) as cnt FROM workflow_sessions GROUP BY source ORDER BY cnt DESC'
  );
  const byCaptureMode = await query(
    'SELECT capture_mode, count(*) as cnt FROM workflow_sessions GROUP BY capture_mode'
  );
  const totalArtifacts = await query('SELECT count(*) as cnt FROM workflow_artifacts');
  const avgArtifactsPerSession = await query(`
    SELECT round(avg(cnt), 1) as avg_depth FROM (
      SELECT session_id, count(*) as cnt FROM workflow_artifacts GROUP BY session_id
    ) sub
  `);
  const editClassDist = await query(`
    SELECT semantic_change_class, count(*) as cnt
    FROM workflow_edits
    GROUP BY semantic_change_class
    ORDER BY cnt DESC
  `);
  const outcomeCoverage = await query(`
    SELECT
      count(DISTINCT ws.session_id) as total_sessions,
      count(DISTINCT wo.session_id) as sessions_with_outcome
    FROM workflow_sessions ws
    LEFT JOIN workflow_outcomes wo ON ws.session_id = wo.session_id
  `);
  const outcomeTypes = await query(`
    SELECT outcome_type, count(*) as cnt
    FROM workflow_outcomes
    GROUP BY outcome_type
    ORDER BY cnt DESC
  `);
  const windowDist = await query(`
    SELECT
      CASE
        WHEN attribution_window_days <= 7 THEN '0-7d'
        WHEN attribution_window_days <= 30 THEN '8-30d'
        WHEN attribution_window_days <= 90 THEN '31-90d'
        ELSE '90d+'
      END as bucket,
      count(*) as cnt
    FROM workflow_outcomes
    GROUP BY bucket
    ORDER BY bucket
  `);
  const staleNoOutcome = await query(`
    SELECT count(*) as cnt FROM workflow_sessions ws
    WHERE NOT EXISTS (SELECT 1 FROM workflow_outcomes wo WHERE wo.session_id = ws.session_id)
    AND ws.terminal_at < now() - interval '60 days'
  `);
  const monthlySubstantive = await query(`
    SELECT count(DISTINCT we.session_id) as cnt
    FROM workflow_edits we
    JOIN workflow_outcomes wo ON we.session_id = wo.session_id
    WHERE we.semantic_change_class IN ('substantive_rewrite', 'factual_correction', 'tone_adjustment')
    AND we.session_id IN (
      SELECT session_id FROM workflow_sessions
      WHERE created_at >= now() - interval '30 days'
    )
  `);

  const total = Number(totalSessions.rows[0]?.cnt ?? 0);
  const oc = outcomeCoverage.rows[0] ?? { total_sessions: 0, sessions_with_outcome: 0 };
  const coveragePct = Number(oc.total_sessions) > 0
    ? ((Number(oc.sessions_with_outcome) / Number(oc.total_sessions)) * 100).toFixed(1)
    : '0.0';
  const monthlyCount = Number(monthlySubstantive.rows[0]?.cnt ?? 0);

  let verdict: string;
  if (monthlyCount >= 50) {
    verdict = 'GO — sufficient signal density for Phase 1';
  } else if (monthlyCount >= 20) {
    verdict = 'MARGINAL — consider expanding capture surfaces before Phase 1';
  } else {
    verdict = 'NO-GO — insufficient signal, reconsider recursive workflow definition';
  }

  const report = `# RLHF Signals Feasibility Report

Generated: ${new Date().toISOString()}

## Volume

| Metric | Value |
|--------|-------|
| Total sessions | ${total} |
| Total artifacts | ${totalArtifacts.rows[0]?.cnt ?? 0} |
| Avg artifacts/session | ${avgArtifactsPerSession.rows[0]?.avg_depth ?? 'N/A'} |

### Sessions by source
${bySource.rows.map(r => `- **${r.source}**: ${r.cnt}`).join('\n')}

### Sessions by capture mode
${byCaptureMode.rows.map(r => `- **${r.capture_mode}**: ${r.cnt}`).join('\n')}

## Edit Quality

### Semantic change class distribution
${editClassDist.rows.map(r => `- **${r.semantic_change_class ?? 'unclassified'}**: ${r.cnt}`).join('\n') || '- No edits recorded'}

## Outcome Coverage

| Metric | Value |
|--------|-------|
| Sessions with outcome | ${oc.sessions_with_outcome} / ${oc.total_sessions} (${coveragePct}%) |
| Stale sessions (>60d, no outcome) | ${staleNoOutcome.rows[0]?.cnt ?? 0} |

### Outcome types
${outcomeTypes.rows.map(r => `- **${r.outcome_type}**: ${r.cnt}`).join('\n') || '- No outcomes recorded'}

### Attribution window distribution
${windowDist.rows.map(r => `- **${r.bucket}**: ${r.cnt}`).join('\n') || '- No outcomes recorded'}

## Feasibility Verdict

**Monthly substantive sessions with attributable outcomes (30d window): ${monthlyCount}**

**${verdict}**

Threshold criteria:
- >= 50 sessions: GO
- 20-49 sessions: MARGINAL
- < 20 sessions: NO-GO
`;

  console.log(report);
  await closePool();
}

main().catch(err => {
  logger.error('Feasibility report failed', { error: err.message });
  process.exit(1);
});
