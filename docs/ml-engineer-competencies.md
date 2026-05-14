# ML Engineer Competencies We Look For — and How to Join Us If You're Not an ML Engineer Yet

*We're an open company, and the whole point of opening LEX AI is to give people a real chance to plug in — whatever their starting point is. This is a friendly, honest map of what we'd love to see from someone who wants to lead the ML side, and how to join us if your strengths are somewhere else entirely.*

---

## Why This Article Exists

Google Cloud asked us five concrete technical questions before allocating GPU resources for our ML training plan:

1. Training, fine-tuning, or inference — which of these, and how is it spread over time?
2. Which model, how many parameters, how many training tokens?
3. How many concurrent users at peak?
4. Average prompt size and expected response length?
5. What is the target time to first token?

These five questions shape everything we'd expect from a senior ML teammate. But we also want to be clear up front: **not every talented person on our team needs to answer those questions**. We have room for many other kinds of contributors, and we'll talk about that too.

If any of what follows sounds too intimidating — keep scrolling. The second half of this article is about how to join us through a path that has nothing to do with training a 685B-parameter model.

---

## Part 1 — What We'd Love From an ML Engineer

If you're aiming for a senior ML role with us, here are nine areas we'd like to discuss. You absolutely don't need all of them. Four out of nine is already a strong start, and the rest is what we'll learn together.

### 1. Fine-tuning Large Language Models

We'd love to hear about LoRA or QLoRA work on 7B, 13B, 32B, or 70B models, and your practical feel for when full fine-tuning beats PEFT. Multi-node training experience — DDP, FSDP, DeepSpeed ZeRO — is very valuable. If you've done continued pre-training on 10B+ tokens of a domain corpus, that's directly relevant to what we're planning next: continued pre-training of DeepSeek-V3 685B on 50–80B tokens of the EDRSR corpus.

### 2. Custom Embeddings Fine-tuning

Our retrieval quality is a core competitive advantage. We'd love to talk to someone who has fine-tuned BGE, E5, or jina-style models using contrastive learning, hard negative mining, and clever domain adaptation tricks. Our specific goal: fine-tune BGE-M3 on `(legal thesis → relevant decisions)` pairs from our retrieval log. Current baseline is Voyage AI — which costs us 10× more in runtime than a well-tuned in-house embedding would.

### 3. RLHF and Constitutional Alignment

This is the most experimental track. We're building constitutional RLHF where the reward constraints are specific articles of the Ukrainian Constitution — presumption of innocence, right to judicial protection, privacy proportionality — expressed as formal rules instead of fuzzy ethical principles. We also have an adversarial training plan with three role-specific models (advocate, prosecutor, judge) training against each other. If you've done reward modeling, PPO, or DPO from scratch — this track is for you.

### 4. Cloud ML Infrastructure

Hands-on experience with Vertex AI, SageMaker HyperPod, or a self-managed Kubernetes + Ray cluster is a huge plus. We're actively deciding between Vertex AI on TPU v5p and SageMaker HyperPod on Trainium2 for our Phase 2 training. If you have real scars from multi-node training — OOM in one worker at 60% completion, checkpointing strategy debates — we would love to hear those stories.

### 5. Inference Optimization

Our production targets are a sub-500ms time to first token, 500–1,000 concurrent users at peak, input windows of 8–16K tokens, and outputs of 2–8K tokens. We run vLLM with FP8 quantization and prefix caching, with Bedrock Claude as a fallback for reasoning overflow. Experience with continuous batching, speculative decoding, or distillation for high-volume routing is extremely welcome.

### 6. Retrieval, RAG, and Citation Verification

We have 65M vectorized court decisions out of 100M full-text decisions, stored across Qdrant and pgvector (duplicated for consistency). Our Phase 3 goal is a dedicated citation verification model that cross-references every model output against our database, so no fabricated article citation slips through. HNSW tuning, hybrid search, reranking with cross-encoders — we'd love to talk about what you've built.

### 7. Capacity Planning and Cost Modeling

Our total cloud spend across Phase 1–3 is estimated at $195K–$265K over 12 months. We're in parallel conversations with Google Cloud, AWS, and Nebius for sponsorship. If you can sit down and map TFLOPS-hours for a training run, compute a sensible cost-per-token curve for inference, and decide pragmatically between a commercial LLM and a self-hosted option — that skill is gold to us.

### 8. Evaluation Methodology

Our Phase 3 target metrics are ambitious: over 95% preference rate vs GPT-4o on legal tasks, under 0.2% hallucination rate measured through citation verification, and over 85% citation accuracy. We work with an evaluation panel of 20+ practicing Ukrainian lawyers. If you've built LLM-as-a-judge pipelines with proper human calibration, or you have opinions about LegalBench and CaseHOLD that go beyond MMLU — we want to hear them.

### 9. Data Engineering for Large Corpora

EDRSR is 100.5M decisions and 1.17 TB of PostgreSQL data, much of it full of boilerplate that needs smart deduplication. We also pull 488K Dutch court decisions for cross-jurisdiction transfer, and 76K legislation sections linked to case law. Our own `SemanticSectionizer` splits documents by article, part, and item. If you've deduped 10M+ documents or thought carefully about chunking legal text, that's exactly the mindset we need.

---

## Part 2 — If You're Not an ML Engineer, Please Keep Reading

We mean it when we say we're an open company. The ML track is one lane of many, and some of our most valuable contributors never touch a training script.

Here are real ways to join us that don't require fine-tuning a single model.

### Open Data Collection

This is probably our single biggest underserved area. We already integrate more than fifteen government and international data sources — EDRSR, Verkhovna Rada, NACP, OpenReyestr, OpenSanctions, GLEIF, ICIJ Offshore Leaks, HIBP, NVD, INTERPOL, World Bank Debarment — but we want more. European court registries (the Netherlands, Czechia, Sweden, the EU Court of Justice), regulatory registries (FINMA, BaFin, AFM, CSSF), LATAM registries, and incremental sanctions sync are all on the list.

If you know Python or Node.js, understand rate limits and proxy rotation, and enjoy the quiet satisfaction of a checkpointable scraper that picks up gracefully after a 503 — we have work for you. A typical open-data adapter takes three to five days and lands in production within a week of the PR being opened. No ML required.

### Frontend and UX

Our web app is React 19 + Vite + TailwindCSS + Zustand + TanStack Query. We have a long list of tasks waiting: an evidence panel refactor so search results render on the right side of the screen instead of inside the chat, a side-by-side diff viewer for two court decisions, a timeline view for a single party's case history, a law-firm dashboard for team-based views, and an accessibility audit against WCAG AA. Some of this is a three-day task, some is a two-week project.

### Performance and Infrastructure

Our PostgreSQL database is 1.17 TB and certain queries take 5–10 seconds — we need time-based partitioning on the `cases` table. Our pgvector HNSW indexes are tuned for 65M vectors but could use more work. Our Docker images are 2 GB and could be much smaller with multi-stage and distroless builds. Our CI pipeline takes 12 minutes to build the monorepo, and we'd love to get it to four.

### Tests and Documentation

Honestly, this is where we recommend you start if you've never contributed to an open-source project before. We have Playwright E2E tests to write for critical flows, Jest coverage to push from 45% to 75% in `mcp_backend`, an OpenAPI spec to author for our three MCP servers, and Mermaid architecture diagrams to draw. These tasks are low risk, get reviewed fast, and give you a safe way to learn our code and our review style.

---

## What Staying Open Means for Us

Being an open company isn't a slogan. It shows up in concrete ways:

Our main repository `overthelex/secondlayer` is fully public. Everything — three MCP servers, the web app, the developer console at platform.legal.org.ua, all importers and data pipelines, the entire CI/CD, migrations, deployment scripts — is there. The only thing we keep private is our `secondlayer-core` repo, which holds chat orchestration, production prompts, billing logic, and anti-abuse heuristics. Everything else is fair game.

We don't do interview gauntlets. Your first pull request is the interview. We review within 48 hours. If it lands, we talk about contract, rate, and scope.

We use Claude Code ourselves, every day. Our CI/CD includes Claude agents that auto-fix failing builds. AI-assisted code is welcome and expected — what matters is that you understand every line you ship and that you test locally before pushing.

We give prod access from day one. We don't do a probation month in read-only. If we trust you enough to merge your PR, we trust you enough to see production.

---

## How to Start, Concretely

If you feel confident in at least four of the nine ML areas above, email `vladimir@legal.org.ua` and tell us about one training run you're proud of, one inference-optimization win, and why the legal domain interests you. We'll reply within 48 hours and start with a pair-programming session on a real ML task from our backlog.

If ML isn't your lane but any of the open-data, frontend, infra, or testing areas caught your eye, clone `github.com/overthelex/secondlayer`, run it locally with `docker compose -f docker-compose.local.yml --env-file .env.local up -d`, browse the issues labeled `good-first-issue` or `help-wanted`, comment on one to say you're taking it, and open a PR. We'll review within 48 hours.

If you're completely new to open source, start with a documentation PR or a Playwright test. Nobody on our team started as a senior open-source contributor — everyone had a first PR somewhere.

---

**Open repo:** https://github.com/overthelex/secondlayer
**Issues for contributors:** https://github.com/overthelex/secondlayer/labels/good-first-issue
**Discussions:** https://github.com/overthelex/secondlayer/discussions
**Contact:** vladimir@legal.org.ua
**Blog:** https://legal.org.ua/blog

---

*Whatever path you take in — welcome. Write a PR, not a cover letter.*
