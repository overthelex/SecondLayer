#!/usr/bin/env Rscript
# Wrapper: run 06_statute_retrieval_eval.R on each year, collect temporal metrics.
# Designed for SageMaker Processing: input from /opt/ml/processing/input/data/
#                                    output to /opt/ml/processing/output/
#
# Can also run locally with --datadir and --outdir args.

library(data.table)

args <- commandArgs(trailingOnly = TRUE)
parse_arg <- function(flag, default) {
  idx <- match(flag, args)
  if (!is.na(idx) && idx < length(args)) args[idx + 1] else default
}

DATADIR <- parse_arg("--datadir", "/opt/ml/processing/input/data")
OUTDIR  <- parse_arg("--outdir", "/opt/ml/processing/output")
EVAL_SCRIPT <- parse_arg("--script", "/opt/ml/code/eval.R")
NCORES_PER_YEAR <- as.integer(parse_arg("--cores", 4))

dir.create(OUTDIR, recursive = TRUE, showWarnings = FALSE)

# Find all year files
year_files <- list.files(DATADIR, pattern = "^map_year_[0-9]+\\.csv$", full.names = TRUE)
years <- as.integer(gsub(".*map_year_([0-9]+)\\.csv", "\\1", year_files))
years <- sort(years)

cat(sprintf("=== Temporal Statute Retrieval Evaluation ===\n"))
cat(sprintf("Data dir:    %s\n", DATADIR))
cat(sprintf("Output dir:  %s\n", OUTDIR))
cat(sprintf("Years found: %s (%d files)\n", paste(range(years), collapse = "-"), length(years)))
cat(sprintf("Cores/year:  %d\n\n", NCORES_PER_YEAR))

# Run eval for each year sequentially (each year uses internal parallelism)
temporal_results <- vector("list", length(years))

for (i in seq_along(years)) {
  y <- years[i]
  year_outdir <- file.path(OUTDIR, sprintf("year_%d", y))
  dir.create(year_outdir, recursive = TRUE, showWarnings = FALSE)

  cat(sprintf("\n{'='*60}\n[%d/%d] Year %d\n{'='*60}\n", i, length(years), y))
  t0 <- proc.time()

  # Call the eval script as a subprocess
  cmd <- sprintf(
    "Rscript %s --source csv --year %d --datadir %s --outdir %s --min-freq 50",
    EVAL_SCRIPT, y, DATADIR, year_outdir
  )
  ret <- system(cmd, intern = FALSE)

  elapsed <- (proc.time() - t0)[3]
  cat(sprintf("[Year %d] Completed in %.0fs (exit code %d)\n", y, elapsed, ret))

  # Read metrics if successful
  metrics_file <- file.path(year_outdir, "retrieval_metrics.csv")
  if (file.exists(metrics_file)) {
    m <- fread(metrics_file)
    m[, year := y]
    m[, elapsed_sec := elapsed]
    temporal_results[[i]] <- m
  }
}

# Combine temporal results
temporal <- rbindlist(temporal_results[!sapply(temporal_results, is.null)])

if (nrow(temporal) > 0) {
  fwrite(temporal, file.path(OUTDIR, "temporal_metrics.csv"))

  # Summary table
  summary_wide <- dcast(temporal[method == "AdamicAdar"],
                        year ~ metric, value.var = "value")
  fwrite(summary_wide, file.path(OUTDIR, "temporal_summary_aa.csv"))

  cat("\n=== Temporal Summary (Adamic-Adar) ===\n")
  print(summary_wide)
}

cat(sprintf("\n=== Done. Results in %s ===\n", OUTDIR))
