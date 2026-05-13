# LexTreme Dataset Contribution Workflow

## Steps

### 1. Extract data (on prod server)

```bash
scp scripts/lextreme/extract-server-side.py prod:/tmp/extract-lextreme.py
ssh prod "python3 /tmp/extract-lextreme.py"
```

### 2. Download results

```bash
mkdir -p scripts/lextreme/output
scp prod:/tmp/lextreme-ukr-*.jsonl scripts/lextreme/output/
```

### 3. Convert to parquet and upload to HuggingFace

```bash
pip install datasets huggingface_hub pyarrow
huggingface-cli login
python3 scripts/lextreme/upload-to-hf.py
```

### 4. Fork and PR to LexTreme

```bash
# Fork joelniklaus/lextreme on HuggingFace
# Clone your fork
git clone https://huggingface.co/datasets/YOUR_USERNAME/lextreme
cd lextreme

# Edit lextreme.py — add the config from lextreme-config.py
# Commit and push
# Create PR on HuggingFace
```

### 5. Reply to Joel

Subject: Ukrainian Court Decisions subset for LexTreme

```
Hi Joel,

Thanks for the endorsement! I've prepared a Ukrainian court decisions dataset
for LexTreme — case outcome prediction (approved/dismissed/partial) based on
the facts section only.

Source: State Court Decisions Registry (ЄДРСР) — 100M+ decisions.
We extracted ~15K balanced samples from civil and commercial courts (2018-2025).

Dataset: https://huggingface.co/datasets/secondlayer/ukrainian-court-decisions
PR: [link to PR]

Let me know if anything needs adjusting!

Best,
Volodymyr
```
