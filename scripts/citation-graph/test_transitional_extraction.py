"""LEXAI-1817 — transitional-provision citation extraction (пункти перехідних положень ПКУ).

The extractor parsed only «ст. N» constructions: across all 331M law_court_citations
rows there was not a single dotted law_article, so norms like пп. 38.6 / 69.22
підрозд. 10 розд. XX ПКУ (the whole ATO/martial-law tax wave) were invisible to the
citation graph. Fixtures below are verbatim from prod decision 107631753 (280/5185/19).

Run: python3 -m unittest scripts/citation-graph/test_transitional_extraction.py -v
(or from this directory: python3 -m unittest test_transitional_extraction -v)
"""

import importlib.util
import sys
import types
import unittest
from pathlib import Path

# extract-citations.py imports psycopg2 at module level; the parser under test is
# pure-regex, so stub the DB driver when it isn't installed locally.
if "psycopg2" not in sys.modules:
    try:
        import psycopg2  # noqa: F401
    except ImportError:
        stub = types.ModuleType("psycopg2")
        stub.extras = types.ModuleType("psycopg2.extras")
        stub.extras.execute_values = lambda *a, **k: None
        sys.modules["psycopg2"] = stub
        sys.modules["psycopg2.extras"] = stub.extras

_SPEC = importlib.util.spec_from_file_location(
    "extract_citations", Path(__file__).with_name("extract-citations.py"))
ec = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(ec)


def transitional(text: str):
    return [
        (c.law_ref, c.article_ref)
        for c in ec.extract_citations_from_text(1, text)
        if c.citation_type == "transitional_provision"
    ]


class TransitionalProvisionExtraction(unittest.TestCase):
    def test_canonical_form_cyrillic_xx(self):
        # Verbatim from doc 107631753 (280/5185/19) — NB розділ «ХХ» is CYRILLIC here.
        text = ("розташована на тимчасово окупованій території та/або території населених "
                "пунктів на лінії зіткнення, а тому, в силу положень підпункту 38.6 пункту 38 "
                "підрозділу 10 розділу ХХ «Перехідні положення» ПК України, не є об`єктом "
                "оподаткування податком на нерухоме майно")
        self.assertIn(("Податковий кодекс України", "38.6"), transitional(text))

    def test_loose_form_named_pidrozdil(self):
        # Verbatim from the same decision: no розділ number, subdivision named in words.
        text = ("Позивач уважає, що у відповідно до пункту 38.6. Підрозділу «Інших "
                "Перехідних положень» Податкового Кодексу України він звільнений від сплати податку")
        self.assertIn(("Податковий кодекс України", "38.6"), transitional(text))

    def test_martial_law_6922_abbreviated_latin_xx(self):
        text = ("відповідно до п.п. 69.22 п. 69 підрозд. 10 розд. XX ПКУ податок на нерухоме "
                "майно не нараховується та не сплачується")
        self.assertIn(("Податковий кодекс України", "69.22"), transitional(text))

    def test_punkt_form_without_parent(self):
        text = "згідно з пунктом 69.22 підрозділу 10 розділу XX Податкового кодексу України"
        self.assertIn(("Податковий кодекс України", "69.22"), transitional(text))

    def test_article_subpoint_is_not_transitional(self):
        # Sub-points of ordinary articles must NOT be captured (no підрозділ anchor).
        text = "у розумінні підпункту 14.1.235 пункту 14.1 статті 14 ПКУ позивач є резидентом"
        self.assertEqual(transitional(text), [])

    def test_final_provisions_of_a_law_are_not_captured(self):
        text = ("відповідно до пункту 5 розділу II «Прикінцеві положення» Закону України "
                "від 06.06.2012 № 4915-VI")
        self.assertEqual(transitional(text), [])

    def test_codex_article_extraction_unaffected(self):
        text = "не є об`єктом оподаткування відповідно до статті 266 ПК України"
        cites = ec.extract_citations_from_text(1, text)
        self.assertTrue(any(
            c.citation_type == "codex_article"
            and c.law_ref == "Податковий кодекс України"
            and c.article_ref == "266"
            for c in cites))

    def test_statute_types_route_to_statute_table(self):
        self.assertIn("transitional_provision", ec._STATUTE_TYPES)

    def test_trailing_dot_stripped_from_point_number(self):
        text = "відповідно до пункту 69.22. підрозділу 10 розділу XX ПКУ"
        arts = [a for (_l, a) in transitional(text)]
        self.assertIn("69.22", arts)
        self.assertNotIn("69.22.", arts)


if __name__ == "__main__":
    unittest.main()


class TestDashPointPreservation(unittest.TestCase):
    """LEXAI-1818 — dash-numbered пункти підрозділів (16-1 військовий збір, 52-1 covid)
    are a DIFFERENT numbering space from dotted subpoints (38.6): normalising '-' to '.'
    made «п. 16-1 підрозділу 10» collide with ст.16 п.16.1 of the main body and bind the
    wrong article. The extractor must preserve the form as written; disambiguation of
    sloppy court renderings belongs to the resolver (dash→dotted fallback when the dash
    target does not exist)."""

    def test_dash_point_military_levy_preserved(self):
        text = "відповідно до пункту 16-1 підрозділу 10 розділу XX Податкового кодексу України"
        self.assertIn(("Податковий кодекс України", "16-1"), transitional(text))

    def test_dash_point_covid_moratorium_preserved(self):
        text = "згідно з п. 52-1 підрозд. 10 розд. ХХ ПК України мораторій на проведення перевірок"
        self.assertIn(("Податковий кодекс України", "52-1"), transitional(text))

    def test_dotted_subpoint_still_dotted(self):
        text = "підпункту 38.6 пункту 38 підрозділу 10 розділу XX Податкового кодексу України"
        self.assertIn(("Податковий кодекс України", "38.6"), transitional(text))

    def test_trailing_dot_still_stripped(self):
        text = "пункту 69.22 підрозділу 10 розділу XX. Податкового кодексу України"
        self.assertIn(("Податковий кодекс України", "69.22"), transitional(text))
