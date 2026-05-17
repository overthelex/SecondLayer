#!/usr/bin/env Rscript
library(data.table)
library(ggplot2)
library(tikzDevice)

EVALDIR <- "/tmp/citation-analysis/temporal-eval"
FIGDIR <- "/home/vovkes/SecondLayer/docs/arxiv-statute-retrieval/figures"

# Load 2012 (peak performance) and 2024 (recent)
load_year <- function(y) {
  f <- file.path(EVALDIR, sprintf("year_%d", y), "article_retrieval_performance.csv")
  dt <- fread(f)[, .(target_article, mrr_aa, degree, law_number)]
  setnames(dt, "mrr_aa", sprintf("mrr_%d", y))
  setnames(dt, "degree", sprintf("degree_%d", y))
  dt
}

dt2012 <- load_year(2012)
dt2024 <- load_year(2024)

# Join on article key
merged <- merge(dt2012, dt2024[, .(target_article, mrr_2024, degree_2024)],
                by = "target_article")

# Short codex labels
CODEX_SHORT <- c(
  "Цивільний процесуальний кодекс України" = "CivProc",
  "Кримінальний процесуальний кодекс України" = "CrimProc",
  "Кодекс адміністративного судочинства України" = "Admin",
  "Цивільний кодекс України" = "Civil",
  "Кримінальний кодекс України" = "Criminal",
  "Кодекс України про адміністративні правопорушення" = "AdminOff",
  "Господарський процесуальний кодекс України" = "CommProc",
  "Сімейний кодекс України" = "Family",
  "Податковий кодекс України" = "Tax"
)
merged[, codex := ifelse(law_number %in% names(CODEX_SHORT),
                         CODEX_SHORT[law_number], "Other")]
merged[, codex := factor(codex)]

# Keep only articles with enough predictions in both years
merged <- merged[!is.na(mrr_2012) & !is.na(mrr_2024)]

tikz(file.path(FIGDIR, "fig5_article_stability.tex"),
     width = 5.5, height = 4.0, standAlone = FALSE)

p <- ggplot(merged, aes(x = mrr_2012, y = mrr_2024, color = codex)) +
  geom_abline(slope = 1, intercept = 0, linetype = "dashed", color = "grey60") +
  geom_point(alpha = 0.6, size = 1.5) +
  scale_x_continuous(limits = c(0, 1), breaks = seq(0, 1, 0.2)) +
  scale_y_continuous(limits = c(0, 1), breaks = seq(0, 1, 0.2)) +
  scale_color_brewer(palette = "Set2", name = "Code") +
  labs(x = "MRR (2012)", y = "MRR (2024)") +
  theme_minimal(base_size = 10) +
  theme(
    legend.position = "right",
    legend.key.size = unit(0.35, "cm"),
    legend.text = element_text(size = 7),
    panel.grid.minor = element_blank()
  )

print(p)
dev.off()
cat("Written: fig5_article_stability.tex\n")
