-- Extract Ukrainian court decisions for LexTreme dataset.
-- Run on prod via: ssh prod "docker exec secondlayer-postgres-prod psql -U secondlayer -d secondlayer_prod -f /tmp/extract-lextreme.sql"
-- Or copy-paste into psql.

-- Step 1: Create a temp table with extracted facts and outcomes
DROP TABLE IF EXISTS lextreme_extract;

CREATE TABLE lextreme_extract AS
WITH decisions AS (
    SELECT
        d.doc_id,
        d.cause_num,
        d.court_code,
        d.justice_kind,
        d.category_code,
        d.adjudication_date::date AS adj_date,
        f.full_text,
        f.text_length
    FROM edrsr_documents d
    JOIN edrsr_fulltext f ON f.doc_id = d.doc_id
    WHERE d.judgment_code = 3           -- Рішення (substantive decisions)
      AND d.justice_kind IN (1, 3)      -- Цивільне (1) або Господарське (3)
      AND f.text_length BETWEEN 500 AND 200000
      AND f.full_text IS NOT NULL
),
with_positions AS (
    SELECT *,
        -- Find facts section start (ВСТАНОВИВ: or УСТАНОВИВ:)
        GREATEST(
            COALESCE(POSITION('ВСТАНОВИВ:' IN full_text), 0),
            COALESCE(POSITION('УСТАНОВИВ:' IN full_text), 0)
        ) AS facts_marker_pos,
        -- Find dispositive section (search from end for last occurrence)
        GREATEST(
            COALESCE(LENGTH(full_text) - LENGTH(REVERSE(full_text)) + 1 -
                NULLIF(POSITION(':ВИШІРОВ' IN REVERSE(full_text)), 0) + 1, 0),
            0
        ) AS disp_reverse_attempt
    FROM decisions
),
with_markers AS (
    SELECT *,
        -- Simple approach: find first ВСТАНОВИВ and first ВИРІШИВ after it
        CASE
            WHEN POSITION('ВСТАНОВИВ:' IN full_text) > 0
                THEN POSITION('ВСТАНОВИВ:' IN full_text) + 10
            WHEN POSITION('УСТАНОВИВ:' IN full_text) > 0
                THEN POSITION('УСТАНОВИВ:' IN full_text) + 10
            ELSE 0
        END AS facts_start,
        CASE
            WHEN POSITION('ВСТАНОВИВ:' IN full_text) > 0 THEN
                COALESCE(
                    NULLIF(POSITION('ВИРІШИВ:' IN SUBSTRING(full_text FROM POSITION('ВСТАНОВИВ:' IN full_text) + 10)), 0),
                    NULLIF(POSITION('УХВАЛИВ:' IN SUBSTRING(full_text FROM POSITION('ВСТАНОВИВ:' IN full_text) + 10)), 0),
                    NULLIF(POSITION('ПОСТАНОВИВ:' IN SUBSTRING(full_text FROM POSITION('ВСТАНОВИВ:' IN full_text) + 10)), 0)
                )
            WHEN POSITION('УСТАНОВИВ:' IN full_text) > 0 THEN
                COALESCE(
                    NULLIF(POSITION('ВИРІШИВ:' IN SUBSTRING(full_text FROM POSITION('УСТАНОВИВ:' IN full_text) + 10)), 0),
                    NULLIF(POSITION('УХВАЛИВ:' IN SUBSTRING(full_text FROM POSITION('УСТАНОВИВ:' IN full_text) + 10)), 0),
                    NULLIF(POSITION('ПОСТАНОВИВ:' IN SUBSTRING(full_text FROM POSITION('УСТАНОВИВ:' IN full_text) + 10)), 0)
                )
            ELSE NULL
        END AS disp_offset
    FROM with_positions
)
SELECT
    doc_id,
    cause_num,
    court_code,
    CASE justice_kind WHEN 1 THEN 'civil' WHEN 3 THEN 'commercial' END AS justice_kind,
    category_code,
    adj_date,
    -- Extract facts: text between ВСТАНОВИВ and ВИРІШИВ
    TRIM(SUBSTRING(full_text FROM facts_start FOR disp_offset)) AS facts_text,
    -- Extract outcome from dispositive section
    CASE
        WHEN LOWER(SUBSTRING(full_text FROM facts_start + disp_offset)) LIKE '%частков%' THEN 'partial'
        WHEN LOWER(SUBSTRING(full_text FROM facts_start + disp_offset)) LIKE '%задовольн%' THEN 'approved'
        WHEN LOWER(SUBSTRING(full_text FROM facts_start + disp_offset)) LIKE '%відмов%' THEN 'dismissed'
        ELSE NULL
    END AS outcome,
    LENGTH(TRIM(SUBSTRING(full_text FROM facts_start FOR disp_offset))) AS facts_length
FROM with_markers
WHERE facts_start > 0
  AND disp_offset IS NOT NULL
  AND disp_offset > 0;

-- Step 2: Show stats
SELECT
    'Total extracted' AS metric,
    COUNT(*) AS value
FROM lextreme_extract
WHERE outcome IS NOT NULL AND facts_length >= 200

UNION ALL

SELECT outcome, COUNT(*)
FROM lextreme_extract
WHERE outcome IS NOT NULL AND facts_length >= 200
GROUP BY outcome

UNION ALL

SELECT justice_kind, COUNT(*)
FROM lextreme_extract
WHERE outcome IS NOT NULL AND facts_length >= 200
GROUP BY justice_kind

ORDER BY metric;

-- Step 3: Export balanced sample as CSV
-- Run this after reviewing stats:
-- \COPY (
--     SELECT facts_text AS text, outcome AS label, 'uk' AS language
--     FROM lextreme_extract
--     WHERE outcome IS NOT NULL AND facts_length >= 200 AND facts_length <= 10000
--     ORDER BY RANDOM()
--     LIMIT 15000
-- ) TO '/tmp/lextreme-ukrainian.csv' WITH CSV HEADER;
