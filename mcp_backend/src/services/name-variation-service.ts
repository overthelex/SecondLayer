/**
 * NameVariationService — generates Ukrainian transliteration/spelling
 * variants of company names using a quick LLM call.
 *
 * Used when openreyestr_search_entities returns no results for the
 * original query, to retry with plausible alternative spellings.
 */

import { logger } from '../utils/logger.js';
import type { ILLMPort } from '../domain/ports/index.js';

const NAME_VARIATION_PROMPT = `Ти — експерт з українського правопису та транслітерації. Користувач шукає назву компанії в державному реєстрі, але пошук не дав результатів.

Згенеруй 3-7 альтернативних варіантів написання назви компанії, враховуючи:
- Транслітерація з англійської: AI → ЕйАй / ЕйАі / Ей Ай / АІ / Ей-Ай
- Плутанина Е/Є, І/И, Ї/І, Э/Е (російська vs українська)
- Пробіли та дефіси: ЕйАй vs Ей Ай vs Ей-Ай
- Скорочення та розшифровки: IT → ІТ / Ай-Ті / Айті
- Великі/малі літери в абревіатурах
- Можливі помилки при реєстрації (подвоєння, пропуск літер)
- Латиниця vs кирилиця в назві (якщо є латинські літери)

ВАЖЛИВО: НЕ включай оригінальну назву у список варіантів. Генеруй ТІЛЬКИ альтернативні варіанти.
ВАЖЛИВО: НЕ додавай організаційно-правову форму (ТОВ, ПАТ, ПП тощо) до варіантів, якщо її немає в оригіналі.

Поверни ТІЛЬКИ валідний JSON:
{ "variations": ["варіант1", "варіант2", ...] }`;

export class NameVariationService {
  constructor(private llm: ILLMPort) {}

  /**
   * Generate alternative spellings for a company name.
   * Returns empty array on LLM failure (graceful degradation).
   */
  async generateVariations(companyName: string): Promise<string[]> {
    // Skip for very short queries or numeric-only (EDRPOU codes)
    if (!companyName || companyName.length < 3 || /^\d+$/.test(companyName.trim())) {
      return [];
    }

    try {
      const response = await this.llm.chatCompletion(
        {
          messages: [
            { role: 'system', content: NAME_VARIATION_PROMPT },
            { role: 'user', content: `Назва компанії: "${companyName}"` },
          ],
          max_tokens: 300,
          temperature: 0.3,
          response_format: { type: 'json_object' },
        },
        'quick'
      );

      const content = response.content || '{}';
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return [];

      const parsed = JSON.parse(jsonMatch[0]);
      const variations = Array.isArray(parsed.variations) ? parsed.variations : [];

      // Filter: remove duplicates, the original query, and non-strings
      const normalized = companyName.toLowerCase().trim();
      const seen = new Set<string>([normalized]);
      const result: string[] = [];

      for (const v of variations) {
        if (typeof v !== 'string' || !v.trim()) continue;
        const key = v.toLowerCase().trim();
        if (!seen.has(key)) {
          seen.add(key);
          result.push(v.trim());
        }
      }

      logger.info('[NameVariationService] Generated variations', {
        original: companyName,
        count: result.length,
        variations: result,
      });

      return result;
    } catch (err: any) {
      logger.warn('[NameVariationService] Failed to generate variations', {
        error: err.message,
        companyName,
      });
      return [];
    }
  }
}
