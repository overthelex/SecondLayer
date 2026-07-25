#!/usr/bin/env python3
"""Export PL+CZ court decisions to Parquet and publish on HuggingFace."""

import os
import sys
import time
import json
from pathlib import Path

import psycopg2
import pyarrow as pa
import pyarrow.parquet as pq
from huggingface_hub import HfApi, create_repo

DB_URL = os.environ.get("DATABASE_URL")
OUT_DIR = Path("/home/ubuntu/opendata/hf-export")
SHARD_ROWS = 50_000
REPO_ID = "overthelex/european-court-decisions"

PL_SCHEMA = pa.schema([
    ("id", pa.large_string()),
    ("ecli", pa.large_string()),
    ("source", pa.large_string()),
    ("court_type", pa.large_string()),
    ("court_name", pa.large_string()),
    ("division", pa.large_string()),
    ("case_number", pa.large_string()),
    ("decision_type", pa.large_string()),
    ("decision_date", pa.large_string()),
    ("judge", pa.large_string()),
    ("keywords", pa.list_(pa.string())),
    ("legal_bases", pa.list_(pa.string())),
    ("parties", pa.large_string()),
    ("abstract", pa.large_string()),
    ("source_url", pa.large_string()),
    ("full_text", pa.large_string()),
])

CZ_SCHEMA = pa.schema([
    ("id", pa.large_string()),
    ("ecli", pa.large_string()),
    ("source", pa.large_string()),
    ("court_name", pa.large_string()),
    ("court_type", pa.large_string()),
    ("case_number", pa.large_string()),
    ("decision_type", pa.large_string()),
    ("decision_date", pa.large_string()),
    ("publication_date", pa.large_string()),
    ("judge", pa.large_string()),
    ("subject", pa.large_string()),
    ("keywords", pa.list_(pa.string())),
    ("cited_provisions", pa.list_(pa.string())),
    ("parties", pa.large_string()),
    ("source_url", pa.large_string()),
    ("full_text", pa.large_string()),
])

PL_COLS = [f.name for f in PL_SCHEMA]
CZ_COLS = [f.name for f in CZ_SCHEMA]


def export_config(table: str, columns: list, schema: pa.Schema, config_dir: Path, where: str = "TRUE"):
    config_dir.mkdir(parents=True, exist_ok=True)
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor("export_cursor")
    cur.itersize = SHARD_ROWS

    col_sql = ", ".join(columns)
    cur.execute(f"SELECT {col_sql} FROM {table} WHERE {where} ORDER BY id")

    shard_idx = 0
    total_rows = 0
    batch = []

    for row in cur:
        converted = []
        for i, col in enumerate(columns):
            v = row[i]
            if isinstance(v, list):
                converted.append(v if v else None)
            elif isinstance(v, dict):
                converted.append(json.dumps(v, ensure_ascii=False) if v else None)
            elif v is not None:
                converted.append(str(v))
            else:
                converted.append(None)
        batch.append(converted)

        if len(batch) >= SHARD_ROWS:
            _write_shard(batch, columns, schema, config_dir, shard_idx)
            total_rows += len(batch)
            shard_idx += 1
            print(f"  shard {shard_idx}: {total_rows:,} rows", flush=True)
            batch = []

    if batch:
        _write_shard(batch, columns, schema, config_dir, shard_idx)
        total_rows += len(batch)
        shard_idx += 1

    conn.close()
    print(f"  Done: {total_rows:,} rows, {shard_idx} shards", flush=True)
    return total_rows, shard_idx


def _write_shard(batch, columns, schema, config_dir, shard_idx):
    arrays = {}
    for i, col in enumerate(columns):
        vals = [row[i] for row in batch]
        field_type = schema.field(col).type
        if isinstance(field_type, pa.ListType):
            arrays[col] = pa.array(vals, type=pa.list_(pa.string()))
        else:
            arrays[col] = pa.array(vals, type=pa.large_string())

    table = pa.table(arrays, schema=schema)
    path = config_dir / f"train-{shard_idx:05d}.parquet"
    pq.write_table(
        table, path,
        compression="zstd",
        compression_level=3,
        write_page_index=True,
        row_group_size=min(len(batch), 10_000),
    )


README = """---
license: cc-by-nc-sa-4.0
language:
- pl
- cs
pretty_name: "European Court Decisions: Polish & Czech"
tags:
- legal
- court-decisions
- polish
- czech
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
multilinguality:
- multilingual
source_datasets:
- original
configs:
- config_name: pl
  data_files:
  - split: train
    path: "data/pl/train-*.parquet"
  default: true
- config_name: cz-justice
  data_files:
  - split: train
    path: "data/cz-justice/train-*.parquet"
- config_name: cz-czcdc
  data_files:
  - split: train
    path: "data/cz-czcdc/train-*.parquet"
---

# European Court Decisions: Polish & Czech

The largest open dataset of Polish and Czech court decisions: **3,701,200 decisions** with full texts across all court levels.

## Dataset at a Glance

| Config | Country | Records | Courts | License |
|--------|---------|---------|--------|---------|
| `pl` | Poland | 2,830,029 | Common + Administrative + Supreme + Constitutional Tribunal + KIO | CC BY 4.0 |
| `cz-justice` | Czech Republic | 539,622 | District, regional, high courts (2020-2026) | CC BY 4.0 |
| `cz-czcdc` | Czech Republic | 331,549 | Supreme + Supreme Administrative + Constitutional (1993-2023) | CC BY-NC-SA 4.0 |

## What Makes This Dataset Unique

### vs LEXTREME ([joelniklaus/lextreme](https://hf.co/datasets/joelniklaus/lextreme))
LEXTREME contains **zero** Polish or Czech court decisions. It is a benchmark for legal NLU tasks, not a corpus.

### vs Multi_Legal_Pile ([joelniklaus/Multi_Legal_Pile](https://hf.co/datasets/joelniklaus/Multi_Legal_Pile))
Multi_Legal_Pile contains 296,652 Czech caselaw documents (from CzCDC apex courts only) and **zero** Polish caselaw. This dataset adds 574K more Czech decisions (lower courts 2020-2026) and the entire Polish corpus of 2.83M decisions.

### vs JuDDGES ([JuDDGES/pl-court-raw](https://hf.co/datasets/JuDDGES/pl-court-raw) + [JuDDGES/pl-nsa](https://hf.co/datasets/JuDDGES/pl-nsa))
JuDDGES provides 437K Polish common court + 1.8M administrative court decisions. This dataset adds 493K decisions from the SAOS API (Supreme Court, Constitutional Tribunal, National Appeal Chamber) that are **absent from all existing HuggingFace datasets**. It also adds the entire Czech corpus.

| | This Dataset | Best on HF | Advantage |
|---|---|---|---|
| **Poland** | 2,830,029 | ~2,237,450 (JuDDGES) | +593K (+26%) |
| **Czech Republic** | 871,171 | 296,652 (Multi_Legal_Pile) | +574K (+194%) |
| **Total** | **3,701,200** | ~2,534,102 | **+1,167K (+46%)** |

## Loading the Data

```python
from datasets import load_dataset

# Load Polish court decisions
pl = load_dataset("overthelex/european-court-decisions", "pl", split="train", streaming=True)

# Load Czech lower courts (CC BY 4.0)
cz_justice = load_dataset("overthelex/european-court-decisions", "cz-justice", split="train")

# Load Czech apex courts (CC BY-NC-SA 4.0)
cz_czcdc = load_dataset("overthelex/european-court-decisions", "cz-czcdc", split="train")

for row in pl.take(3):
    print(row["court_type"], row["case_number"], len(row["full_text"]))
```

## Sources

### Poland (`pl` config)

| Source | Records | Court Types | Period | License |
|--------|---------|-------------|--------|---------|
| [SAOS API](https://www.saos.org.pl/api/) | 492,731 | Supreme Court, Constitutional Tribunal, National Appeal Chamber, Common Courts | 2000-2026 | Public domain |
| [JuDDGES/pl-court-raw](https://hf.co/datasets/JuDDGES/pl-court-raw) | 437,446 | Common courts (district, regional, appellate) | 2002-2025 | CC BY 4.0 |
| [JuDDGES/pl-nsa](https://hf.co/datasets/JuDDGES/pl-nsa) | 1,899,852 | Administrative courts (WSA + NSA) | 2004-2025 | CC BY 4.0 |

### Czech Republic

**`cz-justice` config** (CC BY 4.0):

| Source | Records | Court Types | Period |
|--------|---------|-------------|--------|
| [rozhodnuti.justice.cz](https://rozhodnuti.justice.cz/api/opendata) | 539,622 | District, regional, high courts | 2020-2026 |

**`cz-czcdc` config** (CC BY-NC-SA 4.0):

| Source | Records | Court Types | Period |
|--------|---------|-------------|--------|
| [CzCDC 1.0](https://lindat.mff.cuni.cz/repository/xmlui/handle/11372/LRT-3052) | 237,723 | Supreme, Supreme Administrative, Constitutional | 1993-2018 |
| [Paulik/Zenodo](https://zenodo.org/records/11618008) | 93,826 | Constitutional Court | 1993-2023 |

## Schema

### Polish decisions (`pl`)

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

### Czech decisions (`cz-justice`, `cz-czcdc`)

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

Data was deduplicated and cleaned before publication:
- **PL**: 12,213 SAOS internal duplicates removed (kept longest text), 27,473 empty texts removed, 153 micro-texts (<100 chars) removed
- **CZ**: 0 duplicates detected (sources cover non-overlapping court levels)
- **CZ**: CzCDC and Paulik cover different time periods for Constitutional Court (no ECLI overlap)

## Licensing

The dataset combines sources with different licenses:
- **`pl` config**: All sources are CC BY 4.0 or public domain. **Safe for commercial use.**
- **`cz-justice` config**: CC BY 4.0. **Safe for commercial use.**
- **`cz-czcdc` config**: Includes CzCDC (CC BY-NC-SA 4.0). **Non-commercial use only.**

The top-level license is set to CC BY-NC-SA 4.0 to reflect the most restrictive component.

## Personal and Sensitive Information

Court decisions are public documents. Polish decisions from SAOS contain judge names. Czech decisions from justice.cz are anonymized by the Ministry of Justice. CzCDC decisions contain original text as published by the courts.

## Citation

```bibtex
@misc{ovcharov2026europeancourt,
  title={European Court Decisions: 3.7M Polish and Czech Court Decisions},
  author={Ovcharov, Volodymyr},
  year={2026},
  publisher={HuggingFace},
  url={https://huggingface.co/datasets/overthelex/european-court-decisions}
}
```
"""


def main():
    os.environ["HF_XET_HIGH_PERFORMANCE"] = "1"
    mode = sys.argv[1] if len(sys.argv) > 1 else "all"

    if mode in ("all", "export"):
        print("=== Exporting PL ===", flush=True)
        export_config("pl_court_decisions", PL_COLS, PL_SCHEMA,
                       OUT_DIR / "data" / "pl")

        print("\n=== Exporting CZ justice.cz ===", flush=True)
        export_config("cz_court_decisions", CZ_COLS, CZ_SCHEMA,
                       OUT_DIR / "data" / "cz-justice",
                       "source = 'justice.cz'")

        print("\n=== Exporting CZ CzCDC + Paulik ===", flush=True)
        export_config("cz_court_decisions", CZ_COLS, CZ_SCHEMA,
                       OUT_DIR / "data" / "cz-czcdc",
                       "source IN ('czcdc', 'paulik-zenodo')")

        readme_path = OUT_DIR / "README.md"
        readme_path.write_text(README)
        print(f"\nREADME written to {readme_path}", flush=True)

    if mode in ("all", "publish"):
        api = HfApi()
        create_repo(REPO_ID, repo_type="dataset", exist_ok=True)
        print(f"\nRepo {REPO_ID} ready", flush=True)

        print("Uploading...", flush=True)
        api.upload_large_folder(
            folder_path=str(OUT_DIR),
            repo_id=REPO_ID,
            repo_type="dataset",
            num_workers=8,
        )
        print(f"\nPublished: https://huggingface.co/datasets/{REPO_ID}", flush=True)


if __name__ == "__main__":
    main()
