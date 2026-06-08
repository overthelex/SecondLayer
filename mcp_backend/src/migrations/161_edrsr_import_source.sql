-- Add EDRSR current year as csv_zip source in import catalog
INSERT INTO import_source_catalog (name, title, source_type, source_url, source_config, target_table, upsert_sql, default_threads_per_ip, rate_limit_ms)
VALUES (
  'edrsr_current_year',
  'ЄДРСР — Судові рішення (поточний рік)',
  'csv_zip',
  'https://data.gov.ua/dataset/16ab7f06-7414-405f-8354-0a492475272d/resource/b1a4ac1c-b17a-4988-8e6d-dedae8b2dd63/download/edrsr_data_2026.zip',
  '{
    "csv_file": "documents.csv",
    "delimiter": "\t",
    "skip_header": true,
    "unique_column": "doc_id",
    "columns": ["doc_id", "court_code", "judgment_code", "justice_kind", "category_code", "cause_num", "adjudication_date", "receipt_date", "judge", "doc_url", "status", "date_publ"],
    "year_urls": {
      "2024": "https://data.gov.ua/dataset/1a6b5c08-0879-4387-8878-ac0027494274/resource/d3427d17-3fe4-4675-9a09-5274cd3476dc/download/edrsr_data_2024.zip",
      "2025": "https://data.gov.ua/dataset/2a95ae17-ed46-42ae-ad66-dd9b7a727bb7/resource/9f19ad2b-000f-4176-b283-95e399ad8e5e/download/edrsr_data_2025.zip",
      "2026": "https://data.gov.ua/dataset/16ab7f06-7414-405f-8354-0a492475272d/resource/b1a4ac1c-b17a-4988-8e6d-dedae8b2dd63/download/edrsr_data_2026.zip"
    }
  }'::jsonb,
  'edrsr_documents',
  NULL,
  1,
  0
)
ON CONFLICT (name) DO UPDATE SET
  title = EXCLUDED.title,
  source_url = EXCLUDED.source_url,
  source_config = EXCLUDED.source_config;
