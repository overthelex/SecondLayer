#!/usr/bin/env bash
# Step 1a: metadata into npa.act / npa.edition.
# Source of truth is the rada_npa working DB (harvest metadata) joined with the audit table
# (per-edition fetch outcome). Both live in the same instance but different databases, so this
# goes out through TSV rather than a cross-database join.
set -euo pipefail
C="docker exec -i secondlayer-postgres-prod psql -v ON_ERROR_STOP=1 -U secondlayer"
W="$C -d rada_npa"
P="$C -d secondlayer_prod"

echo "=== date sanity: to_date must round-trip, or Feb 30 silently becomes Mar 2 ==="
$W -c "select count(*) rolled_dates from rada_editions
       where to_char(to_date(ed_date,'YYYYMMDD'),'YYYYMMDD') <> ed_date;"

echo "=== export editions ==="
# 900/901 are our own verdicts: an empty body or an error page served as HTTP 200 must not
# count as a usable text anywhere downstream.
$W -c "\copy (
  select e.nreg,
         to_date(e.ed_date,'YYYYMMDD'),
         e.podid,
         e.is_current,
         case when a.status = 200 and coalesce(a.char_len,0) = 0 then 900
              when a.status = 200 and a.flags like '%errorish%'  then 901
              else a.status end,
         a.char_len,
         a.text_hash,
         nullif(a.src,''),
         case when a.declared ~ '^[0-9]{8}\$' then to_date(a.declared,'YYYYMMDD') end
  from rada_editions e
  join audit a on a.nreg = e.nreg and a.ed_date = e.ed_date
) to '/tmp/npa_edition.tsv' with (format csv, delimiter E'\t', null '')"

echo "=== export acts ==="
$W -c "\copy (
  select m.nreg, m.dokid, m.nazva, m.status, m.types_raw
  from rada_docs_master m
) to '/tmp/npa_act.tsv' with (format csv, delimiter E'\t', null '')"

# inside the container: \copy writes on the CLIENT side, which is psql in the container
docker exec secondlayer-postgres-prod wc -l /tmp/npa_act.tsv /tmp/npa_edition.tsv

echo "=== load ==="
$P -c "truncate npa.edition, npa.act;"
$P -c "\copy npa.act(nreg,dok_id,title,status_code,types_raw) from '/tmp/npa_act.tsv' with (format csv, delimiter E'\t', null '')"
$P -c "\copy npa.edition(nreg,ed_date,podid,is_current,http_status,char_len,text_hash,source,declared_date) from '/tmp/npa_edition.tsv' with (format csv, delimiter E'\t', null '')"

echo "=== roll up per-act counters ==="
$P -c "
update npa.act a set
  editions_cnt = s.eds,
  texts_cnt    = s.texts,
  first_ed     = s.first_ed,
  last_ed      = s.last_ed
from (select nreg, count(*) eds,
             count(*) filter (where http_status = 200) texts,
             min(ed_date) first_ed, max(ed_date) last_ed
      from npa.edition group by nreg) s
where s.nreg = a.nreg;"

echo "=== verify ==="
$P -c "select
  (select count(*) from npa.act) acts,
  (select count(*) from npa.edition) editions,
  (select count(*) from npa.edition where http_status = 200) usable_texts,
  (select count(*) from npa.edition where http_status = 404) gone,
  (select count(*) from npa.edition where http_status = 900) empty_body,
  (select count(*) from npa.edition where http_status = 901) error_page,
  (select count(*) from npa.edition where date_verified) date_verified,
  (select count(*) from npa.edition where declared_date is not null and not date_verified) date_mismatch;"

echo "=== orphan check: every edition must belong to a known act ==="
$P -c "select count(*) editions_without_act from npa.edition e
       left join npa.act a using (nreg) where a.nreg is null;"
