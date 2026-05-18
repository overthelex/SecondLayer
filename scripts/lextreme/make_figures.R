#!/usr/bin/env Rscript
# Generate TikZ figures for the temporal drift paper.
# Reads JSON results from scripts/lextreme/results/ and outputs .tex figures
# to docs/arxiv-temporal-drift/figures/
#
# Usage:
#   Rscript scripts/lextreme/make_figures.R
#
# Requirements: jsonlite, tikzDevice, ggplot2, dplyr, tidyr, viridis, patchwork

library(jsonlite)
library(tikzDevice)
library(ggplot2)
library(dplyr)
library(tidyr)
library(viridis)
library(patchwork)

RESULTS_DIR <- file.path(dirname(sys.frame(1)$ofile %||% "."), "results")
FIG_DIR <- file.path(dirname(sys.frame(1)$ofile %||% "."),
                     "..", "..", "docs", "arxiv-temporal-drift", "figures")
dir.create(FIG_DIR, recursive = TRUE, showWarnings = FALSE)

EPOCHS <- c("pre_war", "hybrid_war", "full_scale")
EPOCH_LABELS <- c("Pre-war\n(2008--13)", "Hybrid war\n(2014--21)", "Full-scale\n(2022--26)")
EPOCH_SHORT <- c("Pre-war", "Hybrid", "Full-scale")
MODELS <- c("xlm-roberta-base", "xlm-roberta-large",
            "legal-xlm-roberta-base", "legal-xlm-roberta-large")
MODEL_LABELS <- c("XLM-R Base", "XLM-R Large",
                  "Legal-XLM-R Base", "Legal-XLM-R Large")
SEEDS <- c(42, 123, 456)

theme_paper <- function() {
  theme_minimal(base_size = 10) +
    theme(
      panel.grid.minor = element_blank(),
      strip.text = element_text(face = "bold"),
      legend.position = "bottom",
      plot.title = element_text(size = 11, face = "bold", hjust = 0.5)
    )
}

# --- Load results ---

load_cross_epoch <- function() {
  rows <- list()
  for (model in MODELS) {
    for (train_epoch in EPOCHS) {
      for (seed in SEEDS) {
        fname <- file.path(RESULTS_DIR, "models",
                           sprintf("%s_%s_s%d", model, train_epoch, seed),
                           "cross_epoch_results.json")
        if (!file.exists(fname)) next
        data <- fromJSON(fname)
        for (test_epoch in EPOCHS) {
          ce <- data$cross_eval[[test_epoch]]
          rows[[length(rows) + 1]] <- data.frame(
            model = model,
            train_epoch = train_epoch,
            test_epoch = test_epoch,
            seed = seed,
            macro_f1 = ce$macro_f1,
            accuracy = ce$accuracy,
            f1_approved = ce$f1_approved,
            f1_dismissed = ce$f1_dismissed,
            f1_partial = ce$f1_partial,
            stringsAsFactors = FALSE
          )
        }
      }
    }
  }
  if (length(rows) == 0) {
    cat("No cross-epoch results found in", RESULTS_DIR, "\n")
    return(NULL)
  }
  bind_rows(rows)
}

load_continual <- function() {
  rows <- list()
  cont_dir <- file.path(RESULTS_DIR, "continual")
  if (!dir.exists(cont_dir)) return(NULL)
  for (f in list.files(cont_dir, pattern = "continual_results\\.json",
                       recursive = TRUE, full.names = TRUE)) {
    data <- fromJSON(f)
    for (stage in seq_along(data$stages)) {
      s <- data$stages[[stage]]
      for (test_epoch in EPOCHS) {
        ev <- s$eval[[test_epoch]]
        rows[[length(rows) + 1]] <- data.frame(
          model = data$model,
          direction = data$direction,
          seed = data$seed,
          stage = stage,
          trained_on = s$trained_on,
          test_epoch = test_epoch,
          macro_f1 = ev$macro_f1,
          accuracy = ev$accuracy,
          stringsAsFactors = FALSE
        )
      }
    }
  }
  if (length(rows) == 0) return(NULL)
  bind_rows(rows)
}

# --- Figure 1: Cross-epoch heatmap (one per model) ---

fig_heatmap <- function(df) {
  agg <- df %>%
    group_by(model, train_epoch, test_epoch) %>%
    summarise(mean_f1 = mean(macro_f1) * 100,
              sd_f1 = sd(macro_f1) * 100,
              .groups = "drop") %>%
    mutate(
      train_label = factor(train_epoch, levels = EPOCHS, labels = EPOCH_SHORT),
      test_label = factor(test_epoch, levels = EPOCHS, labels = EPOCH_SHORT),
      model_label = factor(model, levels = MODELS, labels = MODEL_LABELS),
      cell_text = sprintf("%.1f", mean_f1)
    )

  p <- ggplot(agg, aes(x = test_label, y = train_label, fill = mean_f1)) +
    geom_tile(color = "white", linewidth = 0.8) +
    geom_text(aes(label = cell_text), size = 3.5, fontface = "bold") +
    facet_wrap(~model_label, nrow = 1) +
    scale_fill_viridis(option = "D", limits = c(40, 100), name = "Macro-F1 (\\%)") +
    labs(x = "Test epoch", y = "Train epoch") +
    theme_paper() +
    theme(
      aspect.ratio = 1,
      axis.text.x = element_text(angle = 0, hjust = 0.5)
    )

  out <- file.path(FIG_DIR, "fig1_cross_epoch_heatmap.tex")
  tikz(out, width = 7, height = 2.8, standAlone = FALSE)
  print(p)
  dev.off()
  cat("Saved", out, "\n")
}

# --- Figure 2: Forward vs backward degradation ---

fig_degradation <- function(df) {
  agg <- df %>%
    group_by(model, train_epoch, test_epoch) %>%
    summarise(mean_f1 = mean(macro_f1) * 100, .groups = "drop")

  degrad <- agg %>%
    pivot_wider(names_from = test_epoch, values_from = mean_f1) %>%
    mutate(model_label = factor(model, levels = MODELS, labels = MODEL_LABELS))

  fwd <- degrad %>%
    filter(train_epoch == "pre_war") %>%
    mutate(degradation = pre_war - full_scale, direction = "Forward")

  bwd <- degrad %>%
    filter(train_epoch == "full_scale") %>%
    mutate(degradation = full_scale - pre_war, direction = "Backward")

  plot_df <- bind_rows(
    fwd %>% select(model_label, degradation, direction),
    bwd %>% select(model_label, degradation, direction)
  )

  p <- ggplot(plot_df, aes(x = model_label, y = degradation, fill = direction)) +
    geom_col(position = position_dodge(width = 0.7), width = 0.6) +
    scale_fill_manual(values = c("Forward" = "#E74C3C", "Backward" = "#3498DB"),
                      name = "Direction") +
    labs(x = NULL, y = "Degradation (pp)",
         title = "Forward vs.\\ backward temporal degradation") +
    theme_paper() +
    theme(axis.text.x = element_text(angle = 15, hjust = 1))

  out <- file.path(FIG_DIR, "fig2_degradation_comparison.tex")
  tikz(out, width = 5, height = 3.2, standAlone = FALSE)
  print(p)
  dev.off()
  cat("Saved", out, "\n")
}

# --- Figure 3: Per-class F1 across epochs ---

fig_per_class <- function(df) {
  agg <- df %>%
    filter(train_epoch == test_epoch) %>%
    group_by(model, train_epoch) %>%
    summarise(
      approved = mean(f1_approved) * 100,
      dismissed = mean(f1_dismissed) * 100,
      partial = mean(f1_partial) * 100,
      .groups = "drop"
    ) %>%
    pivot_longer(cols = c(approved, dismissed, partial),
                 names_to = "class", values_to = "f1") %>%
    mutate(
      model_label = factor(model, levels = MODELS, labels = MODEL_LABELS),
      epoch_label = factor(train_epoch, levels = EPOCHS, labels = EPOCH_SHORT)
    )

  p <- ggplot(agg, aes(x = epoch_label, y = f1, color = class, group = class)) +
    geom_line(linewidth = 0.8) +
    geom_point(size = 2) +
    facet_wrap(~model_label, nrow = 1) +
    scale_color_manual(values = c("approved" = "#27AE60",
                                  "dismissed" = "#E74C3C",
                                  "partial" = "#F39C12"),
                       name = "Class") +
    labs(x = "Epoch", y = "F1 (\\%)",
         title = "Per-class F1 across temporal epochs (in-epoch training)") +
    theme_paper()

  out <- file.path(FIG_DIR, "fig3_per_class_f1.tex")
  tikz(out, width = 7, height = 2.8, standAlone = FALSE)
  print(p)
  dev.off()
  cat("Saved", out, "\n")
}

# --- Figure 4: Continual learning ---

fig_continual <- function(cont_df) {
  if (is.null(cont_df)) {
    cat("No continual learning results, skipping fig4\n")
    return()
  }

  agg <- cont_df %>%
    group_by(model, direction, stage, test_epoch) %>%
    summarise(mean_f1 = mean(macro_f1) * 100, .groups = "drop") %>%
    mutate(
      model_label = factor(model, levels = MODELS, labels = MODEL_LABELS),
      epoch_label = factor(test_epoch, levels = EPOCHS, labels = EPOCH_SHORT)
    )

  p <- ggplot(agg, aes(x = stage, y = mean_f1,
                        color = epoch_label, linetype = direction)) +
    geom_line(linewidth = 0.8) +
    geom_point(size = 2) +
    facet_wrap(~model_label, nrow = 1) +
    scale_color_manual(values = c("#27AE60", "#3498DB", "#E74C3C"),
                       name = "Test epoch") +
    scale_linetype_manual(values = c("forward" = "solid", "backward" = "dashed"),
                          name = "Direction") +
    labs(x = "Training stage", y = "Macro-F1 (\\%)",
         title = "Continual learning: sequential fine-tuning across epochs") +
    theme_paper()

  out <- file.path(FIG_DIR, "fig4_continual_learning.tex")
  tikz(out, width = 7, height = 3, standAlone = FALSE)
  print(p)
  dev.off()
  cat("Saved", out, "\n")
}

# --- Figure 5: Comparison with TF-IDF baseline ---

fig_tfidf_comparison <- function(df) {
  tfidf <- data.frame(
    train_epoch = rep(EPOCHS, each = 3),
    test_epoch = rep(EPOCHS, 3),
    mean_f1 = c(86.5, 74.3, 58.6,   # pre_war trained
                81.5, 83.7, 67.2,   # hybrid_war trained
                79.5, 81.0, 69.3),  # full_scale trained
    model = "TF-IDF",
    stringsAsFactors = FALSE
  )

  neural_agg <- df %>%
    filter(model == "xlm-roberta-base") %>%
    group_by(train_epoch, test_epoch) %>%
    summarise(mean_f1 = mean(macro_f1) * 100, .groups = "drop") %>%
    mutate(model = "XLM-R Base")

  legal_agg <- df %>%
    filter(model == "legal-xlm-roberta-large") %>%
    group_by(train_epoch, test_epoch) %>%
    summarise(mean_f1 = mean(macro_f1) * 100, .groups = "drop") %>%
    mutate(model = "Legal-XLM-R Large")

  plot_df <- bind_rows(tfidf, neural_agg, legal_agg) %>%
    filter(train_epoch == "pre_war") %>%
    mutate(test_label = factor(test_epoch, levels = EPOCHS, labels = EPOCH_SHORT))

  p <- ggplot(plot_df, aes(x = test_label, y = mean_f1,
                            fill = model, group = model)) +
    geom_col(position = position_dodge(width = 0.7), width = 0.6) +
    scale_fill_manual(values = c("TF-IDF" = "#95A5A6",
                                 "XLM-R Base" = "#3498DB",
                                 "Legal-XLM-R Large" = "#E74C3C"),
                      name = NULL) +
    labs(x = "Test epoch", y = "Macro-F1 (\\%)",
         title = "Forward transfer: pre-war trained models on later epochs") +
    theme_paper()

  out <- file.path(FIG_DIR, "fig5_tfidf_comparison.tex")
  tikz(out, width = 4.5, height = 3.2, standAlone = FALSE)
  print(p)
  dev.off()
  cat("Saved", out, "\n")
}

# --- Main ---

main <- function() {
  cat("Loading cross-epoch results...\n")
  df <- load_cross_epoch()
  if (is.null(df)) {
    cat("No results found. Run train_temporal.py first.\n")
    return()
  }

  cat(sprintf("Loaded %d result rows across %d models\n",
              nrow(df), length(unique(df$model))))

  fig_heatmap(df)
  fig_degradation(df)
  fig_per_class(df)
  fig_tfidf_comparison(df)

  cont_df <- load_continual()
  fig_continual(cont_df)

  cat("\nAll figures saved to", FIG_DIR, "\n")
}

main()
