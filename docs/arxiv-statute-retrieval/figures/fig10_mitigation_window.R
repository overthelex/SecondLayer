#!/usr/bin/env Rscript
library(data.table)
library(ggplot2)
library(tikzDevice)

FIGDIR <- "/home/vovkes/SecondLayer/docs/arxiv-statute-retrieval/figures"
ABLDIR <- "/home/vovkes/SecondLayer/docs/arxiv-statute-retrieval/ablation"

dt <- fread(file.path(ABLDIR, "sliding_window_results.csv"))

dt[, window_label := factor(window_label,
  levels = c("1y", "3y", "5y", "10y", "all"),
  labels = c("$W$=1", "$W$=3", "$W$=5", "$W$=10", "All")
)]

tikz(file.path(FIGDIR, "fig10_mitigation_window.tex"),
     width = 5.5, height = 3.0, standAlone = FALSE)

p <- ggplot(dt, aes(x = eval_year, y = mrr_aa, color = window_label, shape = window_label)) +
  geom_line(linewidth = 0.8) +
  geom_point(size = 2.2) +
  scale_x_continuous(breaks = unique(dt$eval_year)) +
  scale_color_manual(values = c("#d7191c", "#fdae61", "#2c7bb6", "#abd9e9", "#808080")) +
  labs(x = "Evaluation Year", y = "MRR (Adamic-Adar)",
       color = "Training window", shape = "Training window") +
  theme_minimal(base_size = 10) +
  theme(
    legend.position = c(0.85, 0.8),
    legend.background = element_rect(fill = "white", color = NA),
    legend.key.size = unit(0.4, "cm"),
    panel.grid.minor = element_blank()
  )

print(p)
dev.off()
cat("Written: fig10_mitigation_window.tex\n")
