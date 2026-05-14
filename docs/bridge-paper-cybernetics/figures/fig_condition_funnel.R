library(tikzDevice)
library(ggplot2)

tikz("fig_condition_funnel.tex", width = 5.5, height = 3.5, standAlone = FALSE)

df <- data.frame(
  step = c("All sessions",
           "C1: Persistence\n(state across sessions)",
           "C4: Info.\\ Asymmetry\n(practitioner knowledge)",
           "C5: Consequential\nGrounding (outcomes)",
           "C3: Iterative\nRefinement (edit traces)",
           "C2: Compositional\nLayering (cross-session)"),
  count = c(2892, 2614, 2458, 1579, 1579, 24),
  pct = c(100, 90.4, 85.0, 54.6, 54.6, 0.8)
)

df$step <- factor(df$step, levels = rev(df$step))

p <- ggplot(df, aes(x = step, y = count)) +
  geom_col(aes(fill = count), width = 0.65, alpha = 0.85) +
  geom_text(aes(label = paste0(format(count, big.mark = "{,}"), " (", pct, "\\%)")),
            hjust = -0.08, size = 2.9) +
  scale_fill_gradient(low = "coral3", high = "steelblue", guide = "none") +
  scale_y_continuous(limits = c(0, 3800), labels = function(x) format(x, big.mark = ",")) +
  coord_flip() +
  labs(x = NULL, y = "Sessions remaining") +
  theme_minimal(base_size = 10) +
  theme(
    panel.grid.minor = element_blank(),
    panel.grid.major.y = element_blank(),
    plot.margin = margin(5, 15, 5, 5)
  )

print(p)
dev.off()
