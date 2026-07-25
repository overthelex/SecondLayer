-- Migration 153: A/B testing infrastructure

CREATE TABLE IF NOT EXISTS ab_experiments (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL UNIQUE,
    description     TEXT,
    experiment_type TEXT NOT NULL DEFAULT 'model',
    status          TEXT NOT NULL DEFAULT 'draft',
    config          JSONB NOT NULL DEFAULT '{}',
    target_budget   TEXT,
    traffic_pct     INT NOT NULL DEFAULT 100,
    created_by      TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    started_at      TIMESTAMPTZ,
    ended_at        TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS ab_assignments (
    id              BIGSERIAL PRIMARY KEY,
    experiment_id   TEXT NOT NULL REFERENCES ab_experiments(id),
    user_id         TEXT NOT NULL,
    variant_name    TEXT NOT NULL,
    assigned_at     TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(experiment_id, user_id)
);

CREATE TABLE IF NOT EXISTS ab_events (
    id              BIGSERIAL PRIMARY KEY,
    experiment_id   TEXT NOT NULL REFERENCES ab_experiments(id),
    user_id         TEXT NOT NULL,
    variant_name    TEXT NOT NULL,
    event_type      TEXT NOT NULL,
    event_data      JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

DO $$ BEGIN
    CREATE INDEX idx_ab_assignments_user ON ab_assignments(user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE INDEX idx_ab_assignments_experiment ON ab_assignments(experiment_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE INDEX idx_ab_events_experiment ON ab_events(experiment_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE INDEX idx_ab_events_user ON ab_events(user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE INDEX idx_ab_events_created ON ab_events(created_at);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE INDEX idx_ab_experiments_status ON ab_experiments(status);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
