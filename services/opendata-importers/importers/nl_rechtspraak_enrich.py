"""NL Rechtspraak enrichment pass — fill holes in rows that already exist on prod.

Unlike nl_rechtspraak.py (which walks the Atom feed forward to discover new
decisions), this reads its worklist from prod and re-fetches those ECLIs so every
row ends up parsed by one parser. Writes go through ON CONFLICT DO UPDATE in
prefer-new mode: a value parsed from the source replaces the stored one, and
stored values survive only where the source has nothing. jsonb metadata is merged
key-wise, so load markers survive.

Why it exists: as of 2026-07-25 the table had been filled by three different
loaders and showed it. Of 1,470,895 rows, 553,250 had no subject_areas and 553,280
no summary; 617,623 of the rows that did have text carried the document's RDF
header inside full_text (mime types, publisher, deeplink URL) because one loader
flattened the whole XML; and 1,614 rows held bytes that are not valid UTF-8, which
makes any full-table query using string functions abort. Re-fetching and
re-parsing fixes all three at once.

What it cannot fix: missing full_text. Probing 420 text-less rows across
2013-2026 found a body for 1% of them — Rechtspraak publishes most decisions as
metadata only. The exception is recent decisions, where the body lands days after
the metadata (30% of 2026-04 rows that were fetched same-day now have one), which
is what MODE=recent_text re-checks.

Modes (MODE env):
  metadata     rows never enriched from source RDF (default)
  recent_text  rows with no full_text whose decision_date is within RECHECK_DAYS

Env:
  MODE, RECHECK_DAYS (default 90), WORKLIST_LIMIT (0 = no limit, for smoke tests)
"""
import asyncio
import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from importers.nl_rechtspraak import parse_document  # noqa: E402
from shared.base import BaseImporter, setup_logging  # noqa: E402
from shared.http_client import MultiIPSessionPool  # noqa: E402
from shared.prod_writer import _ssh_cmd  # noqa: E402


# A row counts as enriched once its metadata_json carries the source's own
# dcterms:identifier. That makes the worklist self-draining: rows whose source
# genuinely has no subject_areas still drop out after one pass instead of being
# re-fetched forever.
WORKLISTS = {
    "metadata": (
        "SELECT ecli FROM nl_rechtspraak_decisions "
        "WHERE NOT (COALESCE(metadata_json, '{}'::jsonb) ? 'identifier') "
        "ORDER BY decision_date DESC NULLS LAST, ecli"
    ),
    "recent_text": (
        "SELECT ecli FROM nl_rechtspraak_decisions "
        "WHERE full_text IS NULL "
        "AND decision_date >= current_date - INTERVAL '{recheck_days} days' "
        "ORDER BY decision_date DESC"
    ),
}


class NLRechtspraakEnricher(BaseImporter):
    SERVICE_NAME = "nl_rechtspraak_enrich"
    TARGET_TABLE = "nl_rechtspraak_decisions"
    COLUMNS = ["ecli", "case_number", "court_code", "court_name",
               "decision_date", "decision_type", "procedure_type",
               "subject_areas", "summary", "full_text", "full_text_xml",
               "metadata_json"]
    PK_COLUMNS = ["ecli"]
    ON_CONFLICT = "do_update_prefer_new"
    BATCH_SIZE = 500

    CONTENT_URL = "https://data.rechtspraak.nl/uitspraken/content"

    def __init__(self):
        super().__init__()
        self.mode = os.environ.get("MODE", "metadata")
        if self.mode not in WORKLISTS:
            raise SystemExit(f"MODE must be one of {sorted(WORKLISTS)}, got {self.mode!r}")
        self.recheck_days = int(os.environ.get("RECHECK_DAYS", "90"))
        self.worklist_limit = int(os.environ.get("WORKLIST_LIMIT", "0"))

    def _worklist(self) -> list[str]:
        """Pull the ECLIs to re-fetch from prod.

        No ECLI checkpoint here on purpose: the query is self-draining, so a
        re-run after a crash simply returns what is still missing. Keeping
        hundreds of thousands of ECLIs in the JSON checkpoint would rewrite a
        multi-megabyte file on every batch.
        """
        # str.replace, not str.format: the metadata query contains '{}'::jsonb
        sql = WORKLISTS[self.mode].replace("{recheck_days}", str(self.recheck_days))
        if self.worklist_limit:
            sql += f" LIMIT {self.worklist_limit}"
        cmd = _ssh_cmd(self.ssh_host) + [
            f"docker exec {self.container} psql -U {self.dbuser} -d {self.dbname} "
            f"-tA -c \"{sql}\""]
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=1800)
        if proc.returncode != 0:
            raise RuntimeError(f"worklist query failed: {proc.stderr[-2000:]}")
        return [line.strip() for line in proc.stdout.splitlines() if line.strip()]

    async def _fetch_one(self, pool, idx: int, ecli: str) -> dict | None:
        try:
            status, body = await pool.fetch(idx, f"{self.CONTENT_URL}?id={ecli}")
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

    async def import_dataset(self, pool: MultiIPSessionPool):
        eclis = self._worklist()
        self.log.info(f"mode={self.mode} worklist={len(eclis)} ECLIs"
                      + (f" (RECHECK_DAYS={self.recheck_days})"
                         if self.mode == "recent_text" else ""))
        if not eclis:
            self.log.info("Nothing to enrich")
            return

        filled_text = 0
        for start in range(0, len(eclis), self.BATCH_SIZE):
            chunk = eclis[start:start + self.BATCH_SIZE]
            records = await asyncio.gather(
                *[self._fetch_one(pool, start + i, e) for i, e in enumerate(chunk)])
            records = [r for r in records if r]
            if records:
                filled_text += sum(1 for r in records if r["full_text"])
                self.write_batch([tuple(r[c] for c in self.COLUMNS) for r in records])
            done = min(start + self.BATCH_SIZE, len(eclis))
            self.log.info(f"  {done}/{len(eclis)} | bodies found so far: {filled_text}"
                          f" | {self.stats.report()}")

        self.log.info(f"Enrichment done: {filled_text} of {len(eclis)} documents "
                      f"carried a body at source")


if __name__ == "__main__":
    setup_logging("nl_rechtspraak_enrich")
    NLRechtspraakEnricher().run()
