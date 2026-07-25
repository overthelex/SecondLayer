# Opendata Importers

Multi-IP, parallel downloaders for jurisdiction-specific open data sources. Each
importer runs as its own Docker service, auto-discovers available host IPs, and
streams results into the production PostgreSQL via SSH + `psql COPY`.

## Architecture

```
shared/
├── ip_pool.py        Auto-discover public IPv4 from `ip addr show` (or SOURCE_IPS env)
├── http_client.py    aiohttp ClientSession per IP, round-robin scheduling
├── prod_writer.py    Bulk COPY into prod via `ssh prod docker exec ... psql`
├── checkpoint.py     JSON state file for resume-after-crash
└── base.py           BaseImporter ABC + run loop + signal handling

importers/
├── nl_rechtspraak.py     ✅ working — incremental top-up of nl_rechtspraak_decisions
├── nl_dnb.py             ⚠️  stub (Akamai-protected SPA → needs Playwright)
├── nl_afm.py             ⚠️  stub (SPA)
├── nl_insolvency.py      ⚠️  see nl_rechtspraak.py — no separate insolvency feed
├── ie_central_bank.py    ⚠️  stub (ASP.NET __doPostBack)
├── ch_finma.py           ⚠️  stub (per-category SPAs)
└── eu_echr.py            ⚠️  stub (HUDOC API behind Cloudflare)
```

## Running

```bash
cd services/opendata-importers
docker compose -f docker-compose.opendata.yml up -d
docker compose -f docker-compose.opendata.yml logs -f nl_rechtspraak
```

The compose uses `network_mode: host` so importers see every IP bound to the
host's interfaces. Each container runs `WORKERS_PER_IP` (default 8) async tasks
per IP — total concurrency = N × workers.

## Env vars

| Var                  | Default                           | Notes                                          |
|----------------------|-----------------------------------|------------------------------------------------|
| `PROD_SSH_HOST`      | `prod`                            | SSH alias from `~/.ssh/config`                 |
| `PG_CONTAINER`       | `secondlayer-postgres-prod`       |                                                |
| `PG_USER`            | `secondlayer`                     |                                                |
| `PG_DB`              | `secondlayer_prod`                |                                                |
| `WORKERS_PER_IP`     | `8`                               | Tune higher for cooperative APIs               |
| `SLEEP_BETWEEN_RUNS` | `3600`                            | Seconds between repeated runs (incremental)    |
| `RUN_ONCE`           | `0`                               | Set `1` for single execution then exit         |
| `SOURCE_IPS`         | (auto)                            | Override discovery: `1.2.3.4,5.6.7.8`          |
| `WALK_DAYS`          | `30`                              | nl_rechtspraak: how many days forward to walk  |
| `LOG_LEVEL`          | `INFO`                            |                                                |

## Adding a new importer

1. Create `importers/<name>.py` extending `BaseImporter`
2. Implement `async def import_dataset(self, pool: MultiIPSessionPool)`
3. Call `self.write_batch(rows)` for chunks of `~500 rows`
4. Add a service entry to `docker-compose.opendata.yml`
5. Done — same lifecycle, logging, checkpointing, prod-write apply

## Why are 5 of 6 stubs?

Discovery on 2026-04-17 showed that the target sites (DNB, AFM, IE CB, FINMA,
HUDOC) are JS-rendered SPAs without public bulk-download endpoints. Curl-style
scrapers cannot work — they need Playwright with XHR interception. That stack
adds ~1.5 GB to the image and is non-trivial per source, so it lives in a
follow-up PR. The stubs document the discovery so the next iteration starts
with context, and they exit cleanly so `docker compose up` doesn't crashloop.

## Why use SSH + COPY instead of asyncpg directly?

Prod Postgres (`secondlayer-postgres-prod`) is bound to localhost on the prod
VM with no public listener. SSH + `docker exec psql -c "COPY ... FROM STDIN"`
gets the full COPY-protocol throughput without needing to expose the DB port or
manage an asyncpg pool from a different host. ~50K rows/s in practice.
