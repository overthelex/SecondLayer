-- Add request_id column to conversations for frontend chat ID tracking
-- The request_id (e.g. "chat-{uuid}") is shown in the UI as #chat-xxx
-- and allows easy log correlation between frontend and backend

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS request_id TEXT;

CREATE INDEX IF NOT EXISTS idx_conversations_request_id ON conversations(request_id) WHERE request_id IS NOT NULL;
