import { LegislationClassifier } from '../legislation-classifier';
import type { ILLMPort } from '../../domain/ports/index.js';

/**
 * Regression for the MSP IP-demo miss (2026-07-01): the quick-tier classifier returned
 * article_number as the literal string "null" ("майнові права автора" → 435-15 / "null"),
 * which downstream treated as a real article number and terminally failed with
 * "стаття не знайдена". The classifier must sanitize "null"-like strings to real null.
 * It also hallucinated rada_ids for the 4 IP laws because they were absent from
 * CODE_MAPPINGS — they must be present so the prompt grounds the LLM.
 */

function mockLLM(jsonResponse: object): ILLMPort {
  return {
    chatCompletion: jest.fn().mockResolvedValue({ content: JSON.stringify(jsonResponse) }),
    chatCompletionStream: jest.fn(),
    isAvailable: jest.fn().mockReturnValue(true),
    setCostTracker: jest.fn(),
  } as unknown as ILLMPort;
}

describe('LegislationClassifier normalization', () => {
  it('sanitizes literal "null" article_number to real null', async () => {
    const classifier = new LegislationClassifier(undefined, mockLLM({
      rada_id: '435-15',
      article_number: 'null',
      confidence: 0.75,
    }));

    const result = await classifier.classify('майнові права автора');
    expect(result.rada_id).toBe('435-15');
    expect(result.article_number).toBeNull();
  });

  it('sanitizes "None"/"undefined"/empty strings in both fields', async () => {
    for (const bad of ['None', 'undefined', '  ']) {
      const classifier = new LegislationClassifier(undefined, mockLLM({
        rada_id: bad,
        article_number: bad,
        confidence: 0.8,
      }));
      const result = await classifier.classify('запит');
      expect(result.rada_id).toBeNull();
      expect(result.article_number).toBeNull();
    }
  });

  it('keeps legitimate values untouched', async () => {
    const classifier = new LegislationClassifier(undefined, mockLLM({
      rada_id: '3689-12',
      article_number: '6',
      confidence: 0.95,
    }));

    const result = await classifier.classify('підстави відмови в реєстрації торговельної марки');
    expect(result.rada_id).toBe('3689-12');
    expect(result.article_number).toBe('6');
  });
});

describe('LegislationClassifier CODE_MAPPINGS covers the 4 IP laws', () => {
  const mappings = (new LegislationClassifier() as any).CODE_MAPPINGS as Record<
    string,
    { rada_id: string; full_name: string }
  >;
  const radaIds = new Set(Object.values(mappings).map(m => m.rada_id));

  it.each([
    ['3689-12', 'торговельні марки'],
    ['3687-12', 'винаходи і корисні моделі'],
    ['3688-12', 'промислові зразки'],
    ['2811-20', 'авторське право'],
  ])('includes %s (%s)', (radaId) => {
    expect(radaIds.has(radaId)).toBe(true);
  });
});
