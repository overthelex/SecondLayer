import { logger } from '../utils/logger.js';
import { withLLMRetry } from '../utils/llm-retry.js';
import type { ILLMPort } from '../domain/ports/index.js';

const REFORMULATION_PROMPT = `Ти — експерт з українського права та пошукових систем. Твоє завдання — переформулювати запит користувача для покращення пошуку в базі судових рішень.

Створи 2-3 альтернативних формулювання:
1. **semantic** — концептуальне перефразування для векторного пошуку (синоніми, ширший контекст, юридична термінологія)
2. **fts** — ключові юридичні терміни для повнотекстового пошуку (точні терміни з кодексів, статті, назви інститутів)
3. **expanded** (опціонально) — розширений запит з суміжними поняттями, якщо оригінальний запит вузький

ПРАВИЛА:
- Всі формулювання УКРАЇНСЬКОЮ мовою
- Використовуй офіційну юридичну термінологію (ЦК, ЦПК, КК, ПКУ тощо)
- Для fts: тільки ключові слова через пробіл (PostgreSQL plainto_tsquery)
- Не повторюй оригінальний запит дослівно
- Не додавай пояснень, тільки JSON

Поверни JSON:
{"semantic": "...", "fts": "...", "expanded": "..." або null}`;

const MIN_QUERY_LENGTH = 10;

export interface ReformulatedQueries {
  original: string;
  semantic: string;
  fts: string;
  expanded: string | null;
}

export class QueryReformulator {
  constructor(private readonly llm: ILLMPort) {}

  async reformulate(query: string): Promise<ReformulatedQueries> {
    const trimmed = query.trim();

    if (trimmed.length < MIN_QUERY_LENGTH) {
      return { original: trimmed, semantic: trimmed, fts: trimmed, expanded: null };
    }

    try {
      const response = await withLLMRetry(
        () => this.llm.chatCompletion(
          {
            messages: [
              { role: 'system', content: REFORMULATION_PROMPT },
              { role: 'user', content: trimmed },
            ],
            temperature: 0.2,
            max_tokens: 400,
            response_format: { type: 'json_object' },
          },
          'quick',
        ),
        { operationName: 'QueryReformulator.reformulate', timeoutMs: 8_000 },
      );

      const content = response.content?.trim() || '{}';
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return { original: trimmed, semantic: trimmed, fts: trimmed, expanded: null };
      }

      const parsed = JSON.parse(jsonMatch[0]);
      const result: ReformulatedQueries = {
        original: trimmed,
        semantic: typeof parsed.semantic === 'string' && parsed.semantic.trim() ? parsed.semantic.trim() : trimmed,
        fts: typeof parsed.fts === 'string' && parsed.fts.trim() ? parsed.fts.trim() : trimmed,
        expanded: typeof parsed.expanded === 'string' && parsed.expanded.trim() ? parsed.expanded.trim() : null,
      };

      logger.info('[QueryReformulator] Reformulated query', {
        original: trimmed.slice(0, 80),
        semantic: result.semantic.slice(0, 80),
        fts: result.fts.slice(0, 80),
      });

      return result;
    } catch (err: any) {
      logger.warn('[QueryReformulator] Reformulation failed, using original', { error: err.message });
      return { original: trimmed, semantic: trimmed, fts: trimmed, expanded: null };
    }
  }
}
