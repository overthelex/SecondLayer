-- Denormalize the bill's initiators (co-sponsors) onto each document. The feed carries the
-- real initiator people (deputy: mp/official.person; body: inner/outter with post/org), while
-- rada.bills.initiator_names only stored the generic type ("Народний депутат України").
-- bill_initiators = "; "-joined names; bill_initiator_ids = deputy person ids (link to deputies).

ALTER TABLE bill_documents ADD COLUMN IF NOT EXISTS bill_initiators    TEXT;
ALTER TABLE bill_documents ADD COLUMN IF NOT EXISTS bill_initiator_ids BIGINT[];

CREATE INDEX IF NOT EXISTS idx_bill_documents_initiators_fts ON bill_documents
  USING gin(to_tsvector('simple', coalesce(bill_initiators, '')));
CREATE INDEX IF NOT EXISTS idx_bill_documents_initiator_ids ON bill_documents
  USING gin(bill_initiator_ids);
