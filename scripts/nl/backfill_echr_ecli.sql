-- Give the ECtHR corpus its ECLIs, so cross-jurisdiction citations resolve.
--
-- 209,774 cases sit on prod, 8,904 of them with an ECLI. The NL graph produced
-- 8,478 edges pointing at ECLI:CE:ECHR:..., which could match 33 of them.
--
-- The identifier is derivable from fields we already hold:
--   ECLI:CE:ECHR:<yyyy>:<mmdd><TYPE><application no padded to 7><yy>
--   ECLI:CE:ECHR:2026:0312JUD005270913  ←  2026-03-12, HFJUD, 52709/13
--
-- judgment_date is only filled for 11,104 rows, but kp_date carries the date as
-- ISO text for 198,670, so the two are coalesced.
--
-- The rule is not trusted on inspection: it is first required to reproduce all
-- 8,904 known ECLIs exactly, and the backfill aborts if it does not.
\timing on

DO $$
DECLARE
    checked int;
    matched int;
    filled  int;
BEGIN
    WITH have AS (
        SELECT ecli,
               coalesce(judgment_date, substring(kp_date from 1 for 10)::date) AS dt,
               doc_type,
               split_part(split_part(app_no, ';', 1), '/', 1) AS num,
               split_part(split_part(app_no, ';', 1), '/', 2) AS yy
        FROM echr_cases
        WHERE ecli IS NOT NULL AND app_no IS NOT NULL
          AND coalesce(judgment_date, substring(kp_date from 1 for 10)::date) IS NOT NULL
    )
    SELECT count(*),
           count(*) FILTER (WHERE ecli = 'ECLI:CE:ECHR:' || to_char(dt,'YYYY') || ':' ||
                to_char(dt,'MMDD') || substring(upper(doc_type) from '(JUD|DEC|REP|ADV|RES|SER)') ||
                lpad(num,7,'0') || lpad(yy,2,'0'))
      INTO checked, matched
      FROM have;

    RAISE NOTICE 'rule check: % of % known ECLIs reproduced', matched, checked;
    IF checked = 0 OR matched <> checked THEN
        RAISE EXCEPTION 'rule does not reproduce every known ECLI (% of %), refusing to backfill',
                        matched, checked;
    END IF;

    UPDATE echr_cases c
       SET ecli = 'ECLI:CE:ECHR:' || to_char(d.dt,'YYYY') || ':' || to_char(d.dt,'MMDD') ||
                  substring(upper(c.doc_type) from '(JUD|DEC|REP|ADV|RES|SER)') ||
                  lpad(d.num,7,'0') || lpad(d.yy,2,'0')
      FROM (SELECT id,
                   coalesce(judgment_date, substring(kp_date from 1 for 10)::date) AS dt,
                   split_part(split_part(app_no, ';', 1), '/', 1) AS num,
                   split_part(split_part(app_no, ';', 1), '/', 2) AS yy
              FROM echr_cases
             WHERE ecli IS NULL AND app_no IS NOT NULL) d
     WHERE c.id = d.id
       AND d.dt IS NOT NULL
       AND d.num ~ '^[0-9]+$' AND d.yy ~ '^[0-9]+$'
       AND upper(c.doc_type) ~ '(JUD|DEC|REP|ADV|RES|SER)';

    GET DIAGNOSTICS filled = ROW_COUNT;
    RAISE NOTICE 'filled % ECLIs', filled;
END $$;

\echo == coverage after backfill ==
SELECT count(*) AS cases, count(ecli) AS with_ecli,
       round(100.0 * count(ecli) / count(*), 1) AS pct
FROM echr_cases;

\echo == how many NL edges now resolve against it ==
UPDATE nl_case_citations c
   SET to_ecli = c.to_raw, resolved = true, match_method = 'external_echr',
       unresolved_reason = NULL
  FROM echr_cases h
 WHERE c.cite_kind = 'ecli_echr' AND NOT c.resolved AND h.ecli = c.to_raw;

SELECT cite_kind, count(*) AS edges, count(*) FILTER (WHERE resolved) AS resolved,
       round(100.0 * count(*) FILTER (WHERE resolved) / count(*), 1) AS pct
FROM nl_case_citations WHERE cite_kind = 'ecli_echr' GROUP BY 1;
