-- Import Task Manager: catalog of data sources + running tasks
-- Manages multi-IP concurrent downloads from data.gov.ua and other APIs

-- Predefined data sources catalog
CREATE TABLE IF NOT EXISTS import_source_catalog (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('api_paginated', 'file_download', 'json_array')),
  source_url TEXT NOT NULL,
  source_config JSONB DEFAULT '{}',
  target_table TEXT NOT NULL,
  upsert_sql TEXT,
  default_threads_per_ip INT DEFAULT 5,
  rate_limit_ms INT DEFAULT 1100,
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Running/completed import tasks
CREATE TABLE IF NOT EXISTS import_tasks (
  id SERIAL PRIMARY KEY,
  source_id INT REFERENCES import_source_catalog(id),
  source_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','paused','completed','failed','cancelled')),
  ip_addresses TEXT[] NOT NULL DEFAULT '{}',
  threads_per_ip INT NOT NULL DEFAULT 5,

  total_items INT,
  total_pages INT,
  pages_done INT DEFAULT 0,
  records_imported INT DEFAULT 0,
  records_failed INT DEFAULT 0,
  current_page INT DEFAULT 0,

  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  last_activity_at TIMESTAMPTZ,
  elapsed_ms BIGINT DEFAULT 0,

  from_page INT DEFAULT 1,
  config_overrides JSONB DEFAULT '{}',

  last_error TEXT,
  error_log JSONB DEFAULT '[]',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_import_tasks_status ON import_tasks(status);
CREATE INDEX IF NOT EXISTS idx_import_tasks_source ON import_tasks(source_name);

-- Seed catalog with known sources
INSERT INTO import_source_catalog (name, title, source_type, source_url, source_config, target_table, rate_limit_ms) VALUES
  ('nipo_trademarks', 'УІПВ — Торгові марки', 'api_paginated',
   'https://sis.nipo.gov.ua/api/v1/open-data/', '{"obj_type": 4, "obj_state": 2, "results_key": "results", "count_key": "count", "page_param": "page"}',
   'opendata_trademarks', 1100),
  ('nipo_patents', 'УІПВ — Патенти на винаходи', 'api_paginated',
   'https://sis.nipo.gov.ua/api/v1/open-data/', '{"obj_type": 1, "obj_state": 2, "results_key": "results", "count_key": "count", "page_param": "page"}',
   'opendata_patents', 1100),
  ('nipo_utility_models', 'УІПВ — Корисні моделі', 'api_paginated',
   'https://sis.nipo.gov.ua/api/v1/open-data/', '{"obj_type": 2, "obj_state": 2, "results_key": "results", "count_key": "count", "page_param": "page"}',
   'opendata_patents', 1100),
  ('nipo_designs', 'УІПВ — Промислові зразки', 'api_paginated',
   'https://sis.nipo.gov.ua/api/v1/open-data/', '{"obj_type": 6, "obj_state": 2, "results_key": "results", "count_key": "count", "page_param": "page"}',
   'opendata_patents', 1100),
  ('mvs_wanted_persons', 'МВС — Особи в розшуку', 'json_array',
   'https://data.gov.ua/dataset/7c51c4a0-104b-4540-a166-e9fc58485c1b/resource/74af7e8b-884b-4ed3-b7b0-2f36e5c1260d/download/',
   '{"format": "json"}', 'opendata_wanted_persons', 0),
  ('mvs_missing_persons', 'МВС — Безвісно зниклі', 'json_array',
   'https://data.gov.ua/dataset/470196d3-4e7a-46b0-8c0c-883b74ac65f0/resource/09761543-25ea-4567-8e41-81ad78363796/download/',
   '{"format": "json"}', 'opendata_missing_persons', 0),
  ('mvs_wanted_vehicles', 'МВС — Транспорт у розшуку', 'json_array',
   'https://data.gov.ua/dataset/2a746426-b289-4eb2-be8f-aac03e68948c/resource/26fb49da-e312-4e43-af1c-651f0e3fac0d/download/',
   '{"format": "json"}', 'opendata_wanted_vehicles', 0),
  ('nazk_corruption', 'НАЗК — Корупціонери', 'json_array',
   'https://data.gov.ua/dataset/c29e704a-b745-4669-97cd-3a345f437ad1/resource/7e14a94f-3551-4ebe-85e2-6cfe74d84ebe/download/',
   '{"format": "json"}', 'opendata_corruption_register', 0),
  ('nais_notaries', 'НАІС — Нотаріуси', 'file_download',
   'https://data.gov.ua/dataset/85a68e3e-8cb0-41b8-a764-58d005063b52/resource/65e9ad78-0e65-4672-ba42-f7613e0fa493/download/17-ex_xml_wern.zip',
   '{"format": "xml", "encoding": "windows-1251", "record_path": "DATA.RECORD"}', 'notaries', 0),
  ('nais_court_experts', 'НАІС — Судові експерти', 'file_download',
   'https://data.gov.ua/dataset/f615eb1d-cda0-411e-800b-efb61fb9fb46/resource/c89d0270-c87a-4781-a96b-41def560c6fc/download/18-ex_xml_expert.zip',
   '{"format": "xml", "encoding": "windows-1251", "record_path": "DATA.RECORD"}', 'court_experts', 0),
  ('nais_arbitration_managers', 'НАІС — Арбітражні керуючі', 'file_download',
   'https://data.gov.ua/dataset/d7cca6b1-863c-4c7d-a90b-6d024a68a4f7/resource/60439f25-5162-4e7a-b59d-cf9224346159/download/25-ex_xml_arbker.zip',
   '{"format": "xml", "encoding": "windows-1251", "record_path": "DATA.RECORD"}', 'arbitration_managers', 0),
  ('nais_enforcement', 'НАІС — Виконавчі провадження (АСВП)', 'file_download',
   'https://data.gov.ua/dataset/22aef563-3e87-4ed9-92e8-d764dc02f426/resource/d1a38c08-0f3a-4687-866f-f28f50df7c46/download/28-ex_csv_asvp.zip',
   '{"format": "csv", "encoding": "windows-1251"}', 'enforcement_proceedings', 0),
  ('nais_debtors', 'НАІС — Єдиний реєстр боржників', 'file_download',
   'https://data.gov.ua/dataset/783b9b50-faba-4cc9-a393-60485e395b1d/resource/e6ea76c1-01f4-4bd0-a282-7d92d6ecc2a1/download/29-ex_csv_erb.zip',
   '{"format": "csv", "encoding": "windows-1251"}', 'debtors', 0)
ON CONFLICT (name) DO NOTHING;
