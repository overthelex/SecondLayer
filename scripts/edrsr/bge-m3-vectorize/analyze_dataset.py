#!/usr/bin/env python3
"""Data-quality analysis of /data/kupap-fulltext-clean before vectorization."""
import json
import re
import subprocess
import sys
from multiprocessing import Pool
from pathlib import Path

if len(sys.argv) != 2:
    sys.exit('usage: analyze_dataset.py <dataset_dir>')
SRC = Path(sys.argv[1])
MAX_CHUNK = 2048
CAP = 15000

PHONE = re.compile(r'\(?\d{3}\)?\s*\d{3}[\-\s]?\d{2}[\-\s]?\d{2}')
ADDR = re.compile(r'вул\.\s*\S+.{0,40}буд\.')


def ceil_div(a, b):
    return -(-a // b)


def analyze(path_str):
    p = Path(path_str)
    dec = subprocess.Popen(['zstd', '-dc', str(p)], stdout=subprocess.PIPE)
    n = 0
    empty = 0
    sub50 = 0
    sub200 = 0
    over15k = 0
    total_chars = 0
    chunks = 0
    no_id = 0
    no_date = 0
    no_court = 0
    bad_json = 0
    noise_head = 0
    lens = []
    for line in dec.stdout:
        try:
            d = json.loads(line)
        except Exception:
            bad_json += 1
            continue
        n += 1
        t = d.get('text') or ''
        L = len(t)
        total_chars += L
        if n % 50 == 0:
            lens.append(L)
        if L == 0:
            empty += 1
        elif L < 50:
            sub50 += 1
        elif L < 200:
            sub200 += 1
        if L > CAP:
            over15k += 1
        chunks += max(1, ceil_div(min(L, CAP), MAX_CHUNK))
        if d.get('doc_id') is None:
            no_id += 1
        if not d.get('adjudication_date'):
            no_date += 1
        if not d.get('court_code'):
            no_court += 1
        head = t[:300]
        if PHONE.search(head) or ADDR.search(head):
            noise_head += 1
    dec.stdout.close()
    dec.wait()
    return dict(file=p.name, n=n, empty=empty, sub50=sub50, sub200=sub200,
                over15k=over15k, total_chars=total_chars, chunks=chunks,
                no_id=no_id, no_date=no_date, no_court=no_court,
                bad_json=bad_json, noise_head=noise_head, lens=lens)


def main():
    files = sorted(SRC.glob('*.jsonl.zst'))
    with Pool(len(files)) as pool:
        results = pool.map(analyze, [str(f) for f in files])
    tot = lambda k: sum(r[k] for r in results)
    all_lens = sorted(x for r in results for x in r['lens'])
    def pct(q):
        return all_lens[int(q * (len(all_lens) - 1))] if all_lens else 0
    print(f"{'file':28} {'docs':>9} {'empty':>6} {'<50':>6} {'<200':>7} {'>15k':>7} {'noiseHead':>9} {'noID':>5} {'noDate':>6}")
    for r in results:
        print(f"{r['file']:28} {r['n']:>9} {r['empty']:>6} {r['sub50']:>6} {r['sub200']:>7} {r['over15k']:>7} {r['noise_head']:>9} {r['no_id']:>5} {r['no_date']:>6}")
    print()
    print(f"TOTAL docs:        {tot('n'):,}")
    print(f"bad_json:          {tot('bad_json')}")
    print(f"empty text:        {tot('empty'):,}")
    print(f"text <50 chars:    {tot('sub50'):,}")
    print(f"text 50-200 chars: {tot('sub200'):,}")
    print(f"text >15k chars (truncated at embed): {tot('over15k'):,}")
    print(f"missing doc_id:    {tot('no_id')}")
    print(f"missing date:      {tot('no_date')}")
    print(f"missing court:     {tot('no_court')}")
    print(f"residual addr/phone in first 300 chars: {tot('noise_head'):,}")
    print(f"total text:        {tot('total_chars')/1e9:.1f} G chars")
    print(f"est. chunks (2048 chars, cap 15k): {tot('chunks'):,}")
    print(f"len percentiles (sampled 1/50): p10={pct(.1)} p50={pct(.5)} p90={pct(.9)} p99={pct(.99)} max={all_lens[-1] if all_lens else 0}")


if __name__ == '__main__':
    main()
