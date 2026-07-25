-- Migration: 073_add_user_banner
-- Add banner column to users table for Ishihara-style profile banners

ALTER TABLE users ADD COLUMN IF NOT EXISTS banner VARCHAR(500);
