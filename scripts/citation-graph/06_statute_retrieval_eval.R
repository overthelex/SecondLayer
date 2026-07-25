#!/usr/bin/env Rscript
# Full-graph statute retrieval evaluation.
# Uses the complete bipartite graph (cases → articles) to measure
# how well graph-based methods predict which articles a case cites.
#
# Protocol: leave-one-out per case — mask each cited article in turn,
# use remaining citations + graph structure to predict the masked one.
#
# Methods evaluated:
#   1. Common Neighbors (co-citation frequency)
#   2. Adamic-Adar (weighted by inverse log-degree)
#   3. Community membership (Louvain/Leiden prior)
#   4. Degree-weighted baseline (popularity)
#
# Input:  law_court_citations via PostgreSQL (or exported CSVs)
# Output: per-article retrieval metrics, difficulty taxonomy, temporal curves
#
# Usage:
#   Rscript 06_statute_retrieval_eval.R
#   Rscript 06_statute_retrieval_eval.R --source db --year 2024
#   Rscript 06_statute_retrieval_eval.R --source csv --datadir /tmp/citation-analysis
#
# Dependencies: data.table, Matrix, igraph, DBI, RPostgres, arrow, parallel

library(data.table)
library(Matrix)
library(igraph)
library(parallel)

# ── CLI args ────────────��─────────────────────────────────────────
args <- commandArgs(trailingOnly = TRUE)
parse_arg <- function(flag, default) {
  idx <- match(flag, args)
  if (!is.na(idx) && idx < length(args)) args[idx + 1] else default
}

SOURCE   <- parse_arg("--source", "csv")       # "db" or "csv"
DATADIR  <- parse_arg("--datadir", Sys.getenv("DATADIR", "/tmp/citation-analysis"))
YEAR     <- as.integer(parse_arg("--year", 0)) # 0 = all years
OUTDIR   <- parse_arg("--outdir", file.path(DATADIR, "retrieval-eval"))
K_VALUES <- c(1, 3, 5, 10, 20)
NCORES   <- min(8L, parallel::detectCores())
MIN_CITATIONS_PER_CASE <- 3L   # cases with fewer citations are trivial
MAX_ARTICLES_PER_CASE  <- 200L
MIN_ARTICLE_FREQ       <- as.integer(parse_arg("--min-freq", 50))  # articles cited less are noise

dir.create(OUTDIR, recursive = TRUE, showWarnings = FALSE)

cat("=== Statute Retrieval Evaluation (Full Graph) ===\n")
cat(sprintf("Source:     %s\n", SOURCE))
cat(sprintf("Data dir:   %s\n", DATADIR))
cat(sprintf("Year:       %s\n", if (YEAR == 0) "ALL" else as.character(YEAR)))
cat(sprintf("Output:     %s\n", OUTDIR))
cat(sprintf("K values:   %s\n", paste(K_VALUES, collapse = ", ")))
cat(sprintf("Cores:      %d\n\n", NCORES))

# ── 1. Load bipartite data ─��──────────────────────────────────────

load_from_csv <- function() {
  if (YEAR > 0) {
    f <- file.path(DATADIR, sprintf("map_year_%d.csv", YEAR))
    if (!file.exists(f)) {
      # try period-based files
      f <- list.files(DATADIR, pattern = "^map_p[0-9]+\\.csv$", full.names = TRUE)
      dt <- rbindlist(lapply(f, fread, colClasses = c("integer64", "character", "character")))
    } else {
      dt <- fread(f, colClasses = c("integer64", "character", "character"))
    }
  } else {
    f <- list.files(DATADIR, pattern = "^map_p[0-9]+\\.csv$", full.names = TRUE)
    if (length(f) == 0) f <- list.files(DATADIR, pattern = "^map_year_", full.names = TRUE)
    stopifnot(length(f) > 0)
    dt <- rbindlist(lapply(f, fread, colClasses = c("integer64", "character", "character")))
  }
  setnames(dt, c("court_case_id", "law_number", "law_article"))
  dt
}

load_from_db <- function() {
  library(DBI)
  library(RPostgres)
  dsn <- Sys.getenv("DATABASE_URL", "postgresql://secondlayer:local_db_password@localhost:5432/secondlayer_prod")
  con <- dbConnect(RPostgres::Postgres(), dsn = dsn)
  on.exit(dbDisconnect(con))

  year_filter <- if (YEAR > 0) sprintf("AND court_case_id IN (SELECT doc_id FROM edrsr_fulltext_p_%d)", YEAR) else ""

  q <- sprintf("
    SELECT court_case_id, law_number, law_article
    FROM law_court_citations
    WHERE citation_type = 'codex_article'
    %s
  ", year_filter)

  dt <- as.data.table(dbGetQuery(con, q))
  dt
}

cat("[1/6] Loading citation data...\n")
t0 <- proc.time()

dt <- if (SOURCE == "db") load_from_db() else load_from_csv()

# Normalize law_number (merge abbreviation variants)
LAW_NORM <- c(
  "КУпАП" = "Кодекс України про адміністративні правопорушення",
  "КупАП" = "Кодекс України про адміністративні правопорушення",
  "КУПАП" = "Кодекс України про адміністративні правопорушення",
  "КУпАп" = "Кодекс України про адміністративні правопорушення",
  "КЗпП"  = "Кодекс законів про працю України"
)
dt[law_number %in% names(LAW_NORM), law_number := LAW_NORM[law_number]]

# Filter: keep only clean article numbers (e.g. "625", "1056-1", "173-2")
dt <- dt[grepl("^[0-9]+(-[0-9]+)?$", law_article)]

dt[, article_key := paste0(law_number, "|", law_article)]
dt <- unique(dt, by = c("court_case_id", "article_key"))  # deduplicate

n_raw_articles <- uniqueN(dt$article_key)

# Pre-filter: keep only articles with sufficient frequency, cap at MAX_ARTICLES
MAX_ARTICLES <- 5000L  # cap to prevent OOM on dense matrix (5000² × 8B = 200MB)
article_freq <- dt[, .N, by = article_key]
keep_arts <- article_freq[N >= MIN_ARTICLE_FREQ]
if (nrow(keep_arts) > MAX_ARTICLES) {
  setorder(keep_arts, -N)
  keep_arts <- keep_arts[1:MAX_ARTICLES]$article_key
  cat(sprintf("   Capped to top %d articles by frequency\n", MAX_ARTICLES))
} else {
  keep_arts <- keep_arts$article_key
}
dt <- dt[article_key %in% keep_arts]

n_cases <- uniqueN(dt$court_case_id)
n_articles <- uniqueN(dt$article_key)
cat(sprintf("   Loaded: %s citations, %s cases, %s raw articles → %s after freq filter (>=%d) (%.1fs)\n",
            format(nrow(dt), big.mark = ","),
            format(n_cases, big.mark = ","),
            format(n_raw_articles, big.mark = ","),
            format(n_articles, big.mark = ","),
            MIN_ARTICLE_FREQ,
            (proc.time() - t0)[3]))

# ── 2. Build sparse incidence matrix ─────────────────────────────

cat("[2/6] Building sparse case×article matrix...\n")
t0 <- proc.time()

# Filter cases with too few or too many citations
case_counts <- dt[, .N, by = court_case_id]
valid_cases <- case_counts[N >= MIN_CITATIONS_PER_CASE & N <= MAX_ARTICLES_PER_CASE]$court_case_id
dt_eval <- dt[court_case_id %in% valid_cases]

cat(sprintf("   Evaluation subset: %s cases (>=%d and <=%d citations)\n",
            format(uniqueN(dt_eval$court_case_id), big.mark = ","),
            MIN_CITATIONS_PER_CASE, MAX_ARTICLES_PER_CASE))

# Index mappings
articles_all <- sort(unique(dt$article_key))
article_idx <- setNames(seq_along(articles_all), articles_all)
n_art <- length(articles_all)

cases_eval <- sort(unique(dt_eval$court_case_id))
case_idx <- setNames(seq_along(cases_eval), as.character(cases_eval))
n_cas <- length(cases_eval)

# Sparse binary matrix M[case, article]
dt_eval[, ci := case_idx[as.character(court_case_id)]]
dt_eval[, ai := article_idx[article_key]]

M <- sparseMatrix(
  i = dt_eval$ci,
  j = dt_eval$ai,
  x = 1,
  dims = c(n_cas, n_art),
  dimnames = list(as.character(cases_eval), articles_all)
)

cat(sprintf("   Matrix: %d × %d, %s non-zeros (%.1fs)\n",
            nrow(M), ncol(M), format(nnzero(M), big.mark = ","),
            (proc.time() - t0)[3]))

# ���─ 3. Compute co-citation matrix (article × article) ────────────

cat("[3/6] Computing co-citation matrix (A^T × A)...\n")
t0 <- proc.time()

# Co-citation from eval matrix: C = M^T %*% M (article × article)
# With freq-filtered articles (~5K), this is a small dense-ish matrix
C <- crossprod(M)
diag(C) <- 0  # remove self-loops

# Article degree (number of cases citing each article)
article_degree <- diff(M@p)  # CSC column counts
names(article_degree) <- articles_all

cat(sprintf("   Co-citation matrix: %d × %d, %s non-zero pairs (%.1fs)\n",
            nrow(C), ncol(C), format(nnzero(C) / 2, big.mark = ","),
            (proc.time() - t0)[3]))

rm(dt, dt_eval)  # free RAM
gc(verbose = FALSE)

# ── 4. Retrieval scoring functions ────���──────────────────────────

# For a given case with cited articles S, mask one article t:
# Score all candidate articles by how likely they are given S \ {t}

# ── 4. Leave-one-out evaluation (vectorized) ─────────────────────
#
# For each case with articles {a1, a2, ..., an}, we mask each ai and
# score how well the remaining {a1,...,ai-1,ai+1,...,an} predict ai.
#
# Common Neighbors score for target t given seed S:
#   CN(t) = sum_{s in S} C[s, t]
#
# Full-case score (no masking) = sum of column t across all cited rows:
#   full_score[t] = M[case,] %*% C[,t] = row of (M %*% C)
#
# Leave-one-out: CN_loo(t) = full_score[t] - C[t,t] = full_score[t]
#   (since diag(C)=0, self-contribution is already excluded)
#   BUT we must subtract the seed→target contribution: C[t, s] for each s
#   Actually CN(t|S=all\t) = sum_{s!=t} C[s,t] = colSum(C[cited,t]) - C[t,t]
#   Since diag=0: = colSum(C[cited, t]) which equals (M[case,] %*% C)[t]
#   So full_score already gives the LOO score for CN!
#
# Key insight: MC = M %*% C gives full CN scores for ALL cases at once.
# MC[i, j] = score of article j for case i (using ALL its citations as seed).
# Since diag(C)=0, this is already leave-one-out for the target itself.

# Precompute Adamic-Adar weighted co-citation matrix
aa_weights <- 1 / pmax(log(article_degree), 1)
C_aa <- C %*% Diagonal(x = aa_weights)

cat("[4/6] Leave-one-out evaluation (per-case scoring)...\n")
t0 <- proc.time()

# Sample cases if too many
MAX_EVAL_CASES <- 200000L
if (n_cas > MAX_EVAL_CASES) {
  set.seed(42)
  eval_sample <- sort(sample.int(n_cas, MAX_EVAL_CASES))
  cat(sprintf("   Sampled %d cases for evaluation (from %d)\n", MAX_EVAL_CASES, n_cas))
} else {
  eval_sample <- seq_len(n_cas)
}

n_eval <- length(eval_sample)
avg_cited <- nnzero(M) / n_cas
cat(sprintf("   %d cases × avg %.1f articles ≈ %s predictions\n",
            n_eval, avg_cited, format(as.integer(n_eval * avg_cited), big.mark = ",")))

# Process in chunks
CHUNK <- 5000L
results_list <- vector("list", ceiling(n_eval / CHUNK))

C_dense <- as.matrix(C)         # 3671×3671 ≈ 100MB — fits in RAM
C_aa_dense <- as.matrix(C_aa)

# Convert M to dgRMatrix (CSR) for efficient row access
Mr <- as(M, "RsparseMatrix")

for (ch in seq_along(results_list)) {
  ch_start <- (ch - 1L) * CHUNK + 1L
  ch_end <- min(ch * CHUNK, n_eval)
  ch_idx <- eval_sample[ch_start:ch_end]

  chunk_results <- vector("list", length(ch_idx))

  for (local_i in seq_along(ch_idx)) {
    ci <- ch_idx[local_i]
    cited <- Mr@j[seq(Mr@p[ci] + 1L, Mr@p[ci + 1L])] + 1L  # CSR row → column indices
    n_cited <- length(cited)
    if (n_cited < MIN_CITATIONS_PER_CASE) next

    # CN: sum rows of C for cited articles (diag=0 → already LOO)
    cn_scores <- colSums(C_dense[cited, , drop = FALSE])
    aa_scores <- colSums(C_aa_dense[cited, , drop = FALSE])

    # Rank target among non-seed candidates
    ranks_cn <- integer(n_cited)
    ranks_aa <- integer(n_cited)
    ranks_dg <- integer(n_cited)

    for (j in seq_along(cited)) {
      t <- cited[j]
      # CN LOO: subtract C[t, ] from full score (removes target's own contribution)
      cn_t <- cn_scores[t] - C_dense[t, t]  # diag=0, so cn_t = cn_scores[t]
      aa_t <- aa_scores[t] - C_aa_dense[t, t]

      # Count how many non-seed articles score higher (rank = 1 is best)
      ranks_cn[j] <- sum(cn_scores[-cited] >= cn_t) + 1L
      ranks_aa[j] <- sum(aa_scores[-cited] >= aa_t) + 1L
      ranks_dg[j] <- sum(article_degree[-cited] >= article_degree[t]) + 1L
    }

    chunk_results[[local_i]] <- data.table(
      target_article = articles_all[cited],
      target_degree  = article_degree[cited],
      n_seed         = n_cited - 1L,
      rank_cn        = ranks_cn,
      rank_aa        = ranks_aa,
      rank_dg        = ranks_dg
    )
  }

  results_list[[ch]] <- rbindlist(chunk_results[!sapply(chunk_results, is.null)])

  if (ch %% 5 == 0 || ch == length(results_list)) {
    elapsed <- (proc.time() - t0)[3]
    rate <- ch_end / elapsed
    eta <- (n_eval - ch_end) / rate
    cat(sprintf("   %d/%d cases (%.0f cases/s, ETA %.0fs)\n", ch_end, n_eval, rate, eta))
  }
}

results <- rbindlist(results_list)
cat(sprintf("   Computed %s predictions from %s cases (%.1fs)\n",
            format(nrow(results), big.mark = ","),
            format(n_eval, big.mark = ","),
            (proc.time() - t0)[3]))

# ── 6. Compute metrics ─────────��─────────────────────────────────

cat("[5/6] Computing retrieval metrics...\n")

# Hit@k: fraction of predictions where target is in top-k
compute_hits <- function(ranks, k) mean(ranks <= k, na.rm = TRUE)

# MRR: mean reciprocal rank
compute_mrr <- function(ranks) mean(1 / ranks, na.rm = TRUE)

# Aggregate metrics
metrics <- data.table(
  method = rep(c("CommonNeighbors", "AdamicAdar", "DegreeBaseline"), each = length(K_VALUES) + 1),
  metric = rep(c(paste0("Hit@", K_VALUES), "MRR"), 3),
  value  = c(
    sapply(K_VALUES, function(k) compute_hits(results$rank_cn, k)),
    compute_mrr(results$rank_cn),
    sapply(K_VALUES, function(k) compute_hits(results$rank_aa, k)),
    compute_mrr(results$rank_aa),
    sapply(K_VALUES, function(k) compute_hits(results$rank_dg, k)),
    compute_mrr(results$rank_dg)
  )
)

cat("\n── Retrieval Results (Full Graph) ──────────────────────\n")
cat(sprintf("   Evaluation: %s predictions from %s cases over %s articles\n",
            format(nrow(results), big.mark = ","),
            format(length(eval_sample), big.mark = ","),
            format(n_art, big.mark = ",")))
cat("\n")
print(dcast(metrics, metric ~ method, value.var = "value"), digits = 4)

# ── 7. Difficulty stratification ─────────────────────────────────

cat("\n[6/6] Stratifying by difficulty...\n")

# Bin articles by degree (popularity)
results[, degree_bin := cut(target_degree,
  breaks = c(0, 100, 1000, 10000, 100000, Inf),
  labels = c("rare(<100)", "low(100-1K)", "mid(1K-10K)", "high(10K-100K)", "hub(>100K)")
)]

# Per-bin metrics
difficulty_metrics <- results[, .(
  n_predictions = .N,
  n_articles    = uniqueN(target_article),
  hit1_cn       = mean(rank_cn <= 1),
  hit5_cn       = mean(rank_cn <= 5),
  hit10_cn      = mean(rank_cn <= 10),
  mrr_cn        = mean(1 / rank_cn),
  hit1_aa       = mean(rank_aa <= 1),
  hit5_aa       = mean(rank_aa <= 5),
  hit10_aa      = mean(rank_aa <= 10),
  mrr_aa        = mean(1 / rank_aa),
  hit1_dg       = mean(rank_dg <= 1),
  hit5_dg       = mean(rank_dg <= 5),
  mrr_dg        = mean(1 / rank_dg)
), by = degree_bin]

cat("\n── Difficulty Stratification ───────────────────────────\n")
print(difficulty_metrics, digits = 4)

# ── 8. Save outputs ──────────────────────────────────────────────

cat("\nSaving results...\n")

# Summary metrics
fwrite(metrics, file.path(OUTDIR, "retrieval_metrics.csv"))
fwrite(difficulty_metrics, file.path(OUTDIR, "difficulty_stratification.csv"))

# Per-article aggregated performance (for HF dataset)
article_perf <- results[, .(
  n_predictions = .N,
  degree        = target_degree[1],
  mean_rank_cn  = mean(rank_cn),
  mean_rank_aa  = mean(rank_aa),
  hit5_cn       = mean(rank_cn <= 5),
  hit5_aa       = mean(rank_aa <= 5),
  mrr_cn        = mean(1 / rank_cn),
  mrr_aa        = mean(1 / rank_aa)
), by = target_article]

article_perf[, c("law_number", "law_article") := tstrsplit(target_article, "\\|", fixed = FALSE)]
setorder(article_perf, mean_rank_aa)

fwrite(article_perf, file.path(OUTDIR, "article_retrieval_performance.csv"))

# Full raw results (large, optional)
if (nrow(results) <= 10e6) {
  fwrite(results, file.path(OUTDIR, "raw_predictions.csv.gz"))
}

# Parquet for HF upload
if (requireNamespace("arrow", quietly = TRUE)) {
  arrow::write_parquet(article_perf, file.path(OUTDIR, "article_retrieval_performance.parquet"))
  cat("   Wrote parquet for HuggingFace upload\n")
}

cat(sprintf("\n=== Done. Results in %s ===\n", OUTDIR))
cat(sprintf("   Total articles evaluated: %d\n", uniqueN(results$target_article)))
cat(sprintf("   Total predictions: %s\n", format(nrow(results), big.mark = ",")))
cat(sprintf("   Best method: %s (MRR = %.4f)\n",
            metrics[metric == "MRR"][which.max(value)]$method,
            max(metrics[metric == "MRR"]$value)))
