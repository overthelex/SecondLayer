#!/bin/bash
# Backfill NIPO harvest for 2006-2014 (2015 already done in the 2015-2026 pass),
# sharded across all 15 prod egress IPs. 9 year-shards (all types+states) + 6
# boost workers on the heavier years' TM-registered slice. Resumable; writes to
# the same /home/ubuntu/nipo_harvest tree (year windows do not collide).
set -u
DIR=/home/ubuntu/SecondLayer/scripts/opendata/nipo
OUT=${OUT:-/home/ubuntu/nipo_harvest}; LOG=$OUT/logs
RATE=${RATE:-1.1}
mkdir -p "$LOG"

# One IP per year, full types+states.
years=(
  "172.31.29.20 2006" "172.31.21.47 2007" "172.31.22.206 2008"
  "172.31.27.31 2009" "172.31.28.109 2010" "172.31.31.40 2011"
  "172.31.21.255 2012" "172.31.19.142 2013" "172.31.19.20 2014"
)
for s in "${years[@]}"; do set -- $s; ip=$1; y=$2
  nohup python3 "$DIR/harvest_nipo.py" --start-year $y --end-year $y \
    --source-ip $ip --rate $RATE --out-dir "$OUT" > "$LOG/bf_${y}.log" 2>&1 &
  echo "year   src=$ip $y pid=$!"; sleep 0.3
done

# Boost workers: TM-registered (the bottleneck) on heavier years.
boosts=(
  "172.31.17.145 2014" "172.31.16.240 2013" "172.31.21.126 2012"
  "172.31.21.214 2011" "172.31.27.133 2010" "172.31.22.179 2009"
)
for s in "${boosts[@]}"; do set -- $s; ip=$1; y=$2
  nohup python3 "$DIR/harvest_nipo.py" --obj-types 4 --obj-states 2 \
    --start-year $y --end-year $y --source-ip $ip --rate $RATE --out-dir "$OUT" \
    > "$LOG/bf_boost_${y}.log" 2>&1 &
  echo "TMreg  src=$ip $y pid=$!"; sleep 0.3
done
echo "launched 15 shards for 2006-2014 backfill -> $OUT"
