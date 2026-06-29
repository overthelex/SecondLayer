/**
 * Legislation Analytics Tools — norm-impact analysis over Ukrainian legislation.
 *
 * 1 tool:
 * - analyze_law_amendments — історія редакцій статті/закону: скільки правок,
 *   коли, як змінювався обсяг тексту. (CORE-89, Фаза A.)
 *
 * Phase A scope (this handler): amendment timeline + counts + size evolution,
 * read entirely from the backend DB (legislation / legislation_editions /
 * legislation_articles). The two enrichment layers — amendment *intent* (from
 * bills.explanatory_note) and *court impact* (ITS over EDRSR) — depend on
 * CORE-90 (legislation_editions.amending_law_number) and an EDRSR temporal
 * join; they are returned as structured `pending` placeholders so the response
 * contract stays stable across phases.
 *
 * Additive by design: no existing tool, table, or query is modified.
 */

import { BaseToolHandler, ToolDefinition, ToolResult } from '../base-tool-handler.js';
import { logger } from '../../utils/logger.js';

/**
 * Code aliases → zakon.rada.gov.ua rada_id. Mirrors the subset used by
 * LegislationService.codeMap; kept local so this handler stays self-contained
 * and does not couple to (or modify) the legislation-service resolver.
 */
const LAW_CODE_ALIASES: Record<string, string> = {
  'ЦПК': '1618-15',
  'ГПК': '1798-12',
  'КАС': '2747-15',
  'КПК': '4651-17',
  'ЦК': '435-15',
  'ГК': '436-15',
  'ПКУ': '2755-17',
  'КЗПП': '322-08',
  'КЗПП ': '322-08',
  'СК': '2947-14',
  'ЗК': '2768-14',
  'КК': '2341-14',
  'КУ': '254к/96-вр',
  'КУПАП': '80731-10',
};

interface DbLike {
  query: (sql: string, params?: any[]) => Promise<{ rows: any[] }>;
}

export class LegislationAnalyticsTools extends BaseToolHandler {
  constructor(private readonly db?: DbLike) {
    super();
  }

  getToolDefinitions(): ToolDefinition[] {
    return [
      {
        name: 'analyze_law_amendments',
        annotations: {
          title: 'Аналіз правок закону',
          readOnlyHint: true,
          idempotentHint: true,
        },
        description: `Історія редакцій закону або конкретної статті: скільки разів змінювали, коли, як змінювався обсяг тексту.

Приймає law (скорочення на кшталт "КК", "ЦК", "ПКУ" або rada_id напр. "2341-14") та необовʼязковий article (номер статті, напр. "185").
Повертає: метадані закону, таймлайн редакцій (з датами), кількість правок, еволюцію обсягу статті.
Намір правок (пояснювальні записки) та вплив на судову практику — наступні фази аналітики.`,
        inputSchema: {
          type: 'object',
          properties: {
            law: {
              type: 'string',
              description: 'Скорочення кодексу ("КК", "ЦК", "ПКУ"...) або rada_id ("2341-14")',
            },
            article: {
              type: 'string',
              description: 'Номер статті (напр. "185"). Якщо не вказано — аналіз редакцій усього закону.',
            },
          },
          required: ['law'],
        },
      },
    ];
  }

  async executeTool(name: string, args: any): Promise<ToolResult | null> {
    if (name !== 'analyze_law_amendments') return null;
    return this.analyzeLawAmendments(args);
  }

  /** Resolve a user-supplied law identifier to a rada_id. */
  private resolveRadaId(input: string): string {
    const trimmed = String(input || '').trim();
    const upper = trimmed.toUpperCase();
    return LAW_CODE_ALIASES[upper] || trimmed;
  }

  private async analyzeLawAmendments(args: any): Promise<ToolResult> {
    if (!this.db) {
      return this.wrapResponse({
        error: 'База даних законодавства недоступна для аналізу редакцій.',
      });
    }

    const lawInput = String(args?.law || '').trim();
    if (!lawInput) {
      return this.wrapError('Параметр law є обовʼязковим (скорочення кодексу або rada_id).');
    }
    const article = args?.article != null ? String(args.article).trim() : '';
    const radaId = this.resolveRadaId(lawInput);

    try {
      // 1. Resolve the law
      const lawRes = await this.db.query(
        `SELECT id, rada_id, type, title, short_title, adoption_date, effective_date,
                last_amended_date, status, total_editions, total_articles
         FROM legislation
         WHERE rada_id = $1
         LIMIT 1`,
        [radaId]
      );

      if (lawRes.rows.length === 0) {
        return this.wrapResponse({
          error: `Закон "${lawInput}" (rada_id: ${radaId}) не знайдено в базі законодавства.`,
          provided_value: lawInput,
          resolved_rada_id: radaId,
          hint: 'Перевірте скорочення або вкажіть rada_id з zakon.rada.gov.ua (напр. "2341-14" для КК).',
        });
      }

      const law = lawRes.rows[0];

      // 2. Law-level edition timeline
      const editionsRes = await this.db.query(
        `SELECT edition_date, edition_key, article_count
         FROM legislation_editions
         WHERE legislation_id = $1
         ORDER BY edition_date ASC`,
        [law.id]
      );
      const editions = editionsRes.rows.map((r) => ({
        edition_date: r.edition_date,
        edition_key: r.edition_key,
        article_count: r.article_count ?? null,
      }));

      // 3. Article-level version timeline (optional)
      let articleAnalysis: any = null;
      if (article) {
        const digits = article.replace(/\D/g, '');
        const versionsRes = await this.db.query(
          `SELECT version_date, byte_size, is_current, article_number, title
           FROM legislation_articles
           WHERE legislation_id = $1
             AND regexp_replace(article_number, '\\D', '', 'g') = $2
           ORDER BY version_date ASC`,
          [law.id, digits]
        );
        const versions = versionsRes.rows.map((r) => ({
          version_date: r.version_date,
          byte_size: r.byte_size ?? null,
          is_current: r.is_current,
        }));

        if (versions.length === 0) {
          articleAnalysis = {
            article,
            found: false,
            note: `Статтю "${article}" не знайдено у збережених редакціях закону. Можливо, потрібна догрузка історичних редакцій (CORE-90).`,
          };
        } else {
          const first = versions[0];
          const last = versions[versions.length - 1];
          const sizeFirst = first.byte_size ?? null;
          const sizeLast = last.byte_size ?? null;
          articleAnalysis = {
            article,
            found: true,
            article_label: versionsRes.rows[0].article_number,
            versions_count: versions.length,
            first_version: first.version_date,
            last_version: last.version_date,
            size_bytes_first: sizeFirst,
            size_bytes_last: sizeLast,
            size_growth_pct:
              sizeFirst && sizeLast ? Math.round(((sizeLast - sizeFirst) / sizeFirst) * 100) : null,
            versions,
          };
        }
      }

      // 4. Assemble response (pending layers kept as stable placeholders)
      const result = {
        law: {
          rada_id: law.rada_id,
          title: law.title,
          short_title: law.short_title ?? null,
          type: law.type,
          status: law.status,
          adoption_date: law.adoption_date,
          effective_date: law.effective_date,
          last_amended_date: law.last_amended_date,
        },
        amendments: {
          law_level: {
            editions_count: editions.length || law.total_editions || 0,
            editions,
          },
          article_level: articleAnalysis,
        },
        intent: {
          status: 'pending',
          note:
            'Намір правок (пояснювальні записки законопроєктів) додається після CORE-90: '
            + 'legislation_editions.amending_law_number → bills.explanatory_note.',
        },
        court_impact: {
          status: 'pending',
          method: 'interrupted_time_series',
          note:
            'Оцінка впливу на судову практику (до/після набрання чинності) додається після '
            + 'CORE-90 + EDRSR темпорального join. Кореляція, не причинність.',
        },
        disclaimer:
          'Дані редакцій — з legislation_editions / legislation_articles. '
          + 'Намір та судовий вплив рахуються в наступних фазах (CORE-89 Фаза B / CORE-90).',
      };

      logger.info('[LegislationAnalytics] analyze_law_amendments', {
        law: lawInput,
        radaId,
        article: article || null,
        editions: editions.length,
        articleVersions: articleAnalysis?.versions_count ?? null,
      });

      return this.wrapResponse(result);
    } catch (error: any) {
      logger.error('[LegislationAnalytics] analyze_law_amendments failed', {
        law: lawInput,
        radaId,
        error: error?.message,
      });
      return this.wrapResponse({
        error: 'Аналіз редакцій тимчасово недоступний.',
        detail: error?.message,
        provided_value: lawInput,
      });
    }
  }
}
