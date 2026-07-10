"""NIPO Appeals Chamber scraper — CLI orchestrator.

Usage (from scripts/opendata/):
  python -m nipo_appeals.main --create-schema --full --workers 6   # first full run
  python -m nipo_appeals.main                                      # incremental update (default)
  python -m nipo_appeals.main --dry-run --limit 5                  # smoke test, no DB writes

Stages:
  1. fetch listing pages (nipo.gov.ua: 3 pages; ukrpatent.org: 36 year pages)
  2. incremental filter — skip decisions already in the DB (unless --full)
  3. worker pool (--workers processes): download наказ+рішення PDFs, extract text + fields
  4. validate every record; rejects -> rejects.ndjson, NEVER the DB
  5. upsert accepted records into Postgres
  6. well-known TM registry XLSX -> nipo_well_known_tms (+ link to decisions)
"""

import argparse
import dataclasses
import json
import logging
import os
import sys
from concurrent.futures import ProcessPoolExecutor, as_completed
from typing import List, Optional

from . import config, db
from .download import fetch_html, download_file, reset_session
from .fetch_nipo import parse_section_page, find_well_known_xlsx_url
from .fetch_ukrpatent import parse_year_page
from .htmlutil import absolutize
from .models import DecisionItem
from .pdf_fields import extract_pdf_text, extract_fields
from .validate import validate
from .wellknown import parse_registry_xlsx

log = logging.getLogger("nipo_appeals")


# ── Stage 1: listings ────────────────────────────────────────────────────────

def collect_listings(sources: List[str], sections: List[str]) -> List[DecisionItem]:
    items: List[DecisionItem] = []
    if "nipo" in sources:
        for section in sections:
            url = config.NIPO_SECTIONS[section]
            items.extend(parse_section_page(fetch_html(url), section))
    if "ukrpatent" in sources:
        for section in sections:
            slug = config.UKRPATENT_SECTIONS[section]
            for year in config.UKRPATENT_YEARS:
                url = config.ukrpatent_year_url(slug, year)
                items.extend(parse_year_page(fetch_html(url), section, year))
    # dedup by natural key (nipo hub occasionally repeats an item)
    seen, unique = set(), []
    for it in items:
        if it.decision_pdf_url in seen:
            continue
        seen.add(it.decision_pdf_url)
        unique.append(it)
    return unique


# ── Stage 3: per-item worker (runs in a separate process) ────────────────────

def process_item(item_dict: dict) -> dict:
    """Download PDFs (+image), extract texts and structured fields. Never raises —
    failures are recorded in raw['processing_error'] and caught by validation."""
    item = DecisionItem(**item_dict)
    try:
        decision_path = download_file(item.decision_pdf_url)
        item.decision_text = extract_pdf_text(decision_path)
        files = {"decision_pdf": os.path.relpath(decision_path, config.DATA_DIR)}

        if item.order_pdf_url:
            try:
                order_path = download_file(item.order_pdf_url)
                item.order_text = extract_pdf_text(order_path)
                files["order_pdf"] = os.path.relpath(order_path, config.DATA_DIR)
            except Exception as e:
                item.raw["order_pdf_error"] = str(e)

        if item.image_url:
            try:
                img_path = download_file(item.image_url)
                files["image"] = os.path.relpath(img_path, config.DATA_DIR)
            except Exception as e:
                item.raw["image_error"] = str(e)

        item.raw["files"] = files

        fields = extract_fields(item.order_text or "", item.decision_text or "", item.section)
        item.app_number = fields.get("app_number")
        item.appellant = fields.get("appellant")
        item.parties = fields.get("parties") or {}

        # legacy listings carry only a filename slug — the PDF title is authoritative there
        pdf_title = fields.get("pdf_title")
        if pdf_title and (item.source == "ukrpatent" or not item.object_title):
            item.raw["slug_title"] = item.object_title
            item.object_title = pdf_title

        if item.section == "inventions" and fields.get("object_type") and not item.object_type:
            item.object_type = fields["object_type"]

        # result: listing marker wins (nipo); otherwise derive from the operative part
        if not item.result and fields.get("result_pdf"):
            item.result = fields["result_pdf"]
            item.result_source = "pdf"
    except Exception as e:
        item.raw["processing_error"] = str(e)
    return dataclasses.asdict(item)


# ── Stage 6: well-known registry ─────────────────────────────────────────────

def import_well_known_registry(conn, dry_run: bool) -> None:
    hub_html = fetch_html(config.NIPO_HUB_URL)
    xlsx_url = find_well_known_xlsx_url(hub_html)
    if not xlsx_url:
        log.warning("well-known registry XLSX not found on hub page %s", config.NIPO_HUB_URL)
        return
    xlsx_url = absolutize(xlsx_url, config.NIPO_BASE)
    path = download_file(xlsx_url)
    rows = parse_registry_xlsx(path, source_file=xlsx_url.rsplit("/", 1)[-1])
    if dry_run:
        log.info("[dry-run] would upsert %d well-known registry rows", len(rows))
        return
    n = db.upsert_well_known(conn, rows)
    linked = db.link_well_known_decisions(conn)
    log.info("well-known registry: upserted %d rows, linked %d to decisions", n, linked)


# ── Orchestration ────────────────────────────────────────────────────────────

def run(args: argparse.Namespace) -> int:
    sources = [s.strip() for s in args.sources.split(",") if s.strip()]
    sections = [s.strip() for s in args.sections.split(",") if s.strip()]
    for s in sections:
        if s not in config.NIPO_SECTIONS:
            raise SystemExit(f"unknown section: {s}")

    conn = None
    if not args.dry_run:
        conn = db.connect(config.DATABASE_URL)
        if args.create_schema:
            db.create_schema(conn)

    log.info("collecting listings: sources=%s sections=%s", sources, sections)
    items = collect_listings(sources, sections)
    log.info("total listed decisions: %d", len(items))

    if not args.full and conn is not None:
        known = db.existing_decision_urls(conn)
        before = len(items)
        items = [it for it in items if it.decision_pdf_url not in known]
        log.info("incremental mode: %d known skipped, %d new to process", before - len(items), len(items))

    if args.limit:
        items = items[: args.limit]
        log.info("--limit: processing first %d items", len(items))

    if not items:
        log.info("nothing new to process")
    processed: List[dict] = []
    if items:
        log.info("processing %d items in %d worker processes…", len(items), args.workers)
        with ProcessPoolExecutor(max_workers=args.workers, initializer=reset_session) as pool:
            futures = {pool.submit(process_item, dataclasses.asdict(it)): it.decision_pdf_url for it in items}
            done = 0
            for fut in as_completed(futures):
                processed.append(fut.result())
                done += 1
                if done % 25 == 0 or done == len(items):
                    log.info("  …%d/%d", done, len(items))

    # ── validation gate: nothing unvalidated reaches the DB ─────────────────
    accepted: List[DecisionItem] = []
    rejected: List[dict] = []
    for d in processed:
        item = DecisionItem(**d)
        errors, warnings = validate(item)
        if warnings:
            item.raw["validation_warnings"] = warnings
        if errors:
            rejected.append({"errors": errors, "item": dataclasses.asdict(item)})
        else:
            accepted.append(item)

    log.info("validation: %d accepted, %d rejected", len(accepted), len(rejected))
    if rejected:
        os.makedirs(os.path.dirname(os.path.abspath(args.rejects_file)) or ".", exist_ok=True)
        with open(args.rejects_file, "a", encoding="utf-8") as f:
            for r in rejected:
                # texts are huge and re-derivable from the cached PDFs — keep rejects readable
                r["item"]["decision_text"] = (r["item"]["decision_text"] or "")[:500]
                r["item"]["order_text"] = (r["item"]["order_text"] or "")[:500]
                f.write(json.dumps(r, ensure_ascii=False) + "\n")
        log.warning("rejected records appended to %s", args.rejects_file)
        for r in rejected[:10]:
            log.warning("  REJECT %s: %s", r["item"]["decision_pdf_url"], "; ".join(r["errors"]))

    if args.dry_run:
        for it in accepted[: args.limit or 5]:
            preview = {k: v for k, v in dataclasses.asdict(it).items()
                       if k not in ("decision_text", "order_text", "raw")}
            log.info("[dry-run] %s", json.dumps(preview, ensure_ascii=False))
        log.info("[dry-run] would upsert %d decisions", len(accepted))
    elif accepted:
        n = db.upsert_decisions(conn, accepted)
        log.info("upserted %d decisions", n)

    if not args.skip_wellknown and "well_known" in sections and "nipo" in sources:
        import_well_known_registry(conn, args.dry_run)

    if conn is not None:
        log.info("DB stats: %s", json.dumps(db.stats(conn), ensure_ascii=False))
        conn.close()

    # non-zero exit when anything was rejected, so cron surfaces it
    return 1 if rejected else 0


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="NIPO Appeals Chamber decisions scraper")
    p.add_argument("--full", action="store_true",
                   help="reprocess everything (default: incremental — only decisions not in the DB)")
    p.add_argument("--create-schema", action="store_true", help="create tables if missing before run")
    p.add_argument("--workers", type=int, default=4, help="worker processes for PDF download+parse (default 4)")
    p.add_argument("--sources", default="nipo,ukrpatent", help="comma list: nipo,ukrpatent")
    p.add_argument("--sections", default="tm,inventions,well_known", help="comma list: tm,inventions,well_known")
    p.add_argument("--limit", type=int, default=0, help="process at most N items (smoke tests)")
    p.add_argument("--dry-run", action="store_true", help="no DB writes; print parsed records")
    p.add_argument("--skip-wellknown", action="store_true", help="skip the well-known TM registry XLSX import")
    p.add_argument("--rejects-file", default=os.path.join(config.DATA_DIR, "rejects.ndjson"))
    return p


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
        stream=sys.stdout,
    )
    args = build_parser().parse_args()
    sys.exit(run(args))


if __name__ == "__main__":
    main()
