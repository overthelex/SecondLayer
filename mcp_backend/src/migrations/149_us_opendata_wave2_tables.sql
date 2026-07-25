-- US Open Data Wave 2: SBA PPP, OpenSanctions (populate), IRS SOI, LDA Lobbying, FEC Candidates

-- SBA PPP Loans (Paycheck Protection Program)
CREATE TABLE IF NOT EXISTS us_sba_ppp_loans (
    loan_number TEXT PRIMARY KEY,
    date_approved DATE,
    sba_office_code TEXT,
    processing_method TEXT,
    borrower_name TEXT,
    borrower_address TEXT,
    borrower_city TEXT,
    borrower_state TEXT,
    borrower_zip TEXT,
    loan_status TEXT,
    loan_status_date DATE,
    term INTEGER,
    sba_guarantee_pct NUMERIC,
    initial_approval_amount NUMERIC,
    current_approval_amount NUMERIC,
    undisbursed_amount NUMERIC,
    forgiveness_amount NUMERIC,
    forgiveness_date DATE,
    lender TEXT,
    servicing_lender_name TEXT,
    naics_code TEXT,
    business_type TEXT,
    race TEXT,
    ethnicity TEXT,
    gender TEXT,
    veteran TEXT,
    non_profit TEXT,
    jobs_reported INTEGER,
    cd TEXT,
    imported_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_us_sba_ppp_borrower_fts ON us_sba_ppp_loans USING gin(to_tsvector('simple', borrower_name));
CREATE INDEX IF NOT EXISTS idx_us_sba_ppp_state ON us_sba_ppp_loans(borrower_state);
CREATE INDEX IF NOT EXISTS idx_us_sba_ppp_naics ON us_sba_ppp_loans(naics_code);
CREATE INDEX IF NOT EXISTS idx_us_sba_ppp_lender_fts ON us_sba_ppp_loans USING gin(to_tsvector('simple', lender));
CREATE INDEX IF NOT EXISTS idx_us_sba_ppp_amount ON us_sba_ppp_loans(current_approval_amount);
CREATE INDEX IF NOT EXISTS idx_us_sba_ppp_forgiveness ON us_sba_ppp_loans(forgiveness_amount) WHERE forgiveness_amount IS NOT NULL;

-- IRS SOI ZIP-level Income Data
CREATE TABLE IF NOT EXISTS us_irs_soi_zip_income (
    id SERIAL PRIMARY KEY,
    state_fips TEXT,
    state TEXT,
    zip_code TEXT,
    agi_stub SMALLINT,
    num_returns INTEGER,
    num_single INTEGER,
    num_joint INTEGER,
    num_head_household INTEGER,
    num_exemptions INTEGER,
    agi_amount BIGINT,
    wages_amount BIGINT,
    dividend_amount BIGINT,
    interest_amount BIGINT,
    business_income BIGINT,
    capital_gains BIGINT,
    ira_distributions BIGINT,
    pensions_annuities BIGINT,
    social_security BIGINT,
    unemployment_comp BIGINT,
    total_income_amount BIGINT,
    taxable_income_amount BIGINT,
    tax_year SMALLINT,
    imported_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(zip_code, agi_stub, tax_year)
);
CREATE INDEX IF NOT EXISTS idx_us_irs_soi_zip ON us_irs_soi_zip_income(zip_code);
CREATE INDEX IF NOT EXISTS idx_us_irs_soi_state ON us_irs_soi_zip_income(state);
CREATE INDEX IF NOT EXISTS idx_us_irs_soi_year ON us_irs_soi_zip_income(tax_year);

-- LDA Lobbying Filings
CREATE TABLE IF NOT EXISTS us_lda_lobbying (
    filing_uuid TEXT PRIMARY KEY,
    filing_type TEXT,
    filing_type_display TEXT,
    filing_year INTEGER,
    filing_period TEXT,
    filing_period_display TEXT,
    filing_document_url TEXT,
    income NUMERIC,
    expenses NUMERIC,
    registrant_name TEXT,
    registrant_id TEXT,
    registrant_address TEXT,
    registrant_country TEXT,
    client_name TEXT,
    client_id TEXT,
    client_country TEXT,
    client_state TEXT,
    lobbying_activities JSONB DEFAULT '[]',
    lobbyists JSONB DEFAULT '[]',
    foreign_entities JSONB DEFAULT '[]',
    dt_posted TIMESTAMPTZ,
    imported_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_us_lda_registrant_fts ON us_lda_lobbying USING gin(to_tsvector('simple', registrant_name));
CREATE INDEX IF NOT EXISTS idx_us_lda_client_fts ON us_lda_lobbying USING gin(to_tsvector('simple', client_name));
CREATE INDEX IF NOT EXISTS idx_us_lda_year ON us_lda_lobbying(filing_year);
CREATE INDEX IF NOT EXISTS idx_us_lda_income ON us_lda_lobbying(income) WHERE income IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_us_lda_type ON us_lda_lobbying(filing_type);

-- FEC Candidates
CREATE TABLE IF NOT EXISTS us_fec_candidates (
    candidate_id TEXT PRIMARY KEY,
    candidate_name TEXT NOT NULL,
    party TEXT,
    election_year INTEGER,
    office_state TEXT,
    office TEXT,
    office_district TEXT,
    incumbent_challenger TEXT,
    candidate_status TEXT,
    principal_committee_id TEXT,
    street_1 TEXT,
    street_2 TEXT,
    city TEXT,
    state TEXT,
    zip TEXT,
    imported_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_us_fec_cand_name_fts ON us_fec_candidates USING gin(to_tsvector('simple', candidate_name));
CREATE INDEX IF NOT EXISTS idx_us_fec_cand_party ON us_fec_candidates(party);
CREATE INDEX IF NOT EXISTS idx_us_fec_cand_state ON us_fec_candidates(office_state);
CREATE INDEX IF NOT EXISTS idx_us_fec_cand_year ON us_fec_candidates(election_year);

-- HMDA Mortgage Loans (subset of key fields)
CREATE TABLE IF NOT EXISTS us_hmda_loans (
    id BIGSERIAL PRIMARY KEY,
    activity_year SMALLINT,
    lei TEXT,
    loan_type SMALLINT,
    loan_purpose SMALLINT,
    lien_status SMALLINT,
    loan_amount NUMERIC,
    action_taken SMALLINT,
    state_code TEXT,
    county_code TEXT,
    census_tract TEXT,
    applicant_ethnicity TEXT,
    applicant_race TEXT,
    applicant_sex SMALLINT,
    applicant_age TEXT,
    income NUMERIC,
    purchaser_type SMALLINT,
    rate_spread NUMERIC,
    property_value NUMERIC,
    loan_term TEXT,
    denial_reason TEXT,
    debt_to_income_ratio TEXT,
    loan_to_value_ratio TEXT,
    interest_rate NUMERIC,
    imported_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_us_hmda_state ON us_hmda_loans(state_code);
CREATE INDEX IF NOT EXISTS idx_us_hmda_year ON us_hmda_loans(activity_year);
CREATE INDEX IF NOT EXISTS idx_us_hmda_action ON us_hmda_loans(action_taken);
CREATE INDEX IF NOT EXISTS idx_us_hmda_lei ON us_hmda_loans(lei);
CREATE INDEX IF NOT EXISTS idx_us_hmda_tract ON us_hmda_loans(census_tract);

-- Register new sources in import_source_catalog
INSERT INTO import_source_catalog (name, title, source_type, source_url, target_table, rate_limit_ms, enabled)
VALUES
    ('us_sba_ppp', 'SBA — PPP Loans (Paycheck Protection Program)', 'file_download', 'https://data.sba.gov/dataset/8aa276e2-6cab-4f86-aca4-a7dde42adf24/resource/c1275a03-c25c-488a-bd95-4/download/public_150k_plus_240930.csv', 'us_sba_ppp_loans', 0, true),
    ('us_irs_soi_zip', 'IRS — Statistics of Income by ZIP Code', 'file_download', 'https://www.irs.gov/pub/irs-soi/21zpallagi.csv', 'us_irs_soi_zip_income', 0, true),
    ('us_lda_lobbying', 'LDA — Senate Lobbying Disclosures', 'api_paginated', 'https://lda.senate.gov/api/v1/filings/', 'us_lda_lobbying', 500, true),
    ('us_fec_candidates', 'FEC — Candidate Master File', 'file_download', 'https://www.fec.gov/files/bulk-downloads/2024/cn24.zip', 'us_fec_candidates', 0, true),
    ('us_hmda_loans', 'HMDA — Home Mortgage Disclosure Act Data', 'file_download', 'https://ffiec.cfpb.gov/v2/data-browser-api/view/csv?years=2023', 'us_hmda_loans', 0, true),
    ('us_opensanctions', 'OpenSanctions — Global Sanctions/PEP Database', 'file_download', 'https://data.opensanctions.org/datasets/latest/default/entities.ftm.json', 'opensanctions_entities', 0, true)
ON CONFLICT (name) DO UPDATE SET
    source_url = EXCLUDED.source_url,
    title = EXCLUDED.title,
    enabled = EXCLUDED.enabled;
