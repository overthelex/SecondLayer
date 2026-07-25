#!/usr/bin/env python3
"""
Mirror Indian court judgments from public AWS S3 buckets to our S3 bucket.

Sources (CC-BY-4.0, Dattam Labs):
  - Supreme Court: s3://indian-supreme-court-judgments (ap-south-1)
  - High Courts:   s3://indian-high-court-judgments   (ap-south-1)

Destination: s3://lexai-corpus-india-judgments (eu-central-1)
"""

import argparse
import json
import sys
import time
import logging
from datetime import datetime, timezone
from pathlib import Path

import boto3
from botocore import UNSIGNED
from botocore.config import Config

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("india-mirror")

SOURCE_REGION = "ap-south-1"
DEST_REGION = "eu-central-1"
DEST_BUCKET = "lexai-corpus-india-judgments"

SOURCES = {
    "supreme-court": {
        "bucket": "indian-supreme-court-judgments",
        "prefix_map": "supreme-court",
    },
    "high-courts": {
        "bucket": "indian-high-court-judgments",
        "prefix_map": "high-courts",
    },
}

STATE_KEY = "_state/sync-state.json"
MAX_RETRIES = 5


def get_source_client():
    return boto3.client("s3", region_name=SOURCE_REGION, config=Config(signature_version=UNSIGNED))


def get_dest_client():
    return boto3.client("s3", region_name=DEST_REGION)


def load_state(dest_client):
    try:
        resp = dest_client.get_object(Bucket=DEST_BUCKET, Key=STATE_KEY)
        return json.loads(resp["Body"].read())
    except dest_client.exceptions.NoSuchKey:
        return {}


def save_state(dest_client, state):
    dest_client.put_object(
        Bucket=DEST_BUCKET,
        Key=STATE_KEY,
        Body=json.dumps(state, indent=2, default=str),
        ContentType="application/json",
    )


def list_objects(client, bucket, prefix="", year_filter=None, court_filter=None):
    paginator = client.get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
        for obj in page.get("Contents", []):
            key = obj["Key"]
            if year_filter:
                matched = False
                for y in year_filter:
                    if f"year={y}" in key:
                        matched = True
                        break
                if not matched:
                    continue
            if court_filter:
                matched = False
                for c in court_filter:
                    if f"court={c}" in key:
                        matched = True
                        break
                if not matched:
                    continue
            yield obj


def copy_with_retry(source_client, dest_client, src_bucket, src_key, dest_key, storage_class):
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            dest_client.copy_object(
                Bucket=DEST_BUCKET,
                Key=dest_key,
                CopySource={"Bucket": src_bucket, "Key": src_key},
                StorageClass=storage_class,
                MetadataDirective="COPY",
            )
            return True
        except Exception as e:
            if attempt == MAX_RETRIES:
                log.error("FAILED after %d attempts: %s -> %s: %s", MAX_RETRIES, src_key, dest_key, e)
                return False
            wait = 2 ** attempt
            log.warning("Retry %d/%d for %s (wait %ds): %s", attempt, MAX_RETRIES, src_key, wait, e)
            time.sleep(wait)
    return False


def storage_class_for_key(key):
    if key.endswith(".parquet") or key.endswith(".json"):
        return "STANDARD"
    return "STANDARD_IA"


def sync_source(source_name, years=None, courts=None, dry_run=False, full=False, include_pdf=False):
    src_cfg = SOURCES[source_name]
    src_bucket = src_cfg["bucket"]
    dest_prefix = src_cfg["prefix_map"]

    source_client = get_source_client()
    dest_client = get_dest_client()

    state = {} if full else load_state(dest_client)
    source_state = state.setdefault(source_name, {"synced_keys": {}})
    synced = source_state["synced_keys"]

    prefixes_to_scan = []
    if not include_pdf and source_name == "high-courts":
        prefixes_to_scan = ["data/tar/", "metadata/parquet/", "metadata/tar/"]
    elif not include_pdf and source_name == "supreme-court":
        prefixes_to_scan = ["data/tar/", "metadata/parquet/", "metadata/tar/"]
    else:
        prefixes_to_scan = [""]

    stats = {"copied": 0, "skipped": 0, "errors": 0, "bytes_copied": 0}
    run_start = datetime.now(timezone.utc)

    for prefix in prefixes_to_scan:
        log.info("Scanning %s/%s ...", src_bucket, prefix)
        for obj in list_objects(source_client, src_bucket, prefix, years, courts):
            src_key = obj["Key"]
            dest_key = f"{dest_prefix}/{src_key}"
            etag = obj["ETag"]
            size = obj["Size"]

            if src_key in synced and synced[src_key].get("etag") == etag:
                stats["skipped"] += 1
                continue

            sc = storage_class_for_key(src_key)

            if dry_run:
                log.info("DRY-RUN | would copy %s (%s bytes, %s)", src_key, size, sc)
                stats["copied"] += 1
                stats["bytes_copied"] += size
                continue

            log.info("COPY | %s | %s | %.2f MB", source_name, src_key, size / 1024 / 1024)
            ok = copy_with_retry(source_client, dest_client, src_bucket, src_key, dest_key, sc)

            if ok:
                stats["copied"] += 1
                stats["bytes_copied"] += size
                synced[src_key] = {
                    "etag": etag,
                    "size": size,
                    "synced_at": datetime.now(timezone.utc).isoformat(),
                }
                if stats["copied"] % 50 == 0:
                    source_state["last_sync"] = datetime.now(timezone.utc).isoformat()
                    save_state(dest_client, state)
            else:
                stats["errors"] += 1

    if not dry_run:
        source_state["last_sync"] = datetime.now(timezone.utc).isoformat()
        save_state(dest_client, state)

    run_end = datetime.now(timezone.utc)
    run_report = {
        "started_at": run_start.isoformat(),
        "finished_at": run_end.isoformat(),
        "duration_seconds": (run_end - run_start).total_seconds(),
        "source": source_name,
        **stats,
    }

    if not dry_run:
        run_key = f"_state/runs/{run_start.strftime('%Y%m%dT%H%M%S')}_{source_name}.json"
        dest_client.put_object(
            Bucket=DEST_BUCKET,
            Key=run_key,
            Body=json.dumps(run_report, indent=2),
            ContentType="application/json",
        )

    log.info(
        "DONE | %s | copied=%d skipped=%d errors=%d bytes=%.2f GB | %.0fs",
        source_name,
        stats["copied"],
        stats["skipped"],
        stats["errors"],
        stats["bytes_copied"] / 1024 / 1024 / 1024,
        run_report["duration_seconds"],
    )
    return run_report


def show_status():
    dest_client = get_dest_client()
    state = load_state(dest_client)
    if not state:
        print("No sync state found. Run sync first.")
        return

    for source_name, sdata in state.items():
        keys = sdata.get("synced_keys", {})
        total_bytes = sum(v.get("size", 0) for v in keys.values())
        print(f"\n{source_name}:")
        print(f"  Last sync: {sdata.get('last_sync', 'never')}")
        print(f"  Objects:   {len(keys)}")
        print(f"  Size:      {total_bytes / 1024 / 1024 / 1024:.2f} GB")


def parse_years(years_str):
    if not years_str:
        return None
    if "-" in years_str:
        start, end = years_str.split("-", 1)
        return [str(y) for y in range(int(start), int(end) + 1)]
    return [years_str]


def main():
    parser = argparse.ArgumentParser(description="Mirror Indian court judgments to our S3")
    sub = parser.add_subparsers(dest="command")

    sync_p = sub.add_parser("sync", help="Sync data from source to destination")
    sync_p.add_argument("--source", choices=["supreme-court", "high-courts", "all"], default="all")
    sync_p.add_argument("--years", type=str, help="Year or range: 2024 or 2020-2025")
    sync_p.add_argument("--courts", type=str, help="Comma-separated court IDs (HC only)")
    sync_p.add_argument("--dry-run", action="store_true")
    sync_p.add_argument("--full", action="store_true", help="Ignore state, re-sync everything")
    sync_p.add_argument("--include-pdf", action="store_true", help="Also sync individual PDFs")

    sub.add_parser("status", help="Show sync status")

    args = parser.parse_args()

    if args.command == "status":
        show_status()
        return

    if args.command == "sync":
        years = parse_years(args.years)
        courts = args.courts.split(",") if args.courts else None
        sources = ["supreme-court", "high-courts"] if args.source == "all" else [args.source]

        for src in sources:
            if courts and src == "supreme-court":
                log.warning("--courts ignored for supreme-court source")
                courts_for_src = None
            else:
                courts_for_src = courts
            sync_source(src, years=years, courts=courts_for_src, dry_run=args.dry_run, full=args.full, include_pdf=args.include_pdf)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
