library(tikzDevice)
library(ggplot2)

tikz("fig_condition_heatmap.tex", width = 5.5, height = 3.0, standAlone = FALSE)

df <- data.frame(
  condition = rep(c("C1\nPersistence", "C2\nComposition", "C3\nIterative\nRefinement",
                     "C4\nInformation\nAsymmetry", "C5\nConsequential\nGrounding"), 3),
  tier = rep(c("$\\mathsf{Full}$ ($\\gamma=5$)",
               "$\\mathsf{Partial}$ ($\\gamma=4$)",
               "$\\mathsf{Invalid}$ ($\\gamma \\leq 2$)"), each = 5),
  satisfied = c(
    1, 1, 1, 1, 1,
    1, 0, 1, 1, 1,
    0, 0, 0, 1, 0
  ),
  label = c(
    "Yes", "Yes", "Yes", "Yes", "Yes",
    "Yes", "No", "Yes", "Yes", "Yes",
    "Varies", "No", "Varies", "94\\%", "Varies"
  )
)

df$condition <- factor(df$condition, levels = unique(df$condition))
df$tier <- factor(df$tier, levels = rev(unique(df$tier)))

p <- ggplot(df, aes(x = condition, y = tier, fill = factor(satisfied))) +
  geom_tile(color = "white", linewidth = 1.5) +
  geom_text(aes(label = label), size = 3) +
  scale_fill_manual(values = c("0" = "coral2", "1" = "palegreen3"),
                    labels = c("Not satisfied", "Satisfied")) +
  labs(x = NULL, y = NULL, fill = NULL) +
  theme_minimal(base_size = 10) +
  theme(
    panel.grid = element_blank(),
    legend.position = "bottom",
    legend.key.size = unit(0.4, "cm"),
    axis.text.x = element_text(size = 8),
    plot.margin = margin(5, 10, 5, 5)
  )

print(p)
dev.off()
