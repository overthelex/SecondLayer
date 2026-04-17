"""Base importer scaffolding — shared lifecycle, logging, stats."""
import asyncio
import logging
import os
import signal
import sys
import time
from abc import ABC, abstractmethod
from pathlib import Path

from .checkpoint import Checkpoint
from .http_client import MultiIPSessionPool
from .ip_pool import discover_public_ips
from .prod_writer import copy_into, query_count


def setup_logging(name: str):
    logging.basicConfig(
        level=os.environ.get("LOG_LEVEL", "INFO"),
        format=f"%(asctime)s [%(levelname)s] [{name}] %(message)s",
        handlers=[logging.StreamHandler(sys.stdout)],
    )


class Stats:
    def __init__(self):
        self.downloaded = 0
        self.skipped = 0
        self.failed = 0
        self.inserted = 0
        self.start = time.time()

    def report(self) -> str:
        elapsed = time.time() - self.start
        rate = (self.downloaded + self.skipped) / elapsed if elapsed > 0 else 0
        return (f"dl={self.downloaded} skip={self.skipped} fail={self.failed} "
                f"insert={self.inserted} | {rate:.1f}/s | {elapsed:.0f}s")


class BaseImporter(ABC):
    """Subclasses implement source-specific scrape/parse logic."""

    SERVICE_NAME = "base"           # override
    TARGET_TABLE = ""                # override
    COLUMNS: list[str] = []          # override — column order for COPY
    PK_COLUMNS: list[str] = []       # override — for ON CONFLICT
    ON_CONFLICT = "do_nothing"       # or "do_update"
    BATCH_SIZE = 500                 # rows per COPY batch

    def __init__(self):
        self.log = logging.getLogger(self.SERVICE_NAME)
        self.stats = Stats()
        self.workers_per_ip = int(os.environ.get("WORKERS_PER_IP", "8"))
        self.checkpoint_path = Path(os.environ.get(
            "CHECKPOINT_DIR", "/data/checkpoints")) / f"{self.SERVICE_NAME}.json"
        self.ckpt = Checkpoint(self.checkpoint_path)
        self.dry_run = os.environ.get("DRY_RUN") == "1"
        self.run_once = os.environ.get("RUN_ONCE", "1") == "1"
        self.sleep_between_runs = int(os.environ.get("SLEEP_BETWEEN_RUNS", "3600"))
        self.ssh_host = os.environ.get("PROD_SSH_HOST", "prod")
        self.container = os.environ.get("PG_CONTAINER", "secondlayer-postgres-prod")
        self.dbuser = os.environ.get("PG_USER", "secondlayer")
        self.dbname = os.environ.get("PG_DB", "secondlayer_prod")

    @abstractmethod
    async def import_dataset(self, pool: MultiIPSessionPool):
        """Scrape, parse, and call self.write_batch() for each chunk."""

    def write_batch(self, rows: list[tuple]) -> int:
        if not rows:
            return 0
        if self.dry_run:
            self.log.info(f"[dry-run] would COPY {len(rows)} rows into {self.TARGET_TABLE}")
            self.stats.inserted += len(rows)
            return len(rows)
        try:
            inserted = copy_into(
                self.TARGET_TABLE, self.COLUMNS, rows,
                ssh_host=self.ssh_host, container=self.container,
                dbuser=self.dbuser, dbname=self.dbname,
                on_conflict=self.ON_CONFLICT,
                pk_columns=self.PK_COLUMNS,
            )
            self.stats.inserted += inserted
            self.log.info(f"  inserted {inserted}/{len(rows)} into {self.TARGET_TABLE} | {self.stats.report()}")
            return inserted
        except Exception as e:
            self.log.error(f"  prod write failed: {e}")
            self.stats.failed += len(rows)
            raise

    async def run_once_async(self):
        ips = discover_public_ips()
        self.log.info(f"Discovered {len(ips)} public IPs: {ips or '[default routing]'}")
        async with MultiIPSessionPool(ips, self.workers_per_ip) as pool:
            self.log.info(f"Total concurrent workers: {pool.total_workers}")
            self.log.info(f"Target: {self.ssh_host}/{self.container}/{self.dbname}/{self.TARGET_TABLE}")
            await self.import_dataset(pool)

        if not self.dry_run:
            count = query_count(self.TARGET_TABLE, ssh_host=self.ssh_host,
                                container=self.container, dbuser=self.dbuser,
                                dbname=self.dbname)
            self.log.info(f"Done. {self.TARGET_TABLE} on prod now: {count} rows | {self.stats.report()}")

    def run(self):
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

        stop_flag = {"stop": False}

        def handle_signal(signum, frame):
            self.log.warning(f"Signal {signum} received, stopping after current run")
            stop_flag["stop"] = True

        signal.signal(signal.SIGTERM, handle_signal)
        signal.signal(signal.SIGINT, handle_signal)

        try:
            while True:
                self.log.info(f"=== {self.SERVICE_NAME} starting ===")
                try:
                    loop.run_until_complete(self.run_once_async())
                except Exception as e:
                    self.log.exception(f"Run failed: {e}")
                if self.run_once or stop_flag["stop"]:
                    break
                self.log.info(f"Sleeping {self.sleep_between_runs}s before next run")
                for _ in range(self.sleep_between_runs):
                    if stop_flag["stop"]:
                        break
                    time.sleep(1)
        finally:
            loop.close()
        self.log.info(f"=== {self.SERVICE_NAME} stopped ===")
