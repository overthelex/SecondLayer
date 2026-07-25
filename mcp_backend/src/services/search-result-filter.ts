import { logger } from '../utils/logger.js';
import { withLLMRetry } from '../utils/llm-retry.js';
import type { ILLMPort } from '../domain/ports/index.js';

function filterPrompt(minScore: number): string {
  return `Ти — юридичний асистент з ранжування. Тобі надано пошуковий запит користувача та список судових рішень (метадані).
Оціни релевантність кожного рішення до запиту за шкалою 0-10.

КРИТЕРІЇ:
- 8-10: прямо стосується запиту (та ж стаття, аналогічні обставини, відповідна юрисдикція)
- 5-7: частково релевантне (суміжна тема, інша стаття того ж кодексу, схожі обставини)
- 0-4: нерелевантне (інша тема, інша галузь права)

Поверни ТІЛЬКИ JSON масив об'єктів: [{"doc_id": 12345, "score": 8}, ...]
Порядок — за спаданням score. Включи ТІЛЬКИ рішення зі score >= ${minScore}.`;
}

const MIN_RESULTS_TO_FILTER = 8;
const MIN_SCORE = 5;
/**
 * Stricter keep-threshold for when the FTS leg collapsed and the fused set is effectively
 * vector-only (CORE-21 P1.5b). Without a precise FTS anchor, semantic search surfaces
 * "partially relevant" (5-7) same-codex cases that get mis-cited as on-point practice;
 * requiring 8-10 ("прямо стосується") drops that flood.
 */
export const STRICT_MIN_SCORE = 7;

export class SearchResultFilter {
  constructor(private readonly llm: ILLMPort) {}

  async filterResults(
    results: any[],
    query: string,
    options?: { maxResults?: number; minScore?: number },
  ): Promise<{ filtered: any[]; original_count: number; filtered_count: number }> {
    const originalCount = results.length;
    const minScore = options?.minScore ?? MIN_SCORE;

    if (results.length < MIN_RESULTS_TO_FILTER || !query?.trim()) {
      return { filtered: results, original_count: originalCount, filtered_count: originalCount };
    }

    const summaries = results.map(r => ({
      doc_id: r.doc_id,
      cause_num: r.cause_num,
      court_name: r.court_name,
      judge: r.judge,
      justice_kind_name: r.justice_kind_name,
      judgment_form: r.judgment_form,
      adjudication_date: r.adjudication_date,
      ...(r.headline ? { headline: r.headline } : {}),
      ...(r.fts_headline ? { headline: r.fts_headline } : {}),
      ...(r.qdrant_best_chunk_text ? { chunk: r.qdrant_best_chunk_text.slice(0, 200) } : {}),
    }));

    try {
      const response = await withLLMRetry(
        () => this.llm.chatCompletion(
          {
            messages: [
              { role: 'system', content: filterPrompt(minScore) },
              {
                role: 'user',
                content: `Запит: "${query}"\n\nРезультати (${summaries.length}):\n${JSON.stringify(summaries, null, 0)}`,
              },
            ],
            temperature: 0.1,
            max_tokens: 2048,
            response_format: { type: 'json_object' },
          },
          'quick',
        ),
        { operationName: 'SearchResultFilter.filter', timeoutMs: 12_000 },
      );

      const content = response.content?.trim() || '{}';
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        const objMatch = content.match(/\{[\s\S]*\}/);
        if (objMatch) {
          const parsed = JSON.parse(objMatch[0]);
          const arr = parsed.results || parsed.decisions || parsed.items || Object.values(parsed).find(Array.isArray);
          if (Array.isArray(arr)) {
            return this.applyScores(results, arr, query, options?.maxResults, minScore);
          }
        }
        logger.warn('[SearchResultFilter] Could not parse LLM response, returning unfiltered');
        return { filtered: results, original_count: originalCount, filtered_count: originalCount };
      }

      const scored: Array<{ doc_id: number; score: number }> = JSON.parse(jsonMatch[0]);
      return this.applyScores(results, scored, query, options?.maxResults, minScore);
    } catch (err: any) {
      logger.warn('[SearchResultFilter] Filtering failed, returning unfiltered', { error: err.message });
      return { filtered: results, original_count: originalCount, filtered_count: originalCount };
    }
  }

  private applyScores(
    results: any[],
    scored: Array<{ doc_id: number; score: number }>,
    query: string,
    maxResults?: number,
    minScore: number = MIN_SCORE,
  ): { filtered: any[]; original_count: number; filtered_count: number } {
    const scoreMap = new Map<number, number>();
    for (const s of scored) {
      if (typeof s.doc_id === 'number' && typeof s.score === 'number') {
        scoreMap.set(s.doc_id, s.score);
      }
    }

    const filtered = results
      .filter(r => {
        const score = scoreMap.get(r.doc_id);
        return score !== undefined && score >= minScore;
      })
      .sort((a, b) => (scoreMap.get(b.doc_id) || 0) - (scoreMap.get(a.doc_id) || 0));

    const final = maxResults ? filtered.slice(0, maxResults) : filtered;

    if (final.length < results.length) {
      logger.info('[SearchResultFilter] Filtered results', {
        query: query.slice(0, 80),
        original: results.length,
        afterFilter: final.length,
        removed: results.length - final.length,
      });
    }

    return {
      filtered: final.map(r => ({ ...r, relevance_score: scoreMap.get(r.doc_id) })),
      original_count: results.length,
      filtered_count: final.length,
    };
  }
}
