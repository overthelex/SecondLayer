library(tikzDevice)
library(ggplot2)

tikz("fig_top_articles.tex", width = 5.5, height = 3.5, standAlone = FALSE)

df <- data.frame(
  article = c("KK art.\\ 185", "KUpAP art.\\ 130", "CPK art.\\ 178",
              "KUpAP art.\\ 124", "CPK art.\\ 175", "CPK art.\\ 119",
              "Court fee art.\\ 4", "CPK art.\\ 274", "CC art.\\ 526",
              "CPK art.\\ 177"),
  citations = c(3308876, 2965804, 2820188, 2539605, 2102442,
                2090253, 1928355, 1918367, 1893496, 1873939),
  domain = c("Criminal", "Admin.\\ offenses", "Civil proc.",
             "Admin.\\ offenses", "Civil proc.", "Civil proc.",
             "Court fees", "Civil proc.", "Civil", "Civil proc.")
)
df$article <- factor(df$article, levels = rev(df$article))

p <- ggplot(df, aes(x = article, y = citations / 1e6, fill = domain)) +
  geom_col(width = 0.6, alpha = 0.85) +
  geom_text(aes(label = paste0(round(citations / 1e6, 1), "M")),
            hjust = -0.1, size = 2.8) +
  scale_y_continuous(limits = c(0, 4.0), labels = function(x) paste0(x, "M")) +
  scale_fill_brewer(palette = "Set2") +
  coord_flip() +
  labs(x = NULL, y = "Total citations", fill = "Legal domain") +
  theme_minimal(base_size = 9) +
  theme(panel.grid.minor = element_blank(),
        panel.grid.major.y = element_blank(),
        legend.position = "bottom",
        legend.key.size = unit(0.35, "cm"),
        plot.margin = margin(5, 15, 5, 5))

print(p)
dev.off()
