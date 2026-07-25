# Decision↔decision citation layer (LEXAI-1777)

Resolves `case_citation_edges.to_case_number` → `edrsr_documents.cause_num` and builds the
precedent (decision↔decision) layer on top of the existing legislation citation graph.

## Background (Step-1 probe, 2026-06-26)

- `case_citation_edges` (prod) = 73.46M raw `from_doc_id → to_case_number` edges (from #1773).
- Resolution = **exact join** on `cause_num`. ~64% of distinct case numbers resolve; that is the
  ceiling — year-normalization is net-negative, and the ~36% unresolved are cited cases genuinely
  absent from the EDRSR corpus (pre-2013 / unpublished / other registry).
- Cardinality: 38.35M distinct cases / 101M decisions → avg **2.635 decisions/case**.
- **Model = Case node** (not decision→decision fan-out, which would be ~150-250M noisy edges):
  `(:Decision)-[:CITES_CASE]->(:Case)`, decision↔decision via 2-hop. `get_case_documents_chain`
  and `check_precedent_status` are served from Postgres (`edrsr_case_index` / `case_citation_links`);
  Neo4j adds graph traversal.

## Pipeline

### 1. Build the Postgres resolution layer (on PROD)
```bash
docker exec -i secondlayer-postgres-prod psql -U secondlayer -d secondlayer_prod \
  -v ON_ERROR_STOP=1 -f - < build-case-citation-links.sql
```
Creates (additive; rollback = `DROP TABLE`):
- `edrsr_case_index` — Case dimension (cause_num PK, member_count, latest_doc_id, first/last_date).
- `case_citation_links` — resolved `CITES_CASE` edges + unresolved tail (match_method, reason,
  `is_self_citation`). Indexes on from_doc_id / to_case_number / resolved.

Serves directly, no graph:
- `get_case_documents_chain(case)` = `SELECT doc_id FROM edrsr_documents WHERE cause_num = $case`.
- `check_precedent_status(case)` = `SELECT … FROM case_citation_links WHERE to_case_number = $case
   AND resolved` (inbound citations).

### 2. Export the Case layer (on PROD)
```bash
bash export-case-layer.sh        # -> /tmp/case-layer/{cases,cites_case}.csv.gz
```

### 3. Transfer prod → qdrant.lex import dir
prod→qdrant direct ssh is key-blocked; relay through the orchestrator (macbook):
```bash
for f in cases cites_case; do
  ssh prod "cat /tmp/case-layer/$f.csv.gz" | \
    ssh qdrant.lex "cat > /home/ubuntu/neo4j/import/$f.csv.gz && gunzip -f /home/ubuntu/neo4j/import/$f.csv.gz"
done
```

### 4. Online additive load into Neo4j (on qdrant.lex, NO wipe)
```bash
ssh qdrant.lex 'docker exec -i neo4j cypher-shell -u neo4j -p <pw> --file /import/load-case-layer.cypher'
```
Adds `(:Case)` (38.3M) + `(:Decision)-[:CITES_CASE]->(:Case)` (resolved, non-self) to the live graph.
Existing article graph (391.9M `CITES_ARTICLE`) is untouched. Idempotent (MERGE) — safe to re-run.

### 5. Verify
Top-cited precedent cases (inbound `CITES_CASE`) printed by the cypher; cross-check a known case.

## Next (separate ticket)
Wire `CitationGraphService` (`CITATION_BACKEND=neo4j`) inbound/precedent methods + the
`check_precedent_status` / `get_case_documents_chain` tool handlers to this layer.
