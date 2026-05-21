#!/usr/bin/env python3
"""Stage 8: Upload packaged training data to S3."""

import argparse, json, os, sys, time
import boto3
from boto3.s3.transfer import TransferConfig


def main():
    parser = argparse.ArgumentParser(description="Stage 8: Upload to S3")
    parser.add_argument("--input-dir", required=True)
    parser.add_argument("--s3-prefix", required=True)
    parser.add_argument("--max-concurrency", type=int, default=10)
    args = parser.parse_args()

    s3_path = args.s3_prefix.replace("s3://", "")
    bucket, prefix = s3_path.split("/", 1)
    s3 = boto3.client("s3")
    config = TransferConfig(multipart_threshold=100*1024*1024, max_concurrency=args.max_concurrency)

    files = [os.path.join(r, f) for r, d, fs in os.walk(args.input_dir) for f in fs if f.endswith((".npy", ".json"))]
    total_size = sum(os.path.getsize(f) for f in files)
    print(f"Uploading {len(files)} files ({total_size/(1024**3):.1f} GB)")

    uploaded = 0
    t0 = time.time()
    for i, fp in enumerate(files):
        key = f"{prefix}/{os.path.relpath(fp, args.input_dir)}".replace("//", "/")
        s3.upload_file(fp, bucket, key, Config=config)
        uploaded += os.path.getsize(fp)
        if (i+1) % 10 == 0:
            speed = uploaded / max(time.time()-t0, 1) / 1048576
            print(f"  {i+1}/{len(files)}, {uploaded/total_size*100:.0f}%, {speed:.0f} MB/s")

    elapsed = time.time() - t0
    print(f"\nUpload complete in {elapsed/60:.1f} min")
    with open(os.path.join(args.input_dir, "upload_stats.json"), "w") as f:
        json.dump({"files": len(files), "total_gb": round(uploaded/(1024**3), 2),
                    "duration_sec": elapsed, "s3_path": f"s3://{bucket}/{prefix}"}, f, indent=2)

if __name__ == "__main__":
    main()
