/**
 * useMCPTool Hook
 * Shared hook for calling any MCP tool with streaming support
 * Used by both ChatPage and ChatLayout
 */

import { useCallback, useRef } from 'react';
import { useChatStore } from '../stores';
import { useSettingsStore } from '../stores';
import { mcpService } from '../services';
import showToast from '../utils/toast';
import type { Decision, Citation, VaultDocument, ExecutionPlan, CostSummary } from '../types/models/Message';

/**
 * Human-friendly tool name labels for thinking steps display.
 */
const TOOL_LABELS: Record<string, string> = {
  search_legal_precedents: 'Пошук прецедентів',
  search_supreme_court_practice: 'Практика ВС',
  get_court_decision: 'Отримання рішення',
  get_case_documents_chain: 'Ланцюг документів',
  find_similar_fact_pattern_cases: 'Схожі справи',
  compare_practice_pro_contra: 'Аналіз за і проти',
  count_cases_by_party: 'Справи сторони',
  get_case_text: 'Текст справи',
  analyze_case_pattern: 'Аналіз патерну',
  get_similar_reasoning: 'Схоже обґрунтування',
  get_citation_graph: 'Граф цитувань',
  check_precedent_status: 'Статус прецеденту',
  search_legislation: 'Пошук законодавства',
  get_legislation_article: 'Стаття закону',
  get_legislation_articles: 'Статті закону',
  get_legislation_section: 'Розділ закону',
  get_legislation_structure: 'Структура закону',
  search_procedural_norms: 'Процесуальні норми',
  find_relevant_law_articles: 'Релевантні статті',
  store_document: 'Збереження документу',
  list_documents: 'Список документів',
  semantic_search: 'Семантичний пошук',
  get_document: 'Отримання документу',
  parse_document: 'Розбір документу',
  extract_document_sections: 'Секції документу',
  summarize_document: 'Резюме документу',
  compare_documents: 'Порівняння документів',
  extract_key_clauses: 'Ключові положення',
  calculate_procedural_deadlines: 'Розрахунок строків',
  build_procedural_checklist: 'Процесуальний чеклист',
  calculate_monetary_claims: 'Грошові вимоги',
  generate_dd_report: 'DD звіт',
  risk_scoring: 'Скоринг ризиків',
  format_answer_pack: 'Пакет відповідей',
  rada_search_parliament_bills: 'Законопроекти Ради',
  rada_get_deputy_info: 'Інфо про депутата',
  rada_search_legislation_text: 'Текст законів',
  rada_analyze_voting_record: 'Голосування',
  openreyestr_search_entities: 'Пошук юросіб',
  openreyestr_get_entity_details: 'Деталі юрособи',
  openreyestr_search_beneficiaries: 'Пошук бенефіціарів',
  openreyestr_get_by_edrpou: 'Пошук за ЄДРПОУ',
  openreyestr_get_statistics: 'Статистика реєстру',
  openreyestr_search_enforcement_proceedings: 'Виконавчі провадження',
  openreyestr_search_debtors: 'Боржники',
  openreyestr_search_bankruptcy_cases: 'Банкрутство',
  openreyestr_search_notaries: 'Нотаріуси',
  openreyestr_search_court_experts: 'Судові експерти',
  openreyestr_search_arbitration_managers: 'Арбітражні керуючі',
};

function getToolLabel(toolName: string): string {
  return TOOL_LABELS[toolName] || toolName;
}

/**
 * Parse raw tool result content — handles MCP content array and plain objects.
 */
function parseToolResultContent(result: any): any {
  if (!result) return null;
  try {
    if (result.content && Array.isArray(result.content)) {
      const textBlock = result.content.find((b: any) => b.type === 'text');
      if (textBlock?.text) {
        return JSON.parse(textBlock.text);
      }
    }
    return typeof result === 'string' ? JSON.parse(result) : result;
  } catch {
    return result;
  }
}

/**
 * Extract law article references from the AI answer text.
 * Matches patterns like "ст. 509 ЦКУ", "ч. 1 ст. 626 ЦК", "стаття 509 Цивільного кодексу України",
 * "ст. 124 Конституції України", "статтями 1046-1053 ЦКУ".
 */
function extractNormsFromAnswer(answerText: string): Citation[] {
  const norms: Citation[] = [];
  const seen = new Set<string>();

  // Abbreviations for Ukrainian codes
  const CODES = '(?:ЦКУ|ГКУ|КПК|ЦПК|ГПК|КАС|ПКУ|СКУ|ККУ|КЗпП|ЗКУ|МКУ|ЦК|ГК|ПК|ЗК|МК)';
  // Full Ukrainian law name patterns: e.g. "Цивільного кодексу України", "Закону України 'Про...'"
  const FULL_LAW = '(?:[А-ЯҐЄІЇа-яґєії]+ого\\s+[Кк]одексу(?:\\s+України)?|[Зз]акону\\s+України(?:\\s+[«""][^»""]{1,80}[»""])?|[Кк]онституції\\s+України|[Кк]онвенції[^,;.]{0,50})';
  // All Ukrainian grammatical forms of "стаття": стаття/статті/статтю/статтею/статтям/статтями/статтях/статей
  const ST = 'ст(?:атт[а-яіїєґ]*)?';

  const re = new RegExp(
    '(?:(?:п\\.?\\s*\\d+[,\\s]+)?(?:ч\\.?\\s*\\d+[,\\s]+))?' +
    ST + '\\.?\\s*\\d+(?:[\\u2013\\u2014,\\-]\\s*\\d+)*\\s+(?:' + CODES + '|' + FULL_LAW + ')(?:\\s+України)?' +
    '|' + ST + '\\.?\\s*\\d+\\s+Конституц[іи][їи]\\s+України',
    'gi'
  );

  const sentences = answerText.split(/\n|(?<=[.;!?])\s+/);
  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (!trimmed) continue;
    re.lastIndex = 0;
    let match;
    while ((match = re.exec(trimmed)) !== null) {
      const ref = match[0].trim();
      const key = ref.toLowerCase().replace(/\s+/g, ' ');
      if (!seen.has(key)) {
        seen.add(key);
        norms.push({ text: trimmed, source: ref });
      }
    }
  }
  return norms;
}

/**
 * Extract Decision[] and Citation[] from a tool_result SSE event.
 * Handles all court-case and legislation tools returned by the agentic loop.
 */
function extractEvidenceFromToolResult(
  toolName: string,
  rawResult: any
): { decisions: Decision[]; citations: Citation[]; documents: VaultDocument[] } {
  const decisions: Decision[] = [];
  const citations: Citation[] = [];
  const documents: VaultDocument[] = [];

  const parsed = parseToolResultContent(rawResult);
  if (!parsed) return { decisions, citations, documents };

  // ---- Court case tools ----
  const courtTools = [
    'search_legal_precedents',
    'search_supreme_court_practice',
    'get_case_documents_chain',
    'find_similar_fact_pattern_cases',
    'compare_practice_pro_contra',
    'get_court_decision',
    'count_cases_by_party',
  ];
  if (courtTools.some((t) => toolName.includes(t) || toolName === t)) {
    // source_case (single)
    if (parsed.source_case) {
      const sc = parsed.source_case;
      decisions.push({
        id: `sc-${sc.doc_id || Date.now()}`,
        number: sc.cause_num || sc.case_number || 'N/A',
        court: sc.court_code || sc.court || '',
        date: sc.adjudication_date || sc.date || '',
        summary: sc.title || sc.resolution || '',
        relevance: 100,
        status: 'active',
      });
    }

    // similar_cases / results array (tools return different field names)
    const cases = parsed.similar_cases || parsed.results || parsed.cases || parsed.precedents || [];
    for (const c of cases) {
      decisions.push({
        id: `d-${c.doc_id || c.id || Math.random().toString(36).slice(2, 8)}`,
        number: c.cause_num || c.case_number || c.number || 'N/A',
        court: c.court_code || c.court || '',
        date: c.adjudication_date || c.date || '',
        summary: c.title || c.resolution || c.summary || c.similarity_reason
          || (Array.isArray(c.snippets) ? c.snippets.join(' ') : '') || '',
        relevance: c.similarity
          ? Math.round(c.similarity * 100)
          : c.relevance
            ? Math.round(c.relevance * 100)
            : 70,
        status: 'active',
      });
    }

    // get_case_documents_chain format (flat array or grouped by instance)
    let chainDocs: any[] = [];
    if (parsed.documents && Array.isArray(parsed.documents)) {
      chainDocs = parsed.documents;
    } else if (parsed.grouped_documents && typeof parsed.grouped_documents === 'object') {
      chainDocs = Object.values(parsed.grouped_documents).flat();
    }
    for (const doc of chainDocs) {
      decisions.push({
        id: `chain-${doc.doc_id || Math.random().toString(36).slice(2, 8)}`,
        number: doc.case_number || parsed.case_number || doc.title || 'N/A',
        court: doc.court || doc.instance || '',
        date: doc.date || '',
        summary: doc.resolution || doc.title || '',
        relevance: 80,
        status: 'active',
        documentType: doc.document_type,
      });
    }

    // compare_practice_pro_contra format
    const proContraCases = [...(parsed.pro || []), ...(parsed.contra || [])];
    for (const c of proContraCases) {
      decisions.push({
        id: `pc-${c.doc_id || Math.random().toString(36).slice(2, 8)}`,
        number: c.case_number || 'N/A',
        court: c.court || c.chamber || '',
        date: c.date || '',
        summary: c.snippet || '',
        relevance: 70,
        status: 'active',
      });
    }

    // get_court_decision — single decision with sections
    if (parsed.sections && Array.isArray(parsed.sections) && (parsed.doc_id || parsed.case_number)) {
      const summarySection = parsed.sections.find((s: any) => s.type === 'DECISION' || s.type === 'COURT_REASONING');
      decisions.push({
        id: `gcd-${parsed.doc_id || Date.now()}`,
        number: parsed.case_number || String(parsed.doc_id) || 'N/A',
        court: '',
        date: '',
        summary: summarySection?.text?.slice(0, 300) || '',
        relevance: 100,
        status: 'active',
      });
    }
  }

  // ---- Legislation tools ----
  const legislationTools = [
    'search_legislation',
    'get_legislation_article',
    'get_legislation_articles',
    'get_legislation_section',
    'find_relevant_law_articles',
  ];
  if (legislationTools.some((t) => toolName.includes(t) || toolName === t)) {
    // Single article result
    if (parsed.full_text || parsed.text || parsed.content) {
      const articleNum = parsed.article_number || parsed.section_name || '';
      const title = parsed.title || parsed.rada_id || parsed.legislation_id || '';
      citations.push({
        text: parsed.full_text || parsed.text || parsed.content || '',
        source: articleNum ? `${title}, ст. ${articleNum}` : title,
      });
    }

    // Array of legislation results.
    // search_legislation returns 'articles', some tools return 'legislation'.
    const legislationArray = parsed.legislation || (toolName === 'search_legislation' ? parsed.articles : null);
    if (legislationArray && Array.isArray(legislationArray)) {
      for (const l of legislationArray) {
        citations.push({
          text: l.full_text || l.text || l.snippet || l.title || '',
          source: l.article_number
            ? `${l.title || l.rada_id || 'Норма'}, ст. ${l.article_number}`
            : (l.title || l.type || 'Нормативний акт'),
        });
      }
    }

    // find_relevant_law_articles — returns array of string refs; handle separately to avoid empty citations
    if (toolName === 'find_relevant_law_articles') {
      const refs = parsed.relevant_articles || parsed.articles || (Array.isArray(parsed) ? parsed : []);
      for (const r of refs) {
        if (typeof r === 'string') {
          citations.push({ text: r, source: r });
        } else if (r?.article || r?.reference || r?.norm) {
          citations.push({
            text: r.text || r.content || r.description || r.article || r.reference || r.norm || '',
            source: r.article || r.reference || r.norm || r.title || 'Норма',
          });
        }
      }
    } else if (parsed.articles && Array.isArray(parsed.articles)) {
      // Other legislation tools return articles as objects with full_text
      for (const a of parsed.articles) {
        if (typeof a === 'object' && a !== null) {
          citations.push({
            text: a.full_text || a.text || a.content || '',
            source: `Стаття ${a.article_number || ''}`,
          });
        }
      }
    }
  }

  // ---- Procedural norm tools (return plain text, not JSON) ----
  const proceduralNormTools = [
    'search_procedural_norms',
    'calculate_procedural_deadlines',
    'build_procedural_checklist',
  ];
  if (proceduralNormTools.some((t) => toolName === t)) {
    // These tools return { content: [{ type: 'text', text: '...' }] }
    const textContent = rawResult?.content?.find((b: any) => b.type === 'text')?.text;
    if (textContent) {
      const sourceLabel =
        toolName === 'search_procedural_norms' ? 'Процесуальна норма' :
        toolName === 'calculate_procedural_deadlines' ? 'Процесуальні строки' :
        'Процесуальний чеклист';
      citations.push({ text: textContent, source: sourceLabel });
    }
  }

  // ---- Vault / document tools ----
  const vaultTools = [
    'list_documents',
    'semantic_search',
    'semantic_search_vault',
    'get_document',
    'store_document',
    'parse_document',
    'extract_document_sections',
    'summarize_document',
    'compare_documents',
    'extract_key_clauses',
  ];
  if (vaultTools.some((t) => toolName.includes(t) || toolName === t)) {
    // list_documents returns { documents: [...], total }
    if (parsed.documents && Array.isArray(parsed.documents)) {
      for (const doc of parsed.documents) {
        documents.push({
          id: doc.id || `vd-${Math.random().toString(36).slice(2, 8)}`,
          title: doc.title || doc.name || 'Без назви',
          type: doc.type || 'other',
          uploadedAt: doc.created_at || doc.uploadedAt || doc.uploaded_at || '',
          metadata: doc.metadata || {},
        });
      }
    }

    // semantic_search returns array of results directly
    if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].documentId) {
      for (const r of parsed) {
        documents.push({
          id: r.documentId || `vd-${Math.random().toString(36).slice(2, 8)}`,
          title: r.title || r.sectionTitle || 'Без назви',
          type: r.type || 'other',
          metadata: { relevance: r.relevance, snippet: r.text?.slice(0, 200) },
        });
      }
    }

    // get_document / store_document — single document
    if (parsed.id && parsed.title && !parsed.documents) {
      documents.push({
        id: parsed.id,
        title: parsed.title,
        type: parsed.type || 'other',
        uploadedAt: parsed.created_at || parsed.uploadedAt || '',
        metadata: parsed.metadata || {},
      });
    }

    // parse_document / summarize_document / extract_key_clauses — text-based results
    if (parsed.summary || parsed.text || parsed.clauses || parsed.sections) {
      const content = parsed.summary || parsed.text || '';
      if (content) {
        citations.push({
          text: content,
          source: parsed.title || parsed.document_id || toolName,
        });
      }
      if (parsed.clauses && Array.isArray(parsed.clauses)) {
        for (const clause of parsed.clauses) {
          citations.push({
            text: clause.text || clause.content || '',
            source: clause.title || clause.name || 'Ключове положення',
          });
        }
      }
      if (parsed.sections && Array.isArray(parsed.sections)) {
        for (const sec of parsed.sections) {
          citations.push({
            text: sec.content || sec.text || '',
            source: sec.name || sec.title || 'Секція',
          });
        }
      }
    }

    // compare_documents — comparison result
    if (parsed.comparison || parsed.differences) {
      const compText = parsed.comparison || parsed.summary || '';
      if (compText) {
        citations.push({
          text: compText,
          source: 'Порівняння документів',
        });
      }
    }
  }

  // ---- retrieve_legal_sources (combined court + legislation retrieval) ----
  if (toolName === 'retrieve_legal_sources') {
    // Extract court cases from `cases` array
    if (parsed.cases && Array.isArray(parsed.cases)) {
      for (const c of parsed.cases) {
        decisions.push({
          id: `rls-${c.id || Math.random().toString(36).slice(2, 8)}`,
          number: c.id || 'N/A',
          court: c.court || '',
          date: c.date || '',
          summary: c.text?.slice(0, 300) || c.title || '',
          relevance: 70,
          status: 'active',
        });
      }
    }
    // Extract legislation from `laws` array
    if (parsed.laws && Array.isArray(parsed.laws)) {
      for (const l of parsed.laws) {
        citations.push({
          text: l.text || l.full_text || l.title || '',
          source: l.article ? `${l.title || l.rada_id || ''}, ст. ${l.article}` : (l.title || 'Норма'),
        });
      }
    }
  }

  // ---- RADA / Parliament tools ----
  const radaTools = [
    'rada_search_parliament_bills',
    'rada_get_deputy_info',
    'rada_search_legislation_text',
    'rada_analyze_voting_record',
  ];
  if (radaTools.some((t) => toolName === t)) {
    // Bills search results
    if (parsed.bills && Array.isArray(parsed.bills)) {
      for (const bill of parsed.bills) {
        documents.push({
          id: `bill-${bill.id || bill.number || Math.random().toString(36).slice(2, 8)}`,
          title: bill.title || bill.name || `Законопроект ${bill.number || ''}`,
          type: 'legislation',
          metadata: {
            snippet: bill.summary || bill.description || '',
            status: bill.status,
            number: bill.number,
            date: bill.date || bill.registration_date,
          },
        });
      }
    }

    // Deputy info
    if (parsed.name && (parsed.faction || parsed.party || parsed.deputy_id)) {
      documents.push({
        id: `deputy-${parsed.deputy_id || parsed.id || Math.random().toString(36).slice(2, 8)}`,
        title: parsed.name || parsed.full_name || 'Народний депутат',
        type: 'other',
        metadata: {
          snippet: [parsed.faction || parsed.party, parsed.region, parsed.position].filter(Boolean).join(' • '),
          deputy_id: parsed.deputy_id || parsed.id,
        },
      });
    }

    // Deputies array
    if (parsed.deputies && Array.isArray(parsed.deputies)) {
      for (const dep of parsed.deputies) {
        documents.push({
          id: `deputy-${dep.id || Math.random().toString(36).slice(2, 8)}`,
          title: dep.name || dep.full_name || 'Депутат',
          type: 'other',
          metadata: {
            snippet: [dep.faction || dep.party, dep.region].filter(Boolean).join(' • '),
          },
        });
      }
    }

    // Legislation text search
    if (parsed.results && Array.isArray(parsed.results) && toolName === 'rada_search_legislation_text') {
      for (const r of parsed.results) {
        citations.push({
          text: (r.text || r.snippet || r.content || '').slice(0, 500),
          source: r.title || r.law_title || r.source || 'Законодавство',
        });
      }
    }

    // Voting record
    if (parsed.votings && Array.isArray(parsed.votings)) {
      for (const v of parsed.votings) {
        citations.push({
          text: `За: ${v.yes || 0}, Проти: ${v.no || 0}, Утримались: ${v.abstain || 0}${v.result ? ` — ${v.result}` : ''}`,
          source: v.title || v.bill_title || 'Голосування',
        });
      }
    }
    if (parsed.voting_summary) {
      citations.push({
        text: typeof parsed.voting_summary === 'string'
          ? parsed.voting_summary.slice(0, 500)
          : JSON.stringify(parsed.voting_summary).slice(0, 500),
        source: 'Аналіз голосувань',
      });
    }
  }

  // ---- OpenReyestr / Business registry tools ----
  const registryTools = [
    'openreyestr_search_entities',
    'openreyestr_get_entity_details',
    'openreyestr_search_beneficiaries',
    'openreyestr_get_by_edrpou',
    'openreyestr_get_statistics',
    'openreyestr_search_enforcement_proceedings',
    'openreyestr_search_debtors',
    'openreyestr_search_bankruptcy_cases',
    'openreyestr_search_notaries',
    'openreyestr_search_court_experts',
    'openreyestr_search_arbitration_managers',
  ];
  if (registryTools.some((t) => toolName === t)) {
    // Entity search results
    const entities = parsed.entities || parsed.results || [];
    if (Array.isArray(entities)) {
      for (const e of entities) {
        documents.push({
          id: `entity-${e.id || e.edrpou || Math.random().toString(36).slice(2, 8)}`,
          title: e.name || e.full_name || e.short_name || 'Юрособа',
          type: 'other',
          metadata: {
            snippet: [e.edrpou && `ЄДРПОУ: ${e.edrpou}`, e.address, e.status].filter(Boolean).join(' • '),
            edrpou: e.edrpou,
            status: e.status,
          },
        });
      }
    }

    // Single entity details
    if (parsed.name && parsed.edrpou && !parsed.entities) {
      documents.push({
        id: `entity-${parsed.edrpou}`,
        title: parsed.name || parsed.full_name || 'Юрособа',
        type: 'other',
        metadata: {
          snippet: [
            `ЄДРПОУ: ${parsed.edrpou}`,
            parsed.address,
            parsed.status,
            parsed.head && `Керівник: ${parsed.head}`,
          ].filter(Boolean).join(' • '),
          edrpou: parsed.edrpou,
          status: parsed.status,
        },
      });
    }

    // Beneficiaries
    if (parsed.beneficiaries && Array.isArray(parsed.beneficiaries)) {
      for (const b of parsed.beneficiaries) {
        documents.push({
          id: `benef-${b.id || Math.random().toString(36).slice(2, 8)}`,
          title: b.name || b.full_name || 'Бенефіціар',
          type: 'other',
          metadata: {
            snippet: [b.share && `Частка: ${b.share}%`, b.country, b.entity_name].filter(Boolean).join(' • '),
          },
        });
      }
    }

    // Statistics
    if (parsed.statistics || parsed.total_count != null) {
      citations.push({
        text: typeof parsed.statistics === 'string'
          ? parsed.statistics
          : `Загалом: ${parsed.total_count || 0}. ${parsed.summary || ''}`.trim(),
        source: 'Статистика реєстру',
      });
    }

    // Enforcement proceedings
    if (parsed.enforcement_proceedings || (parsed.results && Array.isArray(parsed.results) && parsed.results[0]?.proceeding_number)) {
      const proceedings = parsed.enforcement_proceedings || parsed.results || [];
      if (Array.isArray(proceedings)) {
        for (const p of proceedings) {
          documents.push({
            id: `enforcement-${p.id || p.proceeding_number || Math.random().toString(36).slice(2, 8)}`,
            title: `Виконавче провадження ${p.proceeding_number || ''}`,
            type: 'other',
            metadata: {
              snippet: [
                p.debtor_name && `Боржник: ${p.debtor_name}`,
                p.creditor_name && `Стягувач: ${p.creditor_name}`,
                p.proceeding_status && `Статус: ${p.proceeding_status}`,
                p.enforcement_agency && `Виконавець: ${p.enforcement_agency}`,
              ].filter(Boolean).join(' • '),
              status: p.proceeding_status,
            },
          });
        }
      }
    }

    // Debtors
    if (parsed.debtors || (parsed.results && Array.isArray(parsed.results) && parsed.results[0]?.debtor_name)) {
      const debtors = parsed.debtors || parsed.results || [];
      if (Array.isArray(debtors)) {
        for (const d of debtors) {
          documents.push({
            id: `debtor-${d.id || d.edrpou || Math.random().toString(36).slice(2, 8)}`,
            title: d.debtor_name || 'Боржник',
            type: 'other',
            metadata: {
              snippet: [
                d.edrpou && `ЄДРПОУ: ${d.edrpou}`,
                d.total_debt && `Загальний борг: ${d.total_debt}`,
                d.execution_proceedings && `Проваджень: ${d.execution_proceedings}`,
              ].filter(Boolean).join(' • '),
            },
          });
        }
      }
    }

    // Bankruptcy cases
    if (parsed.bankruptcy_cases || (parsed.results && Array.isArray(parsed.results) && parsed.results[0]?.case_number)) {
      const cases = parsed.bankruptcy_cases || parsed.results || [];
      if (Array.isArray(cases)) {
        for (const c of cases) {
          documents.push({
            id: `bankruptcy-${c.id || c.case_number || Math.random().toString(36).slice(2, 8)}`,
            title: `Банкрутство ${c.case_number || ''}`,
            type: 'other',
            metadata: {
              snippet: [
                c.debtor_name && `Боржник: ${c.debtor_name}`,
                c.case_status && `Статус: ${c.case_status}`,
                c.sanction && `Санкція: ${c.sanction}`,
              ].filter(Boolean).join(' • '),
            },
          });
        }
      }
    }

    // Notaries
    if (parsed.notaries || (parsed.results && Array.isArray(parsed.results) && parsed.results[0]?.notary_name)) {
      const notaries = parsed.notaries || parsed.results || [];
      if (Array.isArray(notaries)) {
        for (const n of notaries) {
          documents.push({
            id: `notary-${n.id || n.notary_number || Math.random().toString(36).slice(2, 8)}`,
            title: n.notary_name || 'Нотаріус',
            type: 'other',
            metadata: {
              snippet: [
                n.license_number && `Ліцензія: ${n.license_number}`,
                n.address,
                n.status,
              ].filter(Boolean).join(' • '),
            },
          });
        }
      }
    }

    // Court experts
    if (parsed.court_experts || (parsed.results && Array.isArray(parsed.results) && parsed.results[0]?.expert_name)) {
      const experts = parsed.court_experts || parsed.results || [];
      if (Array.isArray(experts)) {
        for (const e of experts) {
          documents.push({
            id: `expert-${e.id || e.registration_number || Math.random().toString(36).slice(2, 8)}`,
            title: e.expert_name || 'Судовий експерт',
            type: 'other',
            metadata: {
              snippet: [
                e.registration_number && `Реєстр №: ${e.registration_number}`,
                e.specialization,
                e.status,
              ].filter(Boolean).join(' • '),
            },
          });
        }
      }
    }

    // Arbitration managers
    if (parsed.arbitration_managers || (parsed.results && Array.isArray(parsed.results) && parsed.results[0]?.manager_name)) {
      const managers = parsed.arbitration_managers || parsed.results || [];
      if (Array.isArray(managers)) {
        for (const m of managers) {
          documents.push({
            id: `manager-${m.id || m.registration_number || Math.random().toString(36).slice(2, 8)}`,
            title: m.manager_name || 'Арбітражний керуючий',
            type: 'other',
            metadata: {
              snippet: [
                m.registration_number && `Реєстр №: ${m.registration_number}`,
                m.address,
                m.status,
              ].filter(Boolean).join(' • '),
            },
          });
        }
      }
    }
  }

  // ---- Procedural tools ----
  const proceduralTools = [
    'calculate_procedural_deadlines',
    'build_procedural_checklist',
    'calculate_monetary_claims',
  ];
  if (proceduralTools.some((t) => toolName === t)) {
    // Deadlines
    if (parsed.deadlines && Array.isArray(parsed.deadlines)) {
      for (const dl of parsed.deadlines) {
        citations.push({
          text: `${dl.description || dl.action || dl.name}: ${dl.deadline || dl.date || dl.days_left ? `${dl.days_left} днів` : ''}`,
          source: dl.legal_basis || dl.norm || 'Процесуальний строк',
        });
      }
    }

    // Checklist
    if (parsed.checklist && Array.isArray(parsed.checklist)) {
      for (const item of parsed.checklist) {
        citations.push({
          text: `${item.step || item.action || item.description || ''}${item.deadline ? ` (до ${item.deadline})` : ''}`,
          source: item.legal_basis || item.norm || 'Процесуальний чеклист',
        });
      }
    }
    if (parsed.items && Array.isArray(parsed.items)) {
      for (const item of parsed.items) {
        citations.push({
          text: item.description || item.text || item.name || '',
          source: item.legal_basis || 'Чеклист',
        });
      }
    }

    // Monetary claims
    if (parsed.total != null || parsed.amount != null || parsed.calculation) {
      citations.push({
        text: parsed.calculation
          || `Загальна сума: ${parsed.total || parsed.amount || 0} грн${parsed.breakdown ? `. ${parsed.breakdown}` : ''}`,
        source: parsed.legal_basis || 'Розрахунок грошових вимог',
      });
    }
    if (parsed.components && Array.isArray(parsed.components)) {
      for (const comp of parsed.components) {
        citations.push({
          text: `${comp.name || comp.type || 'Складова'}: ${comp.amount || 0} грн`,
          source: comp.legal_basis || 'Складова вимоги',
        });
      }
    }
  }

  // ---- Due Diligence tools ----
  const ddTools = [
    'generate_dd_report',
    'risk_scoring',
    'format_answer_pack',
  ];
  if (ddTools.some((t) => toolName === t)) {
    // DD report
    if (parsed.report || parsed.summary || parsed.findings) {
      const reportText = parsed.report || parsed.summary || '';
      if (reportText) {
        citations.push({
          text: (typeof reportText === 'string' ? reportText : JSON.stringify(reportText)).slice(0, 500),
          source: 'Due Diligence звіт',
        });
      }
      if (parsed.findings && Array.isArray(parsed.findings)) {
        for (const f of parsed.findings) {
          citations.push({
            text: (f.description || f.text || f.finding || '').slice(0, 500),
            source: f.category || f.type || 'Висновок DD',
          });
        }
      }
    }

    // Risk scoring
    if (parsed.risk_score != null || parsed.score != null) {
      citations.push({
        text: `Рівень ризику: ${parsed.risk_score || parsed.score}${parsed.risk_level ? ` (${parsed.risk_level})` : ''}. ${parsed.explanation || parsed.summary || ''}`.trim(),
        source: 'Скоринг ризиків',
      });
    }
    if (parsed.risks && Array.isArray(parsed.risks)) {
      for (const r of parsed.risks) {
        citations.push({
          text: `${r.name || r.type || 'Ризик'}: ${r.score || r.level || ''}. ${r.description || ''}`.trim(),
          source: r.category || 'Ризик',
        });
      }
    }

    // Answer pack
    if (parsed.answers && Array.isArray(parsed.answers)) {
      for (const a of parsed.answers) {
        citations.push({
          text: (a.answer || a.text || a.content || '').slice(0, 500),
          source: a.question || a.topic || 'Відповідь',
        });
      }
    }
  }

  return { decisions, citations, documents };
}

export interface UseMCPToolOptions {
  enableStreaming?: boolean;
  onSuccess?: (result: any) => void;
  onError?: (error: Error) => void;
}

/**
 * Build a contextual query that includes prior conversation history.
 * Prepends last N user-assistant exchanges so the LLM has conversational memory.
 */
function buildContextualQuery(
  query: string,
  messages: Array<{ role: string; content: string }>,
  maxTurns = 3
): string {
  // Collect prior user-assistant pairs (exclude the just-added messages)
  const pairs: Array<{ user: string; assistant: string }> = [];
  for (let i = 0; i < messages.length - 1; i++) {
    const msg = messages[i];
    const next = messages[i + 1];
    if (msg.role === 'user' && next?.role === 'assistant' && next.content) {
      pairs.push({
        user: msg.content.slice(0, 500),
        assistant: next.content.slice(0, 500),
      });
      i++; // skip the assistant message
    }
  }

  if (pairs.length === 0) return query;

  const recentPairs = pairs.slice(-maxTurns);
  const context = recentPairs
    .map((p) => `\u041a\u043e\u0440\u0438\u0441\u0442\u0443\u0432\u0430\u0447: ${p.user}\n\u0410\u0441\u0438\u0441\u0442\u0435\u043d\u0442: ${p.assistant}`)
    .join('\n\n');

  return `\u041a\u043e\u043d\u0442\u0435\u043a\u0441\u0442 \u043f\u043e\u043f\u0435\u0440\u0435\u0434\u043d\u044c\u043e\u0457 \u0440\u043e\u0437\u043c\u043e\u0432\u0438:\n${context}\n\n\u041f\u043e\u0442\u043e\u0447\u043d\u0435 \u0437\u0430\u043f\u0438\u0442\u0430\u043d\u043d\u044f: ${query}`;
}

export function useMCPTool(
  toolName: string,
  options: UseMCPToolOptions = {}
) {
  const {
    addMessage,
    updateMessage,
    addThinkingStep,
    setStreaming,
    setStreamController,
    setCurrentTool,
  } = useChatStore();

  const { maxPrecedents } = useSettingsStore();

  const { enableStreaming = true, onSuccess, onError } = options;

  const executeTool = useCallback(
    async (params: any) => {
      // 1. Add user message
      const userMessage = {
        id: Date.now().toString(),
        role: 'user' as const,
        content:
          typeof params === 'string'
            ? params
            : params.query || JSON.stringify(params, null, 2),
      };
      addMessage(userMessage);

      // 2. Auto-create conversation if needed (for persistence)
      const state = useChatStore.getState();
      if (!state.conversationId && localStorage.getItem('auth_token')) {
        await state.createConversation();
      }
      // Sync user message to server
      useChatStore.getState().syncMessage(userMessage);

      // 3. Build contextual query from prior messages
      const currentMessages = useChatStore.getState().messages;
      // Messages before the just-added user message (all except the last one)
      const priorMessages = currentMessages.slice(0, -1);
      let toolParams = typeof params === 'string' ? { query: params } : { ...params };
      if (priorMessages.length >= 2 && typeof toolParams.query === 'string') {
        toolParams.query = buildContextualQuery(toolParams.query, priorMessages);
      }

      // 4. Create placeholder for assistant message
      const assistantMessageId = (Date.now() + 1).toString();
      const assistantMessage = {
        id: assistantMessageId,
        role: 'assistant' as const,
        content: '',
        isStreaming: true,
        thinkingSteps: [],
      };
      addMessage(assistantMessage);
      setStreaming(true);
      setCurrentTool(toolName);

      try {
        if (enableStreaming) {
          // Streaming mode
          const controller = await mcpService.streamTool(toolName, toolParams, {
            onConnected: (data) => {
              console.log('SSE connected:', data);
            },

            onProgress: (data) => {
              // Add thinking step for each progress event
              const step = {
                id: `step-${data.step}`,
                title: `${data.action}: ${data.message}`,
                content: data.result
                  ? JSON.stringify(data.result, null, 2)
                  : '',
                isComplete: !!data.result,
              };
              addThinkingStep(assistantMessageId, step);
            },

            onComplete: (data) => {
              // Transform result to message format
              const finalMessage = mcpService.transformToolResultToMessage(
                toolName,
                data
              );

              // Update placeholder message with final content
              updateMessage(assistantMessageId, {
                content: finalMessage.content,
                isStreaming: false,
                decisions: finalMessage.decisions,
                citations: finalMessage.citations,
                thinkingSteps: finalMessage.thinkingSteps,
              });

              setStreaming(false);
              setStreamController(null);
              setCurrentTool(null);

              // Sync assistant message to server
              const completedState = useChatStore.getState();
              const completedMsg = completedState.messages.find(
                (m) => m.id === assistantMessageId
              );
              if (completedMsg) {
                completedState.syncMessage(completedMsg);
              }

              // Auto-title on first exchange
              if (completedState.conversationId && completedState.messages.length <= 3) {
                const firstUserMsg = completedState.messages.find((m) => m.role === 'user');
                if (firstUserMsg) {
                  const title = firstUserMsg.content.slice(0, 60).trim();
                  completedState.renameConversation(completedState.conversationId, title);
                }
              }

              onSuccess?.(data);
            },

            onError: (error) => {
              updateMessage(assistantMessageId, {
                content: `\u041f\u043e\u043c\u0438\u043b\u043a\u0430: ${error.message}`,
                isStreaming: false,
              });
              setStreaming(false);
              setStreamController(null);
              setCurrentTool(null);
              showToast.error(error.message);

              onError?.(new Error(error.message));
            },

            onEnd: () => {
              console.log('SSE stream ended');
            },
          });

          setStreamController(controller);
        } else {
          // Synchronous mode (fallback)
          const result = await mcpService.callTool(toolName, toolParams);
          const finalMessage = mcpService.transformToolResultToMessage(
            toolName,
            result
          );

          updateMessage(assistantMessageId, {
            ...finalMessage,
            id: assistantMessageId,
            isStreaming: false,
          });

          setStreaming(false);
          setCurrentTool(null);

          // Sync assistant message to server
          const completedState = useChatStore.getState();
          const completedMsg = completedState.messages.find(
            (m) => m.id === assistantMessageId
          );
          if (completedMsg) {
            completedState.syncMessage(completedMsg);
          }

          // Auto-title on first exchange
          if (completedState.conversationId && completedState.messages.length <= 3) {
            const firstUserMsg = completedState.messages.find((m) => m.role === 'user');
            if (firstUserMsg) {
              const title = firstUserMsg.content.slice(0, 60).trim();
              completedState.renameConversation(completedState.conversationId, title);
            }
          }

          onSuccess?.(result);
        }
      } catch (error: any) {
        updateMessage(assistantMessageId, {
          content: `\u041f\u043e\u043c\u0438\u043b\u043a\u0430: ${error.message || '\u041d\u0435\u0432\u0456\u0434\u043e\u043c\u0430 \u043f\u043e\u043c\u0438\u043b\u043a\u0430'}`,
          isStreaming: false,
        });
        setStreaming(false);
        setCurrentTool(null);
        showToast.error(error.message || '\u041d\u0435\u0432\u0456\u0434\u043e\u043c\u0430 \u043f\u043e\u043c\u0438\u043b\u043a\u0430');

        onError?.(error);
      }
    },
    [
      toolName,
      enableStreaming,
      addMessage,
      updateMessage,
      addThinkingStep,
      setStreaming,
      setStreamController,
      setCurrentTool,
      maxPrecedents,
      onSuccess,
      onError,
    ]
  );

  return { executeTool };
}

/**
 * useAIChat Hook
 * Calls the agentic /api/chat endpoint with SSE streaming.
 * The LLM automatically selects and calls tools, then generates a synthesized answer.
 */
export function useAIChat(options: UseMCPToolOptions = {}) {
  const {
    addMessage,
    updateMessage,
    addThinkingStep,
    setStreaming,
    setStreamController,
    setCurrentTool,
  } = useChatStore();

  const { onSuccess, onError } = options;

  // Accumulate evidence across multiple tool calls in one chat session
  const accumulatedDecisions = useRef<Decision[]>([]);
  const accumulatedCitations = useRef<Citation[]>([]);
  const accumulatedDocuments = useRef<VaultDocument[]>([]);
  // Ref to accumulate streaming answer text without stale closure issues
  const contentRef = useRef('');
  // Track execution plan for step-completion matching
  const planRef = useRef<ExecutionPlan | null>(null);
  // Track cost summary data from complete + cost_summary events
  const costSummaryRef = useRef<Partial<CostSummary>>({});

  const executeChat = useCallback(
    async (query: string, documentIds?: string[]) => {
      // Reset accumulators for new chat request
      accumulatedDecisions.current = [];
      accumulatedCitations.current = [];
      accumulatedDocuments.current = [];
      contentRef.current = '';
      planRef.current = null;
      costSummaryRef.current = {};
      // 1. Add user message
      const userMessage = {
        id: Date.now().toString(),
        role: 'user' as const,
        content: query,
      };
      addMessage(userMessage);

      // 2. Auto-create conversation if needed
      const state = useChatStore.getState();
      if (!state.conversationId && localStorage.getItem('auth_token')) {
        await state.createConversation();
      }
      useChatStore.getState().syncMessage(userMessage);

      // 3. Build history from prior messages
      const currentMessages = useChatStore.getState().messages;
      const history = currentMessages
        .slice(0, -1) // exclude the just-added user message
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .slice(-6) // last 3 exchanges
        .map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content.slice(0, 1000),
        }));

      // 4. Create placeholder assistant message
      const assistantMessageId = (Date.now() + 1).toString();
      addMessage({
        id: assistantMessageId,
        role: 'assistant' as const,
        content: '',
        isStreaming: true,
        thinkingSteps: [],
      });
      setStreaming(true);
      setCurrentTool('ai_chat');

      try {
        const chatConversationId = useChatStore.getState().conversationId || undefined;
        const controller = await mcpService.streamChat(query, history, {
          onPlan: (data) => {
            // Store the plan and add it to the message for UI rendering
            const plan: ExecutionPlan = {
              goal: data.goal,
              steps: data.steps.map((s) => ({ ...s, completed: false })),
              expected_iterations: data.expected_iterations,
            };
            planRef.current = plan;
            updateMessage(assistantMessageId, { executionPlan: plan });

            // Also add a thinking step showing the plan
            const planSummary = data.steps
              .map((s) => `${s.id}. ${s.purpose}`)
              .join('\n');
            addThinkingStep(assistantMessageId, {
              id: 'plan',
              title: `📋 Стратегія: ${data.goal}`,
              content: planSummary,
              isComplete: true,
            });
          },

          onBudgetEscalated: (data) => {
            showToast.info(
              `🔬 Глибокий аналіз — орієнтовна вартість $${data.estimatedCost.minUsd.toFixed(2)}–$${data.estimatedCost.maxUsd.toFixed(2)}`,
              6000
            );
          },

          onThinking: (data) => {
            // Clear partial streamed text when entering a tool-calling iteration
            contentRef.current = '';

            // Mark matching plan step as in-progress
            if (planRef.current) {
              const matchingStep = planRef.current.steps.find((s) => s.tool === data.tool);
              if (matchingStep && !matchingStep.completed) {
                matchingStep.completed = true;
                updateMessage(assistantMessageId, {
                  executionPlan: { ...planRef.current, steps: [...planRef.current.steps] },
                });
              }
            }

            const costSuffix = data.cost_usd ? ` · $${data.cost_usd.toFixed(4)}` : '';
            addThinkingStep(assistantMessageId, {
              id: `step-${data.step}`,
              title: (data.description || `🔍 ${getToolLabel(data.tool)}`) + costSuffix,
              content: JSON.stringify(data.params, null, 2),
              isComplete: false,
            });
          },

          onToolResult: (data) => {
            // Update the last thinking step as complete and add result preview
            const toolPreview = typeof data.result === 'string'
              ? data.result.slice(0, 500)
              : JSON.stringify(data.result, null, 2).slice(0, 500);

            const costSuffix = data.cost_usd ? ` · $${data.cost_usd.toFixed(4)}` : '';
            addThinkingStep(assistantMessageId, {
              id: `result-${data.tool}`,
              title: `✓ ${getToolLabel(data.tool)}` + costSuffix,
              content: toolPreview,
              isComplete: true,
            });

            // Extract decisions & citations from tool results
            const evidence = extractEvidenceFromToolResult(data.tool, data.result);
            console.log('[AIChat] Evidence extraction', {
              tool: data.tool,
              decisions: evidence.decisions.length,
              citations: evidence.citations.length,
              documents: evidence.documents.length,
            });
            if (evidence.decisions.length > 0) {
              accumulatedDecisions.current.push(...evidence.decisions);
            }
            if (evidence.citations.length > 0) {
              accumulatedCitations.current.push(...evidence.citations);
            }
            if (evidence.documents.length > 0) {
              accumulatedDocuments.current.push(...evidence.documents);
            }

            // Update message with accumulated evidence so far (for live RightPanel updates)
            if (accumulatedDecisions.current.length > 0 || accumulatedCitations.current.length > 0 || accumulatedDocuments.current.length > 0) {
              updateMessage(assistantMessageId, {
                decisions: [...accumulatedDecisions.current],
                citations: [...accumulatedCitations.current],
                documents: [...accumulatedDocuments.current],
              });
            }
          },

          onAnswerDelta: (data) => {
            contentRef.current += data.text;
            updateMessage(assistantMessageId, { content: contentRef.current });
          },

          onAnswer: (data) => {
            // Reconcile with final answer text from server
            contentRef.current = data.text;

            // Extract law norm references mentioned in the answer text
            const answerNorms = extractNormsFromAnswer(data.text);
            if (answerNorms.length > 0) {
              accumulatedCitations.current.push(...answerNorms);
            }

            updateMessage(assistantMessageId, {
              content: data.text,
              isStreaming: false,
              decisions: accumulatedDecisions.current.length > 0
                ? [...accumulatedDecisions.current]
                : undefined,
              citations: accumulatedCitations.current.length > 0
                ? [...accumulatedCitations.current]
                : undefined,
              documents: accumulatedDocuments.current.length > 0
                ? [...accumulatedDocuments.current]
                : undefined,
            });

            setStreaming(false);
            setStreamController(null);
            setCurrentTool(null);

            // Sync assistant message to server
            const completedState = useChatStore.getState();
            const completedMsg = completedState.messages.find(
              (m) => m.id === assistantMessageId
            );
            if (completedMsg) {
              completedState.syncMessage(completedMsg);
            }

            // Auto-title on first exchange
            if (completedState.conversationId && completedState.messages.length <= 3) {
              const firstUserMsg = completedState.messages.find((m) => m.role === 'user');
              if (firstUserMsg) {
                const title = firstUserMsg.content.slice(0, 60).trim();
                completedState.renameConversation(completedState.conversationId, title);
              }
            }

            onSuccess?.(data);
          },

          onCitationWarning: (data) => {
            // Accumulate citation warnings on the assistant message
            const currentMsg = useChatStore.getState().messages.find(
              (m) => m.id === assistantMessageId
            );
            const existing = currentMsg?.citationWarnings || [];
            updateMessage(assistantMessageId, {
              citationWarnings: [
                ...existing,
                {
                  case_number: data.case_number,
                  status: data.status,
                  confidence: data.confidence,
                  message: data.message,
                },
              ],
            });
          },

          onError: (error) => {
            updateMessage(assistantMessageId, {
              content: `Помилка: ${error.message}`,
              isStreaming: false,
            });
            setStreaming(false);
            setStreamController(null);
            setCurrentTool(null);
            showToast.error(error.message);
            onError?.(new Error(error.message));
          },

          onComplete: (data) => {
            // Store cost data from complete event
            if (data.tools_used || data.total_cost_usd != null || data.charged_usd != null) {
              costSummaryRef.current = {
                ...costSummaryRef.current,
                tools_used: data.tools_used || [],
                total_cost_usd: data.total_cost_usd || 0,
                charged_usd: data.charged_usd || 0,
              };
              updateMessage(assistantMessageId, {
                costSummary: costSummaryRef.current as CostSummary,
              });
            }
            console.log('[AIChat] Complete', data);
          },

          onCostSummary: (data) => {
            // Merge balance info from cost_summary event
            costSummaryRef.current = {
              ...costSummaryRef.current,
              charged_usd: data.charged_usd,
              balance_usd: data.balance_usd,
            };
            updateMessage(assistantMessageId, {
              costSummary: costSummaryRef.current as CostSummary,
            });
          },
        }, 'standard', chatConversationId);

        setStreamController(controller);
      } catch (error: any) {
        updateMessage(assistantMessageId, {
          content: `Помилка: ${error.message || 'Невідома помилка'}`,
          isStreaming: false,
        });
        setStreaming(false);
        setCurrentTool(null);
        showToast.error(error.message || 'Невідома помилка');
        onError?.(error);
      }
    },
    [addMessage, updateMessage, addThinkingStep, setStreaming, setStreamController, setCurrentTool, onSuccess, onError]
  );

  return { executeChat };
}

