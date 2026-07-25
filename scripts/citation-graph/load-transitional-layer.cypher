// LEXAI-1817 — additive load of the ПКУ transitional-provision layer into the LIVE graph
// (NEVER neo4j-admin import here — it would wipe the 300M+ CITES_ARTICLE graph).
// Input CSVs from export-transitional-provisions.sql, placed in the server /import dir
// (host path /home/ubuntu/neo4j/import/ on qdrant.lex).
// Run each statement separately via cypher-shell -c "..." (5.26 --file rejects :auto;
// -c runs an implicit transaction, required by CALL {} IN TRANSACTIONS).
//
// ⚠️ Decision.doc_id is a STRING in this graph (CitationGraphService binds String(docId)).
// A MERGE with toInteger() creates DUPLICATE Decision nodes that the service never reads
// (this exact mistake produced 11,989 orphan nodes on first load — since cleaned up).

// 1. Article nodes (resolved id-keyed: art_id = legislation_articles.id as string).
LOAD CSV FROM 'file:///transitional_articles.csv' AS row
MERGE (a:Article {art_id: row[0]})
ON CREATE SET a.legislation_id = toInteger(row[1]), a.article_number = row[2], a.title = row[3],
              a.total_citations = toInteger(row[4]), a.unique_decisions = toInteger(row[5]);

// 2. OF_LAW to the ПКУ Law node (NB: Law.legislation_id is a STRING property).
MATCH (a:Article) WHERE a.article_number STARTS WITH 'п.'
WITH a MATCH (l:Law {legislation_id: '641'})
MERGE (a)-[:OF_LAW]->(l);

// 3. CITES_ARTICLE edges — Decision keyed by STRING doc_id.
LOAD CSV FROM 'file:///transitional_cites.csv' AS row
CALL { WITH row
  MERGE (d:Decision {doc_id: row[0]})
  MERGE (a:Article {art_id: row[1]})
  MERGE (d)-[r:CITES_ARTICLE]->(a)
  ON CREATE SET r.citation_type = 'transitional_provision'
} IN TRANSACTIONS OF 5000 ROWS;

// 4. Acceptance.
MATCH (d:Decision)-[:CITES_ARTICLE]->(a:Article {article_number: 'п.38.6'})
RETURN count(d) AS docs_citing_386,
       count(CASE WHEN d.doc_id = '107631753' THEN 1 END) AS has_280_5185_19;
