#!/usr/bin/env Rscript
library(data.table)
library(Matrix)
library(ggplot2)
library(tikzDevice)

OUTDIR <- "/tmp/citation-analysis/retrieval-eval"
FIGDIR <- "/home/vovkes/SecondLayer/docs/arxiv-statute-retrieval/figures"
DATADIR <- "/tmp/citation-analysis"

# Reload the data to get co-citation matrix for top articles
dt <- fread(file.path(DATADIR, "map_year_2024.csv"))
dt <- dt[grepl("^[0-9]+(-[0-9]+)?$", law_article)]

LAW_NORM <- c(
  "КУпАП" = "КУпАП", "КупАП" = "КУпАП", "КУПАП" = "КУпАП", "КУпАп" = "КУпАП",
  "КЗпП" = "КЗпП"
)
dt[law_number %in% names(LAW_NORM), law_number := LAW_NORM[law_number]]

# Short labels for display (English for PDF compatibility)
LAW_SHORT <- c(
  "Цивільний процесуальний кодекс України" = "CivProc",
  "Кримінальний процесуальний кодекс України" = "CrimProc",
  "Кодекс адміністративного судочинства України" = "Admin",
  "Цивільний кодекс України" = "CivCode",
  "Кримінальний кодекс України" = "CrimCode",
  "Кодекс України про адміністративні правопорушення" = "AdminOff",
  "Господарський процесуальний кодекс України" = "CommProc",
  "Сімейний кодекс України" = "Family",
  "Податковий кодекс України" = "Tax",
  "Господарський кодекс України" = "CommCode"
)
dt[, law_short := ifelse(law_number %in% names(LAW_SHORT), LAW_SHORT[law_number], law_number)]
dt[, article_key := paste0(law_short, " ", law_article)]
dt <- unique(dt, by = c("court_case_id", "article_key"))

# Get top 20 articles by frequency
top20 <- dt[, .N, by = article_key][order(-N)][1:20]$article_key

dt_top <- dt[article_key %in% top20]

# Build incidence matrix for top20
cases <- unique(dt_top$court_case_id)
case_idx <- setNames(seq_along(cases), as.character(cases))
art_idx <- setNames(seq_along(top20), top20)

dt_top[, ci := case_idx[as.character(court_case_id)]]
dt_top[, ai := art_idx[article_key]]

M <- sparseMatrix(i = dt_top$ci, j = dt_top$ai, x = 1,
                  dims = c(length(cases), length(top20)))

# Co-citation matrix (20x20)
C <- as.matrix(crossprod(M))
diag(C) <- 0

# Normalize to Jaccard (C[i,j] / (degree_i + degree_j - C[i,j]))
degrees <- colSums(M)
J <- C
for (i in 1:20) for (j in 1:20) {
  J[i, j] <- C[i, j] / (degrees[i] + degrees[j] - C[i, j])
}

# Melt for ggplot (without reshape2)
rownames(J) <- top20
colnames(J) <- top20
jdt <- data.table(
  art_x = rep(top20, each = 20),
  art_y = rep(top20, times = 20),
  jaccard = as.vector(J)
)
jdt[, art_x := factor(art_x, levels = rev(top20))]
jdt[, art_y := factor(art_y, levels = top20)]

# Generate PDF with Cairo for proper font rendering
cairo_pdf(file.path(FIGDIR, "fig2_cocitation_heatmap.pdf"),
          width = 5.5, height = 4.5)

p <- ggplot(jdt, aes(x = art_y, y = art_x, fill = jaccard)) +
  geom_tile(color = "white", linewidth = 0.3) +
  scale_fill_gradient2(
    low = "white", mid = "#fee8c8", high = "#e34a33",
    midpoint = 0.15, limits = c(0, max(jdt$jaccard)),
    name = "Jaccard"
  ) +
  labs(x = NULL, y = NULL) +
  theme_minimal(base_size = 8) +
  theme(
    axis.text.x = element_text(angle = 45, hjust = 1, size = 7),
    axis.text.y = element_text(size = 7),
    legend.position = "right",
    panel.grid = element_blank()
  )

print(p)
dev.off()

cat("Written: fig2_cocitation_heatmap.pdf\n")
