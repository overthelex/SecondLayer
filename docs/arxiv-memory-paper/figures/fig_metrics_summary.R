library(tikzDevice)
library(ggplot2)

tikz("fig_metrics_summary.tex", width = 5.5, height = 3.5, standAlone = FALSE)

df <- data.frame(
  metric = c("Bootstrap\ntokens", "Context\nwaste", "Retrieval\naccuracy", "Refresh\nlatency"),
  baseline = c(30115, 60, 0.604, 100),
  target = c(10000, 20, 0.80, 100),
  unit = c("tokens", "\\%", "cos.\\ sim.", "hours"),
  higher_is_better = c(FALSE, FALSE, TRUE, FALSE)
)

df$metric <- factor(df$metric, levels = df$metric)

df_norm <- data.frame(
  metric = rep(df$metric, 2),
  type = rep(c("Baseline", "Target"), each = 4),
  value = c(
    30115/30115, 60/60, 0.604/0.80, 1.0,
    10000/30115, 20/60, 0.80/0.80, 1.0
  ),
  label = c(
    "30{,}115", "60\\%", "0.604", "deployed",
    "$\\leq$10K", "$\\leq$20\\%", "$\\geq$0.80", "$\\leq$24h"
  )
)

df_norm$type <- factor(df_norm$type, levels = c("Baseline", "Target"))

p <- ggplot(df_norm, aes(x = metric, y = value, fill = type)) +
  geom_col(position = position_dodge(width = 0.7), width = 0.6, alpha = 0.85) +
  geom_text(aes(label = label),
            position = position_dodge(width = 0.7),
            vjust = -0.5, size = 2.8) +
  scale_fill_manual(values = c("Baseline" = "steelblue", "Target" = "darkgreen")) +
  scale_y_continuous(limits = c(0, 1.35),
                     breaks = c(0, 0.25, 0.5, 0.75, 1.0),
                     labels = c("0\\%", "25\\%", "50\\%", "75\\%", "100\\%")) +
  labs(x = NULL, y = "Normalized scale (baseline = 100\\%)", fill = NULL) +
  theme_minimal(base_size = 10) +
  theme(
    panel.grid.minor = element_blank(),
    panel.grid.major.x = element_blank(),
    legend.position = "bottom",
    legend.key.size = unit(0.4, "cm"),
    plot.margin = margin(5, 10, 5, 5)
  )

print(p)
dev.off()
