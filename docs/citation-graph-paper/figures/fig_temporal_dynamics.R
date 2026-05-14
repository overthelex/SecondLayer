library(tikzDevice)
library(ggplot2)
library(scales)

tikz("fig_temporal_dynamics.tex", width = 5.5, height = 3.5, standAlone = FALSE)

df <- data.frame(
  year = 2007:2025,
  citations = c(28149993, 4085209, 122174, 14426131, 3960128, 8681188, 5172487,
                24972496, 23052510, 74980213, 26274233, 26963197, 24241623,
                26148266, 23396253, 26636059, 36027527, 47857096, 41860282)
)

events <- data.frame(
  year = c(2010, 2012, 2017, 2022),
  label = c("Civil Code\nadoption", "New CPC", "Judicial\nreform", "Russian\ninvasion"),
  y = c(7e7, 7e7, 7e7, 7e7)
)

p <- ggplot(df, aes(x = year, y = citations)) +
  geom_col(fill = "steelblue", alpha = 0.7, width = 0.8) +
  geom_vline(data = events, aes(xintercept = year),
             linetype = "dashed", color = "red3", linewidth = 0.4) +
  geom_text(data = events, aes(x = year, y = y, label = label),
            size = 2.2, color = "red3", hjust = -0.1, lineheight = 0.85) +
  scale_y_continuous(labels = function(x) paste0(x/1e6, "M")) +
  scale_x_continuous(breaks = seq(2007, 2025, 2)) +
  labs(x = "Year", y = "Citation edges") +
  theme_minimal(base_size = 10) +
  theme(panel.grid.minor = element_blank(),
        panel.grid.major.x = element_blank(),
        plot.margin = margin(5, 10, 5, 5))

print(p)
dev.off()
