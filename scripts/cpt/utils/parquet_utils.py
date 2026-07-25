"""Parquet I/O helpers for CPT pipeline."""

import os
import glob
import pyarrow as pa
import pyarrow.parquet as pq


EDRSR_SCHEMA = pa.schema([
    pa.field("doc_id", pa.int64()),
    pa.field("full_text", pa.large_string()),
    pa.field("text_length", pa.int32()),
    pa.field("adj_year", pa.int16()),
    pa.field("justice_kind", pa.int8()),
    pa.field("judgment_code", pa.int8()),
    pa.field("adjudication_date", pa.string()),
    pa.field("court_code", pa.int32()),
    pa.field("source", pa.string()),
])

LEGISLATION_SCHEMA = pa.schema([
    pa.field("doc_id", pa.string()),
    pa.field("full_text", pa.large_string()),
    pa.field("text_length", pa.int32()),
    pa.field("title", pa.string()),
    pa.field("source", pa.string()),
])

GENERIC_SCHEMA = pa.schema([
    pa.field("doc_id", pa.string()),
    pa.field("full_text", pa.large_string()),
    pa.field("text_length", pa.int32()),
    pa.field("source", pa.string()),
    pa.field("metadata", pa.string()),
])


def shard_path(output_dir: str, prefix: str, shard_idx: int) -> str:
    return os.path.join(output_dir, f"{prefix}_{shard_idx:05d}.parquet")


def write_shard(rows: list[dict], schema: pa.Schema, output_path: str):
    arrays = {}
    for field in schema:
        values = [r.get(field.name) for r in rows]
        arrays[field.name] = values
    table = pa.table(arrays, schema=schema)
    pq.write_table(table, output_path, compression="zstd")
    return len(rows)


def list_shards(directory: str, prefix: str = "*") -> list[str]:
    pattern = os.path.join(directory, f"{prefix}*.parquet")
    return sorted(glob.glob(pattern))


def read_shard(path: str) -> pa.Table:
    return pq.read_table(path)


def count_rows_in_dir(directory: str) -> int:
    total = 0
    for path in list_shards(directory):
        meta = pq.read_metadata(path)
        total += meta.num_rows
    return total


def total_size_gb(directory: str) -> float:
    total = 0
    for path in list_shards(directory):
        total += os.path.getsize(path)
    return total / (1024 ** 3)
