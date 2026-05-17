#!/usr/bin/env Rscript
library(data.table)
library(ggplot2)
library(tikzDevice)

FIGDIR <- "/home/vovkes/SecondLayer/docs/arxiv-statute-retrieval/figures"
dt <- fread("/home/vovkes/SecondLayer/docs/arxiv-statute-retrieval/ablation/embedding_drift.csv")

# Extract codex name
dt[, codex := sub("\\|.*", "", article_key)]

CODEX_SHORT <- c(
  "Цивільний процесуальний кодекс України" = "CivProc",
  "Кримінальний процесуальний кодекс України" = "CrimProc",
  "Кримінальний кодекс України" = "CrimCode",
  "Кодекс адміністративного судочинства України" = "Admin",
  "Цивільний кодекс України" = "CivCode",
  "Кодекс України про адміністративні правопорушення" = "AdminOff"
)
dt[, codex_short := ifelse(codex %in% names(CODEX_SHORT), CODEX_SHORT[codex], "Other")]

# Aggregate per codex
codex_drift <- dt[, .(
  mean_drift = mean(drift),
  median_drift = median(drift),
  n_articles = .N,
  sd_drift = sd(drift)
), by = codex_short]
setorder(codex_drift, -mean_drift)

tikz(file.path(FIGDIR, "fig7_embedding_drift.tex"),
     width = 5.5, height = 3.0, standAlone = FALSE)

p <- ggplot(dt[codex_short != "Other"], aes(x = reorder(codex_short, -drift, FUN = median), y = drift)) +
  geom_boxplot(aes(fill = codex_short), outlier.size = 0.8, width = 0.6) +
  scale_fill_brewer(palette = "Set2", guide = "none") +
  scale_y_continuous(limits = c(0, 0.10), breaks = seq(0, 0.10, 0.02)) +
  labs(x = NULL, y = "Embedding drift (2012 $\\to$ 2024)") +
  theme_minimal(base_size = 10) +
  theme(
    panel.grid.minor = element_blank(),
    axis.text.x = element_text(angle = 25, hjust = 1)
  )

print(p)
dev.off()
cat("Written: fig7_embedding_drift.tex\n")
