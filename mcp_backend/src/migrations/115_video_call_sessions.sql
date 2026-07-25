-- Migration 115: Create video/audio call sessions and transcripts tables
-- Date: 2026-03-27

BEGIN;

-- 1. video_call_sessions — tracks call state for consultation calls
CREATE TABLE IF NOT EXISTS video_call_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consultation_id UUID NOT NULL REFERENCES consultations(id) ON DELETE CASCADE,
  caller_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  callee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  call_type VARCHAR(10) NOT NULL DEFAULT 'video',
  started_at TIMESTAMPTZ,
  connected_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  end_reason VARCHAR(50),
  recording_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add CHECK constraints idempotently
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'video_call_sessions_status_check'
  ) THEN
    ALTER TABLE video_call_sessions
      ADD CONSTRAINT video_call_sessions_status_check
      CHECK (status IN ('pending', 'ringing', 'connected', 'ended', 'failed', 'missed'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'video_call_sessions_call_type_check'
  ) THEN
    ALTER TABLE video_call_sessions
      ADD CONSTRAINT video_call_sessions_call_type_check
      CHECK (call_type IN ('video', 'audio'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'video_call_sessions_end_reason_check'
  ) THEN
    ALTER TABLE video_call_sessions
      ADD CONSTRAINT video_call_sessions_end_reason_check
      CHECK (end_reason IN ('hangup', 'timeout', 'error', 'declined'));
  END IF;
END $$;

-- 2. call_transcripts — stores transcription segments for calls
CREATE TABLE IF NOT EXISTS call_transcripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_session_id UUID NOT NULL REFERENCES video_call_sessions(id) ON DELETE CASCADE,
  speaker_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  language VARCHAR(5) DEFAULT 'uk',
  is_final BOOLEAN DEFAULT false,
  timestamp_ms INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_video_call_sessions_consultation_id
  ON video_call_sessions(consultation_id);

CREATE INDEX IF NOT EXISTS idx_video_call_sessions_caller_id
  ON video_call_sessions(caller_id);

CREATE INDEX IF NOT EXISTS idx_video_call_sessions_callee_id
  ON video_call_sessions(callee_id);

CREATE INDEX IF NOT EXISTS idx_video_call_sessions_consultation_status
  ON video_call_sessions(consultation_id, status);

CREATE INDEX IF NOT EXISTS idx_call_transcripts_call_session_id
  ON call_transcripts(call_session_id);

-- 4. updated_at trigger for video_call_sessions
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_video_call_sessions_updated_at'
  ) THEN
    CREATE TRIGGER trg_video_call_sessions_updated_at
      BEFORE UPDATE ON video_call_sessions
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

COMMIT;
