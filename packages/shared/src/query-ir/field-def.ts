/**
 * query-ir/field-def.ts — declarative field → SQL match mapping.
 *
 * Canonical home for MatchType / FieldDef (moved out of mcp_backend
 * registry-catalog.ts so registry AND EDRSR share ONE definition).
 * A FieldDef whitelists a slot: only declared fields ever reach SQL, and
 * each maps to a fixed parameterized condition shape — no interpolation.
 */

export type MatchType =
  | 'ilike'          // col ILIKE $N  (%val%)
  | 'exact'          // col = $N
  | 'ilike_multi'    // (col1 ILIKE $N OR col2 ILIKE $N ...)  (%val%)
  | 'exact_multi'    // (col1 = $N OR col2 = $N ...)
  | 'gte'            // col >= $N
  | 'lte'            // col <= $N
  | 'array_contains' // $N = ANY(col)
  | 'ilike_cast'     // col::text ILIKE $N  (%val%)
  | 'fts'            // to_tsvector('english', col) @@ plainto_tsquery('english', $N)
  | 'fts_simple';    // to_tsvector('simple', col) @@ plainto_tsquery('simple', $N)

export interface FieldDef {
  name: string;
  /** Human/LLM-facing description of the filter (optional for non-catalog uses). */
  description?: string;
  match: MatchType;
  /** Fully-qualified column name(s), e.g. 'name' or 'd.judge'. */
  columns: string[];
  type?: 'string' | 'number' | 'boolean';
  transform?: 'uppercase';
}
