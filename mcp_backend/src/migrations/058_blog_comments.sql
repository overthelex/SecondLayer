-- Migration 058: Blog comments
-- Stores user comments on blog articles
-- Date: 2026-02-26

BEGIN;

CREATE TABLE IF NOT EXISTS blog_comments (
  id          SERIAL PRIMARY KEY,
  article_id  TEXT NOT NULL,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_name   TEXT,
  user_picture TEXT,
  content     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_blog_comments_article ON blog_comments(article_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_blog_comments_user    ON blog_comments(user_id);

COMMIT;
