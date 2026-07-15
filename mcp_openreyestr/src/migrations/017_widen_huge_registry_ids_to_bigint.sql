-- 017: Widen id to BIGINT on TRUNCATE+INSERT ("huge") registries.
--
-- enforcement_proceedings and debtors are reimported daily via TRUNCATE + plain
-- INSERT. TRUNCATE without RESTART IDENTITY leaves the sequence untouched, so
-- every run permanently burned ~N sequence values for N rows. After ~70 runs
-- enforcement_proceedings_id_seq hit the int4 ceiling (2147483647): TRUNCATE
-- still emptied the table, then every INSERT failed on nextval, leaving 0 rows.
-- debtors_id_seq was at 876869376 (40.8%) and on the same trajectory.
--
-- The importer now issues TRUNCATE ... RESTART IDENTITY, which bounds sequence
-- growth to one run. BIGINT is the backstop so a missed reset degrades to
-- wasted values instead of a silently empty table.

-- enforcement_proceedings
ALTER TABLE enforcement_proceedings ALTER COLUMN id TYPE BIGINT;
ALTER SEQUENCE enforcement_proceedings_id_seq AS BIGINT MAXVALUE 9223372036854775807;

-- debtors
ALTER TABLE debtors ALTER COLUMN id TYPE BIGINT;
ALTER SEQUENCE debtors_id_seq AS BIGINT MAXVALUE 9223372036854775807;

-- Rewind each sequence to just past the highest live id. Not RESTART WITH 1:
-- debtors holds ~10.4M rows with ids up to ~876M, and restarting at 1 would
-- collide on the primary key for any insert before the next truncate.
-- Empty tables rewind to 1.
SELECT setval(
  'enforcement_proceedings_id_seq',
  GREATEST(COALESCE((SELECT max(id) FROM enforcement_proceedings), 0), 1),
  (SELECT count(*) > 0 FROM enforcement_proceedings)
);

SELECT setval(
  'debtors_id_seq',
  GREATEST(COALESCE((SELECT max(id) FROM debtors), 0), 1),
  (SELECT count(*) > 0 FROM debtors)
);
