library(tikzDevice)
library(ggplot2)
library(scales)

tikz("fig_type_by_year.tex", width = 5.5, height = 3.5, standAlone = FALSE)

df <- data.frame(
  year = rep(2007:2025, each = 6),
  type = rep(c("Codex article", "Case reference", "Law article",
               "Constitution", "Supreme Court", "Law by number"), 19),
  citations = c(
    27343899,139445,502782,105288,25887,32692,
    3884645,32765,122512,34336,5779,5172,
    95362,1790,21020,3230,204,568,
    10122567,99550,3261201,807640,26436,108737,
    3240246,24357,510348,164722,4433,16022,
    7024331,860863,665062,100115,16958,13859,
    4091171,702530,313174,37540,17055,11017,
    20856380,2328231,1513912,172484,69775,31714,
    19741725,2210983,906978,103993,64930,23901,
    62544922,8731729,2845730,433742,309383,114707,
    21144462,3495818,1239450,208528,134664,51311,
    21655340,3644462,1221347,224641,140683,76724,
    19486025,3423770,966814,196881,123491,44642,
    20046755,3921584,1068492,206131,137320,51771,
    17398440,4145803,897421,175230,114553,38923,
    17831826,6427181,1253093,234879,166697,67994,
    25397281,8155476,1303847,197870,174651,59210,
    35125523,9047849,2025662,334505,198803,103800,
    31077679,8436174,1715653,243142,161684,62668
  )
)

df_main <- df[df$type %in% c("Codex article", "Case reference", "Law article"),]

p <- ggplot(df_main, aes(x = year, y = citations / 1e6, fill = type)) +
  geom_area(alpha = 0.7, position = "stack") +
  scale_fill_manual(values = c("Codex article" = "steelblue",
                                "Case reference" = "coral3",
                                "Law article" = "goldenrod3")) +
  scale_y_continuous(labels = function(x) paste0(x, "M")) +
  scale_x_continuous(breaks = seq(2007, 2025, 3)) +
  labs(x = "Year", y = "Citation edges", fill = NULL) +
  theme_minimal(base_size = 10) +
  theme(panel.grid.minor = element_blank(),
        legend.position = "bottom",
        legend.key.size = unit(0.35, "cm"),
        plot.margin = margin(5, 10, 5, 5))

print(p)
dev.off()
