# UK Global Talent Visa -- Evidence Bundle

**Applicant**: Volodymyr Valentynovych Ovcharov
**Date of birth**: 22 December 1977
**Nationality**: Ukrainian
**Applying under**: Exceptional Talent (digital technology)
**Endorsing body**: Tech Nation (now DSIT / UKRI pathway)
**Date prepared**: 23 May 2026

---

## Table of Contents

1. [Personal Statement](#1-personal-statement)
2. [Mandatory Criteria: Recognition as a Leading Talent](#2-mandatory-criteria)
3. [Qualifying Criteria: Significant Contributions](#3-qualifying-criteria)
4. [Evidence Pieces (10 items)](#4-evidence-pieces)
5. [Letters of Recommendation](#5-letters-of-recommendation)
6. [Appendices](#6-appendices)

---

## 1. Personal Statement

See: [personal-statement.md](personal-statement.md) (full text)

**Summary**: 48-year-old Ukrainian software engineer, AI researcher, and entrepreneur. 25+ years in computer science. Master's in Computational Science (KPI, 2001). PhD candidate at V.M. Glushkov Institute of Cybernetics (NAS Ukraine). Founder & CEO of LEX AI LLC -- AI-powered legal platform processing 100M+ court decisions across 12 jurisdictions. Prior: startup exit (AVOX, VoIP -- Startup Sauna 2016 winner, acquired), 2x CTO in Seoul (30-person team, OCaml/Haskell/Polkadot), Toptal (top 3%). Currently training Qwen 2.5-14B on 161B legal tokens on 8xH100 (NVIDIA Innovation Lab).

---

## 2. Mandatory Criteria: Recognition as a Leading Talent

*"The applicant has been recognised as a leading talent in the digital technology sector by a government body, a well-known and established tech company, or academic institution."*

| # | Recognition | From | Date | Evidence |
|---|------------|------|------|----------|
| MC1 | NVIDIA Inception programme membership | NVIDIA Corporation | 7 May 2026 | Email: "Congratulations - Welcome to the NVIDIA Inception program" |
| MC2 | NVIDIA Innovation Lab selection (8xH100, 60 days, competitive) | NVIDIA Corporation | 20 May 2026 | Email: "We're excited to confirm your selection for the NVIDIA Innovation Lab Program" |
| MC3 | Google Cloud dedicated Startup Territory Lead (5-person team) | Google Cloud | 14 Apr 2026 | Email thread: "Your projects look great and are more than happy to support you" |
| MC4 | Google Cloud + Deloitte Learning Expedition invitation (London) | Google Cloud / Deloitte | 4 May 2026 | Letter: "Selected as a representative of a leading enterprise from the Central Europe region" |
| MC5 | AWS Activate credits + 2 dedicated Account Managers | Amazon Web Services | 10 Apr 2026 | Emails from Riccardo Vita + Ricardo Bonomi |
| MC6 | Startup World Cup regional finalist | Startup World Cup | May 2026 | Finalist selection for UNIT.City Kyiv (28 May 2026) |
| MC7 | Startup Sauna 2016 winner (Helsinki, Finland) | Startup Sauna / Aalto University | 2016 | AVOX VoIP startup |
| MC8 | startup.ua 2014 winner | startup.ua | 2014 | AVOX VoIP startup |
| MC9 | Toptal acceptance (top 3% of global developers) | Toptal | Feb 2021 | LinkedIn profile |
| MC10 | PhD candidacy at NAS Ukraine | V.M. Glushkov Institute of Cybernetics | 2022 | Dissertation in progress (5/6 chapters) |

---

## 3. Qualifying Criteria: Significant Contributions

*"The applicant has made significant technical, commercial, or entrepreneurial contributions to the field as a founder, senior executive, board member, or employee of a product-led digital technology company."*

### QC1: Innovation -- novel technical architecture

Built LEX AI from scratch in 127 days: 107 AI tools, MCP architecture with triple transport, unified gateway across 3 services, 5 authentication methods, blue-green CI/CD with self-healing agent. Processes the largest open court decisions corpus in Europe (100.9M decisions, 1.4 TB).

### QC2: Research -- 14 papers, 93% sole-authored

3 arXiv papers published (May 2026), 6 manuscripts with PDF ready, 4 in progress, 1 Ukrainian-language paper. Contributed first Cyrillic subset to LEXTREME benchmark (merged). Research spans tokenizer analysis, citation graphs (502M edges), temporal decay in retrieval, LLM judge bias, alignment from edit-traces, formal ontology.

### QC3: Open data -- 14 HuggingFace datasets

Released the largest publicly available legal NLP datasets for any non-English jurisdiction: 6.7M court decisions, 502M citation edges, 14.6M Indian decisions, 428K temporal-split decisions, and more. All under CC-BY-4.0 or CC-BY-NC-SA-4.0 licenses.

### QC4: ML training -- 92 runs across H100 and A10G

Active experiments on MLflow: CPT on 161B tokens (Qwen 2.5-14B, 8xH100), DPO (83.6% reward accuracy), temporal drift (catastrophic forgetting confirmed), cross-jurisdiction transfer (6 experiments). Total: 9 experiments, 500+ GPU hours.

### QC5: Commercial traction

84 registered users, 42 paying, $1,711 user spend, $5,219 in user balances. 9,061 tracked API requests. Revenue-generating product in production.

### QC6: Prior startup exit

AVOX (VoIP) co-founded, won Startup Sauna 2016 + startup.ua 2014, acquired by VoIP company.

---

## 4. Evidence Pieces (10 items)

### Evidence 1: Published research papers (arXiv)

**What it proves**: QC2 (research contributions), MC10 (academic recognition)

Three sole-authored papers published on arXiv in cs.CL and cs.IR (14-17 May 2026):

| Paper | arXiv ID | Key finding |
|-------|----------|-------------|
| Tokenizer Fertility and Zero-Shot Performance on Ukrainian Legal Text | 2605.14890 | Few-shot degrades performance by up to 26pp on morphologically rich languages |
| Automatic Construction of a Legal Citation Graph from 100M Court Decisions | 2605.15362 | Largest legal citation graph ever reported: 502M edges |
| Temporal Decay of Co-Citation Predictability (20-Year Statute Retrieval) | 2605.17639 | Co-citation retrieval signal decays 33-47% over 20 years |

Six additional manuscripts with completed PDFs ready for submission:
- Edit-Trace Oversight (alignment signal, DPO experiments)
- From Ontology-Controlled Systems to Oversight-Controlled Training (formal OWL 2 DL)
- DefectRadar (legislative defect detection, co-authored with I. Kyrychenko)
- Temporal Dynamics of a Legal Citation Network at National Scale
- Do LLM Judges Have a Recency Bias? (temporal preference shifts)
- Workflow Memory for Long-Horizon Agentic Composition

**Verifiable at**: [arxiv.org/search/?query=Ovcharov&searchtype=author](https://arxiv.org/search/?query=Ovcharov&searchtype=author)

**Supporting doc**: [publications.md](publications.md)

---

### Evidence 2: HuggingFace datasets and LEXTREME benchmark contribution

**What it proves**: QC3 (open data), QC2 (research)

14 public datasets released on HuggingFace under overthelex:

| Dataset | Scale | License |
|---------|-------|---------|
| ua-case-outcome-6m | 6.7M court decisions | CC-BY-4.0 |
| ua-court-citation-graph | 502M citation edges | CC-BY-NC-SA-4.0 |
| ukrainian-court-decisions | 927K decisions | CC-BY-4.0 |
| ua-temporal-drift | 428K decisions (3 wartime epochs) | CC-BY-4.0 |
| indian-court-decisions | 14.6M decisions | -- |
| + 9 more | various | CC-BY-4.0 |

LEXTREME PR #16 -- first Ukrainian/Cyrillic-script subset, merged by Joel Niklaus (Bern University).

**Verifiable at**: [huggingface.co/overthelex](https://huggingface.co/overthelex), [huggingface.co/datasets/joelniklaus/lextreme/discussions/16](https://huggingface.co/datasets/joelniklaus/lextreme/discussions/16)

**Supporting doc**: [publications.md](publications.md) section G

---

### Evidence 3: NVIDIA Inception + Innovation Lab

**What it proves**: MC1, MC2 (industry recognition)

- **Inception**: Approved 7 May 2026. Benefits: preferred GPU pricing, AI dev tools, cloud partner credits, VC network, co-branded marketing.
- **Innovation Lab**: Competitively selected 20 May 2026. 8xH100 SXM 80GB (640GB VRAM), 60-day programme, self-serve via NVIDIA Brev. "This program receives a high number of applicants globally."
- **DGX Cloud Credit Programme**: Applied 10 May 2026, under review.
- Currently training Qwen 2.5-14B on 161B tokens on the Innovation Lab H100 node.

**Evidence emails**:
- `nvidia/uid-16` -- Inception approval
- `INBOX/uid-4810` -- Innovation Lab approval
- `nvidia/uid-7` -- DGX Cloud Credit application

**Supporting doc**: [partnership-evidence.md](partnership-evidence.md) section A

---

### Evidence 4: Google Cloud partnership and London invitation

**What it proves**: MC3, MC4 (industry recognition), QC5 (commercial traction)

**Dedicated support team** led by Dawid Szymula (Startup Territory Lead, Poland & Ukraine, Google Cloud). Five additional Google employees on CC (Dana Baranes-O'Hara, Maciej Lasota, Volha Borzych, Susana Bochenek, Paulina Koriat). 18+ emails in the thread since April 2026.

**Key engagements**:
- $350,000 Google for Startups Cloud Programme (application in progress, Dawid escalating internally)
- Official invitation to Learning Expedition by Deloitte & Google Cloud (London, 14-17 June 2026) -- McLaren Technology Centre, Deloitte Shoe Lane Studios, Google Cloud Summit. "Selected as a representative of a leading enterprise from the Central Europe region" across 19 countries.
- Personal introduction to 1991.vc (Ukrainian VC fund) for investment discussion
- arXiv endorsement support via Google Research contacts
- Offered to write letter of support for Startup World Cup pitch

**Evidence emails**:
- `google/uid-6` -- Official London invitation letter (4 May 2026)
- `google/uid-8` -- RSVP Learning Expedition (30 Apr 2026)
- `google/uid-2` -- 1991.vc introduction (15 May 2026)
- `INBOX/uid-4876` -- SWC congratulations + support offer (22 May 2026)

**Supporting doc**: [partnership-evidence.md](partnership-evidence.md) section B

---

### Evidence 5: AWS partnership and ML roadmap

**What it proves**: MC5 (industry recognition), QC4 (ML training)

**Two dedicated account managers**: Riccardo Vita (Cloud Representative, from March 2026) and Ricardo Bonomi (Account Manager, from May 2026).

**Key engagements**:
- $25,000 Activate credits approved (10 Apr 2026), capacity up to $100,000 via Portfolio programme
- Video call with Riccardo discussing ML roadmap (30 Mar 2026)
- 12-month ML training roadmap ($195-265K) shared and acknowledged -- "building a Harvey.ai-equivalent for Ukrainian law"
- Ricardo personally escalated SageMaker GPU quota for DPO training experiments
- Riccardo: "you can get up to 100,000$ in AWS credits"

**Evidence emails**:
- `aws-team/uid-8` -- Post-call follow-up + $100K info (30 Mar 2026)
- `aws-team/uid-2` -- Full ML roadmap (20 Apr 2026)
- `INBOX/uid-3405` -- Credits approved (10 Apr 2026)
- `aws-team/uid-10` -- GPU quota escalation (11 May 2026)

**Supporting doc**: [partnership-evidence.md](partnership-evidence.md) section C

---

### Evidence 6: Product metrics -- LEX AI platform

**What it proves**: QC1 (innovation), QC5 (commercial traction)

| Metric | Value |
|--------|-------|
| Registered users (production) | 84 |
| Paying users | 42 |
| User spend (USD) | $1,711.15 |
| User balances (USD) | $5,218.63 |
| API requests tracked | 9,061 |
| AI tokens consumed | 129.5M |
| MCP tools | 107 (76 + 4 + 27) |
| Court decisions indexed | 100,907,008 |
| Citation edges | 502,141,952 |
| Legislation acts (full text) | 569 |
| Courts | 843 |
| Active judges | 5,952 |
| Database size | 1,403 GB |
| Jurisdictions served | 12 |
| Authentication methods | 5 (password, Google, OIDC, Diia, WebAuthn) |
| SQL migrations shipped | 169 |
| CI/CD | Automated blue-green with self-healing agent |

**Verifiable at**: [legal.org.ua](https://legal.org.ua), [status.legal.org.ua](https://status.legal.org.ua)

**Supporting doc**: [product-metrics.md](product-metrics.md)

---

### Evidence 7: ML training experiments (MLflow)

**What it proves**: QC4 (ML training at scale)

9 experiments, 92 training runs, 500+ GPU hours. MLflow tracking server at mlflow.legal.org.ua.

| Experiment | Model | Hardware | Key result |
|-----------|-------|----------|------------|
| CPT (exp 5) | Qwen 2.5-14B | 8xH100 (NVIDIA Brev) | 161B tokens, loss 0.25, running |
| DPO (exp 2) | Llama 3.1-8B | ml.g5.12xlarge (SageMaker) | 83.6% reward accuracy (edit-trace) vs 50.3% (random) |
| Temporal drift (exp 1) | xlm-roberta-large | A10G (SageMaker) | Catastrophic forgetting: -12 F1 points across epochs |
| Cross-jurisdiction (exp 6-13) | xlm-roberta-base | A10G (SageMaker) | Zero-shot transfer drops 37% across jurisdictions |

**Data pipeline**: 8-stage automated (export > clean > dedup > filter > structure > tokenize > package > S3). Corpus: 33.9M court decisions (after dedup from 38.5M), 161.42B tokens.

**Supporting doc**: [product-metrics.md](product-metrics.md) section C

---

### Evidence 8: GitHub repositories and development velocity

**What it proves**: QC1 (innovation), open-source contribution

| Metric | Value |
|--------|-------|
| Public repositories | 19 |
| Total commits (main repo) | 2,526 |
| Merged pull requests | 1,784 |
| Development period | 127 days (17 Jan -- 23 May 2026) |
| Average commits/day | ~20 |
| Programming languages | 10 (TypeScript, Python, Shell, HTML, Dart, TeX, JS, PLpgSQL, R, Go) |

Key repositories: SecondLayer (platform monorepo, MIT), oversight-ontology (OWL 2 DL), defectradar (legislation analysis), mcptb (Thunderbird MCP server), switchamba (trilingual keyboard switcher).

**Verifiable at**: [github.com/overthelex](https://github.com/overthelex)

**Supporting doc**: [repos-and-open-source.md](repos-and-open-source.md)

---

### Evidence 9: CV / Resume

**What it proves**: Career trajectory, leadership experience

| Period | Role | Organisation | Location |
|--------|------|-------------|----------|
| 2026 | Founder, CEO, AI Researcher | LEX AI LLC | Kyiv |
| 2022-2025 | PhD candidate | Glushkov Institute, NAS Ukraine | Kyiv |
| 2021 | Software Engineer (top 3%) | Toptal | Remote |
| 2019-2020 | CTO | RioDeFi (Polkadot/Web3) | Seoul |
| 2018-2019 | CTO (30 engineers) | Paxnet (blockchain, OCaml/Haskell) | Seoul |
| 2014-2018 | Co-Founder | AVOX (VoIP, acquired) | Kyiv |
| 2011-2014 | Researcher | Glushkov Institute (ontology, knowledge graphs) | Kyiv |
| 1996-2001 | Master's, Computational Science | KPI | Kyiv |

**Education**: Master's in Computational Science (KPI, 2001). PhD candidate, Computer Science, specialty 122 (Glushkov Institute, NAS Ukraine, ongoing).

**Source**: LinkedIn PDF export (4 pages)

---

### Evidence 10: Startup World Cup + prior competition wins

**What it proves**: MC6, MC7, MC8 (recognition as leading talent), QC6 (entrepreneurial contribution)

| Competition | Year | Result | Location |
|------------|------|--------|----------|
| Startup World Cup regional final | 2026 | Finalist (28 May) | UNIT.City, Kyiv |
| Startup Sauna | 2016 | Winner | Helsinki, Finland |
| startup.ua | 2014 | Winner | Ukraine |

SWC regional winner advances to $1M Grand Finale in San Francisco (November 2026).

Google Cloud's Dawid Szymula congratulated and offered to write a letter of support (email 22 May 2026).

---

## 5. Letters of Recommendation

*Three letters required. Recommended sources:*

| # | Recommender | Organisation | Relationship | Status |
|---|-----------|-------------|-------------|--------|
| 1 | **Dawid Szymula** | Google Cloud (Startup Territory Lead, PL & UA) | Google Cloud partner; invited to London; intro to 1991.vc | To request -- offered support in email 22 May 2026 |
| 2 | **Ricardo Bonomi** | AWS (Account Manager, Startups) | AWS account manager; approved credits; ML roadmap support | To request |
| 3 | **Joel Niklaus** | Bern University of Applied Sciences | LEXTREME benchmark owner; merged PR #16; academic peer | To request |

**Alternative recommenders**:
- Academician O.V. Palagin (NAS Ukraine) -- bridge paper reviewer, academic supervisor
- Elizabeth / NVIDIA Inception team -- can provide standard Inception confirmation letter
- Riccardo Vita (AWS Cloud Rep) -- first AWS contact, ML roadmap discussions

---

## 6. Appendices

### A. Research profiles

| Platform | URL |
|----------|-----|
| ORCID | [0009-0002-3680-5081](https://orcid.org/0009-0002-3680-5081) |
| Google Scholar | [scholar.google.com/citations?user=52aNqYcAAAAJ](https://scholar.google.com/citations?user=52aNqYcAAAAJ) |
| Semantic Scholar | [semanticscholar.org/author/102999855](https://www.semanticscholar.org/author/102999855) (disambiguation requested) |
| HuggingFace | [huggingface.co/overthelex](https://huggingface.co/overthelex) |
| GitHub | [github.com/overthelex](https://github.com/overthelex) |
| arXiv | [arxiv.org/search/?query=Ovcharov](https://arxiv.org/search/?query=Ovcharov&searchtype=author) |
| LinkedIn | [linkedin.com/in/vladimir-ovcharov](https://www.linkedin.com/in/vladimir-ovcharov) |

### B. Live URLs

| Service | URL |
|---------|-----|
| LEX AI Platform | [legal.org.ua](https://legal.org.ua) |
| Platform API | [platform.legal.org.ua](https://platform.legal.org.ua) |
| DefectRadar | [defectradar.legal.org.ua](https://defectradar.legal.org.ua) |
| Status / Uptime | [status.legal.org.ua](https://status.legal.org.ua) |
| MLflow | [mlflow.legal.org.ua](https://mlflow.legal.org.ua) |
| Blog | [legal.org.ua/blog](https://legal.org.ua/blog) |

### C. Partnership value summary

| Partner | Programme | Value | Status |
|---------|----------|-------|--------|
| NVIDIA | Inception membership | Preferred pricing, dev tools, VC network | Active |
| NVIDIA | Innovation Lab (8xH100, 60 days) | ~$32,000 compute | Active |
| NVIDIA | DGX Cloud Credit Programme | TBD | Applied |
| Google Cloud | Google for Startups (GFS) | $350,000 credits | In progress |
| Google Cloud | Learning Expedition (London) | Invitation-only event | Confirmed |
| Google Cloud | 1991.vc VC introduction | Investment discussion | Initiated |
| AWS | Activate Portfolio | Up to $100,000 credits ($25K active) | Active |
| AWS | Dedicated Account Manager | Technical support, quota escalation | Active |
| **Total** | | **~$482,000+** | |

### D. Key email evidence (for assessor verification)

| # | Subject | From | Date | Folder/UID |
|---|---------|------|------|-----------|
| 1 | Congratulations - Welcome to NVIDIA Inception | inceptionprogram@nvidia.com | 7 May 2026 | nvidia/16 |
| 2 | NVIDIA Innovation Lab Program Approval | nv-innovation-lab@nvidia.com | 20 May 2026 | INBOX/4810 |
| 3 | Official invitation for Learning Expedition | dawidszymula@google.com | 4 May 2026 | google/6 |
| 4 | RSVP Invitation: Learning Expedition by Deloitte & Google Cloud | dawidszymula@google.com | 30 Apr 2026 | google/8 |
| 5 | Re: Google Cloud Support for Legal.org.ua | dawidszymula@google.com | 14 Apr 2026 | google/18 |
| 6 | Lex AI intro to 1991 vc | dawidszymula@google.com | 15 May 2026 | google/2 |
| 7 | Re: LEX AI -- Startup World Cup finalist + quick asks | dawidszymula@google.com | 22 May 2026 | INBOX/4876 |
| 8 | Your AWS Activate Credits are approved | no-reply@startups.aws | 10 Apr 2026 | INBOX/3405 |
| 9 | AWS Riccardo - Thanks for the Call | vriccard@amazon.es | 30 Mar 2026 | aws-team/8 |
| 10 | Your AWS Activate credits -- quick intro | bonomiri@amazon.es | 8 May 2026 | aws-team/12 |
| 11 | Re: Your AWS Activate credits -- SageMaker GPU quota | bonomiri@amazon.es | 11 May 2026 | aws-team/10 |
| 12 | RE: legal.org.ua -- ML Training Roadmap on AWS | vriccard@amazon.es | 20 Apr 2026 | aws-team/2 |

### E. Verifiable named contacts

| Name | Title | Organisation | Email |
|------|-------|-------------|-------|
| Dawid Szymula | Startup Territory Lead, Poland & Ukraine | Google Cloud | dawidszymula@google.com |
| Dana Baranes-O'Hara | Google Cloud team | Google Cloud | danaboh@google.com |
| Maciej Lasota | Google Cloud team | Google Cloud | maciejlasota@google.com |
| Jiří Sauer | Regional CE Technology Fast 50 Leader | Deloitte | cefast50@deloittece.com |
| Riccardo Vita | Cloud Representative / Senior MRC Rep | AWS | vriccard@amazon.es |
| Ricardo Bonomi | Account Manager, Startups | AWS | bonomiri@amazon.es |
| Joel Niklaus | Researcher (LEXTREME benchmark owner) | Bern University | -- |
| O.V. Palagin | Academician | NAS Ukraine, Institute of Cybernetics | -- |
| Oksana Izakova | VC | 1991.vc | oksana.izakova@1991.vc |

---

## Document checklist

| # | Document | File | Pages | Status |
|---|----------|------|-------|--------|
| 1 | Personal Statement | personal-statement.md | ~4 | Done |
| 2 | Publications & Research Output | publications.md | ~5 | Done |
| 3 | Open-Source & Repositories | repos-and-open-source.md | ~4 | Done |
| 4 | Product Metrics & ML Training | product-metrics.md | ~5 | Done |
| 5 | Partnership & Industry Recognition | partnership-evidence.md | ~5 | Done |
| 6 | Evidence Bundle (this document) | evidence-bundle.md | ~6 | Done |
| 7 | CV / Resume | LinkedIn PDF | 4 | Done |
| 8 | Letter of Recommendation #1 | -- | 1 | To request (Dawid Szymula) |
| 9 | Letter of Recommendation #2 | -- | 1 | To request (Ricardo Bonomi) |
| 10 | Letter of Recommendation #3 | -- | 1 | To request (Joel Niklaus) |
| 11 | ORCID profile | online | -- | Created |
| 12 | Google Scholar profile | online | -- | Created |
| 13 | Semantic Scholar disambiguation | online | -- | Requested |
