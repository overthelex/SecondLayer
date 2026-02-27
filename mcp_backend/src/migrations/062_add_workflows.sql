-- 062: Add workflow_sets and workflows tables for institutional analysis
-- Supports generating structured workflow sets from chat queries

CREATE TABLE IF NOT EXISTS workflow_sets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255) NOT NULL,
    conversation_id VARCHAR(255),
    title VARCHAR(500) NOT NULL,
    description TEXT,
    source_query TEXT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workflow_sets_user_id ON workflow_sets(user_id);
CREATE INDEX IF NOT EXISTS idx_workflow_sets_status ON workflow_sets(status);
CREATE INDEX IF NOT EXISTS idx_workflow_sets_created_at ON workflow_sets(created_at DESC);

CREATE TABLE IF NOT EXISTS workflows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_set_id UUID NOT NULL REFERENCES workflow_sets(id) ON DELETE CASCADE,
    sequence_number INTEGER NOT NULL,
    title VARCHAR(500) NOT NULL,
    description TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    progress JSONB DEFAULT '{}',
    plan JSONB NOT NULL DEFAULT '{}',
    results JSONB DEFAULT NULL,
    error_message TEXT,
    cost_usd NUMERIC(10, 6) DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workflows_set_id ON workflows(workflow_set_id);
CREATE INDEX IF NOT EXISTS idx_workflows_status ON workflows(status);

-- Triggers for updated_at
DO $$ BEGIN
    CREATE TRIGGER update_workflow_sets_updated_at
        BEFORE UPDATE ON workflow_sets
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TRIGGER update_workflows_updated_at
        BEFORE UPDATE ON workflows
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
