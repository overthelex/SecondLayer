-- Migration 068: Add viewed_at column to consultations
-- NULL = unseen by attorney. Set when attorney views/dismisses the modal.

ALTER TABLE consultations ADD COLUMN IF NOT EXISTS viewed_at TIMESTAMPTZ;
