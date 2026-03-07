# Open Data Is Free. Getting It Is Not.

**Everyone loves the idea of open data. Few talk about what it actually takes to collect, download, and process it at scale.**

For the past months, my team has been building [SecondLayer](https://legal.org.ua) — an AI-powered legal research platform for Ukrainian lawyers. Our core need: **comprehensive access to Ukrainian court decisions and court schedules**. Millions of documents. Tens of millions of records.

Ukraine publishes this data openly. It's on government portals. It's CC BY 4.0 licensed. It exists.

Getting it into a usable state is a completely different story.

---

## "Just Download It" — If Only

Ukraine's State Judicial Administration publishes bulk dumps of the Unified State Register of Court Decisions on [data.gov.ua](https://data.gov.ua). The metadata comes in neat TSV files — court codes, case numbers, judges, categories.

But the actual texts? They're **93 million individual RTF files** sitting on a CDN. Each one is a separate HTTP request. Total volume: **2.2 TB**.

There's no "Download All" button. No torrent. No database dump of the texts. Just 93 million URLs and your engineering skills.

---

## The Infrastructure Behind "Free" Data

### Downloading: Days, Not Minutes

Downloading 93 million small files (average 37 KB each) isn't a bandwidth problem — it's a **connections-per-second** problem.

We built a custom Go downloader with:
- **4 parallel shards** across **2 ISPs** (because one provider's peering to Ukrainian CDN servers was 3x slower)
- **700 concurrent workers** with keep-alive TCP connections
- Policy-based routing splitting traffic across two physical network interfaces
- Per-shard error logs and resume state for crash recovery

**Time to download: ~5 days of continuous operation.**

| Year | Files | Size |
|------|-------|------|
| 2025+2026 | 16.4M | 471 GB |
| 2024 | 7.9M | 226 GB |
| 2023 | 7.6M | 210 GB |
| 2022 | 5.7M | 155 GB |
| 2021 | 8.0M | 208 GB |
| 2020 | 6.8M | 163 GB |
| 2019 | 6.6M | 159 GB |
| 2018 | 6.8M | 163 GB |
| 2017 | 7.0M | 126 GB |
| 2016 | 8.4M | 139 GB |
| 2015 | 11.7M | 189 GB |
| **Total** | **~93M** | **~2.2 TB** |

### Storage: Not Your Laptop

- **18 TB HDD** for raw RTF files and PostgreSQL data
- **SSD** for hot indexes and active queries
- PostgreSQL 15 with **trigram GIN indexes** for full-text search across tens of millions of records

### Processing: The Real Work Starts After Download

Having 93 million RTF files on disk is step zero. To make them searchable:

1. **RTF to plaintext conversion** — 93M files, each needs parsing and encoding normalization
2. **Metadata import** — 11 years of TSV dumps into PostgreSQL with deduplication
3. **Full-text indexing** — PostgreSQL tsvector or external search engine across terabytes of Ukrainian legal text
4. **Vector embeddings** — for semantic search, every document section needs an embedding via OpenAI API (cost and rate limits apply)

Conservative estimate for the full pipeline: **weeks of compute time** on dedicated hardware.

---

## When the API Fights Back

For court session schedules — 29.8 million records of who's appearing before which judge — the open data alternative is almost useless: only **~480K records**, a rolling 9-month snapshot with no history.

A commercial API had the full archive. We started pulling at a conservative rate — 5 requests/second, within their documented limits.

After **35,000 requests in 2.7 hours, both our API tokens were permanently blocked.** No warning. No graduated throttling. Our production system — which used the same API for real-time user queries — went down immediately.

The documented rate limit and the actual rate limit were two different numbers.

We pivoted: built our own court sessions database from scratch. PostgreSQL on an 18 TB drive, custom crawlers, data reconciliation across three different government sources that each identify courts differently (numeric code vs. full name vs. national registry ID).

**Current status: 18.5M court session records loaded, gaps being filled from alternative open sources.**

---

## What Nobody Tells You About Open Data

### The hidden costs:

- **Compute**: custom downloaders, format converters, deduplication pipelines
- **Storage**: terabytes of raw data before you even start processing
- **Network**: multi-ISP setups, sharding, resume logic for multi-day downloads
- **Time**: weeks from "data exists" to "data is queryable"
- **Resilience**: APIs get blocked, CDNs rate-limit, downloads fail at 60% and need to resume

### What would make open data truly open:

1. **Publish bulk database dumps**, not just individual file URLs. Let me download a PostgreSQL dump, not make 93 million HTTP requests.
2. **Include history.** A snapshot of today's court schedule is a webpage. Five years of schedules is a dataset.
3. **Be explicit about bulk access policies.** If you'll block tokens after 35K requests, say so upfront.
4. **Standardize identifiers.** The same court shouldn't have three different IDs across three government datasets.
5. **Provide checksums and manifests.** When downloading millions of files, I need to verify completeness without re-downloading everything.

---

## Why Bother?

Ukraine's judiciary produces millions of decisions per year. Each one is a data point that helps a lawyer find precedent, spot patterns, prepare a case. Making this data searchable and AI-analyzable is transformative for legal practice.

But the gap between **"data is technically public"** and **"data is practically usable"** is measured in terabytes of storage, weeks of engineering, and a few blown API tokens.

**Open data is a spectrum.** Publishing it is step one. Making it truly accessible — with bulk exports, stable APIs, and clear policies — is the work that turns a portal into an ecosystem.

We got our 93 million decisions. We're building the index. But every megabyte came with an engineering story attached.

---

*Building AI tools for legal professionals at [SecondLayer](https://legal.org.ua). Making Ukrainian court decisions searchable — one RTF file at a time.*
