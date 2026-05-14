library(tikzDevice)
library(ggplot2)

tikz("fig_radar_comparison.tex", width = 5.5, height = 4.0, standAlone = FALSE)

conditions <- c("C1\nPersistence", "C2\nComposition", "C3\nRefinement",
                 "C4\nAsymmetry", "C5\nGrounding")

dc_scores <- c(1.0, 1.0, 1.0, 1.0, 1.0)
onto_scores <- c(0.5, 0.0, 0.5, 0.0, 0.0)

n <- length(conditions)
angles <- seq(0, 2 * pi, length.out = n + 1)[1:n]

make_xy <- function(scores, angles) {
  data.frame(
    x = scores * cos(angles - pi/2),
    y = scores * sin(angles - pi/2)
  )
}

dc_xy <- make_xy(dc_scores, angles)
dc_xy <- rbind(dc_xy, dc_xy[1,])
dc_xy$system <- "Domain Constitution"

onto_xy <- make_xy(onto_scores, angles)
onto_xy <- rbind(onto_xy, onto_xy[1,])
onto_xy$system <- "OntoChatGPT"

label_xy <- make_xy(rep(1.18, n), angles)
label_xy$label <- conditions

grid_df <- do.call(rbind, lapply(c(0.25, 0.5, 0.75, 1.0), function(r) {
  pts <- make_xy(rep(r, n), angles)
  pts <- rbind(pts, pts[1,])
  pts$r <- r
  pts
}))

spokes <- data.frame(
  x = 0, y = 0,
  xend = cos(angles - pi/2),
  yend = sin(angles - pi/2)
)

p <- ggplot() +
  geom_path(data = grid_df, aes(x = x, y = y, group = r),
            color = "gray85", linewidth = 0.3) +
  geom_segment(data = spokes, aes(x = x, y = y, xend = xend, yend = yend),
               color = "gray85", linewidth = 0.3) +
  geom_polygon(data = dc_xy, aes(x = x, y = y),
               fill = "steelblue", alpha = 0.25, color = "steelblue", linewidth = 0.8) +
  geom_polygon(data = onto_xy, aes(x = x, y = y),
               fill = "coral3", alpha = 0.2, color = "coral3", linewidth = 0.8, linetype = "dashed") +
  geom_point(data = dc_xy[1:n,], aes(x = x, y = y), color = "steelblue", size = 2.5) +
  geom_point(data = onto_xy[1:n,], aes(x = x, y = y), color = "coral3", size = 2.5) +
  geom_text(data = label_xy, aes(x = x, y = y, label = label),
            size = 2.8, lineheight = 0.85) +
  annotate("text", x = 0.55, y = -0.95,
           label = "Domain Constitution", color = "steelblue", size = 3, fontface = "bold") +
  annotate("text", x = 0.55, y = -1.1,
           label = "OntoChatGPT", color = "coral3", size = 3, fontface = "bold") +
  annotate("point", x = 0.42, y = -0.95, color = "steelblue", size = 2) +
  annotate("point", x = 0.42, y = -1.1, color = "coral3", size = 2) +
  coord_equal(xlim = c(-1.4, 1.4), ylim = c(-1.3, 1.4)) +
  theme_void() +
  theme(plot.margin = margin(5, 5, 5, 5))

print(p)
dev.off()
