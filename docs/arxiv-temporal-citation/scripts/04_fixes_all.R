#!/usr/bin/env Rscript
# Fixes #1-#8: Fixed node set, Leiden, bootstrap NMI, null model Q, period normalization
library(data.table)
library(Matrix)
library(igraph)
library(parallel)

DATADIR <- "/tmp/citation-analysis"
NCORES <- 3L  # reduce cores to avoid OOM with 8M-edge graphs
FIXED_NODES <- fread(file.path(DATADIR, "fixed_nodes.tsv"), sep = "\t")$article_key
PERIOD_YEARS <- c(7, 3, 3, 2, 5)
N_BOOT <- 30L
N_NULL <- 10L

cat(sprintf("Fixed node set: %d articles\n", length(FIXED_NODES)))
cat(sprintf("Running %d bootstrap iterations per period\n", N_BOOT))

compute_period <- function(p) {
  t0 <- proc.time()
  cat(sprintf("[P%d] Loading...\n", p))

  dt <- fread(file.path(DATADIR, sprintf("fixed_p%d.tsv", p)),
              sep = "\t", colClasses = c("integer64", "character"))

  # Use only fixed node set (should already be filtered, but enforce)
  dt <- dt[article_key %in% FIXED_NODES]

  cat(sprintf("[P%d] %d tuples, %d cases, %d articles\n",
              p, nrow(dt), uniqueN(dt$court_case_id), uniqueN(dt$article_key)))

  # Build sparse matrix with FIXED columns (all 11812 articles, same order)
  case_ids <- unique(dt$court_case_id)
  dt[, case_idx := match(court_case_id, case_ids)]
  dt[, art_idx := match(article_key, FIXED_NODES)]

  M <- sparseMatrix(i = dt$case_idx, j = dt$art_idx, x = 1,
                    dims = c(length(case_ids), length(FIXED_NODES)),
                    dimnames = list(NULL, FIXED_NODES))

  cat(sprintf("[P%d] Sparse matrix: %d × %d\n", p, nrow(M), ncol(M)))

  # Cocitation
  cat(sprintf("[P%d] crossprod...\n", p))
  cocit <- crossprod(M)

  # Normalize by period years (Fix #4)
  cocit_norm <- cocit / PERIOD_YEARS[p]

  # Extract upper triangle, threshold: weight_per_year >= 5
  cocit_tri <- triu(cocit_norm, k = 1)
  cocit_t <- as(cocit_tri, "TsparseMatrix")

  edges_dt <- data.table(
    i = cocit_t@i + 1L,
    j = cocit_t@j + 1L,
    weight = cocit_t@x
  )
  edges_dt <- edges_dt[weight >= 5]  # 5 co-citations per year

  cat(sprintf("[P%d] Edges after threshold (>=5/yr): %d\n", p, nrow(edges_dt)))

  # Build graph on fixed node set
  g <- make_empty_graph(n = length(FIXED_NODES), directed = FALSE)
  V(g)$name <- FIXED_NODES
  g <- add_edges(g, as.vector(t(edges_dt[, .(i, j)])), weight = edges_dt$weight)

  # Remove isolated vertices for community detection but keep for NMI
  non_isolated <- which(degree(g) > 0)
  g_sub <- induced_subgraph(g, non_isolated)

  cat(sprintf("[P%d] Graph: %d nodes (non-isolated), %d edges, density=%.4f\n",
              p, vcount(g_sub), ecount(g_sub), graph.density(g_sub)))

  # --- Fix #7: Leiden (N_BOOT runs for Fix #6) ---
  cat(sprintf("[P%d] Running Leiden %dx...\n", p, N_BOOT))
  q_vals <- numeric(N_BOOT)
  memberships <- matrix(0L, nrow = vcount(g_sub), ncol = N_BOOT)

  for (b in 1:N_BOOT) {
    comm <- tryCatch(
      cluster_leiden(g_sub, weights = E(g_sub)$weight,
                     objective_function = "modularity",
                     resolution = 1.0, n_iterations = 5),
      error = function(e) cluster_louvain(g_sub, weights = E(g_sub)$weight)
    )
    q_vals[b] <- modularity(comm)
    memberships[, b] <- membership(comm)
  }

  # Consensus: most common assignment per node
  consensus_mem <- apply(memberships, 1, function(x) {
    as.integer(names(sort(table(x), decreasing = TRUE))[1])
  })

  # --- Fix #2: Null model Q (rewired graph, faster than degseq for dense) ---
  cat(sprintf("[P%d] Null model Q (%d rewired graphs)...\n", p, N_NULL))
  q_null <- numeric(N_NULL)
  for (r in 1:N_NULL) {
    g_rand <- tryCatch(
      rewire(g_sub, with = keeping_degseq(niter = ecount(g_sub) * 2)),
      error = function(e) rewire(g_sub, with = keeping_degseq(niter = ecount(g_sub)))
    )
    E(g_rand)$weight <- sample(E(g_sub)$weight)
    comm_rand <- cluster_leiden(g_rand, weights = E(g_rand)$weight,
                                objective_function = "modularity",
                                resolution = 1.0, n_iterations = 3)
    q_null[r] <- modularity(comm_rand)
  }

  q_mean <- mean(q_vals)
  q_sd <- sd(q_vals)
  q_null_mean <- mean(q_null)
  q_null_sd <- sd(q_null)
  q_zscore <- (q_mean - q_null_mean) / q_null_sd

  n_communities <- length(unique(consensus_mem))

  cat(sprintf("[P%d] Q = %.4f ± %.4f, Q_null = %.4f ± %.4f, z = %.1f, k = %d\n",
              p, q_mean, q_sd, q_null_mean, q_null_sd, q_zscore, n_communities))

  # Save results
  result <- list(
    period = p,
    nodes_active = vcount(g_sub),
    edges = ecount(g_sub),
    density = graph.density(g_sub),
    Q_mean = q_mean, Q_sd = q_sd,
    Q_null_mean = q_null_mean, Q_null_sd = q_null_sd,
    Q_zscore = q_zscore,
    n_communities = n_communities,
    consensus_membership = setNames(consensus_mem, V(g_sub)$name),
    time = (proc.time() - t0)[3]
  )

  # Save consensus membership
  comm_out <- data.table(node = V(g_sub)$name, community = consensus_mem, period = p)
  fwrite(comm_out, file.path(DATADIR, sprintf("fixed_communities_p%d.csv", p)))

  cat(sprintf("[P%d] Done in %.0fs\n", p, result$time))
  return(result)
}

# Run all periods in parallel
cat("=== Starting parallel computation ===\n")
t_total <- proc.time()
results <- mclapply(1:5, compute_period, mc.cores = NCORES)
total_time <- (proc.time() - t_total)[3]

cat(sprintf("\n=== All periods done in %.0fs ===\n\n", total_time))

# --- Summary table ---
cat("Period | Nodes | Edges | Density | Q±sd | Q_null | z-score | Communities\n")
cat("-------|-------|-------|---------|------|--------|---------|------------\n")
for (r in results) {
  cat(sprintf("  P%d   | %5d | %6d | %.4f | %.3f±%.3f | %.3f | %5.1f | %d\n",
              r$period, r$nodes_active, r$edges, r$density,
              r$Q_mean, r$Q_sd, r$Q_null_mean, r$Q_zscore, r$n_communities))
}

# --- Fix #1: Bootstrap NMI on equal-size subsamples ---
cat("\n=== NMI between consecutive periods (bootstrap, fixed nodes) ===\n")
for (i in 1:4) {
  nodes_a <- names(results[[i]]$consensus_membership)
  nodes_b <- names(results[[i+1]]$consensus_membership)
  shared <- intersect(nodes_a, nodes_b)

  mem_a <- results[[i]]$consensus_membership[shared]
  mem_b <- results[[i+1]]$consensus_membership[shared]

  # Full NMI
  nmi_full <- compare(mem_a, mem_b, method = "nmi")
  ami_full <- compare(mem_a, mem_b, method = "adjusted.rand")

  # Bootstrap: subsample to min size across all transitions
  min_shared <- 1000  # fixed subsample size
  nmi_boot <- numeric(N_BOOT)
  for (b in 1:N_BOOT) {
    idx <- sample(length(shared), min(min_shared, length(shared)))
    nmi_boot[b] <- compare(mem_a[idx], mem_b[idx], method = "nmi")
  }

  cat(sprintf("P%d→P%d: shared=%d, NMI=%.4f (boot: %.4f±%.4f), ARI=%.4f\n",
              i, i+1, length(shared), nmi_full, mean(nmi_boot), sd(nmi_boot), ami_full))
}

# Save summary
saveRDS(results, file.path(DATADIR, "fixed_results.rds"))
cat("\nResults saved to fixed_results.rds\n")
