# What We Delegate to Independent Developers: a PR Instead of an Interview, Claude Code Welcome

*In the previous article we announced that we're opening LEX AI as open source. Now the specifics: what tasks sit in the backlog, how they're packaged, why our only "interview" is a first pull request, and why we love Claude Code.*

---

## A PR Instead of an Interview

We don't believe in LeetCode, HackerRank, and three-hour whiteboard interviews. They test the ability to solve problems under stress — not the ability to ship working code into a real codebase.

Our filter is simpler: pick an issue labeled `good-first-issue` or `help-wanted`, open a PR, go through review. That is our "interview." Except the output stays in production — and is paid if the task is on the price list.

If the PR lands, we already know:

- You read other people's code and match the project's style
- You write TypeScript without crutches and without `any` casts
- You test changes locally before pushing
- You self-review before sending
- You discuss calmly in PR comments

That's all we need. After that, we talk contract, rate, scope.

---

## We Write With Claude Code Ourselves. AI-Assisted PRs Are Welcome

We're not against AI-written code. On the contrary — we ship dozens of PRs every week written together with **Claude Code**. Our CI/CD includes Claude agents that auto-fix failing builds on every push to main. So your workflow with Cursor, Claude Code, Copilot, or Codex is not a problem — it's a plus.

What we check:

- You understand **every line** you submit — even if an agent generated it
- You tested changes locally (`docker compose up`, not "the agent said it's fine")
- You don't paste generic React boilerplate that doesn't match the architecture
- You remove dead code and placeholder comments before committing

An LLM assistant is a tool like an IDE. It doesn't make you a worse engineer, and it doesn't make you a better one either — it just speeds up the engineer you already are.

---

## Bucket 1 — OpenData Adapters and ETL

We have 15+ government sources integrated: EDRSR, Verkhovna Rada, NACP, OpenReyestr, OpenSanctions, GLEIF, ICIJ Offshore Leaks, HIBP, NVD, INTERPOL, World Bank. Wanted next:

- **European courts:** rechtspraak.nl (Netherlands, partially done), justice.cz (Czechia), domstol.se (Sweden), curia.europa.eu (Court of Justice of the EU)
- **Regulatory registries:** FINMA (Switzerland), BaFin (Germany), AFM (Netherlands), CSSF (Luxembourg)
- **LATAM:** DNRPA (Argentina), JusBrasil (Brazil), InfoTec (Mexico)
- **Sanctions delta-sync:** incremental OFAC sync with diffs instead of full download

Typical task — 3 to 5 days:

1. Write the adapter in `services/opendata-importers/importers/`
2. Add checkpoint + resume logic (base class already exists)
3. Write a test with a fixture
4. Add it to the scheduler config

**Stack:** Python 3.11 async or Node.js, PostgreSQL COPY, shared base/checkpoint/http_client/ip_pool modules already in place.

---

## Bucket 2 — ML Experiments

The most interesting and most expensive bucket. We're looking for contributors on:

- **LoRA fine-tuning** of jurisdiction-specific models (civil, criminal, administrative) on 1–10M annotated Q&A pairs
- **Custom embeddings** — fine-tune BGE-M3 on `(legal thesis, relevant decision)` pairs from our retrieval log
- **Citation verification** — a dedicated model that verifies whether a cited article of a code actually contains the claimed text
- **Router model** — a "which tool to call" classifier based on the query, replacing our current rule-based gateway

**Stack:** HuggingFace, PyTorch, vLLM, optional Vertex AI / SageMaker. GPU comes from our credit pool with Google Cloud / AWS.

Compensation: fixed + bonus on hitting a metric (e.g., >X% preference rate vs baseline).

---

## Bucket 3 — Frontend and UX

lexwebapp — React 19 + Vite + TailwindCSS + Zustand + TanStack Query. Waiting:

- **Evidence panel refactor** — search results should render in the right panel, not inside chat (multiple issues open)
- **Decision diff viewer** — side-by-side comparison of two court decisions with similarity highlighting
- **Timeline view** — case chronology for a single party (sole proprietor / LLC)
- **Law-firm dashboard** — multi-user view of the team's cases
- **Accessibility audit** — WCAG AA for all key pages

Difficulty ranges from a **3-day task** (timeline view) to a **2-week project** (dashboard).

---

## Bucket 4 — Performance and Infra

- **PostgreSQL optimization** — our DB is 1.17 TB; some queries take 5–10 s; we need time-based partitioning for the `cases` table
- **pgvector HNSW tuning** — 65M vectorized decisions, tuning ef_search vs recall
- **Redis cache layer** — front-cache for heavy aggregations over case statistics by jurisdiction
- **Docker image slimming** — some images are 2 GB; multi-stage + distroless needed
- **CI/CD speedup** — local runner builds the monorepo in 12 min, target is 4 min

---

## Bucket 5 — Tests and Documentation

- **Playwright E2E** for critical flows: signup → Diia auth → search → export → payment
- **Jest coverage** for `services/` in mcp_backend (currently ~45%, target 75%)
- **OpenAPI spec** for the HTTP APIs of all three MCP servers
- **Architecture diagrams** in Mermaid in `docs/`
- **API examples** in Python / cURL / JS for developers

These are ideal for a first PR. Low risk, fast review, we're always reachable.

---

## What We Don't Delegate

To avoid confusion:

- **Production prompts** — live in the private `secondlayer-core` repo
- **Billing business logic** — Monobank callback handlers, credit deduction, subscription tier resolution
- **Anti-abuse heuristics** — rate-limiting strategies, behavioral analysis
- **Direct client contact** — enterprise law firms, government partners
- **Legal decisions in content** — what the model answers on sensitive topics (handled with lawyers)

Everything else — fair game.

---

## How to Start

1. **Clone** `github.com/overthelex/secondlayer`, run `docker compose -f docker-compose.local.yml --env-file .env.local up -d`
2. **Browse issues** labeled `good-first-issue`, `help-wanted`, `bounty`
3. **Comment on the issue** that you're taking it (to avoid duplication)
4. **Open a PR** — we review within 48 hours
5. **Get paid** — UAH via bank or USDT, if the task has a price

For ML, OSINT, or performance tasks — we recommend opening a Discussion first to align on approach. Otherwise there's a risk of doing a PR we'll ask you to redo differently.

---

## FAQ

**Q: What if I'm new and have never done a PR to open source?**
A: There's Bucket 5 (tests and docs). A first PR on a README improvement or a new Playwright test is a great entry point. We'll help with review and advice.

**Q: How does payment work?**
A: Before taking a task, check whether it has the `bounty` or `paid` label. If yes, the amount is in the description. Otherwise it's a community contribution without payment, but with a mention in the CHANGELOG and credit in the README.

**Q: Can I take a large ML task as my first contribution?**
A: Better not. Start with a 1–3 day task so we both see how it feels to work with our code. After that — it's all yours.

**Q: Will you sign an NDA?**
A: If the task is in `secondlayer-core` — yes, a simple mutual NDA. For open-source tasks no NDA is needed.

---

**Open repo:** https://github.com/overthelex/secondlayer
**Contributor issues:** https://github.com/overthelex/secondlayer/labels/good-first-issue
**Discussions:** https://github.com/overthelex/secondlayer/discussions
**Contact:** vladimir@legal.org.ua

---

*Write a PR, not a cover letter.*
