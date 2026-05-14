library(tikzDevice)
library(ggplot2)

tikz("fig_citation_types.tex", width = 5.5, height = 3.0, standAlone = FALSE)

df <- data.frame(
  type = c("Codex article", "Case reference", "Law article",
           "Constitution", "Supreme Court\nruling", "Law by number"),
  count = c(396082878, 66029080, 29066483, 5575953, 3006409, 2470618),
  pct = c(78.86, 13.15, 5.79, 1.11, 0.60, 0.49)
)
df$type <- factor(df$type, levels = rev(df$type))

p <- ggplot(df, aes(x = type, y = count / 1e6)) +
  geom_col(fill = "steelblue", alpha = 0.85, width = 0.6) +
  geom_text(aes(label = paste0(pct, "\\%")), hjust = -0.15, size = 3) +
  scale_y_continuous(limits = c(0, 470), labels = function(x) paste0(x, "M")) +
  coord_flip() +
  labs(x = NULL, y = "Citation edges (millions)") +
  theme_minimal(base_size = 10) +
  theme(panel.grid.minor = element_blank(),
        panel.grid.major.y = element_blank(),
        plot.margin = margin(5, 15, 5, 5))

print(p)
dev.off()
