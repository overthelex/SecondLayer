"""ES Consejo de Estado dictámenes — UNBLOCKED via correct ID format.

Critical: ID format CE-D-{YEAR}-{NUM} WITHOUT zero-padding.
Sentinel: 11883 bytes = "Documento no encontrado".
Coverage 1992-2026, sparse 1..3000 per year, ~75K total.
"""
import asyncio
import json
import logging
import os
import re
import sys
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from shared.base import BaseImporter, setup_logging  # noqa: E402
from shared.http_client import MultiIPSessionPool  # noqa: E402


BOE_DOC = "https://www.boe.es/buscar/doc.php"
NOT_FOUND_SIZE = 11883
TITLE_NOT_FOUND = "Documento no encontrado"


class SpainConsejoEstadoImporter(BaseImporter):
    SERVICE_NAME = "spain_consejo_estado"
    TARGET_TABLE = "spain_consejo_estado"
    COLUMNS = ["id", "expediente", "fecha_aprobacion", "procedencia",
               "full_text", "metadata_json"]
    PK_COLUMNS = ["id"]
    ON_CONFLICT = "do_nothing"
    BATCH_SIZE = 200

    YEAR_MAX = {y: 3000 for y in range(1992, 2027)}

    async def import_dataset(self, pool: MultiIPSessionPool):
        max_per_year = int(os.environ.get("CE_MAX_PER_YEAR", "1500"))
        years_filter = os.environ.get("CE_YEARS", "")
        if years_filter:
            years = sorted({int(y) for y in years_filter.split(",")})
        else:
            years = sorted(self.YEAR_MAX.keys(), reverse=True)

        # Build candidate IDs (skip checkpoint ones)
        seen = self.ckpt.done_set
        candidates = []
        for year in years:
            cap = min(max_per_year, self.YEAR_MAX[year])
            for num in range(1, cap + 1):
                doc_id = f"CE-D-{year}-{num}"
                if doc_id not in seen:
                    candidates.append(doc_id)
        self.log.info(f"Candidates to probe: {len(candidates)} (years {years[:3]}..{years[-1:]})")

        if not candidates:
            self.log.info("Nothing to fetch — all caught up")
            return

        rows = []
        sem = asyncio.Semaphore(pool.total_workers)

        async def fetch_one(idx: int, doc_id: str):
            async with sem:
                url = f"{BOE_DOC}?id={doc_id}"
                try:
                    status, body = await pool.fetch(idx, url, retries=2)
                except Exception:
                    self.stats.failed += 1
                    return None
                if status != 200:
                    self.stats.skipped += 1
                    return None
                if len(body) <= NOT_FOUND_SIZE + 100:
                    if TITLE_NOT_FOUND in body:
                        self.stats.skipped += 1
                        self.ckpt.add_done(doc_id)
                        return None
                rec = self._parse_html(doc_id, body)
                if rec:
                    self.ckpt.add_done(doc_id)
                    self.stats.downloaded += 1
                    return rec
                self.stats.skipped += 1
                return None

        for i in range(0, len(candidates), 200):
            chunk = candidates[i:i+200]
            results = await asyncio.gather(*[fetch_one(j, d) for j, d in enumerate(chunk)])
            for rec in results:
                if rec:
                    rows.append(rec)
            if len(rows) >= self.BATCH_SIZE:
                self.write_batch(rows)
                self.ckpt.flush()
                rows = []
            if (i + len(chunk)) % 1000 == 0:
                self.log.info(f"  progress: {i + len(chunk)}/{len(candidates)}, "
                              f"dl={self.stats.downloaded} skip={self.stats.skipped}")
        if rows:
            self.write_batch(rows)
            self.ckpt.flush()

    def _parse_html(self, doc_id: str, html: str):
        # expediente number "Número de expediente: NNN/YYYY"
        m_exp = re.search(r"Número de expediente:[^<]*<[^>]*>(\d+/\d+)", html)
        expediente = m_exp.group(1) if m_exp else None

        # procedencia from h3/p (department / ministry in parens or after)
        m_proc = re.search(r"<h3[^>]*>[^<]*\(([^)]+)\)", html)
        procedencia = m_proc.group(1).strip() if m_proc else None

        # fecha — pattern "Sesión del Consejo: dd-mm-yyyy" or in metadata
        fecha = None
        m_fec = re.search(r"sesi[oó]n[^:]*:\s*</[^>]+>\s*<[^>]+>\s*(\d{1,2})[\s/-](\d{1,2})[\s/-](\d{4})", html, re.I)
        if m_fec:
            d, mo, y = m_fec.groups()
            fecha = f"{y}-{mo.zfill(2)}-{d.zfill(2)}"
        else:
            # fallback: parse from doc_id year
            year = doc_id.split("-")[2]
            fecha = f"{year}-01-01"

        # full text after "TEXTO DEL DICTAMEN"
        m_body = re.search(r"TEXTO\s+DEL\s+DICTAMEN.*?</h\d>(.*?)(?:<div[^>]*footer|</body>)",
                          html, re.DOTALL | re.I)
        body = m_body.group(1) if m_body else html
        body = re.sub(r"<style[^>]*>.*?</style>", "", body, flags=re.DOTALL)
        body = re.sub(r"<script[^>]*>.*?</script>", "", body, flags=re.DOTALL)
        body = re.sub(r"<[^>]+>", " ", body)
        body = body.replace("&nbsp;", " ").replace("&amp;", "&")
        body = re.sub(r"\s+", " ", body).strip()
        body = body[:1_000_000]

        return (
            doc_id, expediente, fecha, procedencia, body,
            json.dumps({"size": len(html)}, ensure_ascii=False),
        )


if __name__ == "__main__":
    setup_logging("spain_consejo_estado")
    SpainConsejoEstadoImporter().run()
