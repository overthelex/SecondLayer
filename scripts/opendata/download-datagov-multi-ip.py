#!/usr/bin/env python3
"""
Download open datasets from data.gov.ua using multiple source IPs.
5 IPs × 5 threads = 25 concurrent downloads.

Supports: direct file download (ZIP/CSV/JSON/XLSX) and multi-resource datasets.

Usage:
    python3 download-datagov-multi-ip.py                    # download all TIER1 datasets
    python3 download-datagov-multi-ip.py --dataset passports # single dataset
    python3 download-datagov-multi-ip.py --list              # list available datasets
    python3 download-datagov-multi-ip.py --dataset finzvit --dry-run

Requires: pip install aiohttp aiofiles
"""

import argparse
import asyncio
import aiohttp
import aiofiles
import json
import os
import sys
import time
import logging
from pathlib import Path
from collections import defaultdict
from dataclasses import dataclass, field

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
log = logging.getLogger(__name__)

# ── Config ──────────────────────────────────────────────────
SOURCE_IPS = [
    "172.31.29.20",
    "172.31.21.255",
    "172.31.31.40",
    "172.31.22.206",
    "172.31.28.109",
]
THREADS_PER_IP = 5
TOTAL_WORKERS = len(SOURCE_IPS) * THREADS_PER_IP

BASE_DIR = Path("/mnt/opendata")
CKAN_API = "https://data.gov.ua/api/3/action"
USER_AGENT = "SecondLayer-Legal-Platform/1.0 (+https://legal.org.ua)"

# ── Dataset catalog ─────────────────────────────────────────
# Each dataset: CKAN dataset_id, local folder name, tier, description

DATASETS = {
    # TIER 1 — Must Have
    "finzvit": {
        "ckan_id": "7436ae83-dfc1-4836-9962-8af3e831c522",
        "dir": "finzvit",
        "tier": 1,
        "desc": "Фінзвітність УСІХ підприємств (річна, XML/ZIP)",
    },
    "vehicles": {
        "ckan_id": "06779371-308f-42d7-895e-5a39833375f0",
        "dir": "vehicles",
        "tier": 1,
        "desc": "Реєстрація ТЗ та власники (VIN, CSV/ZIP)",
    },
    "passports": {
        "ckan_id": "ab09ed00-4f51-4f6c-a2f7-1b2fb118be0f",
        "dir": "passports-invalid",
        "tier": 1,
        "desc": "Недійсні паспорти громадянина України (JSON, 78 файлів)",
    },
    "passports_foreign": {
        "ckan_id": "b465b821-db5d-4b8b-8131-12682fab2203",
        "dir": "passports-foreign-invalid",
        "tier": 1,
        "desc": "Недійсні закордонні паспорти (JSON)",
    },
    "terrorism": {
        "ckan_id": "a140de93-d9e1-47ca-b29a-29c7fdc4c3a5",
        "dir": "dsfmu-terrorism",
        "tier": 1,
        "desc": "Перелік осіб пов'язаних з тероризмом (ДСФМУ)",
    },
    "terrorism_orgs": {
        "ckan_id": "pereliktog",
        "dir": "dsfmu-terrorism-orgs",
        "tier": 1,
        "desc": "Перелік терористичних організацій і груп (ДСФМУ)",
    },
    "lustration": {
        "ckan_id": "8faa71c1-3a54-45e8-8f6e-06c92b1ff8bc",
        "dir": "lustration",
        "tier": 1,
        "desc": "Реєстр люстрованих осіб",
    },
    "state_aid": {
        "ckan_id": "16fcf128-1a28-41d5-8081-3dfffe68b397",
        "dir": "state-aid-amku",
        "tier": 1,
        "desc": "Реєстр держдопомоги (АМКУ, ЄДРПОУ + суми)",
    },
    # TIER 2 — Should Have
    "property_valuation": {
        "ckan_id": "2ed2361c-f241-49ab-9f5f-300eb867cb92",
        "dir": "property-valuation",
        "tier": 2,
        "desc": "Єдина база звітів про оцінку нерухомості (XLSX, щотижня)",
    },
    "construction": {
        "ckan_id": "5255ea7e-6f94-41e4-86eb-ad578aea853c",
        "dir": "construction-edessb",
        "tier": 2,
        "desc": "Реєстр будівельної діяльності ЄДЕССБ (JSON)",
    },
    "budget_managers": {
        "ckan_id": "20180805",
        "dir": "budget-managers",
        "tier": 2,
        "desc": "Розпорядники бюджетних коштів (Казначейство)",
    },
    "nonprofits": {
        "ckan_id": "2888f31a-9a0d-4c77-b570-0895753fa9cb",
        "dir": "nonprofits",
        "tier": 2,
        "desc": "Реєстр неприбуткових організацій (ДПС)",
    },
    "audit_chamber": {
        "ckan_id": "2cae5474-79de-43c2-815b-1c3179e135c9",
        "dir": "audit-chamber",
        "tier": 2,
        "desc": "Рішення Рахункової палати",
    },
    "fin_institutions": {
        "ckan_id": "9761494f-166d-4ff6-8f68-786f28daf430",
        "dir": "fin-institutions",
        "tier": 2,
        "desc": "Реєстр фінансових установ (НБУ)",
    },
    "state_property": {
        "ckan_id": "af86e5d3-0176-440d-bda4-d537077c0635",
        "dir": "state-property-fdmu",
        "tier": 2,
        "desc": "Єдиний реєстр об'єктів держвласності (ФДМУ)",
    },
    "land_valuation": {
        "ckan_id": "e306e6a5-eb59-4bc7-aa3e-fb8f12dd7599",
        "dir": "land-valuation",
        "tier": 2,
        "desc": "НГО земель населених пунктів",
    },
    "stolen_weapons": {
        "ckan_id": "5e7a9e93-e4ae-408a-8b99-6a21bfa9c12a",
        "dir": "stolen-weapons",
        "tier": 2,
        "desc": "Викрадена/втрачена зброя (МВС, JSON, щодня)",
    },
    # TIER 3 — Nice to Have
    "crime_stats": {
        "ckan_id": "8b9b1677-2407-454a-bfa7-76eb638c0ea1",
        "dir": "crime-stats",
        "tier": 3,
        "desc": "Кримстатистика — Форма 1 (ОГП)",
    },
    "copyright": {
        "ckan_id": "0ec928d3-8657-4628-aca8-73b8e4078daa",
        "dir": "copyright",
        "tier": 3,
        "desc": "Авторське право (XML)",
    },
    "alcohol_tobacco": {
        "ckan_id": "d214c31f-8f84-40ef-b698-3d7d0e56ec80",
        "dir": "alcohol-tobacco-licenses",
        "tier": 3,
        "desc": "Ліцензії алкоголь/тютюн (зведений, ДФС)",
    },
    "medicines": {
        "ckan_id": "fded13b8-4e2c-4c48-bf14-65d0e3106463",
        "dir": "medicines-registry",
        "tier": 3,
        "desc": "Реєстр лікарських засобів (МОЗ)",
    },
}


# ── Stats ───────────────────────────────────────────────────
@dataclass
class Stats:
    total: int = 0
    downloaded: int = 0
    skipped: int = 0
    failed: int = 0
    bytes_total: int = 0
    start: float = field(default_factory=time.time)
    per_ip: dict = field(default_factory=lambda: defaultdict(int))
    _lock: asyncio.Lock = field(default_factory=asyncio.Lock)

    async def inc(self, field_name: str, ip: str = None, nbytes: int = 0):
        async with self._lock:
            setattr(self, field_name, getattr(self, field_name) + 1)
            self.bytes_total += nbytes
            if ip and field_name == "downloaded":
                self.per_ip[ip] += 1

    def report(self) -> str:
        elapsed = time.time() - self.start
        done = self.downloaded + self.failed + self.skipped
        rate = self.downloaded / elapsed if elapsed > 0 else 0
        remaining = self.total - done
        eta = remaining / rate if rate > 0 else 0
        mb = self.bytes_total / 1024 / 1024
        ip_stats = " | ".join(
            f"{ip.split('.')[-1]}={cnt}" for ip, cnt in sorted(self.per_ip.items())
        )
        return (
            f"[{done}/{self.total}] "
            f"ok={self.downloaded} fail={self.failed} skip={self.skipped} | "
            f"{mb:.0f}MB | {rate:.1f}/s | ETA {eta/60:.0f}m | IPs: {ip_stats}"
        )


# ── CKAN API ────────────────────────────────────────────────
async def fetch_ckan_resources(session: aiohttp.ClientSession, ckan_id: str) -> list[dict]:
    """Get all resource download URLs from a CKAN dataset."""
    url = f"{CKAN_API}/package_show?id={ckan_id}"
    try:
        async with session.get(url, timeout=aiohttp.ClientTimeout(total=30)) as resp:
            if resp.status != 200:
                log.error(f"CKAN API error {resp.status} for {ckan_id}")
                return []
            data = await resp.json()
            resources = data.get("result", {}).get("resources", [])
            return [
                {
                    "id": r.get("id", ""),
                    "name": r.get("name", ""),
                    "url": r.get("url", ""),
                    "format": r.get("format", "").upper(),
                    "size": r.get("size"),
                }
                for r in resources
                if r.get("url")
            ]
    except Exception as e:
        log.error(f"CKAN fetch error for {ckan_id}: {e}")
        return []


# ── Download one resource ───────────────────────────────────
async def download_resource(
    session: aiohttp.ClientSession,
    resource: dict,
    out_dir: Path,
    stats: Stats,
    semaphore: asyncio.Semaphore,
    source_ip: str,
):
    url = resource["url"]
    # Derive filename from URL or resource name
    url_path = url.split("?")[0].split("/")[-1]
    if not url_path or url_path == "download":
        ext = resource["format"].lower() or "bin"
        url_path = f"{resource['id']}.{ext}"

    outpath = out_dir / url_path

    # Skip if already downloaded and non-empty
    if outpath.exists() and outpath.stat().st_size > 0:
        await stats.inc("skipped")
        return

    async with semaphore:
        for attempt in range(3):
            try:
                timeout = aiohttp.ClientTimeout(total=600)  # 10 min for large files
                async with session.get(url, timeout=timeout, allow_redirects=True) as resp:
                    if resp.status == 200:
                        data = await resp.read()
                        if data:
                            outpath.parent.mkdir(parents=True, exist_ok=True)
                            async with aiofiles.open(outpath, "wb") as f:
                                await f.write(data)
                            await stats.inc("downloaded", source_ip, len(data))
                            return
                    elif resp.status == 429:
                        wait = 10 * (attempt + 1)
                        log.warning(f"Rate limited on {url_path}, waiting {wait}s")
                        await asyncio.sleep(wait)
                        continue
                    elif resp.status >= 500:
                        await asyncio.sleep(5 * (attempt + 1))
                        continue
                    else:
                        log.warning(f"HTTP {resp.status} for {url_path}")
            except asyncio.TimeoutError:
                log.warning(f"Timeout downloading {url_path} (attempt {attempt+1})")
            except Exception as e:
                log.warning(f"Error downloading {url_path}: {e} (attempt {attempt+1})")
            await asyncio.sleep(3 * (attempt + 1))

        await stats.inc("failed")
        log.error(f"FAILED after 3 attempts: {url_path}")


# ── Download all resources for a dataset ────────────────────
async def download_dataset(
    dataset_key: str,
    dataset_cfg: dict,
    ips: list[str],
    dry_run: bool = False,
):
    out_dir = BASE_DIR / dataset_cfg["dir"]
    out_dir.mkdir(parents=True, exist_ok=True)

    log.info(f"{'=' * 60}")
    log.info(f"  [{dataset_key}] {dataset_cfg['desc']}")
    log.info(f"  CKAN ID: {dataset_cfg['ckan_id']}")
    log.info(f"  Output: {out_dir}")

    # Fetch resource list from CKAN
    async with aiohttp.ClientSession(
        headers={"User-Agent": USER_AGENT}
    ) as ckan_session:
        resources = await fetch_ckan_resources(ckan_session, dataset_cfg["ckan_id"])

    if not resources:
        log.error(f"  No resources found for {dataset_key}")
        return

    log.info(f"  Resources: {len(resources)}")
    for r in resources[:5]:
        size_str = f" ({r['size']}B)" if r.get("size") else ""
        log.info(f"    - {r['name'] or r['url'].split('/')[-1]} [{r['format']}]{size_str}")
    if len(resources) > 5:
        log.info(f"    ... and {len(resources) - 5} more")

    if dry_run:
        log.info(f"  DRY RUN — skipping download")
        return

    # Filter already downloaded
    to_download = []
    skipped = 0
    for r in resources:
        url_path = r["url"].split("?")[0].split("/")[-1]
        if not url_path or url_path == "download":
            ext = r["format"].lower() or "bin"
            url_path = f"{r['id']}.{ext}"
        outpath = out_dir / url_path
        if outpath.exists() and outpath.stat().st_size > 0:
            skipped += 1
        else:
            to_download.append(r)

    log.info(f"  Already downloaded: {skipped}, to download: {len(to_download)}")

    if not to_download:
        log.info(f"  All files already present")
        return

    stats = Stats(total=len(to_download))

    # Distribute resources across IPs (round-robin)
    ip_resources: dict[str, list] = defaultdict(list)
    for i, r in enumerate(to_download):
        ip = ips[i % len(ips)]
        ip_resources[ip].append(r)

    log.info(
        f"  Distribution: {', '.join(f'{ip.split(chr(46))[-1]}={len(v)}' for ip, v in ip_resources.items())}"
    )

    async def ip_worker(source_ip: str, ip_res: list):
        semaphore = asyncio.Semaphore(THREADS_PER_IP)
        connector = aiohttp.TCPConnector(
            limit=THREADS_PER_IP,
            limit_per_host=THREADS_PER_IP,
            local_addr=(source_ip, 0),
        )
        async with aiohttp.ClientSession(
            connector=connector,
            headers={"User-Agent": USER_AGENT},
        ) as session:
            tasks = [
                download_resource(session, r, out_dir, stats, semaphore, source_ip)
                for r in ip_res
            ]
            await asyncio.gather(*tasks)

    # Progress reporter
    async def progress():
        while True:
            await asyncio.sleep(15)
            log.info(f"  {stats.report()}")

    prog_task = asyncio.create_task(progress())

    await asyncio.gather(*[ip_worker(ip, res) for ip, res in ip_resources.items()])

    prog_task.cancel()
    log.info(f"  Done: {stats.report()}")


# ── IP availability check ──────────────────────────────────
def get_available_ips(requested_ips: list[str]) -> list[str]:
    """Check which source IPs are actually bound on this machine."""
    import subprocess

    result = subprocess.run(["ip", "-4", "addr", "show"], capture_output=True, text=True)
    available = []
    for line in result.stdout.splitlines():
        line = line.strip()
        if line.startswith("inet "):
            ip = line.split()[1].split("/")[0]
            if ip in requested_ips:
                available.append(ip)
    return available


# ── Main ────────────────────────────────────────────────────
async def async_main(args):
    # Resolve IPs
    ips = get_available_ips(SOURCE_IPS)
    if not ips:
        log.warning("No configured IPs found on this host. Using default outbound IP.")
        ips = ["0.0.0.0"]

    log.info("=" * 60)
    log.info("  data.gov.ua Multi-IP Dataset Downloader")
    log.info(f"  IPs: {len(ips)} × {THREADS_PER_IP} threads = {len(ips) * THREADS_PER_IP} workers")
    log.info(f"  Output: {BASE_DIR}")
    log.info("=" * 60)

    if args.list:
        for key, cfg in sorted(DATASETS.items(), key=lambda x: (x[1]["tier"], x[0])):
            log.info(f"  T{cfg['tier']} {key:25s} {cfg['desc']}")
        return

    # Select datasets
    if args.dataset:
        keys = [k.strip() for k in args.dataset.split(",")]
        for k in keys:
            if k not in DATASETS:
                log.error(f"Unknown dataset: {k}. Use --list to see available.")
                return
    elif args.tier:
        keys = [k for k, v in DATASETS.items() if v["tier"] <= args.tier]
    else:
        # Default: TIER 1 only
        keys = [k for k, v in DATASETS.items() if v["tier"] == 1]

    log.info(f"  Datasets to download: {len(keys)}")
    for k in keys:
        log.info(f"    - {k}: {DATASETS[k]['desc']}")

    for key in keys:
        await download_dataset(key, DATASETS[key], ips, dry_run=args.dry_run)

    log.info("\n=== All done! ===")


def main():
    parser = argparse.ArgumentParser(description="data.gov.ua multi-IP downloader")
    parser.add_argument("--dataset", type=str, help="Dataset key(s), comma-separated")
    parser.add_argument("--tier", type=int, help="Download all datasets up to this tier (1-3)")
    parser.add_argument("--list", action="store_true", help="List available datasets")
    parser.add_argument("--dry-run", action="store_true", help="Only fetch metadata, don't download")
    parser.add_argument("--ips", nargs="+", default=SOURCE_IPS, help="Override source IPs")
    args = parser.parse_args()

    # Override global IPs if provided
    if args.ips != SOURCE_IPS:
        SOURCE_IPS[:] = args.ips

    asyncio.run(async_main(args))


if __name__ == "__main__":
    main()
