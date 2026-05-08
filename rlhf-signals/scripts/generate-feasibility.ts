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

  // Edit distance distribution as proxy for classification
  const editDistBuckets = await query(`
    SELECT
      CASE
        WHEN edit_distance_norm < 0.05 THEN 'cosmetic (<5%)'
        WHEN edit_distance_norm < 0.20 THEN 'minor (5-20%)'
        WHEN edit_distance_norm < 0.50 THEN 'moderate (20-50%)'
        WHEN edit_distance_norm < 0.80 THEN 'significant (50-80%)'
        ELSE 'substantive (80%+)'
      END as bucket,
      count(*) as cnt
    FROM workflow_edits
    GROUP BY bucket
    ORDER BY bucket
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

  // Key feasibility metric: sessions with non-cosmetic edits AND outcomes, per calendar month
  const monthlySubstantive = await query(`
    SELECT
      date_trunc('month', ws.created_at) as month,
      count(DISTINCT ws.session_id) as sessions
    FROM workflow_sessions ws
    JOIN workflow_edits we ON ws.session_id = we.session_id
    JOIN workflow_outcomes wo ON ws.session_id = wo.session_id
    WHERE we.edit_distance_norm > 0.05
    GROUP BY month
    ORDER BY month DESC
  `);

  // Sessions with non-cosmetic edits AND outcomes (total, not per month)
  const totalSubstantiveWithOutcome = await query(`
    SELECT count(DISTINCT ws.session_id) as cnt
    FROM workflow_sessions ws
    JOIN workflow_edits we ON ws.session_id = we.session_id
    JOIN workflow_outcomes wo ON ws.session_id = wo.session_id
    WHERE we.edit_distance_norm > 0.05
  `);

  // Coverage by source
  const coverageBySource = await query(`
    SELECT ws.source,
      count(DISTINCT ws.session_id) as total,
      count(DISTINCT wo.session_id) as with_outcome
    FROM workflow_sessions ws
    LEFT JOIN workflow_outcomes wo ON ws.session_id = wo.session_id
    GROUP BY ws.source
    ORDER BY total DESC
  `);

  const total = Number(totalSessions.rows[0]?.cnt ?? 0);
  const oc = outcomeCoverage.rows[0] ?? { total_sessions: 0, sessions_with_outcome: 0 };
  const coveragePct = Number(oc.total_sessions) > 0
    ? ((Number(oc.sessions_with_outcome) / Number(oc.total_sessions)) * 100).toFixed(1)
    : '0.0';

  const monthlyRows = monthlySubstantive.rows as { month: string; sessions: string }[];
  const bestMonth = monthlyRows.length > 0
    ? monthlyRows.reduce((best, r) => Number(r.sessions) > Number(best.sessions) ? r : best)
    : null;
  const avgMonthly = monthlyRows.length > 0
    ? (monthlyRows.reduce((sum, r) => sum + Number(r.sessions), 0) / monthlyRows.length).toFixed(1)
    : '0';
  const bestMonthCount = bestMonth ? Number(bestMonth.sessions) : 0;
  const totalSubstantive = Number(totalSubstantiveWithOutcome.rows[0]?.cnt ?? 0);

  let verdict: string;
  if (bestMonthCount >= 50) {
    verdict = 'GO — sufficient signal density for Phase 1';
  } else if (bestMonthCount >= 20) {
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

### Semantic change class distribution (classifier)
${editClassDist.rows.map(r => `- **${r.semantic_change_class ?? 'unclassified'}**: ${r.cnt}`).join('\n') || '- No edits recorded'}

### Edit distance distribution (proxy, no classifier needed)
${editDistBuckets.rows.map(r => `- **${r.bucket}**: ${r.cnt}`).join('\n') || '- No edits recorded'}

## Outcome Coverage

| Metric | Value |
|--------|-------|
| Sessions with outcome | ${oc.sessions_with_outcome} / ${oc.total_sessions} (${coveragePct}%) |
| Stale sessions (>60d, no outcome) | ${staleNoOutcome.rows[0]?.cnt ?? 0} |

### Coverage by source
| Source | Total | With outcome | Coverage |
|--------|-------|-------------|----------|
${(coverageBySource.rows as { source: string; total: string; with_outcome: string }[]).map(r => {
  const pct = Number(r.total) > 0 ? ((Number(r.with_outcome) / Number(r.total)) * 100).toFixed(1) : '0.0';
  return `| ${r.source} | ${r.total} | ${r.with_outcome} | ${pct}% |`;
}).join('\n')}

### Outcome types
${outcomeTypes.rows.map(r => `- **${r.outcome_type}**: ${r.cnt}`).join('\n') || '- No outcomes recorded'}

### Attribution window distribution
${windowDist.rows.map(r => `- **${r.bucket}**: ${r.cnt}`).join('\n') || '- No outcomes recorded'}

## Feasibility Verdict

### Key metric: sessions with non-cosmetic edits (norm > 5%) AND attributable outcomes

| Period | Sessions |
|--------|----------|
| **Total across all time** | **${totalSubstantive}** |
| **Best calendar month** | **${bestMonthCount}** (${bestMonth ? new Date(bestMonth.month).toISOString().slice(0, 7) : 'N/A'}) |
| **Average per month** | **${avgMonthly}** |

### Monthly breakdown
${monthlyRows.map(r => `- **${new Date(r.month).toISOString().slice(0, 7)}**: ${r.sessions} sessions`).join('\n') || '- No data'}

### Decision

**Best month signal density: ${bestMonthCount} sessions**

**${verdict}**

Threshold criteria (from methodology):
- >= 50 sessions/month: **GO** — proceed to Phase 1 live capture
- 20-49 sessions/month: **MARGINAL** — expand capture surfaces first
- < 20 sessions/month: **NO-GO** — reconsider workflow definition
`;

  console.log(report);
  await closePool();
}

main().catch(err => {
  logger.error('Feasibility report failed', { error: err.message });
  process.exit(1);
});
