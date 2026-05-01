/**
 * Decision Layer Tools — Legal Decision Protocol (LDP)
 *
 * Post-processing tool that takes search/analysis results and produces
 * a structured legal decision with scored positions, risk map, decision tree,
 * and actionable recommendations.
 */

import { BaseToolHandler, ToolDefinition, ToolResult } from '../base-tool-handler.js';
import { parseLLMJson } from '../tool-utils.js';
import { logger } from '../../utils/logger.js';
import { DECISION_SYSTEM_PROMPT } from '../../prompts/legal-decision-prompt.js';
import type { ILLMPort } from '../../domain/ports/index.js';

// ============================================================================
// Types
// ============================================================================

interface LegalBasis {
  norm: string;        // "ст. 344 ЦК України"
  text?: string;       // brief excerpt
  rada_id?: string;
}

interface LegalPosition {
  id: string;
  claim: string;
  legal_basis: LegalBasis[];
  required_evidence: string[];
  burden_of_proof: 'plaintiff' | 'defendant';
}

interface PositionScore {
  position_id: string;
  success_rate: number | null;        // % from case data, null if unknown
  supreme_court_alignment: 'aligned' | 'conflicting' | 'no_data';
  precedent_count: number;
  recency_score: number;              // 0-100, higher = more recent practice
  reversal_risk: number | null;       // % appeals overturned
  enforceability: 'high' | 'medium' | 'low' | 'unknown';
  composite_score: number;            // 0-100 weighted
}

interface RiskItem {
  category: 'procedural' | 'substantive' | 'evidence' | 'enforcement';
  description: string;
  probability: 'high' | 'medium' | 'low';
  impact: 'critical' | 'significant' | 'minor';
  mitigation: string;
  case_examples: string[];
}

interface DecisionTreeNode {
  question: string;
  source?: string;
  yes_branch: string;   // position_id or next question
  no_branch: string;
}

interface ReasoningStep {
  fact: string;
  logic: string;
  conclusion: string;
}

interface ActionStep {
  step: number;
  action: string;
  deadline?: string;
  documents_needed?: string[];
}

export interface LegalDecision {
  positions: LegalPosition[];
  scores: PositionScore[];
  decision_tree: DecisionTreeNode[];
  risk_map: RiskItem[];
  reasoning: ReasoningStep[];
  primary_recommendation: string;     // position_id
  alternative_recommendation: string; // position_id
  next_steps: ActionStep[];
  confidence: number;                 // 0-100
  limitations: string[];
}

// ============================================================================
// Tool Handler
// ============================================================================

export class DecisionLayerTools extends BaseToolHandler {
  constructor(private llm: ILLMPort) {
    super();
  }

  getToolDefinitions(): ToolDefinition[] {
    return [
      {
        name: 'build_legal_decision',
        annotations: { title: 'Побудова правової позиції' },
        description: 'Decision Layer Protocol: приймає результати пошуку/аналізу і генерує структуроване юридичне рішення з scored позиціями, деревом рішень, картою ризиків та рекомендаціями. Використовувати ПІСЛЯ збору даних через інші інструменти.',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Юридичне питання користувача',
            },
            context: {
              type: 'string',
              description: 'Зібраний контекст: результати пошуку справ, законодавство, аналіз практики. Передавати як текст з усіма знайденими даними.',
            },
            pro_cases: {
              type: 'array',
              items: { type: 'string' },
              description: 'Номери справ "за" позицію (з compare_practice_pro_contra)',
            },
            contra_cases: {
              type: 'array',
              items: { type: 'string' },
              description: 'Номери справ "проти" позиції',
            },
            legislation: {
              type: 'array',
              items: { type: 'string' },
              description: 'Релевантні статті законів (текст)',
            },
          },
          required: ['query', 'context'],
        },
      },
    ];
  }

  async executeTool(name: string, args: any): Promise<ToolResult | null> {
    if (name !== 'build_legal_decision') return null;

    const { query, context, pro_cases, contra_cases, legislation } = args;

    logger.info('[DecisionLayer] Building legal decision', {
      queryLength: query?.length,
      contextLength: context?.length,
      proCases: pro_cases?.length || 0,
      contraCases: contra_cases?.length || 0,
    });

    try {
      // Build enriched context
      const parts: string[] = [
        `## Юридичне питання\n${query}`,
        `## Зібрані дані\n${context}`,
      ];

      if (pro_cases?.length) {
        parts.push(`## Справи "за"\n${pro_cases.join(', ')}`);
      }
      if (contra_cases?.length) {
        parts.push(`## Справи "проти"\n${contra_cases.join(', ')}`);
      }
      if (legislation?.length) {
        parts.push(`## Законодавство\n${legislation.join('\n\n')}`);
      }

      const userMessage = parts.join('\n\n');

      // Call LLM for structured decision
      const response = await this.llm.chatCompletion(
        {
          messages: [
            { role: 'system', content: DECISION_SYSTEM_PROMPT },
            { role: 'user', content: userMessage },
          ],
          temperature: 0.3,
          max_tokens: 8000,
        },
        'deep',
      );

      const text = response.content;

      // Try to parse as JSON
      let decision: LegalDecision;
      const parsed = parseLLMJson<LegalDecision | null>(text, null);
      if (!parsed) {
        return this.wrapResponse({
          error: 'Failed to generate structured decision',
          raw_analysis: text,
        });
      }
      decision = parsed;

      // Validate minimum structure
      if (!decision.positions || !decision.scores || !decision.reasoning) {
        return this.wrapResponse({
          error: 'Incomplete decision structure',
          partial: decision,
        });
      }

      return this.wrapResponse(decision);
    } catch (error: any) {
      logger.error('[DecisionLayer] Failed to build decision', { error: error.message });
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: error.message }) }],
        isError: true,
      };
    }
  }
}
