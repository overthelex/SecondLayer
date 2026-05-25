#!/usr/bin/env python3
"""Split european-court-decisions into pl-court-decisions and cz-court-decisions repos."""

import os
import time
from huggingface_hub import HfApi, hf_hub_download

api = HfApi()
SRC = "overthelex/european-court-decisions"

PL_REPO = "overthelex/pl-court-decisions"
CZ_REPO = "overthelex/cz-court-decisions"

PL_README = """---
license: cc-by-4.0
language:
- pl
pretty_name: "Polish Court Decisions"
tags:
- legal
- court-decisions
- polish
- civil-law
- judgments
- caselaw
- legal-nlp
size_categories:
- 1M<n<10M
task_categories:
- text-generation
- text-classification
- summarization
- feature-extraction
annotations_creators:
- no-annotation
language_creators:
- found
source_datasets:
- original
configs:
- config_name: default
  data_files:
  - split: train
    path: "data/train-*.parquet"
---

# Polish Court Decisions

The largest open dataset of Polish court decisions: **2,830,029 decisions** with full texts across all court levels.

## What Makes This Dataset Unique

| Source | This dataset | Best on HF (JuDDGES) | Difference |
|--------|-------------|----------------------|------------|
| Common courts | 437,446 | 437,450 (pl-court-raw) | same source |
| Administrative courts | 1,899,852 | ~1,800,000 (pl-nsa) | same source |
| Supreme Court + Constitutional Tribunal + KIO | 492,731 | **0** | **+493K unique** |
| **Total** | **2,830,029** | ~2,237,450 | **+593K (+26%)** |

### Key differentiator: SAOS API data

The 493K decisions from the [SAOS API](https://www.saos.org.pl/api/) include Supreme Court, Constitutional Tribunal, and National Appeal Chamber rulings that are **absent from all existing HuggingFace datasets**, including JuDDGES, Multi_Legal_Pile, and LEXTREME.

## Comparison with LEXTREME and Multi_Legal_Pile

- **LEXTREME** ([joelniklaus/lextreme](https://hf.co/datasets/joelniklaus/lextreme)): Contains **zero** Polish court decisions. Polish data in LEXTREME is limited to MultiEURLEX topic classification.
- **Multi_Legal_Pile** ([joelniklaus/Multi_Legal_Pile](https://hf.co/datasets/joelniklaus/Multi_Legal_Pile)): Contains **zero** Polish caselaw. Only Polish legislation (89K docs from MARCELL).
- **JuDDGES**: pl-court-raw (437K common courts) + pl-nsa (~1.8M admin courts). Does not include Supreme Court, Constitutional Tribunal, or KIO decisions.

## Loading the Data

```python
from datasets import load_dataset

ds = load_dataset("overthelex/pl-court-decisions", split="train", streaming=True)

for row in ds.take(3):
    print(row["court_type"], row["case_number"], len(row["full_text"] or ""))
```

## Sources

| Source | Records | Court Types | Period | License |
|--------|---------|-------------|--------|---------|
| [SAOS API](https://www.saos.org.pl/api/) | 492,731 | Supreme Court, Constitutional Tribunal, National Appeal Chamber, Common Courts | 2000-2026 | Public domain (Polish Copyright Act Art. 4) |
| [JuDDGES/pl-court-raw](https://hf.co/datasets/JuDDGES/pl-court-raw) | 437,446 | Common courts (district, regional, appellate) | 2002-2025 | CC BY 4.0 |
| [JuDDGES/pl-nsa](https://hf.co/datasets/JuDDGES/pl-nsa) | 1,899,852 | Administrative courts (WSA + NSA) | 2004-2025 | CC BY 4.0 |

## Schema

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique record identifier |
| `ecli` | string | European Case Law Identifier |
| `source` | string | `saos`, `hf-pl-court-raw`, `hf-pl-nsa` |
| `court_type` | string | COMMON, SUPREME, CONSTITUTIONAL_TRIBUNAL, NATIONAL_APPEAL_CHAMBER |
| `court_name` | string | Court name |
| `case_number` | string | Docket / case number |
| `decision_type` | string | SENTENCE, RESOLUTION, DECISION, REGULATION, REASONS |
| `decision_date` | string | YYYY-MM-DD |
| `judge` | string | Presiding judge |
| `keywords` | list[string] | Legal keywords |
| `legal_bases` | list[string] | Legal bases cited |
| `full_text` | string | Full decision text |

## Data Quality

- 12,213 SAOS internal duplicates removed (kept longest text)
- 27,473 empty texts removed
- 153 micro-texts (<100 chars) removed

## Citation

```bibtex
@misc{ovcharov2026plcourt,
  title={Polish Court Decisions: 2.83M decisions from SAOS, common, and administrative courts},
  author={Ovcharov, Volodymyr},
  year={2026},
  publisher={HuggingFace},
  url={https://huggingface.co/datasets/overthelex/pl-court-decisions}
}
```
"""

CZ_README = """---
license: cc-by-nc-sa-4.0
language:
- cs
pretty_name: "Czech Court Decisions"
tags:
- legal
- court-decisions
- czech
- civil-law
- judgments
- caselaw
- legal-nlp
size_categories:
- 100K<n<1M
task_categories:
- text-generation
- text-classification
- summarization
- feature-extraction
annotations_creators:
- no-annotation
language_creators:
- found
source_datasets:
- original
configs:
- config_name: justice
  data_files:
  - split: train
    path: "data/justice/train-*.parquet"
  default: true
- config_name: czcdc
  data_files:
  - split: train
    path: "data/czcdc/train-*.parquet"
---

# Czech Court Decisions

The largest open dataset of Czech court decisions: **871,171 decisions** with full texts across all court levels.

## What Makes This Dataset Unique

| Source | This dataset | Best on HF (Multi_Legal_Pile) | Difference |
|--------|-------------|-------------------------------|------------|
| Lower courts (district, regional, high) | 539,622 | **0** | **+540K unique** |
| Supreme Court | 111,977 | 111,977 (CzCDC in MLP) | same |
| Supreme Administrative Court | 52,660 | 52,660 (CzCDC in MLP) | same |
| Constitutional Court | 166,912 | 73,086 (CzCDC in MLP) | **+94K** |
| **Total** | **871,171** | 296,652 | **+574K (+194%)** |

### Key differentiator: rozhodnuti.justice.cz

The 540K lower court decisions from the [Czech Ministry of Justice API](https://rozhodnuti.justice.cz/api/opendata) are **absent from all existing HuggingFace datasets**.

## Configs and Licensing

| Config | Records | Courts | License |
|--------|---------|--------|---------|
| `justice` (default) | 539,622 | District, regional, high courts (2020-2026) | **CC BY 4.0** (commercial OK) |
| `czcdc` | 331,549 | Supreme + Supreme Administrative + Constitutional (1993-2023) | **CC BY-NC-SA 4.0** (non-commercial) |

## Loading the Data

```python
from datasets import load_dataset

# Lower courts (CC BY 4.0 -- commercial OK)
justice = load_dataset("overthelex/cz-court-decisions", "justice", split="train")

# Apex courts (CC BY-NC-SA 4.0)
czcdc = load_dataset("overthelex/cz-court-decisions", "czcdc", split="train")
```

## Sources

**`justice` config** (CC BY 4.0):

| Source | Records | Court Types | Period |
|--------|---------|-------------|--------|
| [rozhodnuti.justice.cz](https://rozhodnuti.justice.cz/api/opendata) | 539,622 | District, regional, high courts | 2020-2026 |

**`czcdc` config** (CC BY-NC-SA 4.0):

| Source | Records | Court Types | Period |
|--------|---------|-------------|--------|
| [CzCDC 1.0](https://lindat.mff.cuni.cz/repository/xmlui/handle/11372/LRT-3052) | 237,723 | Supreme, Supreme Administrative, Constitutional | 1993-2018 |
| [Paulik/Zenodo](https://zenodo.org/records/11618008) | 93,826 | Constitutional Court | 1993-2023 |

## Schema

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique record identifier |
| `ecli` | string | ECLI:CZ:... identifier |
| `source` | string | `justice.cz`, `czcdc`, `paulik-zenodo` |
| `court_name` | string | Court name |
| `case_number` | string | Docket / case number |
| `decision_type` | string | Type of decision |
| `decision_date` | string | YYYY-MM-DD |
| `judge` | string | Judge / rapporteur |
| `subject` | string | Subject matter |
| `keywords` | list[string] | Keywords |
| `cited_provisions` | list[string] | Cited legal provisions |
| `full_text` | string | Full decision text |

## Data Quality

- 0 duplicates (sources cover non-overlapping court levels)
- CzCDC and Paulik cover different time periods for Constitutional Court

## Citation

```bibtex
@misc{ovcharov2026czcourt,
  title={Czech Court Decisions: 871K decisions across all court levels},
  author={Ovcharov, Volodymyr},
  year={2026},
  publisher={HuggingFace},
  url={https://huggingface.co/datasets/overthelex/cz-court-decisions}
}
```
"""


def copy_files(src_prefix: str, dst_repo: str, dst_prefix: str):
    """Copy parquet files from source repo to destination repo."""
    files = list(api.list_repo_tree(SRC, repo_type="dataset", path_in_repo=src_prefix, recursive=True))
    parquets = [f for f in files if hasattr(f, 'rfilename') and f.rfilename.endswith('.parquet')]
    print(f"  Copying {len(parquets)} files from {src_prefix} -> {dst_repo}:{dst_prefix}", flush=True)

    for i, f in enumerate(parquets):
        src_path = f.rfilename
        fname = src_path.split('/')[-1]
        dst_path = f"{dst_prefix}/{fname}"

        local = hf_hub_download(SRC, src_path, repo_type="dataset")
        api.upload_file(
            path_or_fileobj=local,
            path_in_repo=dst_path,
            repo_id=dst_repo,
            repo_type="dataset",
        )
        print(f"  [{i+1}/{len(parquets)}] {dst_path}", flush=True)


def main():
    # PL repo
    print("=== PL ===", flush=True)
    api.upload_file(
        path_or_fileobj=PL_README.encode(),
        path_in_repo="README.md",
        repo_id=PL_REPO,
        repo_type="dataset",
    )
    copy_files("data/pl", PL_REPO, "data")

    # CZ repo
    print("\n=== CZ ===", flush=True)
    api.upload_file(
        path_or_fileobj=CZ_README.encode(),
        path_in_repo="README.md",
        repo_id=CZ_REPO,
        repo_type="dataset",
    )
    copy_files("data/cz-justice", CZ_REPO, "data/justice")
    copy_files("data/cz-czcdc", CZ_REPO, "data/czcdc")

    print("\n=== Done ===", flush=True)
    print(f"PL: https://huggingface.co/datasets/{PL_REPO}", flush=True)
    print(f"CZ: https://huggingface.co/datasets/{CZ_REPO}", flush=True)


if __name__ == "__main__":
    main()
