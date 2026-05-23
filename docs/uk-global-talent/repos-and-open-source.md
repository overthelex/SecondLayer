# Open-Source Contributions & Code Repositories

**Applicant**: Volodymyr Ovcharov
**GitHub**: [overthelex](https://github.com/overthelex) (19 public repositories)
**HuggingFace**: [overthelex](https://huggingface.co/overthelex) (14 datasets, 2 spaces)

---

## A. Primary Project: SecondLayer (LEX AI Platform)

### A1. SecondLayer Monorepo

- **Repository**: [overthelex/secondlayer](https://github.com/overthelex/secondlayer) (public, MIT license)
- **Description**: Full-stack AI legal analysis platform -- monorepo with MCP servers, React frontend, infrastructure
- **Language breakdown**: TypeScript (12.2M lines), Python (1.2M), Shell (610K), HTML (502K), Dart (463K), TeX (458K), JavaScript (320K), PLpgSQL (156K), R (75K), Go (15K)
- **Total commits**: 2,526 (17 Jan 2026 -- 23 May 2026, ~127 days)
- **Average**: ~20 commits/day
- **Merged pull requests**: 1,784
- **Contributors**: 5 (overthelex: 2,356 commits, dependabot: 101, shepherdvovkes: 21, teosoph: 11, mcvovkes-bit: 1)
- **Stars**: 1

#### What it contains:

| Component | Path | Description |
|-----------|------|-------------|
| MCP Backend | `mcp_backend/` | 76 AI-powered legal tools (court search, ECHR, citation graphs, OSINT, vault, billing) |
| MCP RADA | `mcp_rada/` | 4 tools for Ukrainian Parliament data (deputies, bills, legislation, voting) |
| MCP OpenReyestr | `mcp_openreyestr/` | 27 tools for business registry (2M legal entities, 6.8M sole traders) |
| Frontend | `lexwebapp/` | React 19, Vite, TailwindCSS -- chat interface with evidence panels |
| Shared Package | `packages/shared/` | LLM orchestration, cost tracking, auth, embeddings |
| Mobile | `mobile/` | Flutter app |
| Platform | `platform/` | Platform service frontend |
| Deployment | `deployment/` | Docker Compose, nginx, blue-green deploy scripts |
| Scripts | `scripts/` | Data pipelines, ML training, court data import |
| CI/CD | `.github/workflows/` | Automated blue-green deployment with self-healing agent |
| Tests | `tests/` | Playwright E2E tests |

#### Architecture highlights:

- **Triple transport system**: All MCP servers support stdio (Claude Desktop), HTTP API (web apps), SSE (remote MCP)
- **Unified gateway**: Aggregates 107 tools behind a single endpoint
- **5 authentication methods**: Password, Google OAuth, Authentik OIDC, Diia (Ukrainian national digital ID), WebAuthn/Passkeys
- **Blue-green deployment**: Automated CI/CD with zero-downtime deploys
- **169 SQL migrations**: Sustained product development over 127 days
- **Database**: 1.5 TB PostgreSQL with 101M court decisions, 502M citation edges, 44K legislation acts

### A2. SecondLayer Core (private)

- **Repository**: overthelex/secondlayer-core (private)
- **Description**: Proprietary AI pipeline -- chat orchestration, legal AI quality, billing, system prompts
- **Created**: 25 Mar 2026
- **Language**: TypeScript

### A3. SecondLayer Papers (private, with public artifacts)

- **Repository**: overthelex/secondlayer-papers (private)
- **Description**: Academic papers for LEX AI platform (14 papers, dissertation)
- **Created**: 20 May 2026
- **CI/CD**: Automated LaTeX compilation + fact-checker
- **Public artifacts**: All datasets and papers published on HuggingFace and arXiv

### A4. SecondLayer Agents

- **Repository**: [overthelex/secondlayer-agents](https://github.com/overthelex/secondlayer-agents) (public)
- **Description**: Multi-agent scaffolding for complex legal consultations over Ukrainian court decisions
- **Language**: Python
- **Created**: 20 May 2026

---

## B. Research Artifacts (Open-Source)

### B1. Oversight Ontology

- **Repository**: [overthelex/oversight-ontology](https://github.com/overthelex/oversight-ontology) (public)
- **Description**: OWL 2 DL ontology for domain constitution -- formal validation of edit-trace oversight signal (SHOIQ formalization)
- **Language**: Python (+ OWL)
- **Created**: 12 May 2026
- **Significance**: Companion artifact to the bridge paper (B2 in publications). Verified by HermiT OWL reasoner. Bridges classical Ukrainian cybernetics (Glushkov Institute) with modern LLM alignment.

### B2. DefectRadar

- **Repository**: [overthelex/defectradar](https://github.com/overthelex/defectradar) (public)
- **Description**: Landing page and interface for DefectRadar -- automated detection of definitional defects in legislation
- **Live**: [defectradar.legal.org.ua](https://defectradar.legal.org.ua)
- **Created**: 22 Apr 2026
- **Significance**: Companion to the DefectRadar paper. Analyzes 5,799 definitions from 44,021 Ukrainian laws.

---

## C. Developer Tools (Open-Source)

### C1. Switchamba

- **Repository**: [overthelex/switchamba](https://github.com/overthelex/switchamba) (public)
- **Description**: Automatic EN/RU/UA keyboard layout switching for GNOME Wayland with n-gram detection and auto-correction
- **Language**: Python
- **Stars**: 1
- **Created**: 11 Apr 2026
- **Significance**: Solves a practical problem for trilingual developers. Uses n-gram language detection to automatically switch keyboard layouts.

### C2. MCPTB (Thunderbird MCP Server)

- **Repository**: [overthelex/mcptb](https://github.com/overthelex/mcptb) (public)
- **Description**: Thunderbird MCP Server -- manage email from CLI via Model Context Protocol
- **Language**: Python
- **Created**: 22 Mar 2026
- **Significance**: One of the first MCP servers for email management. Enables AI agents to read, search, send, and manage email through Thunderbird.

### C3. Brev MCP

- **Repository**: [overthelex/brev-mcp](https://github.com/overthelex/brev-mcp) (public, Apache-2.0)
- **Description**: MCP server for NVIDIA Brev compute management
- **Language**: Python
- **Created**: 20 May 2026

### C4. BenderBot

- **Repository**: [overthelex/benderbot](https://github.com/overthelex/benderbot) (public)
- **Description**: Telegram bot with Bender's personality from Futurama. Powered by Claude on AWS Bedrock.
- **Language**: Python
- **Created**: 12 Apr 2026

### C5. AISisstant

- **Repository**: [overthelex/aisisstant](https://github.com/overthelex/aisisstant) (public)
- **Description**: Activity tracker agent for Ubuntu/GNOME -- tracks keyboard, mouse, window focus, microphone
- **Language**: Python
- **Created**: 16 Apr 2026

---

## D. Other Projects

### D1. AIShield

- **Repository**: [overthelex/aishield](https://github.com/overthelex/aishield) (public)
- **Description**: AI-powered drone detection and defense system documentation. Multi-sensor fusion (electro-optical + thermal + FMCW radar), automatic detection, classification, and kinetic neutralization. Edge computing on NVIDIA Jetson.
- **Created**: 2 Apr 2026
- **Context**: Defence tech project relevant to Ukraine's wartime needs

### D2. Merged

- **Repository**: [overthelex/merged](https://github.com/overthelex/merged) (public)
- **Description**: Technical Interview Disruptor (TID). Landing + portal for Ukrainian market.
- **Language**: TypeScript
- **Created**: 18 Apr 2026

### D3. Itihasa

- **Repository**: [overthelex/itihasa.highfunk.uk](https://github.com/overthelex/itihasa.highfunk.uk) (public)
- **Description**: Sanskrit-English parallel pairs for exegetical generation research
- **Language**: HTML
- **Created**: 16 May 2026
- **Significance**: Demonstrates breadth of NLP research interest beyond legal domain

---

## E. HuggingFace Datasets (14 public datasets)

All datasets are released under CC-BY-4.0 or CC-BY-NC-SA-4.0 licenses.

### Legal NLP Datasets (Ukrainian)

| # | Dataset | Size | Records | License | Paper |
|---|---------|------|---------|---------|-------|
| 1 | [ua-case-outcome-6m](https://huggingface.co/datasets/overthelex/ua-case-outcome-6m) | 1M-10M | 6.7M court decisions | CC-BY-4.0 | -- |
| 2 | [ua-court-citation-graph](https://huggingface.co/datasets/overthelex/ua-court-citation-graph) | 1M-10M | 502M citation edges | CC-BY-NC-SA-4.0 | arXiv:2605.15362 |
| 3 | [ukrainian-court-decisions](https://huggingface.co/datasets/overthelex/ukrainian-court-decisions) | 100K-1M | 927K decisions | CC-BY-4.0 | arXiv:2605.14890 |
| 4 | [ua-temporal-drift](https://huggingface.co/datasets/overthelex/ua-temporal-drift) | 100K-1M | 428K decisions | CC-BY-4.0 | -- |
| 5 | [ua-court-sessions](https://huggingface.co/datasets/overthelex/ua-court-sessions) | 100K-1M | 479K sessions | CC-BY-4.0 | -- |
| 6 | [ua-statute-retrieval](https://huggingface.co/datasets/overthelex/ua-statute-retrieval) | 1K-10K | 396M citations | CC-BY-NC-SA-4.0 | arXiv:2605.17639 |
| 7 | [ua-case-outcome](https://huggingface.co/datasets/overthelex/ua-case-outcome) | 10K-100K | 14.5K decisions | CC-BY-4.0 | -- |
| 8 | [ua-defectradar](https://huggingface.co/datasets/overthelex/ua-defectradar) | 1K-10K | 5.8K definitions | CC-BY-4.0 | -- |
| 9 | [ua-legal-bench](https://huggingface.co/datasets/overthelex/ua-legal-bench) | 10K-100K | 13.4K predictions | CC-BY-4.0 | -- |
| 10 | [ukrainian-legal-citation-graph](https://huggingface.co/datasets/overthelex/ukrainian-legal-citation-graph) | 1M-10M | citation statistics | CC-BY-4.0 | -- |

### Research Datasets

| # | Dataset | Size | Records | License | Paper |
|---|---------|------|---------|---------|-------|
| 11 | [attention-analysis-fewshot](https://huggingface.co/datasets/overthelex/attention-analysis-fewshot) | 1K-10K | 12 models | MIT | arXiv:2605.14890 |
| 12 | [oversight-constitution](https://huggingface.co/datasets/overthelex/oversight-constitution) | 1K-10K | 2.9K sessions | CC-BY-4.0 | -- |

### Multi-Jurisdiction Datasets

| # | Dataset | Size | Records | License |
|---|---------|------|---------|---------|
| 13 | [indian-court-decisions](https://huggingface.co/datasets/overthelex/indian-court-decisions) | 10M+ | 14.6M decisions | -- |
| 14 | [ua-legal-llm-dissertation](https://huggingface.co/datasets/overthelex/ua-legal-llm-dissertation) | -- | dissertation | CC-BY-4.0 |

### HuggingFace Spaces

| # | Space | SDK | Description |
|---|-------|-----|-------------|
| 1 | [ua-citation-graph](https://huggingface.co/spaces/overthelex/ua-citation-graph) | Gradio | Interactive co-citation network explorer from 99.5M court decisions |
| 2 | [lmaf](https://huggingface.co/spaces/overthelex/lmaf) | Gradio | Legal multi-agent framework for Ukrainian court decision consultation |

---

## F. Benchmark Contributions

### F1. LEXTREME (established Legal NLP benchmark)

- **Benchmark**: [joelniklaus/lextreme](https://huggingface.co/datasets/joelniklaus/lextreme)
- **Maintainer**: Joel Niklaus, Bern University of Applied Sciences
- **PR**: [#16 -- Add Ukrainian court decisions judgment prediction subset](https://huggingface.co/datasets/joelniklaus/lextreme/discussions/16) (merged)
- **Contribution**: First Cyrillic-script / Ukrainian-language subset in LEXTREME
- **Data**: 3 temporal configs (pre_war: 128K, hybrid_war: 150K, full_scale: 150K) with chronological splits
- **Methodology**: Temporal epochs reflecting Ukraine's judicial disruptions (2008-2013, 2014-2021 hybrid war, 2022-2026 martial law)
- **Review**: 5+ iterations with benchmark owner before merge

---

## G. Summary Statistics

| Metric | Count |
|--------|-------|
| **GitHub** | |
| Public repositories | 19 |
| Private repositories (with public artifacts) | 2 |
| Total commits (main repo) | 2,526 |
| Merged pull requests (main repo) | 1,784 |
| Development velocity | ~20 commits/day over 127 days |
| Languages used | 10 (TypeScript, Python, Shell, HTML, Dart, TeX, JS, PLpgSQL, R, Go) |
| SQL migrations shipped | 169 |
| MCP tools built | 107 |
| **HuggingFace** | |
| Public datasets | 14 |
| Interactive spaces | 2 |
| Total court decisions published | 22M+ (6.7M + 927K + 428K + 14.6M) |
| Total citation edges published | 502M+ |
| Benchmark contributions (merged) | 1 (LEXTREME) |
| **Open-source tools** | |
| MCP servers created | 3 (Thunderbird, Brev, Nextcloud) |
| Developer tools | 2 (Switchamba, AISisstant) |
| Research artifacts | 2 (Oversight Ontology, DefectRadar) |

---

## H. Development Timeline

```
Jan 2026  ████████░░░░  SecondLayer monorepo created (17 Jan)
Feb 2026  ████████████  Peak development (919 commits)
Mar 2026  ████████████  Peak development (976 commits), MCPTB created
Apr 2026  ██████░░░░░░  Switchamba, AIShield, BenderBot, DefectRadar
May 2026  ████████████  Research push: 14 datasets, 3 arXiv papers, LEXTREME PR,
                        Oversight Ontology, SecondLayer Agents, Brev MCP
```

Total: **2,526 commits** in **127 days** across **19 public repositories**, producing a **107-tool AI legal platform**, **14 research datasets**, and **3 published papers**.
