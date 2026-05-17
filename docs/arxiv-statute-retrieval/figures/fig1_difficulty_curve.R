#!/usr/bin/env Rscript
library(data.table)
library(ggplot2)
library(tikzDevice)

OUTDIR <- "/tmp/citation-analysis/retrieval-eval"
FIGDIR <- "/home/vovkes/SecondLayer/docs/arxiv-statute-retrieval/figures"

# Load per-article performance
perf <- fread(file.path(OUTDIR, "article_retrieval_performance.csv"))

# Bin by degree (log scale, 20 bins)
perf[, log_degree := log10(degree)]
perf[, degree_bin := cut(log_degree, breaks = 20, labels = FALSE)]

# Aggregate per bin
binned <- perf[, .(
  mid_degree = 10^mean(log_degree),
  n_articles = .N,
  hit5_aa    = weighted.mean(hit5_aa, n_predictions),
  mrr_aa     = weighted.mean(mrr_aa, n_predictions),
  hit5_cn    = weighted.mean(hit5_cn, n_predictions),
  mrr_cn     = weighted.mean(mrr_cn, n_predictions)
), by = degree_bin]

setorder(binned, mid_degree)

# Melt for ggplot
plot_dt <- melt(binned, id.vars = c("degree_bin", "mid_degree", "n_articles"),
                measure.vars = c("mrr_aa", "hit5_aa"),
                variable.name = "metric", value.name = "value")
plot_dt[, metric := factor(metric,
  levels = c("mrr_aa", "hit5_aa"),
  labels = c("MRR (Adamic-Adar)", "Hit@5 (Adamic-Adar)")
)]

# Generate TikZ figure
tikz(file.path(FIGDIR, "fig1_difficulty_curve.tex"),
     width = 5.5, height = 3.2, standAlone = FALSE)

p <- ggplot(plot_dt, aes(x = mid_degree, y = value, color = metric, shape = metric)) +
  geom_point(size = 2.2) +
  geom_line(linewidth = 0.7) +
  scale_x_log10(
    breaks = c(100, 1000, 10000, 100000, 1000000),
    labels = c("100", "1K", "10K", "100K", "1M")
  ) +
  scale_y_continuous(limits = c(0, 1), breaks = seq(0, 1, 0.2)) +
  scale_color_manual(values = c("#2c7bb6", "#d7191c")) +
  labs(
    x = "Article citation frequency (log scale)",
    y = "Retrieval performance",
    color = NULL, shape = NULL
  ) +
  theme_minimal(base_size = 10) +
  theme(
    legend.position = c(0.25, 0.85),
    legend.background = element_rect(fill = "white", color = NA),
    panel.grid.minor = element_blank()
  )

print(p)
dev.off()

cat("Written: fig1_difficulty_curve.tex\n")
