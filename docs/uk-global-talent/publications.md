# Publications & Research Output

**Applicant**: Volodymyr Ovcharov
**Affiliation**: LEX AI LLC, Kyiv, Ukraine / V.M. Glushkov Institute of Cybernetics, National Academy of Sciences of Ukraine
**ORCID**: [0009-0002-3680-5081](https://orcid.org/0009-0002-3680-5081)
**Google Scholar**: [52aNqYcAAAAJ](https://scholar.google.com/citations?user=52aNqYcAAAAJ)
**Semantic Scholar**: [102999855](https://www.semanticscholar.org/author/102999855)

---

## A. Published on arXiv (3 papers, peer review pending)

All papers are sole-authored unless noted otherwise.

### A1. Tokenizer Fertility and Zero-Shot Performance of Foundation Models on Ukrainian Legal Text: A Comparative Study

- **arXiv**: [2605.14890](https://arxiv.org/abs/2605.14890) (cs.CL)
- **Date**: 14 May 2026 (v1), 18 May 2026 (v2)
- **Author**: Volodymyr Ovcharov (sole author)
- **Summary**: Benchmarks 7 foundation models from 5 providers on 273 validated Ukrainian court decisions. Demonstrates that tokenizer fertility varies 1.6x across models and that NVIDIA Nemotron Super 3 (120B) outperforms Mistral Large 3 (675B) at one-third the cost. Discovers that few-shot prompting degrades performance by up to 26 percentage points on morphologically rich languages.
- **Dataset released**: [overthelex/ukrainian-court-decisions](https://huggingface.co/datasets/overthelex/ukrainian-court-decisions) (927K court decisions for judgment prediction)
- **Venue target**: ACL / EMNLP

### A2. Automatic Construction of a Legal Citation Graph from 100 Million Ukrainian Court Decisions: Large-Scale Extraction, Topological Analysis, and Ontology-Driven Clustering

- **arXiv**: [2605.15362](https://arxiv.org/abs/2605.15362) (cs.CL, cs.DL, cs.IR)
- **Date**: 14 May 2026
- **Author**: Volodymyr Ovcharov (sole author)
- **Summary**: Constructs the first national-scale legal citation graph from 100M+ court decisions containing 502M citation edges. Presents topological analysis and ontology-driven clustering of Ukrainian legislation through court citation patterns. 15 pages, 7 figures, 2 tables.
- **Dataset released**: [overthelex/ua-court-citation-graph](https://huggingface.co/datasets/overthelex/ua-court-citation-graph)
- **Venue target**: CIKM / JURIX

### A3. Temporal Decay of Co-Citation Predictability: A 20-Year Statute Retrieval Benchmark from 396M Ukrainian Court Citations

- **arXiv**: [2605.17639](https://arxiv.org/abs/2605.17639) (cs.CL, cs.IR)
- **Date**: 17 May 2026
- **Author**: Volodymyr Ovcharov (sole author)
- **Summary**: Tests the assumption that co-citation structure provides stable retrieval signal. Constructs UA-StatuteRetrieval benchmark across 20 annual snapshots (2007-2026) of 396M codex citations from 101M court decisions. Finds Adamic-Adar MRR declines 33% on fixed articles and 47% under temporal split -- confirming genuine temporal decay.
- **Dataset released**: [overthelex/ua-statute-retrieval](https://huggingface.co/datasets/overthelex/ua-statute-retrieval)
- **Venue target**: EMNLP / SIGIR

---

## B. Complete manuscripts with PDF (6 papers, ready for arXiv submission)

### B1. Edit-Trace Oversight: Scalable Alignment Signal from Agentic Workflows

- **Directory**: `arxiv-paper`
- **Author**: Volodymyr Ovcharov (sole author)
- **Summary**: Demonstrates that edit-traces from production agentic workflows produce alignment signal that is denser, more outcome-predictive, and distributionally unlike conventional RLHF preference data. Based on 30,510 edit pairs, 2,892 sessions, and 1,579 attributed outcomes from a single-practitioner case study.
- **Venue target**: NeurIPS / ICML (alignment track)

### B2. From Ontology-Controlled Systems to Oversight-Controlled Training: Formal Foundations for Human-LLM Alignment Signal Validation

- **Directory**: `bridge-paper-cybernetics`
- **Author**: Volodymyr Ovcharov (sole author)
- **Summary**: Bridges classical ontology-controlled systems (Glushkov Institute tradition) with modern LLM alignment. Formalizes oversight signal validation using OWL 2 DL ontology, verified by HermiT reasoner.
- **Status**: Complete. Sent to Academician O.V. Palagin (NAS Ukraine) on 12 May 2026 for review.
- **Companion artifact**: [overthelex/oversight-ontology](https://github.com/overthelex/oversight-ontology) (OWL 2 DL ontology, SHOIQ formalization)
- **Venue target**: Cybernetics and Systems Analysis (NAS Ukraine) / FOIS

### B3. DefectRadar: Automated Detection of Definitional Defects in Legislation via Morpho-Semantic NLP Pipeline over 24,000 Ukrainian Laws

- **Directory**: `arxiv-defectradar`
- **Authors**: Volodymyr Ovcharov, Ihor Kyrychenko (independent legal researcher)
- **Summary**: Introduces legislative definition quality assessment (LegDefQA) task and DefectRadar pipeline. Applied to 5,799 definitions from 44,021 active Ukrainian laws, flags 32.4% as morphologically circular and 32.5% as relying on undefined terms. RAG-augmented GPT-4o judge reveals 85% of flagged cases are benign, yielding a true defect rate of ~3%.
- **Dataset released**: [overthelex/ua-defectradar](https://huggingface.co/datasets/overthelex/ua-defectradar)
- **Venue target**: JURIX / ICAIL
- **Product**: [defectradar.legal.org.ua](https://defectradar.legal.org.ua)

### B4. Temporal Dynamics of a Legal Citation Network at National Scale: Clarification, Consolidation, and Wartime Reorganization

- **Directory**: `arxiv-temporal-citation`
- **Author**: Volodymyr Ovcharov (sole author)
- **Summary**: First full-scale temporal analysis of a national legal citation network: 345M citation events from 33M Ukrainian court decisions (2007-2026), decomposed into five event-aligned periods.
- **Venue target**: Nature Scientific Reports / EPJ Data Science

### B5. Do LLM Judges Have a Recency Bias? Temporal Preference Shifts in Grounded Legal Evaluation

- **Directory**: `arxiv-temporal-judge-bias`
- **Author**: Volodymyr Ovcharov (sole author)
- **Summary**: Introduces temporal preference bias in LLM-as-a-judge evaluation. Uses 3,000 Ukrainian court decisions across three geopolitically defined epochs with ground-truth outcomes to construct a grounded judge evaluation protocol.
- **Venue target**: TACL

### B6. Workflow Memory for Long-Horizon Agentic Composition: Architecture, Dual-Mode Retrieval, and Retrieval-Correction Signal

- **Directory**: `arxiv-memory-paper`
- **Author**: Volodymyr Ovcharov (sole author)
- **Summary**: Addresses context waste in LLM coding agents (median 30,115 input tokens bootstrap cost, 60% waste ratio). Proposes dual-mode retrieval architecture with retrieval-correction signal. Based on 304 production sessions.
- **Venue target**: ICLR / COLM

---

## C. Manuscripts in progress (4 papers)

### C1. Temporal Concept Drift in Legal Judgment Prediction: Neural Baselines Across Three Epochs of Ukrainian Court Decisions

- **Directory**: `arxiv-temporal-drift`
- **Author**: Volodymyr Ovcharov (sole author)
- **Dataset released**: [overthelex/ua-temporal-drift](https://huggingface.co/datasets/overthelex/ua-temporal-drift) (428K decisions, 3 epochs)

### C2. The Tokenizer Tax Across 24 European Languages: Domain Invariance, Cross-Lingual Few-Shot Effects, and the Ukrainian Penalty

- **Directory**: `arxiv-fewshot-degradation`
- **Author**: Volodymyr Ovcharov (sole author)

### C3. The Distortion Hypothesis Is Wrong: A Random-Text Control Reveals That Representation Shift From Few-Shot Demonstrations Predicts Benefit, Not Harm

- **Directory**: `arxiv-fewshot-attention`
- **Author**: Volodymyr Ovcharov (sole author)

### C4. Representation Shift Predicts Few-Shot Benefit: Attention Analysis Across 12 Language Models and Two Architectures

- **Directory**: `arxiv-attention-analysis`
- **Author**: Volodymyr Ovcharov (sole author)
- **Dataset released**: [overthelex/attention-analysis-fewshot](https://huggingface.co/datasets/overthelex/attention-analysis-fewshot)

---

## D. Ukrainian-language paper

### D1. Архітектура персистентної пам'яті для довгострокових автономних місій з ротацією операторів: дворежимне витягування та сигнал корекції

- **Location**: `docs/mission-memory-paper/`
- **Author**: Овчаров В.О.
- **Language**: Ukrainian
- **Venue target**: Ukrainian journal / NAS Ukraine proceedings

---

## E. Dissertation (in progress)

**Title**: Методи забезпечення достовірності великих мовних моделей у правовій доменній області
(Methods for Ensuring Faithfulness of Large Language Models in the Legal Domain)

- **Institution**: V.M. Glushkov Institute of Cybernetics, National Academy of Sciences of Ukraine
- **Specialty**: 122 -- Computer Science
- **Status**: 5/6 chapters written (31 pages, 17 formal definitions)
- **Location**: `secondlayer-papers/dissertation/`

---

## F. Contribution to established benchmarks

### F1. LEXTREME Benchmark -- Ukrainian Court Decisions Subset (PR #16, merged)

- **Benchmark**: [joelniklaus/lextreme](https://huggingface.co/datasets/joelniklaus/lextreme) (Joel Niklaus, Bern University of Applied Sciences)
- **PR**: [#16 -- Add Ukrainian court decisions judgment prediction subset](https://huggingface.co/datasets/joelniklaus/lextreme/discussions/16)
- **Status**: **Merged** by @joelniklaus (owner), May 2026
- **Significance**: First Cyrillic-script / Ukrainian-language subset in LEXTREME
- **Data contributed**: 3 temporal configs (pre_war, hybrid_war, full_scale) totaling 428K decisions with chronological train/val/test splits reflecting Ukraine's judicial disruptions (2008-2013 baseline, 2014-2021 hybrid war with 40 courts offline, 2022-2026 martial law)
- **Review process**: 5+ iterations of review and refinement with benchmark owner

---

## G. HuggingFace Datasets (14 public datasets)

| # | Dataset | Records | Downloads | Created |
|---|---------|---------|-----------|---------|
| 1 | [ua-case-outcome-6m](https://huggingface.co/datasets/overthelex/ua-case-outcome-6m) | 6.7M decisions | 6.69M | 2026-05-20 |
| 2 | [ua-court-citation-graph](https://huggingface.co/datasets/overthelex/ua-court-citation-graph) | 502M edges | 2.38M | 2026-05-16 |
| 3 | [ukrainian-court-decisions](https://huggingface.co/datasets/overthelex/ukrainian-court-decisions) | 927K decisions | 927K | 2026-05-13 |
| 4 | [ua-temporal-drift](https://huggingface.co/datasets/overthelex/ua-temporal-drift) | 428K decisions | 856K | 2026-05-18 |
| 5 | [ua-court-sessions](https://huggingface.co/datasets/overthelex/ua-court-sessions) | 479K sessions | 479K | 2026-05-16 |
| 6 | [ua-case-outcome](https://huggingface.co/datasets/overthelex/ua-case-outcome) | 14.5K decisions | 14.5K | 2026-05-16 |
| 7 | [ua-defectradar](https://huggingface.co/datasets/overthelex/ua-defectradar) | 5.8K definitions | 5.8K | 2026-05-19 |
| 8 | [ua-statute-retrieval](https://huggingface.co/datasets/overthelex/ua-statute-retrieval) | 396M citations | 3.9K | 2026-05-17 |
| 9 | [oversight-constitution](https://huggingface.co/datasets/overthelex/oversight-constitution) | 2.9K sessions | 2.9K | 2026-05-14 |
| 10 | [ua-legal-bench](https://huggingface.co/datasets/overthelex/ua-legal-bench) | 13.4K predictions | -- | 2026-05-16 |
| 11 | [attention-analysis-fewshot](https://huggingface.co/datasets/overthelex/attention-analysis-fewshot) | 12 models | 73 | 2026-05-16 |
| 12 | [indian-court-decisions](https://huggingface.co/datasets/overthelex/indian-court-decisions) | 14.6M decisions | 22 | 2026-05-20 |
| 13 | [ukrainian-legal-citation-graph](https://huggingface.co/datasets/overthelex/ukrainian-legal-citation-graph) | citation stats | 66 | 2026-05-14 |
| 14 | [ua-legal-llm-dissertation](https://huggingface.co/datasets/overthelex/ua-legal-llm-dissertation) | dissertation | 22 | 2026-05-22 |

**HuggingFace Spaces**: 2 (ua-citation-graph explorer, LMAF legal consultation)

---

## H. Summary statistics

| Metric | Count |
|--------|-------|
| Published arXiv papers | 3 |
| Complete manuscripts (PDF ready) | 6 |
| Manuscripts in progress | 4 |
| Ukrainian-language papers | 1 |
| Dissertation chapters complete | 5/6 |
| Total research papers | 14 |
| Sole-authored papers | 13/14 (93%) |
| Public datasets released | 14 |
| Benchmark contributions (merged) | 1 (LEXTREME) |
| Total court decisions in datasets | 108M+ |
| Total citation edges in datasets | 502M+ |

---

## I. Research profiles

| Platform | Link | Status |
|----------|------|--------|
| ORCID | [0009-0002-3680-5081](https://orcid.org/0009-0002-3680-5081) | Active |
| Google Scholar | [52aNqYcAAAAJ](https://scholar.google.com/citations?user=52aNqYcAAAAJ) | Active, 3 papers claimed |
| Semantic Scholar | [102999855](https://www.semanticscholar.org/author/102999855) | Disambiguation requested |
| HuggingFace | [overthelex](https://huggingface.co/overthelex) | 14 datasets, 2 spaces |
| GitHub | [overthelex](https://github.com/overthelex) | 19 public repos |
| arXiv | [Volodymyr Ovcharov](https://arxiv.org/search/?query=Ovcharov&searchtype=author) | 3 papers |
