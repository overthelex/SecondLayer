-- AUP (Acceptable Use Policy) consent audit log
-- Records each time a user accepts the AUP before uploading files.
CREATE TABLE IF NOT EXISTS user_aup_consents (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  aup_version VARCHAR(20) NOT NULL DEFAULT '1.0',
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address INET
);

CREATE INDEX IF NOT EXISTS idx_user_aup_consents_user_id ON user_aup_consents(user_id);
