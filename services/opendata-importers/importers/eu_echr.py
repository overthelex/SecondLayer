"""EU ECHR / HUDOC importer via REST API.

hudoc.echr.coe.int exposes /app/query/results — JSON-paginated, no Playwright
needed. Metadata-only: 228K+ cases. Full text/HTML per case is a follow-up.
"""
import json
import os
import sys
from urllib.parse import quote

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from shared.base import BaseImporter, setup_logging  # noqa: E402
from shared.http_client import MultiIPSessionPool  # noqa: E402


HUDOC_BASE = "https://hudoc.echr.coe.int/app/query/results"
RANKING_MODEL = "11111111-0000-0000-0000-000000000000"
SELECT_FIELDS = [
    "itemid", "docname", "ecli", "importance", "judgementdate",
    "conclusion", "respondent", "article", "doctypebranch",
    "separateopinion", "languageisocode", "application",
]
PAGE_SIZE = 500


def _pg_array(values: list):
    if not values:
        return None
    quoted = []
    for v in values:
        s = str(v).replace("\\", "\\\\").replace('"', '\\"')
        quoted.append(f'"{s}"')
    return "{" + ",".join(quoted) + "}"


def _split_articles(raw) -> list:
    if not raw:
        return []
    if isinstance(raw, list):
        return [str(x).strip() for x in raw if str(x).strip()]
    return [s.strip() for s in str(raw).replace(",", ";").split(";") if s.strip()]


class EUEchrImporter(BaseImporter):
    SERVICE_NAME = "eu_echr"
    TARGET_TABLE = "eu_echr_cases"
    COLUMNS = ["ecli", "app_number", "case_title", "importance_level",
               "judgment_date", "conclusion", "respondent_state", "articles",
               "chamber", "separate_opinions", "full_text", "metadata_json"]
    PK_COLUMNS = ["ecli"]
    ON_CONFLICT = "do_update"
    BATCH_SIZE = 500
    USER_AGENT = ("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")

    async def import_dataset(self, pool: MultiIPSessionPool):
        max_records = int(os.environ.get("ECHR_MAX_RECORDS", "50000"))
        seen = self.ckpt.done_set

        select_qs = quote(",".join(SELECT_FIELDS))
        first_url = (f"{HUDOC_BASE}?query=contentsitename%3DECHR"
                     f"&select={select_qs}&start=0&length=1"
                     f"&rankingmodelid={RANKING_MODEL}")
        try:
            status, body = await pool.fetch(0, first_url, retries=3)
        except Exception as e:
            self.log.error(f"HUDOC discovery failed: {e}")
            return
        if status != 200:
            self.log.error(f"HUDOC status {status}")
            return
        try:
            head = json.loads(body)
        except Exception as e:
            self.log.error(f"HUDOC json parse failed: {e}")
            return

        total = int(head.get("resultcount", 0))
        self.log.info(f"HUDOC total cases: {total} (cap {max_records})")
        target = min(total, max_records)

        rows = []
        for start in range(0, target, PAGE_SIZE):
            length = min(PAGE_SIZE, target - start)
            url = (f"{HUDOC_BASE}?query=contentsitename%3DECHR"
                   f"&select={select_qs}&start={start}&length={length}"
                   f"&rankingmodelid={RANKING_MODEL}")
            try:
                status, body = await pool.fetch(start, url, retries=3)
            except Exception as e:
                self.log.warning(f"page start={start} fetch failed: {e}")
                continue
            if status != 200:
                self.log.warning(f"page start={start} status {status}")
                continue
            try:
                data = json.loads(body)
            except Exception as e:
                self.log.warning(f"page start={start} json failed: {e}")
                continue

            results = data.get("results", []) or []
            for r in results:
                cols = r.get("columns") or {}
                itemid = cols.get("itemid")
                if not itemid:
                    continue

                # ECLI: prefer the API value; otherwise synthesize
                ecli = (cols.get("ecli") or "").strip()
                if not ecli:
                    ecli = f"ECLI:CE:ECHR:HUDOC:{itemid}"

                if ecli in seen:
                    continue

                docname = (cols.get("docname") or "").strip() or "<untitled>"
                app_number = (cols.get("application") or "").strip() or None
                importance = (cols.get("importance") or "").strip() or None
                judgement_date = (cols.get("judgementdate") or "")[:10] or None
                conclusion = (cols.get("conclusion") or "").strip()[:5000] or None
                respondent = (cols.get("respondent") or "").strip() or None
                articles = _split_articles(cols.get("article"))
                chamber = (cols.get("doctypebranch") or "").strip() or None
                sep_op = (cols.get("separateopinion") or "").strip().lower()
                separate_opinions = sep_op in ("true", "yes", "1")

                meta = {"itemid": itemid,
                        "lang": (cols.get("languageisocode") or "").strip()}

                rows.append((
                    ecli, app_number, docname[:1000], importance,
                    judgement_date, conclusion, respondent,
                    _pg_array(articles), chamber, separate_opinions,
                    None,
                    json.dumps(meta, ensure_ascii=False),
                ))
                self.ckpt.add_done(ecli)
                self.stats.downloaded += 1

                if len(rows) >= self.BATCH_SIZE:
                    self.write_batch(rows)
                    self.ckpt.flush()
                    rows = []

            if (start // PAGE_SIZE) % 10 == 0:
                self.log.info(f"  walked {start + length}/{target}, "
                              f"queued/flushed insert={self.stats.inserted}")

        if rows:
            self.write_batch(rows)
            self.ckpt.flush()


if __name__ == "__main__":
    setup_logging("eu_echr")
    EUEchrImporter().run()
