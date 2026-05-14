library(tikzDevice)
library(ggplot2)
library(scales)

tikz("fig_scalability.tex", width = 5.5, height = 3.0, standAlone = FALSE)

df <- data.frame(
  year = 2007:2025,
  decisions_M = c(1.85, 0.88, 0.02, 1.61, 3.13, 1.60, 1.58, 5.91, 6.25,
                  6.13, 6.38, 7.24, 7.58, 7.19, 8.37, 5.80, 7.82, 8.09, 8.76),
  citations_M = c(28.15, 4.09, 0.12, 14.43, 3.96, 8.68, 5.17, 24.97, 23.05,
                  74.98, 26.27, 26.96, 24.24, 26.15, 23.40, 26.64, 36.03, 47.86, 41.86),
  cit_per_dec = c(1.04, 1.10, 1.19, 1.29, 1.19, 1.32, 1.26, 1.16, 1.16,
                  1.22, 1.31, 1.36, 1.32, 1.37, 1.43, 1.36, 1.45, 1.32, 1.42)
)

p <- ggplot(df, aes(x = decisions_M, y = citations_M)) +
  geom_point(aes(color = year), size = 2.5) +
  geom_smooth(method = "lm", se = FALSE, color = "gray50", linewidth = 0.5, linetype = "dashed") +
  geom_text(aes(label = year), vjust = -0.8, size = 2.2, color = "gray40") +
  scale_color_gradient(low = "steelblue", high = "coral3", guide = "none") +
  scale_x_continuous(labels = function(x) paste0(x, "M")) +
  scale_y_continuous(labels = function(x) paste0(x, "M")) +
  labs(x = "Decisions per year", y = "Citations per year") +
  theme_minimal(base_size = 10) +
  theme(panel.grid.minor = element_blank(), plot.margin = margin(5, 10, 5, 5))

print(p)
dev.off()
