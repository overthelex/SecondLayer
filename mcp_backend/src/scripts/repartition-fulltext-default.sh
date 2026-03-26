#!/bin/bash
# Repartition edrsr_fulltext_p_default → year partitions
# Moves rows batch-by-batch from default partition to correct year partition.
# Run on prod: DATABASE_URL=postgres://... bash repartition-fulltext-default.sh

set -euo pipefail

DB="${DATABASE_URL:?DATABASE_URL required}"
BATCH=50000
LOG="/home/ubuntu/repartition-fulltext.log"

log() { echo "[$(date -Iseconds)] $*" | tee -a "$LOG"; }

# Years to process (smallest first to free space gradually)
YEARS="1991 1995 2000 2002 2005 2006 2007 2008 2009 2010 2011 2012 2013 2014 2015 2016 2017 2018 2019 2020 2021 2022 2023 2024 2025 2026"

for YEAR in $YEARS; do
  # Map year to partition name
  if [ "$YEAR" -lt 2005 ]; then
    PART="edrsr_fulltext_p_pre2005"
  elif [ "$YEAR" -gt 2026 ]; then
    PART="edrsr_fulltext_p_future"
  else
    PART="edrsr_fulltext_p_${YEAR}"
  fi

  # Count rows for this year
  CNT=$(psql "$DB" -Atc "SELECT COUNT(*) FROM edrsr_fulltext_p_default WHERE adj_year = $YEAR;")
  if [ "$CNT" -eq 0 ]; then
    log "Year $YEAR: 0 rows, skipping"
    continue
  fi

  log "Year $YEAR: $CNT rows → $PART (batch=$BATCH)"
  MOVED=0
  START=$(date +%s)

  while true; do
    # Move batch: INSERT into target partition, DELETE from default
    DONE=$(psql "$DB" -Atc "
      WITH moved AS (
        DELETE FROM edrsr_fulltext_p_default
        WHERE ctid IN (
          SELECT ctid FROM edrsr_fulltext_p_default
          WHERE adj_year = $YEAR
          LIMIT $BATCH
        )
        RETURNING doc_id, full_text, text_length, tsv, adj_year, created_at
      )
      INSERT INTO $PART (doc_id, full_text, text_length, tsv, adj_year, created_at)
      SELECT * FROM moved
      ON CONFLICT (doc_id) DO NOTHING;

      SELECT COUNT(*) FROM (
        SELECT 1 FROM edrsr_fulltext_p_default WHERE adj_year = $YEAR LIMIT 1
      ) x;
    ")

    MOVED=$((MOVED + BATCH))
    ELAPSED=$(( $(date +%s) - START ))
    RATE=$( [ "$ELAPSED" -gt 0 ] && echo "$((MOVED / ELAPSED))" || echo "0" )
    REMAINING=$((CNT - MOVED))
    [ "$REMAINING" -lt 0 ] && REMAINING=0

    if [ "$DONE" = "0" ]; then
      log "Year $YEAR: done — $MOVED rows moved in ${ELAPSED}s ($RATE rows/s)"
      break
    fi

    # Progress every 10 batches
    if [ $((MOVED % (BATCH * 10))) -eq 0 ]; then
      log "Year $YEAR: $MOVED / $CNT moved ($RATE rows/s, ~$((REMAINING / (RATE + 1)))s remaining)"
    fi
  done

  # Lightweight VACUUM after each year to reclaim space
  log "Year $YEAR: VACUUM edrsr_fulltext_p_default..."
  psql "$DB" -c "VACUUM edrsr_fulltext_p_default;" 2>&1 | tee -a "$LOG"
  log "Year $YEAR: VACUUM done"
done

log "=== All years done ==="
# Final disk reclaim
log "Running VACUUM FULL on edrsr_fulltext_p_default (this locks the table)..."
psql "$DB" -c "VACUUM FULL edrsr_fulltext_p_default;" 2>&1 | tee -a "$LOG"
log "=== Repartitioning complete ==="
