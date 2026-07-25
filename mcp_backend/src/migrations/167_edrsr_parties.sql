-- 167_edrsr_parties.sql
-- LEXAI-1760: structured parties table for EDRSR court decisions.
--
-- Today party counting (count_cases_by_party / search_court_decisions party_role) is done
-- entirely at query time by a tsv role-noun prefilter + a POSIX `full_text ~* regex` over the
-- multi-KB body of every candidate row. For a common company name (e.g. «ПриватБанк» — 193k
-- rows in the 2023 partition alone) the un-LIMITed exact count blows past the statement
-- timeout. This table pre-extracts the plaintiff/defendant spans from the standard claim
-- clause ("за позовом X до Y про …") once, at backfill time, so role counts become a fast
-- indexed lookup over a small per-party table instead of a regex scan of 125M full texts.
--
-- Scope of this migration: schema only (table + partitions + indexes + coverage meta).
-- The extraction backfill is a separate, resumable, per-year job:
--   scripts/edrsr/backfill-edrsr-parties.sql  (run per partition, off-peak, in tmux).
-- Phase 1 covers the civil/commercial/administrative caption (justice_kind 1,3,4) and the
-- позивач/відповідач roles. EDRPOU normalisation, criminal (обвинувачений) and third-party
-- roles are deferred to phase 2.
--
-- EDRSR tables carry NO foreign keys (source data references codes absent from the reference
-- tables — same convention as 071_edrsr_metadata.sql). All DDL is idempotent.

-- pg_trgm backs the fuzzy name lookup (name_norm ILIKE '%нова пошта%').
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Parent table, RANGE-partitioned by adjudication year to mirror edrsr_documents /
-- edrsr_fulltext, so a year backfill only touches its own partition and counts that are
-- bounded to a year range prune to the matching partitions.
CREATE TABLE IF NOT EXISTS edrsr_parties (
  doc_id        BIGINT   NOT NULL,
  role          SMALLINT NOT NULL,            -- 1 = позивач (plaintiff), 2 = відповідач (defendant); 3+ reserved
  ord           SMALLINT NOT NULL DEFAULT 1,  -- nth party of that role in the caption (multi-defendant captions)
  name_raw      TEXT     NOT NULL,            -- party span as extracted from the caption (with legal form / quotes)
  name_norm     TEXT     NOT NULL,            -- normalised: lower-cased, quotes/punctuation stripped, ws collapsed
  edrpou        TEXT,                         -- phase 2: matched company code (NULL for now)
  court_code        INTEGER,                  -- denormalised from edrsr_documents for self-contained by_court breakdown
  justice_kind      SMALLINT,                 -- denormalised (1 civil, 3 commercial, 4 administrative …)
  adjudication_date TIMESTAMPTZ,              -- denormalised so day-precision date counts need no join to edrsr_documents
  adj_year      SMALLINT NOT NULL,            -- partition key (= EXTRACT(YEAR FROM adjudication_date))
  PRIMARY KEY (doc_id, role, ord, adj_year)
) PARTITION BY RANGE (adj_year);

-- Pilot partition: 2023. Further years are added by re-running this guarded block with new
-- bounds (kept here so the schema is self-documenting; backfill populates them).
DO $mig$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'edrsr_parties_p_2023') THEN
    CREATE TABLE edrsr_parties_p_2023 PARTITION OF edrsr_parties
      FOR VALUES FROM (2023) TO (2024);
  END IF;
  -- Catch-all so an out-of-range adj_year can never abort an INSERT during backfill.
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'edrsr_parties_p_default') THEN
    CREATE TABLE edrsr_parties_p_default PARTITION OF edrsr_parties DEFAULT;
  END IF;
END
$mig$;

-- Indexes are defined on the parent so they propagate to every (current and future) partition.
-- Fuzzy company lookup: trigram GIN over the normalised name.
CREATE INDEX IF NOT EXISTS idx_edrsr_parties_name_trgm
  ON edrsr_parties USING gin (name_norm gin_trgm_ops);
-- Role/year pruning for aggregate counts.
CREATE INDEX IF NOT EXISTS idx_edrsr_parties_role_year
  ON edrsr_parties (role, adj_year);

-- Coverage meta — which years have been extracted. countByParty consults this to decide
-- whether the requested date range is fully backed by the parties table (fast path) or must
-- fall back to the legacy FTS regex scan (uncovered years).
CREATE TABLE IF NOT EXISTS edrsr_parties_coverage (
  adj_year     SMALLINT PRIMARY KEY,
  doc_count    BIGINT,       -- decisions in the partition considered for extraction
  party_count  BIGINT,       -- party rows extracted for the year
  built_at     TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE edrsr_parties IS
  'LEXAI-1760: structured plaintiff/defendant spans extracted from the EDRSR claim clause. role 1=позивач, 2=відповідач. Populated per-year by scripts/edrsr/backfill-edrsr-parties.sql; see edrsr_parties_coverage for built years.';
