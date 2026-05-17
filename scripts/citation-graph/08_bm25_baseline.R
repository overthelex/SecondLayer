#!/usr/bin/env Rscript
# BM25 text baseline for statute retrieval.
#
# Protocol: same leave-one-out as graph methods, but scores are
# article-article BM25 similarity instead of co-citation.
#
# B[i,j] = BM25 similarity between article i text and article j text
# Score(target | seed) = sum_{s in seed} B[s, target]
#
# This tests whether textual similarity between articles provides
# retrieval signal that is complementary to (and more temporally
# stable than) co-citation structure.
#
# Usage:
#   Rscript 08_bm25_baseline.R --datadir /tmp/citation-years --outdir /tmp/citation-analysis/bm25

library(data.table)
library(Matrix)

args <- commandArgs(trailingOnly = TRUE)
parse_arg <- function(flag, default) {
  idx <- match(flag, args)
  if (!is.na(idx) && idx < length(args)) args[idx + 1] else default
}

DATADIR  <- parse_arg("--datadir", "/tmp/citation-years")
OUTDIR   <- parse_arg("--outdir", "/tmp/citation-analysis/bm25")
DB_HOST  <- parse_arg("--db-host", "localhost")
DB_PORT  <- as.integer(parse_arg("--db-port", 5432))
DB_NAME  <- parse_arg("--db-name", "secondlayer_local")
DB_USER  <- parse_arg("--db-user", "secondlayer")
DB_PASS  <- parse_arg("--db-pass", "local_dev_password")
MIN_FREQ <- as.integer(parse_arg("--min-freq", 50))
MAX_ARTICLES <- 5000L
MAX_EVAL_CASES <- 100000L
MIN_CITATIONS_PER_CASE <- 3L
MAX_ARTICLES_PER_CASE <- 200L

dir.create(OUTDIR, recursive = TRUE, showWarnings = FALSE)

LAW_NORM <- c(
  "КУпАП" = "Кодекс України про адміністративні правопорушення",
  "КупАП" = "Кодекс України про адміністративні правопорушення",
  "КУПАП" = "Кодекс України про адміністративні правопорушення",
  "КУпАп" = "Кодекс України про адміністративні правопорушення",
  "КЗпП"  = "Кодекс законів про працю України"
)

# ── 1. Load article texts from DB ────────────────────────────────

cat("=== BM25 Text Baseline for Statute Retrieval ===\n\n")
cat("[1/5] Loading article texts from database...\n")

library(DBI)
library(RPostgres)
con <- dbConnect(RPostgres::Postgres(),
                 host = DB_HOST, port = DB_PORT,
                 dbname = DB_NAME, user = DB_USER, password = DB_PASS)

articles_db <- as.data.table(dbGetQuery(con, "
  SELECT l.title as law_name, la.article_number, la.full_text
  FROM legislation_articles la
  JOIN legislation l ON l.id = la.legislation_id
  WHERE la.full_text IS NOT NULL AND la.full_text != ''
    AND la.is_current = true
"))
dbDisconnect(con)

articles_db[, article_key := paste0(law_name, "|", article_number)]
cat(sprintf("   Loaded %d article texts from DB\n", nrow(articles_db)))

# ── 2. BM25 implementation ───────────────────────────────────────

cat("[2/5] Building BM25 article-article similarity matrix...\n")

# Tokenize: simple whitespace + lowercase
tokenize <- function(text) {
  tokens <- unlist(strsplit(tolower(text), "[^\\p{L}\\p{N}]+", perl = TRUE))
  tokens[nchar(tokens) >= 2]
}

# Build vocabulary and document-term matrix
all_texts <- articles_db$full_text
n_docs <- length(all_texts)

cat(sprintf("   Tokenizing %d articles...\n", n_docs))
doc_tokens <- lapply(all_texts, tokenize)
doc_lengths <- sapply(doc_tokens, length)
avg_dl <- mean(doc_lengths)

# Build vocabulary
vocab <- unique(unlist(doc_tokens))
vocab_idx <- setNames(seq_along(vocab), vocab)
n_vocab <- length(vocab)
cat(sprintf("   Vocabulary: %d terms, avg doc length: %.0f tokens\n", n_vocab, avg_dl))

# Document frequency
df_counts <- integer(n_vocab)
for (i in seq_len(n_docs)) {
  unique_terms <- unique(doc_tokens[[i]])
  idxs <- vocab_idx[unique_terms]
  idxs <- idxs[!is.na(idxs)]
  df_counts[idxs] <- df_counts[idxs] + 1L
}

# IDF
idf <- log((n_docs - df_counts + 0.5) / (df_counts + 0.5) + 1)

# BM25 parameters
k1 <- 1.2
b <- 0.75

# Build sparse TF matrix (docs x terms)
cat("   Building term-frequency matrix...\n")
rows <- integer(0)
cols <- integer(0)
vals <- numeric(0)

for (i in seq_len(n_docs)) {
  toks <- doc_tokens[[i]]
  if (length(toks) == 0) next
  tf_table <- table(toks)
  term_ids <- vocab_idx[names(tf_table)]
  valid <- !is.na(term_ids)
  rows <- c(rows, rep(i, sum(valid)))
  cols <- c(cols, term_ids[valid])
  vals <- c(vals, as.numeric(tf_table)[valid])
}

TF <- sparseMatrix(i = rows, j = cols, x = vals, dims = c(n_docs, n_vocab))

# BM25 score matrix: each row is BM25-weighted term vector
cat("   Computing BM25 vectors...\n")
bm25_vals <- numeric(length(vals))
idx <- 1
for (i in seq_len(n_docs)) {
  toks <- doc_tokens[[i]]
  if (length(toks) == 0) next
  tf_table <- table(toks)
  term_ids <- vocab_idx[names(tf_table)]
  valid <- !is.na(term_ids)
  tfs <- as.numeric(tf_table)[valid]
  dl <- doc_lengths[i]

  # BM25 term weight
  bm25_tf <- (tfs * (k1 + 1)) / (tfs + k1 * (1 - b + b * dl / avg_dl))
  bm25_w <- bm25_tf * idf[term_ids[valid]]

  n_valid <- sum(valid)
  bm25_vals[idx:(idx + n_valid - 1)] <- bm25_w
  idx <- idx + n_valid
}

BM25 <- sparseMatrix(i = rows, j = cols, x = bm25_vals, dims = c(n_docs, n_vocab))

# Article-article similarity: B = BM25 %*% t(BM25_binary)
# Actually: for query article q, score of candidate c = sum of BM25 weights of shared terms
# Simpler: B[q,c] = BM25_q . TF_c_binary (dot product of BM25-weighted query with binary candidate)
TF_binary <- TF > 0
B <- BM25 %*% t(TF_binary)
B_dense <- as.matrix(B)
diag(B_dense) <- 0  # no self-similarity

cat(sprintf("   BM25 similarity matrix: %d x %d\n", nrow(B_dense), ncol(B_dense)))

rm(TF, BM25, TF_binary, B, rows, cols, vals, bm25_vals, doc_tokens)
gc(verbose = FALSE)

# ── 3. Evaluate across years ─────────────────────────────────────

cat("[3/5] Evaluating BM25 baseline across years...\n")

years_to_eval <- c(2008, 2010, 2012, 2014, 2016, 2018, 2020, 2022, 2024)
bm25_results <- vector("list", length(years_to_eval))

for (yi in seq_along(years_to_eval)) {
  y <- years_to_eval[yi]
  cat(sprintf("\n[Year %d] (%d/%d)\n", y, yi, length(years_to_eval)))
  t0 <- proc.time()

  # Load citation data
  f <- file.path(DATADIR, sprintf("map_year_%d.csv", y))
  dt <- fread(f, colClasses = c("integer64", "character", "character"))
  setnames(dt, c("court_case_id", "law_number", "law_article"))
  dt[law_number %in% names(LAW_NORM), law_number := LAW_NORM[law_number]]
  dt <- dt[grepl("^[0-9]+(-[0-9]+)?$", law_article)]
  dt[, article_key := paste0(law_number, "|", law_article)]
  dt <- unique(dt, by = c("court_case_id", "article_key"))

  # Filter to articles with frequency threshold AND text available
  article_freq <- dt[, .N, by = article_key]
  keep_arts <- article_freq[N >= MIN_FREQ]
  if (nrow(keep_arts) > MAX_ARTICLES) {
    setorder(keep_arts, -N)
    keep_arts <- keep_arts[1:MAX_ARTICLES]$article_key
  } else {
    keep_arts <- keep_arts$article_key
  }

  # Intersect with articles that have text
  text_articles <- articles_db$article_key
  keep_arts <- intersect(keep_arts, text_articles)
  dt <- dt[article_key %in% keep_arts]

  cat(sprintf("   Articles with text + freq>=%d: %d\n", MIN_FREQ, length(keep_arts)))

  # Build incidence matrix
  articles_all <- sort(keep_arts)
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

  # Co-citation matrix (for comparison)
  C <- crossprod(M)
  diag(C) <- 0
  C_dense <- as.matrix(C)
  article_degree <- diff(M@p)
  names(article_degree) <- articles_all

  # Extract BM25 sub-matrix for current article set
  db_idx <- match(articles_all, articles_db$article_key)
  B_sub <- B_dense[db_idx, db_idx]

  # AA weights
  aa_weights <- 1 / pmax(log(article_degree), 1)
  C_aa <- sweep(C_dense, 2, aa_weights, "*")

  # Evaluate
  Mr <- as(M, "RsparseMatrix")

  n_cas <- length(cases_eval)
  if (n_cas > MAX_EVAL_CASES) {
    set.seed(42)
    eval_sample <- sort(sample.int(n_cas, MAX_EVAL_CASES))
  } else {
    eval_sample <- seq_len(n_cas)
  }

  results_list <- vector("list", length(eval_sample))

  for (idx in seq_along(eval_sample)) {
    ci <- eval_sample[idx]
    cited <- Mr@j[seq(Mr@p[ci] + 1L, Mr@p[ci + 1L])] + 1L
    n_cited <- length(cited)
    if (n_cited < MIN_CITATIONS_PER_CASE) next

    # Graph scores
    aa_scores <- colSums(C_aa[cited, , drop = FALSE])
    # BM25 scores
    bm25_scores <- colSums(B_sub[cited, , drop = FALSE])

    ranks_aa <- integer(n_cited)
    ranks_bm25 <- integer(n_cited)

    for (j in seq_along(cited)) {
      t <- cited[j]
      ranks_aa[j] <- sum(aa_scores[-cited] >= aa_scores[t]) + 1L
      ranks_bm25[j] <- sum(bm25_scores[-cited] >= bm25_scores[t]) + 1L
    }

    results_list[[idx]] <- data.table(
      target_article = articles_all[cited],
      rank_aa = ranks_aa,
      rank_bm25 = ranks_bm25
    )
  }

  res <- rbindlist(results_list[!sapply(results_list, is.null)])

  bm25_results[[yi]] <- data.table(
    year = y,
    n_articles = n_art,
    n_predictions = nrow(res),
    mrr_aa = mean(1 / res$rank_aa),
    mrr_bm25 = mean(1 / res$rank_bm25),
    hit10_aa = mean(res$rank_aa <= 10),
    hit10_bm25 = mean(res$rank_bm25 <= 10)
  )

  elapsed <- (proc.time() - t0)[3]
  cat(sprintf("   AA MRR=%.4f, BM25 MRR=%.4f, %d preds (%.0fs)\n",
              bm25_results[[yi]]$mrr_aa, bm25_results[[yi]]$mrr_bm25,
              nrow(res), elapsed))

  rm(dt, dt_eval, M, C, C_dense, C_aa, Mr, res)
  gc(verbose = FALSE)
}

# ── 4. Summary ───────────────────────────────────────────────────

cat("\n[4/5] Summary\n")
bm25_dt <- rbindlist(bm25_results)
fwrite(bm25_dt, file.path(OUTDIR, "bm25_comparison.csv"))

cat("\n── Graph (AA) vs BM25 Text Baseline ──\n")
print(bm25_dt[, .(year, mrr_aa, mrr_bm25, hit10_aa, hit10_bm25)])

# Decay rates
aa_2012 <- bm25_dt[year == 2012]$mrr_aa
aa_2024 <- bm25_dt[year == 2024]$mrr_aa
bm25_2012 <- bm25_dt[year == 2012]$mrr_bm25
bm25_2024 <- bm25_dt[year == 2024]$mrr_bm25

cat(sprintf("\nDecay 2012→2024:\n"))
cat(sprintf("  AA:   %.4f → %.4f (%.1f%%)\n", aa_2012, aa_2024, (aa_2012 - aa_2024) / aa_2012 * 100))
cat(sprintf("  BM25: %.4f → %.4f (%.1f%%)\n", bm25_2012, bm25_2024, (bm25_2012 - bm25_2024) / bm25_2012 * 100))

cat(sprintf("\n=== Done. Results in %s ===\n", OUTDIR))
