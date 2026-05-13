"""
Config snippet to add to lextreme.py in joelniklaus/lextreme.

This defines the Ukrainian court decisions subset for the LexTreme benchmark.
Copy the _UKRAINIAN_COURT_DECISIONS_JUDGMENT dict and the LextremeConfig line
into the appropriate places in lextreme.py.
"""

# --- Add this dict alongside other dataset configs ---

_UKRAINIAN_COURT_DECISIONS_JUDGMENT = {
    "task_type": "TaskType.SLTC",
    "hf_hub_name": "secondlayer/ukrainian-court-decisions",
    "language": "uk",
    "config_name": "default",
    "input_col": "text",
    "label_col": "label",
    "url": "https://reyestr.court.gov.ua/",
    "description": (
        "Ukrainian Court Decisions Judgment Prediction dataset. "
        "Contains facts sections (ВСТАНОВИВ) of civil and commercial court decisions "
        "from the State Court Decisions Registry of Ukraine (ЄДРСР). "
        "The task is to predict the judgment outcome: approved, dismissed, or partial."
    ),
    "citation": """@misc{ovcharov2025ukrainian,
  title={Ukrainian Court Decisions Dataset for Judgment Prediction},
  author={Ovcharov, Volodymyr},
  year={2025},
  url={https://huggingface.co/datasets/secondlayer/ukrainian-court-decisions},
  note={Extracted from the State Court Decisions Registry of Ukraine}
}""",
    "label_classes": ["approved", "dismissed", "partial"],
}

# --- Add this line to BUILDER_CONFIGS list ---
# LextremeConfig(
#     name="ukrainian_court_decisions_judgment",
#     description=_UKRAINIAN_COURT_DECISIONS_JUDGMENT["description"],
#     **_UKRAINIAN_COURT_DECISIONS_JUDGMENT,
# ),

print("Config for lextreme.py PR:")
print()
print("1. Add _UKRAINIAN_COURT_DECISIONS_JUDGMENT dict (see above)")
print("2. Add LextremeConfig entry to BUILDER_CONFIGS list")
print("3. Test: load_dataset('lextreme', 'ukrainian_court_decisions_judgment')")
