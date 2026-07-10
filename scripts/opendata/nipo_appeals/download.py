"""HTTP fetch + file download with retries and a local cache (checkpoint/resume)."""

import hashlib
import logging
import os
import time
from typing import Optional

import requests

from .config import USER_AGENT, HTTP_TIMEOUT, DOWNLOAD_RETRIES, POLITE_DELAY_S, DATA_DIR

log = logging.getLogger(__name__)

_session: Optional[requests.Session] = None


def session() -> requests.Session:
    global _session
    if _session is None:
        _session = requests.Session()
        _session.headers["User-Agent"] = USER_AGENT
    return _session


def reset_session() -> None:
    """Drop the cached session. MUST run in every forked worker process:
    a forked child inherits the parent's keep-alive TLS connections, and several
    processes reading one SSL socket produce 'record layer failure' errors."""
    global _session
    _session = None


def fetch_html(url: str) -> str:
    last_err: Optional[Exception] = None
    for attempt in range(DOWNLOAD_RETRIES):
        try:
            r = session().get(url, timeout=HTTP_TIMEOUT)
            r.raise_for_status()
            r.encoding = r.encoding or "utf-8"
            return r.text
        except Exception as e:
            last_err = e
            wait = 2 ** attempt
            log.warning("fetch %s failed (%s), retry in %ds", url, e, wait)
            time.sleep(wait)
    raise RuntimeError(f"failed to fetch {url}: {last_err}")


def cache_path(url: str) -> str:
    """Deterministic local path for a downloaded file (hash prefix avoids name collisions)."""
    name = url.rsplit("/", 1)[-1] or "file"
    name = name.split("?")[0][:150]
    h = hashlib.sha1(url.encode()).hexdigest()[:10]
    return os.path.join(DATA_DIR, "files", f"{h}_{name}")


def download_file(url: str, force: bool = False) -> str:
    """Download url to the local cache; returns the path. Skips if already cached."""
    path = cache_path(url)
    if not force and os.path.exists(path) and os.path.getsize(path) > 0:
        return path
    os.makedirs(os.path.dirname(path), exist_ok=True)
    last_err: Optional[Exception] = None
    for attempt in range(DOWNLOAD_RETRIES):
        try:
            if POLITE_DELAY_S:
                time.sleep(POLITE_DELAY_S)
            r = session().get(url, timeout=HTTP_TIMEOUT)
            r.raise_for_status()
            tmp = path + ".tmp"
            with open(tmp, "wb") as f:
                f.write(r.content)
            os.replace(tmp, path)  # atomic — a killed run never leaves partial files
            return path
        except Exception as e:
            last_err = e
            wait = 2 ** attempt
            log.warning("download %s failed (%s), retry in %ds", url, e, wait)
            time.sleep(wait)
    raise RuntimeError(f"failed to download {url}: {last_err}")
