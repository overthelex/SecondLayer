CREATE TABLE IF NOT EXISTS workflow_edit_engagement (
  engagement_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  edit_id                 UUID NOT NULL REFERENCES workflow_edits(edit_id) ON DELETE CASCADE,
  session_id              UUID NOT NULL REFERENCES workflow_sessions(session_id) ON DELETE CASCADE,
  t_from                  TIMESTAMPTZ NOT NULL,
  t_to                    TIMESTAMPTZ NOT NULL,
  query_window_start      TIMESTAMPTZ NOT NULL,
  query_window_end        TIMESTAMPTZ NOT NULL,
  active_seconds          INT NOT NULL DEFAULT 0,
  passive_seconds         INT NOT NULL DEFAULT 0,
  idle_seconds            INT NOT NULL DEFAULT 0,
  total_key_presses       INT NOT NULL DEFAULT 0,
  total_mouse_distance    NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_clicks            INT NOT NULL DEFAULT 0,
  idle_gap_count          INT NOT NULL DEFAULT 0,
  idle_gap_total_seconds  INT NOT NULL DEFAULT 0,
  apps_touched            INT NOT NULL DEFAULT 0,
  research_switches       INT NOT NULL DEFAULT 0,
  voice_context           BOOLEAN NOT NULL DEFAULT FALSE,
  window_dwell_entropy    NUMERIC(8,6) NOT NULL DEFAULT 0,
  window_category_seconds JSONB DEFAULT '{}',
  process_data_available  BOOLEAN NOT NULL DEFAULT FALSE,
  xsistant_rows_matched   INT NOT NULL DEFAULT 0,
  linked_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata                JSONB DEFAULT '{}',
  UNIQUE (edit_id)
);

CREATE INDEX IF NOT EXISTS idx_engagement_edit ON workflow_edit_engagement(edit_id);
CREATE INDEX IF NOT EXISTS idx_engagement_session ON workflow_edit_engagement(session_id);
CREATE INDEX IF NOT EXISTS idx_engagement_available ON workflow_edit_engagement(process_data_available);
