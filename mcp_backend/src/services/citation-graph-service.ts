/**
 * CitationGraphService
 *
 * Neo4j-backed citation graph for EDRSR court decisions.
 *
 * Graph model (loaded via neo4j-admin import, see LEXAI-1770):
 *   (:Decision {doc_id})-[:CITES_ARTICLE {citation_type, citation_context}]->(:Article)
 *   (:Article {art_id, law_number, law_article, total_citations, unique_decisions})-[:OF_LAW]->(:Law {law_number})
 *   (:Article)-[:COCITED {weight}]->(:Article)
 *
 * Gated behind the CITATION_BACKEND feature flag (postgres | neo4j). When set to
 * `neo4j`, isEnabled() returns true and the driver connects to NEO4J_URI. The
 * Postgres path (CitationValidator / @secondlayer/core) remains the default.
 *
 * Thin graph: only ids + edge metadata live here; fulltext/vectors stay in
 * Postgres/Qdrant and are joined back by doc_id.
 */

import neo4j, { type Driver } from 'neo4j-driver';
import { logger } from '../utils/logger.js';

export interface ArticleCitation {
  law: string;
  article: string;
  citationType?: string | null;
  context?: string | null;
}

export interface CocitedArticle {
  law: string;
  article: string;
  weight: number;
}

export interface CitedArticleStat {
  law: string;
  article: string;
  totalCitations: number;
  uniqueDecisions: number;
}

export interface CitedArticleRef {
  law: string;
  article: string;
  citationType?: string | null;
  /** How often this cited article is referenced corpus-wide (node stat) — a cheap authority signal. */
  popularity: number;
}

export interface DecisionCitationSummary {
  /** Total CITES_ARTICLE edges out of this decision. */
  citedCount: number;
  /** Top cited articles, ordered by corpus-wide popularity (most authoritative first). */
  topCitedArticles: CitedArticleRef[];
}

export interface CitationGraphNode {
  id: string;
  type: 'decision' | 'article' | 'law';
  label: string;
}

export interface CitationGraphEdge {
  from: string;
  to: string;
  type: 'CITES_ARTICLE' | 'OF_LAW' | 'COCITED';
  weight?: number;
}

export interface CitationGraphResult {
  root: { docId: string };
  nodes: CitationGraphNode[];
  edges: CitationGraphEdge[];
  truncated: boolean;
}

export interface CitationGraphHealth {
  ok: boolean;
  enabled: boolean;
  uri: string;
  error?: string;
  counts?: Record<string, number>;
}

/** Convert a neo4j Integer | bigint | number to a JS number safely. */
function toNum(v: any): number {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'bigint') return Number(v);
  if (neo4j.isInt(v)) return (v as any).toNumber();
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
}

export class CitationGraphService {
  private driver: Driver | null = null;
  private readonly uri: string;
  private readonly user: string;
  private readonly password: string;
  private readonly database: string;
  private readonly enabled: boolean;

  constructor() {
    this.uri = process.env.NEO4J_URI || 'bolt://localhost:7687';
    this.user = process.env.NEO4J_USER || 'neo4j';
    this.password = process.env.NEO4J_PASSWORD || '';
    this.database = process.env.NEO4J_DATABASE || 'neo4j';
    this.enabled = (process.env.CITATION_BACKEND || 'postgres').toLowerCase() === 'neo4j';
  }

  /** True when CITATION_BACKEND=neo4j. Callers fall back to the Postgres path otherwise. */
  isEnabled(): boolean {
    return this.enabled;
  }

  private getDriver(): Driver {
    if (!this.driver) {
      this.driver = neo4j.driver(
        this.uri,
        neo4j.auth.basic(this.user, this.password),
        {
          maxConnectionPoolSize: 20,
          connectionAcquisitionTimeout: 15_000,
          maxTransactionRetryTime: 10_000,
        }
      );
      logger.info('[CitationGraphService] Neo4j driver initialized', { uri: this.uri, database: this.database });
    }
    return this.driver;
  }

  private async run<T>(cypher: string, params: Record<string, any>, map: (record: any) => T): Promise<T[]> {
    const session = this.getDriver().session({ database: this.database, defaultAccessMode: neo4j.session.READ });
    try {
      const result = await session.run(cypher, params);
      return result.records.map(map);
    } finally {
      await session.close();
    }
  }

  /** Connectivity + node-label counts. Cheap (uses count-store). */
  async healthCheck(): Promise<CitationGraphHealth> {
    const base = { enabled: this.enabled, uri: this.uri };
    try {
      const rows = await this.run(
        'MATCH (n) RETURN labels(n)[0] AS label, count(*) AS c',
        {},
        (r) => ({ label: r.get('label') as string | null, c: toNum(r.get('c')) })
      );
      const counts: Record<string, number> = {};
      for (const row of rows) if (row.label) counts[row.label] = row.c;
      return { ...base, ok: true, counts };
    } catch (error: any) {
      logger.error('[CitationGraphService] healthCheck failed', { error: error?.message });
      return { ...base, ok: false, error: error?.message };
    }
  }

  /** Articles cited by a given decision (Decision -> Article). */
  async getDecisionCitations(docId: string | number, limit = 200): Promise<ArticleCitation[]> {
    return this.run(
      `MATCH (d:Decision {doc_id: $docId})-[c:CITES_ARTICLE]->(a:Article)
       RETURN a.law_number AS law, a.law_article AS article,
              c.citation_type AS ct, c.citation_context AS ctx
       LIMIT $limit`,
      { docId: String(docId), limit: neo4j.int(limit) },
      (r) => ({
        law: r.get('law'),
        article: r.get('article'),
        citationType: r.get('ct'),
        context: r.get('ctx'),
      })
    );
  }

  /**
   * Compact citation summary for a single decision — what articles it cites, with a
   * corpus-wide popularity (authority) signal, plus the total citation count.
   * Intended as inline enrichment for get_court_decision (Decision->Article path only,
   * which is fully loaded today; decision<->decision is a future layer).
   */
  async getDecisionCitationSummary(docId: string | number, limit = 20): Promise<DecisionCitationSummary> {
    const id = String(docId);
    const [articles, countRows] = await Promise.all([
      this.run(
        `MATCH (d:Decision {doc_id: $docId})-[c:CITES_ARTICLE]->(a:Article)
         RETURN a.law_number AS law, a.law_article AS article,
                c.citation_type AS ct, a.total_citations AS pop
         ORDER BY coalesce(a.total_citations, 0) DESC
         LIMIT $limit`,
        { docId: id, limit: neo4j.int(limit) },
        (r) => ({
          law: r.get('law'),
          article: r.get('article'),
          citationType: r.get('ct'),
          popularity: toNum(r.get('pop')),
        })
      ),
      this.run(
        `MATCH (:Decision {doc_id: $docId})-[c:CITES_ARTICLE]->() RETURN count(c) AS c`,
        { docId: id },
        (r) => toNum(r.get('c'))
      ),
    ]);
    return { citedCount: countRows[0] ?? 0, topCitedArticles: articles };
  }

  /** Decisions that cite a given article (Article <- Decision), plus total count. */
  async getArticleCitedBy(
    law: string,
    article: string,
    limit = 100
  ): Promise<{ count: number; decisions: string[] }> {
    const [decisions, countRows] = await Promise.all([
      this.run(
        `MATCH (a:Article {law_number: $law, law_article: $article})<-[:CITES_ARTICLE]-(d:Decision)
         RETURN d.doc_id AS docId LIMIT $limit`,
        { law, article, limit: neo4j.int(limit) },
        (r) => r.get('docId') as string
      ),
      this.run(
        `MATCH (a:Article {law_number: $law, law_article: $article})<-[c:CITES_ARTICLE]-()
         RETURN count(c) AS c`,
        { law, article },
        (r) => toNum(r.get('c'))
      ),
    ]);
    return { count: countRows[0] ?? 0, decisions };
  }

  /** Precomputed citation stats for an article (from the Article node). */
  async getArticleStats(law: string, article: string): Promise<CitedArticleStat | null> {
    const rows = await this.run(
      `MATCH (a:Article {law_number: $law, law_article: $article})
       RETURN a.law_number AS law, a.law_article AS article,
              a.total_citations AS tc, a.unique_decisions AS ud
       LIMIT 1`,
      { law, article },
      (r) => ({
        law: r.get('law'),
        article: r.get('article'),
        totalCitations: toNum(r.get('tc')),
        uniqueDecisions: toNum(r.get('ud')),
      })
    );
    return rows[0] ?? null;
  }

  /** Articles co-cited alongside a given article, by descending weight. */
  async getCocitedArticles(law: string, article: string, limit = 20): Promise<CocitedArticle[]> {
    return this.run(
      `MATCH (a:Article {law_number: $law, law_article: $article})-[co:COCITED]-(b:Article)
       RETURN b.law_number AS law, b.law_article AS article, co.weight AS weight
       ORDER BY co.weight DESC
       LIMIT $limit`,
      { law, article, limit: neo4j.int(limit) },
      (r) => ({ law: r.get('law'), article: r.get('article'), weight: toNum(r.get('weight')) })
    );
  }

  /**
   * Build a bounded citation-graph neighborhood around a decision for visualization.
   * depth 1: decision -> cited articles (+ their laws).
   * depth >=2: also include the most co-cited articles for each cited article.
   */
  async getCitationGraph(docId: string | number, depth = 1, articleLimit = 50): Promise<CitationGraphResult> {
    const id = String(docId);
    const nodes = new Map<string, CitationGraphNode>();
    const edges: CitationGraphEdge[] = [];

    const decisionKey = `decision:${id}`;
    nodes.set(decisionKey, { id: decisionKey, type: 'decision', label: id });

    const cited = await this.getDecisionCitations(id, articleLimit);
    for (const a of cited) {
      const artKey = `article:${a.law}|${a.article}`;
      const lawKey = `law:${a.law}`;
      if (!nodes.has(artKey)) {
        nodes.set(artKey, { id: artKey, type: 'article', label: `${a.law} ст.${a.article}` });
      }
      if (!nodes.has(lawKey)) {
        nodes.set(lawKey, { id: lawKey, type: 'law', label: a.law });
      }
      edges.push({ from: decisionKey, to: artKey, type: 'CITES_ARTICLE' });
      edges.push({ from: artKey, to: lawKey, type: 'OF_LAW' });
    }

    if (depth >= 2) {
      for (const a of cited.slice(0, 15)) {
        const artKey = `article:${a.law}|${a.article}`;
        const cocited = await this.getCocitedArticles(a.law, a.article, 5);
        for (const c of cocited) {
          const ck = `article:${c.law}|${c.article}`;
          if (!nodes.has(ck)) {
            nodes.set(ck, { id: ck, type: 'article', label: `${c.law} ст.${c.article}` });
          }
          edges.push({ from: artKey, to: ck, type: 'COCITED', weight: c.weight });
        }
      }
    }

    return {
      root: { docId: id },
      nodes: Array.from(nodes.values()),
      edges,
      truncated: cited.length >= articleLimit,
    };
  }

  async close(): Promise<void> {
    if (this.driver) {
      await this.driver.close();
      this.driver = null;
    }
  }
}
