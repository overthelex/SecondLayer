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
- 10K<n<100K
tags:
- legal
- court-decisions
- ukraine
- judgment-prediction
- legal-nlp
source_datasets: []
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
  splits:
  - name: train
    num_bytes: 93721699
    num_examples: 8214
  - name: validation
    num_bytes: 11990934
    num_examples: 1027
  - name: test
    num_bytes: 11569921
    num_examples: 1027
  download_size: 45561448
  dataset_size: 117282554
---

# Ukrainian Court Decisions — Judgment Prediction

A dataset of Ukrainian court decisions for **case outcome prediction**, extracted from the [State Court Decisions Registry (ЄДРСР)](https://reyestr.court.gov.ua/).

## Task

Given the **facts section** (ВСТАНОВИВ) of a court decision, predict the judgment outcome:

| Label | Ukrainian | Description |
|-------|-----------|-------------|
| `approved` | Задоволено | Claim fully satisfied |
| `dismissed` | Відмовлено | Claim dismissed |
| `partial` | Частково задоволено | Claim partially satisfied |

## Data Description

- **Source**: State Court Decisions Registry of Ukraine (Єдиний державний реєстр судових рішень, ЄДРСР)
- **Language**: Ukrainian (uk)
- **Jurisdiction**: Ukraine
- **Court types**: Civil and commercial courts
- **Decision form**: "Рішення" (substantive decisions, judgment_code=3)
- **Time period**: 2003–2025

### Why facts only?

Following [Niklaus et al. (2021)](https://arxiv.org/abs/2110.00976), we provide only the **facts section** (ВСТАНОВИВ/УСТАНОВИВ) as input, excluding the court's reasoning and the dispositive (ruling) section. Including the full text would make the task trivially solvable since the ruling contains the answer directly.

### Section extraction

Ukrainian court decisions follow a standard structure:
1. **Header** — court name, case number, date, parties
2. **ВСТАНОВИВ/УСТАНОВИВ** — established facts and circumstances
3. **Reasoning** — court's legal analysis (sometimes merged with facts)
4. **ВИРІШИВ/УХВАЛИВ** — the ruling (dispositive section)

We extract text between the ВСТАНОВИВ marker and the ВИРІШИВ marker. The outcome label is derived from the dispositive section using keyword matching (задовольнити → approved, відмовити → dismissed, частково → partial).

## Data Quality

- Minimum 200 characters in facts section
- Maximum 10,000 characters (truncated for very long decisions)
- Full text length between 500 and 200,000 characters
- Class-balanced sampling
- Random 80/10/10 train/validation/test split

## Usage

```python
from datasets import load_dataset

dataset = load_dataset("secondlayer/ukrainian-court-decisions")

# Or load via LexTreme
dataset = load_dataset("joelniklaus/lextreme", "ukrainian_court_decisions_judgment")
```

## Citation

```bibtex
@misc{ovcharov2025ukrainian,
  title={Ukrainian Court Decisions Dataset for Judgment Prediction},
  author={Ovcharov, Volodymyr},
  year={2025},
  url={https://huggingface.co/datasets/secondlayer/ukrainian-court-decisions},
  note={Extracted from the State Court Decisions Registry of Ukraine (ЄДРСР)}
}
```

## License

CC-BY-4.0. The source data is published by the State Court Administration of Ukraine under open access provisions per Ukrainian law.

## Links

- [ЄДРСР (State Court Decisions Registry)](https://reyestr.court.gov.ua/)
- [LexTreme Benchmark](https://huggingface.co/datasets/joelniklaus/lextreme)
- [SecondLayer Legal AI Platform](https://legal.org.ua)
