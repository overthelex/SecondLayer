#!/usr/bin/env Rscript
# Temporal reweighting experiment.
#
# Instead of uniform co-citation (all historical cases weighted equally),
# weight each case's contribution by recency:
#   w(case) = exp(-lambda * (eval_year - case_year))
#
# This gives recent cases exponentially more influence on co-citation scores.
# Tests lambda in {0, 0.1, 0.2, 0.5, 1.0} where lambda=0 is uniform (baseline).
#
# Uses mv_citations_by_year materialized view for fast year-filtered queries.

library(data.table)
library(Matrix)
library(DBI)
library(RPostgres)

EVAL_YEARS <- c(2014, 2016, 2018, 2020, 2022, 2024)
LAMBDAS    <- c(0, 0.1, 0.2, 0.5, 1.0)
OUTDIR     <- "/home/vovkes/SecondLayer/docs/arxiv-statute-retrieval/ablation"
MAX_EVAL_CASES   <- 50000L
MIN_CITATIONS    <- 3L
MAX_CITATIONS    <- 200L
MIN_ARTICLE_FREQ <- 50L
MAX_ARTICLES     <- 5000L

dir.create(OUTDIR, recursive = TRUE, showWarnings = FALSE)

cat("=== Temporal Reweighting Experiment ===\n")
cat(sprintf("Eval years: %s\n", paste(EVAL_YEARS, collapse = ", ")))
cat(sprintf("Lambdas:    %s\n\n", paste(LAMBDAS, collapse = ", ")))

con <- dbConnect(RPostgres::Postgres(),
  host = "localhost", port = 5432, dbname = "secondlayer_local",
  user = "secondlayer", password = "local_dev_password")
on.exit(dbDisconnect(con))

LAW_NORM <- c(
  "КУпАП" = "Кодекс України про адміністративні правопорушення",
  "КупАП" = "Кодекс України про адміністративні правопорушення",
  "КУПАП" = "Кодекс України про адміністративні правопорушення",
  "КУпАп" = "Кодекс України про адміністративні правопорушення",
  "КЗпП"  = "Кодекс законів про працю України"
)

load_citations_with_year <- function(year_from, year_to) {
  q <- sprintf("
    SELECT court_case_id, law_number, law_article, adj_year
    FROM mv_citations_by_year
    WHERE adj_year BETWEEN %d AND %d
  ", year_from, year_to)
  dt <- as.data.table(dbGetQuery(con, q))
  if (nrow(dt) == 0) return(dt)
  setnames(dt, c("court_case_id", "law_number", "law_article", "adj_year"))
  dt[law_number %in% names(LAW_NORM), law_number := LAW_NORM[law_number]]
  dt[, article_key := paste0(law_number, "|", law_article)]
  unique(dt, by = c("court_case_id", "article_key"))
}

evaluate_weighted <- function(eval_dt, train_dt, eval_year, lambda_val) {
  # Article vocabulary from eval
  eval_arts <- eval_dt[, .N, by = article_key][N >= MIN_ARTICLE_FREQ]
  if (nrow(eval_arts) > MAX_ARTICLES) {
    setorder(eval_arts, -N)
    eval_arts <- eval_arts[1:MAX_ARTICLES]
  }
  keep_arts <- eval_arts$article_key

  eval_dt <- eval_dt[article_key %in% keep_arts]
  train_dt <- train_dt[article_key %in% keep_arts]

  case_counts <- eval_dt[, .N, by = court_case_id]
  valid_cases <- case_counts[N >= MIN_CITATIONS & N <= MAX_CITATIONS]$court_case_id
  eval_dt <- eval_dt[court_case_id %in% valid_cases]

  articles_all <- sort(unique(keep_arts))
  article_idx <- setNames(seq_along(articles_all), articles_all)
  n_art <- length(articles_all)

  # Build WEIGHTED co-citation matrix from training data
  train_dt <- train_dt[article_key %in% articles_all]
  train_case_counts <- train_dt[, .N, by = court_case_id]
  train_valid <- train_case_counts[N >= 2]$court_case_id
  train_dt <- train_dt[court_case_id %in% train_valid]

  if (nrow(train_dt) < 100) return(NULL)

  # Compute per-case weight: exp(-lambda * (eval_year - case_year))
  train_dt[, case_weight := exp(-lambda_val * (eval_year - adj_year))]

  # Build weighted sparse matrix: M[case, article] = weight
  train_cases <- sort(unique(train_dt$court_case_id))
  train_case_idx <- setNames(seq_along(train_cases), as.character(train_cases))
  train_dt[, ci := train_case_idx[as.character(court_case_id)]]
  train_dt[, ai := article_idx[article_key]]

  M_train <- sparseMatrix(
    i = train_dt$ci, j = train_dt$ai, x = train_dt$case_weight,
    dims = c(length(train_cases), n_art)
  )

  # Weighted co-citation: C = M^T %*% M
  C <- crossprod(M_train)
  diag(C) <- 0

  # Article degree (weighted)
  article_degree <- colSums(M_train)
  names(article_degree) <- articles_all

  # Adamic-Adar weights
  aa_weights <- 1 / pmax(log(pmax(article_degree, 1)), 1)
  C_aa <- C %*% Diagonal(x = aa_weights)

  # Eval incidence (unweighted binary)
  eval_cases_vec <- sort(unique(eval_dt$court_case_id))
  eval_case_idx <- setNames(seq_along(eval_cases_vec), as.character(eval_cases_vec))
  eval_dt[, ci := eval_case_idx[as.character(court_case_id)]]
  eval_dt[, ai := article_idx[article_key]]

  M_eval <- sparseMatrix(
    i = eval_dt$ci, j = eval_dt$ai, x = 1,
    dims = c(length(eval_cases_vec), n_art)
  )

  n_eval_cases <- nrow(M_eval)
  if (n_eval_cases > MAX_EVAL_CASES) {
    set.seed(42)
    eval_sample <- sort(sample.int(n_eval_cases, MAX_EVAL_CASES))
    M_eval <- M_eval[eval_sample, ]
  }

  # Vectorized: MC = M_eval %*% C_aa gives all scores at once
  # MC[i,j] = AA score of article j for case i (diag(C)=0 → already LOO)
  MC <- as.matrix(M_eval %*% C_aa)

  Mr <- as(M_eval, "RsparseMatrix")
  n_eval <- nrow(Mr)

  # Only loop for ranking (unavoidable per-case)
  max_preds <- as.integer(n_eval * MAX_CITATIONS) + 1000L
  ranks_aa <- integer(max_preds)
  pred_idx <- 0L

  for (ci in seq_len(n_eval)) {
    cited <- Mr@j[seq(Mr@p[ci] + 1L, Mr@p[ci + 1L])] + 1L
    n_cited <- length(cited)
    if (n_cited < MIN_CITATIONS) next

    scores <- MC[ci, ]
    for (j in seq_along(cited)) {
      t <- cited[j]
      pred_idx <- pred_idx + 1L
      ranks_aa[pred_idx] <- sum(scores[-cited] >= scores[t]) + 1L
    }
  }

  if (pred_idx == 0L) return(NULL)
  ranks_aa <- ranks_aa[1:pred_idx]

  data.table(
    n_predictions = pred_idx,
    n_cases       = n_eval,
    n_articles    = n_art,
    mrr_aa        = mean(1 / ranks_aa),
    hit10_aa      = mean(ranks_aa <= 10)
  )
}

# ── Main loop ───────────────────────────────────────────────────

results <- list()
total <- length(EVAL_YEARS) * length(LAMBDAS)
idx <- 0

for (eval_year in EVAL_YEARS) {
  cat(sprintf("\n[%d] Loading eval data...\n", eval_year))
  eval_dt <- load_citations_with_year(eval_year, eval_year)
  cat(sprintf("     Eval: %s citations, %s cases\n",
    format(nrow(eval_dt), big.mark = ","),
    format(uniqueN(eval_dt$court_case_id), big.mark = ",")))

  # Load all historical train data (with year for weighting)
  train_from <- 2005L
  train_to <- eval_year - 1L
  cat(sprintf("     Loading train %d-%d...\n", train_from, train_to))
  train_dt <- load_citations_with_year(train_from, train_to)
  cat(sprintf("     Train: %s citations\n", format(nrow(train_dt), big.mark = ",")))

  for (lam in LAMBDAS) {
    idx <- idx + 1
    cat(sprintf("  [%d/%d] lambda=%.1f... ", idx, total, lam))
    t0 <- proc.time()

    res <- evaluate_weighted(eval_dt, train_dt, eval_year, lam)

    if (is.null(res)) {
      cat("SKIP\n")
      next
    }

    res[, eval_year := eval_year]
    res[, lambda := lam]
    elapsed <- (proc.time() - t0)[3]
    cat(sprintf("MRR=%.3f (%.0fs)\n", res$mrr_aa, elapsed))

    results <- c(results, list(res))
    fwrite(rbindlist(results),
      file.path(OUTDIR, "temporal_reweighting_results.csv"))
  }
}

# ── Summary ─────────────────────────────────────────────────────

final <- rbindlist(results)
cat("\n=== RESULTS ===\n\n")
summary_dt <- dcast(final, eval_year ~ lambda, value.var = "mrr_aa")
print(summary_dt, digits = 3)

# Best lambda per year
cat("\n")
for (y in unique(final$eval_year)) {
  baseline <- final[eval_year == y & lambda == 0]$mrr_aa
  best <- final[eval_year == y & lambda > 0][which.max(mrr_aa)]
  if (nrow(best) > 0) {
    pct <- (best$mrr_aa - baseline) / baseline * 100
    cat(sprintf("  %d: best lambda=%.1f (MRR %.3f vs %.3f uniform, %+.1f%%)\n",
      y, best$lambda, best$mrr_aa, baseline, pct))
  }
}

cat(sprintf("\nResults saved to: %s/temporal_reweighting_results.csv\n", OUTDIR))
cat("\n=== Done ===\n")
