-- Migration 116: Fix video call constraints and add race condition protection
-- Date: 2026-03-27

BEGIN;

-- 1. Partial unique index to prevent duplicate active sessions per consultation
CREATE UNIQUE INDEX IF NOT EXISTS idx_video_call_sessions_one_active_per_consultation
  ON video_call_sessions(consultation_id)
  WHERE status IN ('pending', 'ringing', 'connected');

-- 2. Fix status CHECK to include 'rejected' (used by call-reject handler)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'video_call_sessions_status_check'
  ) THEN
    ALTER TABLE video_call_sessions DROP CONSTRAINT video_call_sessions_status_check;
  END IF;
  ALTER TABLE video_call_sessions
    ADD CONSTRAINT video_call_sessions_status_check
    CHECK (status IN ('pending', 'ringing', 'connected', 'ended', 'failed', 'missed', 'rejected'));
END $$;

-- 3. Fix end_reason CHECK to include all reasons used in code
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'video_call_sessions_end_reason_check'
  ) THEN
    ALTER TABLE video_call_sessions DROP CONSTRAINT video_call_sessions_end_reason_check;
  END IF;
  ALTER TABLE video_call_sessions
    ADD CONSTRAINT video_call_sessions_end_reason_check
    CHECK (end_reason IN ('hangup', 'timeout', 'error', 'declined', 'disconnect', 'rejected', 'ended_by_user'));
END $$;

-- 4. Fix call_transcripts: add session_id column alias if missing
--    (migration 115 uses call_session_id but service code queries session_id)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'call_transcripts' AND column_name = 'call_session_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'call_transcripts' AND column_name = 'session_id'
  ) THEN
    ALTER TABLE call_transcripts RENAME COLUMN call_session_id TO session_id;
  END IF;
END $$;

-- 5. Recreate index on renamed column
DROP INDEX IF EXISTS idx_call_transcripts_call_session_id;
CREATE INDEX IF NOT EXISTS idx_call_transcripts_session_id
  ON call_transcripts(session_id);

COMMIT;
