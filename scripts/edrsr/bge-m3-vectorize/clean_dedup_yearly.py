#!/usr/bin/env python3
"""EDRSR per-year dataset prep: header cleaning + global dedup (KUpAP/TsPK campaigns).

Stage 1 (parallel per year-file): decompress jsonl.zst, clean header noise
(court address/phone/email/EDRPOU), write cleaned tmp jsonl.zst, collect
(doc_id, md5 of cleaned text) per record.

Driver: chronological first-occurrence dedup by doc_id, then by exact text md5.

Stage 2 (parallel per year-file): drop duplicate records, write final files.
"""
import hashlib
import json
import os
import pickle
import re
import subprocess
import sys
import time
from multiprocessing import Pool
from pathlib import Path

if len(sys.argv) != 3:
    sys.exit('usage: clean_dedup_yearly.py <src_dir> <out_dir>')
SRC_DIR = Path(sys.argv[1])
OUT_DIR = Path(sys.argv[2])
TMP_DIR = OUT_DIR / '.tmp'

HEADER_PATTERNS = [
    re.compile(r'вул\.\s*[А-ЯІЇЄҐа-яіїєґA-Za-z\s\.\,\-]+,?\s*буд\.\s*\d+[а-яА-Я]?(?:\s*,\s*літера\s*[А-Я])?(?:\s*,\s*м\.\s*[А-ЯІЇЄҐа-яіїєґ\s\-]+)?(?:\s*,?\s*\d{5})?', re.UNICODE),
    re.compile(r'\(?\d{3}\)?\s*\d{3}[\-\s]?\d{2}[\-\s]?\d{2}'),
    re.compile(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}'),
    re.compile(r'(?:ЄДРПОУ|код\s+ЄДРПОУ)\s*:?\s*\d{8}'),
    re.compile(r'https?://[^\s]+'),
    re.compile(r'(?<!\d)\d{5}(?!\d)(?:\s*,\s*м\.\s*[А-ЯІЇЄҐа-яіїєґ\s\-]+)?'),
]

DOC_START = re.compile(
    r'^\s*(У\s*Х\s*В\s*А\s*Л\s*А|Р\s*І\s*Ш\s*Е\s*Н\s*Н\s*Я|П\s*О\s*С\s*Т\s*А\s*Н\s*О\s*В\s*А|В\s*И\s*Р\s*О\s*К|УХВАЛА|РІШЕННЯ|ПОСТАНОВА|ВИРОК)',
    re.IGNORECASE)


def clean_text(text):
    lines = text.split('\n')
    cleaned_lines = []
    header_zone = True
    for line in lines:
        stripped = line.strip()
        if header_zone:
            if not stripped:
                continue
            if DOC_START.search(stripped):
                header_zone = False
                cleaned_lines.append(stripped)
                continue
            is_header = False
            for pattern in HEADER_PATTERNS:
                if pattern.search(stripped):
                    is_header = True
                    break
            if is_header:
                continue
            if len(stripped) < 20 and not re.search(r'(?:суд|справ|№)', stripped, re.IGNORECASE):
                continue
            cleaned_lines.append(stripped)
        else:
            cleaned_lines.append(stripped)
    result = '\n'.join(cleaned_lines)
    result = re.sub(r'\n{3,}', '\n\n', result)
    result = re.sub(r'[ \t]{3,}', '  ', result)
    for pattern in HEADER_PATTERNS[1:4]:
        result = pattern.sub('', result)
    return result.strip()


def stage1(src_path_str):
    src_path = Path(src_path_str)
    tmp_path = TMP_DIR / src_path.name
    meta_path = TMP_DIR / (src_path.name + '.meta.pkl')
    t0 = time.time()
    count = 0
    saved_chars = 0
    meta = []  # (doc_id, md5_hexdigest_bytes)
    dec = subprocess.Popen(['zstd', '-dc', str(src_path)], stdout=subprocess.PIPE)
    tmp_fh = open(tmp_path, 'wb')
    enc = subprocess.Popen(['zstd', '-c', '-q', '-T4'], stdin=subprocess.PIPE, stdout=tmp_fh)
    for line in dec.stdout:
        doc = json.loads(line)
        original = doc.get('text') or ''
        cleaned = clean_text(original)
        saved_chars += len(original) - len(cleaned)
        doc['text'] = cleaned
        out = json.dumps(doc, ensure_ascii=False)
        enc.stdin.write(out.encode('utf-8'))
        enc.stdin.write(b'\n')
        meta.append((doc['doc_id'], hashlib.md5(cleaned.encode('utf-8')).digest()))
        count += 1
    dec.stdout.close()
    enc.stdin.close()
    if dec.wait() != 0 or enc.wait() != 0:
        raise RuntimeError(f'zstd failed for {src_path}')
    tmp_fh.close()
    with open(meta_path, 'wb') as f:
        pickle.dump(meta, f, protocol=4)
    elapsed = time.time() - t0
    print(f'  [stage1] {src_path.name}: {count} docs, saved {saved_chars/1e6:.0f} MB chars, {elapsed:.0f}s', flush=True)
    return (src_path.name, count)


def stage2(args):
    name, drop_indexes = args
    tmp_path = TMP_DIR / name
    out_path = OUT_DIR / name
    if not drop_indexes:
        os.rename(tmp_path, out_path)
        return (name, 0)
    drops = set(drop_indexes)
    dec = subprocess.Popen(['zstd', '-dc', str(tmp_path)], stdout=subprocess.PIPE)
    out_fh = open(out_path, 'wb')
    enc = subprocess.Popen(['zstd', '-c', '-q', '-T4'], stdin=subprocess.PIPE, stdout=out_fh)
    for i, line in enumerate(dec.stdout):
        if i in drops:
            continue
        enc.stdin.write(line)
    dec.stdout.close()
    enc.stdin.close()
    if dec.wait() != 0 or enc.wait() != 0:
        raise RuntimeError(f'zstd failed for {name}')
    out_fh.close()
    os.remove(tmp_path)
    print(f'  [stage2] {name}: dropped {len(drops)} dups', flush=True)
    return (name, len(drops))


def file_sort_key(p):
    # chronological order: pre2005 first, then years ascending
    stem = p.stem.replace('.jsonl', '')
    year = stem.split('_')[1]
    return -1 if year == 'pre2005' else int(year)


def main():
    TMP_DIR.mkdir(parents=True, exist_ok=True)
    files = sorted(SRC_DIR.glob('*.jsonl.zst'), key=file_sort_key)
    print(f'Stage 1: cleaning {len(files)} files...', flush=True)
    t0 = time.time()
    with Pool(len(files)) as pool:
        pool.map(stage1, [str(f) for f in files])
    print(f'Stage 1 done in {time.time()-t0:.0f}s', flush=True)

    print('Building global dedup map...', flush=True)
    seen_ids = set()
    seen_md5 = set()
    drop_by_file = {}
    total = 0
    dup_id = 0
    dup_text = 0
    for f in files:
        meta_path = TMP_DIR / (f.name + '.meta.pkl')
        with open(meta_path, 'rb') as fh:
            meta = pickle.load(fh)
        drops = []
        for i, (doc_id, md5) in enumerate(meta):
            total += 1
            if doc_id in seen_ids:
                dup_id += 1
                drops.append(i)
                continue
            if md5 in seen_md5:
                dup_text += 1
                drops.append(i)
                continue
            seen_ids.add(doc_id)
            seen_md5.add(md5)
        drop_by_file[f.name] = drops
        if drops:
            print(f'  {f.name}: {len(drops)} dups', flush=True)
    print(f'Total: {total} docs, dup doc_id: {dup_id}, dup text: {dup_text}, unique: {total - dup_id - dup_text}', flush=True)

    print('Stage 2: writing final files...', flush=True)
    t0 = time.time()
    with Pool(len(files)) as pool:
        pool.map(stage2, [(f.name, drop_by_file[f.name]) for f in files])
    print(f'Stage 2 done in {time.time()-t0:.0f}s', flush=True)

    for f in files:
        meta_path = TMP_DIR / (f.name + '.meta.pkl')
        if meta_path.exists():
            os.remove(meta_path)
    try:
        TMP_DIR.rmdir()
    except OSError:
        pass
    print('DONE', flush=True)


if __name__ == '__main__':
    main()
