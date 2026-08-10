#!/usr/bin/env bash
# Merge the re-harvested slash-act editions, then rebuild the article layer.
set -euo pipefail
F=/data/rada_npa/fix
P="docker exec -i secondlayer-postgres-prod psql -v ON_ERROR_STOP=1 -U secondlayer -d secondlayer_prod"
Q="docker exec secondlayer-postgres-prod psql -v ON_ERROR_STOP=1 -U secondlayer -d secondlayer_prod"

echo "=== extract from the fix shards ==="
python3 ~/rada_npa/merge_fix.py $F/meta.tsv $F/text.csv /data/rada_npa/load/current.tsv

echo "=== update npa.edition in place ==="
$P -c "drop table if exists npa._fix_meta;
       create table npa._fix_meta(nreg text, ed_date date, http_status smallint, char_len int,
                                  text_hash text, source text, declared_date date);"
$P -c "\copy npa._fix_meta from stdin with (format csv, delimiter E'\t', null '')" < $F/meta.tsv
$Q -c "update npa.edition e set
         http_status = f.http_status, char_len = f.char_len, text_hash = f.text_hash,
         source = f.source, declared_date = f.declared_date
       from npa._fix_meta f
       where e.nreg = f.nreg and e.ed_date = f.ed_date;"

echo "=== insert the recovered texts ==="
# ON CONFLICT rather than a plain insert: a rerun of this script must be harmless.
$P -c "drop table if exists npa._fix_text;
       create table npa._fix_text(nreg text, ed_date date, is_current bool, body text);"
$P -c "\copy npa._fix_text from stdin with (format csv)" < $F/text.csv
$Q -c "insert into npa.edition_text (nreg, ed_date, is_current, body)
       select nreg, ed_date, is_current, body from npa._fix_text
       on conflict (nreg, ed_date) do update
         set body = excluded.body, is_current = excluded.is_current;"
$Q -c "drop table npa._fix_meta; drop table npa._fix_text;"

echo "=== coverage after the fix ==="
$Q -c "select nreg like '%/%' as has_slash, count(*) editions,
              count(*) filter (where http_status = 200) texts,
              round(100.0*count(*) filter (where http_status = 200)/count(*),1) pct
       from npa.edition group by 1 order by 1;"
$Q -c "select http_status, count(*) from npa.edition group by 1 order by 2 desc;"

echo "=== rebuild the article layer with the corrected detector ==="
$Q -c "truncate npa.article;"
docker exec secondlayer-postgres-prod psql -U secondlayer -d secondlayer_prod \
  -c "\copy (select nreg, ed_date, body from npa.edition_text) to stdout with (format csv)" \
  | python3 ~/rada_npa/rebuild_articles.py > $F/article.csv
$P -c "\copy npa.article(nreg,ed_date,art_no,art_ord,title,body) from stdin with (format csv)" < $F/article.csv

echo "=== refresh derived flags and counters ==="
$Q -c "update npa.act a set has_articles = exists (select 1 from npa.article r where r.nreg = a.nreg);"
$Q -c "update npa.act a set editions_cnt = s.eds, texts_cnt = s.texts,
              first_ed = s.first_ed, last_ed = s.last_ed
       from (select nreg, count(*) eds, count(*) filter (where http_status = 200) texts,
                    min(ed_date) first_ed, max(ed_date) last_ed
             from npa.edition group by nreg) s
       where s.nreg = a.nreg;"
$Q -c "analyze npa.edition; analyze npa.edition_text; analyze npa.article; analyze npa.act;"

echo "=== final state ==="
$Q -c "select
  (select count(*) from npa.act) acts,
  (select count(*) from npa.act where texts_cnt > 0) acts_with_text,
  (select count(*) from npa.edition) editions,
  (select count(*) from npa.edition where http_status = 200) texts,
  (select count(*) from npa.article) articles,
  (select count(*) from npa.act where has_articles) structured_acts;"
$Q -c "select relname, pg_size_pretty(pg_total_relation_size(c.oid)) sz, c.reltuples::bigint rows
       from pg_class c join pg_namespace n on n.oid=c.relnamespace
       where n.nspname='npa' and c.relkind='r' order by pg_total_relation_size(c.oid) desc;"

echo "=== Track C after the fix ==="
$Q -c "
with per_act as (
  select nreg, count(*) eds, count(*) filter (where http_status = 200) ok
  from npa.edition group by nreg)
select count(*) acts_with_editions,
       count(*) filter (where ok = eds) full_chain,
       count(*) filter (where ok > 0 and ok < eds) partial,
       count(*) filter (where ok = 0) no_text
from per_act;"
