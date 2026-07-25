---
language:
- uk
license: cc-by-4.0
size_categories:
- 10K<n<100K
task_categories:
- text-classification
task_ids:
- multi-class-classification
tags:
- legal
- court-decisions
- ukrainian
- case-outcome
- edrsr
- temporal-robustness
pretty_name: "Ukrainian Court Case Outcome (EDRSR)"
dataset_info:
  features:
  - name: doc_id
    dtype: int64
  - name: justice_kind
    dtype: int8
  - name: justice_kind_name
    dtype: string
  - name: judgment_code
    dtype: int8
  - name: category_code
    dtype: int32
  - name: court_code
    dtype: int32
  - name: judge
    dtype: string
  - name: adjudication_date
    dtype: string
  - name: facts
    dtype: string
  - name: dispositive
    dtype: string
  - name: outcome
    dtype: string
  - name: epoch
    dtype: string
  - name: year
    dtype: int16
  - name: full_text_length
    dtype: int32
  splits:
  - name: train
    num_examples: 11561
  - name: validation
    num_examples: 1445
  - name: test
    num_examples: 1446
configs:
- config_name: default
  data_files:
  - split: train
    path: train.parquet
  - split: validation
    path: validation.parquet
  - split: test
    path: test.parquet
---

# Ukrainian Court Case Outcome (EDRSR)

A dataset of 14,452 Ukrainian court decisions spanning 2008-2026 from the [Unified State Register of Court Decisions (EDRSR)](https://reyestr.court.gov.ua/), with parsed sections, outcome labels, and temporal epoch annotations. Designed for case outcome prediction and temporal robustness evaluation in legal NLP.

## Dataset Description

Each record contains:

- **facts** — the factual circumstances section of the decision (model input). Following [LEXTREME](https://aclanthology.org/2023.findings-emnlp.865/) methodology, only the facts section is provided rather than the full text.
- **dispositive** — the operative part of the decision (for label verification).
- **outcome** — one of 7 labels (see below).
- **epoch** — temporal period: `pre_war`, `hybrid_war`, or `full_scale`.
- **Metadata**: court code, judge name, case category, adjudication date, year, jurisdiction type.

## Temporal Epochs

The dataset captures three distinct periods in Ukrainian judicial history, enabling cross-temporal generalization research:

| Epoch | Years | Context | Records |
|-------|-------|---------|---------|
| `pre_war` | 2008, 2010-2013 | Peacetime, all courts operational | ~3,000 |
| `hybrid_war` | 2014, 2018-2021 | Crimea annexation, Donbas conflict (ATO/JFO), partial occupation | ~5,000 |
| `full_scale` | 2022-2026 | Full-scale invasion, martial law, mass military cases | ~7,000 |

Key distribution shifts across epochs:
- **2014**: Courts in Crimea and parts of Donetsk/Luhansk ceased operating under Ukrainian jurisdiction.
- **2022+**: Surge in military criminal cases (AWOL, desertion, draft evasion); new Criminal Code articles (111-1 collaborationism, 111-2); martial law procedures.
- **Case type mix**: Criminal cases shift from property/drug offenses (pre-war) to military offenses (full-scale).

## Outcome Labels

| Label | Description |
|-------|-------------|
| `granted` | Claim fully granted |
| `guilty` | Defendant found guilty (criminal/admin) |
| `partial` | Claim partially granted |
| `closed` | Proceedings terminated or defendant acquitted |
| `denied` | Claim denied |
| `plea_deal` | Plea agreement approved |
| `other` | Unclassified (mixed/procedural) |

## Jurisdiction Types

Balanced across all 5 Ukrainian jurisdiction types per epoch:

| Code | Name | Typical outcomes |
|------|------|-----------------|
| 1 | Civil | granted / denied / partial |
| 2 | Criminal | guilty / plea_deal / closed |
| 3 | Commercial | granted / denied / partial |
| 4 | Administrative | granted / denied / partial |
| 5 | Administrative offenses | guilty / closed |

## Source Data

All decisions sourced from the official EDRSR API. The registry contains 101M+ decisions from 832 courts across Ukraine (2006-present). Personal data is anonymized at the source.

**Anonymization tokens**: `[PERSON]`, `[ADDRESS]`, `[NUMBER]`, `[INFO]` replace EDRSR placeholders.

## Intended Use

- **Case outcome prediction**: Given facts, predict the outcome label.
- **Temporal robustness evaluation**: Train on one epoch, evaluate on another to measure distribution shift resilience.
- **Legal NLP benchmarking**: Evaluate multilingual models on Ukrainian legal text — a Cyrillic civil-law system underrepresented in benchmarks like LEXTREME.
- **Conflict impact analysis**: Study how armed conflict affects judicial outcomes and case distributions.

## Limitations

- Outcome labels are extracted via rule-based regex matching (~5% remain as `other`).
- Facts section parsing relies on formatting conventions that vary across courts and time periods.
- `acquitted` outcomes are merged into `closed` due to extreme rarity (~0.1% in Ukrainian courts).
- Early years (2008-2010) may have lower text quality due to digitization.
- 2009 is excluded due to insufficient data (52K total records vs 1M+ for other years).

## Citation

```bibtex
@dataset{ovcharov2026uacaseoutcome,
  title={Ukrainian Court Case Outcome Dataset (EDRSR)},
  author={Ovcharov, Volodymyr},
  year={2026},
  publisher={Hugging Face},
  url={https://huggingface.co/datasets/secondlayer/ua-case-outcome}
}
```

## License

CC-BY-4.0. Source data is published by the State Judicial Administration of Ukraine under open data principles (Law of Ukraine "On Access to Court Decisions").
