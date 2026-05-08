CREATE TABLE IF NOT EXISTS workflow_outcomes (
  outcome_id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id              UUID NOT NULL REFERENCES workflow_sessions(session_id) ON DELETE CASCADE,
  outcome_type            TEXT NOT NULL,
  outcome_value           TEXT,
  observed_at             TIMESTAMPTZ NOT NULL,
  attribution_window_days INT NOT NULL,
  attribution_confidence  TEXT NOT NULL CHECK (attribution_confidence IN ('strong', 'medium', 'weak')),
  source                  TEXT NOT NULL,
  metadata                JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_outcomes_session ON workflow_outcomes(session_id);
CREATE INDEX IF NOT EXISTS idx_outcomes_type ON workflow_outcomes(outcome_type);
