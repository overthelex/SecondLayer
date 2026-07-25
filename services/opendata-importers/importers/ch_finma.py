"""CH FINMA authorised institutions importer.

Source: https://www.finma.ch/en/finma-public/authorised-institutions-individuals-and-products/
Strategy: scrape the index page for ~20 XLSX URLs (one per authorization category),
download each XLSX, parse with openpyxl, insert rows into ch_finma_regulated.

XLSX structure:
- row 0: title (becomes authorization_type)
- row 4 (or first row with >=2 string headers): column headers
- rows after headers: data
"""
import io
import json
import os
import re
import sys

import openpyxl

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from shared.base import BaseImporter, setup_logging  # noqa: E402
from shared.http_client import MultiIPSessionPool  # noqa: E402


INDEX_URL = ("https://www.finma.ch/en/finma-public/"
             "authorised-institutions-individuals-and-products/")
XLSX_HREF_RE = re.compile(r'href="(/[a-z]{2}/~/media/finma/dokumente/'
                          r'bewilligungstraeger/xlsx/[^"]+\.xlsx[^"]*)"')
# FINMA serves the same files in 4 languages (de/en/fr/it) — keep only one
# to avoid 4× duplicates on the (entity_name, authorization_type) PK.
LANG_PREFIX = "/en/"


class CHFinmaImporter(BaseImporter):
    SERVICE_NAME = "ch_finma"
    TARGET_TABLE = "ch_finma_regulated"
    COLUMNS = ["entity_name", "authorization_type", "authorization_number",
               "status", "city", "canton", "country", "effective_date",
               "metadata_json"]
    PK_COLUMNS = ["entity_name", "authorization_type"]
    ON_CONFLICT = "do_update"
    BATCH_SIZE = 500

    async def import_dataset(self, pool: MultiIPSessionPool):
        try:
            status, body = await pool.fetch(0, INDEX_URL, retries=3)
        except Exception as e:
            self.log.error(f"index fetch failed: {e}")
            return
        if status != 200:
            self.log.error(f"index status {status}")
            return

        hrefs = list(dict.fromkeys(XLSX_HREF_RE.findall(body)))
        hrefs = [h for h in hrefs if h.startswith(LANG_PREFIX)]
        urls = [f"https://www.finma.ch{h.replace('&amp;', '&')}" for h in hrefs]
        self.log.info(f"Discovered {len(urls)} EN XLSX files on FINMA index")
        seen_keys: set[tuple[str, str]] = set()

        rows = []
        for i, url in enumerate(urls):
            slug = url.rsplit("/", 1)[-1].split(".xlsx", 1)[0]
            try:
                status, body_b = await pool.fetch_bytes(i, url, retries=3)
            except Exception as e:
                self.log.warning(f"  [{slug}] download failed: {e}")
                self.stats.failed += 1
                continue
            if status != 200 or not body_b:
                self.log.warning(f"  [{slug}] status {status}")
                self.stats.skipped += 1
                continue
            self.stats.downloaded += 1

            try:
                parsed = self._parse_xlsx(body_b, slug)
            except Exception as e:
                self.log.warning(f"  [{slug}] parse failed: {e}")
                self.stats.failed += 1
                continue
            if not parsed:
                continue

            auth_type, records = parsed
            self.log.info(f"  [{slug}] {auth_type}: {len(records)} entities")

            for rec in records:
                name = rec["name"][:1000]
                a_type = auth_type[:500]
                key = (name, a_type)
                if key in seen_keys:
                    self.stats.skipped += 1
                    continue
                seen_keys.add(key)
                rows.append((
                    name,
                    a_type,
                    None,
                    rec.get("status"),
                    rec.get("city"),
                    None,
                    None,
                    None,
                    json.dumps({"slug": slug, "extra": rec.get("extra", {})},
                               ensure_ascii=False),
                ))

                if len(rows) >= self.BATCH_SIZE:
                    self.write_batch(rows)
                    rows = []

        if rows:
            self.write_batch(rows)

    def _parse_xlsx(self, body: bytes, slug: str):
        wb = openpyxl.load_workbook(io.BytesIO(body), read_only=True, data_only=True)
        ws = wb.active
        title = None
        headers = None
        records = []
        for row in ws.iter_rows(values_only=True):
            cells = [c for c in row if c is not None]
            if not cells:
                continue
            if title is None:
                title = str(cells[0]).strip()[:500] or slug
                continue
            if headers is None:
                strs = [c for c in cells if isinstance(c, str)]
                if len(strs) >= 2 and any(
                        any(k in s for k in ("Name", "Nom", "Nome"))
                        for s in strs):
                    headers = [str(c).strip() if c else "" for c in row]
                continue

            row_list = list(row)
            if not row_list or not row_list[0]:
                continue
            name = str(row_list[0]).strip()
            if not name or name.lower() == "name":
                continue
            city = str(row_list[1]).strip() if len(row_list) > 1 and row_list[1] else None
            status = str(row_list[2]).strip() if len(row_list) > 2 and row_list[2] else None
            extra = {}
            for j in range(3, min(len(row_list), len(headers or []))):
                if row_list[j] is not None and headers[j]:
                    extra[headers[j]] = str(row_list[j])[:200]
            records.append({"name": name, "city": city,
                            "status": status, "extra": extra})
        wb.close()
        return (title or slug, records)


if __name__ == "__main__":
    setup_logging("ch_finma")
    CHFinmaImporter().run()
