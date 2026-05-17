#!/usr/bin/env Rscript
# Additional figures for main text + appendix
library(data.table)
library(ggplot2)
library(tikzDevice)

FIGDIR <- normalizePath("../figures", mustWork = FALSE)

# ── Figure: Spectral evolution (Fiedler λ₂) ──────────────────
cat("Figure: Spectral evolution\n")

spectral <- data.table(
  period = 1:5,
  label = factor(c("2007--13", "2014--16", "2017--19", "2020--21", "2022--26"),
                 levels = c("2007--13", "2014--16", "2017--19", "2020--21", "2022--26")),
  fiedler = c(0.00269, 0.00076, 0.00019, 0.00946, 0.01116)
)

tikz(file.path(FIGDIR, "fig_spectral.tex"), width = 5, height = 3, standAlone = FALSE)
ggplot(spectral, aes(x = label, y = fiedler, group = 1)) +
  geom_line(linewidth = 1, color = "#2166AC") +
  geom_point(size = 3, color = "#2166AC") +
  geom_text(aes(label = sprintf("%.4f", fiedler)), vjust = -1.2, size = 3) +
  annotate("segment", x = 1, xend = 3, y = 0.0035, yend = 0.0035,
           arrow = arrow(length = unit(0.15, "cm"), ends = "both"),
           color = "grey50", linewidth = 0.4) +
  annotate("text", x = 2, y = 0.004, label = "Clarification ($14\\times$ drop)",
           size = 2.8, color = "grey40") +
  annotate("segment", x = 3, xend = 4, y = 0.006, yend = 0.006,
           arrow = arrow(length = unit(0.15, "cm"), ends = "both"),
           color = "#B2182B", linewidth = 0.4) +
  annotate("text", x = 3.5, y = 0.007, label = "$50\\times$ jump",
           size = 2.8, color = "#B2182B") +
  scale_y_continuous("Fiedler value $\\lambda_2$", limits = c(0, 0.013)) +
  xlab("Period") +
  theme_minimal(base_size = 10)
dev.off()

# ── Figure: Justice_kind alignment ────────────────────────────
cat("Figure: Justice_kind alignment\n")

jk <- data.table(
  label = factor(c("2007--13", "2014--16", "2017--19", "2020--21", "2022--26"),
                 levels = c("2007--13", "2014--16", "2017--19", "2020--21", "2022--26")),
  nmi = c(0.653, 0.708, 0.649, 0.456, 0.592),
  k = c(8, 6, 4, 3, 5)
)

tikz(file.path(FIGDIR, "fig_validation_jk.tex"), width = 5, height = 3, standAlone = FALSE)
ggplot(jk, aes(x = label, y = nmi)) +
  geom_col(fill = "#4393C3", alpha = 0.8, width = 0.55) +
  geom_text(aes(label = sprintf("%.3f", nmi)), vjust = -0.5, size = 3) +
  geom_text(aes(label = sprintf("$k{=}%d$", k), y = nmi / 2), size = 3, color = "white") +
  scale_y_continuous("NMI (community vs.\\ \\emph{justice\\_kind})", limits = c(0, 0.85)) +
  xlab("Period") +
  theme_minimal(base_size = 10)
dev.off()

# ── Figure: Embedding vs co-citation comparison ──────────────
cat("Figure: Embedding vs co-citation comparison\n")

comp <- data.table(
  label = rep(factor(c("P1", "P2", "P3", "P4", "P5")), 2),
  type = rep(c("Co-citation vs.\\ justice\\_kind", "Co-citation vs.\\ LLM embedding"), each = 5),
  nmi = c(0.653, 0.708, 0.649, 0.456, 0.592,
          0.426, 0.621, 0.710, 0.588, 0.434)
)

tikz(file.path(FIGDIR, "fig_embed_comparison.tex"), width = 5.5, height = 3.2, standAlone = FALSE)
ggplot(comp, aes(x = label, y = nmi, fill = type)) +
  geom_col(position = position_dodge(0.7), width = 0.6, alpha = 0.85) +
  geom_text(aes(label = sprintf("%.2f", nmi)),
            position = position_dodge(0.7), vjust = -0.4, size = 2.5) +
  scale_fill_manual(values = c("#4393C3", "#D6604D"), name = "") +
  scale_y_continuous("NMI", limits = c(0, 0.85)) +
  xlab("Period") +
  theme_minimal(base_size = 10) +
  theme(legend.position = "bottom", legend.key.size = unit(0.35, "cm"))
dev.off()

# ── Figure: Extended NMI bars with sub-period ─────────────────
cat("Figure: Extended NMI with sub-period\n")

nmi_ext <- data.table(
  transition = factor(c("P1$\\to$P2", "P2$\\to$P3", "P3$\\to$P4",
                         "P4$\\to$P5", "P5a$\\to$P5b"),
                       levels = c("P1$\\to$P2", "P2$\\to$P3", "P3$\\to$P4",
                                  "P4$\\to$P5", "P5a$\\to$P5b")),
  nmi = c(0.826, 0.863, 0.960, 0.770, 0.942),
  sd = c(0.011, 0.007, 0.015, 0.011, 0.010),
  type = c(rep("Between periods", 4), "Within P5")
)

tikz(file.path(FIGDIR, "fig_nmi_extended.tex"), width = 5.5, height = 3, standAlone = FALSE)
ggplot(nmi_ext, aes(x = transition, y = nmi, fill = type)) +
  geom_col(width = 0.6, alpha = 0.8) +
  geom_errorbar(aes(ymin = nmi - 2*sd, ymax = nmi + 2*sd), width = 0.15) +
  geom_text(aes(label = sprintf("%.3f", nmi)), vjust = -1.5, size = 3) +
  scale_fill_manual(values = c("Between periods" = "#4393C3", "Within P5" = "#4DAF4A"), name = "") +
  scale_y_continuous("NMI", limits = c(0, 1.08), breaks = seq(0, 1, 0.25)) +
  xlab("") +
  theme_minimal(base_size = 10) +
  theme(legend.position = "bottom")
dev.off()

# ── Figure: Boundary sensitivity ──────────────────────────────
cat("Figure: Boundary sensitivity\n")

bnd <- data.table(
  boundary = factor(c("2021\n(shift $-1$)", "2022\n(baseline)", "2023\n(shift $+1$)"),
                     levels = c("2021\n(shift $-1$)", "2022\n(baseline)", "2023\n(shift $+1$)")),
  p3p4 = c(0.960, 0.958, 0.955),
  p4p5 = c(0.768, 0.768, 0.767)
)
bnd_long <- melt(bnd, id.vars = "boundary", variable.name = "transition", value.name = "nmi")
bnd_long[, transition := ifelse(transition == "p3p4", "P3$\\to$P4", "P4$\\to$P5")]

tikz(file.path(FIGDIR, "fig_boundary.tex"), width = 4.5, height = 3, standAlone = FALSE)
ggplot(bnd_long, aes(x = boundary, y = nmi, fill = transition)) +
  geom_col(position = position_dodge(0.7), width = 0.6, alpha = 0.8) +
  geom_text(aes(label = sprintf("%.3f", nmi)),
            position = position_dodge(0.7), vjust = -0.4, size = 2.8) +
  scale_fill_manual(values = c("#4393C3", "#D6604D"), name = "") +
  scale_y_continuous("NMI", limits = c(0, 1.05)) +
  xlab("Boundary year") +
  theme_minimal(base_size = 10) +
  theme(legend.position = "bottom")
dev.off()

cat("\nAll figures generated in", FIGDIR, "\n")
