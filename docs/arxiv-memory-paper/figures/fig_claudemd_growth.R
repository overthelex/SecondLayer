library(tikzDevice)
library(ggplot2)
library(scales)

tikz("fig_claudemd_growth.tex", width = 5.5, height = 3.2, standAlone = FALSE)

days <- c(0, 10, 20, 30, 40, 50, 60, 70, 85)
chars <- c(4099, 6250, 8400, 10800, 13200, 15800, 18500, 21400, 24148)

df <- data.frame(day = days, chars = chars)

model <- lm(chars ~ day, data = df)
r2 <- summary(model)$r.squared
slope <- round(coef(model)[2], 1)

proj_days <- data.frame(day = 0:150)
proj_days$chars <- predict(model, newdata = proj_days)

p <- ggplot() +
  geom_ribbon(data = proj_days[proj_days$day > 85, ],
              aes(x = day, ymin = chars * 0.9, ymax = chars * 1.1),
              fill = "gray85", alpha = 0.5) +
  geom_line(data = proj_days[proj_days$day <= 85, ],
            aes(x = day, y = chars),
            color = "steelblue", linewidth = 0.6, linetype = "solid") +
  geom_line(data = proj_days[proj_days$day > 85, ],
            aes(x = day, y = chars),
            color = "steelblue", linewidth = 0.6, linetype = "dashed") +
  geom_point(data = df, aes(x = day, y = chars),
             color = "darkblue", size = 2) +
  geom_hline(yintercept = 128000, linetype = "dotted", color = "red3", linewidth = 0.5) +
  annotate("text", x = 130, y = 131000,
           label = "Claude context budget (128K)",
           size = 2.8, color = "red3", hjust = 1) +
  annotate("text", x = 90, y = 30000,
           label = paste0("$R^2 = ", round(r2, 2), "$, slope $= ", slope, "$ chars/day"),
           size = 2.8, color = "steelblue", hjust = 0) +
  geom_vline(xintercept = 85, linetype = "dotted", color = "gray50", linewidth = 0.4) +
  annotate("text", x = 87, y = 5000, label = "day 85\n(current)", size = 2.2,
           color = "gray40", hjust = 0) +
  scale_x_continuous(breaks = seq(0, 150, 30),
                     labels = seq(0, 150, 30)) +
  scale_y_continuous(labels = comma_format()) +
  labs(x = "Project day", y = "CLAUDE.md size (characters)") +
  theme_minimal(base_size = 10) +
  theme(
    panel.grid.minor = element_blank(),
    plot.margin = margin(5, 10, 5, 5)
  )

print(p)
dev.off()
