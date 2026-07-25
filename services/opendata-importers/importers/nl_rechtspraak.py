"""NL Rechtspraak incremental ECLI sync — top up nl_rechtspraak_decisions.

Strategy:
1. Pick the date window (START_DATE/END_DATE, else walk forward from prod's max)
2. Use data.rechtspraak.nl Atom feed (zoeken endpoint) to list ECLIs per day
3. For each ECLI, fetch the full XML, parse fields, batch upsert

The feed endpoint accepts ?date=YYYY-MM-DD&max=N pagination.

Note on coverage: Rechtspraak publishes most decisions as metadata only. Probing
420 text-less rows across 2013-2026 found a body for 1% of them, so a NULL
full_text is normally the source's own state, not a parse failure. The one real
recovery case is decisions published within roughly the last 90 days, where the
body lands days after the metadata (30% for 2026-04 rows fetched same-day) — that
is what nl_rechtspraak_enrich.py re-checks.

Progress is checkpointed per day. Days within SETTLE_DAYS of today are always
re-walked, because a decision's body is published days after its metadata.

Env:
  START_DATE / END_DATE   explicit window (YYYY-MM-DD), skips the max-date probe
  WALK_DAYS               days to walk forward when START_DATE is unset (default 30)
  SETTLE_DAYS             how recent a day must be to be re-walked (default 45)
"""
import asyncio
import json
import logging
import os
import re
import subprocess
import sys
from datetime import date, timedelta
from xml.etree import ElementTree as ET

# Allow `python -m importers.nl_rechtspraak` from anywhere
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from shared.base import BaseImporter, setup_logging  # noqa: E402
from shared.http_client import MultiIPSessionPool  # noqa: E402
from shared.prod_writer import _ssh_cmd  # noqa: E402


ATOM_NS = {"a": "http://www.w3.org/2005/Atom"}

RDF_NS = {
    "rdf": "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
    "dcterms": "http://purl.org/dc/terms/",
    "psi": "http://psi.rechtspraak.nl/",
    "ecli": "https://e-justice.europa.eu/ecli",
    "rs": "http://www.rechtspraak.nl/schema/rechtspraak-1.0",
}

# dcterms/psi fields worth keeping verbatim in metadata_json
META_FIELDS = ("identifier", "format", "accessRights", "modified", "issued",
               "publisher", "language", "creator", "date", "type", "coverage",
               "spatial", "subject", "references", "title", "zaaknummer",
               "procedure", "hasVersion")

_WS = re.compile(r"\s+")


def _norm(text: str) -> str:
    """Collapse whitespace. Matches the flattened form of the rows already on prod."""
    return _WS.sub(" ", text).strip()


def _pg_array(items: list[str]) -> str | None:
    """Render a text[] literal for COPY. Quotes/backslashes are dropped rather
    than escaped: these are rechtsgebied labels, never contain them."""
    clean = []
    for item in items:
        item = item.replace('"', "").replace("\\", "").strip()
        if item and item not in clean:
            clean.append(item)
    if not clean:
        return None
    return "{" + ",".join(f'"{i}"' for i in clean) + "}"


def parse_document(body: str, ecli: str) -> dict | None:
    """Parse one data.rechtspraak.nl content document into a row dict.

    Returns None when the XML will not parse at all. A document with no
    <uitspraak>/<conclusie> body is still returned, with full_text=None: that is
    the normal shape for a metadata-only publication.
    """
    try:
        root = ET.fromstring(body)
    except ET.ParseError:
        return None

    texts: dict[str, list[str]] = {}
    full_text = None
    summary = None

    for el in root.iter():
        tag = el.tag.split("}", 1)[-1]
        if tag in ("uitspraak", "conclusie"):
            if full_text is None:
                candidate = _norm("".join(el.itertext()))
                if candidate:
                    full_text = candidate
        elif tag == "inhoudsindicatie":
            if summary is None:
                candidate = _norm("".join(el.itertext()))
                if candidate:
                    summary = candidate
        elif tag in META_FIELDS:
            value = _norm("".join(el.itertext()))
            if value:
                texts.setdefault(tag, []).append(value)

    def first(tag: str) -> str | None:
        vals = texts.get(tag)
        return vals[0] if vals else None

    if summary is None:
        summary = first("abstract")

    decision_date = first("date")
    if decision_date and len(decision_date) >= 10:
        decision_date = decision_date[:10]
    else:
        decision_date = None

    # dcterms:subject arrives either as repeated elements or one "A; B" string
    subjects: list[str] = []
    for raw in texts.get("subject", []):
        subjects.extend(part.strip() for part in raw.split(";"))

    court = first("creator")

    return {
        "ecli": ecli,
        "case_number": first("zaaknummer"),
        "court_code": court,
        "court_name": court,
        "decision_date": decision_date,
        "decision_type": first("type"),
        "procedure_type": first("procedure"),
        "subject_areas": _pg_array(subjects),
        "summary": summary[:5000] if summary else None,
        "full_text": full_text[:1_000_000] if full_text else None,
        "full_text_xml": body,
        "metadata_json": json.dumps(
            {k: (v[0] if len(v) == 1 else v) for k, v in texts.items()},
            ensure_ascii=False),
    }


class NLRechtspraakImporter(BaseImporter):
    SERVICE_NAME = "nl_rechtspraak"
    TARGET_TABLE = "nl_rechtspraak_decisions"
    COLUMNS = ["ecli", "case_number", "court_code", "court_name",
               "decision_date", "decision_type", "procedure_type",
               "subject_areas", "summary", "full_text", "full_text_xml",
               "metadata_json"]
    PK_COLUMNS = ["ecli"]
    # Enrich rather than skip: a row may already exist from an earlier run that
    # only had metadata. The source is authoritative, so a freshly parsed value
    # replaces the stored one; stored values survive where the source has none.
    ON_CONFLICT = "do_update_prefer_new"
    BATCH_SIZE = 500

    SEARCH_URL = "https://data.rechtspraak.nl/uitspraken/zoeken"
    CONTENT_URL = "https://data.rechtspraak.nl/uitspraken/content"
    FEED_PAGE_SIZE = 1000

    def _get_max_date_on_prod(self) -> str:
        cmd = _ssh_cmd(self.ssh_host) + [
            f"docker exec {self.container} psql -U {self.dbuser} -d {self.dbname} -tAc "
            f"\"SELECT COALESCE(MAX(decision_date)::text, '2000-01-01') FROM {self.TARGET_TABLE}\""]
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        if proc.returncode != 0:
            self.log.warning(f"Could not read max date: {proc.stderr[-500:]}")
            return "2000-01-01"
        return proc.stdout.strip() or "2000-01-01"

    def _window(self) -> tuple[date, date]:
        """Resolve the date window to walk.

        START_DATE exists because resuming from MAX(decision_date) silently skips
        holes: anything loaded out of band (e.g. the 2026-07-25 pilot merge, which
        pushed the max to 2026-07-03 while leaving 2026-05-23..07-03 nearly empty)
        moves the cursor past days that were never harvested.
        """
        today = date.today()
        start_env = os.environ.get("START_DATE", "").strip()
        end_env = os.environ.get("END_DATE", "").strip()

        if start_env:
            start_day = date.fromisoformat(start_env)
            end_day = date.fromisoformat(end_env) if end_env else today
            self.log.info(f"Explicit window from env: {start_day}..{end_day}")
        else:
            max_date_str = self._get_max_date_on_prod()
            self.log.info(f"Max decision_date on prod: {max_date_str}")
            try:
                start_day = date.fromisoformat(max_date_str)
            except ValueError:
                start_day = date(2000, 1, 1)
            end_day = start_day + timedelta(days=int(os.environ.get("WALK_DAYS", "30")))

        return start_day, min(end_day, today)

    async def _list_eclis_for_date(self, pool, idx: int, day: date) -> list[str]:
        """List every ECLI for one decision date, following the feed's paging.

        Busy days exceed a single page (2026-05-20 has 955), so stopping at the
        first response would silently drop decisions. The feed reports the true
        total in <subtitle> ("Aantal gevonden ECLI's: N"), which is what we page
        against.
        """
        found: list[str] = []
        offset = 0
        total = None
        while True:
            url = (f"{self.SEARCH_URL}?date={day.isoformat()}"
                   f"&max={self.FEED_PAGE_SIZE}&from={offset}")
            try:
                status, body = await pool.fetch(idx, url)
            except Exception as e:
                self.log.warning(f"feed fetch failed for {day} at offset {offset}: {e}")
                break
            if status != 200:
                self.log.warning(f"feed HTTP {status} for {day} at offset {offset}")
                break
            try:
                root = ET.fromstring(body)
            except ET.ParseError:
                self.log.warning(f"feed XML parse failed for {day} at offset {offset}")
                break

            page = [e.text for e in root.findall(".//a:entry/a:id", ATOM_NS) if e.text]
            if total is None:
                total = self._feed_total(root)
            found.extend(page)
            offset += len(page)
            if not page or (total is not None and offset >= total):
                break

        if total is not None and len(found) < total:
            self.log.warning(f"{day}: feed reports {total} ECLIs but only {len(found)} "
                             f"were listed — that day is incomplete")
        return found

    @staticmethod
    def _feed_total(root) -> int | None:
        subtitle = root.find("a:subtitle", ATOM_NS)
        if subtitle is None or not subtitle.text:
            return None
        digits = re.search(r"(\d+)", subtitle.text)
        return int(digits.group(1)) if digits else None

    async def _fetch_one(self, pool, idx: int, ecli: str) -> dict | None:
        url = f"{self.CONTENT_URL}?id={ecli}"
        try:
            status, body = await pool.fetch(idx, url)
        except Exception:
            self.stats.failed += 1
            return None
        if status != 200 or len(body) < 200:
            self.stats.skipped += 1
            return None

        rec = parse_document(body, ecli)
        if rec is None:
            self.stats.failed += 1
            return None
        self.stats.downloaded += 1
        return rec

    async def _fetch_many(self, pool, eclis: list[str], offset: int) -> list[dict]:
        """Fetch a chunk concurrently. The session pool's per-IP semaphores cap
        real parallelism, so handing it the whole chunk is safe."""
        results = await asyncio.gather(
            *[self._fetch_one(pool, offset + i, e) for i, e in enumerate(eclis)])
        return [r for r in results if r]

    async def import_dataset(self, pool: MultiIPSessionPool):
        start_day, end_day = self._window()
        if end_day < start_day:
            self.log.warning(f"Empty window {start_day}..{end_day}, nothing to do")
            return

        # Progress is tracked per day, not per ECLI: a full-history walk covers
        # 1.7M+ ECLIs and rewriting that list into the JSON checkpoint after every
        # batch would cost more I/O than the harvest itself.
        self.ckpt.delete("done")
        days_done = set(self.ckpt.get("days_done", []))

        # Recent days are always re-walked. Rechtspraak publishes the body days
        # after the metadata, so a day is only final once it has settled.
        settle_days = int(os.environ.get("SETTLE_DAYS", "45"))
        settled_before = date.today() - timedelta(days=settle_days)

        days = [start_day + timedelta(days=i) for i in range((end_day - start_day).days + 1)]
        todo = [d for d in days
                if not (d.isoformat() in days_done and d < settled_before)]
        self.log.info(f"Window {start_day}..{end_day}: {len(days)} days, "
                      f"{len(days) - len(todo)} already settled, {len(todo)} to walk "
                      f"(SETTLE_DAYS={settle_days})")

        for n, day in enumerate(todo, start=1):
            eclis = list(dict.fromkeys(await self._list_eclis_for_date(pool, n, day)))
            if not eclis:
                self._mark_day_done(day)
                continue

            with_text = 0
            for start in range(0, len(eclis), self.BATCH_SIZE):
                chunk = eclis[start:start + self.BATCH_SIZE]
                records = await self._fetch_many(pool, chunk, start)
                if records:
                    with_text += sum(1 for r in records if r["full_text"])
                    self.write_batch([tuple(r[c] for c in self.COLUMNS) for r in records])

            self._mark_day_done(day)
            self.log.info(f"  [{n}/{len(todo)}] {day}: {len(eclis)} ECLIs, "
                          f"{with_text} with text | {self.stats.report()}")

    def _mark_day_done(self, day: date):
        days_done = self.ckpt.get("days_done", [])
        iso = day.isoformat()
        if iso not in days_done:
            days_done.append(iso)
        self.ckpt.set("days_done", days_done)


if __name__ == "__main__":
    setup_logging("nl_rechtspraak")
    NLRechtspraakImporter().run()
