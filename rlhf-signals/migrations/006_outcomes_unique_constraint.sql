ALTER TABLE workflow_outcomes
  ADD CONSTRAINT uq_outcomes_session_type_source UNIQUE (session_id, outcome_type, source);
