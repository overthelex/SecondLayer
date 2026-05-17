#!/usr/bin/env Rscript
library(data.table)
library(ggplot2)
library(tikzDevice)

EVALDIR <- "/tmp/citation-analysis/temporal-eval"
FIGDIR <- "/home/vovkes/SecondLayer/docs/arxiv-statute-retrieval/figures"

# Collect MRR per year for all methods
years <- 2007:2026
results <- rbindlist(lapply(years, function(y) {
  f <- file.path(EVALDIR, sprintf("year_%d", y), "retrieval_metrics.csv")
  if (!file.exists(f)) return(NULL)
  dt <- fread(f)
  dt[, year := y]
  dt
}))

# Reshape for plotting
plot_dt <- results[metric == "MRR"]
plot_dt[, method := factor(method,
  levels = c("AdamicAdar", "CommonNeighbors", "DegreeBaseline"),
  labels = c("Adamic-Adar", "Common Neighbors", "Degree Baseline")
)]

tikz(file.path(FIGDIR, "fig3_temporal_curve.tex"),
     width = 5.5, height = 3.0, standAlone = FALSE)

p <- ggplot(plot_dt, aes(x = year, y = value, color = method, shape = method)) +
  geom_line(linewidth = 0.8) +
  geom_point(size = 1.8) +
  geom_vline(xintercept = 2017, linetype = "dashed", color = "grey50", linewidth = 0.4) +
  geom_vline(xintercept = 2022, linetype = "dotted", color = "grey50", linewidth = 0.4) +
  annotate("text", x = 2017.3, y = 0.52, label = "Reform", size = 2.5, hjust = 0, color = "grey40") +
  annotate("text", x = 2022.3, y = 0.52, label = "Invasion", size = 2.5, hjust = 0, color = "grey40") +
  scale_x_continuous(breaks = seq(2008, 2026, 2)) +
  scale_y_continuous(limits = c(0, 0.6), breaks = seq(0, 0.6, 0.1)) +
  scale_color_manual(values = c("#2c7bb6", "#fdae61", "#d7191c")) +
  labs(x = "Year", y = "MRR", color = NULL, shape = NULL) +
  theme_minimal(base_size = 10) +
  theme(
    legend.position = c(0.8, 0.85),
    legend.background = element_rect(fill = "white", color = NA),
    legend.key.size = unit(0.4, "cm"),
    panel.grid.minor = element_blank()
  )

print(p)
dev.off()
cat("Written: fig3_temporal_curve.tex\n")
