"""CH kantonsblatt.ch HR publications importer (all 26 cantons).

Source: amtsblattportal.ch / kantonsblatt.ch — successor to SHAB since 2022.
Two outputs: ch_kantonsblatt_publications + ch_companies (UID PK).
"""
import asyncio
import json
import logging
import os
import sys
from datetime import date
from xml.etree import ElementTree as ET

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from shared.base import BaseImporter, setup_logging  # noqa: E402
from shared.http_client import MultiIPSessionPool  # noqa: E402
from shared.prod_writer import _ssh_cmd, copy_into  # noqa: E402


API_BASE = "https://amtsblattportal.ch/api/v1"
SUB_RUBRICS = ["HR01", "HR02", "HR03", "HR04", "HR05", "HR06", "HR07"]
PAGE_SIZE = 200


def _strip_ns(tag: str) -> str:
    return tag.split("}", 1)[-1] if "}" in tag else tag


def _findall(el, name: str):
    return [c for c in el.iter() if _strip_ns(c.tag) == name]


def _find(el, name: str):
    for c in el.iter():
        if _strip_ns(c.tag) == name:
            return c
    return None


def _text(el, default=""):
    return (el.text or default).strip() if el is not None and el.text else default


class CHKantonsblattImporter(BaseImporter):
    SERVICE_NAME = "ch_kantonsblatt"
    TARGET_TABLE = "ch_kantonsblatt_publications"
    COLUMNS = ["publication_uuid", "publication_number", "publication_date",
               "sub_rubric", "cantons", "title", "publication_text_de",
               "publication_text_fr", "publication_text_it", "company_uid",
               "metadata_json", "raw_xml"]
    PK_COLUMNS = ["publication_uuid"]
    ON_CONFLICT = "do_nothing"
    BATCH_SIZE = 200

    COMPANIES_TABLE = "ch_companies"
    COMPANIES_COLUMNS = ["uid", "code13", "name", "legal_form", "legal_seat",
                         "canton", "capital", "capital_currency", "capital_paid_in",
                         "address", "purpose", "status", "sogc_date",
                         "metadata_json"]
    COMPANIES_PK = ["uid"]

    async def import_dataset(self, pool: MultiIPSessionPool):
        backfill_days = int(os.environ.get("BACKFILL_DAYS", "0"))
        max_pages_per_rubric = int(os.environ.get("MAX_PAGES_PER_RUBRIC", "5"))
        seen_uuids = self.ckpt.done_set

        publication_rows = []
        company_rows = []

        from datetime import timedelta
        cutoff_date = None
        if backfill_days > 0:
            cutoff_date = (date.today() - timedelta(days=backfill_days)).isoformat()
            self.log.info(f"BACKFILL mode: collecting publications since {cutoff_date}")

        for sub_rubric in SUB_RUBRICS:
            self.log.info(f"=== {sub_rubric} ===")
            page = 0
            stop = False
            while page < max_pages_per_rubric and not stop:
                params = (f"subRubrics={sub_rubric}&publicationStates=PUBLISHED"
                          f"&pageRequest.size={PAGE_SIZE}&pageRequest.page={page}")
                if cutoff_date:
                    params += f"&publicationDate.start={cutoff_date}"
                url = f"{API_BASE}/publications/xml?{params}"

                try:
                    status, body = await pool.fetch(page, url, retries=3)
                except Exception as e:
                    self.log.warning(f"  fetch failed page {page}: {e}")
                    break
                if status != 200 or not body:
                    self.log.warning(f"  bad response status={status} on page {page}")
                    break

                try:
                    root = ET.fromstring(body)
                except ET.ParseError:
                    self.log.warning(f"  XML parse failed page {page}")
                    break

                pubs = [c for c in root if _strip_ns(c.tag) == "publication"]
                if not pubs:
                    self.log.info(f"  page {page}: 0 entries → stop")
                    break

                self.log.info(f"  page {page}: {len(pubs)} publications")
                self.stats.downloaded += len(pubs)

                for pub in pubs:
                    pub_uuid = _text(_find(pub, "id"))
                    if not pub_uuid or pub_uuid in seen_uuids:
                        self.stats.skipped += 1
                        continue

                    pub_number = _text(_find(pub, "publicationNumber"))
                    pub_date = _text(_find(pub, "publicationDate"))
                    cantons_el = _find(pub, "cantons")
                    cantons = []
                    if cantons_el is not None:
                        for c in cantons_el.iter():
                            if _strip_ns(c.tag) == "canton" and c.text:
                                cantons.append(c.text.strip())

                    title_el = _find(pub, "title")
                    title = ""
                    if title_el is not None:
                        for c in title_el.iter():
                            if _strip_ns(c.tag) in ("de", "fr", "it") and c.text:
                                title = c.text.strip()[:1000]
                                break

                    pub_text_de = pub_text_fr = pub_text_it = ""
                    content_el = _find(pub, "content")
                    if content_el is not None:
                        for c in content_el.iter():
                            tn = _strip_ns(c.tag)
                            if tn == "de" and c.text and not pub_text_de:
                                pub_text_de = " ".join(c.itertext()).strip()[:50000]
                            elif tn == "fr" and c.text and not pub_text_fr:
                                pub_text_fr = " ".join(c.itertext()).strip()[:50000]
                            elif tn == "it" and c.text and not pub_text_it:
                                pub_text_it = " ".join(c.itertext()).strip()[:50000]

                    company_uid = self._extract_uid(pub)

                    publication_rows.append((
                        pub_uuid, pub_number, pub_date or None, sub_rubric,
                        _pg_array(cantons), title, pub_text_de, pub_text_fr,
                        pub_text_it, company_uid,
                        json.dumps({"sub_rubric": sub_rubric}, ensure_ascii=False),
                        body[:0] if False else None,  # raw_xml omitted to save bandwidth
                    ))

                    if company_uid:
                        comp = self._extract_company(pub, company_uid, pub_date, cantons)
                        if comp:
                            company_rows.append(comp)

                    self.ckpt.add_done(pub_uuid)

                    if len(publication_rows) >= self.BATCH_SIZE:
                        self.write_batch(publication_rows)
                        publication_rows = []
                        if company_rows:
                            self._write_companies(company_rows)
                            company_rows = []
                        self.ckpt.flush()

                page += 1

        if publication_rows:
            self.write_batch(publication_rows)
        if company_rows:
            self._write_companies(company_rows)
        self.ckpt.flush()

    def _extract_uid(self, pub) -> str | None:
        for c in pub.iter():
            tn = _strip_ns(c.tag)
            if tn == "uid" and c.text:
                v = c.text.strip()
                if v.startswith("CHE"):
                    return v
        return None

    def _extract_company(self, pub, uid: str, pub_date: str, cantons: list):
        canton = cantons[0] if cantons else None
        name = ""
        legal_form = ""
        purpose = ""
        legal_seat = ""
        for c in pub.iter():
            tn = _strip_ns(c.tag)
            if tn == "name" and c.text and not name:
                name = c.text.strip()[:500]
            elif tn == "legalForm" and c.text and not legal_form:
                legal_form = c.text.strip()[:200]
            elif tn == "purpose" and c.text and not purpose:
                purpose = c.text.strip()[:5000]
            elif tn == "seat" and c.text and not legal_seat:
                legal_seat = c.text.strip()[:200]
        if not name:
            return None
        return (
            uid, None, name, legal_form, legal_seat, canton,
            None, None, None, None, purpose, None, pub_date or None,
            json.dumps({"first_seen_pub_date": pub_date}, ensure_ascii=False),
        )

    def _write_companies(self, rows):
        if self.dry_run:
            self.log.info(f"  [dry-run] would COPY {len(rows)} companies")
            return
        try:
            inserted = copy_into(
                self.COMPANIES_TABLE, self.COMPANIES_COLUMNS, rows,
                ssh_host=self.ssh_host, container=self.container,
                dbuser=self.dbuser, dbname=self.dbname,
                on_conflict="do_nothing", pk_columns=self.COMPANIES_PK,
            )
            self.log.info(f"  inserted {inserted}/{len(rows)} into {self.COMPANIES_TABLE}")
        except Exception as e:
            self.log.error(f"  companies write failed: {e}")


def _pg_array(values: list):
    if not values:
        return None
    quoted = []
    for v in values:
        s = str(v).replace("\\", "\\\\").replace('"', '\\"')
        quoted.append(f'"{s}"')
    return "{" + ",".join(quoted) + "}"


if __name__ == "__main__":
    setup_logging("ch_kantonsblatt")
    CHKantonsblattImporter().run()
