"""Multi-IP aiohttp connector pool with round-robin scheduling."""
import asyncio
import logging
import time
from collections import deque

import aiohttp


log = logging.getLogger(__name__)

DEFAULT_UA = "SecondLayer-Legal-Platform/2.0 (legal.org.ua; opendata-importer)"


class RateLimiter:
    """Sliding-window limiter: at most `max_per_sec` acquire()s complete per rolling
    second, enforced across ALL callers regardless of how many workers/IPs share it.

    Use this instead of guessing a "safe" worker count — low per-request latency can
    push a fixed-concurrency pool's real throughput above a documented limit even when
    the worker count looks conservative.
    """

    def __init__(self, max_per_sec: float):
        self.max_per_sec = max_per_sec
        self._times: deque[float] = deque()
        self._lock = asyncio.Lock()

    async def acquire(self):
        async with self._lock:
            while True:
                now = time.monotonic()
                while self._times and now - self._times[0] > 1.0:
                    self._times.popleft()
                if len(self._times) < self.max_per_sec:
                    self._times.append(now)
                    return
                sleep_for = 1.0 - (now - self._times[0])
                await asyncio.sleep(max(sleep_for, 0.01))


class MultiIPSessionPool:
    """One aiohttp session per source IP, round-robin handed out by index."""

    def __init__(self, ips: list[str], workers_per_ip: int, user_agent: str = DEFAULT_UA,
                 timeout_total: int = 120, rate_limit_per_sec: float | None = None):
        if not ips:
            ips = [""]  # empty string = system default routing
        self.ips = ips
        self._timeout = aiohttp.ClientTimeout(total=timeout_total)
        self._headers = {"User-Agent": user_agent}
        self._sessions: list[aiohttp.ClientSession] = []
        self._semaphores: list[asyncio.Semaphore] = []
        self._workers_per_ip = workers_per_ip
        self._rate_limiter = RateLimiter(rate_limit_per_sec) if rate_limit_per_sec else None

    async def __aenter__(self):
        for ip in self.ips:
            connector = aiohttp.TCPConnector(
                local_addr=(ip, 0) if ip else None,
                limit=self._workers_per_ip,
                limit_per_host=self._workers_per_ip,
                enable_cleanup_closed=True,
            )
            session = aiohttp.ClientSession(
                connector=connector,
                timeout=self._timeout,
                headers=self._headers,
            )
            self._sessions.append(session)
            self._semaphores.append(asyncio.Semaphore(self._workers_per_ip))
        log.info(f"Opened {len(self._sessions)} sessions across IPs: {self.ips}")
        return self

    async def __aexit__(self, *args):
        for s in self._sessions:
            await s.close()

    async def fetch(self, idx: int, url: str, *, retries: int = 3, **kwargs) -> tuple[int, str]:
        """Fetch via session selected by idx (caller responsible for round-robin).

        Returns (status_code, text). On full failure raises last exception.
        """
        sid = idx % len(self._sessions)
        session = self._sessions[sid]
        sem = self._semaphores[sid]
        last_exc = None
        async with sem:
            for attempt in range(retries):
                if self._rate_limiter:
                    await self._rate_limiter.acquire()
                try:
                    async with session.get(url, **kwargs) as r:
                        return r.status, await r.text()
                except Exception as e:
                    last_exc = e
                    await asyncio.sleep(2 * (attempt + 1))
        raise last_exc

    async def fetch_bytes(self, idx: int, url: str, *, retries: int = 3, **kwargs) -> tuple[int, bytes]:
        sid = idx % len(self._sessions)
        session = self._sessions[sid]
        sem = self._semaphores[sid]
        last_exc = None
        async with sem:
            for attempt in range(retries):
                if self._rate_limiter:
                    await self._rate_limiter.acquire()
                try:
                    async with session.get(url, **kwargs) as r:
                        return r.status, await r.read()
                except Exception as e:
                    last_exc = e
                    await asyncio.sleep(2 * (attempt + 1))
        raise last_exc

    @property
    def total_workers(self) -> int:
        return self._workers_per_ip * len(self.ips)
