library(tikzDevice)
library(ggplot2)
library(dplyr)

tikz("fig_edit_profile.tex", width = 5.5, height = 3.2, standAlone = FALSE)

df <- data.frame(
  tier = rep(c("Full\n($\\gamma=5$)", "Partial\n($\\gamma \\in \\{3,4\\}$)", "Invalid\n($\\gamma \\leq 2$)"), 3),
  metric = c(rep("Substantive\nrewrites", 3), rep("Rejection\nrate", 3), rep("Median edit\ndistance", 3)),
  value = c(53.8, 78.4, 83.1,
            15.4, 4.7, 2.5,
            77.5, 83.1, 84.5)
)

df$tier <- factor(df$tier, levels = c("Full\n($\\gamma=5$)", "Partial\n($\\gamma \\in \\{3,4\\}$)", "Invalid\n($\\gamma \\leq 2$)"))
df$metric <- factor(df$metric, levels = c("Substantive\nrewrites", "Rejection\nrate", "Median edit\ndistance"))

p <- ggplot(df, aes(x = tier, y = value, fill = tier)) +
  geom_col(width = 0.6, alpha = 0.85) +
  geom_text(aes(label = paste0(value, "\\%")),
            vjust = -0.4, size = 2.8) +
  facet_wrap(~metric, scales = "free_y", nrow = 1) +
  scale_fill_manual(values = c("darkgreen", "steelblue", "coral3")) +
  scale_y_continuous(labels = function(x) paste0(x, "\\%")) +
  labs(x = NULL, y = NULL) +
  theme_minimal(base_size = 9) +
  theme(
    panel.grid.minor = element_blank(),
    panel.grid.major.x = element_blank(),
    legend.position = "none",
    strip.text = element_text(face = "bold", size = 9),
    plot.margin = margin(5, 10, 5, 5)
  )

print(p)
dev.off()
