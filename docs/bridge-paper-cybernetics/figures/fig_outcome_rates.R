library(tikzDevice)
library(ggplot2)

tikz("fig_outcome_rates.tex", width = 5.5, height = 3.2, standAlone = FALSE)

df <- data.frame(
  gamma = c("$\\gamma=5$\n(Full)", "$\\gamma=4$\n(Partial)", "$\\gamma=3$\n(Partial)"),
  n = c(17, 1261, 113),
  positive = c(13, 1223, 109),
  rate = c(76.5, 97.0, 96.5)
)
df$gamma <- factor(df$gamma, levels = df$gamma)

p <- ggplot(df, aes(x = gamma, y = rate, fill = gamma)) +
  geom_col(width = 0.55, alpha = 0.85) +
  geom_text(aes(label = paste0(rate, "\\%")),
            vjust = -0.4, size = 3.2, fontface = "bold") +
  geom_text(aes(label = paste0("$n=", n, "$"), y = rate / 2),
            size = 2.8, color = "white") +
  scale_fill_manual(values = c("darkgreen", "steelblue", "steelblue")) +
  scale_y_continuous(limits = c(0, 110), breaks = seq(0, 100, 25),
                     labels = function(x) paste0(x, "\\%")) +
  labs(x = "Oversight grade", y = "Positive outcome rate") +
  theme_minimal(base_size = 10) +
  theme(
    panel.grid.minor = element_blank(),
    panel.grid.major.x = element_blank(),
    legend.position = "none",
    plot.margin = margin(5, 10, 5, 5)
  )

print(p)
dev.off()
