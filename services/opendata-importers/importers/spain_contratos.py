"""ES Plataforma de Contratación del Sector Público — atom feed walker.

Source: contrataciondelestado.es atom chain (CODICE XML inside Atom entries).
Federal _643, CCAA _644, locales _645. ~5-8M tenders since 2008.
"""
import asyncio
import json
import logging
import os
import re
import sys
from xml.etree import ElementTree as ET

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from shared.base import BaseImporter, setup_logging  # noqa: E402
from shared.http_client import MultiIPSessionPool  # noqa: E402


ATOM_NS = {"a": "http://www.w3.org/2005/Atom"}

FEEDS = {
    "federal": "https://contrataciondelestado.es/sindicacion/sindicacion_643/licitacionesPerfilesContratanteCompleto3.atom",
    "ccaa":    "https://contrataciondelestado.es/sindicacion/sindicacion_644/licitacionesPerfilesContratanteCompletoCCAA3.atom",
    "local":   "https://contrataciondelestado.es/sindicacion/sindicacion_645/licitacionesPerfilesContratanteCompletoEELL3.atom",
}


def _t(el, default=""):
    return (el.text or default).strip() if el is not None and el.text else default


def _strip_ns(tag: str) -> str:
    return tag.split("}", 1)[-1] if "}" in tag else tag


def _all(el, name: str):
    return [c for c in el.iter() if _strip_ns(c.tag) == name]


def _first(el, name: str):
    for c in el.iter():
        if _strip_ns(c.tag) == name:
            return c
    return None


class SpainContratosImporter(BaseImporter):
    SERVICE_NAME = "spain_contratos"
    TARGET_TABLE = "spain_contratos"
    COLUMNS = ["contract_id", "title", "summary", "link", "atom_source",
               "contracting_body", "contractor_name", "contractor_nif",
               "procedure_type", "contract_type", "status", "amount",
               "currency", "issue_date", "deadline_date", "award_date",
               "raw_xml", "metadata_json"]
    PK_COLUMNS = ["contract_id"]
    ON_CONFLICT = "do_nothing"
    BATCH_SIZE = 200

    async def import_dataset(self, pool: MultiIPSessionPool):
        max_pages = int(os.environ.get("CONTRATOS_MAX_PAGES", "5"))
        sources = os.environ.get("CONTRATOS_SOURCES", "federal").split(",")

        seen = self.ckpt.done_set
        rows = []

        for source in sources:
            source = source.strip()
            if source not in FEEDS:
                continue
            url = FEEDS[source]
            self.log.info(f"=== {source} ===")
            page = 0
            while page < max_pages:
                try:
                    status, body = await pool.fetch(0, url, retries=2)
                except Exception as e:
                    self.log.warning(f"  fetch failed page {page}: {e}")
                    break
                if status != 200 or not body:
                    self.log.warning(f"  bad status {status} on page {page}")
                    break

                try:
                    root = ET.fromstring(body)
                except ET.ParseError:
                    self.log.warning(f"  XML parse failed page {page}")
                    break

                entries = root.findall(".//a:entry", ATOM_NS)
                if not entries:
                    self.log.info(f"  page {page}: 0 entries")
                    break
                self.log.info(f"  page {page}: {len(entries)} entries")
                self.stats.downloaded += len(entries)

                for entry in entries:
                    rec = self._parse_entry(entry, source)
                    if not rec:
                        continue
                    if rec[0] in seen:
                        self.stats.skipped += 1
                        continue
                    rows.append(rec)
                    self.ckpt.add_done(rec[0])

                if len(rows) >= self.BATCH_SIZE:
                    self.write_batch(rows)
                    self.ckpt.flush()
                    rows = []

                # Find rel="next" link
                next_url = None
                for link in entry.findall("../a:link", ATOM_NS) + root.findall(".//a:link", ATOM_NS):
                    if link.attrib.get("rel") == "next" and link.attrib.get("href"):
                        next_url = link.attrib["href"]
                        break
                if not next_url or next_url == url:
                    break
                url = next_url
                page += 1

        if rows:
            self.write_batch(rows)
            self.ckpt.flush()

    def _parse_entry(self, entry, atom_source):
        eid = _t(entry.find("a:id", ATOM_NS))
        if not eid:
            return None
        title = _t(entry.find("a:title", ATOM_NS))[:1000] or None
        summary = _t(entry.find("a:summary", ATOM_NS))[:5000] or None
        link_el = entry.find("a:link", ATOM_NS)
        link = link_el.attrib.get("href") if link_el is not None else None

        # CODICE content embedded in entry
        body_el = next((c for c in entry if _strip_ns(c.tag) == "ContractFolderStatus"), None)
        if body_el is None:
            for c in entry.iter():
                if _strip_ns(c.tag) == "ContractFolderStatus":
                    body_el = c
                    break

        contracting_body = ""
        contractor_name = ""
        contractor_nif = ""
        procedure_type = ""
        contract_type = ""
        status = ""
        amount = None
        issue_date = None
        deadline_date = None
        award_date = None

        if body_el is not None:
            cb = _first(body_el, "LocatedContractingParty")
            if cb is not None:
                pn = _first(cb, "PartyName")
                if pn is not None:
                    contracting_body = _t(_first(pn, "Name"))[:500]

            tcs = _first(body_el, "TenderingProcess")
            if tcs is not None:
                procedure_type = _t(_first(tcs, "ProcedureCode"))[:100]

            tcd = _first(body_el, "TenderResult")
            if tcd is not None:
                ar = _first(tcd, "AwardedTenderedProject")
                if ar is not None:
                    awc = _first(ar, "LegalMonetaryTotal")
                    if awc is not None:
                        amt = _t(_first(awc, "PayableAmount"))
                        try:
                            amount = float(amt)
                        except (ValueError, TypeError):
                            amount = None
                wp = _first(tcd, "WinningParty")
                if wp is not None:
                    pn = _first(wp, "PartyName")
                    if pn is not None:
                        contractor_name = _t(_first(pn, "Name"))[:500]
                    pid = _first(wp, "PartyIdentification")
                    if pid is not None:
                        contractor_nif = _t(_first(pid, "ID"))[:50]

            status = _t(_first(body_el, "ContractFolderStatusCode"))[:50]
            issue_date = _t(_first(body_el, "IssuedDate")) or None
            if issue_date and len(issue_date) >= 10:
                issue_date = issue_date[:10]

        raw_xml_str = ET.tostring(entry, encoding="unicode")[:500_000]

        return (
            eid, title, summary, link, atom_source,
            contracting_body or None,
            contractor_name or None,
            contractor_nif or None,
            procedure_type or None,
            contract_type or None,
            status or None,
            amount,
            "EUR",
            issue_date,
            deadline_date,
            award_date,
            raw_xml_str,
            json.dumps({"atom_id_size": len(eid)}, ensure_ascii=False),
        )


if __name__ == "__main__":
    setup_logging("spain_contratos")
    SpainContratosImporter().run()
