"""Configuration for the NIPO Appeals Chamber scraper (env-driven, like sibling opendata scripts)."""

import os

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36 SecondLayerBot/1.0"
)

DATABASE_URL = os.environ.get("DATABASE_URL", "")

# MinIO / S3 (same convention as scripts/opendata/nipo/download_images.py)
S3_ENDPOINT = os.environ.get("S3_ENDPOINT", "http://127.0.0.1:9000")
S3_ACCESS_KEY = os.environ.get("S3_ACCESS_KEY", os.environ.get("MINIO_ACCESS_KEY", ""))
S3_SECRET_KEY = os.environ.get("S3_SECRET_KEY", os.environ.get("MINIO_SECRET_KEY", ""))
S3_REGION = os.environ.get("S3_REGION", "us-east-1")
S3_BUCKET = os.environ.get("NIPO_APPEALS_BUCKET", "nipo-appeals")

# Qdrant + BGE-M3 TEI (same stack as the EDRSR vectorizer)
QDRANT_URL = os.environ.get("QDRANT_URL", "http://127.0.0.1:6333")
QDRANT_API_KEY = os.environ.get("QDRANT_API_KEY") or None
QDRANT_COLLECTION = os.environ.get("QDRANT_NIPO_COLLECTION", "nipo_appeals")
BGE_M3_URL = os.environ.get("BGE_M3_URL", "")
EMBEDDING_MODEL = "bge-m3"
EMBEDDING_DIM = 1024
EMBED_BATCH_SIZE = 64
MAX_CHUNK_CHARS = 2048
CHUNK_OVERLAP_WORDS = 50

# Local cache for downloaded PDFs/images (checkpoint: re-runs skip existing files)
DATA_DIR = os.environ.get("NIPO_APPEALS_DATA_DIR", os.path.join(os.path.dirname(__file__), "data"))

HTTP_TIMEOUT = 60
DOWNLOAD_RETRIES = 3
POLITE_DELAY_S = float(os.environ.get("NIPO_APPEALS_DELAY", "0.2"))

# ── Sources ──────────────────────────────────────────────────────────────────

NIPO_BASE = "https://nipo.gov.ua"
NIPO_HUB_URL = f"{NIPO_BASE}/apeliatsijna-palata-noiv/"
NIPO_SECTIONS = {
    "tm": f"{NIPO_BASE}/rishennia-apeliatsiinoi-palaty-tm/",
    "inventions": f"{NIPO_BASE}/rishennia-apeliatsiinoi-palaty-vynakhody-km/",
    "well_known": f"{NIPO_BASE}/rishennia-apeliatsiinoi-palaty-dv-tm/",
}

UKRPATENT_BASE = "https://ukrpatent.org"
UKRPATENT_YEARS = list(range(2011, 2023))  # 2011–2022; 2023 — палата перезапускалась, архіву нема
UKRPATENT_SECTIONS = {
    "tm": "ap-tm",
    "inventions": "ap-inventions-models",
    "well_known": "ap-tm-well-known",
}


def ukrpatent_year_url(section_slug: str, year: int) -> str:
    return f"{UKRPATENT_BASE}/uk/articles/{section_slug}-{year}"
