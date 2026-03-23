# Investment Opportunity Memorandum

## LEX — AI-Powered Legal Analytics Platform
**legal.org.ua**

**Prepared for:** Prospective Investors
**Date:** March 2026
**Classification:** Confidential

---

## 1. Executive Summary

LEX is a proprietary AI-powered legal analytics platform serving the Ukrainian legal market — a segment with 60,000+ registered attorneys, 5,000+ law firms, and 10,000+ corporate legal departments, yet virtually no AI-native tooling.

The platform combines the largest indexed court decision corpus in Ukraine (115M+ metadata records), proprietary judge performance analytics, semantic search across 2M+ vector embeddings, and native MCP (Model Context Protocol) integration with leading LLMs (Claude, GPT-4o). There are no direct competitors offering comparable AI capabilities in this market.

LEX is built by a complementary founding team: a CTO with 15+ years of infrastructure and AI platform experience (KPI, Glushkov Institute of Cybernetics), and a CEO with a PhD in Law and deep expertise in Ukrainian and international legal practice.

**The ask:** Seed investment to achieve product-market fit and acquire the first 200+ paying customers.

---

## 2. The Opportunity

### Market Context

The global legal AI market is projected to exceed £400M by 2027. Ukraine's legal services sector remains dominated by legacy database providers (LIGA:ZAKON, ZakonOnline) built on 2000s-era technology — keyword search, no AI, no APIs, closed ecosystems.

LEX is positioned as the Harvey.ai of the Ukrainian and CEE legal market.

| Comparable | Domicile | Valuation / Revenue | Focus |
|---|---|---|---|
| Harvey | USA | £1.2B+ (valuation) | AI for law firms |
| Clio | Canada | £2.4B+ (valuation) | Practice management + AI |
| LexisNexis (RELX) | USA/UK | £11B+ (revenue) | Legal analytics, databases |
| **LEX** | **Ukraine** | **Seed stage** | **AI legal analytics + MCP** |

### Addressable Market

| Segment | Size | Potential ARPU | Revenue at 1% Penetration |
|---|---|---|---|
| Attorneys (UNBA) | 60,000+ | £23–39/mo | £1.4–2.3M/yr |
| Law firms | 5,000+ | £79–239/mo | £0.5–1.4M/yr |
| Corporate legal departments | 10,000+ | £159–399/mo | £1.9–4.8M/yr |
| API/MCP integrations (B2B) | 100+ | £400–1,600/mo | £0.5–1.9M/yr |

---

## 3. Production Data Assets

LEX has assembled one of the most comprehensive legal data repositories in Ukraine. The following datasets are live in production as of 23 March 2026, sourced from the Linear task tracker (LEG-233):

### 3.1 Court Decisions (EDRSR — Unified State Register of Court Decisions)

| Dataset | Records | Table / Storage | Status |
|---|---|---|---|
| EDRSR metadata (all decisions since 2006) | 8,800,000 | `edrsr_documents` (partitioned by year) | Complete |
| EDRSR full-text RTF archive | 53M files, 1.4 TB | HDD file storage | Complete |
| Court sessions (ZakonOnline archive, 2020–present) | ~18,500,000 | `court_sessions` (HUDOC PostgreSQL) | In progress |
| Supreme Court judges | 153 | `supreme_court_judges` | Partial |

### 3.2 NAIS State Registries (data.gov.ua) — 11/11 Complete

| Registry | Records | Table |
|---|---|---|
| Enforcement proceedings | 29,060,072 | `enforcement_proceedings` |
| Debtors register | 10,363,352 | `debtors` |
| Special forms of notarial documents | 1,224,003 | `special_forms` |
| Administrative-territorial units | 500,704 | `administrative_units` |
| Street directory | 497,464 | `streets` |
| EDRNPA (normative legal acts) | 140,930 | `legal_acts` |
| Bankruptcy cases | 35,439 | `bankruptcy_cases` |
| Court experts | 14,730 | `court_experts` |
| Notaries | 5,799 | `notaries` |
| Arbitration managers | 3,420 | `arbitration_managers` |
| Forensic examination methods | 1,546 | `forensic_methods` |

**NAIS subtotal: ~41,800,000 records**

### 3.3 Tax Registries (DPS / State Tax Service)

Data as of 23 February 2022 (last available dump prior to full-scale invasion).

| Registry | Records | Table |
|---|---|---|
| Tax debt | 861,124 | `tax_debt` |
| Unified social contribution (ESV) debt | 668,541 | `esv_debt` |
| Simplified taxation payers | 167,007 | `single_tax_payers` |
| VAT payers | 131,165 | `vat_payers` |

**Tax subtotal: ~1,830,000 records**

### 3.4 Sanctions & Compliance

| Dataset | Records | Table |
|---|---|---|
| OpenSanctions (global) | 1,257,977 | `opensanctions_entities` |
| RNBO sanctions (National Security Council of Ukraine) | 21,090 | `rnbo_sanctions` |
| DRS inspection plans 2026 | 31,876 | `inspection_plans` |
| DSSU financial reports (2024 annual) | 8,434 | `dssu_financial_reports` |

### 3.5 Procurement & Public Finance

| Dataset | Records | Table | Status |
|---|---|---|---|
| Prozorro public tenders | 706,100+ (growing) | `prozorro_tenders` | In progress (3 workers, 2020–2027) |
| spending.gov.ua | — | On-demand MCP tool | WAF restrictions; API-only |

### 3.6 Business Registry (OpenReyestr / EDRSR)

| Dataset | Records | Table |
|---|---|---|
| Legal entities (Юридичні особи) | ~1,800,000 | `legal_entities` |
| Individual entrepreneurs (ФОП) | ~2,300,000 | `individual_entrepreneurs` |
| Public associations (Громадські формування) | ~150,000 | `public_associations` |
| Founders, beneficiaries, signers, members | Relational | Multiple linked tables |

**OpenReyestr subtotal: ~4,500,000+ entity records**

### 3.7 Vector Search & AI Infrastructure

| Component | Scale | Technology |
|---|---|---|
| Vector embeddings (semantic search) | 2,000,000+ vectors | Qdrant (1536-dim, text-embedding-3-small) |
| Legislation corpus (Verkhovna Rada) | 200,000+ acts | PostgreSQL + RADA API |
| Judge analytics | 12,000+ profiles | PostgreSQL with efficiency metrics |
| Parliamentary data (deputies, bills, voting) | 450 deputies, 10K+ bills | PostgreSQL (RADA schema) |

### 3.8 Consolidated Data Summary

| Category | Records |
|---|---|
| EDRSR court decision metadata | 8,800,000 |
| Court sessions (HUDOC) | ~18,500,000 |
| NAIS state registries (11 datasets) | ~41,800,000 |
| Enforcement + debtors | ~39,400,000 |
| Tax registries | ~1,830,000 |
| Business registry (OpenReyestr) | ~4,500,000 |
| Sanctions & compliance | ~1,320,000 |
| Procurement (Prozorro) | 706,000+ |
| Legislation, judges, parliament | ~212,000+ |
| Vector embeddings | 2,000,000+ |
| Full-text RTF archive | 53,000,000 files |
| **Total structured records** | **~119,000,000+** |
| **Full-text file archive** | **53M files / 1.4 TB** |

### 3.9 Data Pipeline Roadmap (Tier 1 — Outstanding)

| Source | Due Diligence Value | Access |
|---|---|---|
| DRRP (real property register) | Ownership, encumbrances, arrests | NAIS contract required (~₴3/query) |
| DRORM (movable property encumbrances) | Pledges, leasing | NAIS contract required |
| DZK (land cadastre) | Land plots | NAIS contract required |
| RADA data on prod | Political risk scoring | Code ready, sync pending |

---

## 4. Product & Technology

### 4.1 Platform Capabilities

LEX delivers 45 MCP tools across three integrated servers:

- **36 backend tools** — court case search, semantic search, legislation, citation verification, judge analytics, document vault
- **4 RADA tools** — deputies, bills, legislation text, voting records
- **5 OpenReyestr tools** — entity search, beneficiaries, debtor checks

### 4.2 Key Differentiators

| Feature | LEX | ZakonOnline | LIGA:ZAKON | ActiveLex |
|---|---|---|---|---|
| AI document analysis | Yes | No | No | No |
| MCP protocol (LLM integration) | Yes | No | No | No |
| Semantic (vector) search | Yes | No | No | No |
| Judge performance analytics | Yes | No | No | No |
| Citation verification | Yes | No | No | No |
| Developer API | Yes | No | No | No |
| SSE streaming | Yes | No | No | No |

**LEX is the only player in Ukraine with AI analytics, semantic search, MCP integration, and automated citation verification.**

### 4.3 Technology Stack

- **Runtime:** Node.js 20, TypeScript 5.3
- **Databases:** PostgreSQL 15 (partitioned, with PgBouncer), Redis 7, Qdrant (vector DB)
- **AI:** OpenAI GPT-4o, text-embedding-3-small, Anthropic Claude (fallback)
- **Infrastructure:** Docker, Nginx, MinIO (S3-compatible), blue-green deployment
- **Security:** SCRAM-SHA-256 auth, document-level encryption, SHA-256 hash-chain audit log, GDPR compliance

### 4.4 Technology Moat

1. **Data moat** — 119M+ structured records and 53M full-text files. Replicating this corpus would require months of crawling, parsing, and indexing.
2. **MCP protocol** — First and only Ukrainian platform with native MCP support. 45 tools callable by Claude, GPT, and other LLMs. This is the emerging industry standard.
3. **AI pipeline** — Semantic search, citation verification, pattern analysis, and decision classification — fully automated. Competitors would need to build this from scratch.
4. **Domain expertise in code** — A PhD lawyer as co-founder means legal logic is architected into the platform, not bolted on after the fact.

---

## 5. Demonstrated Capability

### Case Study 1: Judge Performance Analysis

- **Input:** Judge K. I.S., Kyiv District Administrative Court
- **Data processed:** 24,039 USRCD documents, 1,504 appellate decisions across 4 production database shards
- **AI finding:** "High-productivity judge with problematic decision quality. Every second appealed decision is overturned. Absolute leader in deadline violations (3.8x above court average)."
- **Practical value:** Grounds for recusal motions, adjusted defence strategy, appellate outcome prediction.

### Case Study 2: Borrower Defence Strategy (Credit Case)

- **Input:** EUR loan from 2007, ₴11.9M outstanding, 11 years of enforcement proceedings
- **Data processed:** 473 documents cross-referenced with OpenReyestr, NBU registry, Supreme Court precedents
- **AI output:** 9 identified defence strategies, including creditor dissolution (in liquidation), absence of foreign currency licence, 7-year enforcement writ error
- **Processing time:** ~15 minutes (estimated 2–3 business days for a human lawyer)

---

## 6. Unit Economics & Revenue Model

### 6.1 Query Cost Structure

| Query Type | Cost to LEX | Client Price | Gross Margin |
|---|---|---|---|
| Quick search | £0.001–0.002 | £0.008 | 70–90% |
| Standard analysis | £0.008–0.024 | £0.040 | 40–80% |
| Deep analysis | £0.040–0.120 | £0.160 | 25–75% |
| Semantic search | £0.002–0.004 | £0.016 | 60–90% |
| Judge analytics | £0.001 | £0.008 | 90% |

### 6.2 Monetisation

- **Subscription:** From £23/mo (individual attorneys) to £239/mo (law firms)
- **Pay-per-query:** For high-volume and API/B2B clients
- **Average attorney usage:** 50–200 queries/day → £2.00–8.00 daily revenue at minimal marginal cost

### 6.3 Revenue Projections (200 Customers)

| Scenario | Clients | Avg. Monthly | MRR | ARR |
|---|---|---|---|---|
| Conservative | 200 | £23 | £4,600 | £55,200 |
| Base | 200 | £39 | £7,800 | £93,600 |
| Optimistic | 200 | £79 | £15,800 | £189,600 |
| Blended (150 attorneys + 50 firms) | 200 | £37 | £7,400 | £88,800 |

### 6.4 Key SaaS Metrics

| Metric | Value |
|---|---|
| CAC (customer acquisition cost) | ≤£80 |
| LTV (12-month, base scenario) | £468 |
| LTV/CAC ratio | 5.9x (benchmark: >3x) |
| Payback period (base) | ~2 months |
| 12-month ROI | 488% |

---

## 7. Founding Team

**Volodymyr Ovcharov** — CTO & Co-founder
- BSc Applied Mathematics, National Technical University "KPI"
- Researcher, V.M. Glushkov Institute of Cybernetics, National Academy of Sciences of Ukraine
- 15+ years building scalable data processing, NLP, and AI infrastructure platforms

**Igor Kyrychenko** — CEO & Co-founder
- PhD in Law
- Deep expertise in Ukrainian and international law, court practice, and legal analytics
- Bridges academic legal rigour with the practical requirements of working lawyers

---

## 8. Use of Proceeds

| Allocation | % | Amount | Purpose |
|---|---|---|---|
| Marketing & customer acquisition | 50% | £8,000 | Facebook Ads, Google Ads, LinkedIn, content marketing, legal conferences |
| Infrastructure & AI costs | 25% | £4,000 | Servers, OpenAI API, Qdrant, PostgreSQL, CDN, monitoring |
| Product development | 15% | £2,400 | New features, mobile application, integrations |
| Legal & operational | 10% | £1,600 | GDPR compliance, legal registration, accounting |

### Milestones (6-Month Horizon)

| Period | Target |
|---|---|
| M1–M2 | Launch marketing campaigns; 50 paying customers |
| M3–M4 | 100+ customers; launch B2B plans; MCP marketplace |
| M5–M6 | 200+ customers; MRR £4,000–8,000; preparation for seed round |

---

## 9. Scaling Potential

- 60,000+ registered attorneys in Ukraine alone — 1% conversion yields 600+ customers
- MCP protocol enables API monetisation without proportional cost growth
- CEE expansion opportunity: Poland, Czech Republic, Romania share similar legal system structures
- Data moat deepens with every new registry integration (DRRP, DRORM, DZK on roadmap)

---

## 10. Risk Factors

| Risk | Mitigation |
|---|---|
| Geopolitical (ongoing conflict) | Platform is cloud-native; team can operate remotely; EU expansion on roadmap |
| Regulatory changes to open data access | Diversified data sources (11+ registries); NAIS contract pipeline |
| LLM cost inflation | Budget-aware model selection (quick/standard/deep); multi-provider fallback (OpenAI + Anthropic) |
| Competitive entry | 119M+ record data moat; 18-month head start on AI pipeline; domain expertise embedded in architecture |

---

## 11. Contact

**Email:** hello@legal.org.ua
**Platform:** [https://legal.org.ua](https://legal.org.ua)

---

*This document is confidential and intended solely for the use of prospective investors. The information contained herein is based on data available as of 23 March 2026 and is subject to change without notice.*

*© 2024–2026 SecondLayer. All rights reserved.*
