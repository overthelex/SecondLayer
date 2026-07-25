-- Add section_title and chapter_title columns to legislation_articles
-- These store the display name of the section/chapter each article belongs to

ALTER TABLE legislation_articles
  ADD COLUMN IF NOT EXISTS section_title TEXT,
  ADD COLUMN IF NOT EXISTS chapter_title TEXT;
