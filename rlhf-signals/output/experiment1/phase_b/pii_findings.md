# PII Scan Findings

**Total findings:** 84

## Summary by Severity

| Severity | Count |
|----------|-------|
| high | 14 |
| medium | 70 |
| low | 0 |

## Summary by Type

| Type | Count |
|------|-------|
| project_names | 60 |
| phone_intl | 10 |
| person_names | 9 |
| internal_hostname | 3 |
| internal_url | 2 |

## Detailed Findings

| sample_id | field | match_type | matched_text | severity | action |
|-----------|-------|------------|--------------|----------|--------|
| 0983e6de-4cc... | llm_output | person_names | `Tanisha Minev` | high | redact |
| 19b0e276-799... | llm_output | person_names | `Kadelbach` | high | redact |
| 19b0e276-799... | llm_output | person_names | `Breidenbach` | high | redact |
| 19b0e276-799... | llm_output | person_names | `Breidenbach` | high | redact |
| 19b0e276-799... | llm_output | person_names | `Kadelbach` | high | redact |
| 589d6059-3ff... | founder_edit | person_names | `ovcharov` | high | redact |
| 7deda298-bd8... | llm_output | internal_hostname | `mail.merged.com.ua` | high | redact |
| 7deda298-bd8... | llm_output | internal_hostname | `mail.merged.com.ua` | high | redact |
| a264c598-2dd... | llm_output | internal_url | `https://plane.legal.org.ua/lex...` | high | redact |
| a264c598-2dd... | llm_output | internal_hostname | `plane.legal.org.ua` | high | redact |
| c6662016-e92... | founder_edit | person_names | `vladimir` | high | redact |
| d24ce76c-d2d... | founder_edit | internal_url | `http://127.0.0.1:3000/`.` | high | redact |
| fa76d947-bd5... | llm_output | person_names | `Овчаров` | high | redact |
| fa76d947-bd5... | llm_output | person_names | `Володимир` | high | redact |
| 19fd85b1-54f... | founder_edit | project_names | `sneakypiper` | medium | flag |
| 3ea23ceb-a56... | founder_edit | project_names | `SneakyPiper` | medium | flag |
| 3ea23ceb-a56... | founder_edit | project_names | `sneakypiper` | medium | flag |
| 40c70c23-d0e... | founder_edit | project_names | `calendary` | medium | flag |
| 40c70c23-d0e... | founder_edit | project_names | `calendary` | medium | flag |
| 40c70c23-d0e... | founder_edit | project_names | `calendary` | medium | flag |
| 549a6170-55d... | llm_output | project_names | `SecondLayer` | medium | flag |
| 549a6170-55d... | founder_edit | project_names | `SecondLayer` | medium | flag |
| 5745490a-05f... | llm_output | project_names | `calendary` | medium | flag |
| 589d6059-3ff... | founder_edit | project_names | `Panoptic` | medium | flag |
| 7deda298-bd8... | llm_output | project_names | `legal.org.ua` | medium | flag |
| 7deda298-bd8... | founder_edit | project_names | `legal.org.ua` | medium | flag |
| 7deda298-bd8... | founder_edit | project_names | `panoptic` | medium | flag |
| 7deda298-bd8... | founder_edit | project_names | `panoptic` | medium | flag |
| 9e5603ad-a47... | founder_edit | project_names | `secondlayer` | medium | flag |
| a264c598-2dd... | llm_output | project_names | `AIPROMO` | medium | flag |
| a264c598-2dd... | llm_output | project_names | `SneakyPiper` | medium | flag |
| a264c598-2dd... | llm_output | project_names | `Panoptic` | medium | flag |
| a264c598-2dd... | llm_output | project_names | `Calendary` | medium | flag |
| a264c598-2dd... | llm_output | project_names | `legal.org.ua` | medium | flag |
| a65f333d-45b... | founder_edit | phone_intl | `178.162.234.145` | medium | flag |
| b3484807-71d... | llm_output | project_names | `Panoptic` | medium | flag |
| b5004c20-890... | llm_output | project_names | `secondlayer` | medium | flag |
| b5004c20-890... | llm_output | project_names | `SecondLayer` | medium | flag |
| b5004c20-890... | founder_edit | project_names | `secondlayer` | medium | flag |
| b5004c20-890... | founder_edit | project_names | `secondlayer` | medium | flag |
| b64a7626-633... | founder_edit | project_names | `panoptic` | medium | flag |
| c14bdba1-8b5... | llm_output | project_names | `calendary` | medium | flag |
| cc133ab4-239... | llm_output | project_names | `SecondLayer` | medium | flag |
| cc133ab4-239... | llm_output | project_names | `SecondLayer` | medium | flag |
| cc133ab4-239... | llm_output | project_names | `secondlayer` | medium | flag |
| cc133ab4-239... | llm_output | project_names | `SecondLayer` | medium | flag |
| cc133ab4-239... | llm_output | project_names | `SecondLayer` | medium | flag |
| cc133ab4-239... | llm_output | project_names | `fondy` | medium | flag |
| cc133ab4-239... | llm_output | project_names | `SecondLayer` | medium | flag |
| cc133ab4-239... | llm_output | project_names | `SecondLayer` | medium | flag |
| cc133ab4-239... | llm_output | project_names | `SecondLayer` | medium | flag |
| cc133ab4-239... | llm_output | project_names | `SecondLayer` | medium | flag |
| cc133ab4-239... | llm_output | project_names | `SecondLayer` | medium | flag |
| cc133ab4-239... | llm_output | project_names | `SecondLayer` | medium | flag |
| cc133ab4-239... | llm_output | project_names | `SecondLayer` | medium | flag |
| cc133ab4-239... | llm_output | project_names | `SecondLayer` | medium | flag |
| cc133ab4-239... | llm_output | project_names | `SecondLayer` | medium | flag |
| cc133ab4-239... | founder_edit | project_names | `SecondLayer` | medium | flag |
| cc133ab4-239... | founder_edit | project_names | `SecondLayer` | medium | flag |
| cc133ab4-239... | founder_edit | project_names | `secondlayer` | medium | flag |
| cc133ab4-239... | founder_edit | project_names | `SecondLayer` | medium | flag |
| cd37d9a2-11e... | llm_output | project_names | `legal.org.ua` | medium | flag |
| cd37d9a2-11e... | llm_output | project_names | `sneakypiper` | medium | flag |
| d7df8485-aa8... | founder_edit | phone_intl | `8-4208641` | medium | flag |
| d7df8485-aa8... | founder_edit | project_names | `panoptic` | medium | flag |
| d7df8485-aa8... | founder_edit | project_names | `panoptic` | medium | flag |
| d7df8485-aa8... | founder_edit | project_names | `panoptic` | medium | flag |
| d7df8485-aa8... | founder_edit | project_names | `panoptic` | medium | flag |
| d7df8485-aa8... | founder_edit | project_names | `panoptic` | medium | flag |
| d7df8485-aa8... | founder_edit | project_names | `panoptic` | medium | flag |
| db4ac7a2-86d... | llm_output | project_names | `legal.org.ua` | medium | flag |
| db4ac7a2-86d... | founder_edit | project_names | `legal.org.ua` | medium | flag |
| de31d145-927... | llm_output | project_names | `panoptic` | medium | flag |
| ea916059-e97... | llm_output | phone_intl | `13.49.105.191` | medium | flag |
| ea916059-e97... | llm_output | phone_intl | `51.20.152.89` | medium | flag |
| ea916059-e97... | llm_output | phone_intl | `13.53.106.59` | medium | flag |
| ea916059-e97... | llm_output | phone_intl | `18.192.189.254` | medium | flag |
| ea916059-e97... | founder_edit | phone_intl | `13.49.105.191` | medium | flag |
| ea916059-e97... | founder_edit | phone_intl | `51.20.152.89` | medium | flag |
| ea916059-e97... | founder_edit | phone_intl | `13.53.106.59` | medium | flag |
| ea916059-e97... | founder_edit | phone_intl | `18.192.189.254` | medium | flag |
| f53a1702-c46... | llm_output | project_names | `panoptic` | medium | flag |
| f53a1702-c46... | founder_edit | project_names | `panoptic` | medium | flag |
| fcee073e-236... | founder_edit | project_names | `sneakypiper` | medium | flag |

## Recommendations

- **14 high-severity findings** require redaction before crowd deployment.
- Review each high-severity match manually to confirm it's genuine PII (not a false positive).
- Medium-severity items should be reviewed but may be acceptable in context.
- Low-severity items are informational only.
