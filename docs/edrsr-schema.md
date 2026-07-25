# ЄДРСР — Schema (Court Decisions Registry)

Data model for the Ukrainian State Register of Court Decisions (ЄДРСР) as stored in
`secondlayer_prod`. Source data comes from the open-data yearly dumps
(`data.gov.ua` → `edrsr_data_YYYY.zip`, TSV) plus per-document full texts fetched
from `od.reyestr.court.gov.ua`.

- **~100.9M** decisions (`edrsr_documents`), **~99.5M** with full text (`edrsr_fulltext`).
- Both fact tables are **partitioned by year**; the open-data dump is metadata-only
  (full text is fetched separately by `edrsr-fulltext-worker` via `doc_url`).

## Source vs. prod

| Open-data dump (TSV in `edrsr_data_YYYY.zip`) | Prod table |
|---|---|
| `instances.csv` (instance_code, name) | `edrsr_instances` |
| `regions.csv` (region_code, name) | `edrsr_regions` |
| `courts.csv` (court_code, name, instance_code, region_code) | `edrsr_courts` |
| `justice_kinds.csv` (justice_kind, name) | `edrsr_justice_kinds` |
| `judgment_forms.csv` (judgment_code, name) | `edrsr_judgment_forms` |
| `cause_categories.csv` (category_code, name) | `edrsr_cause_categories` |
| `documents.csv` (12 cols) | `edrsr_documents` (1:1) |
| — (no full text in dump) | `edrsr_fulltext` (fetched via `doc_url`) |

Everything beyond the dump — `edrsr_fulltext`, `tsv`, `edrsr_case_index`,
`edrsr_parties`, `edrsr_lexeme_df` — is derived/enriched in-house.

## Current schema (as-is on prod)

```mermaid
erDiagram
    edrsr_instances ||--o{ edrsr_courts : "instance_code"
    edrsr_regions ||--o{ edrsr_courts : "region_code"
    edrsr_courts ||--o{ edrsr_documents : "court_code"
    edrsr_justice_kinds ||--o{ edrsr_documents : "justice_kind"
    edrsr_judgment_forms ||--o{ edrsr_documents : "judgment_code"
    edrsr_cause_categories ||--o{ edrsr_documents : "category_code"
    edrsr_documents ||--o| edrsr_fulltext : "doc_id (1:1)"
    edrsr_documents ||--o{ edrsr_parties : "doc_id"
    edrsr_documents ||--o| edrsr_fulltext_failed : "doc_id (fetch failed)"
    edrsr_case_index ||--o{ edrsr_documents : "cause_num (case group)"

    edrsr_documents {
        bigint      doc_id PK
        integer     court_code FK
        smallint    judgment_code FK
        smallint    justice_kind FK
        integer     category_code FK
        text        cause_num
        timestamptz adjudication_date "RANGE partition key"
        timestamptz receipt_date
        text        judge
        text        doc_url "od.reyestr.court.gov.ua/files/…rtf"
        smallint    status
        timestamptz date_publ
    }
    edrsr_fulltext {
        bigint      doc_id PK
        text        full_text
        integer     text_length
        tsvector    tsv "GIN, FTS"
        smallint    adj_year "LIST partition key"
        timestamp   created_at
        smallint    justice_kind
    }
    edrsr_parties {
        bigint      doc_id FK
        smallint    role
        smallint    ord
        text        name_raw
        text        name_norm
        text        edrpou
        integer     court_code
        smallint    justice_kind
        timestamptz adjudication_date
        smallint    adj_year
    }
    edrsr_fulltext_failed {
        bigint      doc_id PK
        text        reason "404 | empty_rtf | http_5xx"
        timestamp   created_at
    }
    edrsr_case_index {
        text        cause_num PK
        integer     member_count
        timestamptz first_date
        timestamptz last_date
        bigint      latest_doc_id
    }
    edrsr_courts {
        integer     court_code PK
        text        name
        integer     instance_code FK
        integer     region_code FK
    }
    edrsr_instances {
        integer     instance_code PK
        text        name
    }
    edrsr_regions {
        integer     region_code PK
        text        name
    }
    edrsr_justice_kinds {
        smallint    justice_kind PK
        text        name
    }
    edrsr_judgment_forms {
        smallint    judgment_code PK
        text        name
    }
    edrsr_cause_categories {
        integer     category_code PK
        text        name
    }
```

### Partitioning

| Table | Strategy | Key | Partitions |
|---|---|---|---|
| `edrsr_documents` | RANGE | `adjudication_date` (timestamptz) | `_p_YYYY`, `_p_pre2005`, `_p_default`, `_p_future` |
| `edrsr_fulltext` | LIST | `adj_year` (smallint) | `_p_YYYY`, `_p_pre2005`, `_p_default`, `_p_future` |
| `edrsr_parties` | LIST | `adj_year` | `_p_*` |

Per-partition indexes on `edrsr_fulltext_p_YYYY`: `GIN(tsv)` for FTS,
`UNIQUE(doc_id)`. Join `documents` ↔ `fulltext` by `doc_id`.

> Note: the two fact tables use different partition keys (RANGE-date vs LIST-year).
> They work (joined by `doc_id`), but a single year key would simplify maintenance.

## Proposed: original-document storage layer

The registry serves **RTF**; other corpora are **PDF / HTML**. Today only the
extracted plain text is kept. To preserve provenance and allow re-extraction,
store originals in **MinIO** (object storage) and keep a reference + provenance
row in Postgres. Do **not** store PDFs/HTML as `bytea` in Postgres.

```mermaid
erDiagram
    edrsr_documents ||--o| document_source : "doc_id"
    document_source {
        bigint      doc_id PK
        text        source_format "pdf | html | rtf | docx"
        text        object_key "MinIO: edrsr/rtf/2015/{doc_id}.rtf"
        char        sha256 "integrity + dedup"
        bigint      byte_size
        text        content_type
        timestamptz fetched_at
        text        extractor "pdftotext | unrtf | readability"
        text        extract_status "ok | ocr | empty | failed"
    }
```

- **Original** (PDF/HTML/RTF) → MinIO, keyed by `object_key`; gzip HTML before upload.
- **Searchable text** → stays in `edrsr_fulltext` (+ `tsv`); enable
  `toast.compression = lz4` on `full_text` (PG15).
- **Provenance** → `document_source` (`sha256` catches the "HTML page saved as .rtf"
  poisoning class of bug; `source_format` drives format-specific re-extraction).
- Optional big win: offload `full_text` bytes to MinIO too, keeping only
  `tsv` + `text_length` + a short preview in PG → shrinks the ~1.9 TB DB and speeds
  backups (trade-off: one MinIO fetch to render a decision).
