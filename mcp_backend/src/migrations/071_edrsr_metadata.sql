-- ЄДРСР (Єдиний державний реєстр судових рішень) metadata tables
-- Source: https://data.gov.ua/dataset/2a95ae17-ed46-42ae-ad66-dd9b7a727bb7
-- Daily dumps of Ukrainian court decisions registry

-- Reference: court instances (Касаційна, Апеляційна, Перша)
CREATE TABLE IF NOT EXISTS edrsr_instances (
  instance_code SMALLINT PRIMARY KEY,
  name TEXT NOT NULL
);

-- Reference: regions (oblasts)
CREATE TABLE IF NOT EXISTS edrsr_regions (
  region_code SMALLINT PRIMARY KEY,
  name TEXT NOT NULL
);

-- Reference: courts
CREATE TABLE IF NOT EXISTS edrsr_courts (
  court_code INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  instance_code SMALLINT REFERENCES edrsr_instances(instance_code),
  region_code SMALLINT REFERENCES edrsr_regions(region_code)
);

CREATE INDEX IF NOT EXISTS idx_edrsr_courts_instance ON edrsr_courts(instance_code);
CREATE INDEX IF NOT EXISTS idx_edrsr_courts_region ON edrsr_courts(region_code);

-- Reference: justice kinds (Цивільне, Кримінальне, Господарське, Адміністративне, Адмінправопорушення)
CREATE TABLE IF NOT EXISTS edrsr_justice_kinds (
  justice_kind SMALLINT PRIMARY KEY,
  name TEXT NOT NULL
);

-- Reference: judgment forms (Вирок, Постанова, Рішення, Ухвала, etc.)
CREATE TABLE IF NOT EXISTS edrsr_judgment_forms (
  judgment_code SMALLINT PRIMARY KEY,
  name TEXT NOT NULL
);

-- Reference: cause categories (4106 categories)
CREATE TABLE IF NOT EXISTS edrsr_cause_categories (
  category_code INTEGER PRIMARY KEY,
  name TEXT NOT NULL
);

-- Main table: court decision metadata (~8.8M rows per year)
-- No FK constraints: source data contains codes not present in reference tables
CREATE TABLE IF NOT EXISTS edrsr_documents (
  doc_id BIGINT PRIMARY KEY,
  court_code INTEGER,
  judgment_code SMALLINT,
  justice_kind SMALLINT,
  category_code INTEGER,
  cause_num TEXT,
  adjudication_date TIMESTAMPTZ,
  receipt_date TIMESTAMPTZ,
  judge TEXT,
  doc_url TEXT,
  status SMALLINT DEFAULT 0,
  date_publ TIMESTAMPTZ
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_edrsr_docs_court ON edrsr_documents(court_code);
CREATE INDEX IF NOT EXISTS idx_edrsr_docs_justice ON edrsr_documents(justice_kind);
CREATE INDEX IF NOT EXISTS idx_edrsr_docs_judgment ON edrsr_documents(judgment_code);
CREATE INDEX IF NOT EXISTS idx_edrsr_docs_category ON edrsr_documents(category_code);
CREATE INDEX IF NOT EXISTS idx_edrsr_docs_cause_num ON edrsr_documents(cause_num);
CREATE INDEX IF NOT EXISTS idx_edrsr_docs_judge ON edrsr_documents(judge);
CREATE INDEX IF NOT EXISTS idx_edrsr_docs_adjudication ON edrsr_documents(adjudication_date);
CREATE INDEX IF NOT EXISTS idx_edrsr_docs_receipt ON edrsr_documents(receipt_date);
CREATE INDEX IF NOT EXISTS idx_edrsr_docs_status ON edrsr_documents(status);
