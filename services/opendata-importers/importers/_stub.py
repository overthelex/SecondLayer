"""Common stub helpers for SPA-only sources awaiting Playwright implementation."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from shared.base import BaseImporter  # noqa: E402
from shared.http_client import MultiIPSessionPool  # noqa: E402


class PlaywrightTodoStub(BaseImporter):
    """Importer that exits cleanly with explicit TODO logging.

    Concrete subclasses set SERVICE_NAME, TARGET_TABLE, SOURCE_URL, REASON.
    """

    SOURCE_URL = ""
    REASON = "needs Playwright (target site is SPA / JS-rendered)"

    async def import_dataset(self, pool: MultiIPSessionPool):
        self.log.warning(f"=== TODO ===")
        self.log.warning(f"  source: {self.SOURCE_URL}")
        self.log.warning(f"  target: {self.TARGET_TABLE}")
        self.log.warning(f"  reason: {self.REASON}")
        self.log.warning(f"  Implementation deferred to dedicated PR with Playwright stack.")
        self.log.warning(f"  Service exits 0 — restart loop will sleep and retry.")
