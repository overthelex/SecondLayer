#!/usr/bin/env bash
# Step 1b (load) + step 5 (indexes).
#
# Order matters: COPY first into index-free tables, build indexes once at the end. Maintaining
# indexes through a bulk insert costs far more than a single CREATE INDEX afterwards.
set -euo pipefail
L=/data/rada_npa/load
P="docker exec -i secondlayer-postgres-prod psql -v ON_ERROR_STOP=1 -U secondlayer -d secondlayer_prod"
Q="docker exec secondlayer-postgres-prod psql -v ON_ERROR_STOP=1 -U secondlayer -d secondlayer_prod"

echo "=== COPY texts ($(du -h $L/text.csv | cut -f1)) ==="
$P -c "truncate npa.edition_text;"
time $P -c "\copy npa.edition_text(nreg,ed_date,is_current,body) from stdin with (format csv)" < $L/text.csv

echo "=== COPY articles ($(du -h $L/article.csv | cut -f1)) ==="
$P -c "truncate npa.article;"
time $P -c "\copy npa.article(nreg,ed_date,art_no,art_ord,title,body) from stdin with (format csv)" < $L/article.csv

echo "=== referential integrity: text and articles must point at a real 200 edition ==="
$Q -c "select
  (select count(*) from npa.edition_text) texts,
  (select count(*) from npa.article) articles,
  (select count(*) from npa.edition_text t
     left join npa.edition e using (nreg, ed_date) where e.nreg is null) text_without_edition,
  (select count(*) from npa.edition_text t
     join npa.edition e using (nreg, ed_date) where e.http_status <> 200) text_on_unusable_edition,
  (select count(*) from npa.article a
     left join npa.edition_text t using (nreg, ed_date) where t.nreg is null) article_without_text;"

echo "=== mark which acts carry an article layer ==="
$Q -c "update npa.act a set has_articles = true
       where exists (select 1 from npa.article r where r.nreg = a.nreg);"
$Q -c "select count(*) acts_with_articles,
              (select count(distinct (nreg, ed_date)) from npa.article) editions_with_articles
       from npa.act where has_articles;"

echo "=== sizes before indexes ==="
$Q -c "select relname, pg_size_pretty(pg_total_relation_size(c.oid)) sz, c.reltuples::bigint rows
       from pg_class c join pg_namespace n on n.oid=c.relnamespace
       where n.nspname='npa' and c.relkind='r' order by pg_total_relation_size(c.oid) desc;"

echo "=== foreign keys (added after load: validating them per-row during COPY is wasteful) ==="
$Q -c "alter table npa.edition add constraint edition_act_fk
         foreign key (nreg) references npa.act(nreg) on delete cascade;"
$Q -c "alter table npa.edition_text add constraint text_edition_fk
         foreign key (nreg, ed_date) references npa.edition(nreg, ed_date) on delete cascade;"
$Q -c "alter table npa.article add constraint article_text_fk
         foreign key (nreg, ed_date) references npa.edition_text(nreg, ed_date) on delete cascade;"

echo "=== indexes: cheap btrees first, GIN last ==="
# The temporal core: "text of act X in force on date D". The partial clause keeps 68 466
# unusable editions out of the index entirely.
$Q -c "create index concurrently if not exists edition_temporal
       on npa.edition (nreg, ed_date desc) where http_status = 200;"
$Q -c "create index concurrently if not exists edition_current
       on npa.edition (nreg) where is_current and http_status = 200;"
$Q -c "create index concurrently if not exists article_temporal
       on npa.article (nreg, art_no, ed_date desc);"
$Q -c "create index concurrently if not exists act_status on npa.act (status_code) where status_code is not null;"
$Q -c "create index concurrently if not exists act_articles on npa.act (nreg) where has_articles;"
$Q -c "create index concurrently if not exists act_title_trgm on npa.act using gin (title gin_trgm_ops);"

echo "=== full text: current editions only ==="
# Indexing all 338k would bury a search under a dozen near-identical historical versions of the
# same act. GIN builds single-threaded, so this is the long pole - give it room.
# maintenance_work_mem goes through PGOPTIONS, not a leading SET: psql wraps several statements
# in one -c into a single implicit transaction, and CREATE INDEX CONCURRENTLY refuses to run in
# a transaction block.
docker exec -e PGOPTIONS='-c maintenance_work_mem=3GB' secondlayer-postgres-prod \
  psql -v ON_ERROR_STOP=1 -U secondlayer -d secondlayer_prod \
  -c "create index concurrently if not exists edition_text_fts
      on npa.edition_text using gin (to_tsvector('simple', body)) where is_current;"

echo "=== ANALYZE (a fresh 400k table with no stats gets seq-scanned) ==="
$Q -c "analyze npa.act; analyze npa.edition; analyze npa.edition_text; analyze npa.article;"

echo "=== final sizes ==="
$Q -c "select relname, pg_size_pretty(pg_total_relation_size(c.oid)) sz, c.reltuples::bigint rows
       from pg_class c join pg_namespace n on n.oid=c.relnamespace
       where n.nspname='npa' and c.relkind='r' order by pg_total_relation_size(c.oid) desc;"
$Q -c "select indexrelname, pg_size_pretty(pg_relation_size(indexrelid)) sz
       from pg_stat_user_indexes where schemaname='npa' order by pg_relation_size(indexrelid) desc;"
