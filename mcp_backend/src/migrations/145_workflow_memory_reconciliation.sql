-- Migration 145: Workflow Memory Phase 1.4 — retrieval-miss instrumentation
-- Post-session reconciliation: compare retrieved principles vs actual session work,
-- flag retrieval misses as correction-signal candidates.

CREATE TABLE IF NOT EXISTS workflow_memory_reconciliations (
  id              SERIAL PRIMARY KEY,
  session_id      TEXT NOT NULL,
  commit_range    TEXT,                         -- first..last commit in session
  files_touched   TEXT[] DEFAULT '{}',
  tools_used      TEXT[] DEFAULT '{}',
  prompts_count   INTEGER DEFAULT 0,

  -- Retrieval quality metrics
  retrieved_ids   INTEGER[] DEFAULT '{}',       -- principle IDs that were retrieved
  relevant_ids    INTEGER[] DEFAULT '{}',       -- principle IDs that SHOULD have been retrieved
  missed_ids      INTEGER[] DEFAULT '{}',       -- relevant - retrieved (retrieval misses)
  spurious_ids    INTEGER[] DEFAULT '{}',       -- retrieved - relevant (false positives)

  precision       REAL,                         -- |retrieved ∩ relevant| / |retrieved|
  recall          REAL,                         -- |retrieved ∩ relevant| / |relevant|

  -- Candidate new principles discovered from session
  candidate_principles JSONB DEFAULT '[]',      -- [{title, body, source_ref, reason}]

  status          TEXT DEFAULT 'pending',        -- 'pending', 'completed', 'skipped'
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wmrc_session ON workflow_memory_reconciliations(session_id);
CREATE INDEX IF NOT EXISTS idx_wmrc_status ON workflow_memory_reconciliations(status);
CREATE INDEX IF NOT EXISTS idx_wmrc_created ON workflow_memory_reconciliations(created_at DESC);
