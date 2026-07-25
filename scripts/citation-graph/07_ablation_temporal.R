#!/usr/bin/env Rscript
# Ablation experiments for temporal decay paper.
#
# Experiment 1: FIXED-ARTICLE ABLATION
#   Compare MRR on the SAME set of articles across years.
#   If decay persists on fixed articles → true temporal decay.
#   If decay disappears → compositional shift (new articles dilute performance).
#
# Experiment 2: TEMPORAL TRAIN/TEST SPLIT
#   Build co-citation matrix C from first 50% of cases (by doc_id as proxy for time).
#   Evaluate on second 50%.
#   Removes data leakage: predictor never sees eval data.
#
# Output: ablation_fixed_article.csv, ablation_train_test_split.csv
#
# Usage:
#   Rscript 07_ablation_temporal.R --datadir /tmp/citation-years --outdir /tmp/citation-analysis/ablation

library(data.table)
library(Matrix)

args <- commandArgs(trailingOnly = TRUE)
parse_arg <- function(flag, default) {
  idx <- match(flag, args)
  if (!is.na(idx) && idx < length(args)) args[idx + 1] else default
}

DATADIR  <- parse_arg("--datadir", "/tmp/citation-years")
OUTDIR   <- parse_arg("--outdir", "/tmp/citation-analysis/ablation")
MIN_FREQ <- as.integer(parse_arg("--min-freq", 50))
MAX_ARTICLES <- 5000L
MAX_EVAL_CASES <- 100000L
MIN_CITATIONS_PER_CASE <- 3L
MAX_ARTICLES_PER_CASE <- 200L

dir.create(OUTDIR, recursive = TRUE, showWarnings = FALSE)

# ── Helper: load and clean one year ──────────────────────────────

load_year <- function(y) {
  f <- file.path(DATADIR, sprintf("map_year_%d.csv", y))
  if (!file.exists(f)) return(NULL)
  dt <- fread(f, colClasses = c("integer64", "character", "character"))
  setnames(dt, c("court_case_id", "law_number", "law_article"))

  LAW_NORM <- c(
    "КУпАП" = "Кодекс України про адміністративні правопорушення",
    "КупАП" = "Кодекс України про адміністративні правопорушення",
    "КУПАП" = "Кодекс України про адміністративні правопорушення",
    "КУпАп" = "Кодекс України про адміністративні правопорушення",
    "КЗпП"  = "Кодекс законів про працю України"
  )
  dt[law_number %in% names(LAW_NORM), law_number := LAW_NORM[law_number]]
  dt <- dt[grepl("^[0-9]+(-[0-9]+)?$", law_article)]
  dt[, article_key := paste0(law_number, "|", law_article)]
  dt <- unique(dt, by = c("court_case_id", "article_key"))
  dt
}

# ── Helper: evaluate retrieval on given data with given C matrix ──

evaluate_with_C <- function(M_eval, C_dense, article_degree, articles_all) {
  n_cas <- nrow(M_eval)
  n_art <- ncol(M_eval)

  if (n_cas > MAX_EVAL_CASES) {
    set.seed(42)
    eval_sample <- sort(sample.int(n_cas, MAX_EVAL_CASES))
  } else {
    eval_sample <- seq_len(n_cas)
  }

  Mr <- as(M_eval, "RsparseMatrix")

  # AA weights
  aa_weights <- 1 / pmax(log(article_degree), 1)
  C_aa_dense <- sweep(C_dense, 2, aa_weights, "*")

  results_list <- vector("list", length(eval_sample))

  for (idx in seq_along(eval_sample)) {
    ci <- eval_sample[idx]
    cited <- Mr@j[seq(Mr@p[ci] + 1L, Mr@p[ci + 1L])] + 1L
    n_cited <- length(cited)
    if (n_cited < MIN_CITATIONS_PER_CASE) next

    cn_scores <- colSums(C_dense[cited, , drop = FALSE])
    aa_scores <- colSums(C_aa_dense[cited, , drop = FALSE])

    ranks_cn <- integer(n_cited)
    ranks_aa <- integer(n_cited)

    for (j in seq_along(cited)) {
      t <- cited[j]
      ranks_cn[j] <- sum(cn_scores[-cited] >= cn_scores[t]) + 1L
      ranks_aa[j] <- sum(aa_scores[-cited] >= aa_scores[t]) + 1L
    }

    results_list[[idx]] <- data.table(
      target_article = articles_all[cited],
      target_degree  = article_degree[cited],
      rank_cn = ranks_cn,
      rank_aa = ranks_aa
    )
  }

  results <- rbindlist(results_list[!sapply(results_list, is.null)])

  data.table(
    n_predictions = nrow(results),
    n_cases = length(eval_sample),
    mrr_aa = mean(1 / results$rank_aa),
    mrr_cn = mean(1 / results$rank_cn),
    hit10_aa = mean(results$rank_aa <= 10),
    hit10_cn = mean(results$rank_cn <= 10)
  )
}

# ══════════════════════════════════════════════════════════════════
# EXPERIMENT 1: FIXED-ARTICLE ABLATION
# ══════════════════════════════════════════════════════════════════

cat("═══ EXPERIMENT 1: Fixed-Article Ablation ═══\n\n")

# Find articles present in BOTH 2012 (peak) and 2024 (recent)
cat("Loading reference years (2012, 2024)...\n")
dt2012 <- load_year(2012)
dt2024 <- load_year(2024)

freq2012 <- dt2012[, .N, by = article_key][N >= MIN_FREQ]
freq2024 <- dt2024[, .N, by = article_key][N >= MIN_FREQ]

# Intersection: articles with >= MIN_FREQ in BOTH years
shared_articles <- intersect(freq2012$article_key, freq2024$article_key)
if (length(shared_articles) > MAX_ARTICLES) {
  # Keep top MAX_ARTICLES by combined frequency
  combined_freq <- merge(freq2012, freq2024, by = "article_key", suffixes = c("_12", "_24"))
  combined_freq[, total := N_12 + N_24]
  setorder(combined_freq, -total)
  shared_articles <- combined_freq[1:MAX_ARTICLES]$article_key
}
cat(sprintf("Shared articles (freq>=%d in both 2012 & 2024): %d\n", MIN_FREQ, length(shared_articles)))

rm(dt2012, dt2024, freq2012, freq2024)
gc(verbose = FALSE)

# Evaluate on multiple years using ONLY shared articles
years_to_eval <- c(2008, 2010, 2012, 2014, 2016, 2018, 2020, 2022, 2024)
fixed_results <- vector("list", length(years_to_eval))

for (i in seq_along(years_to_eval)) {
  y <- years_to_eval[i]
  cat(sprintf("\n[%d/%d] Year %d (fixed articles)...\n", i, length(years_to_eval), y))
  t0 <- proc.time()

  dt <- load_year(y)
  dt <- dt[article_key %in% shared_articles]

  # Build matrix
  articles_all <- sort(shared_articles)
  article_idx <- setNames(seq_along(articles_all), articles_all)
  n_art <- length(articles_all)

  case_counts <- dt[, .N, by = court_case_id]
  valid_cases <- case_counts[N >= MIN_CITATIONS_PER_CASE & N <= MAX_ARTICLES_PER_CASE]$court_case_id
  dt_eval <- dt[court_case_id %in% valid_cases]

  cases_eval <- sort(unique(dt_eval$court_case_id))
  case_idx <- setNames(seq_along(cases_eval), as.character(cases_eval))

  dt_eval[, ci := case_idx[as.character(court_case_id)]]
  dt_eval[, ai := article_idx[article_key]]

  M <- sparseMatrix(i = dt_eval$ci, j = dt_eval$ai, x = 1,
                    dims = c(length(cases_eval), n_art))

  C <- crossprod(M)
  diag(C) <- 0
  C_dense <- as.matrix(C)
  article_degree <- diff(M@p)
  names(article_degree) <- articles_all

  res <- evaluate_with_C(M, C_dense, article_degree, articles_all)
  res[, year := y]
  fixed_results[[i]] <- res

  elapsed <- (proc.time() - t0)[3]
  cat(sprintf("   MRR(AA)=%.4f, Hit@10=%.4f, %d predictions (%.0fs)\n",
              res$mrr_aa, res$hit10_aa, res$n_predictions, elapsed))

  rm(dt, dt_eval, M, C, C_dense)
  gc(verbose = FALSE)
}

fixed_dt <- rbindlist(fixed_results)
fwrite(fixed_dt, file.path(OUTDIR, "ablation_fixed_article.csv"))
cat("\n── Fixed-Article Results ──\n")
print(fixed_dt[, .(year, mrr_aa, hit10_aa, n_predictions)])

# ══════════════════════════════════════════════════════════════════
# EXPERIMENT 2: TEMPORAL TRAIN/TEST SPLIT
# ══════════════════════════════════════════════════════════════════

cat("\n\n═══ EXPERIMENT 2: Train/Test Temporal Split ═══\n\n")
cat("Protocol: C built from first 50% cases (by ID), eval on second 50%.\n")
cat("This removes data leakage: predictor never sees eval data.\n\n")

split_results <- vector("list", length(years_to_eval))

for (i in seq_along(years_to_eval)) {
  y <- years_to_eval[i]
  cat(sprintf("\n[%d/%d] Year %d (train/test split)...\n", i, length(years_to_eval), y))
  t0 <- proc.time()

  dt <- load_year(y)

  # Frequency filter
  article_freq <- dt[, .N, by = article_key]
  keep_arts <- article_freq[N >= MIN_FREQ]
  if (nrow(keep_arts) > MAX_ARTICLES) {
    setorder(keep_arts, -N)
    keep_arts <- keep_arts[1:MAX_ARTICLES]$article_key
  } else {
    keep_arts <- keep_arts$article_key
  }
  dt <- dt[article_key %in% keep_arts]

  # Split by case_id median (proxy for temporal order within year)
  all_cases <- sort(unique(dt$court_case_id))
  mid <- length(all_cases) %/% 2
  train_cases <- all_cases[1:mid]
  test_cases <- all_cases[(mid+1):length(all_cases)]

  dt_train <- dt[court_case_id %in% train_cases]
  dt_test <- dt[court_case_id %in% test_cases]

  # Article index (shared vocabulary)
  articles_all <- sort(unique(dt$article_key))
  article_idx <- setNames(seq_along(articles_all), articles_all)
  n_art <- length(articles_all)

  # Build C from TRAIN only
  train_case_idx <- setNames(seq_along(train_cases), as.character(train_cases))
  dt_train[, ci := train_case_idx[as.character(court_case_id)]]
  dt_train[, ai := article_idx[article_key]]

  M_train <- sparseMatrix(i = dt_train$ci, j = dt_train$ai, x = 1,
                          dims = c(length(train_cases), n_art))
  C_train <- crossprod(M_train)
  diag(C_train) <- 0
  C_dense <- as.matrix(C_train)
  article_degree <- diff(M_train@p)
  names(article_degree) <- articles_all

  # Build M_test for evaluation
  test_case_counts <- dt_test[, .N, by = court_case_id]
  valid_test <- test_case_counts[N >= MIN_CITATIONS_PER_CASE & N <= MAX_ARTICLES_PER_CASE]$court_case_id
  dt_test <- dt_test[court_case_id %in% valid_test]

  test_cases_eval <- sort(unique(dt_test$court_case_id))
  test_case_idx <- setNames(seq_along(test_cases_eval), as.character(test_cases_eval))
  dt_test[, ci := test_case_idx[as.character(court_case_id)]]
  dt_test[, ai := article_idx[article_key]]

  M_test <- sparseMatrix(i = dt_test$ci, j = dt_test$ai, x = 1,
                         dims = c(length(test_cases_eval), n_art))

  # Evaluate test cases using train-derived C
  res <- evaluate_with_C(M_test, C_dense, article_degree, articles_all)
  res[, year := y]
  split_results[[i]] <- res

  elapsed <- (proc.time() - t0)[3]
  cat(sprintf("   MRR(AA)=%.4f, Hit@10=%.4f, %d predictions (%.0fs)\n",
              res$mrr_aa, res$hit10_aa, res$n_predictions, elapsed))

  rm(dt, dt_train, dt_test, M_train, M_test, C_train, C_dense)
  gc(verbose = FALSE)
}

split_dt <- rbindlist(split_results)
fwrite(split_dt, file.path(OUTDIR, "ablation_train_test_split.csv"))
cat("\n── Train/Test Split Results ──\n")
print(split_dt[, .(year, mrr_aa, hit10_aa, n_predictions)])

# ── Summary comparison ───────────────────────────────────────────

cat("\n\n═══ SUMMARY ═══\n")
cat("Comparing: Original (full C) vs Fixed-Article vs Train/Test Split\n\n")

# Load original results for comparison
orig_results <- rbindlist(lapply(years_to_eval, function(y) {
  f <- file.path("/tmp/citation-analysis/temporal-eval", sprintf("year_%d", y), "retrieval_metrics.csv")
  if (!file.exists(f)) return(NULL)
  m <- fread(f)
  m[method == "AdamicAdar" & metric == "MRR", .(year = y, mrr_original = value)]
}))

comparison <- merge(orig_results, fixed_dt[, .(year, mrr_fixed = mrr_aa)], by = "year")
comparison <- merge(comparison, split_dt[, .(year, mrr_split = mrr_aa)], by = "year")

cat("Year | Original | Fixed-Article | Train/Test Split\n")
cat("-----|----------|---------------|------------------\n")
for (r in seq_len(nrow(comparison))) {
  cat(sprintf("%d |  %.4f  |    %.4f     |     %.4f\n",
              comparison$year[r], comparison$mrr_original[r],
              comparison$mrr_fixed[r], comparison$mrr_split[r]))
}

fwrite(comparison, file.path(OUTDIR, "ablation_comparison.csv"))

# Compute decay rates
decay_orig <- (comparison[year == 2012]$mrr_original - comparison[year == 2024]$mrr_original) / comparison[year == 2012]$mrr_original
decay_fixed <- (comparison[year == 2012]$mrr_fixed - comparison[year == 2024]$mrr_fixed) / comparison[year == 2012]$mrr_fixed
decay_split <- (comparison[year == 2012]$mrr_split - comparison[year == 2024]$mrr_split) / comparison[year == 2012]$mrr_split

cat(sprintf("\nDecay 2012→2024:\n"))
cat(sprintf("  Original:      %.1f%%\n", decay_orig * 100))
cat(sprintf("  Fixed-Article: %.1f%%\n", decay_fixed * 100))
cat(sprintf("  Train/Test:    %.1f%%\n", decay_split * 100))

cat(sprintf("\n=== Done. Results in %s ===\n", OUTDIR))
