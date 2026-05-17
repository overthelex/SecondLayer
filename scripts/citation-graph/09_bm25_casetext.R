#!/usr/bin/env Rscript
# BM25 case-text → article-text baseline (VECTORIZED).
#
# Key idea: pre-compute sparse BM25 vectors for all articles,
# then for each case compute query vector and do matrix dot product.
# All scoring is one sparse matrix multiply — no R loops over articles.
#
# Protocol:
#   1. Build article BM25 matrix A[article, term] (sparse)
#   2. For each eval case, load text, strip citations, tokenize → query TF
#   3. Compute BM25 query vector q[term] with IDF weighting
#   4. Score = q %*% t(A) → vector of scores for all articles at once
#   5. Rank cited articles, compare with graph baseline

library(data.table)
library(Matrix)
library(DBI)
library(RPostgres)

args <- commandArgs(trailingOnly = TRUE)
parse_arg <- function(flag, default) {
  idx <- match(flag, args)
  if (!is.na(idx) && idx < length(args)) args[idx + 1] else default
}

DATADIR  <- parse_arg("--datadir", "/tmp/citation-years")
OUTDIR   <- parse_arg("--outdir", "/tmp/citation-analysis/bm25-casetext")
EXTRA_ARTICLES <- parse_arg("--extra", "/tmp/codex_articles.csv")
MIN_FREQ <- as.integer(parse_arg("--min-freq", 50))
MAX_ARTICLES <- 5000L
SAMPLE_CASES <- 10000L
MIN_CITATIONS_PER_CASE <- 3L
MAX_ARTICLES_PER_CASE <- 200L
k1 <- 1.2; b <- 0.75

dir.create(OUTDIR, recursive = TRUE, showWarnings = FALSE)

LAW_NORM <- c(
  "КУпАП" = "Кодекс України про адміністративні правопорушення",
  "КупАП" = "Кодекс України про адміністративні правопорушення",
  "КУПАП" = "Кодекс України про адміністративні правопорушення",
  "КУпАп" = "Кодекс України про адміністративні правопорушення",
  "КЗпП"  = "Кодекс законів про працю України"
)

CITE_STRIP <- "ст\\.?\\s*\\d+(?:-\\d+)?(?:[,\\s]*\\d+(?:-\\d+)?)*\\s*(?:Цивільного|Кримінального|Господарського|Сімейного|Податкового|Земельного|Водного|Лісового|Житлового|Бюджетного|Митного)\\s*(?:процесуального\\s*)?кодексу\\s*України|ст\\.?\\s*\\d+(?:-\\d+)?\\s*(?:ЦК|КК|ЦПК|КПК|ГПК|КАС|КУпАП|КЗпП|СК|ПК|ЗК)(?:\\s*України)?|ст\\.?\\s*\\d+(?:-\\d+)?\\s*Конституції\\s*України"

tokenize <- function(text) {
  tokens <- unlist(strsplit(tolower(text), "[^\\p{L}\\p{N}]+", perl = TRUE))
  tokens[nchar(tokens) >= 2]
}

cat("=== BM25 Case-Text Baseline (Vectorized) ===\n\n")

# ── 1. Load article texts ────────────────────────────────────────

cat("[1/5] Loading article texts...\n")
con <- dbConnect(RPostgres::Postgres(),
                 host = "localhost", port = 5432,
                 dbname = "secondlayer_local", user = "secondlayer",
                 password = "local_dev_password")

db_articles <- as.data.table(dbGetQuery(con, "
  SELECT l.title as law_name, la.article_number, la.full_text
  FROM legislation_articles la
  JOIN legislation l ON l.id = la.legislation_id
  WHERE la.full_text IS NOT NULL AND la.full_text != '' AND la.is_current = true
"))
db_articles[, article_key := paste0(law_name, "|", article_number)]

extra <- fread(EXTRA_ARTICLES, encoding = "UTF-8")

all_art <- rbind(
  db_articles[, .(article_key, full_text)],
  extra[!article_key %in% db_articles$article_key, .(article_key, full_text)]
)
cat(sprintf("   %d articles with text (DB: %d, RADA: %d)\n",
            nrow(all_art), nrow(db_articles), nrow(extra)))

# ── 2. Build article BM25 matrix ─────────────────────────────────

cat("[2/5] Building sparse article BM25 matrix...\n")

art_tokens <- lapply(all_art$full_text, tokenize)
art_dl <- sapply(art_tokens, length)
avg_dl <- mean(art_dl)
n_arts_all <- nrow(all_art)

# Vocabulary from articles
vocab_list <- unique(unlist(art_tokens))
vocab_idx <- setNames(seq_along(vocab_list), vocab_list)
n_vocab <- length(vocab_list)
cat(sprintf("   Vocab: %d terms\n", n_vocab))

# Document frequency
df_vec <- integer(n_vocab)
for (i in seq_len(n_arts_all)) {
  ut <- unique(art_tokens[[i]])
  ids <- vocab_idx[ut]; ids <- ids[!is.na(ids)]
  df_vec[ids] <- df_vec[ids] + 1L
}
idf_vec <- log((n_arts_all - df_vec + 0.5) / (df_vec + 0.5) + 1)

# Build sparse BM25-weighted article matrix A[article, term]
# A[i,j] = BM25_tf(i,j) — already IDF-independent so we apply IDF at query time
rows_a <- integer(0); cols_a <- integer(0); vals_a <- numeric(0)
for (i in seq_len(n_arts_all)) {
  toks <- art_tokens[[i]]
  if (length(toks) == 0) next
  tf <- table(toks)
  ids <- vocab_idx[names(tf)]; valid <- !is.na(ids)
  tfs <- as.numeric(tf)[valid]; ids <- ids[valid]
  dl <- art_dl[i]
  bm25_tf <- (tfs * (k1 + 1)) / (tfs + k1 * (1 - b + b * dl / avg_dl))
  rows_a <- c(rows_a, rep(i, length(ids)))
  cols_a <- c(cols_a, ids)
  vals_a <- c(vals_a, bm25_tf)
}

A_bm25 <- sparseMatrix(i = rows_a, j = cols_a, x = vals_a,
                        dims = c(n_arts_all, n_vocab))
cat(sprintf("   Article matrix: %d × %d, %d nnz\n", nrow(A_bm25), ncol(A_bm25), nnzero(A_bm25)))

rm(art_tokens, rows_a, cols_a, vals_a, db_articles, extra)
gc(verbose = FALSE)

# ── 3. Evaluate across years ─────────────────────────────────────

cat("[3/5] Evaluating BM25(case→article) across years...\n")

years_to_eval <- c(2008, 2012, 2016, 2020, 2024)
results_all <- vector("list", length(years_to_eval))

for (yi in seq_along(years_to_eval)) {
  y <- years_to_eval[yi]
  cat(sprintf("\n[Year %d] (%d/%d)\n", y, yi, length(years_to_eval)))
  t0 <- proc.time()

  f <- file.path(DATADIR, sprintf("map_year_%d.csv", y))
  dt <- fread(f, colClasses = c("integer64", "character", "character"))
  setnames(dt, c("court_case_id", "law_number", "law_article"))
  dt[law_number %in% names(LAW_NORM), law_number := LAW_NORM[law_number]]
  dt <- dt[grepl("^[0-9]+(-[0-9]+)?$", law_article)]
  dt[, article_key := paste0(law_number, "|", law_article)]
  dt <- unique(dt, by = c("court_case_id", "article_key"))

  article_freq <- dt[, .N, by = article_key]
  keep_arts <- article_freq[N >= MIN_FREQ]
  if (nrow(keep_arts) > MAX_ARTICLES) {
    setorder(keep_arts, -N)
    keep_arts <- keep_arts[1:MAX_ARTICLES]$article_key
  } else {
    keep_arts <- keep_arts$article_key
  }
  keep_arts <- intersect(keep_arts, all_art$article_key)
  dt <- dt[article_key %in% keep_arts]

  case_counts <- dt[, .N, by = court_case_id]
  valid_cases <- case_counts[N >= MIN_CITATIONS_PER_CASE & N <= MAX_ARTICLES_PER_CASE]$court_case_id

  set.seed(42)
  sample_cases <- if (length(valid_cases) > SAMPLE_CASES) {
    sort(sample(valid_cases, SAMPLE_CASES))
  } else sort(valid_cases)

  # Article subset indices in global A_bm25
  articles_eval <- sort(keep_arts)
  art_global_idx <- match(articles_eval, all_art$article_key)
  n_art_eval <- length(articles_eval)
  article_idx_eval <- setNames(seq_len(n_art_eval), articles_eval)

  # Sub-matrix of A_bm25 for current articles
  A_sub <- A_bm25[art_global_idx, , drop = FALSE]  # n_art_eval × n_vocab

  # Graph baseline: co-citation on ALL valid cases
  dt_graph <- dt[court_case_id %in% valid_cases]
  dt_graph[, ai := article_idx_eval[article_key]]
  all_cases_sorted <- sort(unique(dt_graph$court_case_id))
  ci_map <- setNames(seq_along(all_cases_sorted), as.character(all_cases_sorted))
  dt_graph[, ci := ci_map[as.character(court_case_id)]]
  M <- sparseMatrix(i = dt_graph$ci, j = dt_graph$ai, x = 1,
                    dims = c(length(all_cases_sorted), n_art_eval))
  C <- crossprod(M); diag(C) <- 0; C_dense <- as.matrix(C)
  article_degree <- diff(M@p)
  aa_w <- 1 / pmax(log(article_degree), 1)
  C_aa <- sweep(C_dense, 2, aa_w, "*")

  cat(sprintf("   %d articles, %d sample cases\n", n_art_eval, length(sample_cases)))

  # Load case texts in batches, score vectorized
  BATCH <- 500L
  n_batches <- ceiling(length(sample_cases) / BATCH)
  batch_results <- vector("list", n_batches)

  for (bi in seq_len(n_batches)) {
    b_start <- (bi - 1L) * BATCH + 1L
    b_end <- min(bi * BATCH, length(sample_cases))
    batch_ids <- sample_cases[b_start:b_end]

    ids_sql <- paste(batch_ids, collapse = ",")
    texts_dt <- tryCatch(
      as.data.table(dbGetQuery(con, sprintf(
        "SELECT doc_id, full_text FROM edrsr_fulltext_p_%d WHERE doc_id IN (%s)", y, ids_sql
      ))),
      error = function(e) data.table()
    )
    if (nrow(texts_dt) == 0) next

    case_results <- vector("list", nrow(texts_dt))

    for (ti in seq_len(nrow(texts_dt))) {
      cid <- texts_dt$doc_id[ti]
      ctxt <- texts_dt$full_text[ti]
      if (is.na(ctxt) || nchar(ctxt) < 50) next

      masked <- gsub(CITE_STRIP, " ", ctxt, perl = TRUE)
      qtoks <- tokenize(masked)
      if (length(qtoks) > 500) qtoks <- qtoks[1:500]
      if (length(qtoks) < 5) next

      # Build query BM25 vector: IDF-weighted term presence
      qtf <- table(qtoks)
      qids <- vocab_idx[names(qtf)]
      valid <- !is.na(qids)
      qids <- qids[valid]; qtfs <- as.numeric(qtf)[valid]

      # Query vector: just IDF * binary (query is "document", we want matching terms in articles)
      q_vec <- sparseVector(x = idf_vec[qids], i = qids, length = n_vocab)

      # Score ALL articles at once: scores = A_sub %*% q_vec
      scores_bm25 <- as.numeric(A_sub %*% q_vec)

      # Graph scores
      cited_keys <- dt[court_case_id == cid]$article_key
      cited_idx <- article_idx_eval[cited_keys]
      cited_idx <- cited_idx[!is.na(cited_idx)]
      if (length(cited_idx) < MIN_CITATIONS_PER_CASE) next

      aa_scores <- colSums(C_aa[cited_idx, , drop = FALSE])

      # Rank each cited article among non-seed
      ranks_aa <- integer(length(cited_idx))
      ranks_bm25 <- integer(length(cited_idx))
      for (j in seq_along(cited_idx)) {
        t <- cited_idx[j]
        ranks_aa[j] <- sum(aa_scores[-cited_idx] >= aa_scores[t]) + 1L
        ranks_bm25[j] <- sum(scores_bm25[-cited_idx] >= scores_bm25[t]) + 1L
      }

      case_results[[ti]] <- data.table(
        rank_aa = ranks_aa,
        rank_bm25 = ranks_bm25
      )
    }

    batch_results[[bi]] <- rbindlist(case_results[!sapply(case_results, is.null)])

    if (bi %% 4 == 0 || bi == n_batches) {
      n_done <- sum(sapply(batch_results[1:bi], function(x) if(is.null(x)) 0 else nrow(x)))
      cat(sprintf("   %d/%d batches, %d predictions (%.0fs)\n",
                  bi, n_batches, n_done, (proc.time() - t0)[3]))
    }
  }

  res <- rbindlist(batch_results[!sapply(batch_results, is.null)])
  if (nrow(res) > 0) {
    results_all[[yi]] <- data.table(
      year = y,
      n_articles = n_art_eval,
      n_predictions = nrow(res),
      mrr_aa = mean(1 / res$rank_aa),
      mrr_bm25 = mean(1 / res$rank_bm25),
      hit10_aa = mean(res$rank_aa <= 10),
      hit10_bm25 = mean(res$rank_bm25 <= 10)
    )
    cat(sprintf("   Year %d DONE: AA=%.4f, BM25=%.4f (%d preds, %.0fs)\n",
                y, results_all[[yi]]$mrr_aa, results_all[[yi]]$mrr_bm25,
                nrow(res), (proc.time() - t0)[3]))
  }

  rm(dt, dt_graph, M, C, C_dense, C_aa, A_sub, res)
  gc(verbose = FALSE)
}

dbDisconnect(con)

# ── Summary ──────────────────────────────────────────────────────

bm25_dt <- rbindlist(results_all[!sapply(results_all, is.null)])
fwrite(bm25_dt, file.path(OUTDIR, "bm25_casetext_comparison.csv"))

cat("\n── Graph (AA) vs BM25 Case→Article ──\n")
print(bm25_dt)

if (nrow(bm25_dt) >= 2) {
  f <- bm25_dt[1]; l <- bm25_dt[nrow(bm25_dt)]
  cat(sprintf("\nDecay %d→%d:\n", f$year, l$year))
  cat(sprintf("  AA:   %.4f → %.4f (%.1f%%)\n", f$mrr_aa, l$mrr_aa, (f$mrr_aa - l$mrr_aa)/f$mrr_aa*100))
  cat(sprintf("  BM25: %.4f → %.4f (%.1f%%)\n", f$mrr_bm25, l$mrr_bm25, (f$mrr_bm25 - l$mrr_bm25)/f$mrr_bm25*100))
}

cat(sprintf("\n=== Done ===\n"))
