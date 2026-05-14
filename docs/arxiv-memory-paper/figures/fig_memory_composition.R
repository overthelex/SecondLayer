library(tikzDevice)
library(ggplot2)

tikz("fig_memory_composition.tex", width = 5.5, height = 3.0, standAlone = FALSE)

df <- data.frame(
  layer = c("Domain\n(from \\texttt{CLAUDE.md})",
            "Domain\n(from PRs)",
            "Domain\n(from docs)",
            "Workflow\npatterns",
            "Practitioner\nsummaries"),
  count = c(140, 23, 7, 4, 13),
  tier = c("Domain", "Domain", "Domain", "Workflow", "Practitioner")
)

df$layer <- factor(df$layer, levels = df$layer)

p <- ggplot(df, aes(x = layer, y = count, fill = tier)) +
  geom_col(width = 0.6, alpha = 0.85) +
  geom_text(aes(label = count), vjust = -0.5, size = 3.2) +
  scale_fill_manual(values = c("Domain" = "steelblue",
                                "Workflow" = "goldenrod3",
                                "Practitioner" = "coral3")) +
  scale_y_continuous(limits = c(0, 160), breaks = seq(0, 140, 20)) +
  labs(x = NULL, y = "Number of entries", fill = "Memory layer",
       title = "Memory composition (187 entries, May 13, 2026)") +
  theme_minimal(base_size = 10) +
  theme(
    panel.grid.minor = element_blank(),
    panel.grid.major.x = element_blank(),
    legend.position = "bottom",
    legend.key.size = unit(0.4, "cm"),
    plot.title = element_text(size = 10, face = "bold", hjust = 0.5),
    plot.margin = margin(5, 10, 5, 5)
  )

print(p)
dev.off()
