library(tikzDevice)
library(ggplot2)

tikz("fig_degree_distribution.tex", width = 5.5, height = 3.5, standAlone = FALSE)

df <- data.frame(
  degree = c(1, 2, 3, 5, 6, 8, 12, 16, 22, 30, 41, 57, 79, 110, 149, 207, 286, 395, 544, 751,
             1037, 1431, 1975, 2726, 3764, 5194, 7165, 9893, 13656, 18869, 26057, 35944,
             49592, 68443, 94452, 130361, 179932, 248530, 343034, 473516, 653378, 901741,
             1244665, 1718132, 2371830, 3308876),
  count = c(16004082, 3931366, 10818615, 2528942, 830716, 1342214, 479162, 370425, 136020,
            76853, 88071, 44547, 196406, 12777, 9180, 6653, 4445, 37864, 7955, 10539,
            2745, 12754, 1124, 828, 632, 546, 490, 415, 350, 345, 235, 209, 190, 150,
            147, 137, 115, 88, 90, 69, 47, 31, 18, 19, 3, 4)
)

fit_x <- seq(log10(1), log10(4e6), length.out = 100)
fit_y <- 7.5 - 1.57 * fit_x

p <- ggplot(df, aes(x = degree, y = count)) +
  geom_point(color = "steelblue", size = 1.5, alpha = 0.7) +
  geom_line(data = data.frame(x = 10^fit_x, y = 10^fit_y),
            aes(x = x, y = y), color = "red3", linewidth = 0.6, linetype = "dashed") +
  scale_x_log10(labels = function(x) ifelse(x >= 1e6, paste0(x/1e6, "M"),
                                     ifelse(x >= 1e3, paste0(x/1e3, "K"), x))) +
  scale_y_log10(labels = function(x) ifelse(x >= 1e6, paste0(x/1e6, "M"),
                                     ifelse(x >= 1e3, paste0(x/1e3, "K"), x))) +
  annotate("text", x = 5e4, y = 5e6,
           label = "$\\alpha = 1.57 \\pm 0.008$",
           size = 3.5, color = "red3") +
  labs(x = "Citation degree (log scale)", y = "Number of articles (log scale)") +
  theme_minimal(base_size = 10) +
  theme(panel.grid.minor = element_blank(), plot.margin = margin(5, 10, 5, 5))

print(p)
dev.off()
