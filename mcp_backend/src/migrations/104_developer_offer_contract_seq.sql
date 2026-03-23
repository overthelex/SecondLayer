-- Developer offer contract number sequence
DO $$ BEGIN
  CREATE SEQUENCE IF NOT EXISTS developer_offer_contract_seq START WITH 1;
EXCEPTION WHEN duplicate_table THEN
  NULL;
END $$;
