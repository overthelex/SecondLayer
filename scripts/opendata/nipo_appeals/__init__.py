"""NIPO Appeals Chamber (Апеляційна палата НОІВ) decisions scraper.

Sources: nipo.gov.ua (2024+) and the legacy ukrpatent.org archive (2011–2022).
Pipeline: listings -> PDF download -> text/field extraction (multi-process)
-> validation -> Postgres upsert (standalone `nipo_appeals` database).
"""
