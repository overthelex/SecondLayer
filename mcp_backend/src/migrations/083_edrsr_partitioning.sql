-- Migration 083: EDRSR table partitioning by year
-- Creates partitioned versions of edrsr_documents and edrsr_fulltext.
-- This migration only creates the SCHEMA (empty partitions).
-- Data migration is handled by: npx tsx src/scripts/partition-edrsr-tables.ts
--
-- After running the data migration script, it will:
--   1. Copy all rows from old tables into partitioned tables
--   2. Build per-partition indexes
--   3. Swap table names (old → _old, new → production)
--
-- Benefits:
--   - Partition pruning for date-range queries (judge analytics: 5 partitions vs full scan)
--   - Smaller per-partition indexes fit in RAM
--   - VACUUM/ANALYZE per partition (no full-table locks)
--   - Partition-wise JOINs between documents and fulltext

-- ═══════════════════════════════════════════════════════════════════════════
-- edrsr_documents_new: partitioned by RANGE on adjudication_date
-- ═══════════════════════════════════════════════════════════════════════════

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class WHERE relname = 'edrsr_documents_new' AND relkind = 'p'
  ) THEN

    CREATE TABLE edrsr_documents_new (
      doc_id BIGINT NOT NULL,
      court_code INTEGER,
      judgment_code SMALLINT,
      justice_kind SMALLINT,
      category_code INTEGER,
      cause_num TEXT,
      adjudication_date TIMESTAMPTZ,
      receipt_date TIMESTAMPTZ,
      judge TEXT,
      doc_url TEXT,
      status SMALLINT DEFAULT 0,
      date_publ TIMESTAMPTZ
    ) PARTITION BY RANGE (adjudication_date);

    -- Year partitions: individual years from 2005 to 2027
    CREATE TABLE edrsr_documents_p_pre2005 PARTITION OF edrsr_documents_new
      FOR VALUES FROM (MINVALUE) TO ('2005-01-01');

    CREATE TABLE edrsr_documents_p_2005 PARTITION OF edrsr_documents_new
      FOR VALUES FROM ('2005-01-01') TO ('2006-01-01');
    CREATE TABLE edrsr_documents_p_2006 PARTITION OF edrsr_documents_new
      FOR VALUES FROM ('2006-01-01') TO ('2007-01-01');
    CREATE TABLE edrsr_documents_p_2007 PARTITION OF edrsr_documents_new
      FOR VALUES FROM ('2007-01-01') TO ('2008-01-01');
    CREATE TABLE edrsr_documents_p_2008 PARTITION OF edrsr_documents_new
      FOR VALUES FROM ('2008-01-01') TO ('2009-01-01');
    CREATE TABLE edrsr_documents_p_2009 PARTITION OF edrsr_documents_new
      FOR VALUES FROM ('2009-01-01') TO ('2010-01-01');
    CREATE TABLE edrsr_documents_p_2010 PARTITION OF edrsr_documents_new
      FOR VALUES FROM ('2010-01-01') TO ('2011-01-01');
    CREATE TABLE edrsr_documents_p_2011 PARTITION OF edrsr_documents_new
      FOR VALUES FROM ('2011-01-01') TO ('2012-01-01');
    CREATE TABLE edrsr_documents_p_2012 PARTITION OF edrsr_documents_new
      FOR VALUES FROM ('2012-01-01') TO ('2013-01-01');
    CREATE TABLE edrsr_documents_p_2013 PARTITION OF edrsr_documents_new
      FOR VALUES FROM ('2013-01-01') TO ('2014-01-01');
    CREATE TABLE edrsr_documents_p_2014 PARTITION OF edrsr_documents_new
      FOR VALUES FROM ('2014-01-01') TO ('2015-01-01');
    CREATE TABLE edrsr_documents_p_2015 PARTITION OF edrsr_documents_new
      FOR VALUES FROM ('2015-01-01') TO ('2016-01-01');
    CREATE TABLE edrsr_documents_p_2016 PARTITION OF edrsr_documents_new
      FOR VALUES FROM ('2016-01-01') TO ('2017-01-01');
    CREATE TABLE edrsr_documents_p_2017 PARTITION OF edrsr_documents_new
      FOR VALUES FROM ('2017-01-01') TO ('2018-01-01');
    CREATE TABLE edrsr_documents_p_2018 PARTITION OF edrsr_documents_new
      FOR VALUES FROM ('2018-01-01') TO ('2019-01-01');
    CREATE TABLE edrsr_documents_p_2019 PARTITION OF edrsr_documents_new
      FOR VALUES FROM ('2019-01-01') TO ('2020-01-01');
    CREATE TABLE edrsr_documents_p_2020 PARTITION OF edrsr_documents_new
      FOR VALUES FROM ('2020-01-01') TO ('2021-01-01');
    CREATE TABLE edrsr_documents_p_2021 PARTITION OF edrsr_documents_new
      FOR VALUES FROM ('2021-01-01') TO ('2022-01-01');
    CREATE TABLE edrsr_documents_p_2022 PARTITION OF edrsr_documents_new
      FOR VALUES FROM ('2022-01-01') TO ('2023-01-01');
    CREATE TABLE edrsr_documents_p_2023 PARTITION OF edrsr_documents_new
      FOR VALUES FROM ('2023-01-01') TO ('2024-01-01');
    CREATE TABLE edrsr_documents_p_2024 PARTITION OF edrsr_documents_new
      FOR VALUES FROM ('2024-01-01') TO ('2025-01-01');
    CREATE TABLE edrsr_documents_p_2025 PARTITION OF edrsr_documents_new
      FOR VALUES FROM ('2025-01-01') TO ('2026-01-01');
    CREATE TABLE edrsr_documents_p_2026 PARTITION OF edrsr_documents_new
      FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');
    CREATE TABLE edrsr_documents_p_future PARTITION OF edrsr_documents_new
      FOR VALUES FROM ('2027-01-01') TO (MAXVALUE);

    -- DEFAULT partition catches NULLs
    CREATE TABLE edrsr_documents_p_default PARTITION OF edrsr_documents_new DEFAULT;

    RAISE NOTICE 'Created edrsr_documents_new with 25 partitions';
  ELSE
    RAISE NOTICE 'edrsr_documents_new already exists, skipping';
  END IF;
END $$;


-- ═══════════════════════════════════════════════════════════════════════════
-- edrsr_fulltext_new: partitioned by LIST on adj_year
-- adj_year is derived from edrsr_documents.adjudication_date during data copy
-- Enables partition-wise JOINs with edrsr_documents when filtering by year
-- ═══════════════════════════════════════════════════════════════════════════

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class WHERE relname = 'edrsr_fulltext_new' AND relkind = 'p'
  ) THEN

    CREATE TABLE edrsr_fulltext_new (
      doc_id BIGINT NOT NULL,
      full_text TEXT,
      text_length INTEGER,
      tsv tsvector,
      adj_year SMALLINT,
      created_at TIMESTAMP DEFAULT NOW()
    ) PARTITION BY LIST (adj_year);

    -- Year partitions matching edrsr_documents
    CREATE TABLE edrsr_fulltext_p_pre2005 PARTITION OF edrsr_fulltext_new
      FOR VALUES IN (2000, 2001, 2002, 2003, 2004);
    CREATE TABLE edrsr_fulltext_p_2005 PARTITION OF edrsr_fulltext_new
      FOR VALUES IN (2005);
    CREATE TABLE edrsr_fulltext_p_2006 PARTITION OF edrsr_fulltext_new
      FOR VALUES IN (2006);
    CREATE TABLE edrsr_fulltext_p_2007 PARTITION OF edrsr_fulltext_new
      FOR VALUES IN (2007);
    CREATE TABLE edrsr_fulltext_p_2008 PARTITION OF edrsr_fulltext_new
      FOR VALUES IN (2008);
    CREATE TABLE edrsr_fulltext_p_2009 PARTITION OF edrsr_fulltext_new
      FOR VALUES IN (2009);
    CREATE TABLE edrsr_fulltext_p_2010 PARTITION OF edrsr_fulltext_new
      FOR VALUES IN (2010);
    CREATE TABLE edrsr_fulltext_p_2011 PARTITION OF edrsr_fulltext_new
      FOR VALUES IN (2011);
    CREATE TABLE edrsr_fulltext_p_2012 PARTITION OF edrsr_fulltext_new
      FOR VALUES IN (2012);
    CREATE TABLE edrsr_fulltext_p_2013 PARTITION OF edrsr_fulltext_new
      FOR VALUES IN (2013);
    CREATE TABLE edrsr_fulltext_p_2014 PARTITION OF edrsr_fulltext_new
      FOR VALUES IN (2014);
    CREATE TABLE edrsr_fulltext_p_2015 PARTITION OF edrsr_fulltext_new
      FOR VALUES IN (2015);
    CREATE TABLE edrsr_fulltext_p_2016 PARTITION OF edrsr_fulltext_new
      FOR VALUES IN (2016);
    CREATE TABLE edrsr_fulltext_p_2017 PARTITION OF edrsr_fulltext_new
      FOR VALUES IN (2017);
    CREATE TABLE edrsr_fulltext_p_2018 PARTITION OF edrsr_fulltext_new
      FOR VALUES IN (2018);
    CREATE TABLE edrsr_fulltext_p_2019 PARTITION OF edrsr_fulltext_new
      FOR VALUES IN (2019);
    CREATE TABLE edrsr_fulltext_p_2020 PARTITION OF edrsr_fulltext_new
      FOR VALUES IN (2020);
    CREATE TABLE edrsr_fulltext_p_2021 PARTITION OF edrsr_fulltext_new
      FOR VALUES IN (2021);
    CREATE TABLE edrsr_fulltext_p_2022 PARTITION OF edrsr_fulltext_new
      FOR VALUES IN (2022);
    CREATE TABLE edrsr_fulltext_p_2023 PARTITION OF edrsr_fulltext_new
      FOR VALUES IN (2023);
    CREATE TABLE edrsr_fulltext_p_2024 PARTITION OF edrsr_fulltext_new
      FOR VALUES IN (2024);
    CREATE TABLE edrsr_fulltext_p_2025 PARTITION OF edrsr_fulltext_new
      FOR VALUES IN (2025);
    CREATE TABLE edrsr_fulltext_p_2026 PARTITION OF edrsr_fulltext_new
      FOR VALUES IN (2026);
    CREATE TABLE edrsr_fulltext_p_future PARTITION OF edrsr_fulltext_new
      FOR VALUES IN (2027, 2028, 2029, 2030);

    -- DEFAULT partition: orphaned fulltext records (no matching doc) or unknown year
    CREATE TABLE edrsr_fulltext_p_default PARTITION OF edrsr_fulltext_new DEFAULT;

    RAISE NOTICE 'Created edrsr_fulltext_new with 25 partitions';
  ELSE
    RAISE NOTICE 'edrsr_fulltext_new already exists, skipping';
  END IF;
END $$;
