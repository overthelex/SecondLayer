#!/usr/bin/env Rscript
# Validation experiments:
# 1. Community vs justice_kind (formal domain) NMI
# 2. Sub-period analysis of P5 (2022-23 vs 2024-26)
# 3. Formal NMI comparison test (permutation)

library(data.table)
library(Matrix)
library(igraph)
library(parallel)
library(jsonlite)

DATADIR <- "/tmp/citation-analysis"
PERIOD_LABELS <- c("2007-13", "2014-16", "2017-19", "2020-21", "2022-26")

# ================================================================
# TASK 1: Community vs justice_kind validation
# ================================================================
cat("=== TASK 1: Community vs justice_kind validation ===\n\n")

# Load community assignments with rank
comms <- lapply(1:5, function(p) {
  dt <- fread(file.path(DATADIR, sprintf("fullscale_communities_p%d.csv", p)))
  size_rank <- dt[, .N, by = community][order(-N)]
  size_rank[, rank := .I]
  dt <- merge(dt, size_rank[, .(community, rank)], by = "community")
  dt[, period := p]
  dt
})

# For each period, load map_p file, join with documents to get justice_kind,
# then compute dominant justice_kind per article, then compare with community
for (p in 1:5) {
  cat(sprintf("[P%d] Loading map and joining with documents...\n", p))

  map_dt <- fread(file.path(DATADIR, sprintf("map_p%d.csv", p)),
                  colClasses = c("integer64", "character", "character"))
  map_dt[, article_key := paste0(law_number, "|", law_article)]

  # Get justice_kind for each court_case_id from the map
  # We need to query the DB for justice_kind
  # Instead, load a pre-exported file or query inline
  # For efficiency, get unique case IDs and batch query

  case_ids <- unique(map_dt$court_case_id)
  cat(sprintf("[P%d] %d unique cases, querying justice_kind...\n", p, length(case_ids)))

  # Export justice_kind for this period's cases via temp file
  jk_file <- file.path(DATADIR, sprintf("justice_kind_p%d.csv", p))
  if (!file.exists(jk_file)) {
    # Build period year range
    period_years <- list(2007:2013, 2014:2016, 2017:2019, 2020:2021, 2022:2026)
    years <- period_years[[p]]
    union_sql <- paste(sapply(years, function(y)
      sprintf("SELECT doc_id, justice_kind FROM edrsr_documents_p_%d", y)),
      collapse = " UNION ALL ")
    cmd <- sprintf(
      'docker exec secondlayer-postgres-local psql -U secondlayer -d secondlayer_local --csv -c "%s"',
      union_sql)
    system(cmd, intern = FALSE)
    # Actually, use COPY for speed
    copy_sql <- sprintf("COPY (%s) TO STDOUT WITH (FORMAT csv, HEADER)", union_sql)
    cmd2 <- sprintf(
      "docker exec secondlayer-postgres-local psql -U secondlayer -d secondlayer_local -c \"%s\" > %s",
      copy_sql, jk_file)
    system(cmd2)
  }

  jk <- fread(jk_file)
  setnames(jk, c("doc_id", "justice_kind"))

  # Join: for each article_key, find dominant justice_kind
  map_jk <- merge(map_dt[, .(court_case_id, article_key)], jk,
                  by.x = "court_case_id", by.y = "doc_id", all.x = FALSE)

  art_jk <- map_jk[, .(
    dominant_jk = as.integer(names(sort(table(justice_kind), decreasing = TRUE))[1]),
    n_cases = .N
  ), by = article_key]

  # Join with community assignments
  comm_dt <- comms[[p]][, .(node, community = rank)]
  merged <- merge(comm_dt, art_jk, by.x = "node", by.y = "article_key")

  # Compute NMI between community and dominant_jk
  nmi_val <- compare(merged$community, merged$dominant_jk, method = "nmi")
  ari_val <- compare(merged$community, merged$dominant_jk, method = "adjusted.rand")

  cat(sprintf("[P%d] Matched %d articles. NMI(community, justice_kind) = %.4f, ARI = %.4f\n",
              p, nrow(merged), nmi_val, ari_val))

  # Cross-tab
  cat(sprintf("[P%d] Cross-tabulation:\n", p))
  ct <- merged[, .N, by = .(community, dominant_jk)][order(community, -N)]
  ct_wide <- dcast(ct, community ~ dominant_jk, value.var = "N", fill = 0)
  print(ct_wide)
  cat("\n")

  rm(map_dt, map_jk, jk, art_jk, merged)
  gc(verbose = FALSE)
}

# ================================================================
# TASK 3: Formal NMI comparison test (pairwise bootstrap)
# ================================================================
cat("\n=== TASK 3: Formal NMI comparison (pairwise bootstrap) ===\n\n")

# Load all community assignments
results_nmi <- list()
for (i in 1:4) {
  nodes_a <- setNames(comms[[i]]$rank, comms[[i]]$node)
  nodes_b <- setNames(comms[[i+1]]$rank, comms[[i+1]]$node)
  shared <- intersect(names(nodes_a), names(nodes_b))

  N_BOOT <- 1000L
  SAMPLE_SIZE <- min(1000L, length(shared))

  nmi_boot <- numeric(N_BOOT)
  for (b in seq_len(N_BOOT)) {
    idx <- sample(shared, SAMPLE_SIZE)
    nmi_boot[b] <- compare(nodes_a[idx], nodes_b[idx], method = "nmi")
  }

  results_nmi[[i]] <- list(
    transition = sprintf("P%d->P%d", i, i+1),
    shared = length(shared),
    nmi_mean = mean(nmi_boot),
    nmi_sd = sd(nmi_boot),
    nmi_ci_lo = quantile(nmi_boot, 0.025),
    nmi_ci_hi = quantile(nmi_boot, 0.975),
    boot_samples = nmi_boot
  )

  cat(sprintf("%s: NMI = %.4f [%.4f, %.4f] (1000 bootstrap)\n",
              results_nmi[[i]]$transition, results_nmi[[i]]$nmi_mean,
              results_nmi[[i]]$nmi_ci_lo, results_nmi[[i]]$nmi_ci_hi))
}

# Pairwise comparison: is P4->P5 significantly lower than each other transition?
cat("\nPairwise comparison (P4->P5 vs others):\n")
war_boot <- results_nmi[[4]]$boot_samples
for (i in 1:3) {
  other_boot <- results_nmi[[i]]$boot_samples
  # Proportion of bootstrap samples where P4->P5 < other transition
  diff_boot <- other_boot - war_boot
  p_val <- mean(diff_boot <= 0)  # P(other <= war), should be small if war is lower
  cat(sprintf("  P4->P5 vs %s: delta = %.4f, p = %.4f (one-sided)\n",
              results_nmi[[i]]$transition, mean(diff_boot), p_val))
}

# ================================================================
# TASK 2: Sub-period P5 (2022-23 vs 2024-26)
# ================================================================
cat("\n=== TASK 2: Sub-period analysis P5 ===\n")
cat("Exporting sub-periods from map_p5.csv...\n")

# Split P5 into P5a (2022-2023) and P5b (2024-2026)
# Need justice_kind file to get years... actually we need adjudication_date
# Simpler: export from DB directly

p5a_file <- file.path(DATADIR, "map_p5a.csv")
p5b_file <- file.path(DATADIR, "map_p5b.csv")

if (!file.exists(p5a_file)) {
  cat("Exporting P5a (2022-2023)...\n")
  sql_a <- "COPY (SELECT f.court_case_id, f.law_number, f.law_article FROM _lcc_freq f INNER JOIN (SELECT doc_id FROM edrsr_documents_p_2022 UNION ALL SELECT doc_id FROM edrsr_documents_p_2023) d ON f.court_case_id = d.doc_id) TO STDOUT WITH (FORMAT csv, HEADER)"
  cmd_a <- sprintf('docker exec secondlayer-postgres-local psql -U secondlayer -d secondlayer_local -c "%s" > %s', sql_a, p5a_file)
  system(cmd_a)
}

if (!file.exists(p5b_file)) {
  cat("Exporting P5b (2024-2026)...\n")
  sql_b <- "COPY (SELECT f.court_case_id, f.law_number, f.law_article FROM _lcc_freq f INNER JOIN (SELECT doc_id FROM edrsr_documents_p_2024 UNION ALL SELECT doc_id FROM edrsr_documents_p_2025 UNION ALL SELECT doc_id FROM edrsr_documents_p_2026) d ON f.court_case_id = d.doc_id) TO STDOUT WITH (FORMAT csv, HEADER)"
  cmd_b <- sprintf('docker exec secondlayer-postgres-local psql -U secondlayer -d secondlayer_local -c "%s" > %s', sql_b, p5b_file)
  system(cmd_b)
}

cat("Loading sub-periods...\n")

compute_subperiod <- function(file, label, Ly, threshold_per_yr = 5) {
  cat(sprintf("[%s] Loading...\n", label))
  dt <- fread(file, colClasses = c("integer64", "character", "character"))
  dt[, article_key := paste0(law_number, "|", law_article)]
  min_cocit <- threshold_per_yr * Ly

  cat(sprintf("[%s] Raw: %d tuples, %d cases, %d articles\n",
              label, nrow(dt), uniqueN(dt$court_case_id), uniqueN(dt$article_key)))

  # Pre-filter
  article_counts <- dt[, .(n = uniqueN(court_case_id)), by = article_key]
  keep <- article_counts[n >= min_cocit]$article_key
  dt <- dt[article_key %in% keep]

  cat(sprintf("[%s] After filter (>=%d): %d articles, %d tuples\n",
              label, min_cocit, uniqueN(dt$article_key), nrow(dt)))

  # Sparse matrix
  case_ids <- unique(dt$court_case_id)
  article_ids <- unique(dt$article_key)
  dt[, case_idx := match(court_case_id, case_ids)]
  dt[, art_idx := match(article_key, article_ids)]

  M <- sparseMatrix(i = dt$case_idx, j = dt$art_idx, x = 1,
                    dims = c(length(case_ids), length(article_ids)),
                    dimnames = list(NULL, article_ids))

  cat(sprintf("[%s] crossprod...\n", label))
  cocit <- crossprod(M)
  cocit_tri <- triu(cocit, k = 1)
  cocit_t <- as(cocit_tri, "TsparseMatrix")

  edges_dt <- data.table(
    i = cocit_t@i + 1L, j = cocit_t@j + 1L,
    weight_raw = as.integer(cocit_t@x)
  )
  edges_dt[, weight_norm := weight_raw / Ly]
  edges_dt <- edges_dt[weight_norm >= threshold_per_yr]

  rm(M, cocit, cocit_tri, cocit_t, dt); gc(verbose = FALSE)

  # Build graph
  g <- make_empty_graph(n = length(article_ids), directed = FALSE)
  V(g)$name <- article_ids
  if (nrow(edges_dt) > 0) {
    g <- add_edges(g, as.vector(t(edges_dt[, .(i, j)])), weight = edges_dt$weight_norm)
  }
  non_isolated <- which(degree(g) > 0)
  g_sub <- induced_subgraph(g, non_isolated)
  rm(g); gc(verbose = FALSE)

  cat(sprintf("[%s] Graph: %d nodes, %d edges\n", label, vcount(g_sub), ecount(g_sub)))

  # Leiden
  comm <- cluster_leiden(g_sub, weights = E(g_sub)$weight,
                         objective_function = "modularity",
                         resolution = 1.0, n_iterations = 5)
  mem <- membership(comm)
  q <- modularity(g_sub, mem, weights = E(g_sub)$weight)
  k <- length(unique(mem))

  cat(sprintf("[%s] Q = %.4f, k = %d\n", label, q, k))

  list(
    label = label,
    nodes = vcount(g_sub),
    edges = ecount(g_sub),
    Q = q, k = k,
    membership = setNames(mem, V(g_sub)$name)
  )
}

p5a <- compute_subperiod(p5a_file, "P5a(2022-23)", Ly = 2)
gc(verbose = FALSE)
p5b <- compute_subperiod(p5b_file, "P5b(2024-26)", Ly = 3)

# NMI between P5a and P5b
shared_5 <- intersect(names(p5a$membership), names(p5b$membership))
nmi_5ab <- compare(p5a$membership[shared_5], p5b$membership[shared_5], method = "nmi")
ari_5ab <- compare(p5a$membership[shared_5], p5b$membership[shared_5], method = "adjusted.rand")

cat(sprintf("\nP5a vs P5b: shared=%d, NMI=%.4f, ARI=%.4f\n",
            length(shared_5), nmi_5ab, ari_5ab))
cat(sprintf("P5a: k=%d, Q=%.4f | P5b: k=%d, Q=%.4f\n",
            p5a$k, p5a$Q, p5b$k, p5b$Q))

# Also: NMI between P4 and P5a, P5a and P5b
p4_mem <- setNames(comms[[4]]$rank, comms[[4]]$node)
shared_4a <- intersect(names(p4_mem), names(p5a$membership))
nmi_4a <- compare(p4_mem[shared_4a], p5a$membership[shared_4a], method = "nmi")

cat(sprintf("P4 vs P5a: shared=%d, NMI=%.4f\n", length(shared_4a), nmi_4a))
cat(sprintf("P4 vs P5(full): NMI=0.768 | P4 vs P5a: NMI=%.4f | P5a vs P5b: NMI=%.4f\n",
            nmi_4a, nmi_5ab))

if (nmi_5ab > nmi_4a) {
  cat(">>> P5a-P5b stability HIGHER than P4-P5a disruption => reorganization confirmed\n")
} else {
  cat(">>> P5a-P5b stability LOWER than P4-P5a => still in transition\n")
}

cat("\n=== All validation tasks complete ===\n")
