library(tikzDevice)
library(ggplot2)

tikz("fig_ablation_types.tex", width = 5.5, height = 3.2, standAlone = FALSE)

df <- data.frame(
  type = c("Codex article", "Case reference", "Law article",
           "Constitution", "Supreme Court", "Law by number"),
  unique_articles = c(17989057, 18532393, 426725, 1562, 1, 8875),
  avg_degree = c(22.0, 3.6, 68.1, 3569.8, 3006409.0, 278.4),
  median_degree = c(3, 1, 1, 6, 3006409, 3),
  max_degree = c(3308876, 467823, 1928355, 857199, 3006409, 316132)
)

df$type <- factor(df$type, levels = df$type)

df_plot <- data.frame(
  type = rep(df$type, 2),
  metric = rep(c("Median degree", "Mean degree"), each = 6),
  value = c(df$median_degree, df$avg_degree)
)
df_plot <- df_plot[df_plot$type != "Supreme Court",]

p <- ggplot(df_plot, aes(x = type, y = value, fill = metric)) +
  geom_col(position = position_dodge(width = 0.7), width = 0.6, alpha = 0.85) +
  scale_fill_manual(values = c("Median degree" = "steelblue", "Mean degree" = "coral3")) +
  scale_y_log10(labels = function(x) ifelse(x >= 1000, paste0(x/1000, "K"),
                                     ifelse(x >= 1, as.character(x), ""))) +
  labs(x = NULL, y = "Citations per article (log scale)", fill = NULL) +
  theme_minimal(base_size = 9) +
  theme(panel.grid.minor = element_blank(),
        panel.grid.major.x = element_blank(),
        legend.position = "bottom",
        legend.key.size = unit(0.35, "cm"),
        axis.text.x = element_text(angle = 20, hjust = 1),
        plot.margin = margin(5, 10, 5, 5))

print(p)
dev.off()
