-- Migration 112: GDPR compliance — add ON DELETE SET NULL to all FKs referencing users(id)
-- This allows users to be deleted without violating referential integrity.
-- NOT NULL constraints are dropped first where required so SET NULL can apply.

-- ============================================================
-- consultations: client_user_id (NOT NULL → nullable)
-- ============================================================
DO $$ BEGIN
  ALTER TABLE consultations ALTER COLUMN client_user_id DROP NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE consultations DROP CONSTRAINT IF EXISTS consultations_client_user_id_fkey;
  ALTER TABLE consultations ADD CONSTRAINT consultations_client_user_id_fkey
    FOREIGN KEY (client_user_id) REFERENCES users(id) ON DELETE SET NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

-- ============================================================
-- consultations: attorney_user_id (NOT NULL → nullable)
-- ============================================================
DO $$ BEGIN
  ALTER TABLE consultations ALTER COLUMN attorney_user_id DROP NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE consultations DROP CONSTRAINT IF EXISTS consultations_attorney_user_id_fkey;
  ALTER TABLE consultations ADD CONSTRAINT consultations_attorney_user_id_fkey
    FOREIGN KEY (attorney_user_id) REFERENCES users(id) ON DELETE SET NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

-- ============================================================
-- consultation_payments: payer_user_id (NOT NULL → nullable)
-- ============================================================
DO $$ BEGIN
  ALTER TABLE consultation_payments ALTER COLUMN payer_user_id DROP NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE consultation_payments DROP CONSTRAINT IF EXISTS consultation_payments_payer_user_id_fkey;
  ALTER TABLE consultation_payments ADD CONSTRAINT consultation_payments_payer_user_id_fkey
    FOREIGN KEY (payer_user_id) REFERENCES users(id) ON DELETE SET NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

-- ============================================================
-- consultation_payments: payee_user_id (NOT NULL → nullable)
-- ============================================================
DO $$ BEGIN
  ALTER TABLE consultation_payments ALTER COLUMN payee_user_id DROP NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE consultation_payments DROP CONSTRAINT IF EXISTS consultation_payments_payee_user_id_fkey;
  ALTER TABLE consultation_payments ADD CONSTRAINT consultation_payments_payee_user_id_fkey
    FOREIGN KEY (payee_user_id) REFERENCES users(id) ON DELETE SET NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

-- ============================================================
-- consultation_reviews: reviewer_user_id (NOT NULL → nullable)
-- ============================================================
DO $$ BEGIN
  ALTER TABLE consultation_reviews ALTER COLUMN reviewer_user_id DROP NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE consultation_reviews DROP CONSTRAINT IF EXISTS consultation_reviews_reviewer_user_id_fkey;
  ALTER TABLE consultation_reviews ADD CONSTRAINT consultation_reviews_reviewer_user_id_fkey
    FOREIGN KEY (reviewer_user_id) REFERENCES users(id) ON DELETE SET NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

-- ============================================================
-- consultation_reviews: attorney_user_id (NOT NULL → nullable)
-- ============================================================
DO $$ BEGIN
  ALTER TABLE consultation_reviews ALTER COLUMN attorney_user_id DROP NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE consultation_reviews DROP CONSTRAINT IF EXISTS consultation_reviews_attorney_user_id_fkey;
  ALTER TABLE consultation_reviews ADD CONSTRAINT consultation_reviews_attorney_user_id_fkey
    FOREIGN KEY (attorney_user_id) REFERENCES users(id) ON DELETE SET NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

-- ============================================================
-- consultation_messages: sender_id (NOT NULL → nullable)
-- ============================================================
DO $$ BEGIN
  ALTER TABLE consultation_messages ALTER COLUMN sender_id DROP NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE consultation_messages DROP CONSTRAINT IF EXISTS consultation_messages_sender_id_fkey;
  ALTER TABLE consultation_messages ADD CONSTRAINT consultation_messages_sender_id_fkey
    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE SET NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

-- ============================================================
-- consultation_disputes: raised_by (NOT NULL → nullable)
-- ============================================================
DO $$ BEGIN
  ALTER TABLE consultation_disputes ALTER COLUMN raised_by DROP NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE consultation_disputes DROP CONSTRAINT IF EXISTS consultation_disputes_raised_by_fkey;
  ALTER TABLE consultation_disputes ADD CONSTRAINT consultation_disputes_raised_by_fkey
    FOREIGN KEY (raised_by) REFERENCES users(id) ON DELETE SET NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

-- ============================================================
-- consultation_disputes: resolved_by (already nullable)
-- ============================================================
DO $$ BEGIN
  ALTER TABLE consultation_disputes DROP CONSTRAINT IF EXISTS consultation_disputes_resolved_by_fkey;
  ALTER TABLE consultation_disputes ADD CONSTRAINT consultation_disputes_resolved_by_fkey
    FOREIGN KEY (resolved_by) REFERENCES users(id) ON DELETE SET NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

-- ============================================================
-- attorney_payouts: attorney_user_id (NOT NULL → nullable)
-- ============================================================
DO $$ BEGIN
  ALTER TABLE attorney_payouts ALTER COLUMN attorney_user_id DROP NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE attorney_payouts DROP CONSTRAINT IF EXISTS attorney_payouts_attorney_user_id_fkey;
  ALTER TABLE attorney_payouts ADD CONSTRAINT attorney_payouts_attorney_user_id_fkey
    FOREIGN KEY (attorney_user_id) REFERENCES users(id) ON DELETE SET NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

-- ============================================================
-- attorney_payouts: processed_by (already nullable)
-- ============================================================
DO $$ BEGIN
  ALTER TABLE attorney_payouts DROP CONSTRAINT IF EXISTS attorney_payouts_processed_by_fkey;
  ALTER TABLE attorney_payouts ADD CONSTRAINT attorney_payouts_processed_by_fkey
    FOREIGN KEY (processed_by) REFERENCES users(id) ON DELETE SET NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

-- ============================================================
-- referral_links: referrer_id (NOT NULL → nullable)
-- ============================================================
DO $$ BEGIN
  ALTER TABLE referral_links ALTER COLUMN referrer_id DROP NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE referral_links DROP CONSTRAINT IF EXISTS referral_links_referrer_id_fkey;
  ALTER TABLE referral_links ADD CONSTRAINT referral_links_referrer_id_fkey
    FOREIGN KEY (referrer_id) REFERENCES users(id) ON DELETE SET NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

-- ============================================================
-- referral_links: referred_id (NOT NULL → nullable)
-- Note: uq_referred unique constraint stays; NULL is excluded from unique checks.
-- ============================================================
DO $$ BEGIN
  ALTER TABLE referral_links ALTER COLUMN referred_id DROP NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE referral_links DROP CONSTRAINT IF EXISTS referral_links_referred_id_fkey;
  ALTER TABLE referral_links ADD CONSTRAINT referral_links_referred_id_fkey
    FOREIGN KEY (referred_id) REFERENCES users(id) ON DELETE SET NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

-- ============================================================
-- referral_rewards: beneficiary_id (NOT NULL → nullable)
-- ============================================================
DO $$ BEGIN
  ALTER TABLE referral_rewards ALTER COLUMN beneficiary_id DROP NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE referral_rewards DROP CONSTRAINT IF EXISTS referral_rewards_beneficiary_id_fkey;
  ALTER TABLE referral_rewards ADD CONSTRAINT referral_rewards_beneficiary_id_fkey
    FOREIGN KEY (beneficiary_id) REFERENCES users(id) ON DELETE SET NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

-- ============================================================
-- referral_rewards: source_user_id (NOT NULL → nullable)
-- ============================================================
DO $$ BEGIN
  ALTER TABLE referral_rewards ALTER COLUMN source_user_id DROP NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE referral_rewards DROP CONSTRAINT IF EXISTS referral_rewards_source_user_id_fkey;
  ALTER TABLE referral_rewards ADD CONSTRAINT referral_rewards_source_user_id_fkey
    FOREIGN KEY (source_user_id) REFERENCES users(id) ON DELETE SET NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

-- ============================================================
-- admin_audit_log: admin_id (NOT NULL → nullable)
-- ============================================================
DO $$ BEGIN
  ALTER TABLE admin_audit_log ALTER COLUMN admin_id DROP NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE admin_audit_log DROP CONSTRAINT IF EXISTS admin_audit_log_admin_id_fkey;
  ALTER TABLE admin_audit_log ADD CONSTRAINT admin_audit_log_admin_id_fkey
    FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE SET NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

-- ============================================================
-- admin_audit_log: target_user_id (already nullable)
-- ============================================================
DO $$ BEGIN
  ALTER TABLE admin_audit_log DROP CONSTRAINT IF EXISTS admin_audit_log_target_user_id_fkey;
  ALTER TABLE admin_audit_log ADD CONSTRAINT admin_audit_log_target_user_id_fkey
    FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE SET NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

-- ============================================================
-- b2b_invoices: requested_by (NOT NULL → nullable)
-- ============================================================
DO $$ BEGIN
  ALTER TABLE b2b_invoices ALTER COLUMN requested_by DROP NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE b2b_invoices DROP CONSTRAINT IF EXISTS b2b_invoices_requested_by_fkey;
  ALTER TABLE b2b_invoices ADD CONSTRAINT b2b_invoices_requested_by_fkey
    FOREIGN KEY (requested_by) REFERENCES users(id) ON DELETE SET NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

-- ============================================================
-- b2b_invoices: confirmed_by (already nullable — was REFERENCES users(id) with no NOT NULL)
-- ============================================================
DO $$ BEGIN
  ALTER TABLE b2b_invoices DROP CONSTRAINT IF EXISTS b2b_invoices_confirmed_by_fkey;
  ALTER TABLE b2b_invoices ADD CONSTRAINT b2b_invoices_confirmed_by_fkey
    FOREIGN KEY (confirmed_by) REFERENCES users(id) ON DELETE SET NULL;
EXCEPTION WHEN others THEN NULL;
END $$;
