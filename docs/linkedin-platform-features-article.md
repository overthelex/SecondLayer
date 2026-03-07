# We Built 70 AI Tools for Ukrainian Lawyers. Here's What Actually Gets Used.

**Everyone builds AI features. Few talk about which ones lawyers actually adopt — and which ones they ignore.**

For the past year, my team has been building [LEX AI](https://legal.org.ua) — an AI-powered legal research platform for Ukrainian lawyers. We started with court decision search. Today we have 70 MCP tools across 3 services, covering court practice, legislation, parliament data, business registries, and document analysis.

Here's what we learned about building legal AI that people actually use.

---

## The Platform: 70 Tools, 3 Services, One Interface

| Service | Tools | Domain |
|---------|-------|--------|
| **Core backend** | 36 | Court decisions, legislation, semantic search, document vault, due diligence |
| **Parliament** | 4 | Bills, deputies, voting records, legislation texts |
| **Business registry** | 16+ | Legal entities, beneficiaries, debtors, enforcement proceedings, ARMA seized assets |

Everything runs through MCP (Model Context Protocol) — the same standard Claude Desktop uses. One endpoint. Three transports: stdio for desktop apps, HTTP REST for web, SSE for streaming.

---

## Feature #1: Semantic Search Over 5,000+ Legal Articles

Ukrainian lawyers search for "liability for poor-quality apartment renovation." The Civil Code article they need talks about "defects of work" and "contractor obligations." Zero keyword overlap.

We split 12 Ukrainian legal codes into **5,191 individual articles**, vectorized each one with VoyageAI embeddings, and stored them in Qdrant. Now a natural language query finds the right article even when the terminology is completely different.

**What surprised us:** Lawyers don't just search for articles they suspect exist. They search for *concepts* — "when can alimony be reduced?" — and discover articles they didn't know about. Semantic search turns a lookup tool into a discovery tool.

---

## Feature #2: Login with Diia — National Digital Identity

Most platforms use Google OAuth. We integrated **Diia** — Ukraine's national digital identity app (think: government-issued digital passport in your phone).

Why it matters for legal: Diia verifies you are *who you say you are*, not just that you have a Gmail. For a platform handling attorney-client privileged documents, this is the correct level of identity verification.

The technical flow:
- Mobile: deep link opens Diia app → user confirms → ECDSA-signed callback → JWT session
- Desktop: QR code → scan with Diia app → same flow
- Cryptography: ECDSA + SHA256 (Ukrainian digital signature standard DSTU 4145)

We now support three auth methods: Google OAuth (quick start), Authentik SSO (enterprise/law firms), and Diia (state-level identity). Each serves a different trust level.

---

## Feature #3: MCP Connect — Your Cloud, Our AI

Lawyers keep contracts in Nextcloud, correspondence in Google Drive, and search court practice in a government portal. Three systems, three windows, zero connection.

**MCP Connect** links external storage to the AI:
- Connect your Nextcloud instance → AI reads documents via API without copying them to our servers
- Connect Google Drive → same analysis capabilities
- Ask: "analyze this contract and find relevant court practice for each risk" → one query, multiple systems

**The key architectural decision:** we never copy files. The document stays on your server. LEX AI reads it through the API, analyzes it, and returns results. For law firms handling confidential client documents, this is non-negotiable.

---

## Feature #4: 1,400+ Open Data Sources Cataloged

We built public reference pages mapping every available open data source relevant to legal practice:

- **Ukraine:** 814 judiciary datasets, 633 parliamentary datasets, healthcare registries, transport registries
- **EU:** 5 country profiles (UK, DE, FR, NL, EE) with comparative analysis
- **US:** Federal and state-level legal data sources

These pages serve two purposes: they help lawyers find data sources they didn't know existed, and they document the raw material our AI tools consume.

---

## Feature #5: Due Diligence Across 16 Registries

"Check this company before we sign" — the most common pre-transaction request.

One query with an EDRPOU code (Ukrainian business ID) returns:
- Company registration, status, charter capital
- Founders with ownership percentages
- Ultimate beneficial owners (UBOs) with influence type
- Active enforcement proceedings
- Debtor registry status
- Bankruptcy proceedings
- **NEW: ARMA seized assets** — the Agency for Recovery and Management of Assets registry

Previously: 4 websites, 30 minutes. Now: one request, 2 seconds.

---

## Feature #6: PWA — Install as a Native App

Small but high-impact: LEX AI is now a Progressive Web App. Chrome shows an "Install" button. One click — and the platform runs as a native app with its own icon, no browser chrome, instant launch.

For lawyers who check court practice 20 times a day, eliminating the "open browser → navigate to URL" friction matters more than you'd think.

---

## What We Learned

### 1. Lawyers don't want AI magic — they want verifiable results

Every court decision reference is clickable. Every legal article links to the official text. Every company record traces back to the registry. The right panel shows evidence cards — not AI summaries, but actual source documents.

Trust comes from transparency, not from confidence.

### 2. Integration beats isolation

The MCP Connect feature gets more engagement than we expected. Turns out, the killer feature isn't "better search" — it's "search that connects to everything I already use."

### 3. Identity matters in legal

Google OAuth was fine for demos. For production use by law firms handling privileged documents, Diia-level identity verification changed the conversation from "interesting tool" to "we can actually use this."

### 4. The best features are invisible

HallucinationGuard checks every AI claim against source documents. CitationValidator verifies every case number exists. Precedent status tracking marks overruled decisions. Users don't see these systems — they just notice that references are always real.

---

## What's Next

- Expanding the court sessions database (29.8M+ records, filling historical gaps from open sources)
- Deeper Nextcloud integration with bidirectional sync
- More registries in the due diligence pipeline
- Comparative analysis across EU jurisdictions

---

*Building AI tools for legal professionals at [LEX AI](https://legal.org.ua). 70 MCP tools. 93M court decisions. 5,191 legal articles. Making Ukrainian legal research AI-powered — and verifiable.*

#LegalTech #AI #MCP #Ukraine #OpenData #LegalAI
