#!/usr/bin/env Rscript
# Sliding-window mitigation experiment for statute retrieval.
#
# Tests whether restricting the co-citation matrix to recent years
# improves retrieval performance compared to using all historical data.
#
# For each evaluation year Y and window size W:
#   1. Build co-citation matrix C from citations in years [Y-W, Y-1]
#   2. Evaluate on year Y using leave-one-out protocol
#   3. Compare MRR across window sizes
#
# Usage:
#   Rscript 07_sliding_window_mitigation.R
#   Rscript 07_sliding_window_mitigation.R --eval-years 2016,2020,2024
#   Rscript 07_sliding_window_mitigation.R --windows 1,3,5,10
#
# Dependencies: data.table, Matrix, DBI, RPostgres, parallel

library(data.table)
library(Matrix)
library(DBI)
library(RPostgres)
library(parallel)

# ── CLI args ────────────────────────────────────────────────────
args <- commandArgs(trailingOnly = TRUE)
parse_arg <- function(flag, default) {
  idx <- match(flag, args)
  if (!is.na(idx) && idx < length(args)) args[idx + 1] else default
}

EVAL_YEARS <- as.integer(strsplit(parse_arg("--eval-years", "2014,2016,2018,2020,2022,2024"), ",")[[1]])
WINDOWS    <- as.integer(strsplit(parse_arg("--windows", "1,3,5,10,0"), ",")[[1]])  # 0 = all history
OUTDIR     <- parse_arg("--outdir", "/home/vovkes/SecondLayer/docs/arxiv-statute-retrieval/ablation")
NCORES     <- min(8L, parallel::detectCores())
MAX_EVAL_CASES   <- 50000L
MIN_CITATIONS    <- 3L
MAX_CITATIONS    <- 200L
MIN_ARTICLE_FREQ <- 50L
MAX_ARTICLES     <- 5000L

dir.create(OUTDIR, recursive = TRUE, showWarnings = FALSE)

cat("=== Sliding-Window Mitigation Experiment ===\n")
cat(sprintf("Eval years: %s\n", paste(EVAL_YEARS, collapse = ", ")))
cat(sprintf("Windows:    %s (0=all)\n", paste(WINDOWS, collapse = ", ")))
cat(sprintf("Output:     %s\n\n", OUTDIR))

# ── DB connection ───────────────────────────────────────────────

con <- dbConnect(RPostgres::Postgres(),
  host     = "localhost",
  port     = 5432,
  dbname   = "secondlayer_local",
  user     = "secondlayer",
  password = "local_dev_password"
)
on.exit(dbDisconnect(con))

# ── Normalization map ───────────────────────────────────────────

LAW_NORM <- c(
  "КУпАП" = "Кодекс України про адміністративні правопорушення",
  "КупАП" = "Кодекс України про адміністративні правопорушення",
  "КУПАП" = "Кодекс України про адміністративні правопорушення",
  "КУпАп" = "Кодекс України про адміністративні правопорушення",
  "КЗпП"  = "Кодекс законів про працю України"
)

# ── Helper: load citations for a year range ─────────────────────
# Uses mv_citations_by_year materialized view for fast year-filtered queries

load_citations <- function(year_from, year_to) {
  q <- sprintf("
    SELECT court_case_id, law_number, law_article
    FROM mv_citations_by_year
    WHERE adj_year BETWEEN %d AND %d
  ", year_from, year_to)
  dt <- as.data.table(dbGetQuery(con, q))
  if (nrow(dt) == 0) return(dt)
  setnames(dt, c("court_case_id", "law_number", "law_article"))
  dt[law_number %in% names(LAW_NORM), law_number := LAW_NORM[law_number]]
  dt[, article_key := paste0(law_number, "|", law_article)]
  unique(dt, by = c("court_case_id", "article_key"))
}

# ── Helper: evaluate one year with a given co-citation matrix ───

evaluate_year <- function(eval_dt, train_dt) {
  # Build article vocabulary from eval data
  eval_arts <- eval_dt[, .N, by = article_key][N >= MIN_ARTICLE_FREQ]
  if (nrow(eval_arts) > MAX_ARTICLES) {
    setorder(eval_arts, -N)
    eval_arts <- eval_arts[1:MAX_ARTICLES]
  }
  keep_arts <- eval_arts$article_key

  eval_dt <- eval_dt[article_key %in% keep_arts]
  train_dt <- train_dt[article_key %in% keep_arts]

  # Filter cases by citation count
  case_counts <- eval_dt[, .N, by = court_case_id]
  valid_cases <- case_counts[N >= MIN_CITATIONS & N <= MAX_CITATIONS]$court_case_id
  eval_dt <- eval_dt[court_case_id %in% valid_cases]

  articles_all <- sort(unique(keep_arts))
  article_idx <- setNames(seq_along(articles_all), articles_all)
  n_art <- length(articles_all)

  # Build co-citation matrix from TRAINING data
  train_dt <- train_dt[article_key %in% articles_all]
  train_case_counts <- train_dt[, .N, by = court_case_id]
  train_valid <- train_case_counts[N >= 2]$court_case_id
  train_dt <- train_dt[court_case_id %in% train_valid]

  if (nrow(train_dt) < 100) return(NULL)

  train_cases <- sort(unique(train_dt$court_case_id))
  train_case_idx <- setNames(seq_along(train_cases), as.character(train_cases))

  train_dt[, ci := train_case_idx[as.character(court_case_id)]]
  train_dt[, ai := article_idx[article_key]]

  M_train <- sparseMatrix(
    i = train_dt$ci, j = train_dt$ai, x = 1,
    dims = c(length(train_cases), n_art)
  )

  C <- crossprod(M_train)
  diag(C) <- 0
  article_degree <- diff(M_train@p)
  names(article_degree) <- articles_all

  # Adamic-Adar weights
  aa_weights <- 1 / pmax(log(article_degree), 1)
  C_aa <- C %*% Diagonal(x = aa_weights)
  C_dense <- as.matrix(C)
  C_aa_dense <- as.matrix(C_aa)

  # Build eval incidence matrix
  eval_cases <- sort(unique(eval_dt$court_case_id))
  eval_case_idx <- setNames(seq_along(eval_cases), as.character(eval_cases))
  eval_dt[, ci := eval_case_idx[as.character(court_case_id)]]
  eval_dt[, ai := article_idx[article_key]]

  M_eval <- sparseMatrix(
    i = eval_dt$ci, j = eval_dt$ai, x = 1,
    dims = c(length(eval_cases), n_art),
    dimnames = list(as.character(eval_cases), articles_all)
  )

  # Sample if too many
  n_eval_cases <- nrow(M_eval)
  if (n_eval_cases > MAX_EVAL_CASES) {
    set.seed(42)
    eval_sample <- sort(sample.int(n_eval_cases, MAX_EVAL_CASES))
  } else {
    eval_sample <- seq_len(n_eval_cases)
  }

  Mr <- as(M_eval, "RsparseMatrix")

  # Pre-allocate result vectors (avoid O(n²) append)
  max_preds <- as.integer(length(eval_sample) * MAX_CITATIONS) + 1000L
  ranks_aa <- integer(max_preds)
  ranks_cn <- integer(max_preds)
  pred_idx <- 0L
  t_eval <- proc.time()

  for (ii in seq_along(eval_sample)) {
    ci <- eval_sample[ii]
    cited <- Mr@j[seq(Mr@p[ci] + 1L, Mr@p[ci + 1L])] + 1L
    n_cited <- length(cited)
    if (n_cited < MIN_CITATIONS) next

    cn_scores <- colSums(C_dense[cited, , drop = FALSE])
    aa_scores <- colSums(C_aa_dense[cited, , drop = FALSE])

    for (j in seq_along(cited)) {
      t <- cited[j]
      pred_idx <- pred_idx + 1L
      ranks_cn[pred_idx] <- sum(cn_scores[-cited] >= cn_scores[t]) + 1L
      ranks_aa[pred_idx] <- sum(aa_scores[-cited] >= aa_scores[t]) + 1L
    }

    if (ii %% 10000L == 0L) {
      elapsed <- (proc.time() - t_eval)[3]
      rate <- ii / elapsed
      eta <- (length(eval_sample) - ii) / rate
      cat(sprintf("     eval: %d/%d cases, %d preds (%.0f c/s, ETA %.0fs)\n",
        ii, length(eval_sample), pred_idx, rate, eta))
    }
  }

  if (pred_idx == 0L) return(NULL)

  ranks_aa <- ranks_aa[1:pred_idx]
  ranks_cn <- ranks_cn[1:pred_idx]

  data.table(
    n_predictions = pred_idx,
    n_cases       = length(eval_sample),
    n_articles    = n_art,
    n_train_cases = length(train_cases),
    mrr_aa        = mean(1 / ranks_aa),
    mrr_cn        = mean(1 / ranks_cn),
    hit10_aa      = mean(ranks_aa <= 10),
    hit10_cn      = mean(ranks_cn <= 10)
  )
}

# ── Main loop ───────────────────────────────────────────────────

results <- list()
total <- length(EVAL_YEARS) * length(WINDOWS)
idx <- 0

for (eval_year in EVAL_YEARS) {
  # Load eval-year citations
  cat(sprintf("\n[%d] Loading eval data for %d...\n", eval_year, eval_year))
  eval_dt <- load_citations(eval_year, eval_year)
  cat(sprintf("     Eval: %s citations, %s cases\n",
    format(nrow(eval_dt), big.mark = ","),
    format(uniqueN(eval_dt$court_case_id), big.mark = ",")))

  if (nrow(eval_dt) < 1000) {
    cat("     Skipping: too few citations\n")
    next
  }

  for (w in WINDOWS) {
    idx <- idx + 1
    window_label <- if (w == 0) "all" else sprintf("%dy", w)
    train_from <- if (w == 0) 2005L else eval_year - w
    train_to <- eval_year - 1L

    cat(sprintf("  [%d/%d] Window=%s (train: %d-%d)... ",
      idx, total, window_label, train_from, train_to))

    t0 <- proc.time()
    train_dt <- load_citations(train_from, train_to)
    cat(sprintf("loaded %s train citations. ", format(nrow(train_dt), big.mark = ",")))

    if (nrow(train_dt) < 1000) {
      cat("SKIP (too few)\n")
      next
    }

    res <- evaluate_year(eval_dt, train_dt)

    if (is.null(res)) {
      cat("SKIP (eval failed)\n")
      next
    }

    res[, eval_year := eval_year]
    res[, window := w]
    res[, window_label := window_label]
    res[, train_years := sprintf("%d-%d", train_from, train_to)]

    elapsed <- (proc.time() - t0)[3]
    cat(sprintf("MRR=%.3f (%s preds, %.0fs)\n",
      res$mrr_aa, format(res$n_predictions, big.mark = ","), elapsed))

    results <- c(results, list(res))

    # Save incrementally
    fwrite(rbindlist(results),
      file.path(OUTDIR, "sliding_window_results.csv"))
  }
}

# ── Final summary ───────────────────────────────────────────────

final <- rbindlist(results)
cat("\n=== RESULTS ===\n\n")

# Pivot: rows = eval_year, cols = window
summary_dt <- dcast(final, eval_year ~ window_label, value.var = "mrr_aa")
print(summary_dt, digits = 3)

cat(sprintf("\nFull results saved to: %s/sliding_window_results.csv\n", OUTDIR))

# Compute improvement of best window over all-history
if ("all" %in% final$window_label) {
  for (y in unique(final$eval_year)) {
    all_mrr <- final[eval_year == y & window_label == "all"]$mrr_aa
    best <- final[eval_year == y & window_label != "all"][which.max(mrr_aa)]
    if (nrow(best) > 0 && length(all_mrr) > 0) {
      pct <- (best$mrr_aa - all_mrr) / all_mrr * 100
      cat(sprintf("  %d: best window=%s (MRR %.3f vs %.3f all, %+.1f%%)\n",
        y, best$window_label, best$mrr_aa, all_mrr, pct))
    }
  }
}

cat("\n=== Done ===\n")
