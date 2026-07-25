// Proprietary implementation: @secondlayer/core (private repo)
// Real constants (ranking-calibrated) live in core. Defaults below are safe
// fallbacks used when building without the proprietary overlay.

export const EDRSR_METADATA_SEARCH_ORDER = 'd.adjudication_date DESC NULLS LAST';
export const EDRSR_FTS_SEARCH_ORDER = 'rank DESC';

export const TSVECTOR_TITLE_WEIGHT: 'A' | 'B' | 'C' | 'D' = 'A';
export const TSVECTOR_BODY_WEIGHT: 'A' | 'B' | 'C' | 'D' = 'B';
export const TSVECTOR_BODY_TRUNCATE_CHARS = 50_000;

export const FTS_HEADLINE_MAX_WORDS = 60;
export const FTS_HEADLINE_MIN_WORDS = 20;
