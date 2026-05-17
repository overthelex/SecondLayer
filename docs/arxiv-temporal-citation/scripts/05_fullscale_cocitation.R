#!/usr/bin/env Rscript
# Full-scale temporal co-citation: no fixed node set, no top-N filter.
# Replaces 03_cocitation_sparse.R + 04_fixes_all.R
#
# Each period uses ALL articles that survive the co-citation threshold.
# NMI is computed on shared active nodes between consecutive periods.
#
# Outputs per period:
#   fullscale_communities_p{1-5}.csv
#   fullscale_cocitation_p{1-5}.csv
# Summary:
#   fullscale_summary.json
#
# Usage:
#   Rscript 05_fullscale_cocitation.R
#   Rscript 05_fullscale_cocitation.R --threshold 3 --resolution 1.0 --runs 30

library(data.table)
library(Matrix)
library(igraph)
library(parallel)
library(jsonlite)

# ── CLI args ──────────────────────────────────────────────────
args <- commandArgs(trailingOnly = TRUE)
parse_arg <- function(flag, default) {
  idx <- match(flag, args)
  if (!is.na(idx) && idx < length(args)) as.numeric(args[idx + 1]) else default
}

DATADIR       <- Sys.getenv("DATADIR", "/tmp/citation-analysis")
COCIT_PER_YR  <- parse_arg("--threshold", 5)    # min co-citations per year
GAMMA         <- parse_arg("--resolution", 1.0)  # Leiden resolution
N_LEIDEN      <- as.integer(parse_arg("--runs", 30))
N_NULL        <- 5L
N_BOOT        <- 50L
BOOT_SAMPLE   <- 1000L
NCORES        <- min(5L, detectCores())

PERIOD_YEARS  <- c(7, 3, 3, 2, 5)
PERIOD_LABELS <- c("2007-2013", "2014-2016", "2017-2019", "2020-2021", "2022-2026")

cat(sprintf("=== Full-scale temporal co-citation analysis ===\n"))
cat(sprintf("Data dir:    %s\n", DATADIR))
cat(sprintf("Threshold:   >= %d co-citations/year\n", COCIT_PER_YR))
cat(sprintf("Resolution:  %.2f\n", GAMMA))
cat(sprintf("Leiden runs: %d\n", N_LEIDEN))
cat(sprintf("Null models: %d\n", N_NULL))
cat(sprintf("Bootstrap:   %d subsamples × %d nodes\n", N_BOOT, BOOT_SAMPLE))
cat(sprintf("Cores:       %d\n\n", NCORES))

# ── Per-period computation ────────────────────────────────────

compute_period <- function(p) {
  t0 <- proc.time()
  Ly <- PERIOD_YEARS[p]
  min_cocit <- COCIT_PER_YR * Ly  # absolute threshold for this period

  cat(sprintf("[P%d] Loading %s...\n", p, PERIOD_LABELS[p]))

  dt <- fread(file.path(DATADIR, sprintf("map_p%d.csv", p)),
              colClasses = c("integer64", "character", "character"))

  dt[, article_key := paste0(law_number, "|", law_article)]
  n_total_tuples <- nrow(dt)
  n_total_cases  <- uniqueN(dt$court_case_id)
  n_total_arts   <- uniqueN(dt$article_key)

  cat(sprintf("[P%d] Raw: %d tuples, %d cases, %d articles\n",
              p, n_total_tuples, n_total_cases, n_total_arts))

  # Pre-filter: articles cited by fewer than min_cocit decisions
  # cannot generate co-citation weight >= min_cocit with ANY article.
  article_counts <- dt[, .(n = uniqueN(court_case_id)), by = article_key]
  keep_articles <- article_counts[n >= min_cocit]$article_key
  dt <- dt[article_key %in% keep_articles]

  cat(sprintf("[P%d] After pre-filter (>=%d cites): %d articles, %d tuples, %d cases\n",
              p, min_cocit, uniqueN(dt$article_key), nrow(dt), uniqueN(dt$court_case_id)))

  # Encode as integer indices
  case_ids   <- unique(dt$court_case_id)
  article_ids <- unique(dt$article_key)
  dt[, case_idx := match(court_case_id, case_ids)]
  dt[, art_idx  := match(article_key, article_ids)]

  n_cases <- length(case_ids)
  n_arts  <- length(article_ids)

  # Sparse binary matrix: cases × articles
  M <- sparseMatrix(i = dt$case_idx, j = dt$art_idx, x = 1,
                    dims = c(n_cases, n_arts),
                    dimnames = list(NULL, article_ids))

  cat(sprintf("[P%d] Sparse M: %d × %d (nnz = %d)\n", p, n_cases, n_arts, nnzero(M)))

  # Co-citation: M^T M
  cat(sprintf("[P%d] crossprod...\n", p))
  t1 <- proc.time()
  cocit <- crossprod(M)
  cat(sprintf("[P%d] crossprod: %.1fs, nnz = %d\n", p, (proc.time() - t1)[3], nnzero(cocit)))

  # Year-normalize and threshold
  cocit_tri <- triu(cocit, k = 1)
  cocit_t   <- as(cocit_tri, "TsparseMatrix")

  edges_dt <- data.table(
    i      = cocit_t@i + 1L,
    j      = cocit_t@j + 1L,
    weight_raw = as.integer(cocit_t@x)
  )
  edges_dt[, weight_norm := weight_raw / Ly]
  edges_dt <- edges_dt[weight_norm >= COCIT_PER_YR]

  cat(sprintf("[P%d] Edges after threshold (>=%d/yr): %d\n", p, COCIT_PER_YR, nrow(edges_dt)))

  # Free memory
  rm(M, cocit, cocit_tri, cocit_t, dt)
  gc(verbose = FALSE)

  # Build igraph on all non-isolated articles
  g <- make_empty_graph(n = n_arts, directed = FALSE)
  V(g)$name <- article_ids
  if (nrow(edges_dt) > 0) {
    g <- add_edges(g, as.vector(t(edges_dt[, .(i, j)])),
                   weight = edges_dt$weight_norm)
  }

  non_isolated <- which(degree(g) > 0)
  g_sub <- induced_subgraph(g, non_isolated)
  rm(g); gc(verbose = FALSE)

  n_nodes <- vcount(g_sub)
  n_edges <- ecount(g_sub)
  density <- if (n_nodes > 1) edge_density(g_sub) else 0

  cat(sprintf("[P%d] Graph: %d nodes, %d edges, density=%.5f\n",
              p, n_nodes, n_edges, density))

  # ── Leiden (N_LEIDEN runs, parallel, consensus) ─────────────
  # Use 4 cores to avoid OOM on large graphs (each fork copies graph ~20GB)
  N_LEIDEN_CORES <- min(4L, detectCores())
  cat(sprintf("[P%d] Leiden (%d runs, gamma=%.2f, %d cores)...\n", p, N_LEIDEN, GAMMA, N_LEIDEN_CORES))

  leiden_results <- mclapply(seq_len(N_LEIDEN), function(b) {
    comm <- tryCatch(
      cluster_leiden(g_sub, weights = E(g_sub)$weight,
                     objective_function = "modularity",
                     resolution = GAMMA, n_iterations = 5),
      error = function(e) cluster_louvain(g_sub, weights = E(g_sub)$weight)
    )
    mem <- membership(comm)
    q <- modularity(g_sub, mem, weights = E(g_sub)$weight)
    list(q = q, mem = mem)
  }, mc.cores = N_LEIDEN_CORES)

  # Filter out NULL results (OOM-killed forks)
  leiden_results <- Filter(Negate(is.null), leiden_results)
  cat(sprintf("[P%d] Leiden: %d/%d runs succeeded\n", p, length(leiden_results), N_LEIDEN))

  q_vals <- sapply(leiden_results, `[[`, "q")
  memberships <- do.call(cbind, lapply(leiden_results, `[[`, "mem"))
  rm(leiden_results); gc(verbose = FALSE)

  # Consensus: most common assignment per node
  consensus_mem <- apply(memberships, 1, function(x) {
    as.integer(names(sort(table(x), decreasing = TRUE))[1])
  })
  rm(memberships); gc(verbose = FALSE)

  cat(sprintf("[P%d] Leiden done: Q = %.4f ± %.4f\n", p, mean(q_vals), sd(q_vals)))

  # ── Null model Q (degree-preserving rewiring, sequential) ───
  # Rewire + Leiden on 100M-edge graphs uses 25-30GB per fork; run sequentially
  cat(sprintf("[P%d] Null model Q (%d rewired graphs, sequential)...\n", p, N_NULL))
  gc(verbose = FALSE)
  q_null <- numeric(N_NULL)
  for (r in seq_len(N_NULL)) {
    g_rand <- tryCatch(
      rewire(g_sub, with = keeping_degseq(niter = n_edges)),
      error = function(e) rewire(g_sub, with = keeping_degseq(niter = n_edges %/% 2))
    )
    E(g_rand)$weight <- sample(E(g_sub)$weight)
    comm_rand <- tryCatch(
      cluster_leiden(g_rand, weights = E(g_rand)$weight,
                     objective_function = "modularity",
                     resolution = GAMMA, n_iterations = 3),
      error = function(e) cluster_louvain(g_rand, weights = E(g_rand)$weight)
    )
    q_null[r] <- modularity(g_rand, membership(comm_rand), weights = E(g_rand)$weight)
    rm(g_rand, comm_rand); gc(verbose = FALSE)
    cat(sprintf("[P%d] Null %d/%d: Q=%.4f\n", p, r, N_NULL, q_null[r]))
  }

  q_mean     <- mean(q_vals)
  q_sd       <- sd(q_vals)
  q_null_mean <- mean(q_null)
  q_null_sd  <- sd(q_null)
  q_zscore   <- if (q_null_sd > 0) (q_mean - q_null_mean) / q_null_sd else Inf

  n_communities <- length(unique(consensus_mem))

  cat(sprintf("[P%d] Q = %.4f ± %.4f | Q_null = %.4f ± %.4f | z = %.1f | k = %d\n",
              p, q_mean, q_sd, q_null_mean, q_null_sd, q_zscore, n_communities))

  # ── Save communities ───────────────────────────────────────
  comm_out <- data.table(
    node      = V(g_sub)$name,
    community = consensus_mem,
    period    = p
  )
  outfile <- file.path(DATADIR, sprintf("fullscale_communities_p%d.csv", p))
  fwrite(comm_out, outfile)

  # ── Save co-citation edges ─────────────────────────────────
  edge_out <- data.table(
    node_a     = article_ids[edges_dt$i],
    node_b     = article_ids[edges_dt$j],
    weight_raw = edges_dt$weight_raw,
    weight_norm = edges_dt$weight_norm,
    period     = p
  )
  fwrite(edge_out, file.path(DATADIR, sprintf("fullscale_cocitation_p%d.csv", p)))

  elapsed <- (proc.time() - t0)[3]
  cat(sprintf("[P%d] Done in %.0fs\n\n", p, elapsed))

  list(
    period         = p,
    label          = PERIOD_LABELS[p],
    n_total_arts   = n_total_arts,
    n_filtered_arts = length(article_ids),
    n_nodes_active = n_nodes,
    n_edges        = n_edges,
    density        = density,
    Q_mean         = q_mean,
    Q_sd           = q_sd,
    Q_null_mean    = q_null_mean,
    Q_null_sd      = q_null_sd,
    Q_zscore       = q_zscore,
    n_communities  = n_communities,
    consensus      = setNames(consensus_mem, V(g_sub)$name),
    elapsed_sec    = elapsed
  )
}

# ── Run all periods (resume-aware) ────────────────────────────
t_global <- proc.time()

START_PERIOD <- as.integer(Sys.getenv("START_PERIOD", "1"))

results <- list()
for (p in 1:5) {
  cached <- file.path(DATADIR, sprintf("fullscale_communities_p%d.csv", p))
  if (p < START_PERIOD && file.exists(cached)) {
    cat(sprintf("[P%d] Loading cached results...\n", p))
    comm_dt <- fread(cached)
    cocit_dt <- fread(file.path(DATADIR, sprintf("fullscale_cocitation_p%d.csv", p)))
    results[[p]] <- list(
      period = p, label = PERIOD_LABELS[p],
      n_total_arts = NA, n_filtered_arts = uniqueN(c(cocit_dt$node_a, cocit_dt$node_b)),
      n_nodes_active = nrow(comm_dt), n_edges = nrow(cocit_dt),
      density = NA, Q_mean = NA, Q_sd = NA,
      Q_null_mean = NA, Q_null_sd = NA, Q_zscore = NA,
      n_communities = uniqueN(comm_dt$community),
      consensus = setNames(comm_dt$community, comm_dt$node),
      elapsed_sec = 0
    )
    rm(comm_dt, cocit_dt)
    cat(sprintf("[P%d] Loaded: %d nodes, %d communities\n",
                p, results[[p]]$n_nodes_active, results[[p]]$n_communities))
  } else {
    results[[p]] <- compute_period(p)
  }
  gc(verbose = FALSE)
}

total_time <- (proc.time() - t_global)[3]

# ── Summary table ─────────────────────────────────────────────
cat("\n=== SUMMARY ===\n\n")
cat(sprintf("%-10s %8s %8s %8s %9s %8s %8s %8s %3s\n",
            "Period", "AllArts", "Filtered", "Nodes", "Edges", "Density", "Q±sd", "Q_null", "k"))
cat(paste(rep("-", 85), collapse = ""), "\n")
for (r in results) {
  cat(sprintf("%-10s %8d %8d %8d %9d %8.5f %.3f±%.3f %.3f %3d\n",
              r$label, r$n_total_arts, r$n_filtered_arts, r$n_nodes_active,
              r$n_edges, r$density, r$Q_mean, r$Q_sd, r$Q_null_mean, r$n_communities))
}

# ── NMI between consecutive periods (bootstrap) ──────────────
cat("\n=== NMI (bootstrap, shared active nodes) ===\n\n")

nmi_results <- list()
for (i in 1:4) {
  nodes_a <- names(results[[i]]$consensus)
  nodes_b <- names(results[[i+1]]$consensus)
  shared  <- intersect(nodes_a, nodes_b)

  mem_a <- results[[i]]$consensus[shared]
  mem_b <- results[[i+1]]$consensus[shared]

  nmi_full <- compare(mem_a, mem_b, method = "nmi")
  ari_full <- compare(mem_a, mem_b, method = "adjusted.rand")

  nmi_boot <- numeric(N_BOOT)
  for (b in seq_len(N_BOOT)) {
    idx <- sample(length(shared), min(BOOT_SAMPLE, length(shared)))
    nmi_boot[b] <- compare(mem_a[idx], mem_b[idx], method = "nmi")
  }

  cat(sprintf("P%d→P%d: shared=%d, NMI=%.4f (boot: %.4f±%.4f), ARI=%.4f\n",
              i, i+1, length(shared), nmi_full, mean(nmi_boot), sd(nmi_boot), ari_full))

  nmi_results[[i]] <- list(
    transition   = sprintf("P%d→P%d", i, i+1),
    shared_nodes = length(shared),
    nmi          = nmi_full,
    nmi_boot_mu  = mean(nmi_boot),
    nmi_boot_sd  = sd(nmi_boot),
    ari          = ari_full
  )
}

# ── Resolution sensitivity (quick sweep on P3, the reform period) ─
cat("\n=== Resolution sensitivity (P3: 2017-2019) ===\n")
cat("Loading P3 graph for gamma sweep...\n")

p3_edges <- fread(file.path(DATADIR, "fullscale_cocitation_p3.csv"))
p3_nodes <- unique(c(p3_edges$node_a, p3_edges$node_b))
p3_key   <- setNames(seq_along(p3_nodes), p3_nodes)

g3 <- make_empty_graph(n = length(p3_nodes), directed = FALSE)
V(g3)$name <- p3_nodes
g3 <- add_edges(g3, as.vector(t(cbind(p3_key[p3_edges$node_a], p3_key[p3_edges$node_b]))),
                weight = p3_edges$weight_norm)

gammas <- c(0.5, 0.8, 1.0, 1.2, 1.5)
res_sens <- list()
cat(sprintf("%-8s %6s %6s\n", "gamma", "Q", "k"))
for (gam in gammas) {
  comm <- cluster_leiden(g3, weights = E(g3)$weight,
                         objective_function = "modularity",
                         resolution = gam, n_iterations = 5)
  q <- modularity(g3, membership(comm), weights = E(g3)$weight)
  k <- length(unique(membership(comm)))
  cat(sprintf("%-8.2f %6.4f %6d\n", gam, q, k))
  res_sens[[as.character(gam)]] <- list(gamma = gam, Q = q, k = k)
}

# ── Threshold sensitivity (P3) ────────────────────────────────
cat("\n=== Threshold sensitivity (P3, gamma=1.0) ===\n")

p3_raw <- fread(file.path(DATADIR, "fullscale_cocitation_p3.csv"))
thresholds <- c(3, 5, 7, 10)
thr_sens <- list()
cat(sprintf("%-10s %8s %8s %6s %6s\n", "Thr/yr", "Edges", "Nodes", "Q", "k"))
for (thr in thresholds) {
  sub <- p3_raw[weight_norm >= thr]
  sub_nodes <- unique(c(sub$node_a, sub$node_b))
  sub_key   <- setNames(seq_along(sub_nodes), sub_nodes)

  gt <- make_empty_graph(n = length(sub_nodes), directed = FALSE)
  V(gt)$name <- sub_nodes
  if (nrow(sub) > 0) {
    gt <- add_edges(gt, as.vector(t(cbind(sub_key[sub$node_a], sub_key[sub$node_b]))),
                    weight = sub$weight_norm)
  }
  comm <- cluster_leiden(gt, weights = E(gt)$weight,
                         objective_function = "modularity",
                         resolution = 1.0, n_iterations = 5)
  q <- modularity(gt, membership(comm), weights = E(gt)$weight)
  k <- length(unique(membership(comm)))
  cat(sprintf(">=%d/yr    %8d %8d %6.4f %6d\n", thr, ecount(gt), vcount(gt), q, k))
  thr_sens[[as.character(thr)]] <- list(threshold = thr, edges = ecount(gt),
                                         nodes = vcount(gt), Q = q, k = k)
}

# ── Save JSON summary ─────────────────────────────────────────
summary_out <- list(
  params = list(
    cocit_threshold_per_yr = COCIT_PER_YR,
    resolution_gamma       = GAMMA,
    leiden_runs            = N_LEIDEN,
    null_model_runs        = N_NULL,
    bootstrap_iterations   = N_BOOT,
    bootstrap_sample_size  = BOOT_SAMPLE
  ),
  periods = lapply(results, function(r) {
    r$consensus <- NULL  # don't dump huge vector to JSON
    r
  }),
  nmi = nmi_results,
  sensitivity_resolution = res_sens,
  sensitivity_threshold  = thr_sens,
  total_elapsed_sec      = total_time
)

json_path <- file.path(DATADIR, "fullscale_summary.json")
write_json(summary_out, json_path, pretty = TRUE, auto_unbox = TRUE)
cat(sprintf("\nSummary saved to %s\n", json_path))
cat(sprintf("Total elapsed: %.0fs (%.1f min)\n", total_time, total_time / 60))
