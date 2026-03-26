-- Session replay: rrweb recording storage
-- Events stored in MinIO as JSON blobs, metadata in PostgreSQL

CREATE TABLE IF NOT EXISTS session_recordings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id VARCHAR(64) NOT NULL UNIQUE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  chunk_count INTEGER DEFAULT 0,
  event_count INTEGER DEFAULT 0,
  total_size_bytes BIGINT DEFAULT 0,
  user_agent TEXT,
  viewport TEXT,
  ip_address INET,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_session_recordings_user ON session_recordings(user_id);
CREATE INDEX IF NOT EXISTS idx_session_recordings_started ON session_recordings(started_at DESC);

CREATE TABLE IF NOT EXISTS session_recording_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recording_id UUID NOT NULL REFERENCES session_recordings(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  minio_key VARCHAR(500) NOT NULL,
  event_count INTEGER NOT NULL DEFAULT 0,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  first_timestamp BIGINT NOT NULL,
  last_timestamp BIGINT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(recording_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_recording_chunks_recording ON session_recording_chunks(recording_id);

-- Server-side logs correlated with session recordings
CREATE TABLE IF NOT EXISTS session_server_logs (
  id BIGSERIAL PRIMARY KEY,
  session_id VARCHAR(64) NOT NULL,
  user_id UUID NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  log_type VARCHAR(50) NOT NULL,  -- 'api_call', 'tool_execution', 'error', 'navigation'
  method VARCHAR(10),
  path TEXT,
  status_code INTEGER,
  duration_ms INTEGER,
  request_body JSONB,
  response_summary JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_session_server_logs_session ON session_server_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_session_server_logs_timestamp ON session_server_logs(session_id, timestamp);

-- Cleanup: auto-purge recordings older than 90 days
CREATE OR REPLACE FUNCTION purge_old_session_recordings(days_old INTEGER DEFAULT 90)
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM session_recordings
  WHERE started_at < NOW() - (days_old || ' days')::INTERVAL;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  DELETE FROM session_server_logs
  WHERE timestamp < NOW() - (days_old || ' days')::INTERVAL;

  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;
