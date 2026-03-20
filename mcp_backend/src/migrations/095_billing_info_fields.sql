-- Migration 095: Add billing info fields to user_billing
-- Company details for invoicing (companyName, EDRPOU, address, etc.)

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_billing' AND column_name = 'company_name') THEN
    ALTER TABLE user_billing
      ADD COLUMN company_name VARCHAR(255),
      ADD COLUMN edrpou VARCHAR(20),
      ADD COLUMN billing_address TEXT,
      ADD COLUMN billing_city VARCHAR(100),
      ADD COLUMN billing_postal_code VARCHAR(20),
      ADD COLUMN billing_country VARCHAR(100) DEFAULT 'Ukraine',
      ADD COLUMN billing_email VARCHAR(255),
      ADD COLUMN billing_phone VARCHAR(50);
  END IF;
END $$;
