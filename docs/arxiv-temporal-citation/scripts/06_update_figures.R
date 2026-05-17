#!/usr/bin/env Rscript
# Update figures for fullscale results
library(data.table)
library(ggplot2)
library(tikzDevice)
library(jsonlite)

DATADIR <- "/tmp/citation-analysis"
FIGDIR <- normalizePath("../figures", mustWork = FALSE)

summary <- fromJSON(file.path(DATADIR, "fullscale_summary.json"))

# --- Figure 8: NMI bars (updated) ---
cat("Figure 8: NMI bars\n")

nmi_df <- data.frame(
  transition = c("P1-P2\n(2013/14)", "P2-P3\n(2016/17)", "P3-P4\n(2019/20)", "P4-P5\n(2021/22)"),
  nmi = summary$nmi$nmi,
  boot_sd = summary$nmi$nmi_boot_sd,
  stringsAsFactors = FALSE
)
nmi_df$transition <- factor(nmi_df$transition, levels = nmi_df$transition)

tikz(file.path(FIGDIR, "fig8_nmi_bars.tex"), width = 4.5, height = 3, standAlone = FALSE)
ggplot(nmi_df, aes(x = transition, y = nmi)) +
  geom_col(fill = "#4393C3", alpha = 0.8, width = 0.6) +
  geom_errorbar(aes(ymin = nmi - 2*boot_sd, ymax = nmi + 2*boot_sd), width = 0.15) +
  geom_text(aes(label = sprintf("%.3f", nmi)), vjust = -1.5, size = 3) +
  geom_hline(yintercept = 0.77, linetype = "dashed", color = "gray50") +
  scale_y_continuous("NMI", limits = c(0, 1.05), breaks = seq(0, 1, 0.25)) +
  scale_x_discrete("") +
  theme_minimal(base_size = 10) +
  theme(panel.grid.major.x = element_blank())
dev.off()

# --- Figure 9: Period summary (Q, k, nodes) ---
cat("Figure 9: Period summary\n")

periods_df <- data.frame(
  period = paste0("P", 1:5),
  label = c("2007-13", "2014-16", "2017-19", "2020-21", "2022-26"),
  nodes = c(18263, 29476, 29377, 18477, 18533),
  edges_M = c(55.6, 101.9, 101.0, 49.8, 49.8),
  Q = c(0.027, 0.415, 0.311, 0.059, 0.265),
  k = c(8, 6, 4, 3, 5),
  stringsAsFactors = FALSE
)
periods_df$label <- factor(periods_df$label, levels = periods_df$label)

tikz(file.path(FIGDIR, "fig9_period_summary.tex"), width = 5.5, height = 3.5, standAlone = FALSE)

p1 <- ggplot(periods_df, aes(x = label)) +
  geom_col(aes(y = k), fill = "#4393C3", alpha = 0.7, width = 0.5) +
  geom_line(aes(y = Q * 20, group = 1), color = "#D6604D", linewidth = 1) +
  geom_point(aes(y = Q * 20), color = "#D6604D", size = 2.5) +
  scale_y_continuous(
    "Communities $k$",
    sec.axis = sec_axis(~./20, name = "Modularity $Q$")
  ) +
  scale_x_discrete("Period") +
  theme_minimal(base_size = 10) +
  theme(
    axis.title.y.right = element_text(color = "#D6604D"),
    axis.text.y.right = element_text(color = "#D6604D")
  )
print(p1)
dev.off()

# --- Figure 10: Sensitivity (new figure) ---
cat("Figure 10: Sensitivity analysis\n")

# Resolution sensitivity
res_df <- data.frame(
  gamma = c(0.5, 0.8, 1.0, 1.2, 1.5),
  Q = c(0.3098, 0.3105, 0.3106, 0.3100, 0.1608),
  k = c(4, 4, 4, 6, 9431)
)

tikz(file.path(FIGDIR, "fig10_sensitivity.tex"), width = 5, height = 2.8, standAlone = FALSE)
ggplot(res_df[res_df$gamma <= 1.2,], aes(x = gamma, y = Q)) +
  geom_line(linewidth = 0.8, color = "steelblue") +
  geom_point(size = 2.5, color = "steelblue") +
  geom_text(aes(label = sprintf("$k=%d$", k)), vjust = -1.2, size = 3) +
  scale_x_continuous("Resolution $\\gamma$", breaks = c(0.5, 0.8, 1.0, 1.2)) +
  scale_y_continuous("Modularity $Q$", limits = c(0.30, 0.32)) +
  theme_minimal(base_size = 10) +
  annotate("text", x = 1.15, y = 0.302, label = "$\\gamma=1.5$: fragmentation\n($k=9{,}431$, $Q=0.16$)",
           size = 2.5, hjust = 0, color = "gray40")
dev.off()

cat("Figures 8, 9, 10 updated in", FIGDIR, "\n")
