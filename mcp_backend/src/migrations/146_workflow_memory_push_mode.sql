-- Migration 146: Workflow Memory Phase 1.5 — push-mode orchestrator state
-- Tracks refresh state for long-term tasks and tool lineage changes.

CREATE TABLE IF NOT EXISTS workflow_memory_push_state (
  id              SERIAL PRIMARY KEY,
  task_id         TEXT NOT NULL UNIQUE,             -- Plane work item UUID
  task_name       TEXT NOT NULL,
  project_id      TEXT NOT NULL,
  last_refresh_at TIMESTAMPTZ,
  last_commit_sha TEXT,                             -- last commit seen during refresh
  refresh_count   INTEGER DEFAULT 0,
  tags            TEXT[] DEFAULT '{}',
  status          TEXT DEFAULT 'active',             -- 'active', 'paused', 'completed'
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wmps_status ON workflow_memory_push_state(status);
CREATE INDEX IF NOT EXISTS idx_wmps_refresh ON workflow_memory_push_state(last_refresh_at);

-- Tool lineage: snapshots of tool definitions for delta detection
CREATE TABLE IF NOT EXISTS workflow_memory_tool_lineage (
  id              SERIAL PRIMARY KEY,
  snapshot_at     TIMESTAMPTZ DEFAULT NOW(),
  tool_count      INTEGER NOT NULL,
  tool_names      TEXT[] NOT NULL,
  tool_hashes     JSONB NOT NULL DEFAULT '{}',       -- {tool_name: md5_of_schema}
  changes_from_prev JSONB DEFAULT '[]',              -- [{tool, change_type: added|removed|modified, details}]
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wmtl_snapshot ON workflow_memory_tool_lineage(snapshot_at DESC);
