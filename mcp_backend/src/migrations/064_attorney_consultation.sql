-- Migration 064: Attorney Consultation Feature
-- Adds attorney profiles, consultation workflow, payments, reviews, messaging

-- 1. Add user_type to users table
DO $$ BEGIN
  ALTER TABLE users ADD COLUMN user_type VARCHAR(20) DEFAULT 'individual';
EXCEPTION WHEN duplicate_column THEN
  NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE users ADD CONSTRAINT chk_user_type CHECK (user_type IN ('individual', 'attorney', 'company_admin'));
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- 2. Extend organizations table
DO $$ BEGIN
  ALTER TABLE organizations ADD COLUMN org_type VARCHAR(30) DEFAULT 'personal';
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE organizations ADD COLUMN edrpou VARCHAR(20);
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE organizations ADD COLUMN legal_address TEXT;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE organizations ADD COLUMN phone VARCHAR(30);
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE organizations ADD COLUMN website VARCHAR(255);
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE organizations ADD COLUMN description TEXT;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE organizations ADD COLUMN logo_url TEXT;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE organizations ADD COLUMN verified BOOLEAN DEFAULT FALSE;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE organizations ADD COLUMN verified_at TIMESTAMPTZ;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE organizations ADD CONSTRAINT chk_org_type CHECK (org_type IN ('personal', 'law_firm_llc', 'law_firm_sole', 'legal_department'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. Extend matter_team role to include 'consultant'
-- Drop old constraint and recreate with new value
DO $$ BEGIN
  ALTER TABLE matter_team DROP CONSTRAINT IF EXISTS matter_team_role_check;
  ALTER TABLE matter_team ADD CONSTRAINT matter_team_role_check
    CHECK (role IN ('lead_attorney', 'associate', 'paralegal', 'assistant', 'observer', 'consultant'));
EXCEPTION WHEN undefined_object THEN
  -- constraint may not exist, try to add anyway
  BEGIN
    ALTER TABLE matter_team ADD CONSTRAINT matter_team_role_check
      CHECK (role IN ('lead_attorney', 'associate', 'paralegal', 'assistant', 'observer', 'consultant'));
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

-- 4. Attorney Profiles
CREATE TABLE IF NOT EXISTS attorney_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,

  -- Credentials
  bar_license_number VARCHAR(100),
  bar_admission_date DATE,
  years_experience INTEGER,
  education TEXT,

  -- Specializations
  specializations TEXT[] DEFAULT '{}',
  court_types TEXT[] DEFAULT '{}',

  -- Location
  region VARCHAR(100),
  city VARCHAR(100),
  serves_remotely BOOLEAN DEFAULT TRUE,

  -- Languages
  languages TEXT[] DEFAULT '{ukrainian}',

  -- Pricing (UAH)
  consultation_fee_uah NUMERIC(10,2),
  hourly_rate_uah NUMERIC(10,2),
  representation_fee_uah NUMERIC(10,2),
  free_initial_consultation BOOLEAN DEFAULT FALSE,

  -- Profile
  bio TEXT,
  photo_url TEXT,

  -- Cached stats
  total_consultations INTEGER DEFAULT 0,
  average_rating NUMERIC(3,2) DEFAULT 0,
  rating_count INTEGER DEFAULT 0,

  -- Availability
  is_available BOOLEAN DEFAULT TRUE,
  max_active_consultations INTEGER DEFAULT 10,
  is_public BOOLEAN DEFAULT TRUE,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for attorney search
CREATE INDEX IF NOT EXISTS idx_attorney_profiles_specializations ON attorney_profiles USING GIN (specializations);
CREATE INDEX IF NOT EXISTS idx_attorney_profiles_region ON attorney_profiles (region);
CREATE INDEX IF NOT EXISTS idx_attorney_profiles_available_public ON attorney_profiles (is_available, is_public) WHERE is_available = TRUE AND is_public = TRUE;
CREATE INDEX IF NOT EXISTS idx_attorney_profiles_rating ON attorney_profiles (average_rating DESC) WHERE is_public = TRUE;

-- 5. Consultations
CREATE TABLE IF NOT EXISTS consultations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_user_id UUID NOT NULL REFERENCES users(id),
  attorney_user_id UUID NOT NULL REFERENCES users(id),
  matter_id UUID REFERENCES matters(id) ON DELETE SET NULL,

  -- Type
  consultation_type VARCHAR(30) NOT NULL DEFAULT 'consultation',

  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'pending',

  -- Request
  request_title VARCHAR(500) NOT NULL,
  request_description TEXT,
  urgency VARCHAR(20) DEFAULT 'normal',

  -- Access scope
  share_documents BOOLEAN DEFAULT FALSE,
  share_conversations BOOLEAN DEFAULT FALSE,
  document_ids UUID[] DEFAULT '{}',
  conversation_ids UUID[] DEFAULT '{}',

  -- Pricing
  agreed_fee_uah NUMERIC(10,2),
  fee_type VARCHAR(20) DEFAULT 'fixed',
  estimated_hours NUMERIC(6,2),

  -- Scheduling
  preferred_datetime TIMESTAMPTZ,
  scheduled_datetime TIMESTAMPTZ,

  -- State transition timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  declined_at TIMESTAMPTZ,

  -- Completion
  completion_summary TEXT,
  decline_reason TEXT,
  cancel_reason TEXT,

  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT chk_consultation_type CHECK (consultation_type IN ('consultation', 'representation', 'document_review')),
  CONSTRAINT chk_consultation_status CHECK (status IN ('pending', 'accepted', 'paid', 'in_progress', 'completed', 'cancelled', 'declined', 'disputed')),
  CONSTRAINT chk_urgency CHECK (urgency IN ('low', 'normal', 'high', 'urgent')),
  CONSTRAINT chk_fee_type CHECK (fee_type IN ('fixed', 'hourly', 'free'))
);

CREATE INDEX IF NOT EXISTS idx_consultations_client ON consultations (client_user_id, status);
CREATE INDEX IF NOT EXISTS idx_consultations_attorney ON consultations (attorney_user_id, status);
CREATE INDEX IF NOT EXISTS idx_consultations_matter ON consultations (matter_id) WHERE matter_id IS NOT NULL;

-- 6. Consultation Payments (escrow)
CREATE TABLE IF NOT EXISTS consultation_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consultation_id UUID NOT NULL REFERENCES consultations(id) ON DELETE CASCADE,
  payer_user_id UUID NOT NULL REFERENCES users(id),
  payee_user_id UUID NOT NULL REFERENCES users(id),

  amount_uah NUMERIC(10,2) NOT NULL,
  platform_fee_uah NUMERIC(10,2) DEFAULT 0,
  attorney_payout_uah NUMERIC(10,2) NOT NULL,

  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  payment_provider VARCHAR(30) DEFAULT 'monobank',
  payment_provider_id VARCHAR(255),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  processing_at TIMESTAMPTZ,
  held_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  refunded_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT chk_payment_status CHECK (status IN ('pending', 'processing', 'held', 'released', 'refunded'))
);

CREATE INDEX IF NOT EXISTS idx_consultation_payments_consultation ON consultation_payments (consultation_id);

-- 7. Consultation Reviews
CREATE TABLE IF NOT EXISTS consultation_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consultation_id UUID NOT NULL UNIQUE REFERENCES consultations(id) ON DELETE CASCADE,
  reviewer_user_id UUID NOT NULL REFERENCES users(id),
  attorney_user_id UUID NOT NULL REFERENCES users(id),

  rating INTEGER NOT NULL,
  review_text TEXT,

  communication_rating INTEGER,
  knowledge_rating INTEGER,
  professionalism_rating INTEGER,
  value_rating INTEGER,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT chk_rating CHECK (rating BETWEEN 1 AND 5),
  CONSTRAINT chk_communication CHECK (communication_rating IS NULL OR communication_rating BETWEEN 1 AND 5),
  CONSTRAINT chk_knowledge CHECK (knowledge_rating IS NULL OR knowledge_rating BETWEEN 1 AND 5),
  CONSTRAINT chk_professionalism CHECK (professionalism_rating IS NULL OR professionalism_rating BETWEEN 1 AND 5),
  CONSTRAINT chk_value CHECK (value_rating IS NULL OR value_rating BETWEEN 1 AND 5)
);

CREATE INDEX IF NOT EXISTS idx_consultation_reviews_attorney ON consultation_reviews (attorney_user_id);

-- 8. Consultation Messages
CREATE TABLE IF NOT EXISTS consultation_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consultation_id UUID NOT NULL REFERENCES consultations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id),
  content TEXT NOT NULL,
  message_type VARCHAR(20) DEFAULT 'text',
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT chk_message_type CHECK (message_type IN ('text', 'system', 'file'))
);

CREATE INDEX IF NOT EXISTS idx_consultation_messages_consultation ON consultation_messages (consultation_id, created_at);

-- Update trigger for attorney_profiles
CREATE OR REPLACE FUNCTION update_attorney_profile_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_attorney_profiles_updated ON attorney_profiles;
CREATE TRIGGER trg_attorney_profiles_updated
  BEFORE UPDATE ON attorney_profiles
  FOR EACH ROW EXECUTE FUNCTION update_attorney_profile_updated_at();

-- Update trigger for consultations
DROP TRIGGER IF EXISTS trg_consultations_updated ON consultations;
CREATE TRIGGER trg_consultations_updated
  BEFORE UPDATE ON consultations
  FOR EACH ROW EXECUTE FUNCTION update_attorney_profile_updated_at();

-- Update trigger for consultation_payments
DROP TRIGGER IF EXISTS trg_consultation_payments_updated ON consultation_payments;
CREATE TRIGGER trg_consultation_payments_updated
  BEFORE UPDATE ON consultation_payments
  FOR EACH ROW EXECUTE FUNCTION update_attorney_profile_updated_at();
