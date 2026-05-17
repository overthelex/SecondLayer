#!/usr/bin/env Rscript
library(data.table)
library(ggplot2)
library(tikzDevice)

EVALDIR <- "/tmp/citation-analysis/temporal-eval"
FIGDIR <- "/home/vovkes/SecondLayer/docs/arxiv-statute-retrieval/figures"

# Collect per-article data for all years, bin by difficulty
years <- 2007:2026
all_articles <- rbindlist(lapply(years, function(y) {
  f <- file.path(EVALDIR, sprintf("year_%d", y), "article_retrieval_performance.csv")
  if (!file.exists(f)) return(NULL)
  dt <- fread(f)
  dt[, year := y]
  dt
}))

# Bin by degree
all_articles[, degree_bin := cut(degree,
  breaks = c(0, 100, 1000, 10000, 100000, Inf),
  labels = c("Rare ($<$100)", "Low (100--1K)", "Mid (1K--10K)", "High (10K--100K)", "Hub ($>$100K)")
)]

# Aggregate: weighted mean MRR per year x bin
heatmap_dt <- all_articles[!is.na(degree_bin), .(
  mrr = weighted.mean(mrr_aa, n_predictions, na.rm = TRUE)
), by = .(year, degree_bin)]

heatmap_dt[, degree_bin := factor(degree_bin,
  levels = c("Hub ($>$100K)", "High (10K--100K)", "Mid (1K--10K)", "Low (100--1K)", "Rare ($<$100)")
)]

tikz(file.path(FIGDIR, "fig4_year_difficulty_heatmap.tex"),
     width = 5.5, height = 3.0, standAlone = FALSE)

p <- ggplot(heatmap_dt, aes(x = year, y = degree_bin, fill = mrr)) +
  geom_tile(color = "white", linewidth = 0.3) +
  scale_fill_gradient2(
    low = "#2c7bb6", mid = "#ffffbf", high = "#d7191c",
    midpoint = 0.3, limits = c(0, 0.7),
    name = "MRR"
  ) +
  scale_x_continuous(breaks = seq(2008, 2026, 2)) +
  labs(x = "Year", y = NULL) +
  theme_minimal(base_size = 10) +
  theme(
    panel.grid = element_blank(),
    legend.key.height = unit(0.8, "cm")
  )

print(p)
dev.off()
cat("Written: fig4_year_difficulty_heatmap.tex\n")
