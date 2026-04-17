#!/usr/bin/env python3
"""
Luxembourg CSSF fund identifiers importer v2.
Handles UTF-16 LE BOM + TAB-separated fixed-width files from cssf.lu.

Sources (4 ZIPs):
  1. OPC_COMP_TP_TOUS_OUVERTS.zip                    — UCITS open funds
  2. OPC_FIS_SICAR_COMP_TP_TOUS_NON_FERMES.zip       — SIF/SICAR open funds
  3. IDENTIFIANTS_AIFM.zip                            — AIFM identifiers
  4. NUMERO_SIGNALETIQUE_SOCIETE_DE_GESTION.zip      — Management companies

Usage:
    PG_CONTAINER=secondlayer-postgres-prod PGDB=secondlayer_prod \
    python3 import-cssf-v2.py
"""

import io
import json
import logging
import os
import re
import subprocess
import sys
import zipfile
from datetime import datetime
from urllib.request import Request, urlopen

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)

CONTAINER = os.environ.get("PG_CONTAINER", "secondlayer-postgres-prod")
PGUSER = os.environ.get("PGUSER", "secondlayer")
PGDB = os.environ.get("PGDB", "secondlayer_prod")
USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64) SecondLayer/1.0"

CSSF_FILES = [
    ("https://www.cssf.lu/wp-content/uploads/OPC_COMP_TP_TOUS_OUVERTS.zip", "ucits", "UCITS"),
    ("https://www.cssf.lu/wp-content/uploads/OPC_FIS_SICAR_COMP_TP_TOUS_NON_FERMES.zip", "sif_sicar", "SIF/SICAR"),
    ("https://www.cssf.lu/wp-content/uploads/IDENTIFIANTS_AIFM.zip", "aifm", "AIFM"),
    ("https://www.cssf.lu/wp-content/uploads/NUMERO_SIGNALETIQUE_SOCIETE_DE_GESTION.zip", "mgmt_co", "MGMT_CO"),
]


def fetch(url: str) -> bytes:
    req = Request(url, headers={"User-Agent": USER_AGENT})
    with urlopen(req, timeout=120) as r:
        return r.read()


def decode_csv(raw: bytes) -> list[list[str]]:
    """Decode UTF-16 LE BOM, split TAB-separated, strip cells."""
    if raw.startswith(b"\xff\xfe"):
        text = raw.decode("utf-16-le", errors="replace")
    elif raw.startswith(b"\xfe\xff"):
        text = raw.decode("utf-16-be", errors="replace")
    else:
        try:
            text = raw.decode("utf-8")
        except UnicodeDecodeError:
            text = raw.decode("cp1252", errors="replace")
    # First char may be BOM remnant \ufeff after decode
    text = text.lstrip("\ufeff")
    rows = []
    for line in text.splitlines():
        if not line.strip() or line.startswith("\x00"):
            continue
        cells = [c.strip() for c in line.split("\t")]
        rows.append(cells)
    return rows


def parse_date(s: str) -> str | None:
    s = s.strip()
    if not s or s in ("-", "00/00/0000"):
        return None
    for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y"):
        try:
            return datetime.strptime(s, fmt).date().isoformat()
        except ValueError:
            continue
    return None


def parse_ucits_or_sif(rows: list[list[str]], fund_type: str) -> list[dict]:
    """
    Headers: E NNNNNNNN ISIN NOMOPC CCCCCCCC NOMCOMPARTIMENT
             AGREEMENTCOMP DEVISECOMP PPPP NOMTYPEPART
    """
    out = []
    if len(rows) < 3:
        return out
    # Skip header (row 0) + separator (row 1)
    for r in rows[2:]:
        if len(r) < 10:
            continue
        status_raw = r[0]
        status = "Open" if status_raw == "O" else ("Closed" if status_raw == "F" else status_raw)
        rec = {
            "fund_id": r[1],
            "isin": r[2] or None,
            "fund_name": r[3],
            "fund_type": fund_type,
            "compartment_id": r[4],
            "compartment_name": r[5],
            "launch_date": parse_date(r[6]),
            "currency": r[7],
            "share_class_id": r[8],
            "share_class": r[9],
            "management_company": None,
            "status": status,
            "cssf_code": r[1],
        }
        out.append(rec)
    return out


def parse_aifm(rows: list[list[str]]) -> list[dict]:
    """
    Headers: A NNNNNNNN AIFM_NAME STATUS F MMMMMMMM AIF_NAME CCCCCCCC AIF_SUBFUND_NAME
             STARTING_MANAGEMENT_DATE_OF_THE_AIF ENDING_MANAGEMENT_DATE_OF_THE_AIF
             REGISTRATION_DATE_OR_INCEPTION_DATE_OF_THE_SUBFUND_OR_AIF CLOSING_DATE_OF_THE_SUBFUND_OR_AIF
    """
    out = []
    if len(rows) < 3:
        return out
    for r in rows[2:]:
        if len(r) < 9:
            continue
        rec = {
            "fund_id": r[1],                  # AIFM ID
            "isin": None,
            "fund_name": r[2],                 # AIFM name
            "fund_type": "AIFM",
            "compartment_id": r[5] if len(r) > 5 else "",
            "compartment_name": r[6] if len(r) > 6 else "",
            "launch_date": parse_date(r[11]) if len(r) > 11 else None,
            "currency": None,
            "share_class_id": r[7] if len(r) > 7 else "",
            "share_class": r[8] if len(r) > 8 else "",
            "management_company": r[2],
            "status": r[3] if len(r) > 3 else "",
            "cssf_code": r[1],
        }
        out.append(rec)
    return out


def parse_mgmt_co(rows: list[list[str]]) -> list[dict]:
    """
    Headers: ID_TYPE_ENTITE ID_ENTITE NOM_COURRIER ID_STATUT_SURV
    """
    out = []
    if len(rows) < 3:
        return out
    for r in rows[2:]:
        if len(r) < 4:
            continue
        rec = {
            "fund_id": r[1],
            "isin": None,
            "fund_name": r[2],
            "fund_type": "MGMT_CO",
            "compartment_id": "",
            "compartment_name": "",
            "launch_date": None,
            "currency": None,
            "share_class_id": "",
            "share_class": "",
            "management_company": r[2],
            "status": r[3],
            "cssf_code": r[1],
        }
        out.append(rec)
    return out


def import_to_db(records: list[dict]):
    # Dedupe by (fund_id, compartment_name, share_class) — keep last occurrence
    deduped = {}
    for r in records:
        key = (r["fund_id"], r.get("compartment_name") or "", r.get("share_class") or "")
        deduped[key] = r
    records = list(deduped.values())
    log.info(f"Importing {len(records)} records to {CONTAINER}/{PGDB}...")
    lines = []
    for r in records:
        def clean(v):
            if v is None or v == "":
                return r"\N"
            return str(v).replace("\\", "\\\\").replace("\t", " ").replace("\n", " ").replace("\r", " ")
        meta = json.dumps({
            "compartment_id": r["compartment_id"],
            "share_class_id": r["share_class_id"],
            "currency": r["currency"],
            "source": "cssf.lu",
        }, ensure_ascii=False)
        lines.append("\t".join([
            clean(r["fund_id"]),
            clean(r["fund_name"]),
            clean(r["fund_type"]),
            clean(r["compartment_name"]),
            clean(r["share_class"]),
            clean(r["management_company"]),
            clean(r["status"]),
            clean(r["launch_date"]),
            clean(r["cssf_code"]),
            clean(r["isin"]),
            clean(meta),
        ]))
    payload = "\n".join(lines) + "\n"

    sql = """
BEGIN;
CREATE TEMP TABLE _stage_cssf (
    fund_id TEXT, fund_name TEXT, fund_type TEXT, compartment_name TEXT, share_class TEXT,
    management_company TEXT, status TEXT, launch_date DATE, cssf_code TEXT, isin TEXT, metadata_json JSONB
) ON COMMIT DROP;
COPY _stage_cssf FROM STDIN WITH (FORMAT text, NULL '\\N');
"""
    upsert = """
INSERT INTO lu_cssf_funds
    (fund_id, fund_name, fund_type, compartment_name, share_class,
     management_company, status, launch_date, cssf_code, isin, metadata_json)
SELECT fund_id, fund_name, fund_type, COALESCE(compartment_name, ''), COALESCE(share_class, ''),
       management_company, status, launch_date, cssf_code, isin, metadata_json
FROM _stage_cssf
WHERE fund_id IS NOT NULL AND fund_id <> ''
ON CONFLICT (fund_id, compartment_name, share_class) DO NOTHING;
COMMIT;
"""
    full = sql + payload + "\\.\n" + upsert
    proc = subprocess.run(
        ["docker", "exec", "-i", CONTAINER, "psql", "-U", PGUSER, "-d", PGDB, "-v", "ON_ERROR_STOP=1"],
        input=full, capture_output=True, text=True
    )
    if proc.returncode != 0:
        log.error(f"psql failed: {proc.stderr[-2000:]}")
        sys.exit(1)
    for line in proc.stdout.strip().splitlines()[-5:]:
        log.info(f"  psql: {line}")


def main():
    all_records = []
    for url, label, fund_type in CSSF_FILES:
        log.info(f"Downloading {label}: {url}")
        try:
            raw_zip = fetch(url)
        except Exception as e:
            log.error(f"Fetch failed {label}: {e}")
            continue
        log.info(f"  {len(raw_zip) // 1024} KB")

        with zipfile.ZipFile(io.BytesIO(raw_zip)) as zf:
            csv_names = [n for n in zf.namelist() if n.lower().endswith(".csv")]
            if not csv_names:
                log.warning(f"  No CSV in {label}")
                continue
            with zf.open(csv_names[0]) as f:
                raw = f.read()

        rows = decode_csv(raw)
        log.info(f"  Parsed {len(rows)} rows including headers")

        if label == "ucits":
            recs = parse_ucits_or_sif(rows, "UCITS")
        elif label == "sif_sicar":
            recs = parse_ucits_or_sif(rows, "SIF/SICAR")
        elif label == "aifm":
            recs = parse_aifm(rows)
        elif label == "mgmt_co":
            recs = parse_mgmt_co(rows)
        else:
            recs = []
        log.info(f"  {label}: {len(recs)} records")
        all_records.extend(recs)

    log.info(f"Total: {len(all_records)} records")
    if not all_records:
        log.error("No records parsed; aborting")
        return

    # Import in batches of 5000
    for i in range(0, len(all_records), 5000):
        import_to_db(all_records[i:i+5000])

    log.info("All done")


if __name__ == "__main__":
    main()
