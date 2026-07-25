-- Repartition edrsr_fulltext_p_default → year partitions
-- Run: docker exec secondlayer-postgres-prod psql -U secondlayer -d secondlayer_prod -f /tmp/repartition.sql
-- Moves all rows from default partition to correct year partitions in batches.

SET statement_timeout = 0;
SET work_mem = '1GB';

\echo '=== Starting repartition ==='
\echo 'Counting rows in default partition...'
SELECT COUNT(*) AS total_in_default FROM edrsr_fulltext_p_default;

-- Helper function: move one year in batches
CREATE OR REPLACE FUNCTION repartition_year(target_year smallint, target_part text, batch_sz int DEFAULT 50000)
RETURNS bigint AS $$
DECLARE
  total_moved bigint := 0;
  batch_moved bigint;
  start_ts timestamptz := clock_timestamp();
BEGIN
  RAISE NOTICE 'Year %: starting → %', target_year, target_part;

  LOOP
    EXECUTE format(
      'WITH moved AS (
         DELETE FROM edrsr_fulltext_p_default
         WHERE ctid IN (
           SELECT ctid FROM edrsr_fulltext_p_default
           WHERE adj_year = %s
           LIMIT %s
         )
         RETURNING doc_id, full_text, text_length, tsv, adj_year, created_at
       )
       INSERT INTO %I (doc_id, full_text, text_length, tsv, adj_year, created_at)
       SELECT * FROM moved
       ON CONFLICT (doc_id) DO NOTHING',
      target_year, batch_sz, target_part
    );

    GET DIAGNOSTICS batch_moved = ROW_COUNT;
    total_moved := total_moved + batch_moved;

    EXIT WHEN batch_moved = 0;

    IF total_moved % (batch_sz * 5) = 0 THEN
      RAISE NOTICE 'Year %: moved % rows so far (% s elapsed)',
        target_year, total_moved,
        EXTRACT(EPOCH FROM clock_timestamp() - start_ts)::int;
    END IF;
  END LOOP;

  RAISE NOTICE 'Year %: DONE — % rows moved in % s',
    target_year, total_moved,
    EXTRACT(EPOCH FROM clock_timestamp() - start_ts)::int;

  RETURN total_moved;
END;
$$ LANGUAGE plpgsql;

-- Move pre-2005 years
SELECT repartition_year(1991::smallint, 'edrsr_fulltext_p_pre2005');
SELECT repartition_year(1995::smallint, 'edrsr_fulltext_p_pre2005');
SELECT repartition_year(2000::smallint, 'edrsr_fulltext_p_pre2005');
SELECT repartition_year(2002::smallint, 'edrsr_fulltext_p_pre2005');

-- Move years 2005-2026
SELECT repartition_year(2005::smallint, 'edrsr_fulltext_p_2005');
SELECT repartition_year(2006::smallint, 'edrsr_fulltext_p_2006');
SELECT repartition_year(2007::smallint, 'edrsr_fulltext_p_2007');
SELECT repartition_year(2008::smallint, 'edrsr_fulltext_p_2008');
SELECT repartition_year(2009::smallint, 'edrsr_fulltext_p_2009');

\echo 'VACUUM after small years...'
VACUUM edrsr_fulltext_p_default;

SELECT repartition_year(2010::smallint, 'edrsr_fulltext_p_2010');
SELECT repartition_year(2011::smallint, 'edrsr_fulltext_p_2011');
SELECT repartition_year(2012::smallint, 'edrsr_fulltext_p_2012');
SELECT repartition_year(2013::smallint, 'edrsr_fulltext_p_2013');
SELECT repartition_year(2014::smallint, 'edrsr_fulltext_p_2014');

\echo 'VACUUM after 2010-2014...'
VACUUM edrsr_fulltext_p_default;

SELECT repartition_year(2015::smallint, 'edrsr_fulltext_p_2015');
SELECT repartition_year(2016::smallint, 'edrsr_fulltext_p_2016');
SELECT repartition_year(2017::smallint, 'edrsr_fulltext_p_2017');

\echo 'VACUUM after 2015-2017...'
VACUUM edrsr_fulltext_p_default;

SELECT repartition_year(2018::smallint, 'edrsr_fulltext_p_2018');
SELECT repartition_year(2019::smallint, 'edrsr_fulltext_p_2019');
SELECT repartition_year(2020::smallint, 'edrsr_fulltext_p_2020');

\echo 'VACUUM after 2018-2020...'
VACUUM edrsr_fulltext_p_default;

SELECT repartition_year(2021::smallint, 'edrsr_fulltext_p_2021');
SELECT repartition_year(2022::smallint, 'edrsr_fulltext_p_2022');
SELECT repartition_year(2023::smallint, 'edrsr_fulltext_p_2023');

\echo 'VACUUM after 2021-2023...'
VACUUM edrsr_fulltext_p_default;

SELECT repartition_year(2024::smallint, 'edrsr_fulltext_p_2024');
SELECT repartition_year(2025::smallint, 'edrsr_fulltext_p_2025');
SELECT repartition_year(2026::smallint, 'edrsr_fulltext_p_2026');

\echo 'Final VACUUM...'
VACUUM edrsr_fulltext_p_default;

\echo 'Remaining in default:'
SELECT COUNT(*) AS remaining FROM edrsr_fulltext_p_default;

\echo '=== Repartitioning complete ==='

DROP FUNCTION repartition_year(smallint, text, int);
