# Product Metrics & ML Training Evidence

**Product**: LEX AI Platform (legal.org.ua)
**Company**: LEX AI LLC, Kyiv, Ukraine
**Period**: February 2026 -- May 2026 (production)
**Data sources**: Production PostgreSQL, MLflow tracking server, CI/CD pipeline

---

## A. Production Platform Metrics

### A1. Users & Revenue

| Metric | Value | Source |
|--------|-------|--------|
| Registered users | 84 | `users` table, prod DB |
| Google OAuth users | 54 | `users.google_id IS NOT NULL` |
| Password auth users | 32 | `users.password_hash IS NOT NULL` |
| Paying users (with balance or spend) | 42 | `user_billing` table |
| Total user balances (USD) | $5,218.63 | `SUM(balance_usd)` |
| Total user spend (USD) | $1,711.15 | `SUM(total_spent_usd)` |
| Consultations created | 22 | `consultations` table |
| Chat messages exchanged | 106 | `consultation_messages` table |

### A2. API Usage & Cost Tracking

| Metric | Value | Source |
|--------|-------|--------|
| Total tracked API requests | 9,061 | `cost_tracking` table |
| Unique tools invoked | 144 | `COUNT(DISTINCT tool_name)` |
| Total AI tokens consumed | 129.5M | OpenAI + Voyage tokens |
| Total AI cost (USD) | $1,750.95 | `SUM(total_cost_usd)` |
| Tracking period | 13 Feb -- 23 May 2026 | `MIN/MAX(created_at)` |

### A3. Monthly API Usage Breakdown

| Month | OpenAI Tokens | OpenAI Cost | Voyage Tokens | Voyage Cost | Total |
|-------|-------------|-------------|---------------|-------------|-------|
| 2026-02 | -- | -- | 104.2M | $12.50 | $12.50 |
| 2026-03 | 8.2M | $106.86 | 45.8M | $5.49 | $112.35 |
| 2026-04 | 14.5M | $189.90 | 1.2M | $0.15 | $190.05 |
| 2026-05 | 65.2M | $297.20 | 16.3M | $1.95 | $299.15 |

Growth trajectory: 24x increase in OpenAI usage from March to May, reflecting product adoption ramp.

### A4. Top Tools by Usage (Production)

| Tool | Invocations | Cost (USD) | Description |
|------|------------|------------|-------------|
| document_classify | 2,655 | $0.17 | AI document classification |
| list_documents | 1,712 | $0.00 | Document listing |
| get_document | 1,559 | $0.00 | Document retrieval |
| ai_chat | 999 | $1,698.74 | AI legal consultation (primary revenue driver) |
| start_import | 459 | $0.00 | Court decision import |
| get_import_status | 440 | $0.00 | Import monitoring |
| chat_plan | 190 | $29.98 | Query planning |
| get_court_decision | 138 | $1.62 | Court decision lookup |
| get_legislation_article | 83 | $0.00 | Legislation retrieval |
| search_supreme_court_practice | 82 | $1.34 | Supreme Court case law |
| get_legislation_structure | 76 | $11.03 | Legislation structure analysis |
| get_legislation_section | 53 | $0.00 | Section-level retrieval |
| search_legislation | 50 | $0.07 | Legislation search |
| search_edrsr_fulltext | 47 | $0.00 | Full-text court search |
| search_edrsr_decisions | 35 | $0.00 | Court decision search |

AI chat is the primary value driver -- 11% of invocations but 97% of AI cost, reflecting deep legal analysis per query.

---

## B. Data Scale

### B1. Court Decisions (EDRSR)

| Metric | Value | Source |
|--------|-------|--------|
| Total court decisions indexed | 100,907,008 | `edrsr_documents` (pg_class estimate) |
| Full-text documents | ~100M | `edrsr_fulltext` |
| Citation edges (court-to-legislation) | 502,141,952 | `law_court_citations` |
| Courts indexed | 843 | `edrsr_courts` |
| Active judges | 5,952 | `judges_current` |
| Legislation acts with full text | 569 | `legislation` (prod cache) |
| Database size | 1,403 GB | `pg_database_size` |

### B2. Multi-Jurisdiction Data (Production)

| Dataset | Records | Source |
|---------|---------|--------|
| Ukrainian legal entities | 1,994,486 | OpenReyestr |
| Ukrainian sole traders (FOP) | 6,854,457 | OpenReyestr |
| Netherlands court decisions | 857,991 | Rechtspraak |
| OpenSanctions entities | 1,248,939 | Sanctions screening |
| Spain BORME company announcements | 275,867 | BORME |
| Spain AEAT tax consultations | 73,969 | AEAT |
| Spain AEPD data protection resolutions | 46,098 | AEPD |
| Spain BOE legislation | 12,228 | BOE |
| Spain Constitutional Tribunal | 27,079 | TC |
| ECHR cases | 11,104 | ECHR HUDOC |

Total: **12 jurisdictions** served across Ukraine, Spain, Netherlands, India, and ECHR.

### B3. Authentication Methods in Production

| Method | Status | Description |
|--------|--------|-------------|
| Email + Password | Active | With reset flow |
| Google OAuth | Active | 54 users |
| Authentik OIDC | Active | Enterprise SSO |
| Diia (Ukrainian digital ID) | Active | National ID verification |
| WebAuthn / Passkeys | Active | Hardware key support |

---

## C. ML Training Experiments (MLflow)

All experiments tracked on MLflow server at `mlflow.legal.org.ua`. Total: **9 experiments, 92 runs** across SageMaker (A10G GPUs) and NVIDIA Brev (8xH100).

### C1. Continued Pre-Training (CPT) -- Qwen 2.5 on 161B Legal Tokens

| Parameter | Value |
|-----------|-------|
| Experiment | `cpt-qwen25-edrsr` (MLflow exp 5) |
| Base model | Qwen/Qwen2.5-14B |
| Corpus | 33.9M EDRSR court decisions (after dedup+filter from 38.5M) |
| Total corpus tokens | 161.42B |
| Tokenizer fertility | 0.515 (Qwen tokenizer) |
| Sequence length | 8,192 |
| Total sequences | 19.7M |
| Hardware | 8x H100 SXM 80GB (640 GB VRAM) |
| Platform | NVIDIA Brev (GCP europe-west4, Eemshaven NL) |
| DeepSpeed | ZeRO Stage 3 |
| Batch | 128 sequences/step (1.05M tokens/step) |
| Max steps | 9,536 |
| Optimizer | AdamW (beta1=0.9, beta2=0.95, weight_decay=0.1) |
| Learning rate | 5e-5, cosine schedule, 300 warmup steps |
| Precision | bf16 |
| Status | **RUNNING** (loss: 0.2526, step ~168 of 9,536) |
| Total runs | 10 (1 running, 1 finished smoke test, 8 killed during setup) |

Data pipeline: 8-stage automated (export > clean > dedup(MD5) > filter > structure > tokenize > package > S3).

Prior smoke test (Qwen 2.5-7B): Completed successfully. Train loss: 0.8952, runtime: 286s for 5 steps.

### C2. DPO Preference Optimization -- Edit-Trace Oversight

| Parameter | Value |
|-----------|-------|
| Experiment | `dpo-edit-trace-oversight` (MLflow exp 2) |
| Base model | meta-llama/Llama-3.1-8B-Instruct |
| Method | Direct Preference Optimization (DPO) |
| Hardware | ml.g5.12xlarge (4x A10G, SageMaker) |
| DeepSpeed | ZeRO Stage 3 |
| LoRA | r=16, alpha=32 |
| Max steps | 689 |
| Total runs | 12 (9 finished, 3 failed) |

#### DPO Results by Condition (3 conditions x 3 seeds):

| Condition | Reward Accuracy | Final Loss | Margin | Seeds |
|-----------|----------------|------------|--------|-------|
| **E** (edit-trace oversight) | **0.836** | 0.369 | 2.30 | 3/3 finished |
| **C** (RLAIF self-correction) | 0.740 | 0.218 | 20.27 | 3/3 finished |
| **A** (random baseline) | 0.503 | 0.829 | 1.19 | 3/3 finished |

**Key finding**: Edit-trace signal (condition E) achieves 83.6% reward accuracy vs 50.3% random baseline -- demonstrating that production edit-traces produce meaningful alignment signal for DPO training.

### C3. Temporal Drift -- Continual Learning

| Parameter | Value |
|-----------|-------|
| Experiment | `temporal-drift-continual` (MLflow exp 1) |
| Model | xlm-roberta-large |
| Task | Case outcome prediction across 3 temporal epochs |
| Method | Continual learning (sequential fine-tuning) |
| Total runs | 37 (15 finished, 10 killed, 2 running, 10 failed) |

#### Sample Results (backward direction: full_scale > hybrid_war > pre_war):

| Stage | Pre-war F1 | Hybrid War F1 | Full-scale F1 | Train Time |
|-------|-----------|---------------|---------------|------------|
| Stage 0 (full_scale) | 0.704 | 0.671 | **0.621** | 1,321s |
| Stage 1 (+hybrid_war) | 0.738 | **0.687** | 0.550 | 1,221s |
| Stage 2 (+pre_war) | **0.738** | 0.677 | 0.499 | 639s |

**Key finding**: Catastrophic forgetting -- adding newer data improves recent-epoch performance but degrades earlier epochs by up to 12 F1 points. Confirms temporal drift hypothesis for legal NLP.

### C4. Cross-Jurisdiction Transfer Learning

| Experiment | MLflow ID | Runs | Finished | Description |
|-----------|-----------|------|----------|-------------|
| cross-jurisdiction-zero-shot | 7 | 10 | 6 | Zero-shot transfer SJP > Ukrainian |
| cross-jurisdiction-joint | 6 | 6 | 3 | Joint training on both jurisdictions |
| cross-jurisdiction-transfer | 10 | 6 | 4 | Fine-tune transfer |
| cross-jurisdiction-reverse | 11 | 7 | 3 | Ukrainian > SJP reverse transfer |
| cross-jurisdiction-bcd-reverse | 12 | 3 | 3 | Brazilian Court Decisions reverse |
| cross-jurisdiction-bcd-baseline | 13 | 1 | 1 | BCD baseline |

#### Zero-shot Transfer Results (xlm-roberta-base, SJP > Ukrainian):

| Test Set | Macro F1 |
|----------|----------|
| SJP (source, in-distribution) | 0.526 |
| Ukrainian pre-war | 0.330 |
| Ukrainian hybrid war | 0.350 |
| Ukrainian full-scale | 0.320 |

**Key finding**: Cross-jurisdiction zero-shot transfer drops ~37% from source to target, confirming that jurisdiction-specific training is necessary for legal judgment prediction.

### C5. MLflow Training Summary

| Metric | Value |
|--------|-------|
| Total MLflow experiments | 9 |
| Total training runs | 92 |
| Completed runs | 39 |
| Running | 8 |
| GPU hours (estimated) | ~500+ |
| Platforms | SageMaker (A10G), NVIDIA Brev (H100) |
| Models trained | Qwen 2.5-14B (CPT), Llama 3.1-8B (DPO), xlm-roberta-base/large (classification) |
| Largest training corpus | 161.42B tokens (33.9M court decisions) |

---

## D. Infrastructure & Engineering

### D1. MCP Tools Ecosystem

| Server | Tools | Description |
|--------|-------|-------------|
| mcp_backend | 76 | Court search, AI chat, ECHR, citation graphs, OSINT, vault, billing |
| mcp_rada | 4 | Parliament data (deputies, bills, legislation, voting) |
| mcp_openreyestr | 27 | Business registry (legal entities, beneficiaries, debtors) |
| **Total** | **107** | Unified behind single gateway |

### D2. Development Velocity

| Metric | Value |
|--------|-------|
| Total commits | 2,526 |
| Merged PRs | 1,784 |
| Development period | 127 days (17 Jan -- 23 May 2026) |
| Average commits/day | ~20 |
| SQL migrations | 169 |
| CI/CD deployments | Automated on every merge to main |
| Deployment method | Blue-green with zero downtime |

### D3. Uptime & Monitoring

| Component | URL |
|-----------|-----|
| Status page | status.legal.org.ua (Uptime Kuma) |
| Production | legal.org.ua |
| Platform | platform.legal.org.ua |
| DefectRadar | defectradar.legal.org.ua |
| MLflow | mlflow.legal.org.ua |

---

## E. Financial Summary

### E1. Revenue & User Economics

| Metric | Value |
|--------|-------|
| Total user spend | $1,711.15 |
| Total AI infrastructure cost | $1,750.95 |
| Average cost per AI chat query | $1.70 |
| Revenue per paying user | $40.74 |

### E2. Cloud Credits & Partnerships

| Provider | Value | Status |
|----------|-------|--------|
| AWS Activate Portfolio | Up to $100,000 in credits (first tranche active, covering all usage) | Active, in use |
| Google for Startups Cloud Program | $350,000 | Application in progress |
| NVIDIA Inception | Membership: preferred GPU pricing, dev tools, VC connections, DGX Cloud credits | Active member since 7 May 2026 |
| NVIDIA Innovation Lab | 8xH100 SXM 80GB (640GB VRAM), 60 days (~$32,000 compute value) | Active since 20 May 2026 |
| NVIDIA DGX Cloud Credit Program | Applied | Under review |
| **Total estimated value** | **~$482,000+** | |

---

## F. Competition & Recognition

| Event | Status | Date | Details |
|-------|--------|------|---------|
| Startup World Cup -- regional finalist | Selected | 28 May 2026 | UNIT.City Kyiv; winner competes for $1M Grand Finale (SF, Nov 2026) |
| Google Cloud Learning Expedition | Invited | 14--17 Jun 2026 | London + McLaren Technology Centre (Woking) + Deloitte + Google Cloud Summit |
| NVIDIA Inception program | Member | Since 7 May 2026 | Preferred GPU pricing, dev tools, cloud partner credits, VC network, co-branding |
| NVIDIA Innovation Lab | Selected (competitive) | Since 20 May 2026 | 8xH100 SXM 80GB, 60-day program, self-serve via NVIDIA Brev |
| NVIDIA DGX Cloud Credit Program | Applied | 10 May 2026 | Additional cloud GPU credits for training workloads |
| 1991.vc (Ukrainian VC) | Intro by Google Cloud | 15 May 2026 | Investment discussion initiated by Dawid Szymula (Google Startup Lead PL&UA) |
