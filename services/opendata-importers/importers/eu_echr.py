"""EU ECHR / HUDOC importer.

Status: hudoc.echr.coe.int is a Cloudflare-fronted SPA. Public API
endpoints (/app/query/results) return 404 without proper UI session.
Working approach is Playwright + intercepting XHR, or using the
unofficial hudoc-api wrapper. Defer to dedicated PR.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from importers._stub import PlaywrightTodoStub  # noqa: E402
from shared.base import setup_logging  # noqa: E402


class EUEchrImporter(PlaywrightTodoStub):
    SERVICE_NAME = "eu_echr"
    TARGET_TABLE = "eu_echr_cases"
    COLUMNS = ["ecli", "app_number", "case_title", "importance_level",
               "judgment_date", "conclusion", "respondent_state", "articles",
               "chamber", "separate_opinions", "full_text", "metadata_json"]
    PK_COLUMNS = ["ecli"]
    SOURCE_URL = "https://hudoc.echr.coe.int"


if __name__ == "__main__":
    setup_logging("eu_echr")
    EUEchrImporter().run()
