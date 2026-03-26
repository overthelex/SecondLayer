/**
 * Tests for IntentClassifier — query classification & routing for chat pipeline.
 *
 * Covers:
 * - LLM-based intent classification with mocked LLM responses
 * - Regex safety nets (case numbers, EDRPOU, legislation refs, etc.)
 * - Slot extraction and domain coercion
 * - queryType coercion from legal_consultation to specific types
 * - Unsupported query detection
 * - Tool filtering based on classified domains
 * - Fallback to QueryPlanner when LLM fails
 * - Budget/model selection via QueryTypeConfig
 */

import { IntentClassifier } from '../chat-intent-classifier';
import {
  DOMAIN_TOOL_MAP,
  DEFAULT_TOOLS,
  VALID_QUERY_TYPES,
  type QueryType,
  type ChatIntentClassification,
} from '../../prompts/chat-system-prompt';
import { QUERY_TYPE_CONFIG } from '../../prompts/query-type-config';
import type { ToolRegistry, ToolDefinition } from '../../api/tool-registry';
import type { QueryPlanner } from '../query-planner';
import type { ILLMPort, LLMResponse, BudgetLevel, LLMProvider } from '../../domain/ports/llm';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeLLMResponse(content: string, overrides?: Partial<LLMResponse>): LLMResponse {
  return {
    model: 'gpt-4o-mini',
    provider: 'openai' as LLMProvider,
    content,
    usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
    finish_reason: 'stop',
    ...overrides,
  };
}

function createMockLLM(responseContent: string): ILLMPort {
  return {
    chatCompletion: jest.fn().mockResolvedValue(makeLLMResponse(responseContent)),
    chatCompletionStream: jest.fn(),
    isAvailable: jest.fn().mockReturnValue(true),
    setCostTracker: jest.fn(),
  };
}

function createMockToolRegistry(toolNames: string[]): ToolRegistry {
  const defs: ToolDefinition[] = toolNames.map((name) => ({
    name,
    description: `Mock tool: ${name}`,
    inputSchema: {},
  }));
  return {
    getAllToolDefinitions: jest.fn().mockResolvedValue(defs),
  } as unknown as ToolRegistry;
}

function createMockQueryPlanner(domains: string[] = ['court'], slots: Record<string, any> = {}): QueryPlanner {
  return {
    classifyIntent: jest.fn().mockResolvedValue({
      intent: 'fallback',
      confidence: 0.5,
      domains,
      required_entities: [],
      sections: [],
      reasoning_budget: 'quick',
      slots,
    }),
  } as unknown as QueryPlanner;
}

/** All tool names from DOMAIN_TOOL_MAP plus DEFAULT_TOOLS for a complete registry */
function allToolNames(): string[] {
  const names = new Set<string>(DEFAULT_TOOLS);
  for (const tools of Object.values(DOMAIN_TOOL_MAP)) {
    for (const t of tools) names.add(t);
  }
  return Array.from(names);
}

function buildClassifier(
  llmResponseJson: Record<string, any>,
  opts?: {
    toolNames?: string[];
    queryPlannerDomains?: string[];
    queryPlannerSlots?: Record<string, any>;
  }
): {
  classifier: IntentClassifier;
  llm: ILLMPort;
  toolRegistry: ToolRegistry;
  queryPlanner: QueryPlanner;
} {
  const llm = createMockLLM(JSON.stringify(llmResponseJson));
  const toolRegistry = createMockToolRegistry(opts?.toolNames ?? allToolNames());
  const queryPlanner = createMockQueryPlanner(
    opts?.queryPlannerDomains ?? ['court'],
    opts?.queryPlannerSlots ?? {}
  );
  const classifier = new IntentClassifier(toolRegistry, queryPlanner, llm);
  return { classifier, llm, toolRegistry, queryPlanner };
}

// ─── Test suites ─────────────────────────────────────────────────────────────

describe('IntentClassifier', () => {

  // ─── classify(): LLM-based classification ─────────────────────────────────

  describe('classify() — LLM-based classification', () => {

    it('should classify a court practice query', async () => {
      const { classifier } = buildClassifier({
        domains: ['court'],
        keywords: 'судова практика виселення іпотечне майно',
        queryType: 'practice_analysis',
      });

      const result = await classifier.classify('Яка практика щодо виселення з іпотечного майна?');

      expect(result.domains).toContain('court');
      expect(result.queryType).toBe('practice_analysis');
      expect(result.keywords).toBe('судова практика виселення іпотечне майно');
    });

    it('should classify a legislation lookup query', async () => {
      const { classifier } = buildClassifier({
        domains: ['legislation'],
        keywords: 'стаття 16 цивільний кодекс',
        queryType: 'legislation_lookup',
        slots: { law_reference: 'ст. 16 ЦК' },
      });

      const result = await classifier.classify('Що каже ст. 16 ЦК?');

      expect(result.domains).toContain('legislation');
      expect(result.queryType).toBe('legislation_lookup');
      expect(result.slots?.law_reference).toBe('ст. 16 ЦК');
    });

    it('should classify a registry lookup with EDRPOU', async () => {
      const { classifier } = buildClassifier({
        domains: ['registry'],
        keywords: 'ЄДРПОУ компанія',
        queryType: 'registry_lookup',
        slots: { edrpou: '12345678' },
      });

      const result = await classifier.classify('Інформація про компанію з ЄДРПОУ 12345678');

      expect(result.domains).toContain('registry');
      expect(result.queryType).toBe('registry_lookup');
      expect(result.slots?.edrpou).toBe('12345678');
    });

    it('should classify a case lookup with case number', async () => {
      const { classifier } = buildClassifier({
        domains: ['court'],
        keywords: 'справа рішення',
        queryType: 'case_lookup',
        slots: { case_number: '922/989/18' },
      });

      const result = await classifier.classify('Покажи рішення у справі 922/989/18');

      expect(result.domains).toContain('court');
      expect(result.queryType).toBe('case_lookup');
      expect(result.slots?.case_number).toBe('922/989/18');
    });

    it('should classify parliament query', async () => {
      const { classifier } = buildClassifier({
        domains: ['parliament'],
        keywords: 'депутат Шевченко',
        queryType: 'parliament_query',
      });

      const result = await classifier.classify('Хто такий депутат Шевченко?');

      expect(result.domains).toContain('parliament');
      expect(result.queryType).toBe('parliament_query');
    });

    it('should classify document/vault query', async () => {
      const { classifier } = buildClassifier({
        domains: ['documents'],
        keywords: 'мої документи оренда',
        queryType: 'document_query',
      });

      const result = await classifier.classify('Що в моїх документах про оренду?');

      expect(result.domains).toContain('documents');
      expect(result.queryType).toBe('document_query');
    });

    it('should classify multi-domain query', async () => {
      const { classifier } = buildClassifier({
        domains: ['court', 'legislation'],
        keywords: 'стягнення аліментів практика',
        queryType: 'legal_consultation',
      });

      const result = await classifier.classify('Як стягнути аліменти? Яка практика і законодавство?');

      expect(result.domains).toContain('court');
      expect(result.domains).toContain('legislation');
    });

    it('should default domains to ["court"] when LLM returns empty array', async () => {
      const { classifier } = buildClassifier({
        domains: [],
        keywords: 'test',
        queryType: 'legal_consultation',
      });

      const result = await classifier.classify('test query');

      expect(result.domains).toContain('court');
    });

    it('should use query as keywords when LLM returns non-string keywords', async () => {
      const { classifier } = buildClassifier({
        domains: ['court'],
        keywords: 12345, // non-string
        queryType: 'practice_analysis',
      });

      const query = 'моя тестова фраза';
      const result = await classifier.classify(query);

      expect(result.keywords).toBe(query);
    });
  });

  // ─── classify(): Slot-based domain coercion ───────────────────────────────

  describe('classify() — slot-based domain coercion', () => {

    it('should add "registry" domain when edrpou slot is present but domain missing', async () => {
      const { classifier } = buildClassifier({
        domains: ['court'],
        keywords: 'test',
        queryType: 'legal_consultation',
        slots: { edrpou: '99999999' },
      });

      const result = await classifier.classify('Перевірити компанію 99999999');

      expect(result.domains).toContain('registry');
      expect(result.domains).toContain('court');
    });

    it('should add "court" domain when case_number slot is present but domain missing', async () => {
      const { classifier } = buildClassifier({
        domains: ['legislation'],
        keywords: 'test',
        queryType: 'legal_consultation',
        slots: { case_number: '757/123/22' },
      });

      const result = await classifier.classify('Справа 757/123/22');

      expect(result.domains).toContain('court');
      expect(result.domains).toContain('legislation');
    });

    it('should add "legislation" domain when law_reference slot is present but domain missing', async () => {
      const { classifier } = buildClassifier({
        domains: ['court'],
        keywords: 'test',
        queryType: 'legal_consultation',
        slots: { law_reference: 'ст. 16 ЦК' },
      });

      const result = await classifier.classify('Як застосовується ст. 16 ЦК в судовій практиці?');

      expect(result.domains).toContain('legislation');
      expect(result.domains).toContain('court');
    });
  });

  // ─── classify(): Regex safety nets ────────────────────────────────────────

  describe('classify() — regex safety nets', () => {

    it('should extract case_number from query when LLM misses it', async () => {
      const { classifier } = buildClassifier({
        domains: ['court'],
        keywords: 'test',
        queryType: 'legal_consultation',
        slots: {}, // no case_number
      });

      const result = await classifier.classify('Рішення у справі 922/989/18');

      expect(result.slots?.case_number).toBe('922/989/18');
    });

    it('should add registry domain for query containing ТОВ keyword', async () => {
      const { classifier } = buildClassifier({
        domains: ['court'],
        keywords: 'test',
        queryType: 'legal_consultation',
      });

      const result = await classifier.classify('Знайди інформацію про ТОВ "Нова Пошта"');

      expect(result.domains).toContain('registry');
    });

    it('should add registry domain for query containing 8-digit EDRPOU pattern', async () => {
      const { classifier } = buildClassifier({
        domains: ['court'],
        keywords: 'test',
        queryType: 'legal_consultation',
      });

      const result = await classifier.classify('Перевір компанію 12345678');

      expect(result.domains).toContain('registry');
    });

    it('should add registry domain for query containing "єдрпоу" keyword', async () => {
      const { classifier } = buildClassifier({
        domains: ['court'],
        keywords: 'test',
        queryType: 'legal_consultation',
      });

      const result = await classifier.classify('Перевірити єдрпоу організації');

      expect(result.domains).toContain('registry');
    });

    it('should add documents domain for vault keyword', async () => {
      const { classifier } = buildClassifier({
        domains: ['court'],
        keywords: 'test',
        queryType: 'legal_consultation',
      });

      const result = await classifier.classify('Що в моїх документах зі сховища?');

      expect(result.domains).toContain('documents');
    });

    it('should add documents domain for "мої документи" keyword', async () => {
      const { classifier } = buildClassifier({
        domains: ['court'],
        keywords: 'test',
        queryType: 'legal_consultation',
      });

      const result = await classifier.classify('Покажи мої документи');

      expect(result.domains).toContain('documents');
    });

    it('should add documents domain for "завантажив" keyword', async () => {
      const { classifier } = buildClassifier({
        domains: ['court'],
        keywords: 'test',
        queryType: 'legal_consultation',
      });

      const result = await classifier.classify('Що я завантажив раніше?');

      expect(result.domains).toContain('documents');
    });

    it('should add registry domain for ФОП keyword', async () => {
      const { classifier } = buildClassifier({
        domains: ['court'],
        keywords: 'test',
        queryType: 'legal_consultation',
      });

      const result = await classifier.classify('Знайди ФОП Іваненко');

      expect(result.domains).toContain('registry');
    });
  });

  // ─── classify(): queryType coercions ──────────────────────────────────────

  describe('classify() — queryType coercions', () => {

    it('should coerce legal_consultation to case_lookup when case_number slot present', async () => {
      const { classifier } = buildClassifier({
        domains: ['court'],
        keywords: 'test',
        queryType: 'legal_consultation',
        slots: { case_number: '922/989/18' },
      });

      const result = await classifier.classify('Рішення у справі 922/989/18');

      expect(result.queryType).toBe('case_lookup');
    });

    it('should coerce legal_consultation to registry_lookup when edrpou slot present', async () => {
      const { classifier } = buildClassifier({
        domains: ['registry'],
        keywords: 'test',
        queryType: 'legal_consultation',
        slots: { edrpou: '12345678' },
      });

      const result = await classifier.classify('ЄДРПОУ 12345678');

      expect(result.queryType).toBe('registry_lookup');
    });

    it('should coerce legal_consultation to legislation_lookup when law_reference slot present', async () => {
      const { classifier } = buildClassifier({
        domains: ['legislation'],
        keywords: 'test',
        queryType: 'legal_consultation',
        slots: { law_reference: 'ст. 382 КК' },
      });

      const result = await classifier.classify('Що каже ст. 382 КК?');

      expect(result.queryType).toBe('legislation_lookup');
    });

    it('should coerce to legislation_lookup by regex when query contains "ст. N"', async () => {
      const { classifier } = buildClassifier({
        domains: ['legislation'],
        keywords: 'test',
        queryType: 'legal_consultation',
        // No slots — LLM missed the law reference
      });

      const result = await classifier.classify('Яка ст. 16 ЦК?');

      expect(result.queryType).toBe('legislation_lookup');
    });

    it('should coerce to legislation_lookup by regex when query mentions code abbreviations (ЦК, КК, ГПК)', async () => {
      const { classifier } = buildClassifier({
        domains: ['legislation'],
        keywords: 'test',
        queryType: 'legal_consultation',
      });

      const result = await classifier.classify('Що каже ЦК про це?');

      expect(result.queryType).toBe('legislation_lookup');
    });

    it('should coerce to registry_lookup by regex when query contains 8-digit code', async () => {
      const { classifier } = buildClassifier({
        domains: ['court'],
        keywords: 'test',
        queryType: 'legal_consultation',
      });

      const result = await classifier.classify('Перевір компанію 12345678');

      expect(result.queryType).toBe('registry_lookup');
    });

    it('should coerce to practice_analysis for "аналіз практики" queries', async () => {
      const { classifier } = buildClassifier({
        domains: ['court'],
        keywords: 'test',
        queryType: 'legal_consultation',
      });

      const result = await classifier.classify('Проаналізуй судову практику щодо оренди');

      expect(result.queryType).toBe('practice_analysis');
    });

    it('should coerce to practice_analysis for "як суди" queries', async () => {
      const { classifier } = buildClassifier({
        domains: ['court'],
        keywords: 'test',
        queryType: 'legal_consultation',
      });

      const result = await classifier.classify('Як суди вирішують спори про оренду?');

      expect(result.queryType).toBe('practice_analysis');
    });

    it('should accept document_drafting when LLM classifies it directly', async () => {
      // The document_drafting regex uses \\b which does not work with Unicode,
      // so the LLM must classify it directly rather than relying on regex coercion.
      const { classifier } = buildClassifier({
        domains: ['court'],
        keywords: 'позовна заява стягнення боргу',
        queryType: 'document_drafting',
      });

      const result = await classifier.classify('Напиши позовну заяву про стягнення боргу');

      expect(result.queryType).toBe('document_drafting');
    });

    it('should coerce to document_drafting for Ukrainian drafting queries via regex', async () => {
      // Fixed: replaced \\b with (?:^|\\s) to support Unicode word boundaries
      const { classifier } = buildClassifier({
        domains: ['court'],
        keywords: 'test',
        queryType: 'legal_consultation',
      });

      const result = await classifier.classify('Напиши позовну заяву про стягнення боргу');

      expect(result.queryType).toBe('document_drafting');
    });

    it('should coerce to due_diligence for "перевір контрагента" queries', async () => {
      const { classifier } = buildClassifier({
        domains: ['registry'],
        keywords: 'test',
        queryType: 'legal_consultation',
      });

      const result = await classifier.classify('Перевір контрагента ТОВ Партнер');

      expect(result.queryType).toBe('due_diligence');
    });

    it('should coerce to due_diligence for "due diligence" queries', async () => {
      const { classifier } = buildClassifier({
        domains: ['registry'],
        keywords: 'test',
        queryType: 'legal_consultation',
      });

      const result = await classifier.classify('due diligence компанії');

      expect(result.queryType).toBe('due_diligence');
    });

    it('should coerce to parliament_query when parliament domain is present', async () => {
      const { classifier } = buildClassifier({
        domains: ['parliament'],
        keywords: 'test',
        queryType: 'legal_consultation',
      });

      const result = await classifier.classify('Депутат Іваненко голосування');

      expect(result.queryType).toBe('parliament_query');
    });

    it('should coerce to document_query when documents domain is present', async () => {
      const { classifier } = buildClassifier({
        domains: ['documents'],
        keywords: 'test',
        queryType: 'legal_consultation',
      });

      const result = await classifier.classify('Мої завантажені документи');

      expect(result.queryType).toBe('document_query');
    });

    it('should coerce to comparative_analysis for comparison queries', async () => {
      const { classifier } = buildClassifier({
        domains: ['court'],
        keywords: 'test',
        queryType: 'legal_consultation',
      });

      const result = await classifier.classify('Який спосіб захисту обрати при позові?');

      expect(result.queryType).toBe('comparative_analysis');
    });

    it('should coerce to unsupported for non-legal queries (weather)', async () => {
      const { classifier } = buildClassifier({
        domains: ['court'],
        keywords: 'test',
        queryType: 'legal_consultation',
      });

      const result = await classifier.classify('Яка погода в Києві?');

      expect(result.queryType).toBe('unsupported');
      expect(result.unsupportedReason).toBeDefined();
    });

    it('should coerce to institutional_analysis for judge statistics queries', async () => {
      const { classifier } = buildClassifier({
        domains: ['court'],
        keywords: 'test',
        queryType: 'legal_consultation',
      });

      const result = await classifier.classify('Рейтинг суддів за відсотком задоволених позовів');

      expect(result.queryType).toBe('institutional_analysis');
    });

    it('should coerce to institutional_analysis for judge statistics even if LLM defaulted to legal_consultation', async () => {
      const { classifier } = buildClassifier({
        domains: ['court'],
        keywords: 'test',
        queryType: 'legal_consultation',
      });

      const result = await classifier.classify('Статистика суддів по задоволеним позовам');

      expect(result.queryType).toBe('institutional_analysis');
    });

    it('should preserve LLM queryType when not legal_consultation', async () => {
      const { classifier } = buildClassifier({
        domains: ['court'],
        keywords: 'test',
        queryType: 'practice_analysis',
      });

      // Even though query has ст. references, since LLM already classified as
      // practice_analysis, it should NOT be overridden to legislation_lookup
      const result = await classifier.classify('Як суди тлумачать ст. 16 ЦК?');

      expect(result.queryType).toBe('practice_analysis');
    });
  });

  // ─── classify(): unsupportedReason handling ───────────────────────────────

  describe('classify() — unsupportedReason', () => {

    it('should use LLM-provided unsupportedReason', async () => {
      const { classifier } = buildClassifier({
        domains: ['court'],
        keywords: 'test',
        queryType: 'unsupported',
        unsupportedReason: 'Запит не пов\'язаний з правом',
      });

      const result = await classifier.classify('Рецепт борщу');

      expect(result.queryType).toBe('unsupported');
      expect(result.unsupportedReason).toBe('Запит не пов\'язаний з правом');
    });

    it('should generate default unsupportedReason when LLM does not provide one', async () => {
      const { classifier } = buildClassifier({
        domains: ['court'],
        keywords: 'test',
        queryType: 'unsupported',
        // no unsupportedReason
      });

      const result = await classifier.classify('Яка погода в Києві?');

      // The regex catches weather queries, sets unsupported, then generates a default reason
      expect(result.queryType).toBe('unsupported');
      expect(result.unsupportedReason).toBeTruthy();
      expect(result.unsupportedReason).toContain('SecondLayer');
    });
  });

  // ─── classify(): JSON extraction ──────────────────────────────────────────

  describe('classify() — JSON extraction from LLM response', () => {

    it('should extract JSON wrapped in markdown code blocks', async () => {
      const llm = createMockLLM('```json\n{"domains":["court"],"keywords":"test","queryType":"case_lookup","slots":{"case_number":"123/456/78"}}\n```');
      const classifier = new IntentClassifier(
        createMockToolRegistry(allToolNames()),
        createMockQueryPlanner(),
        llm
      );

      const result = await classifier.classify('Справа 123/456/78');

      expect(result.domains).toContain('court');
      expect(result.queryType).toBe('case_lookup');
    });

    it('should handle empty slots object', async () => {
      const { classifier } = buildClassifier({
        domains: ['court'],
        keywords: 'test',
        queryType: 'practice_analysis',
        slots: {},
      });

      const result = await classifier.classify('Судова практика');

      expect(result.slots).toBeUndefined();
    });

    it('should handle null slots', async () => {
      const { classifier } = buildClassifier({
        domains: ['court'],
        keywords: 'test',
        queryType: 'practice_analysis',
        slots: null,
      });

      const result = await classifier.classify('Судова практика');

      expect(result.slots).toBeUndefined();
    });
  });

  // ─── classify(): Fallback to QueryPlanner ─────────────────────────────────

  describe('classify() — fallback to QueryPlanner', () => {

    it('should fall back to QueryPlanner when LLM returns non-JSON', async () => {
      const llm = createMockLLM('This is not JSON at all');
      const queryPlanner = createMockQueryPlanner(['legislation'], { law_reference: 'ст. 5 ЦК' });
      const classifier = new IntentClassifier(
        createMockToolRegistry(allToolNames()),
        queryPlanner,
        llm
      );

      const result = await classifier.classify('Текст ст. 5 ЦК');

      expect(queryPlanner.classifyIntent).toHaveBeenCalledWith('Текст ст. 5 ЦК', 'quick');
      expect(result.domains).toContain('legislation');
      expect(result.queryType).toBe('legal_consultation'); // fallback always returns legal_consultation
    });

    it('should fall back to QueryPlanner when LLM throws', async () => {
      const llm: ILLMPort = {
        chatCompletion: jest.fn().mockRejectedValue(new Error('LLM timeout')),
        chatCompletionStream: jest.fn(),
        isAvailable: jest.fn().mockReturnValue(true),
        setCostTracker: jest.fn(),
      };
      const queryPlanner = createMockQueryPlanner(['court']);
      const classifier = new IntentClassifier(
        createMockToolRegistry(allToolNames()),
        queryPlanner,
        llm
      );

      const result = await classifier.classify('Будь-який запит');

      expect(queryPlanner.classifyIntent).toHaveBeenCalled();
      expect(result.queryType).toBe('legal_consultation');
    });

    it('should extract case_number in fallback path', async () => {
      const llm: ILLMPort = {
        chatCompletion: jest.fn().mockRejectedValue(new Error('fail')),
        chatCompletionStream: jest.fn(),
        isAvailable: jest.fn().mockReturnValue(true),
        setCostTracker: jest.fn(),
      };
      const queryPlanner = createMockQueryPlanner(['court'], {});
      const classifier = new IntentClassifier(
        createMockToolRegistry(allToolNames()),
        queryPlanner,
        llm
      );

      const result = await classifier.classify('Справа 922/989/18');

      expect(result.slots?.case_number).toBe('922/989/18');
    });
  });

  // ─── classify(): Cost recording ───────────────────────────────────────────

  describe('classify() — cost recording', () => {

    it('should record cost when requestId and costRecorder are provided', async () => {
      const llm = createMockLLM(JSON.stringify({
        domains: ['court'],
        keywords: 'test',
        queryType: 'practice_analysis',
      }));
      const costRecorder = {
        recordStreamingCost: jest.fn(),
      };
      const classifier = new IntentClassifier(
        createMockToolRegistry(allToolNames()),
        createMockQueryPlanner(),
        llm,
        costRecorder
      );

      await classifier.classify('test', 'req-123');

      expect(costRecorder.recordStreamingCost).toHaveBeenCalledWith(
        'req-123',
        'openai',
        'gpt-4o-mini',
        expect.objectContaining({ prompt_tokens: 100, completion_tokens: 50 }),
        'intent_classification'
      );
    });

    it('should not record cost when requestId is missing', async () => {
      const llm = createMockLLM(JSON.stringify({
        domains: ['court'],
        keywords: 'test',
        queryType: 'practice_analysis',
      }));
      const costRecorder = {
        recordStreamingCost: jest.fn(),
      };
      const classifier = new IntentClassifier(
        createMockToolRegistry(allToolNames()),
        createMockQueryPlanner(),
        llm,
        costRecorder
      );

      await classifier.classify('test'); // no requestId

      expect(costRecorder.recordStreamingCost).not.toHaveBeenCalled();
    });
  });

  // ─── filterTools() ────────────────────────────────────────────────────────

  describe('filterTools()', () => {

    it('should return default tools + meta-tool when domains is empty', async () => {
      const toolNames = allToolNames();
      const { classifier } = buildClassifier({}, { toolNames });

      // Pass empty domains - should still return at least DEFAULT_TOOLS + request_additional_tools
      const filtered = await classifier.filterTools([]);

      const defaultSet = new Set([...DEFAULT_TOOLS, 'request_additional_tools']);
      for (const tool of filtered) {
        expect(defaultSet.has(tool.name)).toBe(true);
      }
    });

    it('should include court tools for court domain', async () => {
      const toolNames = allToolNames();
      const { classifier } = buildClassifier({}, { toolNames });

      const filtered = await classifier.filterTools(['court']);
      const filteredNames = filtered.map((d) => d.name);

      // Key court tools should be included (from tool groups or DOMAIN_TOOL_MAP)
      expect(filteredNames).toContain('search_legal_precedents');
      expect(filteredNames).toContain('get_court_decision');
      // Meta-tool should always be present
      expect(filteredNames).toContain('request_additional_tools');
    });

    it('should include registry tools for registry domain', async () => {
      const toolNames = allToolNames();
      const { classifier } = buildClassifier({}, { toolNames });

      const filtered = await classifier.filterTools(['registry']);
      const filteredNames = filtered.map((d) => d.name);

      // At least some registry tools should be present
      const registryTools = DOMAIN_TOOL_MAP.registry || [];
      const hasRegistryTool = registryTools.some((t) => filteredNames.includes(t));
      expect(hasRegistryTool).toBe(true);
    });

    it('should include all registry tools when edrpou slot is present', async () => {
      const toolNames = allToolNames();
      const { classifier } = buildClassifier({}, { toolNames });

      const filtered = await classifier.filterTools(['court'], { edrpou: '12345678' });
      const filteredNames = filtered.map((d) => d.name);

      const registryTools = DOMAIN_TOOL_MAP.registry || [];
      // With edrpou slot, all registry tools should be in the relevant set
      // (may be capped at 15, but at least some should be there)
      const hasRegistryTool = registryTools.some((t) => filteredNames.includes(t));
      expect(hasRegistryTool).toBe(true);
    });

    it('should cap tools at 15', async () => {
      const toolNames = allToolNames();
      const { classifier } = buildClassifier({}, { toolNames });

      // Request all domains to get maximum tools
      const filtered = await classifier.filterTools(['court', 'legislation', 'registry', 'parliament', 'documents']);

      expect(filtered.length).toBeLessThanOrEqual(15);
    });

    it('should only return tools that exist in the registry plus meta-tool', async () => {
      // Registry with limited tools
      const { classifier } = buildClassifier({}, {
        toolNames: ['search_legal_precedents', 'get_court_decision'],
      });

      const filtered = await classifier.filterTools(['court']);
      const filteredNames = filtered.map((d) => d.name);

      // Should only contain tools from registry + the virtual meta-tool
      for (const name of filteredNames) {
        expect(['search_legal_precedents', 'get_court_decision', 'request_additional_tools']).toContain(name);
      }
    });

    it('should fall back to legal_advice tools when no domain matches', async () => {
      const toolNames = allToolNames();
      const { classifier } = buildClassifier({}, { toolNames });

      // Use a non-existent domain — no tools from DOMAIN_TOOL_MAP will be added
      const filtered = await classifier.filterTools(['nonexistent_domain']);
      const filteredNames = filtered.map((d) => d.name);

      // Should have legal_advice fallback tools plus defaults
      const legalAdviceTools = DOMAIN_TOOL_MAP.legal_advice || [];
      const hasLegalAdviceTool = legalAdviceTools.some((t) => filteredNames.includes(t));
      expect(hasLegalAdviceTool).toBe(true);
    });
  });

  // ─── LLM call parameters ─────────────────────────────────────────────────

  describe('LLM call parameters', () => {

    it('should use "quick" budget tier for classification', async () => {
      const { classifier, llm } = buildClassifier({
        domains: ['court'],
        keywords: 'test',
        queryType: 'practice_analysis',
      });

      await classifier.classify('test query');

      expect(llm.chatCompletion).toHaveBeenCalledWith(
        expect.objectContaining({
          max_tokens: 300,
          temperature: 0.1,
          response_format: { type: 'json_object' },
        }),
        'quick'
      );
    });
  });
});

// ─── QueryTypeConfig tests ──────────────────────────────────────────────────

describe('QueryTypeConfig', () => {

  it('should have config for all valid query types', () => {
    for (const qt of VALID_QUERY_TYPES) {
      expect(QUERY_TYPE_CONFIG).toHaveProperty(qt);
    }
  });

  it('should have a budget for every query type', () => {
    for (const [qt, config] of Object.entries(QUERY_TYPE_CONFIG)) {
      expect(['quick', 'standard', 'deep']).toContain(config.defaultBudget);
    }
  });

  it('practice_analysis should use deep budget', () => {
    expect(QUERY_TYPE_CONFIG.practice_analysis.defaultBudget).toBe('deep');
  });

  it('comparative_analysis should use deep budget', () => {
    expect(QUERY_TYPE_CONFIG.comparative_analysis.defaultBudget).toBe('deep');
  });

  it('legislation_lookup should use quick budget', () => {
    expect(QUERY_TYPE_CONFIG.legislation_lookup.defaultBudget).toBe('quick');
  });

  it('registry_lookup should use quick budget', () => {
    expect(QUERY_TYPE_CONFIG.registry_lookup.defaultBudget).toBe('quick');
  });

  it('case_lookup should use standard budget', () => {
    expect(QUERY_TYPE_CONFIG.case_lookup.defaultBudget).toBe('standard');
  });

  it('unsupported should not require grounding', () => {
    expect(QUERY_TYPE_CONFIG.unsupported.requiresGrounding).toBe(false);
  });

  it('all non-unsupported types should require grounding', () => {
    for (const [qt, config] of Object.entries(QUERY_TYPE_CONFIG)) {
      if (qt !== 'unsupported') {
        expect(config.requiresGrounding).toBe(true);
      }
    }
  });

  it('each type should have a thinkingPrefix (except unsupported)', () => {
    for (const [qt, config] of Object.entries(QUERY_TYPE_CONFIG)) {
      if (qt !== 'unsupported') {
        expect(config.thinkingPrefix.length).toBeGreaterThan(0);
      }
    }
  });

  it('each type should have preferredScenarios (except unsupported)', () => {
    for (const [qt, config] of Object.entries(QUERY_TYPE_CONFIG)) {
      if (qt !== 'unsupported') {
        expect(config.preferredScenarios.length).toBeGreaterThan(0);
      }
    }
  });
});

// ─── DOMAIN_TOOL_MAP tests ──────────────────────────────────────────────────

describe('DOMAIN_TOOL_MAP', () => {

  it('should have entries for all expected domains', () => {
    const expectedDomains = ['court', 'legislation', 'registry', 'parliament', 'documents', 'legal_advice'];
    for (const domain of expectedDomains) {
      expect(DOMAIN_TOOL_MAP).toHaveProperty(domain);
      expect(DOMAIN_TOOL_MAP[domain].length).toBeGreaterThan(0);
    }
  });

  it('court domain should include search_legal_precedents', () => {
    expect(DOMAIN_TOOL_MAP.court).toContain('search_legal_precedents');
  });

  it('legislation domain should include get_legislation_section', () => {
    expect(DOMAIN_TOOL_MAP.legislation).toContain('get_legislation_section');
  });

  it('registry domain should include openreyestr_get_by_edrpou', () => {
    expect(DOMAIN_TOOL_MAP.registry).toContain('openreyestr_get_by_edrpou');
  });

  it('parliament domain should include rada_ tools', () => {
    const parlTools = DOMAIN_TOOL_MAP.parliament;
    const hasRadaTool = parlTools.some((t) => t.startsWith('rada_'));
    expect(hasRadaTool).toBe(true);
  });
});

// ─── VALID_QUERY_TYPES tests ────────────────────────────────────────────────

describe('VALID_QUERY_TYPES', () => {

  it('should contain all 13 defined query types', () => {
    const expected: QueryType[] = [
      'case_lookup', 'practice_analysis', 'legislation_lookup', 'legal_consultation',
      'registry_lookup', 'parliament_query', 'document_query', 'calculation',
      'document_drafting', 'comparative_analysis', 'due_diligence', 'institutional_analysis',
      'unsupported',
    ];
    for (const qt of expected) {
      expect(VALID_QUERY_TYPES.has(qt)).toBe(true);
    }
    expect(VALID_QUERY_TYPES.size).toBe(13);
  });
});
