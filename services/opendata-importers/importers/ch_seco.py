"""CH SECO sanctions importer — single XML fetch from sesam.search.admin.ch."""
import asyncio
import json
import logging
import os
import sys
from xml.etree import ElementTree as ET

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from shared.base import BaseImporter, setup_logging  # noqa: E402
from shared.http_client import MultiIPSessionPool  # noqa: E402


SESAM_URL = ("https://www.sesam.search.admin.ch/sesam-search-web/pages/"
             "downloadXmlGesamtliste.xhtml?lang=en&action=downloadXmlGesamtlisteAction")


def _text(el, default=""):
    return (el.text or default).strip() if el is not None and el.text else default


def _attr(el, key, default=""):
    return el.attrib.get(key, default) if el is not None else default


def _strip_ns(tag: str) -> str:
    return tag.split("}", 1)[-1] if "}" in tag else tag


def _children(el, name: str):
    """Return all immediate children matching name (namespace-agnostic)."""
    return [c for c in el if _strip_ns(c.tag) == name] if el is not None else []


def _first_child(el, name: str):
    for c in (el or []):
        if _strip_ns(c.tag) == name:
            return c
    return None


def _pg_array(values: list):
    """Format Python list as PostgreSQL array literal for COPY (TEXT[]).
    Returns None for empty list so escape layer emits NULL marker correctly.
    """
    if not values:
        return None
    quoted = []
    for v in values:
        s = str(v).replace("\\", "\\\\").replace('"', '\\"')
        quoted.append(f'"{s}"')
    return "{" + ",".join(quoted) + "}"


def _date_from_dmy(el):
    if el is None:
        return None
    d = _attr(el, "day") or "00"
    m = _attr(el, "month") or "00"
    y = _attr(el, "year") or ""
    if not y:
        return None
    return f"{y}-{m.zfill(2) if m != '00' else '01'}-{d.zfill(2) if d != '00' else '01'}"


class CHSecoImporter(BaseImporter):
    SERVICE_NAME = "ch_seco"
    TARGET_TABLE = "ch_seco_sanctions"
    COLUMNS = ["ssid", "sanctions_set_id", "target_type", "primary_name",
               "aliases", "dob", "pob", "nationality", "addresses",
               "identification", "programme", "origin", "legal_basis",
               "justification", "other_information", "listed_at",
               "delisted_at", "source_xml_date", "metadata_json"]
    PK_COLUMNS = ["ssid"]
    ON_CONFLICT = "do_update"
    BATCH_SIZE = 1000

    async def import_dataset(self, pool: MultiIPSessionPool):
        self.log.info(f"Downloading {SESAM_URL}")
        try:
            status, body = await pool.fetch_bytes(0, SESAM_URL, retries=5,
                                                   allow_redirects=True)
        except Exception as e:
            self.log.error(f"fetch failed: {e}")
            return
        if status != 200 or len(body) < 1000:
            self.log.error(f"bad response: status={status} size={len(body)}")
            return
        if not body.lstrip().startswith(b"<"):
            self.log.error("response is not XML")
            return

        self.log.info(f"  downloaded {len(body) // 1024} KB")
        self.stats.downloaded = 1

        try:
            root = ET.fromstring(body)
        except ET.ParseError as e:
            self.log.error(f"XML parse failed: {e}")
            self.stats.failed = 1
            return

        source_xml_date = _attr(root, "date") or None

        # Build map of sanctions-program key → metadata
        programmes: dict[str, dict] = {}
        sets: dict[str, dict] = {}
        for prog in _children(root, "sanctions-program"):
            program_key = _attr(prog, "ssid") or _attr(prog, "program-key")
            origin = _text(_first_child(prog, "origin"))
            name_el = None
            for n in _children(prog, "program-name"):
                if _attr(n, "iso-code") == "eng":
                    name_el = n
                    break
            program_name = _text(name_el) if name_el is not None else _text(_first_child(prog, "program-name"))
            programmes[program_key] = {"name": program_name, "origin": origin}
            for s in _children(prog, "sanctions-set"):
                set_id = _attr(s, "ssid")
                if set_id:
                    sets[set_id] = {
                        "program_key": program_key,
                        "program_name": program_name,
                        "origin": origin,
                        "legal_basis": " ".join(_text(c) for c in s if _text(c))[:500],
                    }

        # Iterate targets
        rows = []
        for target in _children(root, "target"):
            ssid = _attr(target, "ssid")
            if not ssid:
                continue
            try:
                ssid_int = int(ssid)
            except ValueError:
                continue

            sanctions_set_id = _attr(target, "sanctions-set-id")
            try:
                sanctions_set_id_int = int(sanctions_set_id) if sanctions_set_id else None
            except ValueError:
                sanctions_set_id_int = None

            # target body: individual / entity / object
            body_el = next((c for c in target if _strip_ns(c.tag) in
                           ("individual", "entity", "object")), None)
            if body_el is None:
                continue
            target_type = _strip_ns(body_el.tag)

            names_parts = []
            aliases = []
            for np in _children(body_el, "name-part"):
                main = _text(np)
                if main:
                    names_parts.append(main)
                for sv in _children(np, "spelling-variant"):
                    val = _text(sv)
                    if val:
                        aliases.append({
                            "value": val,
                            "script": _attr(sv, "script"),
                            "lang": _attr(sv, "lang"),
                        })
            primary_name = " ".join(names_parts)[:1000] or "<unknown>"

            dob = _date_from_dmy(_first_child(body_el, "day-month-year"))
            pob = _text(_first_child(body_el, "place-of-birth"))
            nationality = [_text(n) for n in _children(body_el, "nationality") if _text(n)]
            nationality_pg = _pg_array(nationality)

            addresses = []
            for addr in _children(body_el, "address"):
                a = {"raw": " ".join(t.strip() for t in addr.itertext() if t.strip())}
                addresses.append(a)

            identification = []
            for ident in _children(body_el, "identification-document"):
                identification.append({
                    "type": _attr(ident, "document-type"),
                    "number": _text(_first_child(ident, "number")),
                    "issuer": _text(_first_child(ident, "issuer")),
                    "country": _text(_first_child(ident, "country")),
                })

            justification = _text(_first_child(target, "justification"))[:5000]
            other_info = _text(_first_child(target, "other-information"))[:5000]

            # Modification audit trail
            listed_at = None
            delisted_at = None
            for mod in _children(target, "modification"):
                mod_type = _attr(mod, "modification-type")
                eff = _date_from_dmy(_first_child(mod, "effective-date")) \
                      or _date_from_dmy(_first_child(mod, "publication-date")) \
                      or _date_from_dmy(_first_child(mod, "enactment-date"))
                if mod_type == "listed" and eff and not listed_at:
                    listed_at = eff
                elif mod_type == "de-listed":
                    delisted_at = eff

            prog_meta = sets.get(str(sanctions_set_id_int), {}) if sanctions_set_id_int else {}

            rows.append((
                ssid_int,
                sanctions_set_id_int,
                target_type,
                primary_name,
                json.dumps(aliases, ensure_ascii=False) if aliases else None,
                dob,
                pob,
                nationality_pg,
                json.dumps(addresses, ensure_ascii=False) if addresses else None,
                json.dumps(identification, ensure_ascii=False) if identification else None,
                prog_meta.get("program_name"),
                prog_meta.get("origin"),
                prog_meta.get("legal_basis"),
                justification,
                other_info,
                listed_at,
                delisted_at,
                source_xml_date,
                json.dumps({"programme_key": prog_meta.get("program_key")}, ensure_ascii=False),
            ))

            if len(rows) >= self.BATCH_SIZE:
                self.write_batch(rows)
                rows = []

        if rows:
            self.write_batch(rows)

        self.log.info(f"Parsed {self.stats.inserted} sanctions targets from XML date {source_xml_date}")


if __name__ == "__main__":
    setup_logging("ch_seco")
    CHSecoImporter().run()
