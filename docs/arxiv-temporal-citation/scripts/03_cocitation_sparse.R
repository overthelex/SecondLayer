#!/usr/bin/env Rscript
# Compute temporal cocitation using sparse matrix multiplication
# M^T %*% M gives cocitation counts for all article pairs
# Runs all 5 periods in parallel using mclapply
# Uses top-N articles per period to keep matrices manageable

library(data.table)
library(Matrix)
library(parallel)

DATADIR <- "/tmp/citation-analysis"
NCORES <- 5L
TOP_N <- 5000L  # top articles per period (controls matrix size)

compute_cocitation <- function(period) {
  cat(sprintf("[P%d] Loading CSV...\n", period))
  t0 <- proc.time()

  dt <- fread(file.path(DATADIR, sprintf("map_p%d.csv", period)),
              colClasses = c("integer64", "character", "character"))

  cat(sprintf("[P%d] %d tuples loaded in %.1fs\n", period, nrow(dt), (proc.time() - t0)[3]))

  dt[, article_key := paste0(law_number, "|", law_article)]

  # Keep top-N most-cited articles (by unique decisions)
  article_counts <- dt[, .(n = uniqueN(court_case_id)), by = article_key]
  setorder(article_counts, -n)
  top_articles <- article_counts[1:min(TOP_N, .N)]$article_key
  dt <- dt[article_key %in% top_articles]

  cat(sprintf("[P%d] After top-%d filter: %d tuples, %d cases\n",
              period, TOP_N, nrow(dt), uniqueN(dt$court_case_id)))

  # Encode as integer indices
  case_ids <- unique(dt$court_case_id)
  article_ids <- unique(dt$article_key)
  dt[, case_idx := match(court_case_id, case_ids)]
  dt[, art_idx := match(article_key, article_ids)]

  # Build sparse binary matrix: cases × articles
  M <- sparseMatrix(
    i = dt$case_idx, j = dt$art_idx, x = 1,
    dims = c(length(case_ids), length(article_ids)),
    dimnames = list(NULL, article_ids)
  )

  # Cocitation = M^T %*% M
  cat(sprintf("[P%d] crossprod on %d × %d matrix...\n",
              period, length(case_ids), length(article_ids)))
  t1 <- proc.time()
  cocit <- crossprod(M)
  cat(sprintf("[P%d] crossprod done in %.1fs (nnz=%d)\n",
              period, (proc.time() - t1)[3], nnzero(cocit)))

  # Extract upper triangle, filter weight >= 10
  cocit_tri <- triu(cocit, k = 1)
  cocit_t <- as(cocit_tri, "TsparseMatrix")

  edges <- data.table(
    law_a = article_ids[cocit_t@i + 1L],
    law_b = article_ids[cocit_t@j + 1L],
    weight = as.integer(cocit_t@x)
  )
  edges <- edges[weight >= 10]

  # Split article keys
  edges[, c("law_a_name", "art_a") := tstrsplit(law_a, "|", fixed = TRUE)]
  edges[, c("law_b_name", "art_b") := tstrsplit(law_b, "|", fixed = TRUE)]
  edges[, period := period]

  result <- edges[, .(law_a = law_a_name, art_a, law_b = law_b_name, art_b, period, weight)]

  outfile <- file.path(DATADIR, sprintf("cocitation_p%d.csv", period))
  fwrite(result, outfile)

  cat(sprintf("[P%d] Done: %d edges (%.1fs total)\n",
              period, nrow(result), (proc.time() - t0)[3]))

  return(list(period = period, edges = nrow(result), time = (proc.time() - t0)[3]))
}

# Run all 5 periods in parallel
cat(sprintf("Starting cocitation computation on %d cores...\n", NCORES))
cat(sprintf("RAM available: %.1f GB\n", as.numeric(system("free -g | awk '/Mem:/{print $7}'", intern = TRUE))))

t_total <- proc.time()
results <- mclapply(1:5, compute_cocitation, mc.cores = NCORES)
cat(sprintf("\n=== All periods done in %.1fs ===\n", (proc.time() - t_total)[3]))

for (r in results) {
  if (!is.null(r$period)) {
    cat(sprintf("  Period %d: %d edges (%.0fs)\n", r$period, r$edges, r$time))
  } else {
    cat(sprintf("  ERROR: %s\n", as.character(r)))
  }
}
