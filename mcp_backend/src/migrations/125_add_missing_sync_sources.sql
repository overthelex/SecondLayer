-- Migration 125: Add import catalog entries for datasets that exist on prod
-- but don't have automatic sync configured yet.
-- Sources: data.gov.ua JSON APIs, XLSX/CSV downloads

-- ═══ Daily JSON API sources ═══

-- Недійсні паспорти (щоденне оновлення на data.gov.ua)
INSERT INTO import_source_catalog (name, title, source_type, source_url, source_config, target_table, rate_limit_ms)
VALUES ('invalid_passports', 'МВС — Недійсні паспорти', 'json_array',
  'https://data.gov.ua/dataset/ab09ed00-4f51-4f6c-a2f7-1b2fb118be0f/resource/74681fa4-ca64-4127-8e7f-53e8f27003eb/download/',
  '{"format": "json"}', 'opendata_invalid_passports', 0)
ON CONFLICT (name) DO NOTHING;

-- Недійсні закордонні паспорти
INSERT INTO import_source_catalog (name, title, source_type, source_url, source_config, target_table, rate_limit_ms)
VALUES ('invalid_passports_foreign', 'МВС — Недійсні закордонні паспорти', 'json_array',
  'https://data.gov.ua/dataset/b465b821-db5d-4b8b-8131-12682fab2203/resource/bc236a5c-5765-4856-94d5-efba65929e83/download/',
  '{"format": "json"}', 'opendata_invalid_passports_foreign', 0)
ON CONFLICT (name) DO NOTHING;

-- ДСФМУ — Перелік терористів (рідко оновлюється, але треба перевіряти)
INSERT INTO import_source_catalog (name, title, source_type, source_url, source_config, target_table, rate_limit_ms)
VALUES ('dsfmu_terrorism', 'ДСФМУ — Перелік терористів', 'json_array',
  'https://data.gov.ua/dataset/a140de93-d9e1-47ca-b29a-29c7fdc4c3a5/resource/159e6cdf-7f3e-4637-86ea-4f50e4dd0e3b/download/',
  '{"format": "json"}', 'opendata_terrorism_persons', 0)
ON CONFLICT (name) DO NOTHING;

-- Реєстр люстрованих осіб
INSERT INTO import_source_catalog (name, title, source_type, source_url, source_config, target_table, rate_limit_ms)
VALUES ('lustration', 'Мін''юст — Реєстр люстрованих', 'json_array',
  'https://data.gov.ua/dataset/8faa71c1-3a54-45e8-8f6e-06c92b1ff8bc/resource/e9ef4571-1574-4b38-bb5c-0b4747d308be/download/',
  '{"format": "json"}', 'opendata_lustration', 0)
ON CONFLICT (name) DO NOTHING;

-- Держдопомога АМКУ
INSERT INTO import_source_catalog (name, title, source_type, source_url, source_config, target_table, rate_limit_ms)
VALUES ('state_aid', 'АМКУ — Реєстр держдопомоги', 'json_array',
  'https://data.gov.ua/dataset/16fcf128-1a28-41d5-8081-3dfffe68b397/resource/91bb54fa-dbce-4248-97e6-8ab85af81bc7/download/',
  '{"format": "json"}', 'opendata_state_aid', 0)
ON CONFLICT (name) DO NOTHING;

-- НАЗК — Перевірки декларацій
INSERT INTO import_source_catalog (name, title, source_type, source_url, source_config, target_table, rate_limit_ms)
VALUES ('nazk_declaration_checks', 'НАЗК — Перевірки декларацій', 'json_array',
  'https://data.gov.ua/dataset/e2c9de23-8c02-4465-b4bf-d68fc7a28a0c/resource/aeec4bfb-32f0-4ad5-adbd-b4d403e62267/download/',
  '{"format": "json"}', 'opendata_declaration_checks', 0)
ON CONFLICT (name) DO NOTHING;

-- НАЗК — Корупційні правопорушники
INSERT INTO import_source_catalog (name, title, source_type, source_url, source_config, target_table, rate_limit_ms)
VALUES ('nazk_corruption_offenders', 'НАЗК — Корупційні правопорушники', 'json_array',
  'https://data.gov.ua/dataset/1fba0e89-3a34-4a1b-b3e3-dbb78cdfbb20/resource/a44de7e5-a9b5-4dfa-801d-1e4db2fd0e1a/download/',
  '{"format": "json"}', 'opendata_corruption_offenders', 0)
ON CONFLICT (name) DO NOTHING;

-- Мін'юст — Адвокати (ЄРАУ)
INSERT INTO import_source_catalog (name, title, source_type, source_url, source_config, target_table, rate_limit_ms)
VALUES ('advocates', 'Мін''юст — Реєстр адвокатів (ЄРАУ)', 'json_array',
  'https://data.gov.ua/dataset/2cfac59e-f849-406c-a826-02de0afe4602/resource/cb39caea-14fa-4f42-a9ff-5bda3d5ce94f/download/',
  '{"format": "json"}', 'opendata_advocates', 0)
ON CONFLICT (name) DO NOTHING;

-- ═══ Weekly/monthly large dataset sources ═══

-- Стан справ у судах (court.gov.ua)
INSERT INTO import_source_catalog (name, title, source_type, source_url, source_config, target_table, rate_limit_ms)
VALUES ('court_case_status', 'Судова влада — Стан розгляду справ', 'json_array',
  'https://data.gov.ua/dataset/af2a2498-60a2-4c6d-a436-b0e0e052abec/resource/4e5c1e2d-a553-41ac-ae5c-e6ad5e6b13c8/download/',
  '{"format": "json"}', 'opendata_court_case_status', 0)
ON CONFLICT (name) DO NOTHING;

-- Розклад засідань
INSERT INTO import_source_catalog (name, title, source_type, source_url, source_config, target_table, rate_limit_ms)
VALUES ('court_schedule', 'Судова влада — Розклад засідань', 'json_array',
  'https://data.gov.ua/dataset/710bab18-d34f-4a49-92e3-86c4624a7e70/resource/9d2afb46-67dd-4e56-8cd6-adee289aa66e/download/',
  '{"format": "json"}', 'opendata_court_schedule', 0)
ON CONFLICT (name) DO NOTHING;

-- ДПС — Великі платники податків
INSERT INTO import_source_catalog (name, title, source_type, source_url, source_config, target_table, rate_limit_ms)
VALUES ('large_taxpayers', 'ДПС — Великі платники податків', 'json_array',
  'https://data.gov.ua/dataset/bcb85244-91fc-4b80-926f-b1fce0bfbb54/resource/b979cbac-c015-4073-b9db-fe11e3b5c7b2/download/',
  '{"format": "json"}', 'opendata_large_taxpayers', 0)
ON CONFLICT (name) DO NOTHING;

-- ДПС — Боржники по зарплаті
INSERT INTO import_source_catalog (name, title, source_type, source_url, source_config, target_table, rate_limit_ms)
VALUES ('wage_debtors', 'Держпраці — Боржники по зарплаті', 'json_array',
  'https://data.gov.ua/dataset/38a06a08-4e5c-4e7b-9e71-c3a5b0b6d02d/resource/0c3ce3a1-67d2-41a4-8e90-eee6fa96ca81/download/',
  '{"format": "json"}', 'opendata_wage_debtors', 0)
ON CONFLICT (name) DO NOTHING;

-- ВККС — Кандидати на посади суддів
INSERT INTO import_source_catalog (name, title, source_type, source_url, source_config, target_table, rate_limit_ms)
VALUES ('judge_candidates', 'ВККС — Кандидати на посади суддів', 'json_array',
  'https://data.gov.ua/dataset/77c21a3f-12e7-47c7-8e4b-a8e4d1ea26ab/resource/88ef2d14-c4ff-44a6-b07f-afe2a5f33b0c/download/',
  '{"format": "json"}', 'opendata_judge_candidates', 0)
ON CONFLICT (name) DO NOTHING;
