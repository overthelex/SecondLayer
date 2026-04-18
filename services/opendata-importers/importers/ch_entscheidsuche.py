"""CH entscheidsuche.ch court decisions importer.

Aggregator for federal + 26 cantonal Swiss courts, ~500K decisions.
Uses sitemap discovery + per-spider /docs/Index/{SPIDER}/last for deltas.
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


SITEMAP_INDEX = "https://entscheidsuche.ch/sitemapindex.xml"
SITEMAP_NS = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}


class CHEntscheidsucheImporter(BaseImporter):
    SERVICE_NAME = "ch_entscheidsuche"
    TARGET_TABLE = "ch_court_decisions"
    COLUMNS = ["ecli", "spider", "court_code", "court_name", "chamber",
               "decision_type", "decision_date", "docket_number", "parties",
               "abstract", "full_text", "pdf_url", "json_url", "languages",
               "metadata_json"]
    PK_COLUMNS = ["ecli"]
    ON_CONFLICT = "do_nothing"
    BATCH_SIZE = 200

    async def import_dataset(self, pool: MultiIPSessionPool):
        max_per_spider = int(os.environ.get("MAX_DOCS_PER_SPIDER", "1000"))
        spiders_filter = os.environ.get("SPIDERS", "").strip()
        spider_list = [s.strip() for s in spiders_filter.split(",")] if spiders_filter else None

        # 1) Discover sitemaps
        try:
            status, body = await pool.fetch(0, SITEMAP_INDEX, retries=3)
        except Exception as e:
            self.log.error(f"sitemap fetch failed: {e}")
            return
        if status != 200:
            self.log.error(f"sitemap status {status}")
            return

        try:
            root = ET.fromstring(body)
        except ET.ParseError as e:
            self.log.error(f"sitemap parse failed: {e}")
            return

        sitemap_urls = [el.text for el in root.findall(".//sm:sitemap/sm:loc", SITEMAP_NS) if el.text]
        self.log.info(f"Sitemap index has {len(sitemap_urls)} per-spider sitemaps")

        # Group by spider name
        spiders = {}
        for url in sitemap_urls:
            m = re.search(r"/([A-Z]{2,3}_[A-Za-z]+)_(\d+)\.xml$", url)
            if m:
                spider = m.group(1)
                if spider_list and spider not in spider_list:
                    continue
                spiders.setdefault(spider, []).append(url)

        self.log.info(f"Filtered {len(spiders)} spiders to process")
        seen = self.ckpt.done_set

        rows = []
        for spider, urls in spiders.items():
            self.log.info(f"=== {spider} ({len(urls)} sitemap(s)) ===")
            doc_ids = set()
            for sitemap_url in urls:
                try:
                    s, b = await pool.fetch(0, sitemap_url, retries=2)
                except Exception:
                    continue
                if s != 200:
                    continue
                try:
                    sm_root = ET.fromstring(b)
                except ET.ParseError:
                    continue
                for loc in sm_root.findall(".//sm:url/sm:loc", SITEMAP_NS):
                    if loc.text:
                        m = re.search(r"/view/([^/?#]+)", loc.text)
                        if m:
                            doc_ids.add(m.group(1))
                if len(doc_ids) >= max_per_spider:
                    break
            new_ids = [d for d in doc_ids if d not in seen][:max_per_spider]
            self.log.info(f"  {len(doc_ids)} total, {len(new_ids)} new (cap {max_per_spider})")

            # Fetch JSON details in parallel batches
            for i, doc_id in enumerate(new_ids):
                json_url = f"https://entscheidsuche.ch/docs/{spider}/{doc_id}.json"
                try:
                    s, b = await pool.fetch(i, json_url, retries=2)
                except Exception:
                    self.stats.failed += 1
                    continue
                if s != 200 or not b:
                    self.stats.skipped += 1
                    continue
                try:
                    data = json.loads(b)
                except Exception:
                    self.stats.failed += 1
                    continue

                rec = self._parse_doc(spider, doc_id, data, json_url)
                if rec:
                    rows.append(rec)
                    self.ckpt.add_done(doc_id)
                    self.stats.downloaded += 1

                if len(rows) >= self.BATCH_SIZE:
                    self.write_batch(rows)
                    self.ckpt.flush()
                    rows = []

                if (i + 1) % 100 == 0:
                    self.log.info(f"  fetched {i + 1}/{len(new_ids)}")

        if rows:
            self.write_batch(rows)
            self.ckpt.flush()

    def _parse_doc(self, spider: str, doc_id: str, data: dict, json_url: str):
        meta = data.get("Meta") or {}
        # entscheidsuche sometimes nests Meta as a single-element list
        if isinstance(meta, list):
            meta = meta[0] if meta and isinstance(meta[0], dict) else {}
        if not isinstance(meta, dict):
            meta = {}
        court_code = spider.split("_")[1] if "_" in spider else spider
        court_name = court_code

        # Build ECLI from doc_id (entscheidsuche IDs are ECLI-mappable)
        ecli = doc_id if doc_id.startswith("ECLI:") else f"ECLI:CH:{spider}:{doc_id}"

        decision_date = meta.get("Datum") or meta.get("Date")
        if decision_date and len(decision_date) >= 10:
            decision_date = decision_date[:10]
        else:
            decision_date = None

        decision_type = meta.get("Typ") or meta.get("DecisionType")
        chamber = meta.get("Kammer") or meta.get("Chamber")
        docket = meta.get("Geschaeftsnummer") or meta.get("Docket")
        parties = meta.get("Parties") or ""

        abstract = data.get("Abstract") or meta.get("Abstract") or ""
        if isinstance(abstract, dict):
            abstract = abstract.get("de") or abstract.get("fr") or abstract.get("it") or ""
        abstract = str(abstract)[:5000] if abstract else None

        full_text = ""
        for key in ("Text", "Inhalt", "Content"):
            if key in data and data[key]:
                full_text = data[key]
                if isinstance(full_text, dict):
                    full_text = full_text.get("de") or full_text.get("fr") or full_text.get("it") or ""
                break
        full_text = str(full_text)[:1_000_000] if full_text else None

        pdf_url = data.get("PDF_URL") or data.get("PdfUrl") or f"https://entscheidsuche.ch/docs/{spider}/{doc_id}.pdf"
        languages = []
        for k in ("Language", "Sprache"):
            if k in meta:
                v = meta[k]
                if isinstance(v, list):
                    languages = [str(x) for x in v]
                else:
                    languages = [str(v)]
                break

        return (
            ecli, spider, court_code, court_name, chamber, decision_type,
            decision_date, docket, parties[:5000] if parties else None,
            abstract, full_text, pdf_url, json_url,
            _pg_array(languages),
            json.dumps({"raw_meta_keys": list(meta.keys())[:20]}, ensure_ascii=False),
        )


def _pg_array(values: list):
    if not values:
        return None
    quoted = []
    for v in values:
        s = str(v).replace("\\", "\\\\").replace('"', '\\"')
        quoted.append(f'"{s}"')
    return "{" + ",".join(quoted) + "}"


if __name__ == "__main__":
    setup_logging("ch_entscheidsuche")
    CHEntscheidsucheImporter().run()
