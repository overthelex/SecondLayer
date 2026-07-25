# me.gov.ua open-data mirror

Mirrors **all open datasets of the Ministry of Economy of Ukraine** (Міністерство
економіки України) published on [data.gov.ua](https://data.gov.ua) into the
**openreyestr** Postgres DB.

- CKAN org: `ministerstvo-ekonomichnoho-rozvytku-i-torhivli-ukrayiny`
  (`c9edbe3d-0a05-4d00-b23b-7c1fe5810ca4`) — **69 datasets**.
- Schema: `mcp_openreyestr/src/migrations/015_me_gov_datasets_mirror.sql`
  (`me_datasets` → `me_resources` → `me_records`).

## Design

The 69 datasets are heterogeneous (IP registers, agri registers, financials,
quotas, trade data, …), so we use a **generic 3-table CKAN mirror** rather than
69 bespoke schemas:

| Table | One row per | Notes |
|-------|-------------|-------|
| `me_datasets`  | CKAN package | metadata + full `raw` JSONB for provenance |
| `me_resources` | file inside a dataset | `local_path`, `sha256`, `import_status`, `row_count` |
| `me_records`   | row of a tabular resource | `data JSONB` (GIN indexed) |

Non-tabular resources (PDF/DOC/ZIP/…) are mirrored as files on disk and marked
`skipped` (no rows). Tabular formats (CSV/TSV/XLSX/XLS/JSON/XML) are parsed into
`me_records`.

## Pipeline stages

```
discover  CKAN package_search  -> upsert me_datasets + me_resources
download  fetch resource files -> STAGING_DIR, sha256, status='downloaded'
import    parse tabular files  -> me_records, status='imported'
                                  non-tabular -> status='skipped'
verify    counts + reconciliation report (resource gap, error states)
all       discover -> download -> import -> verify
```

Every stage is **idempotent and resumable** (upserts + status columns; already
downloaded files are skipped by sha/size).

## Usage

```bash
pip install -r requirements.txt

# LOCAL DB (default localhost:5435/openreyestr)
python3 me_datagov_pipeline.py all
python3 me_datagov_pipeline.py discover           # metadata only
python3 me_datagov_pipeline.py download --limit 50
python3 me_datagov_pipeline.py import --reimport
python3 me_datagov_pipeline.py verify
```

### Against prod (openreyestr_prod, WG tunnel)

Prod Postgres are loopback-only, reached over the WG SSH tunnel
(`openreyestr-postgres-prod` → `127.0.0.1:5440`). Per the local→prod data-proxy
pattern, download/convert locally, then point `import`/`verify` at prod:

```bash
POSTGRES_HOST=127.0.0.1 POSTGRES_PORT=5440 POSTGRES_DB=openreyestr_prod \
POSTGRES_USER=openreyestr POSTGRES_PASSWORD="$OPENREYESTR_POSTGRES_PASSWORD" \
python3 me_datagov_pipeline.py all
```

## Migration

Applied by the standard openreyestr runner (auto-discovers `*.sql`, tracked in
`schema_migrations`):

```bash
cd mcp_openreyestr && npm run migrate            # local
# prod: run the same migrate against openreyestr_prod (5440) over the WG tunnel,
#       or apply 015_me_gov_datasets_mirror.sql via psql.
```

## Env

| Var | Default | Meaning |
|-----|---------|---------|
| `POSTGRES_HOST` | `localhost` | openreyestr DB host |
| `POSTGRES_PORT` | `5435` | 5435 local / 5440 prod |
| `POSTGRES_DB`   | `openreyestr` | `openreyestr_prod` on prod |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` | `openreyestr` / … | creds |
| `DATABASE_URL`  | — | overrides the discrete vars if set |
| `ME_STAGING_DIR`| `/data/opendata/me_gov_ua` (or `./staging`) | file staging |
| `ME_MAX_ROWS`   | `500000` | per-resource row cap (safety) |
