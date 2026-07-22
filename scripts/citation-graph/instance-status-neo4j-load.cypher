// Phase 3: additive load of the instance-status layer into the neo4j-citation graph.
// Decision nodes key on doc_id as a STRING (index decision_doc_id). Additive: adds
// Decision.status + (:Decision)-[:SUPERSEDED_BY]->(:Decision) and -[:HAS_DISSENT]->.
//
// IMPORTANT (prod = Neo4j Community + db.transaction.timeout=5s): a single LOAD CSV over
// the full 693K rows exceeds the 5s cap and cannot be raised at runtime (no dbms.setConfigValue,
// no APOC). Do NOT run these whole; drive them via instance-status-neo4j-chunk-load.sh which
// splits the CSV into sub-5s chunks. Kept here as the canonical per-row cypher.

// --- overruled: SUPERSEDED_BY + status ---
LOAD CSV WITH HEADERS FROM 'file:///edrsr_overruled.csv' AS row
CALL {
  WITH row
  MATCH (low:Decision  {doc_id: row.doc_id})
  MATCH (high:Decision {doc_id: row.overruled_by})
  SET low.status = 'overruled'
  MERGE (low)-[r:SUPERSEDED_BY]->(high)
  SET r.disposition = row.disposition, r.reversed_date = row.reversed_date
} IN TRANSACTIONS OF 500 ROWS;

// --- dissents: HAS_DISSENT + status ---
LOAD CSV WITH HEADERS FROM 'file:///edrsr_dissent.csv' AS row
CALL {
  WITH row
  MATCH (p:Decision   {doc_id: row.parent_doc_id})
  MATCH (dis:Decision {doc_id: row.dissent_doc_id})
  SET dis.status = 'dissent'
  MERGE (p)-[:HAS_DISSENT]->(dis)
} IN TRANSACTIONS OF 500 ROWS;
