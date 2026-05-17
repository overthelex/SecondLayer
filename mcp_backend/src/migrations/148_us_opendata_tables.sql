-- US Open Data tables for federal sources import
-- Sources: OFAC, SAM.gov, FEC, FARA, CFPB, OSHA, NHTSA, FDA, EPA

-- OFAC Specially Designated Nationals
CREATE TABLE IF NOT EXISTS us_ofac_sanctions (
    uid TEXT PRIMARY KEY,
    entry_type TEXT NOT NULL,
    sdn_name TEXT NOT NULL,
    sdn_type TEXT,
    program TEXT,
    title TEXT,
    remarks TEXT,
    call_sign TEXT,
    vessel_type TEXT,
    tonnage TEXT,
    grt TEXT,
    vessel_flag TEXT,
    vessel_owner TEXT,
    addresses JSONB DEFAULT '[]',
    aliases JSONB DEFAULT '[]',
    ids JSONB DEFAULT '[]',
    imported_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_us_ofac_name_fts ON us_ofac_sanctions USING gin(to_tsvector('simple', sdn_name));
CREATE INDEX IF NOT EXISTS idx_us_ofac_program ON us_ofac_sanctions(program);
CREATE INDEX IF NOT EXISTS idx_us_ofac_type ON us_ofac_sanctions(sdn_type);

-- SAM.gov Exclusions (debarment)
CREATE TABLE IF NOT EXISTS us_sam_exclusions (
    sam_number TEXT PRIMARY KEY,
    uei TEXT,
    cage_code TEXT,
    name TEXT NOT NULL,
    prefix TEXT,
    first_name TEXT,
    middle_name TEXT,
    last_name TEXT,
    suffix TEXT,
    entity_type TEXT,
    address_1 TEXT,
    address_2 TEXT,
    city TEXT,
    state_province TEXT,
    country TEXT,
    zip_code TEXT,
    duns TEXT,
    exclusion_type TEXT,
    exclusion_program TEXT,
    excluding_agency TEXT,
    ct_code TEXT,
    active_date DATE,
    termination_date DATE,
    record_status TEXT,
    cross_reference JSONB DEFAULT '[]',
    imported_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_us_sam_name_fts ON us_sam_exclusions USING gin(to_tsvector('simple', name));
CREATE INDEX IF NOT EXISTS idx_us_sam_excl_type ON us_sam_exclusions(exclusion_type);
CREATE INDEX IF NOT EXISTS idx_us_sam_agency ON us_sam_exclusions(excluding_agency);

-- FEC Committees
CREATE TABLE IF NOT EXISTS us_fec_committees (
    committee_id TEXT PRIMARY KEY,
    committee_name TEXT NOT NULL,
    treasurer_name TEXT,
    street_1 TEXT,
    street_2 TEXT,
    city TEXT,
    state TEXT,
    zip TEXT,
    committee_designation TEXT,
    committee_type TEXT,
    party TEXT,
    filing_frequency TEXT,
    interest_group_category TEXT,
    connected_org_name TEXT,
    candidate_id TEXT,
    imported_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_us_fec_comm_name_fts ON us_fec_committees USING gin(to_tsvector('simple', committee_name));
CREATE INDEX IF NOT EXISTS idx_us_fec_comm_party ON us_fec_committees(party);
CREATE INDEX IF NOT EXISTS idx_us_fec_comm_type ON us_fec_committees(committee_type);

-- FEC Individual Contributions (current cycle)
CREATE TABLE IF NOT EXISTS us_fec_contributions (
    id BIGSERIAL PRIMARY KEY,
    committee_id TEXT,
    amendment_indicator TEXT,
    report_type TEXT,
    transaction_pgi TEXT,
    image_num TEXT,
    transaction_type TEXT,
    entity_type TEXT,
    contributor_name TEXT,
    city TEXT,
    state TEXT,
    zip_code TEXT,
    employer TEXT,
    occupation TEXT,
    transaction_date DATE,
    transaction_amount NUMERIC,
    other_id TEXT,
    tran_id TEXT,
    file_num TEXT,
    memo_cd TEXT,
    memo_text TEXT,
    sub_id BIGINT UNIQUE,
    imported_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_us_fec_contrib_name_fts ON us_fec_contributions USING gin(to_tsvector('simple', contributor_name));
CREATE INDEX IF NOT EXISTS idx_us_fec_contrib_committee ON us_fec_contributions(committee_id);
CREATE INDEX IF NOT EXISTS idx_us_fec_contrib_date ON us_fec_contributions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_us_fec_contrib_amount ON us_fec_contributions(transaction_amount);

-- FARA Foreign Agent Registrations
CREATE TABLE IF NOT EXISTS us_fara_registrants (
    registration_number TEXT PRIMARY KEY,
    registrant_name TEXT NOT NULL,
    address TEXT,
    state TEXT,
    country TEXT,
    registration_date DATE,
    termination_date DATE,
    status TEXT,
    foreign_principals JSONB DEFAULT '[]',
    imported_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_us_fara_name_fts ON us_fara_registrants USING gin(to_tsvector('simple', registrant_name));
CREATE INDEX IF NOT EXISTS idx_us_fara_status ON us_fara_registrants(status);
CREATE INDEX IF NOT EXISTS idx_us_fara_country ON us_fara_registrants(country);

-- CFPB Consumer Complaints
CREATE TABLE IF NOT EXISTS us_cfpb_complaints (
    complaint_id BIGINT PRIMARY KEY,
    date_received DATE,
    product TEXT,
    sub_product TEXT,
    issue TEXT,
    sub_issue TEXT,
    consumer_complaint_narrative TEXT,
    company_public_response TEXT,
    company TEXT,
    state TEXT,
    zip_code TEXT,
    tags TEXT,
    consumer_consent_provided TEXT,
    submitted_via TEXT,
    date_sent_to_company DATE,
    company_response TEXT,
    timely_response TEXT,
    consumer_disputed TEXT,
    imported_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_us_cfpb_company_fts ON us_cfpb_complaints USING gin(to_tsvector('simple', company));
CREATE INDEX IF NOT EXISTS idx_us_cfpb_product ON us_cfpb_complaints(product);
CREATE INDEX IF NOT EXISTS idx_us_cfpb_date ON us_cfpb_complaints(date_received);
CREATE INDEX IF NOT EXISTS idx_us_cfpb_state ON us_cfpb_complaints(state);

-- OSHA Inspections
CREATE TABLE IF NOT EXISTS us_osha_inspections (
    activity_nr BIGINT PRIMARY KEY,
    reporting_id TEXT,
    state_flag TEXT,
    estab_name TEXT,
    site_address TEXT,
    site_city TEXT,
    site_state TEXT,
    site_zip TEXT,
    owner_type TEXT,
    owner_code TEXT,
    adv_notice TEXT,
    safety_hlth TEXT,
    sic_code TEXT,
    naics_code TEXT,
    insp_type TEXT,
    insp_scope TEXT,
    why_no_insp TEXT,
    union_status TEXT,
    safety_manuf TEXT,
    safety_const TEXT,
    safety_marit TEXT,
    health_manuf TEXT,
    health_const TEXT,
    health_marit TEXT,
    migrant TEXT,
    mail_street TEXT,
    mail_city TEXT,
    mail_state TEXT,
    mail_zip TEXT,
    host_est_key TEXT,
    nr_in_estab INTEGER,
    open_date DATE,
    case_mod_date DATE,
    close_conf_date DATE,
    close_case_date DATE,
    open_year INTEGER,
    imported_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_us_osha_estab_fts ON us_osha_inspections USING gin(to_tsvector('simple', estab_name));
CREATE INDEX IF NOT EXISTS idx_us_osha_state ON us_osha_inspections(site_state);
CREATE INDEX IF NOT EXISTS idx_us_osha_naics ON us_osha_inspections(naics_code);
CREATE INDEX IF NOT EXISTS idx_us_osha_open_date ON us_osha_inspections(open_date);

-- NHTSA Vehicle Recalls
CREATE TABLE IF NOT EXISTS us_nhtsa_recalls (
    nhtsa_campaign_number TEXT PRIMARY KEY,
    manufacturer TEXT,
    subject TEXT,
    component TEXT,
    mfr_campaign_number TEXT,
    recall_type TEXT,
    potentially_affected INTEGER,
    report_received_date DATE,
    recall_initiation_date DATE,
    defect_summary TEXT,
    consequence_summary TEXT,
    corrective_summary TEXT,
    park_it TEXT,
    park_outside TEXT,
    do_not_drive TEXT,
    notes TEXT,
    imported_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_us_nhtsa_mfr_fts ON us_nhtsa_recalls USING gin(to_tsvector('simple', manufacturer));
CREATE INDEX IF NOT EXISTS idx_us_nhtsa_subject_fts ON us_nhtsa_recalls USING gin(to_tsvector('simple', subject));
CREATE INDEX IF NOT EXISTS idx_us_nhtsa_date ON us_nhtsa_recalls(report_received_date);

-- FDA Enforcement Actions (recalls)
CREATE TABLE IF NOT EXISTS us_fda_enforcement (
    recall_number TEXT PRIMARY KEY,
    event_id TEXT,
    status TEXT,
    city TEXT,
    state TEXT,
    country TEXT,
    voluntary_mandated TEXT,
    initial_firm_notification TEXT,
    recall_initiation_date DATE,
    center_classification_date DATE,
    termination_date DATE,
    classification TEXT,
    product_type TEXT,
    product_description TEXT,
    reason_for_recall TEXT,
    distribution_pattern TEXT,
    product_quantity TEXT,
    recalling_firm TEXT,
    report_date DATE,
    code_info TEXT,
    imported_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_us_fda_firm_fts ON us_fda_enforcement USING gin(to_tsvector('simple', recalling_firm));
CREATE INDEX IF NOT EXISTS idx_us_fda_product_fts ON us_fda_enforcement USING gin(to_tsvector('simple', product_description));
CREATE INDEX IF NOT EXISTS idx_us_fda_classification ON us_fda_enforcement(classification);
CREATE INDEX IF NOT EXISTS idx_us_fda_date ON us_fda_enforcement(report_date);

-- EPA ECHO Facilities
CREATE TABLE IF NOT EXISTS us_epa_facilities (
    registry_id TEXT PRIMARY KEY,
    fac_name TEXT,
    fac_street TEXT,
    fac_city TEXT,
    fac_state TEXT,
    fac_zip TEXT,
    fac_county TEXT,
    fac_fips_code TEXT,
    fac_epa_region TEXT,
    fac_lat NUMERIC,
    fac_long NUMERIC,
    fac_naics_codes TEXT,
    fac_sic_codes TEXT,
    fac_indian_cntry_flg TEXT,
    fac_federal_flg TEXT,
    fac_active_flag TEXT,
    fac_qtrs_with_nc INTEGER,
    fac_compliance_status TEXT,
    fac_penalty_count INTEGER,
    fac_last_penalty_amt NUMERIC,
    fac_informal_count INTEGER,
    fac_formal_count INTEGER,
    fac_date_last_inspection DATE,
    fac_date_last_formal_act DATE,
    caa_flag TEXT,
    cwa_flag TEXT,
    rcra_flag TEXT,
    sdwa_flag TEXT,
    tri_flag TEXT,
    imported_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_us_epa_name_fts ON us_epa_facilities USING gin(to_tsvector('simple', fac_name));
CREATE INDEX IF NOT EXISTS idx_us_epa_state ON us_epa_facilities(fac_state);
CREATE INDEX IF NOT EXISTS idx_us_epa_compliance ON us_epa_facilities(fac_compliance_status);
CREATE INDEX IF NOT EXISTS idx_us_epa_naics ON us_epa_facilities(fac_naics_codes);

-- Register sources in import_source_catalog
INSERT INTO import_source_catalog (name, title, source_type, source_url, target_table, rate_limit_ms, enabled)
VALUES
    ('us_ofac_sdn', 'OFAC — Specially Designated Nationals (SDN)', 'file_download', 'https://www.treasury.gov/ofac/downloads/sdn_xml.zip', 'us_ofac_sanctions', 0, true),
    ('us_sam_exclusions', 'SAM.gov — Exclusions/Debarment List', 'file_download', 'https://sam.gov/api/prod/fileextract/v1/api/listExclusions', 'us_sam_exclusions', 0, true),
    ('us_fec_committees', 'FEC — Committee Master File', 'file_download', 'https://www.fec.gov/files/bulk-downloads/2024/cm24.zip', 'us_fec_committees', 0, true),
    ('us_fec_contributions', 'FEC — Individual Contributions', 'file_download', 'https://www.fec.gov/files/bulk-downloads/2024/indiv24.zip', 'us_fec_contributions', 0, true),
    ('us_fara_registrants', 'FARA — Foreign Agent Registrations', 'api_paginated', 'https://efile.fara.gov/api/v1/Registrants/json/Active', 'us_fara_registrants', 500, true),
    ('us_cfpb_complaints', 'CFPB — Consumer Complaints', 'file_download', 'https://files.consumerfinance.gov/ccdb/complaints.csv.zip', 'us_cfpb_complaints', 0, true),
    ('us_osha_inspections', 'OSHA — Workplace Inspections', 'file_download', 'https://enforcedata.dol.gov/views/data_summary/osha_inspection.csv.zip', 'us_osha_inspections', 0, true),
    ('us_nhtsa_recalls', 'NHTSA — Vehicle Recalls', 'file_download', 'https://static.nhtsa.gov/odi/ffdd/rcl/FLAT_RCL.zip', 'us_nhtsa_recalls', 0, true),
    ('us_fda_enforcement', 'FDA — Enforcement/Recall Actions', 'api_paginated', 'https://api.fda.gov/drug/enforcement.json', 'us_fda_enforcement', 250, true),
    ('us_epa_facilities', 'EPA ECHO — Regulated Facilities', 'file_download', 'https://echo.epa.gov/files/echodownloads/frs_downloads.zip', 'us_epa_facilities', 0, true)
ON CONFLICT (name) DO UPDATE SET
    source_url = EXCLUDED.source_url,
    title = EXCLUDED.title,
    enabled = EXCLUDED.enabled;
