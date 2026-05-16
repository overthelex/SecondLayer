#!/usr/bin/env Rscript
# Figures for "Temporal Dynamics of Legal Citation Networks" paper
# Requires: duckdb, igraph, data.table, ggplot2, tikzDevice, ggalluvial

library(data.table)
library(ggplot2)
library(tikzDevice)

OUTDIR <- "/tmp/citation-analysis"
FIGDIR <- normalizePath("../figures", mustWork = FALSE)
dir.create(FIGDIR, showWarnings = FALSE, recursive = TRUE)

# --- Figure 1: Citation volume by justice_kind ---
cat("Figure 1: Citation volume time series\n")
yearly <- fread(file.path(OUTDIR, "yearly_totals_by_type.csv"))

# Normalize by total decisions per year (from documents)
docs <- fread(cmd = sprintf(
  "docker exec secondlayer-postgres-local psql -U secondlayer -d secondlayer_local --csv -c \"SELECT EXTRACT(YEAR FROM adjudication_date)::INT as year, count(*) as n FROM edrsr_documents_p_2007 GROUP BY 1 %s ORDER BY 1\"",
  paste(sapply(2008:2026, function(y)
    sprintf("UNION ALL SELECT EXTRACT(YEAR FROM adjudication_date)::INT, count(*) FROM edrsr_documents_p_%d GROUP BY 1", y)),
    collapse = " ")))

yearly_long <- melt(yearly, id.vars = "year", variable.name = "type", value.name = "citations")
yearly_long <- yearly_long[type != "total"]

tikz(file.path(FIGDIR, "fig1_volume.tex"), width = 6, height = 3.5, standAlone = FALSE)
ggplot(yearly_long[year >= 2010], aes(x = year, y = citations / 1e6, color = type)) +
  geom_line(linewidth = 0.8) +
  geom_point(size = 1.2) +
  scale_y_continuous("Citations (millions)") +
  scale_x_continuous("Year", breaks = seq(2010, 2026, 2)) +
  scale_color_brewer(palette = "Set1", labels = c(
    codex = "Codex articles",
    law = "Law articles",
    constitution = "Constitution",
    case_ref = "Case references",
    supreme = "Supreme Court"
  )) +
  theme_minimal(base_size = 10) +
  theme(legend.position = "bottom", legend.title = element_blank()) +
  geom_vline(xintercept = 2017, linetype = "dashed", alpha = 0.5) +
  geom_vline(xintercept = 2022, linetype = "dashed", color = "red", alpha = 0.5) +
  annotate("text", x = 2017.2, y = max(yearly_long$citations[yearly_long$year >= 2010]) / 1e6 * 0.9,
           label = "Judicial reform", hjust = 0, size = 2.5) +
  annotate("text", x = 2022.2, y = max(yearly_long$citations[yearly_long$year >= 2010]) / 1e6 * 0.8,
           label = "Full-scale invasion", hjust = 0, size = 2.5, color = "red")
dev.off()

# --- Figure 5: Citation entropy ---
cat("Figure 5: Citation entropy time series\n")
entropy <- fread(file.path(OUTDIR, "yearly_entropy.csv"))

tikz(file.path(FIGDIR, "fig5_entropy.tex"), width = 5, height = 3, standAlone = FALSE)
ggplot(entropy[year >= 2010], aes(x = year, y = entropy)) +
  geom_line(linewidth = 0.8, color = "steelblue") +
  geom_point(size = 1.5, color = "steelblue") +
  scale_y_continuous("Shannon entropy $H(t)$") +
  scale_x_continuous("Year", breaks = seq(2010, 2026, 2)) +
  theme_minimal(base_size = 10) +
  geom_vline(xintercept = 2022, linetype = "dashed", color = "red", alpha = 0.7) +
  annotate("text", x = 2022.3, y = max(entropy$entropy[entropy$year >= 2010]) * 0.95,
           label = "2022 invasion", hjust = 0, size = 2.5, color = "red")
dev.off()

# --- Figure 2: War impact — martial law adoption ---
cat("Figure 2: War-related law adoption curves\n")
war <- fread(file.path(OUTDIR, "war_impact_laws.csv"))
war_long <- melt(war, id.vars = "year", variable.name = "law", value.name = "citations")

tikz(file.path(FIGDIR, "fig2_war_adoption.tex"), width = 5.5, height = 3.5, standAlone = FALSE)
ggplot(war_long[year >= 2014 & citations > 0], aes(x = year, y = citations, color = law)) +
  geom_line(linewidth = 0.8) +
  geom_point(size = 1.2) +
  scale_y_log10("Citations (log scale)") +
  scale_x_continuous("Year", breaks = seq(2014, 2026, 2)) +
  scale_color_brewer(palette = "Dark2", labels = c(
    martial_law = "Martial law regime",
    mobilization = "Mobilization",
    occupied_territories = "Occupied territories",
    wartime_labor = "Wartime labor"
  )) +
  theme_minimal(base_size = 10) +
  theme(legend.position = "bottom", legend.title = element_blank()) +
  geom_vline(xintercept = 2022, linetype = "dashed", color = "red", alpha = 0.5)
dev.off()

cat("Figures 1, 2, 5 generated in", FIGDIR, "\n")
