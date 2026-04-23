"""ES Congreso de los Diputados voting importer.

Per-MP per-vote granularity. ~25M total rows across 15 legislaturas.
URL pattern: congreso.es/webpublica/opendata/votaciones/Leg{NN}/Sesion{NNN}/{YYYYMMDD}/Votacion{NNN}/VOT_*.xml
Encoding: ISO-8859-1.
"""
import asyncio
import json
import logging
import os
import re
import sys
from datetime import datetime
from xml.etree import ElementTree as ET

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from shared.base import BaseImporter, setup_logging  # noqa: E402
from shared.http_client import MultiIPSessionPool  # noqa: E402


# Index of all votings per legislatura — undocumented; use opendata download zips
INDEX_URL_TEMPLATE = "https://www.congreso.es/es/opendata/votaciones?p_p_id=opendataapp_WAR_opendataportlet&p_p_lifecycle=2&p_p_resource_id=descargarVotacionesAjax&_opendataapp_WAR_opendataportlet_legislatura={leg}"


def _t(el, default=""):
    if el is None or el.text is None:
        return default
    return el.text.strip()


def _strip_ns(tag: str) -> str:
    return tag.split("}", 1)[-1] if "}" in tag else tag


def _all(el, name: str):
    return [c for c in el.iter() if _strip_ns(c.tag) == name]


def _first(el, name: str):
    for c in el.iter():
        if _strip_ns(c.tag) == name:
            return c
    return None


class SpainCongresoImporter(BaseImporter):
    SERVICE_NAME = "spain_congreso"
    TARGET_TABLE = "spain_congreso_voting"
    COLUMNS = ["legislatura", "sesion", "votacion_num", "fecha", "titulo",
               "texto_expediente", "presentes", "a_favor", "en_contra",
               "abstenciones", "no_votan", "asiento", "diputado", "grupo",
               "voto", "metadata_json"]
    PK_COLUMNS = ["legislatura", "sesion", "votacion_num", "asiento"]
    ON_CONFLICT = "do_nothing"
    BATCH_SIZE = 2000

    # Browser UA — congreso.es (Akamai-fronted) blocks default aiohttp UA.
    USER_AGENT = ("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")

    async def import_dataset(self, pool: MultiIPSessionPool):
        # The opendata portlet ignores the legislatura param and always returns
        # the current session of the current legislatura. Iterating older legs
        # produced 10× duplicates of the same recent votes labelled with bogus
        # legislatura values (data-quality bug). Restrict to the current Leg.
        current_leg = int(os.environ.get("CONGRESO_CURRENT_LEG", "15"))
        rows: list = []
        seen = self.ckpt.done_set

        self.log.info(f"=== Legislatura {current_leg} (incremental, current session only) ===")
        await self._import_via_listing(pool, current_leg, rows, seen)

        if rows:
            self.write_batch(rows)
            self.ckpt.flush()

    async def _import_via_listing(self, pool: MultiIPSessionPool, leg: int,
                                    rows: list, seen: set):
        # Discover via the public votaciones page
        listing_url = f"https://www.congreso.es/es/opendata/votaciones?p_p_id=opendataapp_WAR_opendataportlet&p_p_lifecycle=0&_opendataapp_WAR_opendataportlet_legislatura={leg}"
        try:
            status, body = await pool.fetch(0, listing_url, retries=2)
        except Exception as e:
            self.log.warning(f"  listing fetch failed leg={leg}: {e}")
            return
        if status != 200:
            self.log.warning(f"  listing status {status} leg={leg}")
            return

        # Find all VOT_*.xml URL patterns in the page
        urls = set(re.findall(
            r"/webpublica/opendata/votaciones/Leg\d+/Sesion\d+/\d+/Votacion\d+/VOT_[\d]+\.xml",
            body))
        self.log.info(f"  Leg{leg}: {len(urls)} VOT XMLs discovered in listing")

        for i, path in enumerate(urls):
            if path in seen:
                continue
            url = f"https://www.congreso.es{path}"
            try:
                status, body = await pool.fetch_bytes(i, url, retries=2)
            except Exception:
                self.stats.failed += 1
                continue
            if status != 200 or not body:
                self.stats.skipped += 1
                continue
            self.stats.downloaded += 1
            # ISO-8859-1 decode
            try:
                text = body.decode("iso-8859-1", errors="replace")
                root = ET.fromstring(text)
            except ET.ParseError:
                self.stats.failed += 1
                continue

            new_rows = self._parse_vot_xml(root, leg, path)
            rows.extend(new_rows)
            self.ckpt.add_done(path)

            if len(rows) >= self.BATCH_SIZE:
                self.write_batch(rows)
                self.ckpt.flush()
                rows.clear()

            if (i + 1) % 50 == 0:
                self.log.info(f"  Leg{leg}: parsed {i + 1}/{len(urls)} XMLs")

    def _parse_vot_xml(self, root, leg: int, path: str):
        # Common path: <Asunto><Sesion>/<NumeroVotacion>/<Fecha>/<Titulo>/<TextoExpediente>
        sesion_el = _first(root, "Sesion")
        sesion = int(_t(sesion_el)) if sesion_el is not None and _t(sesion_el).isdigit() else 0
        vote_num_el = _first(root, "NumeroVotacion")
        vote_num = int(_t(vote_num_el)) if vote_num_el is not None and _t(vote_num_el).isdigit() else 0

        fecha_str = _t(_first(root, "Fecha"))
        fecha = None
        if fecha_str:
            for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%Y%m%d"):
                try:
                    fecha = datetime.strptime(fecha_str[:10], fmt).date().isoformat()
                    break
                except ValueError:
                    continue

        titulo = _t(_first(root, "Titulo"))[:5000] or None
        texto_exp = _t(_first(root, "TextoExpediente"))[:5000] or None

        totales = _first(root, "Totales")
        presentes = a_favor = en_contra = abstenciones = no_votan = 0
        if totales is not None:
            presentes = int(_t(_first(totales, "Presentes")) or 0)
            a_favor = int(_t(_first(totales, "AFavor")) or 0)
            en_contra = int(_t(_first(totales, "EnContra")) or 0)
            abstenciones = int(_t(_first(totales, "Abstenciones")) or 0)
            no_votan = int(_t(_first(totales, "NoVotan")) or 0)

        out = []
        for v in _all(root, "Votacion"):
            asiento = _t(_first(v, "Asiento")) or _t(_first(v, "asiento"))
            if not asiento:
                continue
            diputado = _t(_first(v, "Diputado"))[:200] or None
            grupo = _t(_first(v, "Grupo"))[:100] or None
            voto = _t(_first(v, "Voto"))[:50] or None
            out.append((
                leg, sesion, vote_num, fecha, titulo, texto_exp,
                presentes, a_favor, en_contra, abstenciones, no_votan,
                asiento, diputado, grupo, voto,
                json.dumps({"path": path}, ensure_ascii=False),
            ))
        return out


if __name__ == "__main__":
    setup_logging("spain_congreso")
    SpainCongresoImporter().run()
