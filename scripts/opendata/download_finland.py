#!/usr/bin/env python3
"""Download Finnish court decisions from multiple sources.

Sources:
1. Finlex Open Data API (https://opendata.finlex.fi/finlex/avoindata/v1)
   - judgmentDocumentType values that work: chancellor-of-justice-decision,
     data-protection-ombudsman-decision
   - Court decisions (KKO, KHO, etc.) are NOT available via API judgment endpoint
   - Format: Akoma Ntoso XML, max 10 per page

2. Finlex website scraping (https://www.finlex.fi/fi/oikeuskaytanto/)
   - KKO precedents: /fi/oikeuskaytanto/korkein-oikeus/ennakkopaatokset/{year}/{number}
   - KHO yearbook: /fi/oikeuskaytanto/korkein-hallinto-oikeus/vuosikirjat/{year}/{number}
   - Hovioikeudet: /fi/oikeuskaytanto/hovioikeudet/{year}/{number}
   - Hallinto-oikeudet: /fi/oikeuskaytanto/hallinto-oikeudet/{year}/{number}

3. eliask/finlex-data GitHub repository (KKO + KHO XML/JSON-LD dump)
   - https://github.com/eliask/finlex-data
"""

import json
import os
import re
import subprocess
import sys
import time
import requests
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

BASE_DIR = Path("/home/ubuntu/opendata/finland")
FINLEX_API_DIR = BASE_DIR / "finlex-api"
FINLEX_WEB_DIR = BASE_DIR / "finlex-web"
GITHUB_DIR = BASE_DIR / "github-finlex-data"

FINLEX_API = "https://opendata.finlex.fi/finlex/avoindata/v1"
FINLEX_WEB = "https://www.finlex.fi"

API_JUDGMENT_TYPES = [
    "chancellor-of-justice-decision",
    "data-protection-ombudsman-decision",
]

WEB_COURTS = {
    "kko-ennakkopaatokset": "/fi/oikeuskaytanto/korkein-oikeus/ennakkopaatokset",
    "kko-muut": "/fi/oikeuskaytanto/korkein-oikeus/muut-paatokset",
    "kho-ennakkopaatokset": "/fi/oikeuskaytanto/korkein-hallinto-oikeus/ennakkopaatokset",
    "kho-muut": "/fi/oikeuskaytanto/korkein-hallinto-oikeus/muut-paatokset",
    "kho-lyhyet": "/fi/oikeuskaytanto/korkein-hallinto-oikeus/lyhyet-ratkaisuselosteet",
    "hovioikeudet": "/fi/oikeuskaytanto/hovioikeudet",
    "hallinto-oikeudet": "/fi/oikeuskaytanto/hallinto-oikeudet",
}

LOCAL_IPS = [
    "172.31.29.20",
    "172.31.21.255",
    "172.31.31.40",
    "172.31.22.206",
    "172.31.28.109",
    "172.31.21.47",
]

MAX_WORKERS = 10
API_PAGE_LIMIT = 10
USER_AGENT = "SecondLayer-LegalDataCollector/1.0 (legal.org.ua; research)"


class MultiIPAdapter(requests.adapters.HTTPAdapter):
    """Bind outgoing requests to a specific local IP."""
    def __init__(self, source_address, **kwargs):
        self.source_address = source_address
        super().__init__(**kwargs)

    def init_poolmanager(self, *args, **kwargs):
        kwargs["source_address"] = (self.source_address, 0)
        super().init_poolmanager(*args, **kwargs)


def create_sessions() -> list:
    """Create one session per local IP for parallel multi-IP requests."""
    sessions = []
    for ip in LOCAL_IPS:
        s = requests.Session()
        s.headers["User-Agent"] = USER_AGENT
        adapter = MultiIPAdapter(source_address=ip)
        s.mount("https://", adapter)
        s.mount("http://", adapter)
        sessions.append(s)
    return sessions


def get_session_for_index(sessions: list, idx: int) -> requests.Session:
    """Round-robin session selection."""
    return sessions[idx % len(sessions)]


def fetch_with_retry(url: str, session: requests.Session, retries: int = 5, accept: str = None) -> requests.Response:
    """Fetch URL with retry and 429 backoff. Returns response or raises."""
    for attempt in range(retries):
        try:
            headers = {}
            if accept:
                headers["Accept"] = accept
            resp = session.get(url, timeout=60, headers=headers)
            if resp.status_code == 429:
                wait = min(2 ** (attempt + 2), 120)
                print(f"  Rate limited (429), waiting {wait}s...")
                time.sleep(wait)
                continue
            resp.raise_for_status()
            return resp
        except requests.exceptions.HTTPError as e:
            if e.response is not None and e.response.status_code == 429:
                wait = min(2 ** (attempt + 2), 120)
                time.sleep(wait)
                continue
            if attempt < retries - 1:
                wait = 2 ** attempt
                print(f"  Attempt {attempt+1} failed: {e}, retrying in {wait}s")
                time.sleep(wait)
            else:
                raise
        except Exception as e:
            if attempt < retries - 1:
                wait = 2 ** attempt
                print(f"  Attempt {attempt+1} failed: {e}, retrying in {wait}s")
                time.sleep(wait)
            else:
                raise
    return None


# ============================================================
# Part 1: Finlex Open Data API (chancellor + ombudsman decisions)
# ============================================================

def download_api_judgment_type(jtype: str, session: requests.Session) -> int:
    """Download all decisions for a judgment type from Finlex API (XML, max 10/page)."""
    out_dir = FINLEX_API_DIR / jtype
    out_dir.mkdir(parents=True, exist_ok=True)

    checkpoint_file = out_dir / "checkpoint.json"
    start_page = 1
    if checkpoint_file.exists():
        with open(checkpoint_file) as f:
            cp = json.load(f)
            start_page = cp.get("last_completed_page", 0) + 1
            print(f"  Resuming {jtype} from page {start_page}")

    page = start_page
    total = 0
    t0 = time.time()

    while True:
        url = f"{FINLEX_API}/akn/fi/judgment/{jtype}?page={page}&limit={API_PAGE_LIMIT}"
        resp = fetch_with_retry(url, session)
        if resp is None or resp.status_code == 404:
            break

        xml_content = resp.text
        if not xml_content or "<Results" not in xml_content:
            break

        xml_file = out_dir / f"page_{page:05d}.xml"
        with open(xml_file, "w", encoding="utf-8") as f:
            f.write(xml_content)

        count_in_page = xml_content.count("<akomaNtoso")
        total += count_in_page

        with open(checkpoint_file, "w") as f:
            json.dump({"last_completed_page": page, "type": jtype}, f)

        elapsed = time.time() - t0
        rate = total / elapsed if elapsed > 0 else 0
        print(f"    {jtype} page {page}: {total} decisions ({rate:.1f}/s)")

        if count_in_page < API_PAGE_LIMIT:
            break
        page += 1

    print(f"  {jtype} complete: {total} decisions")
    return total


def download_finlex_api():
    """Download decisions from Finlex API (only working judgment types). Uses multi-IP."""
    FINLEX_API_DIR.mkdir(parents=True, exist_ok=True)

    sessions = create_sessions()
    print(f"\nFinlex Open Data API: downloading {len(API_JUDGMENT_TYPES)} judgment types")
    print(f"  Using {len(sessions)} IPs for parallel downloads")

    total = 0
    for jtype in API_JUDGMENT_TYPES:
        print(f"\n  Type: {jtype}")
        count = download_api_judgment_type(jtype, sessions[0])
        total += count

    print(f"\nFinlex API complete: {total} decisions total")


# ============================================================
# Part 2: Finlex website scraping (KKO, KHO, hovioikeudet, etc.)
# ============================================================

def discover_decisions_for_court(court: str, base_path: str, session: requests.Session) -> list:
    """Discover all available decision URLs for a court by scanning year pages."""
    all_decisions = []

    resp = fetch_with_retry(f"{FINLEX_WEB}{base_path}", session)
    if resp is None:
        return []

    years = re.findall(re.escape(base_path) + r'/(\d{4})', resp.text)
    if not years:
        years = [str(y) for y in range(2019, 2027)]

    for year in sorted(set(years)):
        year_url = f"{FINLEX_WEB}{base_path}/{year}"
        try:
            resp = fetch_with_retry(year_url, session)
            if resp is None:
                continue
        except Exception:
            continue

        decisions = re.findall(
            re.escape(base_path) + r'/' + year + r'/(\d+)',
            resp.text
        )
        unique_nums = sorted(set(decisions), key=int)
        for num in unique_nums:
            all_decisions.append((year, num))

        if unique_nums:
            print(f"    {court}/{year}: {len(unique_nums)} decisions found")
        time.sleep(0.3)

    return all_decisions


def download_web_decision(court: str, base_path: str, year: str, number: str, session: requests.Session) -> bool:
    """Download a single decision page from finlex.fi."""
    court_dir = FINLEX_WEB_DIR / court / year
    court_dir.mkdir(parents=True, exist_ok=True)

    html_path = court_dir / f"{number}.html"
    if html_path.exists() and html_path.stat().st_size > 500:
        return True

    url = f"{FINLEX_WEB}{base_path}/{year}/{number}"
    try:
        resp = fetch_with_retry(url, session)
        if resp is None:
            return False
        with open(html_path, "w", encoding="utf-8") as f:
            f.write(resp.text)
        return True
    except Exception:
        return False


def download_finlex_web():
    """Scrape court decisions from finlex.fi website. Uses multi-IP for parallelism."""
    FINLEX_WEB_DIR.mkdir(parents=True, exist_ok=True)

    sessions = create_sessions()
    num_workers = len(LOCAL_IPS) * MAX_WORKERS  # 6 IPs × 10 = 60 parallel
    print(f"\nFinlex website scraping: {len(WEB_COURTS)} courts")
    print(f"  Using {len(sessions)} IPs, {num_workers} total workers")

    total = 0
    for court, base_path in WEB_COURTS.items():
        print(f"\n  Court: {court} ({base_path})")

        checkpoint_file = FINLEX_WEB_DIR / court / "checkpoint.json"
        completed = set()
        if checkpoint_file.exists():
            with open(checkpoint_file) as f:
                cp = json.load(f)
                completed = set(tuple(x) for x in cp.get("completed", []))
                print(f"  Resuming, {len(completed)} already downloaded")

        decisions = discover_decisions_for_court(court, base_path, sessions[0])
        pending = [(y, n) for (y, n) in decisions if (y, n) not in completed]
        print(f"  Total: {len(decisions)}, pending: {len(pending)}")

        downloaded = 0
        t0 = time.time()

        for i in range(0, len(pending), num_workers):
            batch = pending[i:i + num_workers]
            with ThreadPoolExecutor(max_workers=num_workers) as pool:
                futures = {}
                for idx, (y, n) in enumerate(batch):
                    s = get_session_for_index(sessions, idx)
                    futures[pool.submit(download_web_decision, court, base_path, y, n, s)] = (y, n)

                for future in as_completed(futures):
                    key = futures[future]
                    try:
                        if future.result():
                            downloaded += 1
                            completed.add(key)
                    except Exception as e:
                        print(f"    Failed {key}: {e}")

            (FINLEX_WEB_DIR / court).mkdir(parents=True, exist_ok=True)
            with open(checkpoint_file, "w") as f:
                json.dump({"completed": list(completed)}, f)

        elapsed = time.time() - t0
        rate = downloaded / elapsed if elapsed > 0 else 0
        print(f"  {court} complete: {downloaded} new decisions ({rate:.1f}/s)")
        total += downloaded

    print(f"\nFinlex web scraping complete: {total} decisions total")


def download_github_repo():
    """Clone or update eliask/finlex-data GitHub repository."""
    GITHUB_DIR.parent.mkdir(parents=True, exist_ok=True)

    repo_url = "https://github.com/eliask/finlex-data.git"

    if (GITHUB_DIR / ".git").exists():
        print(f"\nGitHub repo exists, pulling updates: {GITHUB_DIR}")
        result = subprocess.run(
            ["git", "-C", str(GITHUB_DIR), "pull", "--ff-only"],
            capture_output=True, text=True, timeout=600,
        )
        if result.returncode == 0:
            print(f"  Pull successful")
        else:
            print(f"  Pull failed: {result.stderr}")
            print("  Trying fetch + reset...")
            subprocess.run(
                ["git", "-C", str(GITHUB_DIR), "fetch", "origin"],
                capture_output=True, text=True, timeout=600,
            )
    else:
        print(f"\nCloning eliask/finlex-data (shallow) -> {GITHUB_DIR}")
        result = subprocess.run(
            ["git", "clone", "--depth", "1", repo_url, str(GITHUB_DIR)],
            capture_output=True, text=True, timeout=1800,
        )
        if result.returncode == 0:
            print(f"  Clone successful")
        else:
            print(f"  Clone failed: {result.stderr}")
            raise RuntimeError(f"git clone failed: {result.stderr}")

    # Report size
    if GITHUB_DIR.exists():
        size = sum(f.stat().st_size for f in GITHUB_DIR.rglob("*") if f.is_file())
        print(f"  GitHub repo size: {size / (1024**3):.2f} GB")


def main():
    BASE_DIR.mkdir(parents=True, exist_ok=True)
    mode = sys.argv[1] if len(sys.argv) > 1 else "all"

    if mode in ("all", "api"):
        download_finlex_api()
    if mode in ("all", "web"):
        download_finlex_web()
    if mode in ("all", "github"):
        download_github_repo()

    print("\n" + "=" * 60)
    print("All Finnish downloads complete!")
    total_size = sum(f.stat().st_size for f in BASE_DIR.rglob("*") if f.is_file())
    print(f"Total size: {total_size / (1024**3):.1f} GB")


if __name__ == "__main__":
    main()
