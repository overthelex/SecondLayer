#!/usr/bin/env Rscript
library(data.table)
library(ggplot2)
library(tikzDevice)

EVALDIR <- "/tmp/citation-analysis/temporal-eval"
FIGDIR <- "/home/vovkes/SecondLayer/docs/arxiv-statute-retrieval/figures"

# Load per-article data for all years
years <- 2007:2026
all_articles <- rbindlist(lapply(years, function(y) {
  f <- file.path(EVALDIR, sprintf("year_%d", y), "article_retrieval_performance.csv")
  if (!file.exists(f)) return(NULL)
  dt <- fread(f)
  dt[, year := y]
  dt
}))

# Map to codex short names
CODEX_SHORT <- c(
  "Цивільний процесуальний кодекс України" = "CivProc (Civil Procedure)",
  "Кримінальний процесуальний кодекс України" = "CrimProc (Criminal Procedure)",
  "Кодекс адміністративного судочинства України" = "Admin (Administrative)",
  "Цивільний кодекс України" = "CivCode (Civil Code)",
  "Кримінальний кодекс України" = "CrimCode (Criminal Code)"
)

all_articles[, codex := CODEX_SHORT[law_number]]
codex_dt <- all_articles[!is.na(codex)]

# Weighted mean MRR per codex per year
codex_yearly <- codex_dt[, .(
  mrr = weighted.mean(mrr_aa, n_predictions, na.rm = TRUE),
  n_articles = .N,
  total_preds = sum(n_predictions)
), by = .(year, codex)]

tikz(file.path(FIGDIR, "fig6_per_codex_temporal.tex"),
     width = 5.5, height = 3.5, standAlone = FALSE)

p <- ggplot(codex_yearly, aes(x = year, y = mrr, color = codex)) +
  geom_line(linewidth = 0.8) +
  geom_point(size = 1.2) +
  geom_vline(xintercept = 2017, linetype = "dashed", color = "grey50", linewidth = 0.4) +
  scale_x_continuous(breaks = seq(2008, 2026, 2)) +
  scale_y_continuous(limits = c(0, 0.7), breaks = seq(0, 0.7, 0.1)) +
  scale_color_brewer(palette = "Set1", name = NULL) +
  labs(x = "Year", y = "MRR (Adamic-Adar)") +
  theme_minimal(base_size = 10) +
  theme(
    legend.position = "bottom",
    legend.text = element_text(size = 7),
    legend.key.size = unit(0.4, "cm"),
    panel.grid.minor = element_blank()
  ) +
  guides(color = guide_legend(nrow = 2))

print(p)
dev.off()
cat("Written: fig6_per_codex_temporal.tex\n")
