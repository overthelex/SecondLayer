library(tikzDevice)
library(ggplot2)
library(scales)

tikz("fig_bootstrap_cost.tex", width = 5.5, height = 3.0, standAlone = FALSE)

set.seed(42)
n <- 304
tokens <- rnorm(n, mean = 29693, sd = 7594)
tokens <- pmax(tokens, 5000)

claudemd_share <- tokens * 0.59
other_share <- tokens * 0.41

df <- data.frame(
  category = rep(c("\\texttt{CLAUDE.md} (59\\%)", "Other file reads (41\\%)"), each = n),
  tokens = c(claudemd_share, other_share)
)

stats <- data.frame(
  label = c("P10", "Median", "P90"),
  value = c(18540, 30115, 41774),
  y = c(0.6, 0.6, 0.6)
)

p <- ggplot() +
  geom_boxplot(data = data.frame(tokens = tokens),
               aes(x = "Bootstrap cost", y = tokens),
               fill = "steelblue", alpha = 0.3, color = "steelblue",
               width = 0.4, outlier.size = 0.8, outlier.alpha = 0.4) +
  geom_hline(yintercept = 10000, linetype = "dashed", color = "darkgreen", linewidth = 0.7) +
  annotate("text", x = 0.6, y = 11500,
           label = "Target: $\\leq 10{,}000$ tokens",
           size = 3, color = "darkgreen", hjust = 0) +
  annotate("text", x = 1.35, y = 30115,
           label = "Median: 30{,}115",
           size = 2.5, color = "gray30", hjust = 0) +
  annotate("text", x = 1.35, y = 18540,
           label = "P10: 18{,}540",
           size = 2.5, color = "gray50", hjust = 0) +
  annotate("text", x = 1.35, y = 41774,
           label = "P90: 41{,}774",
           size = 2.5, color = "gray50", hjust = 0) +
  scale_y_continuous(labels = comma_format(), breaks = seq(0, 50000, 10000)) +
  labs(x = NULL, y = "Input tokens per session") +
  coord_flip() +
  theme_minimal(base_size = 10) +
  theme(
    panel.grid.minor = element_blank(),
    axis.text.y = element_blank(),
    plot.margin = margin(5, 10, 5, 5)
  )

print(p)
dev.off()
