#!/usr/bin/env Rscript
# Boundary sensitivity: shift P4/P5 boundary ±1 year
# Baseline: P4=2020-2021, P5=2022-2026 (boundary at 2022)
# Shift+1:  P4'=2020-2022, P5'=2023-2026 (boundary at 2023)
# Shift-1:  P4'=2020,      P5'=2021-2026 (boundary at 2021)

library(data.table)
library(Matrix)
library(igraph)

DATADIR <- "/tmp/citation-analysis"
CONTAINER <- "secondlayer-postgres-local"

export_period <- function(years, outfile) {
  if (file.exists(outfile)) {
    cat(sprintf("  %s exists, skipping\n", outfile))
    return()
  }
  doc_sql <- paste(sapply(years, function(y)
    sprintf("SELECT doc_id FROM edrsr_documents_p_%d", y)), collapse = " UNION ALL ")
  sql <- sprintf("COPY (SELECT f.court_case_id, f.law_number, f.law_article FROM _lcc_freq f INNER JOIN (%s) d ON f.court_case_id = d.doc_id) TO STDOUT WITH (FORMAT csv, HEADER)", doc_sql)
  cmd <- sprintf('docker exec %s psql -U secondlayer -d secondlayer_local -c "%s" > %s', CONTAINER, sql, outfile)
  cat(sprintf("  Exporting %s (%s)...\n", outfile, paste(years, collapse=",")))
  system(cmd)
  n <- as.integer(system(sprintf("wc -l < %s", outfile), intern = TRUE))
  cat(sprintf("  %d lines\n", n))
}

compute_community <- function(file, label, Ly, threshold_per_yr = 5) {
  cat(sprintf("[%s] Loading...\n", label))
  dt <- fread(file, colClasses = c("integer64", "character", "character"))
  dt[, article_key := paste0(law_number, "|", law_article)]
  min_cocit <- threshold_per_yr * Ly

  cat(sprintf("[%s] %d tuples, %d cases, %d articles\n",
              label, nrow(dt), uniqueN(dt$court_case_id), uniqueN(dt$article_key)))

  article_counts <- dt[, .(n = uniqueN(court_case_id)), by = article_key]
  keep <- article_counts[n >= min_cocit]$article_key
  dt <- dt[article_key %in% keep]

  case_ids <- unique(dt$court_case_id)
  article_ids <- unique(dt$article_key)
  dt[, case_idx := match(court_case_id, case_ids)]
  dt[, art_idx := match(article_key, article_ids)]

  M <- sparseMatrix(i = dt$case_idx, j = dt$art_idx, x = 1,
                    dims = c(length(case_ids), length(article_ids)),
                    dimnames = list(NULL, article_ids))

  cat(sprintf("[%s] M: %d x %d, crossprod...\n", label, nrow(M), ncol(M)))
  cocit <- crossprod(M)
  cocit_tri <- triu(cocit, k = 1)
  cocit_t <- as(cocit_tri, "TsparseMatrix")

  edges_dt <- data.table(i = cocit_t@i + 1L, j = cocit_t@j + 1L,
                          weight_raw = as.integer(cocit_t@x))
  edges_dt[, weight_norm := weight_raw / Ly]
  edges_dt <- edges_dt[weight_norm >= threshold_per_yr]
  rm(M, cocit, cocit_tri, cocit_t, dt); gc(verbose = FALSE)

  g <- make_empty_graph(n = length(article_ids), directed = FALSE)
  V(g)$name <- article_ids
  if (nrow(edges_dt) > 0)
    g <- add_edges(g, as.vector(t(edges_dt[, .(i, j)])), weight = edges_dt$weight_norm)
  non_iso <- which(degree(g) > 0)
  g_sub <- induced_subgraph(g, non_iso)
  rm(g); gc(verbose = FALSE)

  comm <- cluster_leiden(g_sub, weights = E(g_sub)$weight,
                         objective_function = "modularity",
                         resolution = 1.0, n_iterations = 5)
  mem <- membership(comm)
  q <- modularity(g_sub, mem, weights = E(g_sub)$weight)
  k <- length(unique(mem))

  cat(sprintf("[%s] %d nodes, %d edges, Q=%.4f, k=%d\n",
              label, vcount(g_sub), ecount(g_sub), q, k))

  list(label = label, nodes = vcount(g_sub), edges = ecount(g_sub),
       Q = q, k = k, membership = setNames(mem, V(g_sub)$name))
}

nmi_between <- function(a, b) {
  shared <- intersect(names(a$membership), names(b$membership))
  nmi <- compare(a$membership[shared], b$membership[shared], method = "nmi")
  ari <- compare(a$membership[shared], b$membership[shared], method = "adjusted.rand")
  list(shared = length(shared), nmi = nmi, ari = ari)
}

# ── Export alternative period data ─────────────────────────────
cat("=== Exporting alternative period data ===\n")
export_period(2020, file.path(DATADIR, "map_boundary_p4_minus1.csv"))
export_period(2021:2026, file.path(DATADIR, "map_boundary_p5_minus1.csv"))
export_period(2020:2022, file.path(DATADIR, "map_boundary_p4_plus1.csv"))
export_period(2023:2026, file.path(DATADIR, "map_boundary_p5_plus1.csv"))

# ── Load P3 for reference (unchanged across all variants) ─────
cat("\n=== Loading P3 (reference, unchanged) ===\n")
p3_mem <- fread(file.path(DATADIR, "fullscale_communities_p3.csv"))
p3_rank <- p3_mem[, .N, by = community][order(-N)][, rank := .I]
p3_mem <- merge(p3_mem, p3_rank[, .(community, rank)], by = "community")
p3 <- list(label = "P3", membership = setNames(p3_mem$rank, p3_mem$node))

# ── Baseline: P4=2020-21, P5=2022-26 ─────────────────────────
cat("\n=== BASELINE (boundary=2022) ===\n")
p4_base_mem <- fread(file.path(DATADIR, "fullscale_communities_p4.csv"))
p4_base_rank <- p4_base_mem[, .N, by = community][order(-N)][, rank := .I]
p4_base_mem <- merge(p4_base_mem, p4_base_rank[, .(community, rank)], by = "community")
p4_base <- list(label = "P4(2020-21)", nodes = nrow(p4_base_mem),
                k = uniqueN(p4_base_mem$rank),
                membership = setNames(p4_base_mem$rank, p4_base_mem$node))

p5_base_mem <- fread(file.path(DATADIR, "fullscale_communities_p5.csv"))
p5_base_rank <- p5_base_mem[, .N, by = community][order(-N)][, rank := .I]
p5_base_mem <- merge(p5_base_mem, p5_base_rank[, .(community, rank)], by = "community")
p5_base <- list(label = "P5(2022-26)", nodes = nrow(p5_base_mem),
                k = uniqueN(p5_base_mem$rank),
                membership = setNames(p5_base_mem$rank, p5_base_mem$node))

base_nmi <- nmi_between(p4_base, p5_base)
cat(sprintf("Baseline P4->P5: NMI=%.4f, shared=%d\n", base_nmi$nmi, base_nmi$shared))

# ── Shift -1: P4'=2020, P5'=2021-2026 ────────────────────────
cat("\n=== SHIFT -1 (boundary=2021) ===\n")
p4_m1 <- compute_community(file.path(DATADIR, "map_boundary_p4_minus1.csv"), "P4'(2020)", Ly = 1)
gc(verbose = FALSE)
p5_m1 <- compute_community(file.path(DATADIR, "map_boundary_p5_minus1.csv"), "P5'(2021-26)", Ly = 6)
gc(verbose = FALSE)

m1_p3p4 <- nmi_between(p3, p4_m1)
m1_p4p5 <- nmi_between(p4_m1, p5_m1)
cat(sprintf("Shift-1 P3->P4': NMI=%.4f | P4'->P5': NMI=%.4f\n", m1_p3p4$nmi, m1_p4p5$nmi))

# ── Shift +1: P4'=2020-2022, P5'=2023-2026 ───────────────────
cat("\n=== SHIFT +1 (boundary=2023) ===\n")
p4_p1 <- compute_community(file.path(DATADIR, "map_boundary_p4_plus1.csv"), "P4'(2020-22)", Ly = 3)
gc(verbose = FALSE)
p5_p1 <- compute_community(file.path(DATADIR, "map_boundary_p5_plus1.csv"), "P5'(2023-26)", Ly = 4)
gc(verbose = FALSE)

p1_p3p4 <- nmi_between(p3, p4_p1)
p1_p4p5 <- nmi_between(p4_p1, p5_p1)
cat(sprintf("Shift+1 P3->P4': NMI=%.4f | P4'->P5': NMI=%.4f\n", p1_p3p4$nmi, p1_p4p5$nmi))

# ── Summary ──────────────────────────────────────────────────
cat("\n=== BOUNDARY SENSITIVITY SUMMARY ===\n")
cat(sprintf("%-25s %6s %6s %6s %6s %6s %6s\n",
            "Variant", "P4_k", "P5_k", "P3->P4", "P4->P5", "delta", ""))
cat(paste(rep("-", 75), collapse=""), "\n")

cat(sprintf("%-25s %6d %6d %6.3f %6.3f %+6.3f  baseline\n",
            "Baseline (2022)", p4_base$k, p5_base$k,
            nmi_between(p3, p4_base)$nmi, base_nmi$nmi, 0.0))

cat(sprintf("%-25s %6d %6d %6.3f %6.3f %+6.3f\n",
            "Shift-1 (2021)", p4_m1$k, p5_m1$k,
            m1_p3p4$nmi, m1_p4p5$nmi, m1_p4p5$nmi - base_nmi$nmi))

cat(sprintf("%-25s %6d %6d %6.3f %6.3f %+6.3f\n",
            "Shift+1 (2023)", p4_p1$k, p5_p1$k,
            p1_p3p4$nmi, p1_p4p5$nmi, p1_p4p5$nmi - base_nmi$nmi))

cat("\nDone.\n")
