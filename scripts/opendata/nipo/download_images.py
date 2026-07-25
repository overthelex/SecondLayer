#!/usr/bin/env python3
"""Download NIPO mark / design images referenced by ip_objects.image_path and
store them in MinIO (S3-compatible), recording the object key back in the DB.

The SIS API only gives relative media paths (e.g.
/media/TRADE_MARKS/2024/m202400411/m202400411.JPG); the binaries live under
https://sis.nipo.gov.ua. This script fetches each image (rate-limited, like the
harvester) and puts it into a MinIO bucket, then sets ip_objects.image_object_key
so the frontend / evidence panel can render the mark and so the collision search
(#4) can later add a visual-similarity stage over figurative marks.

Idempotent: adds image_object_key if missing and only processes rows where it is
still NULL, so re-runs resume where they left off.

Env:
  POSTGRES_HOST/PORT/DB/USER/PASSWORD   - DB holding ip_objects
  S3_ENDPOINT        - MinIO endpoint (default http://127.0.0.1:9000)
  MINIO_ACCESS_KEY / MINIO_SECRET_KEY   - MinIO credentials

Usage:
  python3 download_images.py --dry-run --limit 3     # download only, no MinIO/DB
  python3 download_images.py --bucket nipo-images    # full run
"""

import argparse
import os
import time
from urllib.request import urlopen, Request
from urllib.error import URLError, HTTPError

MEDIA_HOST = "https://sis.nipo.gov.ua"
MAX_RETRIES = 6

CONTENT_TYPES = {
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
    ".gif": "image/gif", ".tif": "image/tiff", ".tiff": "image/tiff",
    ".bmp": "image/bmp", ".webp": "image/webp",
}


def log(msg):
    print(msg, flush=True)


def content_type_for(path):
    ext = os.path.splitext(path)[1].lower()
    return CONTENT_TYPES.get(ext, "application/octet-stream")


def fetch_bytes(url, rate):
    for attempt in range(MAX_RETRIES):
        try:
            time.sleep(rate)
            req = Request(url, headers={"User-Agent": "Mozilla/5.0 (SecondLayer NIPO image fetch)"})
            with urlopen(req, timeout=90) as resp:
                return resp.read(), resp.headers.get("Content-Type")
        except (URLError, HTTPError, TimeoutError, ConnectionError, OSError) as e:
            code = getattr(e, "code", None)
            if code == 404:
                return None, None  # missing image, skip permanently-ish
            wait = min(2 ** attempt + 1, 40)
            if "429" in str(e) or "503" in str(e):
                wait = max(wait, 10)
            if attempt < MAX_RETRIES - 1:
                time.sleep(wait)
            else:
                raise
    return None, None


def get_db_conn():
    import psycopg2
    host = os.environ.get("POSTGRES_HOST", "127.0.0.1")
    port = int(os.environ.get("POSTGRES_PORT", "5432"))
    db = os.environ.get("POSTGRES_DB", "secondlayer")
    user = os.environ.get("POSTGRES_USER", "secondlayer")
    log(f"  DB target: postgresql://{user}@{host}:{port}/{db}")
    return psycopg2.connect(host=host, port=port, dbname=db, user=user,
                            password=os.environ.get("POSTGRES_PASSWORD"))


def make_s3():
    import boto3
    endpoint = os.environ.get("S3_ENDPOINT", "http://127.0.0.1:9000")
    log(f"  S3 endpoint: {endpoint}")
    return boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=os.environ.get("MINIO_ACCESS_KEY"),
        aws_secret_access_key=os.environ.get("MINIO_SECRET_KEY"),
        region_name=os.environ.get("S3_REGION", "us-east-1"),
    )


def ensure_bucket(s3, bucket):
    from botocore.exceptions import ClientError
    try:
        s3.head_bucket(Bucket=bucket)
    except ClientError:
        s3.create_bucket(Bucket=bucket)
        log(f"  created bucket {bucket}")


def run(args):
    conn = get_db_conn()
    cur = conn.cursor()

    if not args.dry_run:
        cur.execute("ALTER TABLE ip_objects ADD COLUMN IF NOT EXISTS image_object_key TEXT;")
        conn.commit()

    where = "image_path IS NOT NULL AND image_object_key IS NULL" if not args.dry_run \
        else "image_path IS NOT NULL"
    limit_sql = f"LIMIT {int(args.limit)}" if args.limit else ""
    cur.execute(f"SELECT id, app_number, image_path FROM ip_objects WHERE {where} ORDER BY id {limit_sql}")
    rows = cur.fetchall()
    log(f"Found {len(rows)} images to process")

    s3 = None
    if not args.dry_run:
        s3 = make_s3()
        ensure_bucket(s3, args.bucket)

    done = skipped = failed = 0
    for oid, app_number, image_path in rows:
        url = f"{MEDIA_HOST}{image_path}"
        try:
            data, ctype = fetch_bytes(url, args.rate)
        except Exception as e:
            log(f"  [{app_number}] FAILED: {e}")
            failed += 1
            continue
        if not data:
            log(f"  [{app_number}] missing (404): {image_path}")
            skipped += 1
            continue

        key = image_path.lstrip("/")  # preserve media/ hierarchy as object key
        if args.dry_run:
            log(f"  [{app_number}] {len(data)} bytes {content_type_for(image_path)} -> would put {args.bucket}/{key}")
            done += 1
            continue

        s3.put_object(Bucket=args.bucket, Key=key, Body=data,
                      ContentType=ctype or content_type_for(image_path))
        cur.execute("UPDATE ip_objects SET image_object_key=%s WHERE id=%s", (key, oid))
        conn.commit()
        done += 1
        if done % 25 == 0:
            log(f"  ...{done} uploaded")

    cur.close(); conn.close()
    log(f"\nDONE: {done} processed, {skipped} missing, {failed} failed"
        + (" (dry run — nothing uploaded)" if args.dry_run else f" -> bucket {args.bucket}"))


def parse_args():
    p = argparse.ArgumentParser(description="Download NIPO images into MinIO")
    p.add_argument("--bucket", default=os.environ.get("NIPO_IMAGE_BUCKET", "nipo-images"))
    p.add_argument("--limit", type=int, default=0, help="max images (0 = all)")
    p.add_argument("--rate", type=float, default=1.0, help="seconds between fetches")
    p.add_argument("--dry-run", action="store_true", help="download only, no MinIO / no DB write")
    return p.parse_args()


if __name__ == "__main__":
    run(parse_args())
