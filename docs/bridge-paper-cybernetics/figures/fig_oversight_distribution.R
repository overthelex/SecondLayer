library(tikzDevice)
library(ggplot2)

tikz("fig_oversight_distribution.tex", width = 5.5, height = 3.0, standAlone = FALSE)

df <- data.frame(
  grade = c("$\\mathsf{FullOversight}$\n($\\gamma=5$)",
            "$\\mathsf{PartialOversight}$\n($\\gamma \\in \\{3,4\\}$)",
            "$\\mathsf{InvalidOversight}$\n($\\gamma \\leq 2$)"),
  sessions = c(24, 1970, 898),
  pct = c(0.8, 68.1, 31.1)
)
df$grade <- factor(df$grade, levels = df$grade)

p <- ggplot(df, aes(x = grade, y = sessions, fill = grade)) +
  geom_col(width = 0.6, alpha = 0.85) +
  geom_text(aes(label = paste0(sessions, " (", pct, "\\%)")),
            vjust = -0.5, size = 3) +
  scale_fill_manual(values = c("darkgreen", "steelblue", "coral3")) +
  scale_y_continuous(limits = c(0, 2300), breaks = seq(0, 2000, 500)) +
  labs(x = NULL, y = "Number of sessions ($N = 2{,}892$)") +
  theme_minimal(base_size = 10) +
  theme(
    panel.grid.minor = element_blank(),
    panel.grid.major.x = element_blank(),
    legend.position = "none",
    plot.margin = margin(5, 10, 5, 5)
  )

print(p)
dev.off()
