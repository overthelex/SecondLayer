---
language:
- uk
license: cc-by-4.0
task_categories:
- text-classification
task_ids:
- multi-class-classification
pretty_name: Ukrainian Court Decisions (Judgment Prediction)
size_categories:
- 100K<n<1M
tags:
- legal
- court-decisions
- ukraine
- judgment-prediction
- legal-nlp
- temporal-split
source_datasets: []
configs:
- config_name: pre_war
  data_files:
  - split: train
    path: pre_war/train.jsonl
  - split: validation
    path: pre_war/validation.jsonl
  - split: test
    path: pre_war/test.jsonl
- config_name: hybrid_war
  data_files:
  - split: train
    path: hybrid_war/train.jsonl
  - split: validation
    path: hybrid_war/validation.jsonl
  - split: test
    path: hybrid_war/test.jsonl
- config_name: full_scale
  data_files:
  - split: train
    path: full_scale/train.jsonl
  - split: validation
    path: full_scale/validation.jsonl
  - split: test
    path: full_scale/test.jsonl
dataset_info:
  features:
  - name: text
    dtype: string
  - name: label
    dtype:
      class_label:
        names:
          '0': approved
          '1': dismissed
          '2': partial
  - name: language
    dtype: string
---

# Ukrainian Court Decisions -- Judgment Prediction

A dataset of Ukrainian court decisions for **case outcome prediction**, extracted from the [State Court Decisions Registry](https://reyestr.court.gov.ua/).

## Configs (Temporal Epochs)

The dataset is split into three configs corresponding to distinct epochs in Ukrainian legal history. Within each config, train/validation/test splits are **temporal** (chronological), not random -- earlier decisions are in train, later ones in test.

| Config | Period | Context |
|--------|--------|---------|
| `pre_war` | 2008--2013 | Baseline period before armed conflict |
| `hybrid_war` | 2014--2021 | Hybrid warfare (Crimea annexation, Donbas conflict) |
| `full_scale` | 2022--2026 | Full-scale Russian invasion |

### Why temporal splits?

Following the recommendation from [Niklaus et al. (2021)](https://arxiv.org/abs/2110.00976), we use **temporal splits** for more realistic evaluation. Random splits allow the model to memorize patterns from contemporaneous decisions that appear in both train and test. Temporal splits simulate real deployment: the model trains on past decisions and predicts outcomes for future ones.

### Why separate epochs?

The three epochs differ substantially in judicial practice:
- **Pre-war**: Stable legal environment, established precedent patterns
- **Hybrid war**: Martial law in parts of territory, displaced courts, evolving jurisprudence
- **Full-scale**: Nationwide martial law, new legal regimes, dramatic shifts in case composition

Separate configs allow measuring how well models generalize within vs. across these regimes.

## Task

Given the **facts section** of a court decision, predict the judgment outcome:

| Label | Ukrainian | Description |
|-------|-----------|-------------|
| `approved` | Задоволено | Claim fully satisfied |
| `dismissed` | Відмовлено | Claim dismissed |
| `partial` | Частково задоволено | Claim partially satisfied |

## Data Description

- **Source**: State Court Decisions Registry of Ukraine (ЄДРСР)
- **Language**: Ukrainian (uk)
- **Jurisdiction**: Ukraine
- **Court types**: Civil and commercial courts
- **Decision form**: Substantive decisions (judgment_code=3)

### Why facts only?

Following [Niklaus et al. (2021)](https://arxiv.org/abs/2110.00976), we provide only the **facts section** as input, excluding the court's reasoning and the dispositive (ruling) section. Including the full text would make the task trivially solvable since the ruling contains the answer directly.

### Section extraction

Ukrainian court decisions follow a standard structure:
1. **Header** -- court name, case number, date, parties
2. **ВСТАНОВИВ/УСТАНОВИВ** -- established facts and circumstances
3. **Reasoning** -- court's legal analysis
4. **ВИРІШИВ/УХВАЛИВ** -- the ruling (dispositive section)

We extract text between the ВСТАНОВИВ marker and the ВИРІШИВ marker. The outcome label is derived from the dispositive section using keyword matching.

## Usage

```python
from datasets import load_dataset

# Load a specific epoch
dataset = load_dataset("secondlayer/ukrainian-court-decisions", "hybrid_war")

# Or load via LexTreme
dataset = load_dataset("joelniklaus/lextreme", "ukrainian_court_decisions_judgment_hybrid_war")

# Cross-epoch evaluation: train on pre_war, test on full_scale
train = load_dataset("secondlayer/ukrainian-court-decisions", "pre_war", split="train")
test = load_dataset("secondlayer/ukrainian-court-decisions", "full_scale", split="test")
```

## Citation

```bibtex
@misc{ovcharov2025ukrainian,
  title={Ukrainian Court Decisions Dataset for Judgment Prediction},
  author={Ovcharov, Volodymyr},
  year={2025},
  url={https://huggingface.co/datasets/secondlayer/ukrainian-court-decisions},
  note={Extracted from the State Court Decisions Registry of Ukraine}
}
```

## License

CC-BY-4.0. The source data is published by the State Court Administration of Ukraine under open access provisions per Ukrainian law.

## Links

- [State Court Decisions Registry](https://reyestr.court.gov.ua/)
- [LexTreme Benchmark](https://huggingface.co/datasets/joelniklaus/lextreme)
- [SecondLayer Legal AI Platform](https://legal.org.ua)
