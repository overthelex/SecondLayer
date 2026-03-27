-- Migration 120: Track E2EE establishment state on consultations

ALTER TABLE consultations ADD COLUMN IF NOT EXISTS e2ee_established BOOLEAN DEFAULT FALSE;
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS e2ee_established_at TIMESTAMPTZ;
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS e2ee_established_by UUID REFERENCES users(id);
