-- Denormalize the bill's title/subject onto each document. rada.bills only holds the
-- current convocation (bill_number is UNIQUE there, and numbers reset each convocation, so
-- older bills cannot be loaded into it without collisions). Carrying bill_title/bill_subject
-- on the document makes every document self-describing across all convocations without a
-- fragile cross-convocation join.

ALTER TABLE bill_documents ADD COLUMN IF NOT EXISTS bill_title   TEXT;
ALTER TABLE bill_documents ADD COLUMN IF NOT EXISTS bill_subject TEXT;

CREATE INDEX IF NOT EXISTS idx_bill_documents_bill_title_fts ON bill_documents
  USING gin(to_tsvector('simple', coalesce(bill_title, '')));
