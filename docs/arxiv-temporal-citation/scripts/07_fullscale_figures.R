#!/usr/bin/env Rscript
# Generate all fullscale figures from community assignments
library(data.table)
library(ggplot2)
library(tikzDevice)
library(igraph)

DATADIR <- "/tmp/citation-analysis"
FIGDIR  <- normalizePath("../figures", mustWork = FALSE)
dir.create(FIGDIR, showWarnings = FALSE, recursive = TRUE)

PERIOD_LABELS <- c("2007--13", "2014--16", "2017--19", "2020--21", "2022--26")
PERIOD_SHORT  <- paste0("P", 1:5)

# Load all community assignments
cat("Loading community assignments...\n")
comms <- lapply(1:5, function(p) {
  dt <- fread(file.path(DATADIR, sprintf("fullscale_communities_p%d.csv", p)))
  dt[, period := p]
  dt
})
comms_all <- rbindlist(comms)

# Compute community sizes per period (relabel by size rank within each period)
cat("Computing community sizes...\n")
for (p in 1:5) {
  dt <- comms[[p]]
  size_rank <- dt[, .N, by = community][order(-N)]
  size_rank[, rank := .I]
  dt <- merge(dt, size_rank[, .(community, rank)], by = "community")
  comms[[p]] <- dt
}

# ================================================================
# FIGURE 3: Alluvial diagram (community flows between periods)
# ================================================================
cat("Figure 3: Alluvial diagram\n")

if (!requireNamespace("ggalluvial", quietly = TRUE)) {
  install.packages("ggalluvial", repos = "https://cloud.r-project.org")
}
library(ggalluvial)

# Build flows between consecutive periods
flows <- list()
for (i in 1:4) {
  dt_a <- comms[[i]][, .(node, comm_from = rank)]
  dt_b <- comms[[i+1]][, .(node, comm_to = rank)]
  shared <- merge(dt_a, dt_b, by = "node")
  flow <- shared[, .N, by = .(comm_from, comm_to)]
  flow[, transition := sprintf("P%d$\\to$P%d", i, i+1)]
  flows[[i]] <- flow
}

# For alluvial: need long format with period as stratum
# Build a node-level dataset with community at each period
node_periods <- list()
for (p in 1:5) {
  node_periods[[p]] <- comms[[p]][, .(node, community = rank, period = p)]
}
np <- rbindlist(node_periods)

# Only keep nodes present in all 5 periods (core set for alluvial)
node_counts <- np[, .N, by = node]
core_nodes <- node_counts[N == 5]$node
np_core <- np[node %in% core_nodes]
cat(sprintf("  Core nodes (present in all 5 periods): %d\n", length(core_nodes)))

# Label top communities, group small ones as "Other"
MAX_COMM <- 6
for (p in 1:5) {
  np_core[period == p & community > MAX_COMM, community := 99L]
}
np_core[, community := factor(community)]

# Aggregate for alluvial
alluvial_data <- dcast(np_core, node ~ period, value.var = "community")
setnames(alluvial_data, c("node", paste0("P", 1:5)))

# Count flows
agg <- alluvial_data[, .N, by = .(P1, P2, P3, P4, P5)]

colors_8 <- c(
  "1" = "#E41A1C", "2" = "#377EB8", "3" = "#4DAF4A", "4" = "#984EA3",
  "5" = "#FF7F00", "6" = "#A65628", "99" = "#999999"
)

tikz(file.path(FIGDIR, "fig3_alluvial.tex"), width = 6.5, height = 4, standAlone = FALSE)
ggplot(agg, aes(y = N, axis1 = P1, axis2 = P2, axis3 = P3, axis4 = P4, axis5 = P5)) +
  geom_alluvium(aes(fill = P1), alpha = 0.6, width = 1/6) +
  geom_stratum(width = 1/6, fill = "grey90", color = "grey50", linewidth = 0.3) +
  geom_text(stat = "stratum", aes(label = after_stat(stratum)), size = 2.5) +
  scale_x_discrete(limits = PERIOD_LABELS, expand = c(0.12, 0.05)) +
  scale_fill_manual(values = colors_8, guide = "none") +
  ylab("Articles") +
  theme_minimal(base_size = 10) +
  theme(
    axis.text.y = element_blank(),
    axis.ticks.y = element_blank(),
    panel.grid = element_blank()
  )
dev.off()

# ================================================================
# FIGURE NEW: Community size evolution (stacked bar)
# ================================================================
cat("Figure: Community size evolution\n")

size_data <- rbindlist(lapply(1:5, function(p) {
  dt <- comms[[p]]
  sizes <- dt[, .N, by = rank]
  sizes[, period := p]
  sizes[, label := PERIOD_LABELS[p]]
  # Cap small communities
  sizes[rank > MAX_COMM, rank := 99L]
  sizes[, .(count = sum(N)), by = .(period, label, rank)]
}))
size_data[, rank := factor(rank)]
size_data[, label := factor(label, levels = PERIOD_LABELS)]

tikz(file.path(FIGDIR, "fig11_community_sizes.tex"), width = 5.5, height = 3.5, standAlone = FALSE)
ggplot(size_data, aes(x = label, y = count, fill = rank)) +
  geom_col(position = "fill", width = 0.7) +
  scale_fill_manual(
    values = colors_8,
    labels = c(paste("Community", 1:6), "Other"),
    name = ""
  ) +
  scale_y_continuous("Share of active nodes", labels = function(x) paste0(x * 100, "\\%")) +
  xlab("Period") +
  theme_minimal(base_size = 10) +
  theme(legend.position = "bottom", legend.key.size = unit(0.35, "cm"))
dev.off()

# ================================================================
# FIGURE NEW: Transition heatmap (P4 -> P5)
# ================================================================
cat("Figure: Transition heatmap P4->P5\n")

dt4 <- comms[[4]][, .(node, from = rank)]
dt5 <- comms[[5]][, .(node, to = rank)]
shared45 <- merge(dt4, dt5, by = "node")

# Confusion matrix
conf <- shared45[, .N, by = .(from, to)]
conf[, from := factor(from)]
conf[, to := factor(to)]

# Normalize by row (fraction of P4 community going to each P5 community)
conf[, total_from := sum(N), by = from]
conf[, frac := N / total_from]

conf[, text_color := ifelse(frac > 0.4, "white", "black")]

tikz(file.path(FIGDIR, "fig12_transition_heatmap.tex"), width = 5.5, height = 3, standAlone = FALSE)
ggplot(conf, aes(x = to, y = from, fill = frac)) +
  geom_tile(color = "white", linewidth = 0.5) +
  geom_text(aes(label = sprintf("%.0f\\%%", frac * 100), color = text_color), size = 3.5, show.legend = FALSE) +
  scale_color_identity() +
  scale_fill_gradient(low = "#F7FBFF", high = "#08519C", name = "",
                      labels = function(x) paste0(x * 100, "\\%")) +
  scale_x_discrete("P5 community (2022--26)") +
  scale_y_discrete("P4 community (2020--21)") +
  theme_minimal(base_size = 10) +
  theme(legend.position = "bottom", legend.key.width = unit(1.5, "cm"),
        panel.grid = element_blank())
dev.off()

# Also do all 4 transitions in one figure
cat("Figure: All transition heatmaps\n")

all_trans <- rbindlist(lapply(1:4, function(i) {
  dta <- comms[[i]][, .(node, from = rank)]
  dtb <- comms[[i+1]][, .(node, to = rank)]
  sh <- merge(dta, dtb, by = "node")
  cf <- sh[, .N, by = .(from, to)]
  cf[, total_from := sum(N), by = from]
  cf[, frac := N / total_from]
  cf[, transition := sprintf("P%d$\\to$P%d", i, i+1)]
  cf[, from := factor(from)]
  cf[, to := factor(to)]
  cf
}))
all_trans$transition <- factor(all_trans$transition,
                               levels = sprintf("P%d$\\to$P%d", 1:4, 2:5))

tikz(file.path(FIGDIR, "fig12_transition_heatmap_all.tex"), width = 6.5, height = 5, standAlone = FALSE)
ggplot(all_trans, aes(x = to, y = from, fill = frac)) +
  geom_tile(color = "white", linewidth = 0.3) +
  scale_fill_gradient(low = "#F7FBFF", high = "#08519C", name = "Fraction",
                      labels = function(x) paste0(x * 100, "\\%")) +
  facet_wrap(~transition, scales = "free", ncol = 2) +
  scale_x_discrete("To community") +
  scale_y_discrete("From community") +
  theme_minimal(base_size = 9) +
  theme(legend.position = "bottom", panel.grid = element_blank())
dev.off()

# ================================================================
# FIGURE NEW: Network comparison P4 vs P5 (top nodes)
# ================================================================
cat("Figure: Network comparison P4 vs P5\n")

make_net_fig <- function(period, max_nodes = 400, max_edges = 2000) {
  cocit <- fread(file.path(DATADIR, sprintf("fullscale_cocitation_p%d.csv", period)))
  comm  <- comms[[period]]

  # Top nodes by total weight
  node_weight <- rbind(
    cocit[, .(w = sum(weight_norm)), by = .(node = node_a)],
    cocit[, .(w = sum(weight_norm)), by = .(node = node_b)]
  )[, .(w = sum(w)), by = node][order(-w)][1:max_nodes]

  top_nodes <- node_weight$node
  sub_edges <- cocit[node_a %in% top_nodes & node_b %in% top_nodes][order(-weight_norm)][1:max_edges]

  g <- graph_from_data_frame(sub_edges[, .(node_a, node_b)], directed = FALSE)
  E(g)$weight <- sub_edges$weight_norm

  # Assign communities
  comm_map <- setNames(comm$rank, comm$node)
  V(g)$community <- comm_map[V(g)$name]
  V(g)$community[is.na(V(g)$community)] <- 99

  # Layout
  set.seed(42)
  lay <- layout_with_fr(g, weights = E(g)$weight)
  lay_df <- data.frame(x = lay[,1], y = lay[,2],
                        community = factor(V(g)$community),
                        name = V(g)$name)

  el <- ends(g, E(g), names = FALSE)
  edge_df <- data.frame(
    x1 = lay[el[,1], 1],
    y1 = lay[el[,1], 2],
    x2 = lay[el[,2], 1],
    y2 = lay[el[,2], 2]
  )

  list(nodes = lay_df, edges = edge_df, g = g)
}

net4 <- make_net_fig(4)
net5 <- make_net_fig(5)

net4$nodes$panel <- sprintf("P4 (2020--21, $k=3$)")
net5$nodes$panel <- sprintf("P5 (2022--26, $k=5$)")
net4$edges$panel <- net4$nodes$panel[1]
net5$edges$panel <- net5$nodes$panel[1]

nodes_both <- rbind(net4$nodes, net5$nodes)
edges_both <- rbind(net4$edges, net5$edges)

tikz(file.path(FIGDIR, "fig4_network_comparison.tex"), width = 6.5, height = 3.5, standAlone = FALSE)
ggplot() +
  geom_segment(data = edges_both, aes(x = x1, y = y1, xend = x2, yend = y2),
               alpha = 0.05, linewidth = 0.2, color = "grey50") +
  geom_point(data = nodes_both, aes(x = x, y = y, color = community), size = 0.6, alpha = 0.8) +
  scale_color_manual(values = colors_8, guide = "none") +
  facet_wrap(~panel, scales = "free") +
  theme_void(base_size = 10) +
  theme(strip.text = element_text(size = 9))
dev.off()

# ================================================================
# FIGURE NEW: Node set dynamics (shared/unique per period)
# ================================================================
cat("Figure: Node set dynamics\n")

# For each pair of consecutive periods, compute shared vs unique
node_sets <- lapply(1:5, function(p) unique(comms[[p]]$node))

dynamics <- rbindlist(lapply(1:5, function(p) {
  current <- node_sets[[p]]
  n_total <- length(current)

  if (p > 1) {
    prev <- node_sets[[p-1]]
    shared_prev <- length(intersect(current, prev))
    new_nodes <- length(setdiff(current, prev))
  } else {
    shared_prev <- NA
    new_nodes <- NA
  }

  if (p < 5) {
    nxt <- node_sets[[p+1]]
    shared_next <- length(intersect(current, nxt))
    lost_nodes <- length(setdiff(current, nxt))
  } else {
    shared_next <- NA
    lost_nodes <- NA
  }

  data.table(period = p, label = PERIOD_LABELS[p],
             total = n_total, shared_prev = shared_prev,
             new_nodes = new_nodes, lost_next = lost_nodes)
}))

# Stacked bar: shared with prev | new in this period
bar_data <- rbindlist(lapply(2:5, function(p) {
  curr <- node_sets[[p]]
  prev <- node_sets[[p-1]]
  shared <- intersect(curr, prev)
  new_only <- setdiff(curr, prev)
  rbind(
    data.table(period = p, label = PERIOD_LABELS[p], type = "Shared with previous", count = length(shared)),
    data.table(period = p, label = PERIOD_LABELS[p], type = "New in period", count = length(new_only))
  )
}))
# Add P1 as all new
bar_data <- rbind(
  data.table(period = 1, label = PERIOD_LABELS[1], type = "New in period", count = length(node_sets[[1]])),
  bar_data
)
bar_data[, label := factor(label, levels = PERIOD_LABELS)]
bar_data[, type := factor(type, levels = c("Shared with previous", "New in period"))]

tikz(file.path(FIGDIR, "fig13_node_dynamics.tex"), width = 5, height = 3, standAlone = FALSE)
ggplot(bar_data, aes(x = label, y = count, fill = type)) +
  geom_col(width = 0.6) +
  scale_fill_manual(values = c("Shared with previous" = "#4393C3", "New in period" = "#D6604D"), name = "") +
  scale_y_continuous("Active nodes", labels = function(x) format(x, big.mark = ",")) +
  xlab("Period") +
  theme_minimal(base_size = 10) +
  theme(legend.position = "bottom")
dev.off()

cat("\nAll figures generated in", FIGDIR, "\n")
cat("New figures:\n")
cat("  fig3_alluvial.tex          — Community flows (updated)\n")
cat("  fig4_network_comparison.tex — Network P4 vs P5 (updated)\n")
cat("  fig11_community_sizes.tex  — Community size evolution\n")
cat("  fig12_transition_heatmap.tex — P4->P5 transition detail\n")
cat("  fig12_transition_heatmap_all.tex — All transitions\n")
cat("  fig13_node_dynamics.tex    — Node set dynamics\n")
