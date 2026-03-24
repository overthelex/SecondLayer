/**
 * Decision Layer Tools — Legal Decision Protocol (LDP)
 *
 * Post-processing tool that takes search/analysis results and produces
 * a structured legal decision with scored positions, risk map, decision tree,
 * and actionable recommendations.
 */

import { BaseToolHandler, ToolDefinition, ToolResult } from '../base-tool-handler.js';
import { logger } from '../../utils/logger.js';
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
// System prompt for decision generation
// ============================================================================

const DECISION_SYSTEM_PROMPT = `You are a Legal Decision Protocol (LDP) engine. You receive search results, case analysis, and legislation data from the LEX platform, and you must produce a STRUCTURED legal decision.

## Output Format
Return ONLY valid JSON matching the LegalDecision schema. No markdown, no comments.

## Schema
{
  "positions": [
    {
      "id": "pos_1",
      "claim": "Конкретне формулювання позовної вимоги",
      "legal_basis": [{"norm": "ст. 344 ЦК України", "text": "короткий витяг"}],
      "required_evidence": ["Акт обстеження", "Показання свідків"],
      "burden_of_proof": "plaintiff"
    }
  ],
  "scores": [
    {
      "position_id": "pos_1",
      "success_rate": 72,
      "supreme_court_alignment": "aligned",
      "precedent_count": 15,
      "recency_score": 85,
      "reversal_risk": 18,
      "enforceability": "high",
      "composite_score": 78
    }
  ],
  "decision_tree": [
    {
      "question": "Чи минуло 15 років безперервного володіння?",
      "source": "ст. 344 ЦК",
      "yes_branch": "pos_1",
      "no_branch": "Чи є підстави для скороченого строку?"
    }
  ],
  "risk_map": [
    {
      "category": "substantive",
      "description": "Зміна практики ВП ВС щодо набувальної давності",
      "probability": "medium",
      "impact": "critical",
      "mitigation": "Посилатися на пост. ВП ВС від 2023 року",
      "case_examples": ["922/989/18"]
    }
  ],
  "reasoning": [
    {
      "fact": "ВС у справі 756/1234/23 підтвердив застосування ст. 344 ЦК",
      "logic": "Наша ситуація підпадає під той самий правовий режим",
      "conclusion": "Негаторний позов є обґрунтованим"
    }
  ],
  "primary_recommendation": "pos_1",
  "alternative_recommendation": "pos_2",
  "next_steps": [
    {
      "step": 1,
      "action": "Подати позов до Господарського суду м. Києва",
      "deadline": "до 15.04.2026",
      "documents_needed": ["Позовна заява", "Квитанція про сплату судового збору"]
    }
  ],
  "confidence": 78,
  "limitations": ["Аналіз базується на 15 справах, вибірка може бути недостатньою"]
}

## Rules
1. EVERY score and metric MUST be derived from the provided data. If data is insufficient, set to null and add to limitations.
2. EVERY reasoning step must cite a specific case number or article from the input.
3. Generate ALL plausible legal positions, not just the obvious one.
4. The composite_score formula: 0.25*success_rate + 0.2*SC_alignment(100/50/0) + 0.15*recency + 0.15*(100-reversal_risk) + 0.15*precedent_density + 0.1*enforceability(100/60/30)
5. Decision tree questions must come from actual branching points found in case law analysis.
6. Risk map must include at least procedural and substantive risks.
7. All text in Ukrainian.`;

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
          max_tokens: 4000,
          response_format: { type: 'json_object' },
        },
        'deep',
      );

      const text = response.content;

      // Try to parse as JSON
      let decision: LegalDecision;
      try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        decision = JSON.parse(jsonMatch?.[0] || text);
      } catch {
        // LLM returned non-JSON — wrap as text response
        return this.wrapResponse({
          error: 'Failed to generate structured decision',
          raw_analysis: text,
        });
      }

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
