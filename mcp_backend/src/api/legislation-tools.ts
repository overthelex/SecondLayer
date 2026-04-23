import type { ICachePort } from '../domain/ports/index.js';
import { LegislationService, normalizeRadaId, parseKmuPrefix } from '../services/legislation-service';
import { LegislationRenderer } from '../services/legislation-renderer';
import { LegalPatternStore } from '../services/legal-pattern-store.js';
import { logger } from '../utils/logger';
import { BaseToolHandler, ToolDefinition, ToolResult } from './base-tool-handler.js';

export interface LegislationToolArgs {
  rada_id?: string;
  article_number?: string;
  article_numbers?: string[];
  query?: string;
  limit?: number;
  include_html?: boolean;
  include_court_practice?: boolean;
  theme?: 'light' | 'dark';
}

export class LegislationTools extends BaseToolHandler {
  private service: LegislationService;
  private renderer: LegislationRenderer;
  private patternStore?: LegalPatternStore;

  constructor(
    service: LegislationService,
    renderer?: LegislationRenderer,
    patternStore?: LegalPatternStore
  ) {
    super();
    this.service = service;
    this.renderer = renderer || new LegislationRenderer();
    this.patternStore = patternStore;
  }

  getLegislationService(): LegislationService {
    return this.service;
  }

  /**
   * Устанавливает Redis клиент для AI-классификации законодательства
   */
  setRedisClient(redis: ICachePort | null): void {
    this.service.setRedisClient(redis);
  }

  async getLegislationSection(args: LegislationToolArgs): Promise<any> {
    const query = typeof args.query === 'string' ? args.query.trim()
      : typeof (args as any).legislation_reference === 'string' ? (args as any).legislation_reference.trim()
      : '';
    const radaId = args.rada_id ? String(args.rada_id).trim() : '';
    const articleNumber = args.article_number ? String(args.article_number).trim() : '';

    let resolved: { radaId: string; articleNumber: string; source?: 'regexp' | 'ai'; confidence?: number } | null = null;

    // Если явно переданы rada_id и article_number, используем их
    if (radaId && articleNumber) {
      resolved = { radaId: normalizeRadaId(radaId), articleNumber };
    }
    // rada_id + query без article_number → векторный поиск по конкретному НПА
    else if (radaId && query && !articleNumber) {
      logger.info('[MCP Tool] get_legislation_section: vector search within legislation', {
        rada_id: radaId,
        query: query.substring(0, 80),
      });

      const relevantArticles = await this.service.findRelevantArticles(query, normalizeRadaId(radaId), 3);
      if (relevantArticles.length > 0) {
        const response: any = {
          rada_id: normalizeRadaId(radaId),
          search_query: query,
          articles: relevantArticles.map(a => ({
            article_number: a.article_number,
            title: a.title,
            full_text: a.full_text,
            url: a.url,
            metadata: a.metadata,
          })),
          resolved_from: { query, method: 'vector_search' },
        };
        return response;
      }

      return {
        error: `No relevant articles found in legislation ${radaId} for query: ${query}`,
        suggestion: 'Try a more specific query or provide an article_number',
      };
    }
    // Иначе пытаемся парсить из query
    else if (query) {
      // Используем AI-классификацию для улучшенного парсинга
      const aiResult = await this.service.parseArticleReferenceWithAI(query);
      if (aiResult) {
        resolved = aiResult;
      }
    }

    if (!resolved) {
      throw new Error('Provide either (rada_id + article_number), (rada_id + query), or query like "ст. 625 ЦК" or "стаття 44 податкового кодексу"');
    }

    // Resolve KMU:/KMU-Р: prefix
    const kmuPrefix = parseKmuPrefix(resolved.radaId);
    if (kmuPrefix) {
      const resolvedId = await this.service.resolveKmuRadaId(kmuPrefix.kmuNumber, kmuPrefix.docType);
      if (resolvedId) {
        resolved.radaId = resolvedId;
      } else {
        const docLabel = kmuPrefix.docType === '-р' ? 'Розпорядження' : 'Постанову';
        return {
          error: `${docLabel} КМУ №${kmuPrefix.kmuNumber} не знайдено на zakon.rada.gov.ua`,
          suggestion: `Перевірте номер ${kmuPrefix.docType === '-р' ? 'розпорядження' : 'постанови'}`,
        };
      }
    }

    logger.info('[MCP Tool] get_legislation_section started', {
      rada_id: resolved.radaId,
      article_number: resolved.articleNumber,
      source: resolved.source || 'explicit',
      confidence: resolved.confidence,
      from_query: Boolean(query) && !(radaId && articleNumber),
      query: query.substring(0, 50)
    });

    const article = await this.service.getArticle(resolved.radaId, resolved.articleNumber);
    if (!article) {
      return {
        error: `Article ${resolved.articleNumber} not found in legislation ${resolved.radaId}`,
        suggestion: 'Check if the article number is correct or if the legislation is available',
      };
    }

    const response: any = {
      rada_id: article.rada_id,
      article_number: article.article_number,
      title: article.title,
      full_text: article.full_text,
      url: article.url,
      metadata: article.metadata,
      npa_title: article.npa_title,
      section_number: article.section_number,
      section_title: article.section_title,
      chapter_number: article.chapter_number,
      chapter_title: article.chapter_title,
      resolved_from: query && !(radaId && articleNumber) ? {
        query,
        method: resolved.source || 'explicit',
        confidence: resolved.confidence
      } : undefined,
    };

    if (args.include_html) {
      response.html = this.renderer.renderArticleHTML(article, {
        theme: args.theme || 'light',
        format: 'full',
      });
    }

    return response;
  }

  async getLegislationArticles(args: LegislationToolArgs): Promise<any> {
    if (!args.rada_id || !args.article_numbers || args.article_numbers.length === 0) {
      throw new Error('rada_id and article_numbers array are required');
    }

    logger.info('[MCP Tool] get_legislation_articles started', {
      rada_id: args.rada_id,
      article_count: args.article_numbers.length,
      articles: args.article_numbers.join(', ')
    });

    const articles = await this.service.getMultipleArticles(args.rada_id, args.article_numbers);

    if (articles.length === 0) {
      return {
        error: `No articles found for ${args.rada_id}`,
        requested: args.article_numbers,
      };
    }

    const response: any = {
      rada_id: args.rada_id,
      total_found: articles.length,
      articles: articles.map(a => ({
        article_number: a.article_number,
        title: a.title,
        full_text: a.full_text,
        url: a.url,
        npa_title: a.npa_title,
        section_number: a.section_number,
        section_title: a.section_title,
        chapter_number: a.chapter_number,
        chapter_title: a.chapter_title,
      })),
    };

    if (args.include_html) {
      const structure = await this.service.getLegislationStructure(args.rada_id);
      response.html = this.renderer.renderMultipleArticlesHTML(
        articles,
        structure?.title || args.rada_id,
        {
          includeNavigation: true,
          highlightArticles: args.article_numbers,
          theme: args.theme || 'light',
        }
      );
    }

    return response;
  }

  async searchLegislation(args: LegislationToolArgs): Promise<any> {
    if (!args.query) {
      throw new Error('query is required');
    }

    const limit = args.limit || 10;
    logger.info('[MCP Tool] search_legislation started', {
      query: args.query.substring(0, 100),
      limit
    });

    // Пытаемся определить прямую ссылку на статью с помощью AI
    const directRef = await this.service.parseArticleReferenceWithAI(args.query);
    if (directRef) {
      // Resolve KMU:/KMU-Р: prefix to actual rada_id
      let resolvedRadaId = directRef.radaId;
      const kmuPrefix = parseKmuPrefix(resolvedRadaId);
      if (kmuPrefix) {
        const resolved = await this.service.resolveKmuRadaId(kmuPrefix.kmuNumber, kmuPrefix.docType);
        if (resolved) {
          resolvedRadaId = resolved;
        } else {
          const docLabel = kmuPrefix.docType === '-р' ? 'Розпорядження' : 'Постанову';
          return {
            query: args.query,
            total_found: 0,
            articles: [],
            suggestion: `${docLabel} КМУ №${kmuPrefix.kmuNumber} не знайдено на zakon.rada.gov.ua. Перевірте номер.`,
          };
        }
      }

      // If we have an article/punkt number, fetch it directly
      if (directRef.articleNumber) {
        const article = await this.service.getArticle(resolvedRadaId, directRef.articleNumber);
        if (!article) {
          // Article not found but legislation exists — return structure
          const structure = await this.service.getLegislationStructure(resolvedRadaId);
          return {
            query: args.query,
            total_found: 0,
            articles: [],
            legislation_found: structure ? {
              rada_id: resolvedRadaId,
              title: structure.title,
              total_articles: structure.total_articles,
              url: `https://zakon.rada.gov.ua/laws/show/${resolvedRadaId}`,
            } : undefined,
            suggestion: `Пункт/стаття ${directRef.articleNumber} не знайдено в ${resolvedRadaId}. Перевірте номер.`,
          };
        }

        const response: any = {
          query: args.query,
          resolved_reference: {
            rada_id: resolvedRadaId,
            article_number: directRef.articleNumber,
            source: directRef.source,
            confidence: directRef.confidence,
          },
          total_found: 1,
          articles: [
            {
              rada_id: article.rada_id,
              article_number: article.article_number,
              title: article.title,
              full_text: article.full_text,
              url: article.url,
              npa_title: article.npa_title,
              section_number: article.section_number,
              section_title: article.section_title,
              chapter_number: article.chapter_number,
              chapter_title: article.chapter_title,
            },
          ],
        };

        if (args.include_html) {
          response.html = this.renderer.renderArticleHTML(article, {
            theme: args.theme || 'light',
            format: 'full',
          });
        }

        return response;
      }

      // No article number — return legislation structure/overview
      await this.service.ensureLegislationExists(resolvedRadaId);
      const structure = await this.service.getLegislationStructure(resolvedRadaId);
      if (structure) {
        return {
          query: args.query,
          resolved_reference: {
            rada_id: resolvedRadaId,
            source: directRef.source,
            confidence: directRef.confidence,
          },
          total_found: structure.total_articles || 0,
          legislation: {
            rada_id: resolvedRadaId,
            title: structure.title,
            type: structure.type,
            total_articles: structure.total_articles,
            url: `https://zakon.rada.gov.ua/laws/show/${resolvedRadaId}`,
            table_of_contents: structure.table_of_contents,
          },
          articles: structure.articles.slice(0, limit).map((a: any) => ({
            rada_id: resolvedRadaId,
            article_number: a.article_number,
            title: a.title,
            full_text: a.full_text || '',
            url: `https://zakon.rada.gov.ua/laws/show/${resolvedRadaId}#n${a.article_number}`,
          })),
        };
      }
    }

    const articles = await this.service.findRelevantArticles(
      args.query,
      args.rada_id,
      limit
    );

    if (articles.length === 0) {
      return {
        query: args.query,
        total_found: 0,
        articles: [],
        suggestion: 'Try a different search query or check if the legislation is loaded',
      };
    }

    const response: any = {
      query: args.query,
      total_found: articles.length,
      articles: articles.map(a => ({
        rada_id: a.rada_id,
        article_number: a.article_number,
        title: a.title,
        full_text: a.full_text || '',
        url: a.url,
        npa_title: a.npa_title,
        section_number: a.section_number,
        section_title: a.section_title,
        chapter_number: a.chapter_number,
        chapter_title: a.chapter_title,
      })),
    };

    // Supplement with court practice references if requested
    if (args.include_court_practice && this.patternStore) {
      try {
        const patterns = await this.patternStore.findPatterns(args.query);
        if (patterns.length > 0) {
          const patternArticles = new Set<string>();
          for (const pattern of patterns) {
            pattern.law_articles.forEach((a: string) => patternArticles.add(a));
          }
          response.court_practice_references = {
            from_court_practice: Array.from(patternArticles).slice(0, 5),
            patterns_count: patterns.length,
          };
        }
      } catch {
        // Pattern store is optional
      }
    }

    if (args.include_html && articles.length > 0) {
      const firstRadaId = articles[0].rada_id;
      const structure = await this.service.getLegislationStructure(firstRadaId);
      response.html = this.renderer.renderMultipleArticlesHTML(
        articles,
        structure?.title || 'Результати пошуку',
        {
          includeNavigation: false,
          theme: args.theme || 'light',
        }
      );
    }

    return response;
  }

  async getLegislationStructure(args: LegislationToolArgs & { force_refresh?: boolean }): Promise<any> {
    if (!args.rada_id) {
      throw new Error('rada_id is required');
    }

    let radaId = args.rada_id;
    // Resolve KMU:/KMU-Р: prefix
    const structKmuPrefix = parseKmuPrefix(radaId);
    if (structKmuPrefix) {
      const resolved = await this.service.resolveKmuRadaId(structKmuPrefix.kmuNumber, structKmuPrefix.docType);
      if (resolved) {
        radaId = resolved;
      } else {
        const docLabel = structKmuPrefix.docType === '-р' ? 'Розпорядження' : 'Постанову';
        return {
          error: `${docLabel} КМУ №${structKmuPrefix.kmuNumber} не знайдено`,
          suggestion: `Перевірте номер ${structKmuPrefix.docType === '-р' ? 'розпорядження' : 'постанови'}`,
        };
      }
    }

    logger.info(`Getting structure for ${radaId}`, { force_refresh: args.force_refresh });

    const structure = await this.service.getLegislationStructure(radaId, args.force_refresh);

    if (!structure) {
      return {
        error: `Legislation ${args.rada_id} not found`,
        suggestion: 'Load the legislation first using ensureLegislationExists',
      };
    }

    return {
      rada_id: structure.rada_id,
      title: structure.title,
      short_title: structure.short_title,
      type: structure.type,
      total_articles: structure.total_articles,
      table_of_contents: structure.table_of_contents,
      articles_summary: structure.articles.map((a: any) => ({
        article_number: a.article_number,
        title: a.title,
        byte_size: a.byte_size,
      })),
    };
  }

  async extractLegislationReferences(text: string): Promise<any[]> {
    const references: any[] = [];
    
    const patterns = [
      { regex: /стаття\s+(\d+(?:-\d+)?)\s+ЦПК/gi, rada_id: '1618-15', code: 'ЦПК' },
      { regex: /стаття\s+(\d+(?:-\d+)?)\s+ГПК/gi, rada_id: '435-15', code: 'ГПК' },
      { regex: /стаття\s+(\d+(?:-\d+)?)\s+КАС/gi, rada_id: '2747-15', code: 'КАС' },
      { regex: /стаття\s+(\d+(?:-\d+)?)\s+КПК/gi, rada_id: '4651-17', code: 'КПК' },
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.regex.exec(text)) !== null) {
        const articleNumber = match[1];
        
        try {
          const article = await this.service.getArticle(pattern.rada_id, articleNumber);
          if (article) {
            references.push({
              code: pattern.code,
              rada_id: pattern.rada_id,
              article_number: articleNumber,
              title: article.title,
              full_text: article.full_text,
              url: article.url,
            });
          }
        } catch (error: any) {
          logger.warn(`Failed to fetch article ${articleNumber} from ${pattern.rada_id}:`, error.message);
        }
      }
    }

    return references;
  }

  getToolDefinitions() {
    return [
      {
        name: 'get_legislation_section',
        description: 'Отримати точний фрагмент/статтю за посиланням (наприклад, "ст. 625 ЦК") або за (rada_id + article_number). Повертає повний текст статті та посилання на джерело.',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Посилання або короткий запит виду "ст. 625 ЦК" / "ст. 44 ПКУ" / "ст. 354 ЦПК"',
            },
            rada_id: {
              type: 'string',
              description: 'ID законодавчого акту (наприклад, "254к/96-вр" для Конституції, "435-15" для ЦК, "436-15" для ГК, "2755-17" для ПКУ, "1618-15" для ЦПК, "2341-14" для КК)',
            },
            article_number: {
              type: 'string',
              description: 'Номер статті (наприклад, "625", "44", "354-1")',
            },
            include_html: {
              type: 'boolean',
              description: 'Чи включати форматований HTML (за замовчуванням false)',
            },
            theme: {
              type: 'string',
              enum: ['light', 'dark'],
              description: 'Тема для HTML (за замовчуванням light)',
            },
          },
          required: [],
        },
      },
      {
        name: 'get_legislation_articles',
        description: 'Отримати кілька статей законодавчого акту одночасно. Корисно для отримання повного контексту (наприклад, статті 354-356 ЦПК про апеляційне оскарження).',
        inputSchema: {
          type: 'object',
          properties: {
            rada_id: {
              type: 'string',
              description: 'ID законодавчого акту',
            },
            article_numbers: {
              type: 'array',
              items: { type: 'string' },
              description: 'Масив номерів статей (наприклад, ["354", "355", "356"])',
            },
            include_html: {
              type: 'boolean',
              description: 'Чи включати форматований HTML з навігацією',
            },
            theme: {
              type: 'string',
              enum: ['light', 'dark'],
            },
          },
          required: ['rada_id', 'article_numbers'],
        },
      },
      {
        name: 'search_legislation',
        description: `Семантичний пошук релевантних статей законодавства за запитом або описом ситуації. Використовує векторний пошук для знаходження найбільш релевантних норм.

Приклади: "поновлення пропущеного строку", "підстави для залишення позову без розгляду", "реєстрація авто з кількома власниками", "затоплення квартири сусідом".

💰 Вартість: $0.01-$0.05 USD (семантичний пошук + OpenAI embedding)`,
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Пошуковий запит або опис юридичної ситуації українською мовою',
            },
            rada_id: {
              type: 'string',
              description: 'Опціонально: обмежити пошук конкретним законодавчим актом',
            },
            limit: {
              type: 'number',
              description: 'Максимальна кількість результатів (за замовчуванням 10)',
            },
            include_html: {
              type: 'boolean',
              description: 'Чи включати форматований HTML',
            },
            include_court_practice: {
              type: 'boolean',
              default: false,
              description: 'Додати посилання з судової практики (які статті згадуються в аналогічних справах)',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'get_legislation_structure',
        description: 'Отримати структуру законодавчого акту (зміст, розділи, глави, список статей). Корисно для навігації по великому документу.',
        inputSchema: {
          type: 'object',
          properties: {
            rada_id: {
              type: 'string',
              description: 'ID законодавчого акту',
            },
          },
          required: ['rada_id'],
        },
      },
      {
        name: 'get_legislation_history',
        description: `Отримати історію змін (редакцій) законодавчого акту. Показує які статті змінювались, коли і в якій редакції.

Використовуй коли потрібно:
- Простежити як змінювалась конкретна норма з часом
- Знайти які постанови/закони вносили зміни до акту
- Проаналізувати еволюцію правового регулювання

💰 Вартість: $0.00 (тільки PostgreSQL запит)`,
        inputSchema: {
          type: 'object',
          properties: {
            rada_id: {
              type: 'string',
              description: 'ID законодавчого акту на zakon.rada.gov.ua (наприклад, "1388-98-п" для Постанови КМУ №1388, "435-15" для ЦК)',
            },
          },
          required: ['rada_id'],
        },
      },
    ];
  }

  async getLegislationHistory(args: { rada_id: string }): Promise<any> {
    if (!args.rada_id) {
      throw new Error('rada_id is required');
    }

    let radaId = normalizeRadaId(args.rada_id);

    // Resolve KMU:/KMU-Р: prefix
    const historyKmuPrefix = parseKmuPrefix(radaId);
    if (historyKmuPrefix) {
      const resolved = await this.service.resolveKmuRadaId(historyKmuPrefix.kmuNumber, historyKmuPrefix.docType);
      if (resolved) {
        radaId = resolved;
      } else {
        const docLabel = historyKmuPrefix.docType === '-р' ? 'Розпорядження' : 'Постанову';
        return {
          rada_id: radaId,
          error: `${docLabel} КМУ №${historyKmuPrefix.kmuNumber} не знайдено на zakon.rada.gov.ua`,
          suggestion: `Перевірте номер ${historyKmuPrefix.docType === '-р' ? 'розпорядження' : 'постанови'}`,
        };
      }
    }

    logger.info('[MCP Tool] get_legislation_history started', { rada_id: radaId });

    // Get amendment history (non-current article versions)
    const history = await this.service.getAmendmentHistory(radaId);

    // Also get current legislation metadata
    const structure = await this.service.getLegislationStructure(radaId);

    if (!structure && history.length === 0) {
      return {
        rada_id: radaId,
        error: `Законодавчий акт ${radaId} не знайдено в базі даних`,
        suggestion: 'Перевірте правильність rada_id. Для постанов КМУ формат: "1388-98-п", для законів: "435-15"',
        url: `https://zakon.rada.gov.ua/laws/show/${radaId}`,
      };
    }

    return {
      rada_id: radaId,
      title: structure?.title || null,
      type: structure?.type || null,
      total_current_articles: structure?.total_articles || null,
      url: `https://zakon.rada.gov.ua/laws/show/${radaId}`,
      amendment_history: history,
      total_amendments: history.length,
      amended_articles: [...new Set(history.map(h => h.article_number))],
      note: history.length === 0
        ? 'Історія змін порожня — можливо акт ще не був змінений або попередні редакції не збережено в базі. Перевірте актуальний текст на zakon.rada.gov.ua'
        : undefined,
    };
  }

  async executeTool(name: string, args: any): Promise<ToolResult | null> {
    switch (name) {
      case 'get_legislation_article': // backward-compat alias
      case 'get_legislation_section':
        return this.wrapResponse(await this.getLegislationSection(args));
      case 'get_legislation_articles':
        return this.wrapResponse(await this.getLegislationArticles(args));
      case 'find_relevant_law_articles': // backward-compat alias
        return this.wrapResponse(await this.searchLegislation({ ...args, include_court_practice: true }));
      case 'search_legislation':
        return this.wrapResponse(await this.searchLegislation(args));
      case 'get_legislation_structure':
        return this.wrapResponse(await this.getLegislationStructure(args));
      case 'get_legislation_history':
        return this.wrapResponse(await this.getLegislationHistory(args));
      default:
        return null;
    }
  }
}
