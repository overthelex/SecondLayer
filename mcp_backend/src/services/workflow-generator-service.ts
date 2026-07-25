/**
 * WorkflowGeneratorService — Uses LLM to generate structured workflows
 * from an institutional analysis query.
 *
 * Given a user query like "проаналізуй всі рішення суддів Оболонського суду за 15 років",
 * generates 3-7 concrete workflows with tool execution plans.
 */

import { logger } from '../utils/logger.js';
import { ToolRegistry, ToolDefinition } from '../api/tool-registry.js';
import type { ILLMPort } from '../domain/ports/index.js';
import type { ChatIntentClassification } from '../prompts/chat-system-prompt.js';

export interface GeneratedWorkflow {
  sequenceNumber: number;
  title: string;
  description: string;
  plan: {
    goal: string;
    steps: Array<{
      id: number;
      tool: string;
      params: Record<string, any>;
      purpose: string;
      depends_on?: number[];
    }>;
  };
}

export interface GeneratedWorkflowSet {
  title: string;
  description: string;
  workflows: GeneratedWorkflow[];
}

const WORKFLOW_GENERATION_PROMPT = `You are a workflow planner for SecondLayer legal AI assistant. Given a complex institutional analysis query, break it down into 3-7 independent workflows that can be executed sequentially or in parallel.

## Rules
1. Each workflow should be a self-contained analysis task with 1-5 tool steps
2. Workflows should cover different aspects of the analysis (e.g., case volume, topic distribution, appeal rates, key judges, temporal trends)
3. Use ONLY tools from the provided tool list
4. Each step must have concrete params (no placeholders)
5. Output valid JSON only — no markdown, no comments
6. All text (titles, descriptions, purposes) in Ukrainian
7. Each workflow's plan follows the same schema as execution plans: {goal, steps[{id, tool, params, purpose, depends_on}]}

## Available analysis patterns
- **Case volume**: Use search_legal_precedents or count_cases_by_party with different filters
- **Topic distribution**: Multiple search_legal_precedents calls with different legal topics
- **Appeal statistics**: Use get_case_documents_chain to trace appeal chains
- **Temporal trends**: Use search_legal_precedents with date_from/date_to filters for different periods
- **Key precedents**: Use search_legal_precedents with court_level filter to find binding decisions
- **Legislation basis**: Use search_legislation for legal framework

## JSON schema
{
  "title": "string — overall analysis title (Ukrainian)",
  "description": "string — what the full analysis will cover (Ukrainian, 1-2 sentences)",
  "workflows": [
    {
      "sequenceNumber": 1,
      "title": "string — workflow title (Ukrainian)",
      "description": "string — what this workflow analyzes (Ukrainian)",
      "plan": {
        "goal": "string — specific goal (Ukrainian)",
        "steps": [
          {
            "id": 1,
            "tool": "tool_name",
            "params": {"key": "value"},
            "purpose": "string (Ukrainian)",
            "depends_on": []
          }
        ]
      }
    }
  ]
}

## Example
Query: "Проаналізуй практику Оболонського районного суду м. Києва за останні 5 років щодо земельних спорів"

Response:
{
  "title": "Аналіз земельних спорів Оболонського районного суду (2021-2026)",
  "description": "Комплексний аналіз судової практики щодо земельних спорів: обсяг справ, тематичний розподіл, статистика оскаржень, ключові прецеденти",
  "workflows": [
    {
      "sequenceNumber": 1,
      "title": "Загальний обсяг земельних справ",
      "description": "Пошук та підрахунок усіх справ щодо земельних спорів",
      "plan": {
        "goal": "Визначити загальний обсяг земельних справ",
        "steps": [
          {"id": 1, "tool": "search_legal_precedents", "params": {"query": "земельний спір Оболонський районний суд", "limit": 50}, "purpose": "Пошук земельних справ"}
        ]
      }
    },
    {
      "sequenceNumber": 2,
      "title": "Тематичний розподіл справ",
      "description": "Аналіз розподілу за підкатегоріями: оренда, право власності, самовільне зайняття",
      "plan": {
        "goal": "Розподілити справи за тематичними підкатегоріями",
        "steps": [
          {"id": 1, "tool": "search_legal_precedents", "params": {"query": "оренда земельної ділянки Оболонський", "limit": 50}, "purpose": "Справи щодо оренди"},
          {"id": 2, "tool": "search_legal_precedents", "params": {"query": "право власності земельна ділянка Оболонський", "limit": 50}, "purpose": "Справи щодо права власності"},
          {"id": 3, "tool": "search_legal_precedents", "params": {"query": "самовільне зайняття земельна ділянка Оболонський", "limit": 50}, "purpose": "Справи щодо самовільного зайняття"}
        ]
      }
    }
  ]
}`;

export class WorkflowGeneratorService {
  constructor(
    private toolRegistry: ToolRegistry,
    private llm: ILLMPort
  ) {}

  async generateWorkflows(
    query: string,
    classification: ChatIntentClassification
  ): Promise<GeneratedWorkflowSet> {
    const allDefs = await this.toolRegistry.getAllToolDefinitions();
    const toolDescriptions = allDefs
      .filter((d: ToolDefinition) => this.isRelevantTool(d.name))
      .map((d: ToolDefinition) => `- ${d.name}: ${d.description}`)
      .join('\n');

    const slotsStr = classification.slots ? `\nСлоти: ${JSON.stringify(classification.slots)}` : '';

    const messages = [
      { role: 'system' as const, content: WORKFLOW_GENERATION_PROMPT },
      {
        role: 'user' as const,
        content: `Запит: ${query}
Домени: ${classification.domains.join(', ')}
Ключові слова: ${classification.keywords}${slotsStr}

Доступні інструменти:
${toolDescriptions}`,
      },
    ];

    const startTime = Date.now();

    const response = await this.llm.chatCompletion(
      {
        messages,
        max_tokens: 4000,
        temperature: 0.3,
        response_format: { type: 'json_object' },
      },
      'deep'
    );

    const content = response.content || '{}';
    const elapsed = Date.now() - startTime;

    logger.info('[WorkflowGenerator] LLM response', {
      model: response.model,
      elapsed_ms: elapsed,
      contentLength: content.length,
    });

    // Parse JSON response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in workflow generation response');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    if (!parsed.title || !Array.isArray(parsed.workflows) || parsed.workflows.length === 0) {
      throw new Error('Invalid workflow generation response: missing title or workflows');
    }

    // Validate and cap at 7 workflows
    const workflows: GeneratedWorkflow[] = parsed.workflows.slice(0, 7).map((wf: any, idx: number) => ({
      sequenceNumber: wf.sequenceNumber || idx + 1,
      title: wf.title || `Workflow ${idx + 1}`,
      description: wf.description || '',
      plan: {
        goal: wf.plan?.goal || wf.title,
        steps: (wf.plan?.steps || []).slice(0, 5).map((step: any) => ({
          id: step.id || 1,
          tool: step.tool,
          params: step.params || {},
          purpose: step.purpose || '',
          depends_on: step.depends_on || [],
        })),
      },
    }));

    logger.info('[WorkflowGenerator] Generated workflows', {
      title: parsed.title,
      workflowCount: workflows.length,
      totalSteps: workflows.reduce((s: number, w: GeneratedWorkflow) => s + w.plan.steps.length, 0),
    });

    return {
      title: parsed.title,
      description: parsed.description || '',
      workflows,
    };
  }

  private isRelevantTool(name: string): boolean {
    const relevant = [
      'search_legal_precedents',
      'get_court_decision', 'get_case_documents_chain', 'load_full_texts',
      'find_similar_fact_pattern_cases', 'compare_practice_pro_contra',
      'count_cases_by_party', 'search_legislation', 'get_legislation_section',
      'search_procedural_norms', 'bulk_ingest_court_decisions',
    ];
    return relevant.includes(name);
  }
}
