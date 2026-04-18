"""ES BOE sumarios importer — single /sumario/YYYYMMDD endpoint fans out to 5 sections.

Sections mapped to tables:
  I+III → spain_boe_disposiciones (~1.2M historical)
  V.A+V.B → spain_boe_anuncios (~900K)
  II.A+II.B → spain_boe_personal (~250K)
  IV → spain_boe_justicia (~180K)
  BORME → spain_borme_sumarios (~3M)

Uses prod max(fecha) per table as cursor; walks day-by-day.
"""
import asyncio
import json
import logging
import os
import subprocess
import sys
from datetime import date, timedelta
from xml.etree import ElementTree as ET

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from shared.base import BaseImporter, setup_logging  # noqa: E402
from shared.http_client import MultiIPSessionPool  # noqa: E402
from shared.prod_writer import _ssh_cmd, copy_into  # noqa: E402


BOE_SUMARIO = "https://www.boe.es/datosabiertos/api/boe/sumario/{date}"
BORME_SUMARIO = "https://www.boe.es/datosabiertos/api/borme/sumario/{date}"
BOE_DOC = "https://www.boe.es/datosabiertos/api/boe/id/{boe_id}"

NS = {"a": "http://www.w3.org/2005/Atom"}


def _strip_ns(tag: str) -> str:
    return tag.split("}", 1)[-1] if "}" in tag else tag


def _all(el, name: str):
    return [c for c in el.iter() if _strip_ns(c.tag) == name]


def _first(el, name: str):
    for c in el.iter():
        if _strip_ns(c.tag) == name:
            return c
    return None


def _t(el, default=""):
    return (el.text or default).strip() if el is not None and el.text else default


class SpainBOESumariosImporter(BaseImporter):
    SERVICE_NAME = "spain_boe_sumarios"
    TARGET_TABLE = "spain_boe_disposiciones"  # primary; we also write to others
    COLUMNS = ["boe_id", "fecha", "seccion", "departamento", "rango",
               "titulo", "url_pdf", "url_xml", "url_html", "full_text",
               "metadata_json"]
    PK_COLUMNS = ["boe_id"]
    ON_CONFLICT = "do_nothing"
    BATCH_SIZE = 500

    def _get_max_date(self, table: str) -> str:
        cmd = _ssh_cmd(self.ssh_host) + [
            f"docker exec {self.container} psql -U {self.dbuser} -d {self.dbname} -tAc "
            f"\"SELECT COALESCE(MAX(fecha)::text, '2024-01-01') FROM {table}\""]
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        if proc.returncode != 0:
            return "2024-01-01"
        return proc.stdout.strip() or "2024-01-01"

    async def import_dataset(self, pool: MultiIPSessionPool):
        backfill_days = int(os.environ.get("BOE_BACKFILL_DAYS", "0"))
        max_days = int(os.environ.get("BOE_MAX_DAYS", "30"))

        if backfill_days > 0:
            start_day = date.today() - timedelta(days=backfill_days)
        else:
            max_str = self._get_max_date("spain_boe_disposiciones")
            try:
                start_day = date.fromisoformat(max_str)
            except ValueError:
                start_day = date(2024, 1, 1)

        end_day = min(start_day + timedelta(days=max_days), date.today())
        days = [start_day + timedelta(days=i) for i in range((end_day - start_day).days + 1)]
        self.log.info(f"Walking {len(days)} days from {start_day} to {end_day}")

        # Buckets per target table
        bucket_disp = []
        bucket_anun = []
        bucket_pers = []
        bucket_just = []
        bucket_borme = []

        for i, day in enumerate(days):
            url = BOE_SUMARIO.format(date=day.strftime("%Y%m%d"))
            try:
                status, body = await pool.fetch(i, url, retries=2,
                                                 headers={"Accept": "application/xml"})
            except Exception as e:
                self.log.warning(f"  fetch failed {day}: {e}")
                continue
            if status != 200 or not body:
                continue

            try:
                root = ET.fromstring(body)
            except ET.ParseError:
                continue

            for item in _all(root, "item"):
                rec = self._parse_item(item, day)
                if not rec:
                    continue
                seccion = rec["seccion"]
                row = (rec["boe_id"], day.isoformat(), seccion,
                       rec["departamento"], rec["rango"], rec["titulo"],
                       rec["url_pdf"], rec["url_xml"], rec["url_html"],
                       None,  # full_text not fetched at sumario level
                       json.dumps(rec["meta"], ensure_ascii=False))
                if seccion in ("1", "I", "III", "3"):
                    bucket_disp.append(row)
                elif seccion in ("5", "V"):
                    bucket_anun.append(row[:9] + (None, json.dumps(rec["meta"], ensure_ascii=False)))
                elif seccion in ("2", "II"):
                    bucket_pers.append((rec["boe_id"], day.isoformat(), seccion,
                                        rec["departamento"], rec["titulo"],
                                        rec["url_pdf"], None,
                                        json.dumps(rec["meta"], ensure_ascii=False)))
                elif seccion in ("4", "IV"):
                    bucket_just.append((rec["boe_id"], day.isoformat(),
                                        rec["departamento"], rec["titulo"],
                                        rec["url_pdf"], None,
                                        json.dumps(rec["meta"], ensure_ascii=False)))

            # BORME for the same day
            burl = BORME_SUMARIO.format(date=day.strftime("%Y%m%d"))
            try:
                bstatus, bbody = await pool.fetch(i, burl, retries=2,
                                                   headers={"Accept": "application/xml"})
            except Exception:
                bstatus, bbody = 0, b""
            if bstatus == 200 and bbody:
                try:
                    broot = ET.fromstring(bbody)
                    for it in _all(broot, "item"):
                        bid = _t(_first(it, "identificador"))
                        if not bid:
                            continue
                        sec_match = bid.split("-")
                        seccion_b = sec_match[1] if len(sec_match) > 1 else ""
                        bucket_borme.append((
                            bid, day.isoformat(), seccion_b,
                            _t(_first(it, "provincia")) or None,
                            _t(_first(it, "titulo"))[:1000] or None,
                            _t(_first(it, "url_pdf")) or None,
                            _t(_first(it, "url_xml")) or None,
                            json.dumps({"size": len(bbody)}, ensure_ascii=False),
                        ))
                except ET.ParseError:
                    pass

            if (i + 1) % 5 == 0 or i == len(days) - 1:
                self._flush_buckets(bucket_disp, bucket_anun, bucket_pers, bucket_just, bucket_borme)
                bucket_disp, bucket_anun, bucket_pers, bucket_just, bucket_borme = [], [], [], [], []
                self.log.info(f"  progress: {i + 1}/{len(days)} days, "
                              f"dl={self.stats.downloaded} insert={self.stats.inserted}")

        self._flush_buckets(bucket_disp, bucket_anun, bucket_pers, bucket_just, bucket_borme)

    def _parse_item(self, item, day):
        boe_id = _t(_first(item, "identificador"))
        if not boe_id:
            return None
        seccion = boe_id.split("-")[1] if "-" in boe_id else ""
        # Actually section is in URL path; use a heuristic via boe_id prefix BOE-A-/B-
        # A = disposiciones; B = anuncios oficiales
        seccion_label = "1" if seccion == "A" else ("5" if seccion == "B" else seccion)

        return {
            "boe_id": boe_id,
            "seccion": seccion_label,
            "departamento": _t(_first(item, "departamento")) or None,
            "rango": _t(_first(item, "rango")) or None,
            "titulo": (_t(_first(item, "titulo")) or "")[:5000] or None,
            "url_pdf": _t(_first(item, "url_pdf")) or None,
            "url_xml": _t(_first(item, "url_xml")) or None,
            "url_html": _t(_first(item, "url_html")) or None,
            "meta": {"sub_seccion": _t(_first(item, "sub_seccion"))},
        }

    def _flush_buckets(self, disp, anun, pers, just, borme):
        self.stats.downloaded += sum(len(b) for b in (disp, anun, pers, just, borme))
        if disp:
            self._write("spain_boe_disposiciones", self.COLUMNS, disp)
        if anun:
            self._write("spain_boe_anuncios",
                        ["boe_id", "fecha", "seccion", "departamento", "titulo",
                         "url_pdf", "url_xml", "full_text", "metadata_json"],
                        # source row had 11 cols; map down
                        [(r[0], r[1], r[2], r[3], r[5], r[6], r[7], None, r[10]) for r in anun])
        if pers:
            self._write("spain_boe_personal",
                        ["boe_id", "fecha", "seccion", "departamento", "titulo",
                         "url_pdf", "full_text", "metadata_json"],
                        pers)
        if just:
            self._write("spain_boe_justicia",
                        ["boe_id", "fecha", "departamento", "titulo", "url_pdf",
                         "full_text", "metadata_json"],
                        just)
        if borme:
            self._write("spain_borme_sumarios",
                        ["borme_id", "fecha", "seccion", "provincia", "titulo",
                         "url_pdf", "url_xml", "metadata_json"],
                        borme, pk=["borme_id"])

    def _write(self, table: str, columns: list, rows: list, pk: list = None):
        if not rows or self.dry_run:
            if rows:
                self.log.info(f"  [dry-run] would COPY {len(rows)} into {table}")
            return
        try:
            inserted = copy_into(table, columns, rows,
                                 ssh_host=self.ssh_host, container=self.container,
                                 dbuser=self.dbuser, dbname=self.dbname,
                                 on_conflict="do_nothing",
                                 pk_columns=pk or ["boe_id"])
            self.stats.inserted += inserted
            self.log.info(f"  inserted {inserted}/{len(rows)} into {table}")
        except Exception as e:
            self.log.error(f"  write {table} failed: {e}")


if __name__ == "__main__":
    setup_logging("spain_boe_sumarios")
    SpainBOESumariosImporter().run()
