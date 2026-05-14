library(tikzDevice)
library(ggplot2)

tikz("fig_rejection_outcome.tex", width = 5.0, height = 3.5, standAlone = FALSE)

df <- data.frame(
  tier = c("$\\mathsf{Full}$\n($\\gamma=5$)",
           "$\\mathsf{Partial}$\n($\\gamma=4$)",
           "$\\mathsf{Partial}$\n($\\gamma=3$)"),
  rejection_rate = c(15.4, 4.7, 2.5),
  outcome_rate = c(76.5, 97.0, 96.5),
  n = c(24, 1970, 898),
  tier_short = c("Full", "Partial-4", "Partial-3")
)

p <- ggplot(df, aes(x = rejection_rate, y = outcome_rate)) +
  geom_point(aes(size = n, color = tier_short), alpha = 0.8) +
  geom_text(aes(label = tier),
            vjust = -1.5, size = 2.8, lineheight = 0.85) +
  geom_smooth(method = "lm", se = FALSE, color = "gray50",
              linewidth = 0.5, linetype = "dashed") +
  scale_size_continuous(range = c(4, 14), guide = "none") +
  scale_color_manual(values = c("Full" = "darkgreen",
                                 "Partial-4" = "steelblue",
                                 "Partial-3" = "steelblue"),
                     guide = "none") +
  scale_x_continuous(limits = c(0, 20),
                     labels = function(x) paste0(x, "\\%")) +
  scale_y_continuous(limits = c(70, 102),
                     labels = function(x) paste0(x, "\\%")) +
  labs(x = "Rejection rate", y = "Positive outcome rate") +
  annotate("text", x = 12, y = 85,
           label = "Higher rejection $\\rightarrow$\nhigher task complexity\n$\\rightarrow$ lower success rate",
           size = 2.5, color = "gray40", hjust = 0, lineheight = 0.9) +
  theme_minimal(base_size = 10) +
  theme(
    panel.grid.minor = element_blank(),
    plot.margin = margin(10, 10, 5, 5)
  )

print(p)
dev.off()
