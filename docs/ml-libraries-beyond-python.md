# Бiблiотеки та датасети для ML/NLP поза Python

Огляд бiблiотек та публiчних датасетiв у 5 мовних доменах (R, Julia, Rust, Java/Scala, C++/MATLAB), релевантних до двох напрямкiв дослiдження:

1. **Академiчнi статтi** -- edit-trace oversight, workflow memory, tokenizer fertility, few-shot degradation, citation graph, OWL ontology, mission memory
2. **Взаємодiя оператора з LLM** -- RLHF/preference modeling, edit traces, formal verification, trust calibration, cognitive load

---

## Змiст

- [R](#r)
- [Julia](#julia)
- [Rust](#rust)
- [Java / Scala](#java--scala)
- [C++ / MATLAB](#c--matlab)
- [Датасети (крос-мовнi)](#датасети-крос-мовнi)
- [Топ-знахiдки по унiкальностi](#топ-знахiдки-по-унiкальностi)

---

## R

### Статтi

| Тема | Пакет | Опис |
|------|-------|------|
| Edit-Trace Oversight | **bupaR** + edeaR + heuristicsmineR | Process mining для event logs -- edit traces як процесні моделі |
| Edit-Trace Oversight | **irr** | Inter-rater reliability: Cohen's Kappa, Krippendorff's alpha |
| Edit-Trace Oversight | changepoint, strucchange | Детекцiя структурних зрушень у correction rates |
| Workflow Memory | **text2vec** | GloVe embeddings, cosine similarity -- dual-mode retrieval |
| Workflow Memory | word2vec, GitAI | Embeddings та RAG workflows в R |
| Workflow Memory | SimDesign | Monte Carlo для evaluation of retrieval accuracy |
| Tokenizer Fertility | **udpipe** | Українська модель для POS/lemma/morpho -- ground truth для fertility |
| Tokenizer Fertility | quanteda (v4) | ICU-compliant tokenization, lexical diversity |
| Tokenizer Fertility | tokenizers, tidytext | Word-level tokenization та TF-IDF |
| Few-Shot Degradation | **udpipe** | Моделi для uk, pl, cz, sk, hr, sr, bg |
| Few-Shot Degradation | koRpus | Lexical diversity indices (TTR, MTLD, HD-D) |
| Few-Shot Degradation | stringdist | Approximate string matching (Levenshtein, Jaro-Winkler) |
| Citation Graph | **igraph** | Louvain, Leiden, PageRank, betweenness, degree centrality |
| Citation Graph | **poweRlaw** | Power-law fitting (Clauset, Shalizi & Newman 2009) |
| Citation Graph | leidenAlg, leidenbase | Standalone Leiden для великих графiв |
| Citation Graph | bibliometrix | Co-citation networks, bibliographic coupling, biblioshiny UI |
| Citation Graph | tidygraph + ggraph | Tidy interface до графiв + grammar of graphics для мереж |
| OWL Ontology | **ontologyIndex** (ontologyX) | OWL/OBO парсинг, iєрархiї, ancestors/descendants |
| OWL Ontology | ontologySimilarity | Resnik/Lin semantic similarity |
| OWL Ontology | rdflib, sparqlr, SPARQL | RDF triples, SPARQL queries |
| Mission Memory | **survival** | Memory decay як survival process (Kaplan-Meier, Cox) |
| Mission Memory | Rbeast | Bayesian time series decomposition (trend + changepoints) |
| Cross-cutting | lme4 | Mixed-effects models (всi експерименти) |
| Cross-cutting | yardstick, MLmetrics | Classification metrics (F1, accuracy, AUC) |
| Cross-cutting | ggplot2 | Publication-quality figures |

### Взаємодiя оператора з LLM

| Тема | Пакет | Опис |
|------|-------|------|
| Preference Modeling | **BradleyTerry2** | Статистична модель за Chatbot Arena Elo rankings |
| Preference Modeling | prefmod | Log-linear Bradley-Terry для pairwise + ratings |
| Preference Modeling | elo | Flexible Elo rating system |
| Trust Calibration | **brms** | Bayesian multilevel regression via Stan |
| Trust Calibration | ordinal | CLM/CLMM для Likert-scale trust ratings |
| Trust Calibration | CalibrationCurves | Reliability diagrams, calibration slope |
| Psychometrics | **psych** | Cronbach's alpha, factor analysis, NASA-TLX |
| Psychometrics | mirt | Multidimensional IRT (annotator ability + item difficulty) |
| Psychometrics | ltm | Rasch, 2PL, 3PL latent trait models |
| Signal Detection | sensR, psycho | d-prime, beta, ROC/AUC -- operator discrimination |
| Conversation Analytics | **TraMineR** | State sequence analysis -- interaction pattern typologies |
| Conversation Analytics | quanteda, tidytext | Turn-level sentiment та vocabulary analysis |
| Edit Traces | stringdist | 8 метрик вiдстанi (Levenshtein, Jaro-Winkler, q-gram) |
| Edit Traces | diffobj | Word-level diffs з colorized output |
| Edit Traces | textreuse | Smith-Waterman alignment, MinHash |
| LLM API | ellmer | Tidyverse пакет для LLM APIs (Hadley Wickham) |
| LLM API | tidyllm | Tidy pipe-friendly interface до Claude/OpenAI/Gemini |
| HF Datasets | arrow + jsonlite | Parquet/JSONL reader для всiх HF datasets |
| Experimental Design | afex | Factorial ANOVA (between/within/mixed) |
| Experimental Design | pwr, pwrss | Power analysis для планування експериментiв |

---

## Julia

### Статтi

| Тема | Пакет | Опис |
|------|-------|------|
| Edit-Trace Oversight | **Agents.jl** | ABM framework -- симуляцiя multi-agent oversight |
| Edit-Trace Oversight | PromptingTools.jl | LLM API wrapper (OpenAI, Anthropic, Ollama) |
| Edit-Trace Oversight | MLJ.jl | 200+ моделей, cross-validation, metrics |
| Workflow Memory | **RAGTools.jl** | RAG toolkit -- dual-mode retrieval (embedding + keyword) |
| Workflow Memory | JLD2.jl, JLSO.jl | Persistent state serialization (HDF5-compatible) |
| Workflow Memory | LLMTextAnalysis.jl | Thematic memory organization via LLM embeddings |
| Tokenizer Fertility | **BytePairEncoding.jl** | Нативний BPE: tiktoken (o200k, cl100k, p50k) в Julia |
| Tokenizer Fertility | Transformers.jl | HuggingFace tokenizers (BERT WordPiece, GPT-2 BPE, T5 SP) |
| Tokenizer Fertility | WordTokenizers.jl | Rule-based baseline word tokenization |
| Few-Shot Degradation | Embeddings.jl | FastText для uk/pl/cz (100+ мов) |
| Few-Shot Degradation | Languages.jl + Snowball.jl | Stemming для аналiзу морфологiї |
| Citation Graph | **Graphs.jl** | Core graph algorithms (BFS, DFS, components, centrality) |
| Citation Graph | **SuiteSparseGraphBLAS.jl** | GraphBLAS -- 10x faster з multi-threading для 100M |
| Citation Graph | CommunityDetection.jl | Louvain, label propagation |
| Citation Graph | MetaGraphsNext.jl | Type-safe metadata на вершинах/ребрах |
| Citation Graph | SNAPDatasets.jl | Stanford SNAP датасети для benchmarking |
| Citation Graph | SGtSNEpi.jl | t-SNE embedding для великих sparse графiв |
| OWL Ontology | **Catlab.jl** | Category theory -- OWL hierarchies як categorical structures |
| OWL Ontology | Serd.jl, RDF.jl | RDF парсинг (N-Triples, Turtle) |
| Mission Memory | DifferentialEquations.jl | ODE/SDE для моделювання memory decay curves |
| Mission Memory | DiffEqFlux.jl | Neural ODEs для learning dynamics з данних |
| Cross-cutting | DataFrames.jl + CSV.jl | High-perf tabular data (multi-threaded CSV) |
| Cross-cutting | Makie.jl | Publication-quality plotting |
| Cross-cutting | HypothesisTests.jl | Статистична значущiсть |

### Взаємодiя оператора з LLM

| Тема | Пакет | Опис |
|------|-------|------|
| RLHF | ReinforcementLearning.jl | PPO, DQN, DDPG -- RL backbone для RLHF |
| RLHF | **POMDPs.jl** | POMDP -- оператор має partial observability intent |
| Bayesian Modeling | **Turing.jl** | Probabilistic programming (NUTS, HMC, VI) |
| Bayesian Modeling | **Gen.jl** | Programmable inference, custom MCMC kernels |
| Bayesian Modeling | **GenGPT3.jl** | LLM output як random variable в Gen.jl |
| Active Inference | **ActiveInference.jl** | Оператор як active inference agent (free energy principle) |
| Edit Distance | StringDistances.jl | Levenshtein + fuzzywuzzy-style modifiers |
| Edit Distance | Edlib.jl | High-perf alignment з CIGAR output |
| Changepoint Detection | Changepoints.jl | PELT + Binary Segmentation для operator behavior shifts |
| HMM | HiddenMarkovModels.jl | Latent states ("trusts LLM", "correcting", "verifying") |
| Signal Processing | DSP.jl, TimeSeries.jl | Spectral analysis operator response times |
| Formal Verification | **Satisfiability.jl** | SMT з Z3/CVC5 -- верифiкацiя interaction protocols |
| Formal Verification | **ReachabilityAnalysis.jl** | Set-based reachability для safety properties |
| Formal Verification | NeuralVerification.jl | Верифiкацiя neural components (reward models) |
| LLM API | PromptingTools.jl | OpenAI, Anthropic, MistralAI + prompt templates |
| LLM API | SwarmAgents.jl | Multi-agent systems з PromptingTools.jl |
| HF Datasets | HuggingFaceDatasets.jl | Loader для всiх HF datasets в Julia |

---

## Rust

### Статтi

| Тема | Crate | Опис |
|------|-------|------|
| Edit-Trace Oversight | diffo, serde_json_diff | Structured diffs для agent states (JSON Patch RFC 6902) |
| Edit-Trace Oversight | tracing + tracing-serde | Structured async-aware instrumentation |
| Edit-Trace Oversight | cqrs-es, eventually-rs | Event sourcing -- corrections як immutable events |
| Workflow Memory | **qdrant-client** | Dense + sparse vectors -- dual-mode retrieval |
| Workflow Memory | **tantivy** | Full-text search (Lucene-аналог, 2x faster) |
| Workflow Memory | hnswlib-rs | Pure-Rust HNSW для in-process ANN |
| Workflow Memory | sled, rust-rocksdb | Embedded KV stores для persistent memory |
| Tokenizer Fertility | **tokenizers** | HuggingFace core: BPE, WordPiece, Unigram. 1GB/20s |
| Tokenizer Fertility | **bpe** | Backtracking BPE, 10x faster than HF |
| Tokenizer Fertility | rust-tokenizers | Alternative: WordPiece, BPE, Unigram |
| Tokenizer Fertility | unicode-segmentation | UAX#29 word/grapheme boundaries для кирилицi |
| Few-Shot Degradation | rust-bert | NLP pipelines (zero-shot classification, NER) |
| Few-Shot Degradation | candle | HF minimalist ML framework, safetensors |
| Citation Graph | petgraph | Graph library (Graph, StableGraph, DFS/BFS, topo sort) |
| Citation Graph | **graph** | Billion-scale CSR, Neo4j engineers |
| Citation Graph | single-clustering | Louvain + Leiden community detection |
| Citation Graph | fast-louvain, louvain-rs | Dedicated Louvain implementations |
| Citation Graph | xgraph | Degree, betweenness, closeness centrality |
| Citation Graph | rayon | Data parallelism via par_iter() |
| OWL Ontology | **horned-owl** | Full OWL 2: RDF/XML, OWL Functional Syntax (TGDK journal) |
| OWL Ontology | **whelk-rs** | OWL EL+RL reasoner, integrated з horned-owl |
| OWL Ontology | **oxigraph** | SPARQL 1.1 graph DB (RocksDB-backed) |
| OWL Ontology | sophia | RDF toolkit (Turtle, N-Triples, JSON-LD, RDF/XML) |
| Mission Memory | sled, rust-rocksdb | Persistent KV для mission memory |
| Mission Memory | cqrs-es | Event sourcing для operator rotation history |
| Mission Memory | candle | Edge inference без Python dependency |
| Cross-cutting | polars | DataFrame: streaming, multi-threaded, Arrow-based |
| Cross-cutting | arrow-rs, parquet | Columnar storage, zero-copy |
| Cross-cutting | memmap2 | Memory-mapped I/O для файлiв бiльших за RAM |

### Взаємодiя оператора з LLM

| Тема | Crate | Опис |
|------|-------|------|
| Diff | **similar** | Myers + Patience diff з change operations |
| Diff | **dissimilar** | Character-level diff з semantic cleanup |
| Diff | diffy, flickzeug | Unified diffs, fuzzy patch matching |
| Tree Diff | **tree-edit-distance** | Generalized tree edit distance |
| Tree Diff | **difftastic** | AST-level diff via tree-sitter |
| Edit Distance | **strsim** | Hamming, Levenshtein, Jaro-Winkler, Sorensen-Dice |
| Edit Distance | **triple_accel** | SIMD-accelerated (AVX2): 20-30x faster |
| LLM Inference | candle | HF ML framework (LLaMA, Mistral, Phi, Gemma) |
| LLM Inference | mistral.rs | GGUF quantized inference, streaming |
| Embeddings | **fastembed** | Local embeddings via ONNX Runtime |
| Embeddings | hnsw_rs | In-process HNSW для correction pattern mining |
| Streaming | axum + tokio-tungstenite | WebSocket, flat p99 latency |
| Telemetry | tracing + opentelemetry | Structured spans для interaction sessions |
| Data | polars | Мiльйони edit sessions, streaming mode |

---

## Java / Scala

### Статтi

| Тема | Бiблiотека | Опис |
|------|------------|------|
| Edit-Trace Oversight | AgentTrace | Structured logging для agent observability |
| Edit-Trace Oversight | OpenTelemetry Java Agent | Auto-instrumentation для JVM |
| Edit-Trace Oversight | Akka Persistence | Event sourcing з immutable append-only journal |
| Workflow Memory | **Akka Persistence + Cluster Sharding** | Actor migration при operator rotation |
| Workflow Memory | DL4J (Deeplearning4j) | Word2Vec, Doc2Vec, LSTM на JVM |
| Workflow Memory | **DJL** (Deep Java Library) | HF transformer models via ONNX Runtime |
| Tokenizer Fertility | **DJL HuggingFace Tokenizers** | JNI binding до Rust HF tokenizers |
| Tokenizer Fertility | Spark NLP | 200+ мов, distributed tokenization |
| Tokenizer Fertility | **Morfologik** | FSA-based морфологiя для славянських мов |
| Few-Shot Degradation | Spark NLP | Ukrainian, Polish, Czech pipelines |
| Few-Shot Degradation | Apache OpenNLP | 36 мовних моделей, opennlp-morfologik extension |
| Citation Graph | **Spark GraphX** | Distributed graph processing: PageRank, label prop |
| Citation Graph | **Spark GraphFrames** | DataFrame-based, Catalyst optimizer |
| Citation Graph | **JGraphT** | PageRank (outperforms NetworkX), ACM TOMS |
| Citation Graph | **Neo4j + GDS** | 65+ algorithms, Cypher, property graph |
| Citation Graph | Apache TinkerPop/Gremlin | OLTP + OLAP graph traversal |
| OWL Ontology | **OWL API** | Reference Java API для OWL 2 (used by Protege) |
| OWL Ontology | **Apache Jena** | RDF/OWL + SPARQL + rule engine |
| OWL Ontology | **Pellet** | OWL 2 DL reasoner (SROIQ) |
| OWL Ontology | Eclipse RDF4J + SHACL | RDF validation, shape constraints |
| OWL Ontology | OWL2Vec* | OWL embeddings у vector space |
| Mission Memory | Akka Persistence | Event-sourced actors з cluster migration |
| Mission Memory | Safety-Critical Java | Formal mission lifecycle specification |
| Cross-cutting | Apache Spark MLlib | Distributed ML pipelines |
| Cross-cutting | Stanford CoreNLP | Tokenization, NER, sentiment, coref |
| Cross-cutting | MALLET | Topic modeling (LDA), CRF sequence tagging |

### Взаємодiя оператора з LLM

| Тема | Бiблiотека | Опис |
|------|------------|------|
| LLM Orchestration | **LangChain4j** | Unified API, 20+ LLM providers, MCP support |
| LLM Orchestration | LangGraph4j | Stateful multi-agent graphs з checkpointing |
| LLM Orchestration | Spring AI | Spring ecosystem, Advisors API |
| LLM Orchestration | Semantic Kernel Java | Plan generation, plugin system |
| Workflow Engines | **Camunda 8** | BPMN для human-in-the-loop AI workflows |
| Workflow Engines | **Temporal** | Durable execution, HITL via Signals tutorial |
| Text Diff | java-diff-utils | Myers' diff, unified/side-by-side diffs |
| Text Diff | Google diff-match-patch | Fuzzy matching, error-tolerant patching |
| Knowledge Graphs | Neo4j + Java driver | Interaction patterns як graphs, GraphRAG |
| Knowledge Graphs | Apache Jena | OWL для interaction ontology, SPARQL |
| NLP | Stanford CoreNLP | Dialogue analysis, sentiment detection |
| NLP | DKPro Core | UIMA pipeline: tokenize + parse + classify |
| Big Data | Spark + HF Parquet | Нативне завантаження RLHF datasets |
| Observability | OpenTelemetry + OpenLLMetry | LLM-specific telemetry conventions |
| Formal Verification | **PRISM** | Probabilistic model checking (DTMC, MDP) |
| Formal Verification | **UPPAAL + juppaal** | Timed automata verification |
| Formal Verification | SpinJa | SPIN model checker -- deadlock, liveness |

---

## C++ / MATLAB

### Статтi

| Тема | Бiблiотека | Мова | Опис |
|------|------------|------|------|
| Edit-Trace | ONNX Runtime | C++ | Edge inference для alignment classifiers |
| Edit-Trace | Stateflow + Design Verifier | MATLAB | Formal verification oversight FSM (LTL) |
| Workflow Memory | **FAISS** | C++ | Billion-scale vector search (IVF, HNSW, PQ) |
| Workflow Memory | Simulink DES | MATLAB | Discrete-event simulation memory architectures |
| Tokenizer Fertility | **SentencePiece** | C++ | BPE + Unigram, language-independent, raw bytes |
| Tokenizer Fertility | **ICU** | C++ | Unicode normalization, boundary analysis, 300+ locales |
| Tokenizer Fertility | Text Analytics Toolbox | MATLAB | Tokenization, embeddings, statistical analysis |
| Few-Shot Degradation | pymorphy2 (C++ ext) | C++ | Morphological analyzer для uk/ru, 100K words/sec |
| Few-Shot Degradation | Statistics Toolbox | MATLAB | Paired bootstrap, Wilcoxon significance testing |
| Citation Graph | **SNAP** | C++ | Hundreds of millions nodes, 140+ algorithms |
| Citation Graph | **NetworKit** | C++ | OpenMP parallel, 3B edges in minutes |
| Citation Graph | Boost.Graph | C++ | Generic graph interface (Louvain/Leiden в розробцi) |
| Citation Graph | Graph/Network Algorithms | MATLAB | Native graph/digraph з PageRank, centrality |
| OWL Ontology | **owlcpp** | C++ | Єдина C++ OWL бiблiотека, RDF/XML парсинг |
| OWL Ontology | **FaCT++** | C++ | Tableaux OWL 2 DL reasoner (SHOIQ) |
| OWL Ontology | Redland (librdf) | C | RDF graph manipulation, Raptor parsing |
| Mission Memory | **Simulink bumpless transfer** | MATLAB | Operator handoff без iнформацiйних втрат |
| Mission Memory | Aerospace & Defense Toolbox | MATLAB | UAV mission planning, sensor fusion |
| Mission Memory | CoGoV Toolbox | MATLAB | Command Governor для multi-vehicle autonomous |

### Взаємодiя оператора з LLM

| Тема | Бiблiотека | Мова | Опис |
|------|------------|------|------|
| LLM Inference | **llama.cpp** | C++ | Pure C/C++, no deps, 1.5-8bit quant, 109K stars |
| LLM Inference | **whisper.cpp** | C++ | ASR для voice-based operator interaction |
| LLM Inference | vLLM | C++ | PagedAttention, 14-24x throughput |
| Text Diff | dtl | C++ | O(NP) algorithm, LCS, SES (Shortest Edit Script) |
| Text Diff | Google diff-match-patch | C++ | Diff + fuzzy match + patch |
| Real-Time | **ROS 2 (rclcpp)** | C++ | Sub-ms latency, QoS, pub/sub для HITL |
| HITL Control | **Control System Toolbox** | MATLAB | Оператор як controller у feedback loop з LLM |
| HITL Control | System Identification Toolbox | MATLAB | Infer operator transfer function з traces |
| HMI | Simulink HMI + Agentic Toolkit | MATLAB | HMI testing + MCP integration з AI agents |
| RL/RLHF | **RL Toolbox** | MATLAB | PPO, SAC, DQN -- RLHF experiments у Simulink |
| Signal Processing | Signal Processing Toolbox | MATLAB | Spectral analysis operator response times |
| Formal Spec | **Stateflow** | MATLAB | FSM з formal semantics (Rushby, SRI) |
| Psychometrics | Statistics Toolbox | MATLAB | Psychometric function estimation (UML) |
| Psychometrics | Psychtoolbox-3 | MATLAB | Millisecond-precision stimulus timing |

---

## Датасети (крос-мовнi)

### Preference / RLHF

| Dataset | Записiв | Формат | Опис |
|---------|---------|--------|------|
| [Anthropic HH-RLHF](https://huggingface.co/datasets/Anthropic/hh-rlhf) | 170K | Parquet | Pairwise preferences (chosen/rejected) |
| [OpenAssistant OASST1/2](https://huggingface.co/datasets/OpenAssistant/oasst1) | 161K msg | Parquet | Conversation trees, 35 мов, 461K ratings |
| [LMSYS Chatbot Arena](https://huggingface.co/datasets/lmsys/chatbot_arena_conversations) | 240K+ votes | Parquet | Head-to-head model comparisons |
| [LMSYS-Chat-1M](https://huggingface.co/datasets/lmsys/lmsys-chat-1m) | 1M convos | Parquet | Real-world conversations з 25 LLMs |
| [WildChat](https://huggingface.co/datasets/allenai/WildChat-1M) | 1-4.8M | Parquet | ChatGPT interactions з demographic metadata |
| [ShareChat](https://arxiv.org/html/2512.17843v2) | 142K convos | -- | Cross-platform (ChatGPT/Claude/Gemini), 101 мова |
| [UltraFeedback](https://huggingface.co/datasets/allenai/tulu-3-wildchat-ultrafeedback) | 64K | Parquet | GPT-4 scores: helpfulness, honesty, truthfulness |
| [Stanford SHP](https://huggingface.co/datasets/stanfordnlp/SHP) | -- | Parquet | Natural preferences from Reddit |

### Edit Traces & Agent Benchmarks

| Dataset | Записiв | Опис |
|---------|---------|------|
| [BEEMO](https://huggingface.co/datasets/toloka/beemo) | 6.5K | Expert-edited AI texts (human → LLM → expert-edited) |
| [TRAIL](https://www.patronus.ai/blog/introducing-trail-a-benchmark-for-agentic-evaluation) | 148 traces | 841 labeled errors у 20+ категорiях агентних трейсiв |
| [SWE-bench Verified](https://huggingface.co/datasets/SWE-bench/SWE-bench_Verified) | 500 | Human-validated code patches з ground truth |
| [SWE-chat](https://huggingface.co/datasets/SALT-NLP/SWE-chat) | -- | Real AI coding sessions з tool calls та thinking traces |
| [RAGBench](https://arxiv.org/abs/2407.11005) | 100K | TRACe evaluation across 5 industry domains |
| [AgentBench](https://github.com/THUDM/AgentBench) | -- | 8-environment benchmark, ICLR 2024 |

### Memory & Long-Horizon

| Dataset | Опис |
|---------|------|
| [LoCoMo](https://snap-research.github.io/locomo/) | Long-context conversational memory benchmark |
| [MemoryAgentBench](https://www.emergentmind.com/topics/memoryagentbench) | Unified LLM agent memory benchmark |
| [AMA-Bench](https://arxiv.org/html/2602.22769v1) | Long-horizon memory for agentic applications |
| [C2SIM](https://www.researchgate.net/publication/340268638) | NATO C2-to-Simulation standard for autonomous systems |

### Legal / Multilingual

| Dataset | Розмiр | Опис |
|---------|--------|------|
| [MultiLegalPile](https://arxiv.org/abs/2306.02069) | 689 GB | Legal corpus, 24 мови, 17 юрисдикцiй |
| [CzCDC](https://arxiv.org/pdf/1910.09513) | 237K docs | Czech Court Decisions Corpus, 460M words |
| [LexGLUE](https://github.com/coastalcph/lex-glue) | 7 tasks | Legal language understanding benchmark |
| [LEXTREME](https://arxiv.org/abs/2301.13126) | -- | Multi-lingual, multi-task legal benchmark |
| [LeCNet](https://aclanthology.org/2025.justnlp-main.4/) | 26K nodes | Legal Citation Network (Indian judiciary) |
| [CourtListener](https://www.courtlistener.com/help/api/bulk-data/) | 9M+ | US court decisions з citation graph |
| [ECHR Open Data](https://echr-opendata.eu/) | -- | European Court of Human Rights decisions |
| [UberText 2.0](https://lang.org.ua/en/about/) | 5+ GB | Ukrainian corpus (news, wiki, legal) |
| [Kobza](https://github.com/osyvokon/awesome-ukrainian-nlp) | ~1.3 TB | 60B tokens, 97M Ukrainian documents |

### Human-AI Teaming / Trust

| Dataset | Опис |
|---------|------|
| [HRI-SA](https://arxiv.org/html/2603.18344v1) | Eye-tracking + SA у search-and-rescue (30 participants) |
| [DARPA XAI (XAITK)](https://www.darpa.mil/research/programs/explainable-artificial-intelligence) | Trust calibration frameworks та evaluation |
| [BUFFET](https://buffetfs.github.io/) | 15 tasks, 54 мови, fixed few-shot (NAACL 2024) |

### Ontology

| Dataset | Опис |
|---------|------|
| [d2kg-OWL](https://www.semantic-web-journal.net/content/d2kg-owl) | OWL для government decisions (SWJ 2025) |
| [OBO Foundry](https://obofoundry.org/) | Open biomedical OWL ontologies |
| [Awesome Ontology](https://github.com/ozekik/awesome-ontology) | Curated list of ontology resources |

---

## Топ-знахiдки по унiкальностi

1. **GenGPT3.jl** (Julia) -- LLM output як random variable у probabilistic program Gen.jl. Bayesian inference над стохастичнiстю LLM
2. **ActiveInference.jl** (Julia) -- оператор як active inference agent, що мiнiмiзує surprise про поведiнку LLM
3. **horned-owl** (Rust) -- повний OWL 2 на Rust, опублiковано в TGDK (Dagstuhl)
4. **Simulink bumpless transfer** (MATLAB) -- формалiзм operator handoff без iнформацiйних втрат
5. **BEEMO dataset** -- 6.5K текстiв з expert edit traces (human → LLM → expert-edited)
6. **TRAIL dataset** -- 148 агентних трейсiв з 841 анотованою помилкою у 20+ категорiях
7. **Catlab.jl** (Julia) -- OWL hierarchies як categorical structures (applied category theory)
8. **SuiteSparseGraphBLAS.jl** (Julia) -- 10x faster graph ops для citation graph масштабу 100M
9. **PRISM** (Java) -- probabilistic model checking для MDP: "яка ймовiрнiсть що корекцiя оператора буде враховано за 3 кроки?"
10. **BradleyTerry2** (R) -- статистична модель за Chatbot Arena rankings, нативно в R

---

## Куратованi списки

- [awesome-llm-human-preference-datasets](https://github.com/glgh/awesome-llm-human-preference-datasets)
- [awesome-RLHF](https://github.com/opendilab/awesome-RLHF)
- [llm-datasets (post-training)](https://github.com/mlabonne/llm-datasets)
- [awesome-ukrainian-nlp](https://github.com/osyvokon/awesome-ukrainian-nlp)
- [awesome-nlp-polish](https://github.com/ksopyla/awesome-nlp-polish)
- [awesome-legal-data](https://github.com/openlegaldata/awesome-legal-data)
- [awesome-ontology](https://github.com/ozekik/awesome-ontology)
- [Agent-Memory-Paper-List](https://github.com/Shichun-Liu/Agent-Memory-Paper-List)
