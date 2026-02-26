import { logger } from '../utils/logger.js';
import type { ILLMPort, IDatabase } from '../domain/ports/index.js';
import { CostTracker } from './cost-tracker.js';
import { v4 as uuidv4 } from 'uuid';

export interface ClassificationResult {
  documentId: string;
  type: string;
  tags: string[];
  documentSubtype: string | null;
  suggestedTitle: string | null;
  confidence: number;
  status: 'classified' | 'needs_review' | 'failed';
  error?: string;
}

export interface ClassificationJobStatus {
  jobId: string;
  userId: string;
  total: number;
  completed: number;
  failed: number;
  inProgress: number;
  status: 'running' | 'completed' | 'cancelled';
  results: ClassificationResult[];
  totalCostUsd: number;
  startedAt: string;
  completedAt?: string;
}

const VALID_TYPES = ['contract', 'legislation', 'court_decision', 'internal', 'other'] as const;

const CLASSIFICATION_PROMPT = `Ти — юридичний класифікатор документів. Проаналізуй наданий фрагмент тексту документа і визначи його тип, теги та запропонуй коротку описову назву.

Доступні типи документів:
- "contract" — договори, угоди, контракти, додаткові угоди
- "legislation" — закони, кодекси, постанови КМУ, укази, накази міністерств
- "court_decision" — судові рішення, ухвали, постанови судів, вироки
- "internal" — внутрішні документи: службові записки, протоколи, акти, довідки
- "other" — якщо документ не підходить під жоден тип

Поверни JSON:
{
  "type": "один з: contract, legislation, court_decision, internal, other",
  "tags": ["до 5 тегів українською що описують зміст документа"],
  "documentSubtype": "конкретний підтип (наприклад: договір оренди, позовна заява, ухвала, наказ тощо) або null",
  "suggestedTitle": "коротка описова назва документа українською (5-10 слів, без лапок), наприклад: Договір оренди нежитлового приміщення №12, Ухвала про відкриття провадження, Наказ про прийняття на роботу",
  "confidence": 0.0-1.0
}

Якщо текст занадто короткий, нечитабельний або не вдається визначити тип — встанови type="other" і confidence < 0.3, а suggestedTitle = null.
Відповідай ТІЛЬКИ валідним JSON без markdown.`;

// Max chars to send to LLM for classification
const TEXT_SNIPPET_LENGTH = 2000;

// In-memory job tracking
const activeJobs = new Map<string, ClassificationJobStatus>();

export class DocumentClassificationService {
  constructor(
    private readonly db: IDatabase,
    private readonly llm: ILLMPort,
    private readonly costTracker: CostTracker
  ) {}

  /**
   * Start batch classification of user's unclassified documents.
   */
  async startClassification(
    userId: string,
    concurrency: number = 3,
    documentIds?: string[]
  ): Promise<ClassificationJobStatus> {
    const jobId = uuidv4();

    // Get documents to classify
    let query: string;
    let params: any[];

    if (documentIds && documentIds.length > 0) {
      query = `SELECT id, title, full_text, type, metadata
               FROM documents
               WHERE user_id = $1 AND id = ANY($2)
               ORDER BY created_at DESC`;
      params = [userId, documentIds];
    } else {
      // Get docs that have no tags or type is 'other' (unclassified)
      query = `SELECT id, title, full_text, type, metadata
               FROM documents
               WHERE user_id = $1
                 AND (
                   type = 'other'
                   OR metadata->>'classificationStatus' IS NULL
                   OR metadata->>'classificationStatus' = 'pending'
                 )
               ORDER BY created_at DESC`;
      params = [userId];
    }

    const result = await this.db.query(query, params);
    const docs = result.rows;

    if (docs.length === 0) {
      const status: ClassificationJobStatus = {
        jobId,
        userId,
        total: 0,
        completed: 0,
        failed: 0,
        inProgress: 0,
        status: 'completed',
        results: [],
        totalCostUsd: 0,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      };
      return status;
    }

    const jobStatus: ClassificationJobStatus = {
      jobId,
      userId,
      total: docs.length,
      completed: 0,
      failed: 0,
      inProgress: 0,
      status: 'running',
      results: [],
      totalCostUsd: 0,
      startedAt: new Date().toISOString(),
    };

    activeJobs.set(jobId, jobStatus);

    // Run classification in background with concurrency control
    this.processDocuments(jobId, userId, docs, concurrency).catch((err) => {
      logger.error('[Classification] Batch processing error', { jobId, error: err.message });
      const job = activeJobs.get(jobId);
      if (job) {
        job.status = 'completed';
        job.completedAt = new Date().toISOString();
      }
    });

    return jobStatus;
  }

  private async processDocuments(
    jobId: string,
    userId: string,
    docs: any[],
    concurrency: number
  ): Promise<void> {
    const semaphore = { active: 0 };
    const queue = [...docs];

    const processNext = async (): Promise<void> => {
      const job = activeJobs.get(jobId);
      if (!job || job.status === 'cancelled') return;

      const doc = queue.shift();
      if (!doc) return;

      semaphore.active++;
      job.inProgress = semaphore.active;

      try {
        const result = await this.classifySingleDocument(jobId, userId, doc);
        job.results.push(result);

        if (result.status === 'failed') {
          job.failed++;
        } else {
          job.completed++;
        }
      } catch (err: any) {
        job.failed++;
        job.results.push({
          documentId: doc.id,
          type: 'other',
          tags: [],
          documentSubtype: null,
          suggestedTitle: null,
          confidence: 0,
          status: 'failed',
          error: err.message,
        });
      } finally {
        semaphore.active--;
        job.inProgress = semaphore.active;
      }
    };

    // Process with concurrency limit
    const workers: Promise<void>[] = [];
    for (let i = 0; i < Math.min(concurrency, docs.length); i++) {
      workers.push(
        (async () => {
          while (queue.length > 0) {
            const job = activeJobs.get(jobId);
            if (!job || job.status === 'cancelled') break;
            await processNext();
          }
        })()
      );
    }

    await Promise.all(workers);

    const job = activeJobs.get(jobId);
    if (job && job.status !== 'cancelled') {
      job.status = 'completed';
      job.completedAt = new Date().toISOString();
      job.inProgress = 0;
    }
  }

  private async classifySingleDocument(
    jobId: string,
    userId: string,
    doc: any
  ): Promise<ClassificationResult> {
    const requestId = uuidv4();
    const startTime = Date.now();
    const text = doc.full_text || '';
    const snippet = text.slice(0, TEXT_SNIPPET_LENGTH);

    if (!snippet || snippet.trim().length < 20) {
      // Mark as needs_review — text too short for classification
      await this.updateDocumentClassification(doc.id, userId, {
        type: 'other',
        tags: [],
        documentSubtype: null,
        suggestedTitle: null,
        confidence: 0,
        classificationStatus: 'needs_review',
      });

      return {
        documentId: doc.id,
        type: 'other',
        tags: [],
        documentSubtype: null,
        suggestedTitle: null,
        confidence: 0,
        status: 'needs_review',
        error: 'Text too short for classification',
      };
    }

    // Track cost
    await this.costTracker.createTrackingRecord({
      requestId,
      toolName: 'document_classify',
      userId,
      userQuery: `Classify: ${doc.title?.slice(0, 100) || 'untitled'}`,
      queryParams: { documentId: doc.id, snippetLength: snippet.length },
    });

    try {
      const response = await this.llm.chatCompletion(
        {
          messages: [
            { role: 'system', content: CLASSIFICATION_PROMPT },
            {
              role: 'user',
              content: `Назва: ${doc.title || 'Без назви'}\nПоточний тип: ${doc.type}\n\nТекст:\n${snippet}`,
            },
          ],
          temperature: 0.1,
          max_tokens: 300,
          response_format: { type: 'json_object' },
        },
        'quick'
      );

      const raw = response.content?.trim();
      if (!raw) {
        throw new Error('LLM returned empty content');
      }

      const parsed = JSON.parse(raw);

      const classifiedType = VALID_TYPES.includes(parsed.type) ? parsed.type : 'other';
      const tags = Array.isArray(parsed.tags) ? parsed.tags.slice(0, 5) : [];
      const documentSubtype = parsed.documentSubtype || null;
      const suggestedTitle = (typeof parsed.suggestedTitle === 'string' && parsed.suggestedTitle.trim())
        ? parsed.suggestedTitle.trim()
        : null;
      const confidence = typeof parsed.confidence === 'number'
        ? Math.min(1, Math.max(0, parsed.confidence))
        : 0.5;

      const status: 'classified' | 'needs_review' = confidence >= 0.3 ? 'classified' : 'needs_review';

      // Update document in DB (including title if LLM suggested one with high confidence)
      await this.updateDocumentClassification(doc.id, userId, {
        type: classifiedType,
        tags,
        documentSubtype,
        suggestedTitle: (suggestedTitle && confidence >= 0.5) ? suggestedTitle : null,
        confidence,
        classificationStatus: status,
      });

      // Record cost (estimate for quick tier)
      const tokenEstimate = Math.ceil(snippet.length / 4) + 150;
      const outputTokens = 100;
      const costUsd = (tokenEstimate * 0.10 + outputTokens * 0.40) / 1_000_000;
      await this.costTracker.recordOpenAICall({
        requestId,
        model: 'gpt-5-nano',
        promptTokens: tokenEstimate,
        completionTokens: outputTokens,
        totalTokens: tokenEstimate + outputTokens,
        costUsd,
        task: 'document_classify',
      });

      await this.costTracker.completeTrackingRecord({
        requestId,
        executionTimeMs: Date.now() - startTime,
        status: 'completed',
      }).catch(() => { /* best-effort */ });

      // Accumulate cost in job
      const job = activeJobs.get(jobId);
      if (job) {
        // Quick tier cost: $0.10/1M input, $0.40/1M output
        const costUsd = (tokenEstimate * 0.10 + outputTokens * 0.40) / 1_000_000;
        job.totalCostUsd += costUsd;
      }

      return {
        documentId: doc.id,
        type: classifiedType,
        tags,
        documentSubtype,
        suggestedTitle,
        confidence,
        status,
      };
    } catch (err: any) {
      await this.costTracker.completeTrackingRecord({
        requestId,
        executionTimeMs: 0,
        status: 'failed',
        errorMessage: err.message,
      }).catch(() => { /* best-effort */ });

      // Mark as needs_review
      await this.updateDocumentClassification(doc.id, userId, {
        type: doc.type || 'other',
        tags: [],
        documentSubtype: null,
        suggestedTitle: null,
        confidence: 0,
        classificationStatus: 'needs_review',
      });

      return {
        documentId: doc.id,
        type: doc.type || 'other',
        tags: [],
        documentSubtype: null,
        suggestedTitle: null,
        confidence: 0,
        status: 'failed',
        error: err.message,
      };
    }
  }

  private async updateDocumentClassification(
    docId: string,
    userId: string,
    data: {
      type: string;
      tags: string[];
      documentSubtype: string | null;
      suggestedTitle: string | null;
      confidence: number;
      classificationStatus: string;
    }
  ): Promise<void> {
    // Build title update clause: only update if suggestedTitle is provided
    const titleClause = data.suggestedTitle ? ', title = $9' : '';
    const params: any[] = [
      data.type,
      JSON.stringify(data.tags),
      data.documentSubtype,
      data.confidence,
      data.classificationStatus,
      new Date().toISOString(),
      docId,
      userId,
    ];
    if (data.suggestedTitle) {
      params.push(data.suggestedTitle);
    }

    await this.db.query(
      `UPDATE documents
       SET type = $1,
           metadata = COALESCE(metadata, '{}'::jsonb)
             || jsonb_build_object(
               'tags', $2::jsonb,
               'documentSubtype', $3::text,
               'classificationConfidence', $4::numeric,
               'classificationStatus', $5::text,
               'classifiedAt', $6::text
             )${titleClause},
           updated_at = NOW()
       WHERE id = $7 AND user_id = $8`,
      params
    );
  }

  /**
   * Get status of a classification job.
   */
  getJobStatus(jobId: string): ClassificationJobStatus | null {
    return activeJobs.get(jobId) || null;
  }

  /**
   * Cancel a running classification job.
   */
  cancelJob(jobId: string): boolean {
    const job = activeJobs.get(jobId);
    if (!job || job.status !== 'running') return false;
    job.status = 'cancelled';
    job.completedAt = new Date().toISOString();
    return true;
  }

  /**
   * Get document statistics for a user.
   */
  async getUserDocumentStats(userId: string): Promise<{
    total: number;
    classified: number;
    needsReview: number;
    unclassified: number;
    byType: Record<string, number>;
    totalClassificationCostUsd: number;
    totalUploadSessions: number;
    totalStorageBytes: number;
  }> {
    const [statsResult, costResult, uploadResult] = await Promise.all([
      this.db.query(
        `SELECT
           COUNT(*) as total,
           COUNT(*) FILTER (WHERE metadata->>'classificationStatus' = 'classified') as classified,
           COUNT(*) FILTER (WHERE metadata->>'classificationStatus' = 'needs_review') as needs_review,
           COUNT(*) FILTER (WHERE metadata->>'classificationStatus' IS NULL OR metadata->>'classificationStatus' = 'pending') as unclassified,
           COUNT(*) FILTER (WHERE type = 'contract') as type_contract,
           COUNT(*) FILTER (WHERE type = 'legislation') as type_legislation,
           COUNT(*) FILTER (WHERE type = 'court_decision') as type_court_decision,
           COUNT(*) FILTER (WHERE type = 'internal') as type_internal,
           COUNT(*) FILTER (WHERE type = 'other') as type_other
         FROM documents
         WHERE user_id = $1`,
        [userId]
      ),
      this.db.query(
        `SELECT COALESCE(SUM(total_cost_usd), 0) as total_cost
         FROM cost_tracking
         WHERE user_id = $1 AND tool_name IN ('document_classify', 'store_document')`,
        [userId]
      ),
      this.db.query(
        `SELECT COUNT(*) as total_sessions, COALESCE(SUM(file_size), 0) as total_bytes
         FROM upload_sessions
         WHERE user_id = $1 AND status = 'completed'`,
        [userId]
      ),
    ]);

    const s = statsResult.rows[0];
    const c = costResult.rows[0];
    const u = uploadResult.rows[0];

    return {
      total: parseInt(s.total) || 0,
      classified: parseInt(s.classified) || 0,
      needsReview: parseInt(s.needs_review) || 0,
      unclassified: parseInt(s.unclassified) || 0,
      byType: {
        contract: parseInt(s.type_contract) || 0,
        legislation: parseInt(s.type_legislation) || 0,
        court_decision: parseInt(s.type_court_decision) || 0,
        internal: parseInt(s.type_internal) || 0,
        other: parseInt(s.type_other) || 0,
      },
      totalClassificationCostUsd: parseFloat(c.total_cost) || 0,
      totalUploadSessions: parseInt(u.total_sessions) || 0,
      totalStorageBytes: parseInt(u.total_bytes) || 0,
    };
  }
}
