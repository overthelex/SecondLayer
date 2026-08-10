-- Full НПА corpus: 293k acts / 407k editions / 338k texts.
-- Lives in its own schema so the live legislation* tables in public are untouched until cutover.
--
-- No secondary indexes here on purpose: they are built after the bulk load, because maintaining
-- them through the insert is far slower than one CREATE INDEX at the end.

CREATE SCHEMA IF NOT EXISTS npa;

CREATE TABLE IF NOT EXISTS npa.act (
  nreg          text PRIMARY KEY,
  dok_id        bigint,
  title         text,
  status_code   smallint,
  types_raw     text,
  editions_cnt  int  NOT NULL DEFAULT 0,
  texts_cnt     int  NOT NULL DEFAULT 0,
  has_articles  bool NOT NULL DEFAULT false,
  first_ed      date,
  last_ed       date
);

-- http_status carries our own verdicts above the HTTP range, so a broken document is excluded
-- from search and from completeness metrics by the same filter that excludes a 404:
--   200 ok · 404 gone · 900 empty body · 901 error page served as 200
CREATE TABLE IF NOT EXISTS npa.edition (
  nreg          text NOT NULL,
  ed_date       date NOT NULL,
  podid         smallint,
  is_current    bool NOT NULL DEFAULT false,
  http_status   smallint NOT NULL,
  char_len      int,
  text_hash     text,
  source        text,
  declared_date date,
  date_verified bool GENERATED ALWAYS AS
                (declared_date IS NOT NULL AND declared_date = ed_date) STORED,
  PRIMARY KEY (nreg, ed_date)
);

CREATE TABLE IF NOT EXISTS npa.edition_text (
  nreg       text NOT NULL,
  ed_date    date NOT NULL,
  is_current bool NOT NULL DEFAULT false,   -- denormalised: the FTS partial index needs it local
  body       text NOT NULL,
  PRIMARY KEY (nreg, ed_date)
);

CREATE TABLE IF NOT EXISTS npa.article (
  nreg     text NOT NULL,
  ed_date  date NOT NULL,
  art_no   text NOT NULL,
  art_ord  int  NOT NULL,
  title    text,
  body     text NOT NULL,
  PRIMARY KEY (nreg, ed_date, art_no)
);
