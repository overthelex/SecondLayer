#!/usr/bin/env python3
"""Print 6343 filtered-search latency in seconds, or FAIL. Used by watch_and_launch.sh."""
import random
import time

import requests

vec = [random.gauss(0, 1) for _ in range(1024)]
body = {
    "vector": vec,
    "limit": 6,
    "filter": {"must": [{"key": "justice_kind", "match": {"value": 3}}]},
    "with_payload": False,
}
try:
    t = time.time()
    r = requests.post(
        "http://localhost:6343/collections/edrsr_decisions/points/search",
        json=body, timeout=10,
    )
    print("%.2f" % (time.time() - t) if r.status_code == 200 else "FAIL")
except Exception:
    print("FAIL")
