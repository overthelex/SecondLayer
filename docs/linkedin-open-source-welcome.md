# Open Doors: We're Looking for Independent AI/ML Engineers and Open-Source Contributors

*LEX AI has been built since 2024 by a small team. We're now opening a large part of the platform as open source and inviting independent engineers to join — as contributors and as future team members.*

---

## What LEX AI Is

LEX is a Ukrainian legal AI platform. Semantic search across **100M+ court decisions** (EDRSR — the largest open court decisions corpus in Europe), legislation from the Ukrainian Parliament, OSINT and due diligence, consultations, billing. The stack is assembled as MCP (Model Context Protocol) servers behind a unified gateway.

Our second product — **Panoptic** (panoptic.com.ua) — is an OSINT platform aggregating 18+ intelligence data sources: sanctions, corporate ownership, credential breaches, IP/domain reputation, GDELT, INTERPOL, World Bank Debarment.

We're building Harvey.ai-level quality for Ukrainian jurisprudence on open-weight models — DeepSeek-V3, Llama, Qwen — because the data is unique (no comparable corpus exists in the EU), and open-weight models after continued pre-training deliver 90%+ of flagship LLM quality on domain tasks at a fraction of the cost.

---

## Our Repository Layout

We maintain two repositories, and this is important to understand up front:

### 1. `overthelex/secondlayer` — public, open source

This is the main monorepo, and it is now public. URL:

**https://github.com/overthelex/secondlayer**

It contains almost the entire platform:

- Three MCP servers (`mcp_backend`, `mcp_rada`, `mcp_openreyestr`) — court cases, parliament, business registry
- The web frontend (`lexwebapp`) — React 19, Vite, TailwindCSS, Zustand, TanStack Query
- The shared TypeScript package (`packages/shared`) — LLM managers, logger, cost tracker, SSE handler, database base class
- Developer Console (`platform`) — **platform.legal.org.ua**, the developer portal: API keys, documentation, integration examples
- All data importers for 340M+ records from 15 government APIs — EDRSR, Verkhovna Rada, NACP, OpenReyestr, OpenSanctions, GLEIF, ICIJ Offshore Leaks, HIBP, NVD, INTERPOL, World Bank
- The full CI/CD pipeline — self-hosted GitHub Actions runner, blue-green deploy over SSH, Claude Code auto-fix agents for failing builds
- All deployment configuration — Docker Compose for local, blue-green compose for production, nginx, manage-gateway script
- Playwright E2E test suite and Jest/Vitest unit tests
- Database migrations for all three PostgreSQL instances
- Internal documentation, architecture notes, data model descriptions

Clone it, read it, run it locally. Everything needed to spin up a working instance is there.

### 2. `overthelex/secondlayer-core` — private, closed source

A separate repository that we deliberately keep private. It contains:

- **Chat orchestration logic** — how user queries are classified, routed between tools, and composed into multi-step responses
- **Production prompts** — the exact prompt templates, few-shot examples, and system messages used in production for classification, summarization, citation checks, and tool selection
- **Billing and payment business logic** — credit deduction rules, subscription tier resolution, Monobank callback handlers
- **Anti-abuse and rate-limiting heuristics** we don't want adversaries to enumerate

This is the minimum closed surface that protects our product positioning without holding back the open parts. **The whole "chat logic" — prompt engineering, tool orchestration, model cascading, response composition — lives here, and it is not public.** The open repository expects this layer as a dependency but ships fully functional stub implementations for contributors.

If you join the team, you get access to `secondlayer-core` from day one. If you contribute as an external, you work against the open repo and the stubs — that already covers everything except production prompt engineering.

---

## Who We're Looking For

We don't hire by job title. We're looking for people who already do strong work — and want to do it on a meaningful domain, with real data and real users.

**AI / ML engineers:**

- LoRA fine-tuning of large models (70B+), continued pre-training on multi-billion-token corpora
- Embeddings fine-tuning (BGE-M3, custom encoders) for retrieval
- RLHF, constitutional alignment, adversarial training setups
- Hands-on with Vertex AI, SageMaker HyperPod, Trainium, TPU v5p on multi-node clusters
- Retrieval-augmented generation, citation verification, hallucination guards

**Backend / distributed systems:**

- PostgreSQL at billion-row scale (pgvector, partitioning, TOAST optimizations, PgBouncer)
- Event-driven architectures, queues, replication
- MCP servers, tool orchestration, LLM gateways, cost tracking

**Data engineering / OSINT:**

- Scraping at scale — rate-limiting, proxy rotation, resume logic, checkpointing
- ETL for government open registries
- Sanctions screening, KYC/AML, due diligence pipelines

**Frontend:**

- React 19 + TypeScript at production level
- Complex UI for legal analytics — data-heavy dashboards, evidence panels, document viewers
- Ukrainian i18n, accessibility, performance optimization

---

## Philosophy

- **Open everything that doesn't break the business.** We don't hide the architecture — it isn't the competitive edge. The edge is data, domain quality, and iteration speed.
- **Pragmatism over hype.** A distributed monolith today can be the right answer. Microservices ≠ virtue. A framework ≠ a solution.
- **Legal deserves serious AI engineering.** Not "a chatbot with statutes" — real legal modeling: constitutional alignment, citation verification, jurisdictional specialization.
- **Open source by default.** If the code doesn't contain proprietary prompts, API keys, or client data — it's public.

---

## How to Join

**As a contributor:**

1. Check open issues on GitHub: **https://github.com/overthelex/secondlayer/issues**
2. Submit a pull request — we review within 48 hours
3. For large changes, open a discussion first: **https://github.com/overthelex/secondlayer/discussions**

**As a hiring candidate:**

Email **vladimir@legal.org.ua** with a short résumé. No page-long cover letter needed — show three things:

1. What you've built before — a GitHub link, a production project, concrete numbers
2. Why this domain — legal AI, open data, OSINT — interests you
3. What you want to build in the next 6 months

We respond fast. Interview is a technical discussion (no LeetCode), a pair-programming session on a real task from the backlog, and a coffee chat with the team.

---

## Our Promise

- **Fully remote.** The team is distributed across Europe.
- **No micromanagement.** Trust by default. Output matters more than Slack presence.
- **Prod access from day one.** No probation month in read-only.
- **Compute budget.** If an idea needs a GPU cluster, we talk to Google Cloud, AWS, or Nebius and find the resource.
- **Publication under your name.** Your work is your credit. We don't hide contributors.

---

## Context

We're currently in active conversations with Google Cloud and AWS about sponsorship for a 12-month ML training plan — $195K–$265K, DeepSeek-V3 685B continued pre-training on 50–80B tokens of the EDRSR corpus. We have paying users and B2B clients. Not a startup-in-a-garage, not another enterprise clone. Something in between — and that's what makes the work interesting.

If you're excited by building real AI infrastructure for jurisprudence on the largest open court decisions corpus in Europe — let's talk.

---

**Open repo:** https://github.com/overthelex/secondlayer
**Closed core (chat logic):** `overthelex/secondlayer-core` — private, granted on hire
**Contact:** vladimir@legal.org.ua
**Site:** https://legal.org.ua
**Blog:** https://legal.org.ua/blog
