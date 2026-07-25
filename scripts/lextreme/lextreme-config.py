"""
Config snippet to add to lextreme.py in joelniklaus/lextreme.

Three configs -- one per temporal epoch -- pointing to *_lextreme configs
in the source dataset (≤1000 val/test for fast benchmark evaluation).

Full untruncated data lives in pre_war / hybrid_war / full_scale configs
of the source dataset (overthelex/ukrainian-court-decisions).
"""

_UKRAINIAN_COURT_DECISIONS_BASE = {
    "task_type": "TaskType.SLTC",
    "hf_hub_name": "overthelex/ukrainian-court-decisions",
    "language": "uk",
    "input_col": "text",
    "label_col": "label",
    "url": "https://reyestr.court.gov.ua/",
    "label_classes": ["approved", "dismissed", "partial"],
    "citation": """@misc{ovcharov2025ukrainian,
  title={Ukrainian Court Decisions Dataset for Judgment Prediction},
  author={Ovcharov, Volodymyr},
  year={2025},
  url={https://huggingface.co/datasets/overthelex/ukrainian-court-decisions},
  note={Extracted from the State Court Decisions Registry of Ukraine}
}""",
}

_UKRAINIAN_COURT_DECISIONS_PRE_WAR = {
    **_UKRAINIAN_COURT_DECISIONS_BASE,
    "config_name": "pre_war_lextreme",
    "description": (
        "Ukrainian Court Decisions Judgment Prediction (pre-war epoch, 2008-2013). "
        "Civil and commercial court decisions with temporal train/val/test splits. "
        "LEXTREME benchmark subset with ≤1000 val/test samples."
    ),
}

_UKRAINIAN_COURT_DECISIONS_HYBRID_WAR = {
    **_UKRAINIAN_COURT_DECISIONS_BASE,
    "config_name": "hybrid_war_lextreme",
    "description": (
        "Ukrainian Court Decisions Judgment Prediction (hybrid war epoch, 2014-2021). "
        "Civil and commercial court decisions with temporal train/val/test splits. "
        "LEXTREME benchmark subset with ≤1000 val/test samples."
    ),
}

_UKRAINIAN_COURT_DECISIONS_FULL_SCALE = {
    **_UKRAINIAN_COURT_DECISIONS_BASE,
    "config_name": "full_scale_lextreme",
    "description": (
        "Ukrainian Court Decisions Judgment Prediction (full-scale war epoch, 2022-2026). "
        "Civil and commercial court decisions with temporal train/val/test splits. "
        "LEXTREME benchmark subset with ≤1000 val/test samples."
    ),
}

# --- Add these lines to BUILDER_CONFIGS list ---
# LextremeConfig(
#     name="ukrainian_court_decisions_judgment_pre_war",
#     description=_UKRAINIAN_COURT_DECISIONS_PRE_WAR["description"],
#     **_UKRAINIAN_COURT_DECISIONS_PRE_WAR,
# ),
# LextremeConfig(
#     name="ukrainian_court_decisions_judgment_hybrid_war",
#     description=_UKRAINIAN_COURT_DECISIONS_HYBRID_WAR["description"],
#     **_UKRAINIAN_COURT_DECISIONS_HYBRID_WAR,
# ),
# LextremeConfig(
#     name="ukrainian_court_decisions_judgment_full_scale",
#     description=_UKRAINIAN_COURT_DECISIONS_FULL_SCALE["description"],
#     **_UKRAINIAN_COURT_DECISIONS_FULL_SCALE,
# ),

print("Configs for lextreme.py PR:")
print()
print("1. Add _UKRAINIAN_COURT_DECISIONS_* dicts (3 epochs)")
print("2. Add 3 LextremeConfig entries to BUILDER_CONFIGS")
print("3. LEXTREME configs point to *_lextreme source configs (≤1000 val/test)")
print("4. Full data available in pre_war / hybrid_war / full_scale source configs")
print("5. Test:")
print("   load_dataset('lextreme', 'ukrainian_court_decisions_judgment_pre_war')")
print("   load_dataset('lextreme', 'ukrainian_court_decisions_judgment_hybrid_war')")
print("   load_dataset('lextreme', 'ukrainian_court_decisions_judgment_full_scale')")
