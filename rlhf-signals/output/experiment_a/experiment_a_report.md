# Experiment A: Tokenizer & Base Model Selection — Results

## Models Evaluated

| Model | Provider | Size | Region |
|-------|----------|------|--------|
| Qwen3 32B (dense) | Qwen | — | eu-central-1 |
| Llama 3.3 70B | Meta | — | us-east-1 |
| Mistral Large 3 (675B) | Mistral AI | — | us-east-1 |
| Llama 4 Maverick (17B MoE) | Meta | — | us-east-1 |
| Qwen3 235B (A22B MoE) | Qwen | — | eu-central-1 |
| Nemotron Super 3 (120B) | NVIDIA | — | eu-central-1 |
| Nova Pro | Amazon | — | eu-central-1 |

## Tokenizer Fertility

| Model | Avg tokens/word | Chars/token | Std |
|-------|----------------|-------------|-----|
| Qwen3 32B (dense) | 3.902 | 1.91 | 0.469 |
| Llama 3.3 70B | 2.652 | 2.84 | 0.452 |
| Mistral Large 3 (675B) | 3.057 | 2.45 | 0.444 |
| Llama 4 Maverick (17B MoE) | 2.434 | 3.09 | 0.398 |
| Qwen3 235B (A22B MoE) | 3.894 | 1.92 | 0.467 |
| Nemotron Super 3 (120B) | 3.082 | 2.43 | 0.453 |
| Nova Pro | 3.605 | 2.07 | 0.419 |

## Task Performance

| Model | Task | Mode | Score | Cost |
|-------|------|------|-------|------|
| Llama 3.3 70B | case_outcome | few_shot | 64.0% | $0.5162 |
| Llama 3.3 70B | case_outcome | zero_shot | 72.3% | $0.4639 |
| Llama 3.3 70B | case_type | few_shot | 96.3% | $0.5267 |
| Llama 3.3 70B | case_type | zero_shot | 94.7% | $0.4624 |
| Llama 3.3 70B | norm_extraction | few_shot | 0.618 | $0.5166 |
| Llama 3.3 70B | norm_extraction | zero_shot | 0.617 | $0.5171 |
| Llama 3.3 70B | summarization | zero_shot | pending | $0.0000 |
| Llama 4 Maverick (17B MoE) | case_outcome | few_shot | 81.7% | $0.1370 |
| Llama 4 Maverick (17B MoE) | case_outcome | zero_shot | 76.0% | $0.1097 |
| Llama 4 Maverick (17B MoE) | case_type | few_shot | 92.0% | $0.1213 |
| Llama 4 Maverick (17B MoE) | case_type | zero_shot | 99.0% | $0.1003 |
| Llama 4 Maverick (17B MoE) | norm_extraction | few_shot | 0.488 | $0.1704 |
| Llama 4 Maverick (17B MoE) | norm_extraction | zero_shot | 0.496 | $0.1716 |
| Mistral Large 3 (675B) | case_outcome | few_shot | 70.0% | $1.7139 |
| Mistral Large 3 (675B) | case_outcome | zero_shot | 75.7% | $1.5931 |
| Mistral Large 3 (675B) | case_type | few_shot | 95.3% | $1.8680 |
| Mistral Large 3 (675B) | case_type | zero_shot | 96.0% | $1.8099 |
| Mistral Large 3 (675B) | norm_extraction | few_shot | 0.575 | $2.0030 |
| Mistral Large 3 (675B) | norm_extraction | zero_shot | 0.576 | $2.0020 |
| Nemotron Super 3 (120B) | case_outcome | few_shot | 65.7% | $0.6313 |
| Nemotron Super 3 (120B) | case_outcome | zero_shot | 81.3% | $0.5660 |
| Nemotron Super 3 (120B) | case_type | few_shot | 95.0% | $0.6464 |
| Nemotron Super 3 (120B) | case_type | zero_shot | 99.0% | $0.5656 |
| Nemotron Super 3 (120B) | norm_extraction | few_shot | 0.564 | $0.6020 |
| Nemotron Super 3 (120B) | norm_extraction | zero_shot | 0.560 | $0.6022 |
| Nova Pro | case_outcome | few_shot | 76.7% | $0.7867 |
| Nova Pro | case_outcome | zero_shot | 77.3% | $0.7168 |
| Nova Pro | case_type | few_shot | 92.7% | $0.7973 |
| Nova Pro | case_type | zero_shot | 98.0% | $0.7020 |
| Nova Pro | norm_extraction | few_shot | 0.585 | $0.9871 |
| Nova Pro | norm_extraction | zero_shot | 0.590 | $0.9900 |
| Qwen3 235B (A22B MoE) | case_outcome | few_shot | 51.7% | $0.8481 |
| Qwen3 235B (A22B MoE) | case_outcome | zero_shot | 79.0% | $0.8536 |
| Qwen3 235B (A22B MoE) | case_type | few_shot | 98.7% | $0.8619 |
| Qwen3 235B (A22B MoE) | case_type | zero_shot | 97.7% | $0.9430 |
| Qwen3 235B (A22B MoE) | norm_extraction | few_shot | 0.476 | $0.9304 |
| Qwen3 235B (A22B MoE) | norm_extraction | zero_shot | 0.479 | $0.9310 |
| Qwen3 32B (dense) | case_outcome | few_shot | 73.0% | $0.3246 |
| Qwen3 32B (dense) | case_outcome | zero_shot | 70.0% | $0.2948 |
| Qwen3 32B (dense) | case_type | few_shot | 95.7% | $0.3354 |
| Qwen3 32B (dense) | case_type | zero_shot | 95.7% | $0.2904 |
| Qwen3 32B (dense) | norm_extraction | few_shot | 0.529 | $0.3453 |
| Qwen3 32B (dense) | norm_extraction | zero_shot | 0.531 | $0.3453 |
| Qwen3 32B (dense) | summarization | few_shot | pending | $0.3530 |
| Qwen3 32B (dense) | summarization | zero_shot | pending | $0.3529 |

**Total experiment cost: $31.41**

## Recommendation

*(To be filled after reviewing results)*