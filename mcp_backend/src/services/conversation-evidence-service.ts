/**
 * ConversationEvidenceService — aggregates and caches evidence
 * (decisions, court documents, regulations) per conversation.
 *
 * Source of truth: conversation_messages JSONB columns (decisions, citations, documents).
 * Redis provides fast read-through cache with 2h TTL.
 */

import { logger } from '../utils/logger.js';
import type { IDatabase } from '../domain/ports/index.js';
import type { ICachePort } from '../domain/ports/index.js';
import type { Decision, Citation, VaultDocument } from '@secondlayer/shared';

const EVIDENCE_CACHE_TTL = 7200; // 2 hours

/** Document types that go to the "Рішення" tab */
const DECISION_TYPES = new Set(['Рішення', 'Вирок', 'Постанова']);

/** Document types that go to the "Документи" tab */
const PROCEDURAL_TYPES = new Set(['Ухвала', 'Окрема думка', 'Окрема ухвала']);

export interface AggregatedEvidence {
  decisions: Decision[];
  courtDocuments: Decision[];
  regulations: Citation[];
  vaultDocuments: VaultDocument[];
}

export class ConversationEvidenceService {
  constructor(
    private db: IDatabase,
    private cache: ICachePort | null = null
  ) {}

  setCachePort(cache: ICachePort): void {
    this.cache = cache;
  }

  // ─── Public API ────────────────────────────────────────────

  async getDecisions(conversationId: string, userId: string): Promise<Decision[]> {
    const evidence = await this.getAggregatedEvidence(conversationId, userId);
    return evidence.decisions;
  }

  async getCourtDocuments(conversationId: string, userId: string): Promise<Decision[]> {
    const evidence = await this.getAggregatedEvidence(conversationId, userId);
    return evidence.courtDocuments;
  }

  async getRegulations(conversationId: string, userId: string): Promise<Citation[]> {
    const evidence = await this.getAggregatedEvidence(conversationId, userId);
    return evidence.regulations;
  }

  // ─── Cache management ──────────────────────────────────────

  async updateEvidenceCache(conversationId: string, userId: string): Promise<void> {
    try {
      const evidence = await this.aggregateFromDb(conversationId, userId);
      if (this.cache) {
        await this.cache.set(
          this.cacheKey(conversationId),
          JSON.stringify(evidence),
          EVIDENCE_CACHE_TTL
        );
        logger.debug('[ConversationEvidence] Cache updated', { conversationId });
      }
    } catch (err: any) {
      logger.warn('[ConversationEvidence] updateEvidenceCache error', { error: err.message });
    }
  }

  async invalidateCache(conversationId: string): Promise<void> {
    try {
      if (this.cache) {
        await this.cache.del(this.cacheKey(conversationId));
      }
    } catch {
      // ignore
    }
  }

  // ─── Internal ──────────────────────────────────────────────

  private cacheKey(conversationId: string): string {
    return `conv:evidence:${conversationId}:all`;
  }

  private async getAggregatedEvidence(conversationId: string, userId: string): Promise<AggregatedEvidence> {
    // Try Redis first
    if (this.cache) {
      try {
        const cached = await this.cache.get(this.cacheKey(conversationId));
        if (cached) {
          logger.debug('[ConversationEvidence] Cache hit', { conversationId });
          return JSON.parse(cached);
        }
      } catch {
        // fall through to DB
      }
    }

    // Cache miss — aggregate from DB
    const evidence = await this.aggregateFromDb(conversationId, userId);

    // Write through to cache
    if (this.cache) {
      try {
        await this.cache.set(
          this.cacheKey(conversationId),
          JSON.stringify(evidence),
          EVIDENCE_CACHE_TTL
        );
      } catch {
        // ignore cache write errors
      }
    }

    return evidence;
  }

  private async aggregateFromDb(conversationId: string, userId: string): Promise<AggregatedEvidence> {
    // Verify ownership
    const ownership = await this.db.query(
      `SELECT id FROM conversations
       WHERE id = $1 AND (
         user_id = $2
         OR (matter_id IS NOT NULL AND EXISTS (
           SELECT 1 FROM matter_team
           WHERE matter_id = conversations.matter_id AND user_id = $2 AND removed_at IS NULL
         ))
       )`,
      [conversationId, userId]
    );

    if (ownership.rows.length === 0) {
      return { decisions: [], courtDocuments: [], regulations: [], vaultDocuments: [] };
    }

    // Fetch all evidence from conversation messages
    const result = await this.db.query(
      `SELECT decisions, citations, documents
       FROM conversation_messages
       WHERE conversation_id = $1 AND role = 'assistant'
       ORDER BY created_at`,
      [conversationId]
    );

    const allDecisions: Decision[] = [];
    const allCitations: Citation[] = [];
    const allDocuments: VaultDocument[] = [];
    const seenDecisionIds = new Set<string>();
    const seenCitationKeys = new Set<string>();
    const seenDocIds = new Set<string>();

    for (const row of result.rows) {
      // Decisions
      if (Array.isArray(row.decisions)) {
        for (const d of row.decisions) {
          const key = d.id || `${d.number}-${d.date}`;
          if (!seenDecisionIds.has(key)) {
            seenDecisionIds.add(key);
            allDecisions.push(d);
          }
        }
      }

      // Citations (regulations)
      if (Array.isArray(row.citations)) {
        for (const c of row.citations) {
          const key = `${c.source}:${(c.text || '').substring(0, 50)}`;
          if (!seenCitationKeys.has(key)) {
            seenCitationKeys.add(key);
            allCitations.push(c);
          }
        }
      }

      // Vault documents
      if (Array.isArray(row.documents)) {
        for (const doc of row.documents) {
          if (!seenDocIds.has(doc.id)) {
            seenDocIds.add(doc.id);
            allDocuments.push(doc);
          }
        }
      }
    }

    // Split decisions into proper decisions vs procedural documents
    const decisions: Decision[] = [];
    const courtDocuments: Decision[] = [];

    for (const d of allDecisions) {
      const docType = d.documentType || '';
      if (PROCEDURAL_TYPES.has(docType)) {
        courtDocuments.push(d);
      } else if (DECISION_TYPES.has(docType) || !docType) {
        // Default to decisions tab if no type
        decisions.push(d);
      } else {
        courtDocuments.push(d);
      }
    }

    return { decisions, courtDocuments, regulations: allCitations, vaultDocuments: allDocuments };
  }
}
