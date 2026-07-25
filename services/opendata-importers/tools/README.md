# Diagnostic tools

Read-only probes used to size a gap before writing an importer or a backfill.
Both talk to the source API only; neither writes to a database.

## coverage_scan.py

Per-day comparison of "how many documents the source lists" against "how many
rows we hold", rolled up by month. This is what showed the NL corpus was at 53.9%
of the Rechtspraak feed for 2015-2026 (938,704 of 1,741,852) rather than the
near-complete state the row count suggested.

```bash
ssh prod "docker exec secondlayer-postgres-prod psql -U secondlayer -d secondlayer_prod -tAc \
  \"SELECT to_char(decision_date,'YYYY-MM-DD')||','||count(*) FROM nl_rechtspraak_decisions \
    GROUP BY decision_date ORDER BY decision_date\"" > prod_daily.csv
python3 tools/coverage_scan.py prod_daily.csv 2015-01-01 2026-07-24 coverage_by_day.csv
```

## probe_fields.py

Takes "ecli,bucket" lines and reports, per bucket, which fields the source
actually exposes for those documents. Use it before launching a backfill to find
out whether the data you are missing exists at all: for NL it showed a body is
available for only 1% of text-less rows, while dcterms:subject is available for
96%, which turned a "harvest 549K missing texts" plan into a metadata backfill.

```bash
python3 tools/probe_fields.py < eclis_with_year.csv
```
