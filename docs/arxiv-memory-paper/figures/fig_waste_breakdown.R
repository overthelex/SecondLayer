library(tikzDevice)
library(ggplot2)

tikz("fig_waste_breakdown.tex", width = 5.5, height = 3.0, standAlone = FALSE)

df <- data.frame(
  category = c("Source code\nreads", "Memory\nfiles", "Overall\nmedian",
               "Short sessions\n(5--10 turns)", "Long sessions\n($>$50 turns)"),
  waste = c(78, 66.5, 60, 68.5, 51.1),
  group = c("By file type", "By file type", "By file type",
            "By session length", "By session length")
)

df$category <- factor(df$category, levels = df$category)

p <- ggplot(df, aes(x = category, y = waste, fill = group)) +
  geom_col(width = 0.65, alpha = 0.85) +
  geom_hline(yintercept = 20, linetype = "dashed", color = "darkgreen", linewidth = 0.6) +
  annotate("text", x = 5.4, y = 23,
           label = "Target: $\\leq 20\\%$",
           size = 2.8, color = "darkgreen", hjust = 1) +
  geom_text(aes(label = paste0(waste, "\\%")),
            vjust = -0.5, size = 3) +
  scale_fill_manual(values = c("By file type" = "steelblue",
                                "By session length" = "coral3")) +
  scale_y_continuous(limits = c(0, 92), breaks = seq(0, 80, 20),
                     labels = function(x) paste0(x, "\\%")) +
  labs(x = NULL, y = "Context waste ratio", fill = NULL) +
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
