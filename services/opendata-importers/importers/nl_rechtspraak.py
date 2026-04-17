"""NL Rechtspraak incremental ECLI sync — top up nl_rechtspraak_decisions.

Strategy:
1. Query the prod table for the most recent decision_date / max imported_at
2. Use data.rechtspraak.nl Atom feed (zoeken endpoint) to walk forward from there
3. For each new ECLI, fetch the full XML, parse fields, batch insert

The feed endpoint accepts ?date=YYYY-MM-DD&max=N pagination.
"""
import asyncio
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


class NLRechtspraakImporter(BaseImporter):
    SERVICE_NAME = "nl_rechtspraak"
    TARGET_TABLE = "nl_rechtspraak_decisions"
    COLUMNS = ["ecli", "case_number", "court_code", "court_name",
               "decision_date", "decision_type", "procedure_type",
               "subject_areas", "parties", "summary", "full_text", "metadata_json"]
    PK_COLUMNS = ["ecli"]
    ON_CONFLICT = "do_nothing"
    BATCH_SIZE = 500

    SEARCH_URL = "https://data.rechtspraak.nl/uitspraken/zoeken"
    CONTENT_URL = "https://data.rechtspraak.nl/uitspraken/content"

    def _get_max_date_on_prod(self) -> str:
        cmd = _ssh_cmd(self.ssh_host) + [
            f"docker exec {self.container} psql -U {self.dbuser} -d {self.dbname} -tAc "
            f"\"SELECT COALESCE(MAX(decision_date)::text, '2000-01-01') FROM {self.TARGET_TABLE}\""]
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        if proc.returncode != 0:
            self.log.warning(f"Could not read max date: {proc.stderr[-500:]}")
            return "2000-01-01"
        return proc.stdout.strip() or "2000-01-01"

    async def _list_eclis_for_date(self, pool, idx: int, day: date) -> list[str]:
        url = f"{self.SEARCH_URL}?date={day.isoformat()}&max=1000"
        try:
            status, body = await pool.fetch(idx, url)
        except Exception as e:
            self.log.warning(f"feed fetch failed for {day}: {e}")
            return []
        if status != 200:
            return []
        try:
            root = ET.fromstring(body)
        except ET.ParseError:
            return []
        return [e.text for e in root.findall(".//a:entry/a:id", ATOM_NS) if e.text]

    async def _fetch_one(self, pool, idx: int, ecli: str) -> dict | None:
        url = f"{self.CONTENT_URL}?id={ecli}"
        try:
            status, body = await pool.fetch(idx, url)
        except Exception as e:
            self.stats.failed += 1
            return None
        if status != 200 or len(body) < 200:
            self.stats.skipped += 1
            return None

        try:
            root = ET.fromstring(body)
        except ET.ParseError:
            self.stats.failed += 1
            return None

        # Extract via namespaces — open data uses RDF + dcterms
        def _text(xpath: str) -> str:
            ns = {
                "rdf": "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
                "dcterms": "http://purl.org/dc/terms/",
                "psi": "http://psi.rechtspraak.nl/",
                "ecli": "https://e-justice.europa.eu/ecli",
                "ucitsi": "http://www.rechtspraak.nl/schema/rechtspraak-1.0",
            }
            try:
                el = root.find(xpath, ns)
                if el is not None:
                    return (el.text or "").strip()
            except Exception:
                pass
            return ""

        full_text = ""
        for el in root.iter():
            tag = el.tag.split("}", 1)[-1]
            if tag in ("uitspraak", "conclusie") and el.text:
                full_text = "".join(el.itertext()).strip()
                break

        decision_date = _text(".//dcterms:date") or _text(".//{http://purl.org/dc/terms/}date")
        if decision_date and len(decision_date) >= 10:
            decision_date = decision_date[:10]
        else:
            decision_date = None

        court_code = _text(".//dcterms:creator")
        decision_type = _text(".//dcterms:type")
        procedure_type = _text(".//psi:procedure")
        case_number = _text(".//psi:zaaknummer")
        summary = _text(".//dcterms:abstract")[:5000]

        self.stats.downloaded += 1
        return {
            "ecli": ecli,
            "case_number": case_number,
            "court_code": court_code,
            "court_name": court_code,
            "decision_date": decision_date,
            "decision_type": decision_type,
            "procedure_type": procedure_type,
            "subject_areas": None,
            "parties": None,
            "summary": summary,
            "full_text": full_text[:1_000_000] if full_text else None,
            "metadata_json": "{}",
        }

    async def import_dataset(self, pool: MultiIPSessionPool):
        max_date_str = self._get_max_date_on_prod()
        self.log.info(f"Max decision_date on prod: {max_date_str}")
        try:
            start_day = date.fromisoformat(max_date_str)
        except ValueError:
            start_day = date(2000, 1, 1)

        days_to_walk = int(os.environ.get("WALK_DAYS", "30"))
        end_day = start_day + timedelta(days=days_to_walk)
        today = date.today()
        if end_day > today:
            end_day = today

        days = [start_day + timedelta(days=i) for i in range((end_day - start_day).days + 1)]
        self.log.info(f"Walking {len(days)} days from {start_day} to {end_day}")

        # Stage 1: list ECLIs per day in parallel
        eclis = []
        sem_idx = [0]

        async def list_one(day):
            sem_idx[0] += 1
            ecli_list = await self._list_eclis_for_date(pool, sem_idx[0], day)
            return ecli_list

        for chunk_start in range(0, len(days), 30):
            chunk = days[chunk_start:chunk_start+30]
            results = await asyncio.gather(*[list_one(d) for d in chunk])
            for sub in results:
                eclis.extend(sub)
            self.log.info(f"  listed {chunk_start+len(chunk)}/{len(days)} days, {len(eclis)} ECLIs found so far")

        seen = self.ckpt.done_set
        new_eclis = [e for e in eclis if e not in seen]
        self.log.info(f"Total {len(eclis)} ECLIs from feed; {len(new_eclis)} new (not in checkpoint)")

        if not new_eclis:
            self.log.info("Nothing to fetch — all caught up")
            return

        # Stage 2: fetch full XML in parallel
        batch = []
        for i, ecli in enumerate(new_eclis):
            rec = await self._fetch_one(pool, i, ecli)
            if rec:
                batch.append(tuple(rec[c] for c in self.COLUMNS))
                self.ckpt.add_done(ecli)
            if len(batch) >= self.BATCH_SIZE:
                self.write_batch(batch)
                self.ckpt.flush()
                batch = []
            if (i + 1) % 200 == 0:
                self.log.info(f"  fetched {i+1}/{len(new_eclis)}")
        if batch:
            self.write_batch(batch)
            self.ckpt.flush()


if __name__ == "__main__":
    setup_logging("nl_rechtspraak")
    NLRechtspraakImporter().run()
