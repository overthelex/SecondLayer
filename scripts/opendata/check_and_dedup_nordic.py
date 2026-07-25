#!/usr/bin/env python3
"""
Check fulltext coverage and deduplicate Nordic court decisions (DK, SE, FI).

Usage:
    python check_and_dedup_nordic.py all      # Run both check and dedup for all countries
    python check_and_dedup_nordic.py dk       # Check + dedup Denmark only
    python check_and_dedup_nordic.py se       # Check + dedup Sweden only
    python check_and_dedup_nordic.py fi       # Check + dedup Finland only
    python check_and_dedup_nordic.py check    # Check fulltext coverage only (all countries)
    python check_and_dedup_nordic.py dedup    # Dedup only (all countries)
"""

import hashlib
import json
import os
import re
import sys
from collections import defaultdict
from concurrent.futures import ProcessPoolExecutor, as_completed
from glob import glob
from pathlib import Path
from typing import Optional

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

MIN_FULLTEXT_LENGTH = 500
NUM_WORKERS = 20

PATHS = {
    "dk": {
        "parquet": "/home/ubuntu/opendata/denmark/huggingface/domsdatabasen/",
    },
    "se": {
        "parquet": "/home/ubuntu/opendata/sweden/huggingface/swelaw/",
        "html": "/home/ubuntu/opendata/sweden/lagen-nu/",
    },
    "fi": {
        "xml_api": "/home/ubuntu/opendata/finland/finlex-api/",
        "html_web": "/home/ubuntu/opendata/finland/finlex-web/",
        "github": "/home/ubuntu/opendata/finland/github-finlex-data/",
    },
    "uk": {
        "xml_api": "/home/ubuntu/opendata/uk/national-archives/",
        "parquet_hf1": "/home/ubuntu/opendata/uk/huggingface/uk_courts_cases/",
        "parquet_hf2": "/home/ubuntu/opendata/uk/huggingface/en-court-raw/",
    },
}

DEDUP_REPORT_DIR = {
    "dk": "/home/ubuntu/opendata/denmark/",
    "se": "/home/ubuntu/opendata/sweden/",
    "fi": "/home/ubuntu/opendata/finland/",
    "uk": "/home/ubuntu/opendata/uk/",
}

# ---------------------------------------------------------------------------
# Text extraction helpers
# ---------------------------------------------------------------------------

HTML_TAG_RE = re.compile(r"<[^>]+>")


def strip_html(html_content: str) -> str:
    """Strip HTML tags using regex."""
    return HTML_TAG_RE.sub("", html_content)


def extract_xml_text(xml_content: str) -> str:
    """Extract text content from XML body elements."""
    # Remove XML declarations and processing instructions
    text = re.sub(r"<\?[^?]+\?>", "", xml_content)
    # Remove CDATA markers
    text = re.sub(r"<!\[CDATA\[", "", text)
    text = re.sub(r"\]\]>", "", text)
    # Strip all tags
    text = HTML_TAG_RE.sub(" ", text)
    return text.strip()


def normalize_text(text: str) -> str:
    """Normalize text for dedup hashing: strip whitespace, lowercase."""
    return re.sub(r"\s+", "", text.lower())


def compute_hash(text: str) -> str:
    """SHA256 of normalized text."""
    normalized = normalize_text(text)
    return hashlib.sha256(normalized.encode("utf-8", errors="replace")).hexdigest()


# ---------------------------------------------------------------------------
# Parquet processing
# ---------------------------------------------------------------------------

TEXT_COLUMNS = ["text", "content", "full_text", "fulltext", "body"]


def find_text_column(schema):
    """Find the text column in a Parquet schema."""
    col_names = [f.name for f in schema]
    for candidate in TEXT_COLUMNS:
        if candidate in col_names:
            return candidate
    # Fallback: first string-like column with a relevant name
    for name in col_names:
        if any(kw in name.lower() for kw in ["text", "content", "body"]):
            return name
    return None


def process_parquet_file_check(filepath: str) -> dict:
    """Check a single Parquet file for fulltext coverage."""
    import pyarrow.parquet as pq

    try:
        table = pq.read_table(filepath)
    except Exception as e:
        return {"file": filepath, "error": str(e), "total": 0, "with_text": 0, "without_text": 0, "lengths": []}

    text_col = find_text_column(table.schema)
    if text_col is None:
        num_rows = table.num_rows
        return {
            "file": filepath,
            "total": num_rows,
            "with_text": 0,
            "without_text": num_rows,
            "lengths": [],
            "text_col": None,
        }

    col_data = table.column(text_col).to_pylist()
    with_text = 0
    without_text = 0
    lengths = []
    missing_samples = []

    for i, val in enumerate(col_data):
        if val and len(str(val)) >= MIN_FULLTEXT_LENGTH:
            with_text += 1
            lengths.append(len(str(val)))
        else:
            without_text += 1
            if len(missing_samples) < 5:
                missing_samples.append(f"{filepath}:row_{i}")

    return {
        "file": filepath,
        "total": len(col_data),
        "with_text": with_text,
        "without_text": without_text,
        "lengths": lengths,
        "text_col": text_col,
        "missing_samples": missing_samples,
    }


def process_parquet_file_dedup(filepath: str) -> list:
    """Hash each row in a Parquet file for dedup."""
    import pyarrow.parquet as pq

    try:
        table = pq.read_table(filepath)
    except Exception:
        return []

    text_col = find_text_column(table.schema)
    if text_col is None:
        return []

    col_data = table.column(text_col).to_pylist()
    results = []
    for i, val in enumerate(col_data):
        if val and len(str(val)) >= MIN_FULLTEXT_LENGTH:
            h = compute_hash(str(val))
            results.append((h, f"{filepath}:row_{i}"))
    return results


# ---------------------------------------------------------------------------
# File-based processing (HTML / XML)
# ---------------------------------------------------------------------------

def process_html_file_check(filepath: str) -> dict:
    """Check a single HTML file for fulltext."""
    try:
        with open(filepath, "r", encoding="utf-8", errors="replace") as f:
            content = f.read()
    except Exception as e:
        return {"file": filepath, "error": str(e), "text_len": 0, "has_fulltext": False}

    text = strip_html(content).strip()
    return {
        "file": filepath,
        "text_len": len(text),
        "has_fulltext": len(text) >= MIN_FULLTEXT_LENGTH,
    }


def process_html_file_dedup(filepath: str) -> Optional[tuple]:
    """Hash HTML file text content for dedup."""
    try:
        with open(filepath, "r", encoding="utf-8", errors="replace") as f:
            content = f.read()
    except Exception:
        return None

    text = strip_html(content).strip()
    if len(text) < MIN_FULLTEXT_LENGTH:
        return None
    return (compute_hash(text), filepath)


def process_xml_file_check(filepath: str) -> dict:
    """Check a single XML file for fulltext."""
    try:
        with open(filepath, "r", encoding="utf-8", errors="replace") as f:
            content = f.read()
    except Exception as e:
        return {"file": filepath, "error": str(e), "text_len": 0, "has_fulltext": False}

    text = extract_xml_text(content)
    return {
        "file": filepath,
        "text_len": len(text),
        "has_fulltext": len(text) >= MIN_FULLTEXT_LENGTH,
    }


def process_xml_file_dedup(filepath: str) -> Optional[tuple]:
    """Hash XML file text content for dedup."""
    try:
        with open(filepath, "r", encoding="utf-8", errors="replace") as f:
            content = f.read()
    except Exception:
        return None

    text = extract_xml_text(content)
    if len(text) < MIN_FULLTEXT_LENGTH:
        return None
    return (compute_hash(text), filepath)


def process_github_file_check(filepath: str) -> dict:
    """Check a GitHub data file (XML or JSON)."""
    ext = Path(filepath).suffix.lower()
    if ext == ".json":
        try:
            with open(filepath, "r", encoding="utf-8", errors="replace") as f:
                data = json.load(f)
            # Try common keys for text content
            text = ""
            for key in ["text", "content", "body", "full_text"]:
                if key in data and data[key]:
                    text = str(data[key])
                    break
            if not text and isinstance(data, dict):
                # Concatenate all string values
                text = " ".join(str(v) for v in data.values() if isinstance(v, str))
            return {"file": filepath, "text_len": len(text), "has_fulltext": len(text) >= MIN_FULLTEXT_LENGTH}
        except Exception as e:
            return {"file": filepath, "error": str(e), "text_len": 0, "has_fulltext": False}
    elif ext == ".xml":
        return process_xml_file_check(filepath)
    else:
        return {"file": filepath, "text_len": 0, "has_fulltext": False}


def process_github_file_dedup(filepath: str) -> Optional[tuple]:
    """Hash a GitHub data file for dedup."""
    ext = Path(filepath).suffix.lower()
    if ext == ".json":
        try:
            with open(filepath, "r", encoding="utf-8", errors="replace") as f:
                data = json.load(f)
            text = ""
            for key in ["text", "content", "body", "full_text"]:
                if key in data and data[key]:
                    text = str(data[key])
                    break
            if not text and isinstance(data, dict):
                text = " ".join(str(v) for v in data.values() if isinstance(v, str))
            if len(text) < MIN_FULLTEXT_LENGTH:
                return None
            return (compute_hash(text), filepath)
        except Exception:
            return None
    elif ext == ".xml":
        return process_xml_file_dedup(filepath)
    return None


# ---------------------------------------------------------------------------
# Check fulltext coverage
# ---------------------------------------------------------------------------

def check_parquet_source(label: str, base_path: str) -> dict:
    """Check Parquet-based source."""
    if not os.path.exists(base_path):
        print(f"  [{label}] Path not found: {base_path}")
        return {"source": label, "path": base_path, "exists": False}

    parquet_files = glob(os.path.join(base_path, "**/*.parquet"), recursive=True)
    if not parquet_files:
        print(f"  [{label}] No Parquet files found in {base_path}")
        return {"source": label, "path": base_path, "exists": True, "total_files": 0}

    print(f"  [{label}] Processing {len(parquet_files)} Parquet files...")

    total = 0
    with_text = 0
    without_text = 0
    all_lengths = []
    missing_samples = []

    with ProcessPoolExecutor(max_workers=NUM_WORKERS) as executor:
        futures = {executor.submit(process_parquet_file_check, f): f for f in parquet_files}
        for future in as_completed(futures):
            result = future.result()
            if "error" in result:
                print(f"    Warning: {result['file']}: {result['error']}")
                continue
            total += result["total"]
            with_text += result["with_text"]
            without_text += result["without_text"]
            all_lengths.extend(result["lengths"])
            if "missing_samples" in result:
                missing_samples.extend(result["missing_samples"])

    avg_len = sum(all_lengths) / len(all_lengths) if all_lengths else 0

    report = {
        "source": label,
        "path": base_path,
        "exists": True,
        "total_files": len(parquet_files),
        "total_rows": total,
        "with_fulltext": with_text,
        "without_fulltext": without_text,
        "avg_text_length": int(avg_len),
        "missing_samples": missing_samples[:5],
    }

    print(f"    Total rows: {total}")
    print(f"    With fulltext (>={MIN_FULLTEXT_LENGTH} chars): {with_text}")
    print(f"    Without fulltext: {without_text}")
    print(f"    Average text length: {int(avg_len)}")
    if missing_samples:
        print(f"    Missing fulltext samples: {missing_samples[:5]}")

    return report


def check_file_source(label: str, base_path: str, pattern: str, processor) -> dict:
    """Check file-based source (HTML/XML)."""
    if not os.path.exists(base_path):
        print(f"  [{label}] Path not found: {base_path}")
        return {"source": label, "path": base_path, "exists": False}

    files = glob(os.path.join(base_path, pattern), recursive=True)
    if not files:
        print(f"  [{label}] No files matching {pattern} in {base_path}")
        return {"source": label, "path": base_path, "exists": True, "total_files": 0}

    print(f"  [{label}] Processing {len(files)} files...")

    with_text = 0
    without_text = 0
    all_lengths = []
    missing_samples = []

    with ProcessPoolExecutor(max_workers=NUM_WORKERS) as executor:
        futures = {executor.submit(processor, f): f for f in files}
        done_count = 0
        for future in as_completed(futures):
            done_count += 1
            if done_count % 10000 == 0:
                print(f"    Progress: {done_count}/{len(files)}")
            result = future.result()
            if "error" in result:
                continue
            if result["has_fulltext"]:
                with_text += 1
                all_lengths.append(result["text_len"])
            else:
                without_text += 1
                if len(missing_samples) < 5:
                    missing_samples.append(result["file"])

    total = with_text + without_text
    avg_len = sum(all_lengths) / len(all_lengths) if all_lengths else 0

    report = {
        "source": label,
        "path": base_path,
        "exists": True,
        "total_files": total,
        "with_fulltext": with_text,
        "without_fulltext": without_text,
        "avg_text_length": int(avg_len),
        "missing_samples": missing_samples[:5],
    }

    print(f"    Total files: {total}")
    print(f"    With fulltext (>={MIN_FULLTEXT_LENGTH} chars): {with_text}")
    print(f"    Without fulltext: {without_text}")
    print(f"    Average text length: {int(avg_len)}")
    if missing_samples:
        print(f"    Missing fulltext samples: {missing_samples[:5]}")

    return report


def check_country(country: str) -> list:
    """Run fulltext check for a country."""
    print(f"\n{'='*60}")
    print(f"  FULLTEXT CHECK: {country.upper()}")
    print(f"{'='*60}")

    reports = []

    if country == "dk":
        reports.append(check_parquet_source("DK Domsdatabasen (Parquet)", PATHS["dk"]["parquet"]))

    elif country == "se":
        reports.append(check_parquet_source("SE SweLaw (Parquet)", PATHS["se"]["parquet"]))
        reports.append(check_file_source(
            "SE lagen.nu (HTML)", PATHS["se"]["html"], "**/*.html", process_html_file_check
        ))

    elif country == "fi":
        reports.append(check_file_source(
            "FI Finlex API (XML)", PATHS["fi"]["xml_api"], "**/*.xml", process_xml_file_check
        ))
        reports.append(check_file_source(
            "FI Finlex Web (HTML)", PATHS["fi"]["html_web"], "**/*.html", process_html_file_check
        ))
        # GitHub data can be XML or JSON
        github_path = PATHS["fi"]["github"]
        if os.path.exists(github_path):
            github_files = (
                glob(os.path.join(github_path, "**/*.xml"), recursive=True)
                + glob(os.path.join(github_path, "**/*.json"), recursive=True)
            )
            if github_files:
                reports.append(check_file_source(
                    "FI GitHub finlex-data (XML/JSON)", github_path, "**/*.[xj]*", process_github_file_check
                ))
            else:
                print(f"  [FI GitHub] No XML/JSON files in {github_path}")
                reports.append({"source": "FI GitHub finlex-data", "path": github_path, "exists": True, "total_files": 0})
        else:
            print(f"  [FI GitHub] Path not found: {github_path}")
            reports.append({"source": "FI GitHub finlex-data", "path": github_path, "exists": False})

    elif country == "uk":
        reports.append(check_file_source(
            "UK National Archives (XML)", PATHS["uk"]["xml_api"], "**/*.xml", process_xml_file_check
        ))
        hf1 = PATHS["uk"]["parquet_hf1"]
        if os.path.exists(hf1) and glob(os.path.join(hf1, "**/*.parquet"), recursive=True):
            reports.append(check_parquet_source("UK HF uk_courts_cases (Parquet)", hf1))
        hf2 = PATHS["uk"]["parquet_hf2"]
        if os.path.exists(hf2) and glob(os.path.join(hf2, "**/*.parquet"), recursive=True):
            reports.append(check_parquet_source("UK HF JuDDGES en-court-raw (Parquet)", hf2))

    return reports


# ---------------------------------------------------------------------------
# Deduplication
# ---------------------------------------------------------------------------

def dedup_parquet_source(label: str, base_path: str) -> dict:
    """Dedup a Parquet-based source."""
    if not os.path.exists(base_path):
        return {"source": label, "exists": False}

    parquet_files = glob(os.path.join(base_path, "**/*.parquet"), recursive=True)
    if not parquet_files:
        return {"source": label, "exists": True, "total_files": 0}

    print(f"  [{label}] Hashing rows from {len(parquet_files)} Parquet files...")

    hash_to_locations = defaultdict(list)

    with ProcessPoolExecutor(max_workers=NUM_WORKERS) as executor:
        futures = {executor.submit(process_parquet_file_dedup, f): f for f in parquet_files}
        for future in as_completed(futures):
            results = future.result()
            for h, loc in results:
                hash_to_locations[h].append(loc)

    total = sum(len(v) for v in hash_to_locations.values())
    unique = len(hash_to_locations)
    duplicate_groups = {h: locs for h, locs in hash_to_locations.items() if len(locs) > 1}
    duplicate_count = sum(len(locs) - 1 for locs in duplicate_groups.values())

    print(f"    Total hashed rows: {total}")
    print(f"    Unique texts: {unique}")
    print(f"    Duplicate rows: {duplicate_count}")
    print(f"    Duplicate groups: {len(duplicate_groups)}")

    return {
        "source": label,
        "total_files": total,
        "unique_texts": unique,
        "duplicate_count": duplicate_count,
        "duplicate_groups": [
            {"hash": h, "count": len(locs), "files": locs[:10]}
            for h, locs in list(duplicate_groups.items())[:100]
        ],
    }


def dedup_file_source(label: str, base_path: str, pattern: str, processor) -> dict:
    """Dedup a file-based source."""
    if not os.path.exists(base_path):
        return {"source": label, "exists": False}

    files = glob(os.path.join(base_path, pattern), recursive=True)
    if not files:
        return {"source": label, "exists": True, "total_files": 0}

    print(f"  [{label}] Hashing {len(files)} files...")

    hash_to_locations = defaultdict(list)

    with ProcessPoolExecutor(max_workers=NUM_WORKERS) as executor:
        futures = {executor.submit(processor, f): f for f in files}
        done_count = 0
        for future in as_completed(futures):
            done_count += 1
            if done_count % 10000 == 0:
                print(f"    Progress: {done_count}/{len(files)}")
            result = future.result()
            if result is not None:
                h, loc = result
                hash_to_locations[h].append(loc)

    total = sum(len(v) for v in hash_to_locations.values())
    unique = len(hash_to_locations)
    duplicate_groups = {h: locs for h, locs in hash_to_locations.items() if len(locs) > 1}
    duplicate_count = sum(len(locs) - 1 for locs in duplicate_groups.values())

    print(f"    Total hashed files: {total}")
    print(f"    Unique texts: {unique}")
    print(f"    Duplicate files: {duplicate_count}")
    print(f"    Duplicate groups: {len(duplicate_groups)}")

    return {
        "source": label,
        "total_files": total,
        "unique_texts": unique,
        "duplicate_count": duplicate_count,
        "duplicate_groups": [
            {"hash": h, "count": len(locs), "files": locs[:10]}
            for h, locs in list(duplicate_groups.items())[:100]
        ],
    }


def dedup_country(country: str) -> dict:
    """Run dedup for a country."""
    print(f"\n{'='*60}")
    print(f"  DEDUPLICATION: {country.upper()}")
    print(f"{'='*60}")

    sources = []

    if country == "dk":
        sources.append(dedup_parquet_source("DK Domsdatabasen (Parquet)", PATHS["dk"]["parquet"]))

    elif country == "se":
        sources.append(dedup_parquet_source("SE SweLaw (Parquet)", PATHS["se"]["parquet"]))
        sources.append(dedup_file_source(
            "SE lagen.nu (HTML)", PATHS["se"]["html"], "**/*.html", process_html_file_dedup
        ))

    elif country == "fi":
        sources.append(dedup_file_source(
            "FI Finlex API (XML)", PATHS["fi"]["xml_api"], "**/*.xml", process_xml_file_dedup
        ))
        sources.append(dedup_file_source(
            "FI Finlex Web (HTML)", PATHS["fi"]["html_web"], "**/*.html", process_html_file_dedup
        ))
        github_path = PATHS["fi"]["github"]
        if os.path.exists(github_path):
            github_files = (
                glob(os.path.join(github_path, "**/*.xml"), recursive=True)
                + glob(os.path.join(github_path, "**/*.json"), recursive=True)
            )
            if github_files:
                sources.append(dedup_file_source(
                    "FI GitHub finlex-data (XML/JSON)", github_path, "**/*.[xj]*", process_github_file_dedup
                ))

    elif country == "uk":
        sources.append(dedup_file_source(
            "UK National Archives (XML)", PATHS["uk"]["xml_api"], "**/*.xml", process_xml_file_dedup
        ))
        hf1 = PATHS["uk"]["parquet_hf1"]
        if os.path.exists(hf1) and glob(os.path.join(hf1, "**/*.parquet"), recursive=True):
            sources.append(dedup_parquet_source("UK HF uk_courts_cases (Parquet)", hf1))
        hf2 = PATHS["uk"]["parquet_hf2"]
        if os.path.exists(hf2) and glob(os.path.join(hf2, "**/*.parquet"), recursive=True):
            sources.append(dedup_parquet_source("UK HF JuDDGES en-court-raw (Parquet)", hf2))

    # Aggregate report
    total_files = sum(s.get("total_files", 0) for s in sources)
    unique_texts = sum(s.get("unique_texts", 0) for s in sources)
    duplicate_count = sum(s.get("duplicate_count", 0) for s in sources)
    all_groups = []
    for s in sources:
        all_groups.extend(s.get("duplicate_groups", []))

    report = {
        "country": country.upper(),
        "total_files": total_files,
        "unique_texts": unique_texts,
        "duplicate_count": duplicate_count,
        "sources": sources,
        "duplicate_groups": all_groups,
    }

    # Write report
    report_dir = DEDUP_REPORT_DIR.get(country)
    if report_dir:
        os.makedirs(report_dir, exist_ok=True)
        report_path = os.path.join(report_dir, "dedup_report.json")
        with open(report_path, "w", encoding="utf-8") as f:
            json.dump(report, f, indent=2, ensure_ascii=False)
        print(f"\n  Report written to: {report_path}")

    return report


# ---------------------------------------------------------------------------
# Summary table
# ---------------------------------------------------------------------------

def print_summary(check_results: dict, dedup_results: dict):
    """Print final summary table."""
    print(f"\n{'='*80}")
    print(f"  SUMMARY")
    print(f"{'='*80}")

    header = f"{'Country':<6} {'Source':<35} {'Total':<10} {'With FT':<10} {'No FT':<10} {'Avg Len':<10} {'Dupes':<8}"
    print(header)
    print("-" * 80)

    for country in ["dk", "se", "fi"]:
        checks = check_results.get(country, [])
        dedup = dedup_results.get(country, {})
        dedup_sources = {s["source"]: s for s in dedup.get("sources", [])} if dedup else {}

        for cr in checks:
            if not cr.get("exists", False):
                continue
            source = cr.get("source", "?")
            total = cr.get("total_rows", cr.get("total_files", 0))
            with_ft = cr.get("with_fulltext", 0)
            without_ft = cr.get("without_fulltext", 0)
            avg_len = cr.get("avg_text_length", 0)
            dupes = dedup_sources.get(source, {}).get("duplicate_count", 0)
            print(f"{country.upper():<6} {source[:35]:<35} {total:<10} {with_ft:<10} {without_ft:<10} {avg_len:<10} {dupes:<8}")

    print("-" * 80)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    mode = sys.argv[1].lower()

    countries = []
    run_check = True
    run_dedup = True

    all_countries = ["dk", "se", "fi", "uk"]

    if mode == "all":
        countries = all_countries
    elif mode in all_countries:
        countries = [mode]
    elif mode == "check":
        countries = all_countries
        run_dedup = False
    elif mode == "dedup":
        countries = all_countries
        run_check = False
    else:
        print(f"Unknown mode: {mode}")
        print(__doc__)
        sys.exit(1)

    check_results = {}
    dedup_results = {}

    for country in countries:
        if run_check:
            check_results[country] = check_country(country)
        if run_dedup:
            dedup_results[country] = dedup_country(country)

    print_summary(check_results, dedup_results)
    print("\nDone.")


if __name__ == "__main__":
    main()
