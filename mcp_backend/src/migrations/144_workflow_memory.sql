-- Migration 144: Workflow Memory schema (Phase 1.0)
-- Three-layer memory: domain principles, workflow patterns, practitioner knowledge.
-- Supports dual-mode retrieval (Qdrant vectors + PostgreSQL structured).

-- Layer 1: Domain principles — ADRs, conventions, architectural decisions
CREATE TABLE IF NOT EXISTS workflow_memory_principles (
  id            SERIAL PRIMARY KEY,
  principle_key TEXT NOT NULL UNIQUE,
  title         TEXT NOT NULL,
  body          TEXT NOT NULL,
  source        TEXT,                          -- e.g. 'adr', 'claude_md', 'pr_review'
  source_ref    TEXT,                          -- e.g. PR URL, file path
  tags          TEXT[] DEFAULT '{}',
  confidence    REAL DEFAULT 1.0 CHECK (confidence BETWEEN 0 AND 1),
  superseded_by INTEGER REFERENCES workflow_memory_principles(id),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wmp_tags ON workflow_memory_principles USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_wmp_source ON workflow_memory_principles(source);

-- Layer 2: Workflow patterns — tool sequences, edit traces, recurring patterns
CREATE TABLE IF NOT EXISTS workflow_memory_patterns (
  id              SERIAL PRIMARY KEY,
  pattern_type    TEXT NOT NULL,                -- 'tool_sequence', 'edit_trace', 'file_group'
  description     TEXT NOT NULL,
  pattern_data    JSONB NOT NULL DEFAULT '{}',  -- structured pattern payload
  frequency       INTEGER DEFAULT 1,
  last_seen_at    TIMESTAMPTZ DEFAULT NOW(),
  session_ids     TEXT[] DEFAULT '{}',          -- which sessions exhibited this pattern
  tags            TEXT[] DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wmpt_type ON workflow_memory_patterns(pattern_type);
CREATE INDEX IF NOT EXISTS idx_wmpt_tags ON workflow_memory_patterns USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_wmpt_last_seen ON workflow_memory_patterns(last_seen_at DESC);

-- Layer 3: Practitioner knowledge — nightly summaries, expertise profiles
CREATE TABLE IF NOT EXISTS workflow_memory_practitioner (
  id              SERIAL PRIMARY KEY,
  knowledge_type  TEXT NOT NULL,                -- 'session_summary', 'expertise_profile', 'correction'
  title           TEXT NOT NULL,
  body            TEXT NOT NULL,
  session_id      TEXT,
  commit_range    TEXT,                         -- e.g. 'abc1234..def5678'
  files_touched   TEXT[] DEFAULT '{}',
  tools_used      TEXT[] DEFAULT '{}',
  tags            TEXT[] DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wmpk_type ON workflow_memory_practitioner(knowledge_type);
CREATE INDEX IF NOT EXISTS idx_wmpk_tags ON workflow_memory_practitioner USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_wmpk_session ON workflow_memory_practitioner(session_id);
CREATE INDEX IF NOT EXISTS idx_wmpk_created ON workflow_memory_practitioner(created_at DESC);

-- Retrieval log — tracks what was retrieved per session (for correction signal in Phase 1.4)
CREATE TABLE IF NOT EXISTS workflow_memory_retrievals (
  id              SERIAL PRIMARY KEY,
  session_id      TEXT NOT NULL,
  query_text      TEXT NOT NULL,
  layer           TEXT NOT NULL,                -- 'principle', 'pattern', 'practitioner'
  result_ids      INTEGER[] DEFAULT '{}',
  scores          REAL[] DEFAULT '{}',
  was_useful      BOOLEAN,                      -- null = unknown, set by post-session reconciliation
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wmr_session ON workflow_memory_retrievals(session_id);
CREATE INDEX IF NOT EXISTS idx_wmr_created ON workflow_memory_retrievals(created_at DESC);
