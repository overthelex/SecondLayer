# SneakyPiper: 16.7M Entities, 31K Dark-Web Subjects, 30+ OSINT Sources in Production

*SneakyPiper.com is our second product after LEX AI. It's an AI-powered due diligence and OSINT platform for US businesses: sanctions, corporate intelligence, dark-web monitoring, corporate registries, threat intel. Here's exactly what lives in the production database and how it works.*

---

## What SneakyPiper Is

When a US business enters a new deal — a partnership, an investment, a contractor hire, an acquisition — a standard checklist comes up: is the company on a sanctions list, is the owner bankrupt, have its domains or IPs appeared in breach databases, are its executives in INTERPOL Red Notices. Large corporations handle this via specialized compliance teams, paying LexisNexis, Dun & Bradstreet, Thomson Reuters tens of thousands of dollars a year.

SneakyPiper does the same thing for SMBs at a fraction of the cost — automated through open-data aggregation and AI analysis. The platform is built on four layers:

1. **Live OSINT queries to 30+ external services** — OpenSanctions, INTERPOL, HIBP, Dehashed, IntelX, AbuseIPDB, VirusTotal, Companies House, LeakCheck, and more
2. **Our own aggregated sanctions / PEP / crime base** — yente (a local OpenSanctions instance) with the full catalog
3. **Our own dark-web collector** — live monitoring of tor forums, ransomware sites, paste services, GitHub leak detection
4. **Orchestration layer** — request classification, caching, AI briefings via LEX AI integration

All wrapped in a FastAPI backend (Python 3.11) + React/Vite frontend. Deployed on AWS EC2 in Frankfurt.

---

## What's Actually in the Production Database (Today's Snapshot)

### Layer 1: OpenSanctions via Yente (Local Instance)

Yente is the official self-hostable OpenSanctions API. We run a local instance and sync it daily. As of today:

- **344 separate datasets** (sanctions lists, PEP registries, crime, debarment, securities)
- **16,708,788 entities** across all datasets

Top 20 datasets by size:

| # | Dataset | Entities |
|---|---------|----------|
| 1 | default (all merged) | 4,146,759 |
| 2 | peps (Politically Exposed Persons) | 1,791,470 |
| 3 | enrichers | 1,341,668 |
| 4 | wd_categories (Wikidata) | 656,644 |
| 5 | ext_ru_egrul (Russian Unified State Register) | 593,892 |
| 6 | debarment (World Bank, US SAM etc.) | 579,305 |
| 7 | wd_peps (Wikidata PEPs) | 574,984 |
| 8 | crime (criminal records, wanted) | 510,744 |
| 9 | ann_pep_positions | 502,929 |
| 10 | securities | 501,862 |
| 11 | regulatory | 385,412 |
| 12 | wikidata | 360,730 |
| 13 | ext_gleif (LEI Reference Data) | 330,791 |
| 14 | sanctions (consolidated) | 278,647 |
| 15 | us_sam_exclusions | 267,806 |
| 16 | maritime | 264,941 |
| 17 | br_pep (Brazilian PEPs) | 253,827 |
| 18 | ext_gb_fca_firds (UK Financial Instruments) | 215,197 |
| 19 | ext_eu_esma_firds (EU Financial Instruments) | 214,946 |
| 20 | special_interest | 174,829 |

Other notable sources: US OFAC SDN (69,526), US Sanctions (86,910), Ukrainian NSDC Sanctions (60,741), Singapore gov directors (55,144), Polish wanted (53,631), EU Sanctions (38,089), Iranian UANI entities, Israeli MOD terrorists list, Monaco fund freezes, French treasury asset freezes.

**Why a local instance matters:** the public OpenSanctions API is rate-limited to 100 req/sec per key and carries 200–400ms latency. Our own instance is sub-50ms with no limits, plus full-text search with fuzzy matching.

### Layer 2: Dark-Web Intelligence Collector

A separate microservice that pulls from tor forums, ransomware sites, github repositories, paste services. All traffic goes through a Tor SOCKS proxy (for deep-web sources) and a residential proxy pool (for INTERPOL and some sanctions sites that block datacenter IPs).

**As of today:**

- **31,035 forum subjects** — posts from tor forums, each AI-classified by category and risk
- **16,391 ransomware victims** — victims of public ransomware groups (LockBit, Cl0p, BlackCat, Rhysida, etc.)
- **594 GitHub leaks** — public commits with credentials (API keys, DB passwords, private keys) detected by our scanner

**Classification of forum subjects:**

- **By risk:** critical — 5,825, high — 10,200, medium — 5,304, low — 9,706
- **By category:** ransomware — 4,271, data_leak — 3,763, carding — 3,534, fraud — 2,571, credentials — 2,329, malware — 2,143, services — 1,835, exploit — 1,352, access_sale — 108, drugs/weapons — 13

**Dark-web sources we monitor:**

BFD Forum (5,445 posts), Darknet Army (4,662), LockBit 3.0 mirror (3,478), Breach Forums dark (2,193), Orion (1,858), Dark Forums (1,384), Rehub (289), Spear (166), Dragon Force (47), Nitrogen (43), Insomnia (26), Krybit (25+), Genesis (18), RansomEXX (11), DaiXin (21), Rhysida (5), Brain Cipher (9), Scattered Spider, SafePay, FunkSec, Medusa, Anubis — and so on. Most via offline mirrors, because the onion sites themselves frequently go down.

**Active crawlers (updating in real time):**

- `forum_monitor` — tor forum scraping (every 3–5 min)
- `forum_classifier` — AI classification of new topics by category and risk
- `forum_body_fetcher` — pulling full thread text
- `ransomlook` — aggregating public ransomware leak-site listings
- `github_leaks` — scanning public GitHub repositories for leaked secrets
- `paste_monitor` — pastebin / privatebin / justpaste.it monitoring
- `darksearch` — Tor search engine
- `ahmia` — Tor search engine (clearnet mirror)

Sample of the latest run (17 April 2026, 14:44 UTC):

```
forum_classifier   → ok, 7 records added
forum_body_fetcher → ok, 4 records added
forum_monitor      → ok, 1,229 records added
github_leaks       → ok, 240 records added
ransomlook         → ok, 141 records added
```

That's just in the last 30 minutes.

### Layer 3: Live Adapters to External Services

15 adapters in `backend/app/adapters/`:

- **opensanctions.py** — queries to our local yente
- **hibp.py** — Have I Been Pwned (breach checks by email/domain)
- **dehashed.py** — Dehashed API (commercial breach DB)
- **leakcheck.py** — LeakCheck API (credential checks)
- **pwndb.py** — pwndb (legacy breach DB)
- **intelx.py** — IntelX (deep-web search engine)
- **companies_house.py** — UK Companies House (corporate registry, 600 req/5min free tier)
- **interpol_worldbank.py** — INTERPOL Red Notices + World Bank Debarment List (via residential relay)
- **ip_reputation.py** — AbuseIPDB + VirusTotal + GreyNoise (IP threat score)
- **domain_reputation.py** — domain reputation and GSB lookups
- **threat_intel.py** — NVD (CVE database) + CISA KEV + EPSS (exploit prediction)
- **socmint.py** — social media intelligence (GDELT, crt.sh and more)
- **corporate.py** — aggregated corporate lookup (US EDGAR, OpenCorporates mirrors)
- **local_index.py** — calls to our dark-web collector
- **secondlayer.py** — LEX AI integration for legal context

### Layer 4: Orchestration and Cache

- **Request cache** — local SQLite (`/var/lib/sneakypiper/cache.db`), TTL 72 hours. 304 KB at snapshot time (starting volume after 24 hours of live traffic)
- **Orchestrator** — accepts a "check company X" request, decides which adapters to invoke (by data type: email → breach DBs, IP → reputation stack, company name → sanctions + corporate), runs them in parallel, aggregates, and sends through an AI summarizer (Claude via LEX AI proxy)
- **Severity scoring** — our own algorithm that assigns an overall risk score (low/medium/high/critical) based on weighted signals across sources

---

## How This Lives in Production

### Infrastructure

- **EC2 instance:** `i-05da283e047167978`, t3.small, eu-central-1b (Frankfurt, Germany)
- **IP:** 18.185.127.10
- **OS:** Ubuntu, Docker Compose with host networking
- **Frontend:** static files in `/var/www/sneakypiper/`, served by nginx
- **Backend:** one FastAPI container (`sneakypiper-backend-1`), port 8001
- **SSL:** Let's Encrypt via certbot
- **Network:** WireGuard tunnel to the collector host (10.77.0.0/24) — yente and the dark-web collector run there, on a separate server with a residential proxy chain

### Deploy pipeline

Self-hosted GitHub Actions runner, 4-step CI/CD:

1. **Lint frontend** — `tsc -b`
2. **Build & push backend** — Docker image → GHCR (`ghcr.io/overthelex/sneakypiper-backend`)
3. **Build frontend** — Vite production bundle
4. **Deploy** — `scp` frontend + pull latest image on EC2, `docker compose up -d`

Plus a health check after deploy: frontend response + `/api/v1/health` on backend. If anything fails — CI fails.

Release tag is auto-generated by date: `2026.04.17`, `2026.04.17-1`, and so on.

### What Doesn't Live on This EC2

- **Yente (OpenSanctions):** a separate host over WireGuard — 100+ GB of data there
- **Dark-web collector:** a separate host — it needs Tor and a residential proxy chain
- **LEX AI:** a separate monorepo and infra (legal.org.ua)

That's the right trade-off: compute-heavy stuff lives where it's convenient, the presentation layer is close to users in Frankfurt.

---

## Licensing and Copyright

All the data we collect and display is **open public sources**. No adapter scrapes paid content, none bypasses paywalls, and none lies to the user-agent about being a bot. We do what any compliance officer at a bank does manually — just faster and with better aggregation.

OpenSanctions — CC-BY 4.0. INTERPOL Red Notices — public. World Bank Debarment — public. NVD/CISA — public domain. Forum posts — public on the tor network; we don't log in and don't bypass reg-walls.

Our value isn't "secret data" — it's **aggregation, speed, classification, and evidence-based scoring**.

---

## Why This Is Interesting for Open-Source Contributors

SneakyPiper is part of our open ecosystem. Although it has its own repository (not inside `overthelex/secondlayer`), the patterns are the same:

- Adapter pattern for dozens of external APIs
- Aggregation layer with severity scoring
- Dark-web data engineering (rate limiting, proxy rotation, resume logic)
- Real-time intelligence pipelines

If you're interested in writing new adapters (regulatory registries, national sanctions lists, sector-specific intel), adding new dark-web sources, or building scoring algorithms — write us. We can discuss joining SneakyPiper directly or via related work in LEX AI (some adapters are shared).

---

**Site:** https://sneakypiper.com
**Product:** AI-powered due diligence for US businesses
**Contact for partnership / contribution:** vladimir@legal.org.ua

---

*Coming next: a founder conversation — why a Kyiv-based company builds OSINT for the US market, and how we ended up with a "30+ adapters + yente + dark-web collector" architecture.*
