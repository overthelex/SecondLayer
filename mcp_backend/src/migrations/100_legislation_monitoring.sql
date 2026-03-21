-- Migration 100: Legislation monitoring - subscriptions, change tracking, notifications

-- User subscriptions to legislation documents
CREATE TABLE IF NOT EXISTS legislation_subscriptions (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  legislation_id INTEGER NOT NULL REFERENCES legislation(id) ON DELETE CASCADE,
  notify_email BOOLEAN DEFAULT true,
  notify_inapp BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, legislation_id)
);
CREATE INDEX IF NOT EXISTS idx_leg_sub_user ON legislation_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_leg_sub_legislation ON legislation_subscriptions(legislation_id);

-- Change log for detected legislation changes
CREATE TABLE IF NOT EXISTS legislation_changes (
  id SERIAL PRIMARY KEY,
  legislation_id INTEGER NOT NULL REFERENCES legislation(id) ON DELETE CASCADE,
  rada_id VARCHAR(100) NOT NULL,
  article_number VARCHAR(50),
  change_type VARCHAR(20) NOT NULL CHECK (change_type IN ('added', 'modified', 'removed')),
  old_text TEXT,
  new_text TEXT,
  diff_html TEXT,
  detected_at TIMESTAMPTZ DEFAULT NOW(),
  version_date TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_leg_changes_legislation ON legislation_changes(legislation_id);
CREATE INDEX IF NOT EXISTS idx_leg_changes_detected ON legislation_changes(detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_leg_changes_rada ON legislation_changes(rada_id);

-- Generic in-app notifications
CREATE TABLE IF NOT EXISTS user_notifications (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  metadata JSONB DEFAULT '{}',
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON user_notifications(user_id, is_read, created_at DESC);
