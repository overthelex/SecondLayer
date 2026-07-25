#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"

echo "=== DefectRadar Pipeline ==="
echo ""

# Check dependencies
python3 -c "import psycopg2, pymorphy3, regex, tqdm" 2>/dev/null || {
    echo "Installing dependencies..."
    pip install -r requirements.txt
}

echo "=== Stage 1: Definition Extraction ==="
python3 extract_definitions.py

echo ""
echo "=== Stage 2: Circulus in Definiendo Detection ==="
python3 detect_circulus.py "$@"

echo ""
echo "=== Stage 3: Ignotum per Ignotum Detection ==="
python3 detect_ignotum.py

echo ""
echo "=== Pipeline Complete ==="
echo "Results:"
echo "  definitions.jsonl     - extracted definitions"
echo "  circulus_results.jsonl - circulus detection"
echo "  ignotum_results.jsonl - ignotum detection"
