-- Document ids are NOT globally unique across convocations: the legacy bills-sklN.json
-- feeds identify documents by the uri's pf35401 param, whose value space overlaps the
-- modern itd document ids used by billinfo-skl9.json. With a doc_id-only primary key,
-- loading an older convocation overwrote same-id rows from a newer one. The key must
-- therefore include convocation.

DO $$ BEGIN
  ALTER TABLE bill_documents ALTER COLUMN convocation SET NOT NULL;
EXCEPTION WHEN others THEN NULL; END $$;

ALTER TABLE bill_documents DROP CONSTRAINT IF EXISTS bill_documents_pkey;
ALTER TABLE bill_documents ADD CONSTRAINT bill_documents_pkey PRIMARY KEY (doc_id, convocation);
