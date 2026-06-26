// load-case-layer.cypher  (LEXAI-1777)
//
// ONLINE additive load of the decision<->decision Case layer into the LIVE Neo4j
// graph on qdrant.lex. Does NOT wipe the existing article graph (no neo4j-admin import).
// Adds:  (:Case) nodes  +  (:Decision)-[:CITES_CASE]->(:Case) precedent edges.
// Pre-req: cases.csv + cites_case.csv (gunzipped) in /home/ubuntu/neo4j/import/.
//   cat ... | cypher-shell -u neo4j -p <pw> --file load-case-layer.cypher
//
// decision<->decision is then a 2-hop traversal:
//   (d1:Decision)-[:CITES_CASE]->(c:Case)   // d1 relies on case c
//   inbound to a Case = "who cites this case" = check_precedent_status.
// Member decisions of a case stay in Postgres (edrsr_case_index / edrsr_documents);
// get_case_documents_chain is a cause_num lookup, no graph needed.

// 1. Case key uniqueness (also index-backs the MERGEs below).
CREATE CONSTRAINT case_cause_num IF NOT EXISTS FOR (c:Case) REQUIRE c.cause_num IS UNIQUE;

// 2. Case nodes. MERGE is idempotent / re-runnable.
//    NOTE: run each LOAD CSV ... IN TRANSACTIONS statement on its OWN via
//    `cypher-shell -c "<statement>"` (5.x auto-uses an implicit txn). Do NOT use a
//    multi-statement --file: cypher-shell wraps that in an explicit txn and
//    CALL {} IN TRANSACTIONS then fails ("not allowed in an open transaction").
LOAD CSV WITH HEADERS FROM 'file:///cases.csv' AS row
CALL { WITH row
  MERGE (c:Case {cause_num: row.cause_num})
  SET c.member_count  = toInteger(row.member_count),
      c.latest_doc_id = row.latest_doc_id
} IN TRANSACTIONS OF 20000 ROWS;

// 3. CITES_CASE precedent edges. Decision nodes are MERGE'd in case a citing
//    decision is not already a node (some cite cases but no articles). The
//    decision_doc_id + case_cause_num constraints make both lookups index seeks.
LOAD CSV WITH HEADERS FROM 'file:///cites_case.csv' AS row
CALL { WITH row
  MATCH (c:Case {cause_num: row.cause_num})
  MERGE (d:Decision {doc_id: row.from_doc_id})
  MERGE (d)-[:CITES_CASE]->(c)
} IN TRANSACTIONS OF 10000 ROWS;

// 4. Sanity checks.
MATCH (c:Case) RETURN count(c) AS case_nodes;
MATCH ()-[r:CITES_CASE]->() RETURN count(r) AS cites_case_edges;
// Top-cited precedent cases (inbound CITES_CASE):
MATCH (d:Decision)-[:CITES_CASE]->(c:Case)
RETURN c.cause_num AS cause_num, c.member_count AS members, count(d) AS cited_by
ORDER BY cited_by DESC LIMIT 15;
