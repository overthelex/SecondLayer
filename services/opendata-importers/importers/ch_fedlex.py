"""CH fedlex.data.admin.ch federal legislation importer.

SPARQL discovery of ELI Works → filestore download of latest Akoma Ntoso XML
per (work, lang). Public domain (Art.5 URG).
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


SPARQL_ENDPOINT = "https://fedlex.data.admin.ch/sparqlendpoint"

DISCOVERY_QUERY = """
PREFIX jolux: <http://data.legilux.public.lu/resource/ontology/jolux#>
SELECT DISTINCT ?work ?expr ?lang ?title ?date WHERE {
  GRAPH ?g {
    ?work a jolux:ConsolidationAbstract ;
          jolux:dateDocument ?date ;
          jolux:isRealizedBy ?expr .
    ?expr jolux:language ?lang ;
          jolux:title ?title .
  }
  FILTER(STRSTARTS(STR(?work), "https://fedlex.data.admin.ch/eli/cc/"))
  FILTER(?lang IN (<http://publications.europa.eu/resource/authority/language/DEU>,
                    <http://publications.europa.eu/resource/authority/language/FRA>,
                    <http://publications.europa.eu/resource/authority/language/ITA>))
}
ORDER BY DESC(?date)
LIMIT %d
"""


def _build_filestore_xml_url(work: str, date_iso: str, lang: str) -> str | None:
    """Construct fedlex filestore XML URL from work URI + date + lang.
    Pattern: /filestore/fedlex.data.admin.ch/eli/cc/{Y}/{N}/{YYYYMMDD}/{lang}/xml/...xml
    """
    m = re.search(r"/eli/cc/([^/]+)/([^/]+)$", work)
    if not m:
        return None
    y, n = m.group(1), m.group(2)
    date_compact = (date_iso or "")[:10].replace("-", "")
    if len(date_compact) != 8:
        return None
    slug = f"fedlex-data-admin-ch-eli-cc-{y}-{n}-{date_compact}-{lang}-xml.xml"
    return (f"https://fedlex.data.admin.ch/filestore/fedlex.data.admin.ch/"
            f"eli/cc/{y}/{n}/{date_compact}/{lang}/xml/{slug}")

LANG_MAP = {
    "http://publications.europa.eu/resource/authority/language/DEU": "de",
    "http://publications.europa.eu/resource/authority/language/FRA": "fr",
    "http://publications.europa.eu/resource/authority/language/ITA": "it",
    "http://publications.europa.eu/resource/authority/language/ROH": "rm",
    "http://publications.europa.eu/resource/authority/language/ENG": "en",
}


class CHFedlexImporter(BaseImporter):
    SERVICE_NAME = "ch_fedlex"
    TARGET_TABLE = "ch_legislation"
    COLUMNS = ["eli_uri", "lang", "sr_number", "title", "short_title",
               "version_date", "in_force", "date_entry_force",
               "date_end_validity", "akn_xml", "full_text", "html_url",
               "pdf_url", "xml_url", "source", "metadata_json"]
    PK_COLUMNS = ["eli_uri", "lang"]
    ON_CONFLICT = "do_update"
    BATCH_SIZE = 100

    async def import_dataset(self, pool: MultiIPSessionPool):
        max_acts = int(os.environ.get("MAX_ACTS", "200"))

        # 1) SPARQL discovery
        self.log.info(f"SPARQL discovery (LIMIT {max_acts})")
        query = DISCOVERY_QUERY % max_acts
        try:
            async with __import__("aiohttp").ClientSession() as session:
                resp = await session.post(
                    SPARQL_ENDPOINT,
                    data={"query": query},
                    headers={"Accept": "application/sparql-results+json"},
                    timeout=120,
                )
                if resp.status != 200:
                    self.log.error(f"SPARQL status {resp.status}")
                    return
                results = (await resp.json()).get("results", {}).get("bindings", [])
        except Exception as e:
            self.log.error(f"SPARQL failed: {e}")
            return

        self.log.info(f"  got {len(results)} (work, lang) pairs from SPARQL")
        seen = self.ckpt.done_set

        # Dedupe to latest version per (work, lang)
        latest = {}
        for b in results:
            work = b.get("work", {}).get("value")
            expr = b.get("expr", {}).get("value")
            lang_iri = b.get("lang", {}).get("value")
            lang = LANG_MAP.get(lang_iri, "")
            if not work or not lang or not expr:
                continue
            key = (work, lang)
            date_val = b.get("date", {}).get("value", "")
            xml_url = _build_filestore_xml_url(work, date_val, lang)
            if not xml_url:
                continue
            if key not in latest or date_val > latest[key].get("date_val", ""):
                sr_match = re.search(r"/eli/cc/([^/]+)/([^/]+)$", work)
                sr = f"{sr_match.group(1)}/{sr_match.group(2)}" if sr_match else None
                latest[key] = {
                    "work": work,
                    "lang": lang,
                    "sr": sr,
                    "title": b.get("title", {}).get("value", ""),
                    "date_val": date_val,
                    "xml": xml_url,
                }

        self.log.info(f"  deduped to {len(latest)} latest (work, lang)")

        rows = []
        items = [(k, v) for k, v in latest.items() if f"{v['work']}|{v['lang']}" not in seen]
        self.log.info(f"  {len(items)} new to fetch (skipping checkpoint)")

        for i, ((work, lang), v) in enumerate(items):
            xml_url = v["xml"]
            if not xml_url:
                continue
            try:
                status, body = await pool.fetch_bytes(i, xml_url, retries=2)
            except Exception:
                self.stats.failed += 1
                continue
            if status != 200 or not body:
                self.stats.skipped += 1
                continue

            akn_xml = body.decode("utf-8", errors="replace")[:5_000_000]
            full_text = self._extract_text(akn_xml)

            rows.append((
                work, lang, v.get("sr"), v.get("title")[:1000] if v.get("title") else None,
                None, v.get("date_val")[:10] if v.get("date_val") else None,
                None, None, None, akn_xml, full_text,
                None, None, xml_url, "fedlex",
                json.dumps({"discovered_at": v.get("date_val")}, ensure_ascii=False),
            ))
            self.ckpt.add_done(f"{work}|{lang}")
            self.stats.downloaded += 1

            if len(rows) >= self.BATCH_SIZE:
                self.write_batch(rows)
                self.ckpt.flush()
                rows = []

            if (i + 1) % 50 == 0:
                self.log.info(f"  fetched {i + 1}/{len(items)}")

        if rows:
            self.write_batch(rows)
            self.ckpt.flush()

    def _extract_text(self, xml: str) -> str:
        try:
            root = ET.fromstring(xml)
            text = " ".join(t.strip() for t in root.itertext() if t.strip())
            return text[:1_000_000]
        except ET.ParseError:
            return re.sub(r"<[^>]+>", " ", xml)[:1_000_000]


if __name__ == "__main__":
    setup_logging("ch_fedlex")
    CHFedlexImporter().run()
