-- Migration 081: Consultation message enhancements (status indicators + attachments)

-- Message status: 'sent' | 'delivered' | 'read'
ALTER TABLE consultation_messages ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'sent';
ALTER TABLE consultation_messages ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;

-- Attachments
ALTER TABLE consultation_messages ADD COLUMN IF NOT EXISTS attachment_url TEXT;
ALTER TABLE consultation_messages ADD COLUMN IF NOT EXISTS attachment_name VARCHAR(500);
ALTER TABLE consultation_messages ADD COLUMN IF NOT EXISTS attachment_type VARCHAR(100);
ALTER TABLE consultation_messages ADD COLUMN IF NOT EXISTS attachment_size BIGINT;

-- Backfill existing messages: if read_at is set → 'read', otherwise → 'delivered' (since they were already fetched)
UPDATE consultation_messages SET status = 'read' WHERE read_at IS NOT NULL AND status IS NULL;
UPDATE consultation_messages SET status = 'sent' WHERE status IS NULL;
