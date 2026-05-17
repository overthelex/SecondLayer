# LexTreme Dataset Contribution Workflow

## Prerequisites

```bash
pip install psycopg2-binary datasets huggingface_hub pyarrow
huggingface-cli login
```

## Steps

### 1. Ensure SSH tunnel to prod DB

```bash
# Check if tunnel is already running:
ss -tlnp | grep 5438

# If not, start it:
ssh -fNL 5438:localhost:5432 prod
```

### 2. Extract data from prod

```bash
# Set prod DB password
export PGPASSWORD='...'   # from .env.prod PROD_DB_PASSWORD

# Extract all epochs (may take a while on full_scale due to less fulltext data)
python3 scripts/lextreme/extract-full-local.py --prod

# Or specific epochs with balancing:
python3 scripts/lextreme/extract-full-local.py --prod --target-per-class 20000 --epochs hybrid_war pre_war

# Or pass password directly:
python3 scripts/lextreme/extract-full-local.py --prod --password '...'
```

Output: `scripts/lextreme/output/lextreme-ukr-{pre_war,hybrid_war,full_scale}.jsonl`

### 3. Build temporal splits

```bash
python3 scripts/lextreme/build-temporal-splits.py

# With balancing (equal per class per epoch):
python3 scripts/lextreme/build-temporal-splits.py --balance 20000
```

Output: `scripts/lextreme/output/{epoch}/{train,validation,test}.jsonl`

Each split is chronological -- train contains earliest decisions, test contains latest.

### 4. Upload to HuggingFace

```bash
# Dry run first:
python3 scripts/lextreme/upload-to-hf.py --dry-run

# Upload all configs:
python3 scripts/lextreme/upload-to-hf.py
```

### 5. Fork and PR to LexTreme

```bash
# Fork joelniklaus/lextreme on HuggingFace
git clone https://huggingface.co/datasets/YOUR_USERNAME/lextreme
cd lextreme
# Edit lextreme.py -- add the 3 configs from lextreme-config.py
# Commit and push, create PR on HuggingFace
```

## Data availability notes

Fulltext data on prod is uneven:
- **pre_war** (2008-2013): ~11M fulltext records, solid coverage
- **hybrid_war** (2014-2021): ~56M fulltext records, best coverage
- **full_scale** (2022-2026): ~791K fulltext records, limited (import in progress)

Use `--target-per-class` to balance across epochs if full_scale is too small.
