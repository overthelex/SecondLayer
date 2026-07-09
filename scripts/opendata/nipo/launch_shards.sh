#!/bin/bash
# Launch the NIPO harvest sharded by year across prod's distinct egress IPs.
# One year per secondary IP (each maps to its own public EIP -> its own SIS
# per-IP rate budget). The app's primary IP (172.31.29.20) is intentionally
# NOT used. Resumable: re-running skips already-fetched windows.
set -u
DIR=/home/ubuntu/SecondLayer/scripts/opendata/nipo
OUT=${OUT:-/home/ubuntu/nipo_harvest}
LOGDIR=$OUT/logs
RATE=${RATE:-1.1}
mkdir -p "$LOGDIR"

# "source_ip start_year end_year" — heaviest (recent) years get their own IP;
# the two lightest early years share one.
shards=(
  "172.31.21.47 2026 2026"
  "172.31.22.206 2025 2025"
  "172.31.27.31 2024 2024"
  "172.31.28.109 2023 2023"
  "172.31.31.40 2022 2022"
  "172.31.21.255 2021 2021"
  "172.31.19.142 2020 2020"
  "172.31.19.20 2019 2019"
  "172.31.17.145 2018 2018"
  "172.31.16.240 2017 2017"
  "172.31.21.126 2015 2016"
)

for s in "${shards[@]}"; do
  set -- $s; ip=$1; y0=$2; y1=$3
  nohup python3 "$DIR/harvest_nipo.py" \
    --start-year "$y0" --end-year "$y1" --source-ip "$ip" \
    --rate "$RATE" --out-dir "$OUT" \
    > "$LOGDIR/shard_${y0}_${y1}.log" 2>&1 &
  echo "launched src=$ip years=$y0-$y1 pid=$!"
  sleep 0.3
done
echo "all shards launched -> $OUT (logs in $LOGDIR)"
