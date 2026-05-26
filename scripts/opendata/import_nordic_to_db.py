#!/usr/bin/env python3
"""Import Nordic court decisions (DK, SE, FI, IS) into PostgreSQL (parallel)."""

import json
import os
import sys
import re
import time
from pathlib import Path
from concurrent.futures import ProcessPoolExecutor, as_completed

import psycopg2
from psycopg2.extras import execute_values

DB_URL = os.environ.get("DATABASE_URL", "postgresql://secondlayer:secondlayer@localhost:5432/secondlayer_prod")
MAX_WORKERS = 20
BATCH_SIZE = 500

DK_BASE = Path("/home/ubuntu/opendata/denmark")
SE_BASE = Path("/home/ubuntu/opendata/sweden")
FI_BASE = Path("/home/ubuntu/opendata/finland")
IS_BASE = Path("/home/ubuntu/opendata/iceland")

CHECKPOINT_DIR = Path("/home/ubuntu/opendata/.checkpoints")
CHECKPOINT_DIR.mkdir(parents=True, exist_ok=True)


def get_conn():
    return psycopg2.connect(DB_URL)


def clean_str(s):
    """Remove null bytes that PostgreSQL rejects."""
    if s is None:
        return None
    if isinstance(s, str):
        return s.replace("\x00", "")
    return s


def clean_json(obj):
    """Recursively remove null bytes from JSON-serializable object."""
    if obj is None:
        return None
    s = json.dumps(obj, default=str)
    return s.replace("\\u0000", "").replace("\x00", "")


def clean_date(val):
    """Validate and clean a date value. Returns YYYY-MM-DD string or None."""
    if val is None:
        return None
    s = str(val)[:10]
    if len(s) < 8 or not s[:4].isdigit():
        return None
    return s


def load_checkpoint(name: str) -> set:
    cp_file = CHECKPOINT_DIR / f"nordic_{name}.json"
    if cp_file.exists():
        return set(json.loads(cp_file.read_text()))
    return set()


def save_checkpoint(name: str, done: set):
    cp_file = CHECKPOINT_DIR / f"nordic_{name}.json"
    cp_file.write_text(json.dumps(list(done)))


def strip_html(html_text: str) -> str:
    """Strip HTML tags and return plain text."""
    if not html_text:
        return ""
    text = re.sub(r'<script[^>]*>.*?</script>', '', html_text, flags=re.DOTALL)
    text = re.sub(r'<style[^>]*>.*?</style>', '', text, flags=re.DOTALL)
    text = re.sub(r'<[^>]+>', ' ', text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text


# ============================================================
# DENMARK: HuggingFace domsdatabasen (Parquet)
# ============================================================

def import_dk_hf_file(filepath: str) -> int:
    try:
        import pyarrow.parquet as pq
    except ImportError:
        print("pyarrow not installed, skipping HF parquet import")
        return 0

    table = pq.read_table(filepath)
    df_cols = table.column_names
    batch_rows = []
    count = 0

    for i in range(table.num_rows):
        row = {col: table.column(col)[i].as_py() for col in df_cols}

        record_id = f"hf-domsdatabasen-{i}-{Path(filepath).stem}"
        court = row.get("court") or row.get("court_name")
        case_type = row.get("case_type") or row.get("type")
        text = row.get("text") or row.get("content") or row.get("full_text", "")
        anonymized = row.get("anonymized_text")
        case_number = row.get("case_number") or row.get("case_id")
        decision_date = row.get("date") or row.get("decision_date")
        ecli = row.get("ecli")
        abstract = row.get("abstract") or row.get("summary")

        meta = {k: v for k, v in row.items()
                if k not in ("court", "court_name", "case_type", "type", "text",
                             "content", "full_text", "anonymized_text", "case_number",
                             "case_id", "date", "decision_date", "ecli", "abstract", "summary")}

        batch_rows.append((
            record_id,
            clean_str(ecli),
            "hf-domsdatabasen",
            clean_str(court),
            None,
            clean_str(case_number),
            clean_str(case_type),
            clean_date(decision_date),
            None,
            None,
            clean_str(abstract),
            clean_str(text),
            clean_str(anonymized),
            None,
            clean_json(meta) if meta else None,
        ))

        if len(batch_rows) >= BATCH_SIZE:
            _flush_dk_batch(batch_rows)
            count += len(batch_rows)
            batch_rows = []

    if batch_rows:
        _flush_dk_batch(batch_rows)
        count += len(batch_rows)

    return count


def _flush_dk_batch(rows):
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            execute_values(cur, """
                INSERT INTO dk_court_decisions
                    (id, ecli, source, court_name, court_type, case_number,
                     case_type, decision_date, judge, parties, abstract,
                     full_text, anonymized_text, source_url, metadata_json)
                VALUES %s
                ON CONFLICT (id) DO NOTHING
            """, rows, page_size=BATCH_SIZE)
        conn.commit()
    finally:
        conn.close()


def import_denmark_hf():
    ds_dir = DK_BASE / "huggingface" / "domsdatabasen"
    files = sorted(ds_dir.glob("**/*.parquet"))
    if not files:
        print(f"  No parquet files in {ds_dir}")
        return 0
    print(f"\nDK HF domsdatabasen: {len(files)} parquet files")

    checkpoint = load_checkpoint("dk_hf")
    files_to_do = [f for f in files if f.name not in checkpoint]
    print(f"  Skipping {len(files) - len(files_to_do)} already imported files")

    imported = 0
    t0 = time.time()
    with ProcessPoolExecutor(max_workers=MAX_WORKERS) as pool:
        futures = {pool.submit(import_dk_hf_file, str(f)): f for f in files_to_do}
        done = 0
        for future in as_completed(futures):
            fpath = futures[future]
            try:
                count = future.result()
                imported += count
                done += 1
                checkpoint.add(fpath.name)
                if done % 10 == 0:
                    elapsed = time.time() - t0
                    rate = imported / elapsed if elapsed > 0 else 0
                    print(f"  DK HF: {done}/{len(files_to_do)} files | {imported} rows | {rate:.0f}/s")
                    save_checkpoint("dk_hf", checkpoint)
            except Exception as e:
                print(f"  DK HF FAILED {fpath.name}: {e}")

    save_checkpoint("dk_hf", checkpoint)
    print(f"  DK HF complete: {imported} rows in {time.time()-t0:.0f}s")
    return imported


# ============================================================
# SWEDEN: HuggingFace swelaw (Parquet)
# ============================================================

def import_se_hf_file(filepath: str) -> int:
    try:
        import pyarrow.parquet as pq
    except ImportError:
        print("pyarrow not installed, skipping HF parquet import")
        return 0

    table = pq.read_table(filepath)
    df_cols = table.column_names
    batch_rows = []
    count = 0

    for i in range(table.num_rows):
        row = {col: table.column(col)[i].as_py() for col in df_cols}

        # Filter to court cases only (look for document type indicators)
        doc_type = row.get("type") or row.get("document_type") or row.get("category", "")
        # Skip non-court documents (legislation, regulations, etc.)
        if doc_type and any(skip in str(doc_type).lower() for skip in ("lag", "forordning", "regulation", "statute")):
            continue

        record_id = f"hf-swelaw-{i}-{Path(filepath).stem}"
        text = row.get("text") or row.get("content") or row.get("full_text", "")
        title = row.get("title") or row.get("subject")
        decision_date = row.get("date") or row.get("decision_date")
        court = row.get("court") or row.get("court_name")
        case_number = row.get("case_number") or row.get("number")
        ecli = row.get("ecli")
        keywords = row.get("keywords")

        meta = {k: v for k, v in row.items()
                if k not in ("text", "content", "full_text", "title", "subject",
                             "date", "decision_date", "court", "court_name",
                             "case_number", "number", "ecli", "keywords",
                             "type", "document_type", "category")}

        batch_rows.append((
            record_id,
            ecli,
            "hf-swelaw",
            court,                                          # court_name
            None,                                           # court_type
            case_number,
            None,                                           # decision_type
            clean_date(decision_date),
            None,                                           # judge
            title,                                          # subject
            keywords,
            None,                                           # parties
            None,                                           # abstract
            text,                                           # full_text
            None,                                           # source_url
            clean_json(meta) if meta else None,
        ))

        if len(batch_rows) >= BATCH_SIZE:
            _flush_se_batch(batch_rows)
            count += len(batch_rows)
            batch_rows = []

    if batch_rows:
        _flush_se_batch(batch_rows)
        count += len(batch_rows)

    return count


def import_se_lagen_file(filepath: str, court: str) -> int:
    """Import a single lagen.nu HTML file."""
    path = Path(filepath)
    try:
        html = path.read_text(encoding="utf-8", errors="replace")
    except Exception:
        return 0

    text = strip_html(html)
    if not text:
        return 0

    record_id = f"lagen-nu-{court}-{path.stem}"

    row = (
        record_id,
        None,                                               # ecli
        "lagen-nu",
        court,                                              # court_name
        None,                                               # court_type
        None,                                               # case_number
        None,                                               # decision_type
        None,                                               # decision_date
        None,                                               # judge
        None,                                               # subject
        None,                                               # keywords
        None,                                               # parties
        None,                                               # abstract
        text,                                               # full_text
        None,                                               # source_url
        None,                                               # metadata_json
    )

    conn = get_conn()
    try:
        with conn.cursor() as cur:
            execute_values(cur, """
                INSERT INTO se_court_decisions
                    (id, ecli, source, court_name, court_type, case_number,
                     decision_type, decision_date, judge, subject, keywords,
                     parties, abstract, full_text, source_url, metadata_json)
                VALUES %s
                ON CONFLICT (id) DO NOTHING
            """, [row], page_size=BATCH_SIZE)
        conn.commit()
        return 1
    finally:
        conn.close()


def _flush_se_batch(rows):
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            execute_values(cur, """
                INSERT INTO se_court_decisions
                    (id, ecli, source, court_name, court_type, case_number,
                     decision_type, decision_date, judge, subject, keywords,
                     parties, abstract, full_text, source_url, metadata_json)
                VALUES %s
                ON CONFLICT (id) DO NOTHING
            """, rows, page_size=BATCH_SIZE)
        conn.commit()
    finally:
        conn.close()


def import_sweden_hf():
    ds_dir = SE_BASE / "huggingface" / "swelaw"
    files = sorted(ds_dir.glob("**/*.parquet"))
    if not files:
        print(f"  No parquet files in {ds_dir}")
        return 0
    print(f"\nSE HF swelaw: {len(files)} parquet files")

    checkpoint = load_checkpoint("se_hf")
    files_to_do = [f for f in files if f.name not in checkpoint]
    print(f"  Skipping {len(files) - len(files_to_do)} already imported files")

    imported = 0
    t0 = time.time()
    with ProcessPoolExecutor(max_workers=MAX_WORKERS) as pool:
        futures = {pool.submit(import_se_hf_file, str(f)): f for f in files_to_do}
        done = 0
        for future in as_completed(futures):
            fpath = futures[future]
            try:
                count = future.result()
                imported += count
                done += 1
                checkpoint.add(fpath.name)
                if done % 10 == 0:
                    elapsed = time.time() - t0
                    rate = imported / elapsed if elapsed > 0 else 0
                    print(f"  SE HF: {done}/{len(files_to_do)} files | {imported} rows | {rate:.0f}/s")
                    save_checkpoint("se_hf", checkpoint)
            except Exception as e:
                print(f"  SE HF FAILED {fpath.name}: {e}")

    save_checkpoint("se_hf", checkpoint)
    print(f"  SE HF complete: {imported} rows in {time.time()-t0:.0f}s")
    return imported


def import_sweden_lagen():
    lagen_dir = SE_BASE / "lagen-nu"
    if not lagen_dir.exists():
        print(f"  lagen.nu directory not found: {lagen_dir}")
        return 0

    courts = [d for d in lagen_dir.iterdir() if d.is_dir()]
    if not courts:
        print("  No court directories in lagen-nu")
        return 0

    checkpoint = load_checkpoint("se_lagen")
    total_imported = 0
    t0 = time.time()

    for court_dir in sorted(courts):
        court_name = court_dir.name
        files = sorted(court_dir.glob("**/*.html"))
        files_to_do = [f for f in files if f"{court_name}/{f.name}" not in checkpoint]
        if not files_to_do:
            continue
        print(f"\nSE lagen.nu {court_name}: {len(files_to_do)} HTML files")

        imported = 0
        with ProcessPoolExecutor(max_workers=MAX_WORKERS) as pool:
            futures = {pool.submit(import_se_lagen_file, str(f), court_name): f for f in files_to_do}
            done = 0
            for future in as_completed(futures):
                fpath = futures[future]
                try:
                    count = future.result()
                    imported += count
                    done += 1
                    checkpoint.add(f"{court_name}/{fpath.name}")
                    if done % 200 == 0:
                        elapsed = time.time() - t0
                        rate = total_imported + imported
                        print(f"  lagen.nu {court_name}: {done}/{len(files_to_do)} | {imported} rows")
                        save_checkpoint("se_lagen", checkpoint)
                except Exception as e:
                    print(f"  lagen.nu FAILED {fpath.name}: {e}")

        total_imported += imported
        save_checkpoint("se_lagen", checkpoint)

    print(f"  SE lagen.nu complete: {total_imported} rows in {time.time()-t0:.0f}s")
    return total_imported


# ============================================================
# FINLAND: Finlex API XML
# ============================================================

def parse_finlex_xml(filepath: str) -> dict:
    """Parse Akoma Ntoso XML from Finlex API."""
    import xml.etree.ElementTree as ET

    path = Path(filepath)
    try:
        tree = ET.parse(path)
        root = tree.getroot()
    except Exception:
        # Fallback: read as text
        text = path.read_text(encoding="utf-8", errors="replace")
        return {"full_text": strip_html(text), "raw_xml": True}

    # Handle namespaces
    ns = {"akn": "http://docs.oasis-open.org/legaldocml/ns/akn/3.0"}

    result = {}

    # Try to extract judgment body text
    body = root.find(".//{http://docs.oasis-open.org/legaldocml/ns/akn/3.0}judgmentBody")
    if body is None:
        body = root.find(".//judgmentBody")
    if body is None:
        body = root.find(".//{http://docs.oasis-open.org/legaldocml/ns/akn/3.0}body")
    if body is None:
        body = root

    text_parts = []
    for elem in body.iter():
        if elem.text:
            text_parts.append(elem.text.strip())
        if elem.tail:
            text_parts.append(elem.tail.strip())
    result["full_text"] = " ".join(t for t in text_parts if t)

    # Extract metadata
    meta = root.find(".//{http://docs.oasis-open.org/legaldocml/ns/akn/3.0}meta")
    if meta is None:
        meta = root.find(".//meta")

    if meta is not None:
        # Try to get ECLI
        for frbr in meta.iter():
            if "FRBRuri" in frbr.tag or "FRBRExpression" in frbr.tag:
                uri = frbr.get("value") or frbr.get("href", "")
                if "ECLI" in uri:
                    result["ecli"] = uri

    return result


def import_fi_api_file(filepath: str, court: str) -> int:
    """Import a single Finlex API XML file."""
    path = Path(filepath)
    parsed = parse_finlex_xml(filepath)
    text = parsed.get("full_text", "")
    if not text:
        return 0

    record_id = f"finlex-{court}-{path.stem}"

    # Try to load accompanying metadata
    meta_file = path.with_suffix(".json")
    meta = {}
    if meta_file.exists():
        try:
            meta = json.loads(meta_file.read_text(encoding="utf-8"))
        except Exception:
            pass

    # Also check metadata.jsonl in the same directory
    if not meta:
        jsonl_file = path.parent / "metadata.jsonl"
        if jsonl_file.exists():
            try:
                for line in jsonl_file.read_text(encoding="utf-8").splitlines():
                    item = json.loads(line)
                    if item.get("filename") == path.name or item.get("id") == path.stem:
                        meta = item
                        break
            except Exception:
                pass

    ecli = parsed.get("ecli") or meta.get("ecli")
    decision_date = meta.get("decision_date") or meta.get("date")
    case_number = meta.get("case_number") or meta.get("diaarinumero")
    court_name = meta.get("court_name") or meta.get("court") or court
    subject = meta.get("subject") or meta.get("asia")
    keywords = meta.get("keywords") or meta.get("asiasanat")
    cited = meta.get("cited_provisions") or meta.get("lainkohdat")
    language = meta.get("language") or meta.get("kieli") or "fi"
    judge = meta.get("judge") or meta.get("esittelija")
    publication_date = meta.get("publication_date")

    row = (
        record_id,
        ecli,
        "finlex-api",
        court_name,
        None,                                               # court_type
        case_number,
        None,                                               # decision_type
        str(decision_date)[:10] if decision_date else None,
        publication_date,
        judge,
        subject,
        keywords if isinstance(keywords, str) else json.dumps(keywords) if keywords else None,
        cited if isinstance(cited, str) else json.dumps(cited) if cited else None,
        None,                                               # parties
        None,                                               # abstract
        text,
        language,
        None,                                               # source_url
        json.dumps(meta, default=str) if meta else None,
    )

    conn = get_conn()
    try:
        with conn.cursor() as cur:
            execute_values(cur, """
                INSERT INTO fi_court_decisions
                    (id, ecli, source, court_name, court_type, case_number,
                     decision_type, decision_date, publication_date, judge,
                     subject, keywords, cited_provisions, parties, abstract,
                     full_text, language, source_url, metadata_json)
                VALUES %s
                ON CONFLICT (id) DO NOTHING
            """, [row], page_size=BATCH_SIZE)
        conn.commit()
        return 1
    finally:
        conn.close()


def _flush_fi_batch(rows):
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            execute_values(cur, """
                INSERT INTO fi_court_decisions
                    (id, ecli, source, court_name, court_type, case_number,
                     decision_type, decision_date, publication_date, judge,
                     subject, keywords, cited_provisions, parties, abstract,
                     full_text, language, source_url, metadata_json)
                VALUES %s
                ON CONFLICT (id) DO NOTHING
            """, rows, page_size=BATCH_SIZE)
        conn.commit()
    finally:
        conn.close()


def import_finland_api():
    api_dir = FI_BASE / "finlex-api"
    if not api_dir.exists():
        print(f"  Finlex API directory not found: {api_dir}")
        return 0

    courts = [d for d in api_dir.iterdir() if d.is_dir()]
    if not courts:
        print("  No court directories in finlex-api")
        return 0

    checkpoint = load_checkpoint("fi_api")
    total_imported = 0
    t0 = time.time()

    for court_dir in sorted(courts):
        court_name = court_dir.name
        files = sorted(court_dir.glob("**/*.xml"))
        files_to_do = [f for f in files if f"{court_name}/{f.name}" not in checkpoint]
        if not files_to_do:
            continue
        print(f"\nFI Finlex API {court_name}: {len(files_to_do)} XML files")

        imported = 0
        with ProcessPoolExecutor(max_workers=MAX_WORKERS) as pool:
            futures = {pool.submit(import_fi_api_file, str(f), court_name): f for f in files_to_do}
            done = 0
            for future in as_completed(futures):
                fpath = futures[future]
                try:
                    count = future.result()
                    imported += count
                    done += 1
                    checkpoint.add(f"{court_name}/{fpath.name}")
                    if done % 100 == 0:
                        elapsed = time.time() - t0
                        print(f"  Finlex {court_name}: {done}/{len(files_to_do)} | {imported} rows")
                        save_checkpoint("fi_api", checkpoint)
                except Exception as e:
                    print(f"  Finlex FAILED {fpath.name}: {e}")

        total_imported += imported
        save_checkpoint("fi_api", checkpoint)

    print(f"  FI Finlex API complete: {total_imported} rows in {time.time()-t0:.0f}s")
    return total_imported


def import_fi_github_file(filepath: str) -> int:
    """Import a single finlex-data GitHub XML file."""
    import xml.etree.ElementTree as ET

    path = Path(filepath)
    try:
        tree = ET.parse(path)
        root = tree.getroot()
    except Exception:
        text = path.read_text(encoding="utf-8", errors="replace")
        text = strip_html(text)
        if not text:
            return 0
        record_id = f"finlex-github-{path.stem}"
        row = (record_id, None, "finlex-github", None, None, None,
               None, None, None, None, None, None, None, None, None,
               text, "fi", None, None)
        conn = get_conn()
        try:
            with conn.cursor() as cur:
                execute_values(cur, """
                    INSERT INTO fi_court_decisions
                        (id, ecli, source, court_name, court_type, case_number,
                         decision_type, decision_date, publication_date, judge,
                         subject, keywords, cited_provisions, parties, abstract,
                         full_text, language, source_url, metadata_json)
                    VALUES %s
                    ON CONFLICT (id) DO NOTHING
                """, [row], page_size=BATCH_SIZE)
            conn.commit()
            return 1
        finally:
            conn.close()

    # Extract text from XML
    text_parts = []
    for elem in root.iter():
        if elem.text:
            text_parts.append(elem.text.strip())
        if elem.tail:
            text_parts.append(elem.tail.strip())
    text = " ".join(t for t in text_parts if t)
    if not text:
        return 0

    record_id = f"finlex-github-{path.stem}"

    row = (
        record_id,
        None,                                               # ecli
        "finlex-github",
        None,                                               # court_name
        None,                                               # court_type
        None,                                               # case_number
        None,                                               # decision_type
        None,                                               # decision_date
        None,                                               # publication_date
        None,                                               # judge
        None,                                               # subject
        None,                                               # keywords
        None,                                               # cited_provisions
        None,                                               # parties
        None,                                               # abstract
        text,
        "fi",                                               # language
        None,                                               # source_url
        None,                                               # metadata_json
    )

    conn = get_conn()
    try:
        with conn.cursor() as cur:
            execute_values(cur, """
                INSERT INTO fi_court_decisions
                    (id, ecli, source, court_name, court_type, case_number,
                     decision_type, decision_date, publication_date, judge,
                     subject, keywords, cited_provisions, parties, abstract,
                     full_text, language, source_url, metadata_json)
                VALUES %s
                ON CONFLICT (id) DO NOTHING
            """, [row], page_size=BATCH_SIZE)
        conn.commit()
        return 1
    finally:
        conn.close()


def import_finland_github():
    github_dir = FI_BASE / "github-finlex-data"
    if not github_dir.exists():
        print(f"  GitHub finlex-data directory not found: {github_dir}")
        return 0

    files = sorted(github_dir.rglob("*.xml"))
    if not files:
        print("  No XML files in github-finlex-data")
        return 0

    checkpoint = load_checkpoint("fi_github")
    files_to_do = [f for f in files if f.name not in checkpoint]
    print(f"\nFI GitHub finlex-data: {len(files_to_do)} XML files (skipping {len(files) - len(files_to_do)})")

    imported = 0
    t0 = time.time()
    with ProcessPoolExecutor(max_workers=MAX_WORKERS) as pool:
        futures = {pool.submit(import_fi_github_file, str(f)): f for f in files_to_do}
        done = 0
        for future in as_completed(futures):
            fpath = futures[future]
            try:
                count = future.result()
                imported += count
                done += 1
                checkpoint.add(fpath.name)
                if done % 200 == 0:
                    elapsed = time.time() - t0
                    rate = imported / elapsed if elapsed > 0 else 0
                    print(f"  FI GitHub: {done}/{len(files_to_do)} | {imported} rows | {rate:.0f}/s")
                    save_checkpoint("fi_github", checkpoint)
            except Exception as e:
                print(f"  FI GitHub FAILED {fpath.name}: {e}")

    save_checkpoint("fi_github", checkpoint)
    print(f"  FI GitHub complete: {imported} rows in {time.time()-t0:.0f}s")
    return imported


# ============================================================
# ICELAND: haestirettur (Supreme Court)
# ============================================================

def import_is_html_file(filepath: str, source: str, court_name: str) -> int:
    """Import a single Icelandic court HTML file."""
    path = Path(filepath)
    try:
        html = path.read_text(encoding="utf-8", errors="replace")
    except Exception:
        return 0

    text = strip_html(html)
    if not text:
        return 0

    # Derive court from parent dirs for heradsdomstolar
    if source == "heradsdomstolar":
        # path: .../heradsdomstolar/{court}/{year}/file.html
        parts = path.parts
        try:
            idx = parts.index("heradsdomstolar")
            court_name = parts[idx + 1] if idx + 1 < len(parts) - 1 else court_name
        except (ValueError, IndexError):
            pass

    record_id = f"{source}-{path.stem}"

    row = (
        record_id,
        None,                                               # ecli
        source,
        court_name,
        None,                                               # court_type
        None,                                               # case_number
        None,                                               # decision_type
        None,                                               # decision_date
        None,                                               # judge
        None,                                               # subject
        None,                                               # parties
        None,                                               # abstract
        text,                                               # full_text
        None,                                               # source_url
        None,                                               # metadata_json
    )

    conn = get_conn()
    try:
        with conn.cursor() as cur:
            execute_values(cur, """
                INSERT INTO is_court_decisions
                    (id, ecli, source, court_name, court_type, case_number,
                     decision_type, decision_date, judge, subject, parties,
                     abstract, full_text, source_url, metadata_json)
                VALUES %s
                ON CONFLICT (id) DO NOTHING
            """, [row], page_size=BATCH_SIZE)
        conn.commit()
        return 1
    finally:
        conn.close()


def _flush_is_batch(rows):
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            execute_values(cur, """
                INSERT INTO is_court_decisions
                    (id, ecli, source, court_name, court_type, case_number,
                     decision_type, decision_date, judge, subject, parties,
                     abstract, full_text, source_url, metadata_json)
                VALUES %s
                ON CONFLICT (id) DO NOTHING
            """, rows, page_size=BATCH_SIZE)
        conn.commit()
    finally:
        conn.close()


def _import_iceland_court(source: str, court_name: str, base_dir: Path):
    """Generic importer for Icelandic court HTML files."""
    if not base_dir.exists():
        print(f"  {source} directory not found: {base_dir}")
        return 0

    files = sorted(base_dir.rglob("*.html"))
    if not files:
        print(f"  No HTML files in {base_dir}")
        return 0

    checkpoint = load_checkpoint(f"is_{source}")
    files_to_do = [f for f in files if f.name not in checkpoint]
    print(f"\nIS {source}: {len(files_to_do)} HTML files (skipping {len(files) - len(files_to_do)})")

    imported = 0
    t0 = time.time()
    with ProcessPoolExecutor(max_workers=MAX_WORKERS) as pool:
        futures = {pool.submit(import_is_html_file, str(f), source, court_name): f for f in files_to_do}
        done = 0
        for future in as_completed(futures):
            fpath = futures[future]
            try:
                count = future.result()
                imported += count
                done += 1
                checkpoint.add(fpath.name)
                if done % 200 == 0:
                    elapsed = time.time() - t0
                    rate = imported / elapsed if elapsed > 0 else 0
                    print(f"  IS {source}: {done}/{len(files_to_do)} | {imported} rows | {rate:.0f}/s")
                    save_checkpoint(f"is_{source}", checkpoint)
            except Exception as e:
                print(f"  IS {source} FAILED {fpath.name}: {e}")

    save_checkpoint(f"is_{source}", checkpoint)
    print(f"  IS {source} complete: {imported} rows in {time.time()-t0:.0f}s")
    return imported


def import_iceland_haestirettur():
    return _import_iceland_court(
        "haestirettur",
        "Hæstiréttur Íslands",
        IS_BASE / "haestirettur"
    )


def import_iceland_landsrettur():
    return _import_iceland_court(
        "landsrettur",
        "Landsréttur",
        IS_BASE / "landsrettur"
    )


def import_iceland_heradsdomstolar():
    return _import_iceland_court(
        "heradsdomstolar",
        "Héraðsdómstólar",
        IS_BASE / "heradsdomstolar"
    )


# ============================================================
# Migration
# ============================================================

def run_migration():
    """Run the migration SQL on the database."""
    migration_sql = Path(__file__).parent.parent.parent / "mcp_backend" / "src" / "migrations" / "154_nordic_court_decisions.sql"
    if not migration_sql.exists():
        migration_sql = Path("/home/ubuntu/154_nordic_court_decisions.sql")
    if not migration_sql.exists():
        print("Migration file 154_nordic_court_decisions.sql not found, tables must already exist")
        return

    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(migration_sql.read_text())
        conn.commit()
        print("Migration 154 applied successfully")
    finally:
        conn.close()


# ============================================================
# Main
# ============================================================

def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "all"

    if mode in ("all", "migrate"):
        run_migration()

    if mode in ("all", "dk"):
        import_denmark_hf()

    if mode in ("all", "se", "se-hf"):
        import_sweden_hf()
    if mode in ("all", "se", "se-lagen"):
        import_sweden_lagen()

    if mode in ("all", "fi", "fi-api"):
        import_finland_api()
    if mode in ("all", "fi", "fi-github"):
        import_finland_github()

    if mode in ("all", "is", "is-haestirettur"):
        import_iceland_haestirettur()
    if mode in ("all", "is", "is-landsrettur"):
        import_iceland_landsrettur()
    if mode in ("all", "is", "is-heradsdomstolar"):
        import_iceland_heradsdomstolar()

    # Final summary
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            counts = {}
            for table in ("dk_court_decisions", "se_court_decisions",
                          "fi_court_decisions", "is_court_decisions"):
                try:
                    cur.execute(f"SELECT count(*) FROM {table}")
                    counts[table] = cur.fetchone()[0]
                except Exception:
                    conn.rollback()
                    counts[table] = "N/A"
        print(f"\n{'='*60}")
        print("Nordic court decisions summary:")
        for table, count in counts.items():
            label = table.replace("_court_decisions", "").upper()
            print(f"  {label}: {count:,}" if isinstance(count, int) else f"  {label}: {count}")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
