#!/usr/bin/env bash
set -euo pipefail
PSQL="docker exec -i secondlayer-postgres-prod psql -U secondlayer -d rada_npa"

$PSQL -c "drop table if exists audit_raw;
create table audit_raw(
  nreg text, ed_date text, status int, char_len int, text_hash text,
  src text, declared text, arts int, flags text);"
$PSQL -c "\copy audit_raw from stdin with (format csv, delimiter E'\t', quote E'\b')" < /data/rada_npa/audit.tsv

# One row per edition. A pair fetched twice keeps the best outcome, and among equal statuses the
# longest text - a truncated retry must never overwrite a complete fetch.
$PSQL -c "drop table if exists audit;
create table audit as
  select distinct on (nreg, ed_date) *
  from audit_raw
  order by nreg, ed_date, status asc, char_len desc;
alter table audit add primary key (nreg, ed_date);"

echo '=== 1. duplicates in the shards ==='
$PSQL -c "select count(*) raw_rows, (select count(*) from audit) unique_pairs,
                 count(*) - (select count(*) from audit) duplicate_lines from audit_raw;"

echo '=== 2. status distribution ==='
$PSQL -c "select status, count(*), round(100.0*count(*)/sum(count(*)) over (),2) pct
          from audit group by status order by count(*) desc;"

echo '=== 3. coverage against the metadata (both directions) ==='
$PSQL -c "select
  (select count(*) from rada_editions) editions_in_metadata,
  (select count(*) from rada_editions e join audit a using (nreg, ed_date)) matched,
  (select count(*) from rada_editions e left join audit a using (nreg, ed_date) where a.nreg is null) never_fetched,
  (select count(*) from audit a left join rada_editions e using (nreg, ed_date) where e.nreg is null) orphan_fetched;"

echo '=== 4. did Rada serve the edition we asked for? ==='
$PSQL -c "select
  count(*) filter (where status=200) texts,
  count(*) filter (where status=200 and declared <> '') with_declared_date,
  count(*) filter (where status=200 and declared <> '' and declared = ed_date) date_matches,
  count(*) filter (where status=200 and declared <> '' and declared <> ed_date) date_MISMATCH,
  count(*) filter (where status=200 and declared = '') no_declared_date
from audit;"

echo '=== 5. suspicious 200s ==='
$PSQL -c "select flags, count(*) from audit where status=200 and flags <> '-' group by flags order by count(*) desc limit 10;"

echo '=== 6. text length distribution (200s) ==='
$PSQL -c "select min(char_len), percentile_disc(0.10) within group (order by char_len) p10,
       percentile_disc(0.50) within group (order by char_len) p50,
       percentile_disc(0.90) within group (order by char_len) p90,
       percentile_disc(0.99) within group (order by char_len) p99,
       max(char_len), pg_size_pretty(sum(char_len)::bigint) total_chars
from audit where status=200;"

echo '=== 7. article structure: can these acts be split into articles? ==='
$PSQL -c "select case when arts = 0 then '0 (no article layer)'
                      when arts between 1 and 9 then '1-9'
                      when arts between 10 and 49 then '10-49'
                      when arts between 50 and 199 then '50-199'
                      else '200+' end bucket,
       count(*), round(100.0*count(*)/sum(count(*)) over (),1) pct
from audit where status=200 group by 1 order by min(arts);"

echo '=== 8. dedup potential: identical text across editions ==='
$PSQL -c "select count(*) texts, count(distinct text_hash) distinct_texts,
       round(100.0*(count(*)-count(distinct text_hash))/count(*),1) pct_redundant
from audit where status=200;"

echo '=== 8b. dedup WITHIN an act (consecutive editions with identical text) ==='
$PSQL -c "select count(*) total_200, count(*) filter (where dup) same_as_another_edition_of_same_act
from (select nreg, text_hash,
             count(*) over (partition by nreg, text_hash) > 1 dup
      from audit where status=200) t;"

echo '=== 9. Track C: per-act edition chain completeness ==='
$PSQL -c "
with per_act as (
  select e.nreg, count(*) eds,
         count(*) filter (where a.status = 200) ok,
         count(*) filter (where a.status = 404) gone,
         count(*) filter (where a.status is null) unfetched
  from rada_editions e left join audit a using (nreg, ed_date)
  group by e.nreg)
select count(*) acts_with_editions,
       count(*) filter (where ok = eds) full_chain,
       count(*) filter (where ok > 0 and ok < eds) partial,
       count(*) filter (where ok = 0) no_text,
       count(*) filter (where unfetched > 0) still_unfetched
from per_act;"

echo '=== 10. acts with text vs the master list ==='
$PSQL -c "select (select count(*) from rada_docs_master) acts_total,
                 (select count(distinct nreg) from rada_editions) acts_with_edition_rows,
                 (select count(distinct nreg) from audit where status=200) acts_with_at_least_one_text;"
