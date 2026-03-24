# LEX Seeks Partners: AI Legal Intelligence for 11 European Markets

## We're Looking for You

LEX is a **Ukrainian-built AI legal platform** that has ingested and structured **400M+ legal records** in 3 weeks — court decisions, legislation, company registries, judicial data. Now we're expanding to **11 European countries** and looking for **local partners** to bring LEX to each market.

If you're a **law firm, legal tech company, data provider, or legal professional** in the UK, France, Germany, Netherlands, Spain, Italy, Denmark, Finland, Sweden, Switzerland, or Estonia — we want to talk.

---

## What is LEX?

LEX is an AI-powered legal intelligence platform that combines **structured open data** with **large language models** to give legal professionals instant answers across jurisdictions.

### Killer Features

**AI Legal Chat** — Ask questions in natural language, get answers grounded in real legal data. Not hallucinations — every claim is backed by a source document with a direct link. The AI cites specific court decisions, legislation articles, and registry records.

**Semantic Search Across 110M+ Court Decisions** — Find relevant case law not by keywords, but by meaning. Search "employer fired pregnant employee" and find all relevant decisions even if they use different terminology. Vector embeddings + full-text search combined.

**Real-Time Due Diligence** — Enter a company name and get a complete profile in seconds: registry data, beneficial owners, enforcement proceedings, court cases, sanctions screening, tax debt, insolvency history — all cross-referenced automatically.

**Judge Analytics** — Before you file, know your judge: case volume, specialization, overturn rate, average decision time, efficiency score. Based on real statistical data from judicial qualification commissions.

**Legislation Intelligence** — Full text of every law, structured by articles and sections. Ask "what changed in tax law this month" and get a precise diff. Track amendments across related laws automatically.

**Court Session Monitoring** — 30.5M scheduled hearings. Track any case, party, or judge. Get alerts when new sessions are scheduled for cases you follow.

**Document Vault** — Upload contracts, court filings, correspondence. AI analyzes, classifies, and cross-references with the legal database. Find which law applies to your document, which court decisions are relevant.

**MCP Protocol (Model Context Protocol)** — Every data source is an AI-callable tool. Any LLM (Claude, GPT-4, Gemini) can use LEX data. 45 tools today, 200+ planned across 12 jurisdictions.

### Platform Numbers (Ukraine, as of March 2026)

| Metric | Value |
|--------|-------|
| Court decisions (full text) | 110M |
| Court decisions (metadata) | 97M |
| Court sessions (scheduled hearings) | 30.5M |
| Company & registry records | 86M |
| Enforcement proceedings | 29M |
| ECHR cases | 11.1K |
| Legislation | Full corpus |
| MCP tools | 45 |
| Total structured records | **400M+** |
| Total data volume | **1.8 TB** |
| Time to build | **3 weeks** |

---

## Why Partner With LEX?

The European legal market is worth over **$100 billion annually**, yet most legal professionals still work with fragmented, siloed data. Court decisions in one country are invisible from another. Company registries speak different languages. Legislation updates happen in dozens of systems with no unified access.

**LEX changes this.** We've built the infrastructure to ingest, structure, and make searchable billions of legal records — and we've proven it works at scale in one of Europe's most complex legal environments: Ukraine.

We're expanding into **11 European markets** with a clear goal: create a **pan-European legal intelligence layer** that gives lawyers, compliance officers, and corporate counsel instant access to legal data across borders.

**We bring the technology. You bring the market knowledge.**

---

## The Problem We Solve

Today, a lawyer doing cross-border due diligence must:
- Search 5+ different court decision databases manually
- Check company registries in each country with different interfaces and languages
- Cross-reference sanctions lists, insolvency registers, and beneficial ownership data across jurisdictions
- Spend hours on what should take minutes

**With LEX**: one query, all jurisdictions, AI-powered analysis, instant results. Ask "Show me all litigation involving Company X across Europe" and get structured results from 12 countries in seconds.

---

## What We've Built in Ukraine (3 weeks)

| Data Source | Records | Description |
|-------------|---------|-------------|
| Court Decisions (EDRSR) | 110M fulltext + 97M metadata | Full text of every Ukrainian court decision since 2005 |
| Court Sessions | 30.5M | Every scheduled court hearing 2020-2026 |
| Company Registry | 86M records across 37 tables | Legal entities, beneficiaries, enforcement proceedings |
| NAIS Registries | 41.5M | Debtors, enforcement, notaries, experts, bankruptcy |
| Legislation | Full corpus | All Ukrainian laws via Rada API |
| Tax Registries | 1.83M | VAT, single tax, tax debt, ESV debt |
| ECHR Cases | 11,104 | All European Court of Human Rights cases involving Ukraine |
| Judicial Data | 50K+ | Judge profiles, efficiency ratings, disciplinary records |
| **Total** | **~400M+** | **1.8 TB of structured legal data** |

**Infrastructure**: MCP servers, PostgreSQL with sharding, vector search (Qdrant), AI analysis (GPT-4o), streaming SSE, Docker deployment.

### How We Did It

We built a **parallel import pipeline** that can ingest hundreds of millions of records in hours, not weeks:

- **Sharded COPY**: Split data across 8 PostgreSQL shards, raw COPY without indexes (50x faster than INSERT), dedup at the end
- **Multi-IP download**: Rotate across multiple IPs to avoid rate limiting from government portals
- **Two-phase approach**: Phase 1 — parallel bulk download + COPY (25 minutes for 420M rows). Phase 2 — parallel dedup per shard + merge
- **Multi-agent orchestration**: 8 AI agents researching and importing data sources simultaneously

This pipeline is **fully reusable** for every new country. The infrastructure investment is already made.

---

## Why Now?

Three trends make this the right moment for pan-European legal data:

1. **EU Open Data Directive (2019/1024)** — All EU member states are required to make public sector data available in machine-readable formats. Compliance is accelerating across all 11 target markets.

2. **ECLI Standard Adoption** — The European Case Law Identifier is now implemented in most EU courts, creating a unified namespace for cross-border case law search.

3. **AI Readiness** — Large language models can now understand legal text in any European language, making it possible to build cross-jurisdictional legal analysis that was impossible 2 years ago.

---

## European Market Analysis

### Data Volume by Country

| Country | Court Decisions | Legislation | Companies | Land/Property | Open Data Portal | Total Est. |
|---------|----------------|-------------|-----------|---------------|-----------------|------------|
| **UK** | 900K (BAILII) | 75K acts | 10M+ (Companies House) | 26M titles, 30M transactions | 50K datasets | **~240M+** |
| **France** | 5M+ (Legifrance) + 250K (Judilibre) | 100K+ texts | 11M SIREN / 30M SIRET | 600M parcels | 50K datasets | **~650M+** |
| **Germany** | 610K+ (OpenJur) + 60K (federal) | 6.5K laws / 92K provisions | 5.3M (Handelsregister) | N/A (fragmented) | 120K datasets | **~6M+** |
| **Netherlands** | 650K (Rechtspraak) | 15K+ laws + 200K local | 2.4M active / 6M total | 9M parcels, 10M addresses | 25K datasets | **~28M+** |
| **Spain** | 9M+ (CENDOJ) | 50K+ norms (BOE) | 3M+ companies | N/A | 100K datasets / 500K files | **~12M+** |
| **Italy** | 35M+ docs (ItalGiure) | 75-200K acts | 6M+ companies | N/A | Tens of thousands | **~41M+** |
| **Denmark** | 40K+ decisions | 90K+ legislation | 4M entities (CVR) | 4M properties | 1K datasets | **~8M+** |
| **Finland** | 100K+ (Finlex) | 25K+ legislation | 3.5M entities (YTJ) | N/A | 3K datasets | **~3.6M+** |
| **Sweden** | 15K published | 80-100K legislation | 5M entities | N/A | 10K datasets | **~5.1M+** |
| **Switzerland** | 100K+ (BGer) + 50-100K cantonal | 6K+ acts (Fedlex) | 750K active / 1.2M total | 4M parcels (restricted) | 10K datasets | **~1.5M+** |
| **Estonia** | 130K+ (Riigi Teataja) | 35K+ legal acts | 400K entities | 650K parcels | 3K datasets | **~1.3M+** |

### Total Addressable Data: **~1 Billion+ records across 11 markets**

---

## Deep Dive: Key Markets

### United Kingdom — The Gold Standard of Open Legal Data

The UK offers the most mature open data ecosystem in Europe. **Companies House** is arguably the world's best open corporate registry — 10M+ companies with free REST API, including beneficial ownership (PSC) data. **legislation.gov.uk** provides every UK law since 1267 in structured XML with a production-grade API. The **FCA Register** covers 300K+ regulated financial entities.

The main gap is court decisions: **BAILII** has 900K cases but no API or bulk download — a partnership opportunity for a local data provider.

**Key opportunity**: Cross-referencing Companies House PSC data with court decisions and FCA regulatory actions for compliance/due diligence workflows.

### France — Largest Legal Data Volume in Europe

France stands out with **SIRENE** — 11M companies and 30M establishments, completely free with an excellent API. **Judilibre** provides 250K Supreme Court decisions via OAuth2 API. The **BODACC** tracks every company lifecycle event (incorporations, insolvencies, dissolutions).

The **cadastre** dataset is massive (600M parcels) but the real value for legal tech is in the 5M+ court decisions accessible through Legifrance and the expanding open justice reform.

**Key opportunity**: France's Licence Ouverte 2.0 is one of the most permissive open data licenses in Europe — no restrictions on commercial reuse.

### Germany — Fragmented but Valuable

Germany's federal structure creates challenges: company registries are managed by 16 states, court decisions are scattered across federal and state portals. **OpenJur** (610K decisions) and **Rechtsprechung-im-Internet** (60K federal decisions) are the main open sources.

The **OffeneRegister** project provides a 2018 snapshot of 5.3M companies in bulk, but live data requires scraping. **GovData.de** aggregates 120K datasets but acts as a catalogue, not a data store.

**Key opportunity**: Being the first to unify Germany's fragmented legal data landscape would be extremely valuable for the 65,000+ law firms in the country.

### Nordics — Small but Perfectly Formed

The Nordic countries punch above their weight in open data quality:
- **Denmark's CVR** is the most developer-friendly company register in Europe (free Elasticsearch API, 4M entities)
- **Finland's Finlex** implements Linked Data with SPARQL endpoint and CC0 licensing
- **Sweden's Riksdagen** publishes legislation in Akoma Ntoso XML — the most structured legal data format in the world

All three countries have near-complete digital coverage and strong open data cultures. Small populations mean smaller datasets, but exceptionally high data quality.

---

## API Readiness by Country

### Tier 1 — Production-Ready APIs (fastest integration)

| Country | Source | API Type | Auth | License |
|---------|--------|----------|------|---------|
| **UK** | Companies House | REST JSON | Free API key | OGL v3 |
| **UK** | legislation.gov.uk | REST XML/JSON | None | OGL v3 |
| **UK** | FCA Register | REST JSON | None | OGL v3 |
| **France** | SIRENE (INSEE) | REST JSON | Free registration | Licence Ouverte 2.0 |
| **France** | Judilibre | REST JSON (PISTE) | OAuth2 (free) | Licence Ouverte 2.0 |
| **France** | BODACC | REST JSON/XML | None | Licence Ouverte 2.0 |
| **Denmark** | CVR | Elasticsearch | Free key | Danish Open Data |
| **Finland** | Finlex | REST + SPARQL | None | CC0 |
| **Finland** | YTJ/PRH | REST JSON | None | CC BY 4.0 |
| **Switzerland** | Zefix | REST JSON | None | OGD free |
| **Switzerland** | Fedlex | SPARQL + Linked Data | None | CC0 |
| **Netherlands** | Rechtspraak | OAI-PMH + REST | None | CC0 |
| **Estonia** | Riigi Teataja | OAI-PMH + REST | None | Public domain |
| **Estonia** | e-Business Register | REST + XROAD | None | Open |

### Tier 2 — Bulk Download Available (need ETL pipeline)

| Country | Source | Format | Size Est. |
|---------|--------|--------|-----------|
| **UK** | BAILII | HTML (scraping) | ~900K documents |
| **Germany** | Gesetze-im-Internet | XML bulk | ~1 GB |
| **Germany** | OpenJur | JSON bulk dump | ~10-50 GB |
| **Germany** | OffeneRegister | JSON/SQLite dump | ~4 GB |
| **Spain** | BOE | XML API | ~50K norms |
| **Italy** | Normattiva | XML OpenData API | ~200K acts |
| **Sweden** | Lagrummet/Riksdagen | XML (Akoma Ntoso) | ~100K docs |

### Tier 3 — Restricted/Paid Access

| Country | Source | Restriction |
|---------|--------|-------------|
| **Spain** | CENDOJ (9M decisions) | No API, scraping prohibited commercially |
| **Italy** | ItalGiure (35M docs) | Subscription for full access |
| **Italy** | Registro Imprese | Paid API |
| **Germany** | Handelsregister (live) | No API, 2018 dump only |
| **UK** | Land Registry (ownership) | £3/title |
| **Switzerland** | Grundbuch (land) | Restricted by law |

---

## Integration Timeline

Based on our Ukraine experience (3 weeks, 400M+ records):

| Wave | Countries | Timeline | Rationale |
|------|-----------|----------|-----------|
| **Wave 1** | UK, Netherlands, Denmark, Estonia | Week 1 | Best APIs, CC0/OGL licenses, English/simple data |
| **Wave 2** | France, Finland, Sweden | Week 2 | Strong APIs, larger volumes, local language |
| **Wave 3** | Germany, Switzerland, Spain, Italy | Week 3 | Complex/fragmented, some paid access needed |

**Infrastructure already built**: MCP server pattern, PostgreSQL sharding, fast COPY pipelines, multi-IP download, parallel import, vector search — all reusable across jurisdictions.

---

## Use Cases Across Borders

### 1. Cross-Border Due Diligence
A law firm in London needs to assess a German company's legal exposure before an acquisition. LEX instantly surfaces: company registry data from Handelsregister, any court decisions involving the company from OpenJur, insolvency filings from Insolvenzbekanntmachungen, beneficial ownership from OffeneRegister, and EU sanctions screening — all in one query.

### 2. Litigation Intelligence
A litigator in Paris wants to know how a specific legal argument has been received across European courts. LEX searches Judilibre (France), Rechtspraak (Netherlands), Finlex (Finland), and CENDOJ (Spain) simultaneously, finding relevant precedents across jurisdictions and identifying the strongest arguments.

### 3. Regulatory Compliance
A compliance officer at a bank needs to screen 500 counterparties across multiple jurisdictions. LEX checks company registries, sanctions lists, insolvency registers, and enforcement proceedings in all 12 countries in minutes — a task that would take weeks manually.

### 4. Judge Analytics
Before filing in a specific court, a lawyer checks the assigned judge's track record: case volume, average decision time, overturn rate on appeal, specialization areas. LEX provides this from VKKS-style data available in multiple jurisdictions.

### 5. Legislative Monitoring
A corporate counsel needs to track regulatory changes affecting their business across 5 EU markets. LEX monitors Legifrance, legislation.gov.uk, Gesetze-im-Internet, Retsinformation, and Normattiva, alerting when relevant laws change.

---

## What We're Looking For: Local Partners

For each market, we need:

1. **Legal Domain Expert** — validate data accuracy, understand local court system nuances, ensure AI outputs are legally sound
2. **Data Source Navigator** — help with restricted/paid registries, government API access, relationships with data providers
3. **Market Development** — identify target customers (law firms, corporate legal, compliance teams, in-house counsel)
4. **Language & Localization** — legal terminology mapping, UI translation, jurisdiction-specific UX

### Partner Benefits

- **Early access** to LEX platform for your jurisdiction before public launch
- **Revenue share** on local market (details in partner agreement)
- **Co-branding** opportunities — "LEX powered by [Your Firm]" in your market
- **Cross-border data access** — all 12 countries + Ukraine from day one
- **Technical support** — our engineering team handles all data pipeline and infrastructure
- **AI capabilities** — semantic search, document analysis, case prediction powered by state-of-the-art LLMs

---

## Technical Architecture

```
                    ┌─────────────────────────────────────┐
                    │         LEX Unified Gateway          │
                    │    (MCP Protocol + REST + SSE)       │
                    └──────────┬──────────────────────────┘
                               │
        ┌──────────┬──────────┼──────────┬──────────┐
        ▼          ▼          ▼          ▼          ▼
   ┌─────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐
   │ Ukraine │ │   UK   │ │ France │ │Germany │ │  ...   │
   │  MCP    │ │  MCP   │ │  MCP   │ │  MCP   │ │  MCP   │
   │ Server  │ │ Server │ │ Server │ │ Server │ │ Server │
   └────┬────┘ └───┬────┘ └───┬────┘ └───┬────┘ └───┬────┘
        │          │          │          │          │
   ┌────▼────┐ ┌───▼────┐ ┌───▼────┐ ┌───▼────┐ ┌───▼────┐
   │   PG    │ │   PG   │ │   PG   │ │   PG   │ │   PG   │
   │ 400M+   │ │ 240M+  │ │ 650M+  │ │  6M+   │ │  ...   │
   └─────────┘ └────────┘ └────────┘ └────────┘ └────────┘
```

Each country gets its own MCP server with local data sources, unified behind a single gateway. Cross-border queries span all jurisdictions.

---

## Competitive Landscape

| Player | Coverage | Approach | Limitation |
|--------|----------|----------|------------|
| **Harvey.ai** | US + UK | LLM for law firms | No multi-jurisdiction data layer |
| **Luminance** | Multi-market | Document review AI | No open data integration |
| **vLex/Justis** | 100+ countries | Case law aggregation | Subscription model, no AI chat |
| **Lexis/Westlaw** | Global | Traditional legal database | Expensive, not AI-native |
| **LEX** | Ukraine + 11 EU | **Open data + AI + MCP protocol** | Building phase |

**Our differentiator**: We don't just wrap an LLM around legal text. We build a **structured, searchable, interconnected data layer** from open government sources — then add AI on top. This means our data is always current (government APIs update daily), our coverage is comprehensive (every court decision, not just curated selections), and our cost structure allows aggressive pricing.

---

## The MCP Advantage

LEX is built on the **Model Context Protocol (MCP)** — the open standard for connecting AI models to external data. This means:

- **Any LLM can use our data** — Claude, GPT-4, Gemini, open-source models
- **Tool-based architecture** — each data source is an MCP tool that AI can call on demand
- **Composable queries** — AI agents chain tools together for complex multi-step analysis
- **Real-time streaming** — results stream via SSE as they're found, not batch-returned

Currently: **45 MCP tools** for Ukraine. Target: **200+ tools** across 12 jurisdictions.

---

## Roadmap

### Q2 2026 — European Data Layer
- Wave 1-3 data ingestion (11 countries)
- Multi-jurisdiction search API
- Cross-border company graph

### Q3 2026 — AI Features
- Multi-language legal analysis
- Precedent prediction across jurisdictions
- Automated due diligence reports

### Q4 2026 — Platform Launch
- Public launch in Wave 1 countries (UK, NL, DK, EE)
- Partner portal for local law firms
- Enterprise API for compliance teams

### 2027 — Scale
- Remaining EU markets (Poland, Czech Republic, Romania, etc.)
- North America (US federal courts, Canadian registries)
- Asia-Pacific exploration

---

## Contact

**LEX** — AI-powered legal intelligence for Europe

- Platform: [legal.org.ua](https://legal.org.ua)
- GitHub: [github.com/overthelex](https://github.com/overthelex)
- Email: hello@legal.org.ua
- LinkedIn: LEX Legal Intelligence

*We're building the Harvey.ai of European legal tech — starting from Ukraine, scaling across the continent.*

---

*This document was compiled on March 23, 2026, using parallel AI agents that simultaneously researched open data portals across all 11 target markets. Data volumes are estimates based on official API documentation and government portal statistics.*
