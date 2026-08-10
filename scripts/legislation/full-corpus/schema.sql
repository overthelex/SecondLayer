-- Working schema for the full Ukrainian legislation corpus with editions.
-- Isolated DB `rada_npa` on prod postgres (127.0.0.1:5438). Idempotent.

-- Stage 0: master card list (293K acts) from Rada open-data doc.txt
CREATE TABLE IF NOT EXISTS rada_docs_master (
  dokid       bigint,
  nreg        text PRIMARY KEY,          -- system number = "rada_id" (e.g. 2341-14, 254к/96-ВР)
  nazva       text,
  status      smallint,                  -- ref stan.txt (5=Чинний, 1=Втратив чинність, ...)
  types_raw   text,                      -- raw types field, may be composite "2|125"
  imported_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rada_docs_status ON rada_docs_master(status);

-- Reference dictionaries (podia/stan/typ)
CREATE TABLE IF NOT EXISTS rada_dict (
  kind text,   -- 'podia' | 'stan' | 'typ'
  id   integer,
  name text,
  PRIMARY KEY (kind, id)
);

-- Stage 1: flat history events (663K) from doc-dates.txt
CREATE TABLE IF NOT EXISTS rada_events (
  nreg     text,
  poddat   text,       -- YYYYMMDD
  podid    smallint,   -- ref podia.txt
  pidstava text
);
CREATE INDEX IF NOT EXISTS idx_rada_events_nreg ON rada_events(nreg);

-- Stage 1 output: derived edition list (~407K) = adoption(4) + edition(0)/new-edition(6)
CREATE TABLE IF NOT EXISTS rada_editions (
  nreg       text,
  ed_date    text,       -- YYYYMMDD
  podid      smallint,
  is_current boolean DEFAULT false,
  PRIMARY KEY (nreg, ed_date)
);

-- Stage 2 output: fetched full text per edition
CREATE TABLE IF NOT EXISTS rada_edition_texts (
  nreg        text,
  ed_date     text,
  http_status int,
  char_len    int,
  text_hash   text,        -- md5(clean_text) for dedup of byte-identical editions
  clean_text  text,
  fetched_at  timestamptz DEFAULT now(),
  PRIMARY KEY (nreg, ed_date)
);
CREATE INDEX IF NOT EXISTS idx_rada_texts_hash ON rada_edition_texts(nreg, text_hash);
