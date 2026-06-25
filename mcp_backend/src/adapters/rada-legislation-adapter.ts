import axios, { AxiosInstance } from 'axios';
import * as cheerio from 'cheerio';
import { logger } from '../utils/logger';
import type { IDatabase } from '../domain/ports/index.js';

export interface LegislationMetadata {
  rada_id: string;
  type: 'code' | 'law' | 'regulation';
  title: string;
  short_title?: string;
  full_url: string;
  adoption_date?: Date;
  effective_date?: Date;
  last_amended_date?: Date;
  status: 'active' | 'amended' | 'repealed';
  total_articles?: number;
  total_sections?: number;
  structure_metadata?: any;
}

export interface LegislationArticle {
  article_number: string;
  section_number?: string;
  section_title?: string;
  chapter_number?: string;
  chapter_title?: string;
  title?: string;
  full_text: string;
  full_text_html?: string;
  part_number?: number;
  paragraph_number?: number;
  notes?: string;
  version_date?: Date;
  byte_size: number;
  metadata?: any;
}

export interface ArticleChunk {
  chunk_index: number;
  text: string;
  context_before?: string;
  context_after?: string;
  metadata: any;
}

export class RadaLegislationAdapter {
  private httpClient: AxiosInstance;
  private db: IDatabase;
  private readonly BASE_URL = 'https://zakon.rada.gov.ua';
  private readonly CHUNK_SIZE = 500; // characters per chunk for vector search
  private readonly CHUNK_OVERLAP = 100; // overlap between chunks
  private externalApiMetrics: ((service: string, status: string, durationSec: number) => void) | null = null;

  constructor(db: IDatabase) {
    this.db = db;
    this.httpClient = axios.create({
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SecondLayer/1.0; +https://secondlayer.com)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'uk,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate',
      },
      decompress: true,
    });
  }

  async fetchLegislation(radaId: string): Promise<{ metadata: LegislationMetadata; articles: LegislationArticle[] }> {
    // Validate radaId to prevent SSRF — Ukrainian law IDs contain alphanumeric, slashes, dashes, Cyrillic
    if (/[^\p{L}\p{N}\-_\/\.]/u.test(radaId) || radaId.includes('..')) {
      throw new Error(`Invalid legislation ID: ${radaId}`);
    }
    // Use /print endpoint for full text with all articles.
    // RADA IDs may contain a literal slash (e.g. "213/95-вр"); encode each
    // path segment but keep the "/" separators literal (encoded "%2F" 404s).
    const encodedId = radaId.split('/').map((seg) => encodeURIComponent(seg)).join('/');
    const url = `${this.BASE_URL}/laws/show/${encodedId}/print`;
    logger.info(`Fetching legislation from ${url}`);

    const callStart = Date.now();
    try {
      const response = await this.httpClient.get(url);
      const callDuration = (Date.now() - callStart) / 1000;
      this.externalApiMetrics?.('zakon_rada', 'success', callDuration);

      const html = response.data;
      const $ = cheerio.load(html);

      const metadata = this.extractMetadata($, radaId, url);
      const articles = this.extractArticles($, radaId);

      logger.info(`Extracted ${articles.length} articles from ${radaId}`);
      return { metadata, articles };
    } catch (error: any) {
      const callDuration = (Date.now() - callStart) / 1000;
      this.externalApiMetrics?.('zakon_rada', 'error', callDuration);
      logger.error(`Failed to fetch legislation ${radaId}:`, error.message);
      throw error;
    }
  }

  private extractMetadata($: cheerio.CheerioAPI, radaId: string, url: string): LegislationMetadata {
    let title = $('.title, .doc-title, h1').first().text().trim();

    // Fallback: RADA /print pages use og:title or span.rvts23 for КМУ resolutions
    if (!title) {
      title = $('meta[property="og:title"]').attr('content')?.trim() || '';
    }
    if (!title) {
      // Find the longest rvts23 span that looks like a title (skip "КАБІНЕТ МІНІСТРІВ УКРАЇНИ" etc.)
      $('span.rvts23, .rvts23').each((_i, el) => {
        const text = $(el).text().trim();
        if (text.length > 20 && text.length > title.length && /^(Про |ПОРЯДОК |ПРАВИЛА |ПОЛОЖЕННЯ )/i.test(text)) {
          title = text;
        }
      });
    }

    const shortTitle = this.extractShortTitle(title);
    const type = this.determineDocumentType(title, radaId);
    
    const infoBlock = $('.info, .doc-info, .document-info');
    const adoptionDateText = infoBlock.find(':contains("прийнято")').text();
    const effectiveDateText = infoBlock.find(':contains("набрання чинності")').text();
    
    return {
      rada_id: radaId,
      type,
      title,
      short_title: shortTitle,
      full_url: url,
      adoption_date: this.parseDate(adoptionDateText),
      effective_date: this.parseDate(effectiveDateText),
      status: 'active',
    };
  }

  private extractArticles($: cheerio.CheerioAPI, radaId: string): LegislationArticle[] {
    const articles: LegislationArticle[] = [];
    const bodyHtml = $('body').html() || '';

    // Build section/chapter map by scanning rvts15 spans before each article
    // Sections: <span class=rvts15>Розділ I </span><br><span class=rvts15>TITLE</span>
    // Chapters: <span class=rvts15>Глава 1 </span><br><span class=rvts15>TITLE</span>
    const structureMap = this.extractStructureMap(bodyHtml);

    // Parse articles: handles both <span class=rvts9>Стаття N. Title</span> and <span class=rvts9>Стаття N.</span>
    const articleRegex = /<span\s+class=["']?rvts9["']?>Стаття\s+(\d+(?:-\d+)?)\.?\s*([^<]*)<\/span>\s*(.*?)(?=<span\s+class=["']?rvts9["']?>Стаття\s+\d|$)/gs;

    let match;
    while ((match = articleRegex.exec(bodyHtml)) !== null) {
      const articleNumber = match[1];
      const inlineTitle = match[2]?.trim(); // Title text inside the <span> tag
      const articleHtml = match[3];
      const articlePosition = match.index;

      // Load the article HTML into cheerio for text extraction
      const $article = cheerio.load(`<div>${articleHtml}</div>`);

      // Extract amendment annotations from <em> blocks before removing them.
      // Rada marks amended parts as: <em>{Частина N статті M в редакції Закону № X від DD.MM.YYYY}</em>
      // These are critical legal metadata — preserve them as plain-text notes in full_text.
      const amendmentNotes: string[] = [];
      $article('em').each((_i, el) => {
        const emText = $article(el).text()
          .replace(/\s+/g, ' ')
          .trim();
        // Only keep notes that look like amendment markers (contain "редакції" or "доповнено" or "виключено")
        if (/редакції|доповнено|виключено|втратила|набрала/i.test(emText) && emText.length > 5) {
          // Strip surrounding {} but keep the content
          const cleaned = emText.replace(/^\{|\}$/g, '').trim();
          if (cleaned) amendmentNotes.push(`[${cleaned}]`);
        }
      });

      // Extract clean text (remove HTML tags, scripts, styles)
      $article('script, style, em').remove();
      const bodyText = $article.text()
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/\{[^}]+\}/g, '') // Remove remaining {...} inline markers
        .trim();

      // Append amendment notes after the article body so LLMs can see them
      const fullText = amendmentNotes.length > 0
        ? `${bodyText} ${amendmentNotes.join(' ')}`
        : bodyText;

      if (fullText.length < 10) continue;

      // Use inline title from span if available, otherwise extract from body text
      let title: string | undefined;
      if (inlineTitle && inlineTitle.length > 2) {
        title = inlineTitle;
      } else {
        const firstSentence = fullText.split(/[.;]/)[0];
        if (firstSentence && firstSentence.length < 200) {
          title = firstSentence.trim();
        }
      }

      // Find which section/chapter this article belongs to
      const structure = this.findStructureForPosition(structureMap, articlePosition);

      // Build unique section number with book prefix to avoid duplication
      const sectionNumber = structure.bookNumber && structure.sectionNumber
        ? `${structure.bookNumber}.${structure.sectionNumber}`
        : structure.sectionNumber;
      const sectionTitle = structure.sectionTitle;

      // Build unique subsection number with section context
      const subsectionNumber = structure.subsectionNumber;
      const subsectionTitle = structure.subsectionTitle;

      articles.push({
        article_number: articleNumber,
        section_number: sectionNumber,
        section_title: sectionTitle,
        chapter_number: structure.chapterNumber,
        chapter_title: structure.chapterTitle,
        title: title,
        full_text: fullText,
        full_text_html: articleHtml.substring(0, 10000), // Limit HTML size
        byte_size: Buffer.byteLength(fullText, 'utf8'),
        metadata: {
          rada_id: radaId,
          extraction_date: new Date().toISOString(),
          extraction_method: 'print_endpoint',
          book_number: structure.bookNumber,
          book_title: structure.bookTitle,
          subsection_number: subsectionNumber,
          subsection_title: subsectionTitle,
          paragraph_number: structure.paragraphNumber,
          paragraph_title: structure.paragraphTitle,
          amendment_notes: amendmentNotes.length > 0 ? amendmentNotes : undefined,
        },
      });
    }

    // Fallback to old method if too few articles found (likely regex mismatch)
    if (articles.length < 5) {
      logger.warn(`Only ${articles.length} articles found with print endpoint parser, trying fallback for ${radaId}`);
      const fallbackArticles = this.extractArticlesFallback($, radaId);
      if (fallbackArticles.length > articles.length) {
        logger.info(`Fallback found ${fallbackArticles.length} articles vs ${articles.length}, using fallback for ${radaId}`);
        articles.length = 0;
        articles.push(...fallbackArticles);
      }
    }

    // Extract transitional/final provisions as separate articles
    const transitional = this.extractTransitionalProvisions(bodyHtml, radaId);
    if (transitional.length > 0) {
      logger.info(`Extracted ${transitional.length} transitional provision entries from ${radaId}`);
      articles.push(...transitional);
    }

    return articles;
  }

  private extractStructureMap(bodyHtml: string): Array<{
    position: number;
    type: 'book' | 'section' | 'subsection' | 'chapter' | 'paragraph';
    number: string;
    title: string;
  }> {
    const entries: Array<{
      position: number;
      type: 'book' | 'section' | 'subsection' | 'chapter' | 'paragraph';
      number: string;
      title: string;
    }> = [];

    // Match Книга (Book) headers: <span class=rvts23>КНИГА ПЕРША </span><br><span class=rvts23>TITLE</span>
    const bookRegex = /<span\s+class=["']?rvts23["']?>КНИГА\s+([^<]+?)\s*<\/span>\s*(?:<br\s*\/?>)?\s*<span\s+class=["']?rvts23["']?>([^<]+?)<\/span>/gi;
    let match;
    while ((match = bookRegex.exec(bodyHtml)) !== null) {
      const rawNumber = match[1].trim();
      const title = match[2].trim();
      const number = this.ukrainianOrdinalToArabic(rawNumber) || rawNumber;
      entries.push({ position: match.index, type: 'book', number, title });
    }

    // Match Розділ/Глава/Підрозділ headers: <span class=rvts15>X N </span><br><span class=rvts15>TITLE</span>
    const headerRegex = /<span\s+class=["']?rvts15["']?>(Розділ|Глава|Підрозділ)\s+([^<]+?)\s*<\/span>\s*(?:<br\s*\/?>)?\s*<span\s+class=["']?rvts15["']?>([^<]+?)<\/span>/gi;
    while ((match = headerRegex.exec(bodyHtml)) !== null) {
      const keyword = match[1].toLowerCase();
      const type = keyword.startsWith('розділ') ? 'section' as const
        : keyword.startsWith('підрозділ') ? 'subsection' as const
        : 'chapter' as const;
      const rawNumber = match[2].trim();
      const title = match[3].trim();
      const number = this.romanToArabic(rawNumber) || rawNumber;
      entries.push({ position: match.index, type, number, title });
    }

    // Match § (paragraph) headers: <span class=rvts15>§ N. TITLE</span> (number and title in same span)
    const paragraphRegex = /<span\s+class=["']?rvts15["']?>§\s*(\d+)\.?\s*([^<]*?)\s*<\/span>/gi;
    while ((match = paragraphRegex.exec(bodyHtml)) !== null) {
      const number = match[1].trim();
      const title = match[2].trim();
      entries.push({ position: match.index, type: 'paragraph', number, title });
    }

    // Sort all entries by position in HTML
    entries.sort((a, b) => a.position - b.position);

    return entries;
  }

  private ukrainianOrdinalToArabic(str: string): string | null {
    const ordinals: Record<string, string> = {
      'ПЕРША': '1', 'ПЕРШИЙ': '1', 'ПЕРШЕ': '1',
      'ДРУГА': '2', 'ДРУГИЙ': '2', 'ДРУГЕ': '2',
      'ТРЕТЯ': '3', 'ТРЕТІЙ': '3', 'ТРЕТЄ': '3',
      'ЧЕТВЕРТА': '4', 'ЧЕТВЕРТИЙ': '4', 'ЧЕТВЕРТЕ': '4',
      "П'ЯТА": '5', "П'ЯТИЙ": '5', "П'ЯТЕ": '5',
      'ШОСТА': '6', 'ШОСТИЙ': '6', 'ШОСТЕ': '6',
      'СЬОМА': '7', 'СЬОМИЙ': '7', 'СЬОМЕ': '7',
      'ВОСЬМА': '8', 'ВОСЬМИЙ': '8', 'ВОСЬМЕ': '8',
      "ДЕВ'ЯТА": '9', "ДЕВ'ЯТИЙ": '9', "ДЕВ'ЯТЕ": '9',
      'ДЕСЯТА': '10', 'ДЕСЯТИЙ': '10', 'ДЕСЯТЕ': '10',
    };
    const cleaned = str.trim().toUpperCase();
    return ordinals[cleaned] || null;
  }

  private findStructureForPosition(
    structureMap: Array<{ position: number; type: 'book' | 'section' | 'subsection' | 'chapter' | 'paragraph'; number: string; title: string }>,
    articlePosition: number,
  ): { bookNumber?: string; bookTitle?: string; sectionNumber?: string; sectionTitle?: string; subsectionNumber?: string; subsectionTitle?: string; chapterNumber?: string; chapterTitle?: string; paragraphNumber?: string; paragraphTitle?: string } {
    let bookNumber: string | undefined;
    let bookTitle: string | undefined;
    let sectionNumber: string | undefined;
    let sectionTitle: string | undefined;
    let subsectionNumber: string | undefined;
    let subsectionTitle: string | undefined;
    let chapterNumber: string | undefined;
    let chapterTitle: string | undefined;
    let paragraphNumber: string | undefined;
    let paragraphTitle: string | undefined;

    for (const entry of structureMap) {
      if (entry.position > articlePosition) break;
      if (entry.type === 'book') {
        bookNumber = entry.number;
        bookTitle = entry.title;
        // Reset all sub-levels
        sectionNumber = undefined; sectionTitle = undefined;
        subsectionNumber = undefined; subsectionTitle = undefined;
        chapterNumber = undefined; chapterTitle = undefined;
        paragraphNumber = undefined; paragraphTitle = undefined;
      } else if (entry.type === 'section') {
        sectionNumber = entry.number;
        sectionTitle = entry.title;
        subsectionNumber = undefined; subsectionTitle = undefined;
        chapterNumber = undefined; chapterTitle = undefined;
        paragraphNumber = undefined; paragraphTitle = undefined;
      } else if (entry.type === 'subsection') {
        subsectionNumber = entry.number;
        subsectionTitle = entry.title;
        chapterNumber = undefined; chapterTitle = undefined;
        paragraphNumber = undefined; paragraphTitle = undefined;
      } else if (entry.type === 'chapter') {
        chapterNumber = entry.number;
        chapterTitle = entry.title;
        paragraphNumber = undefined; paragraphTitle = undefined;
      } else if (entry.type === 'paragraph') {
        paragraphNumber = entry.number;
        paragraphTitle = entry.title;
      }
    }

    return { bookNumber, bookTitle, sectionNumber, sectionTitle, subsectionNumber, subsectionTitle, chapterNumber, chapterTitle, paragraphNumber, paragraphTitle };
  }

  private romanToArabic(str: string): string | null {
    const roman: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
    const cleaned = str.trim().toUpperCase();

    // Check if it's already an Arabic number
    if (/^\d+$/.test(cleaned)) return cleaned;

    // Check if it's a valid Roman numeral
    if (!/^[IVXLCDM]+$/.test(cleaned)) return null;

    let result = 0;
    for (let i = 0; i < cleaned.length; i++) {
      const current = roman[cleaned[i]];
      const next = roman[cleaned[i + 1]];
      if (next && current < next) {
        result -= current;
      } else {
        result += current;
      }
    }
    return result.toString();
  }

  /**
   * Extract numbered points from "Прикінцеві та перехідні положення" section.
   * These use "N. text" format instead of "Стаття N." and are missed by the main parser.
   */
  private extractTransitionalProvisions(bodyHtml: string, radaId: string): LegislationArticle[] {
    const articles: LegislationArticle[] = [];

    // Find the transitional provisions section header
    const headerPatterns = [
      /ПРИКІНЦЕВІ\s+ТА\s+ПЕРЕХІДНІ\s+ПОЛОЖЕННЯ/i,
      /ПЕРЕХІДНІ\s+ТА\s+ПРИКІНЦЕВІ\s+ПОЛОЖЕННЯ/i,
      /ПЕРЕХІДНІ\s+ПОЛОЖЕННЯ/i,
      /ПРИКІНЦЕВІ\s+ПОЛОЖЕННЯ/i,
    ];

    let sectionStart = -1;
    let sectionTitle = '';
    for (const pat of headerPatterns) {
      const m = pat.exec(bodyHtml);
      if (m) {
        sectionStart = m.index;
        sectionTitle = m[0];
        break;
      }
    }
    if (sectionStart < 0) return articles;

    const sectionHtml = bodyHtml.slice(sectionStart);

    // Track current subsection/section context within transitional provisions
    let currentSection = sectionTitle;
    let currentSubsection = '';

    const sectionHeaderRegex = /<span\s+class=["']?rvts(?:15|23)["']?>((?:Розділ|Підрозділ)\s+[^<]+)<\/span>(?:\s*(?:<br\s*\/?>)?\s*<span\s+class=["']?rvts(?:15|23)["']?>([^<]+)<\/span>)?/gi;
    const sectionHeaders: Array<{ pos: number; type: string; number: string; title: string }> = [];
    let shMatch;
    while ((shMatch = sectionHeaderRegex.exec(sectionHtml)) !== null) {
      const raw = shMatch[1].trim();
      const title = shMatch[2]?.trim() || '';
      const isSubsection = /підрозділ/i.test(raw);
      sectionHeaders.push({
        pos: shMatch.index,
        type: isSubsection ? 'subsection' : 'section',
        number: raw.replace(/^(?:Розділ|Підрозділ)\s+/i, '').trim(),
        title,
      });
    }

    // Extract numbered points: <a name="nNNNN"></a>\s*N. or N.N. or N.N.N. text...
    // Matches: "38.6.", "69.14.", "1.", "41.2.5." etc.
    const pointRegex = /<a\s+name="n(\d+)">\s*<\/a>\s*(\d+(?:\.\d+)*)\.\s*/g;
    const points: Array<{ anchor: string; num: string; startPos: number }> = [];
    let pMatch;
    while ((pMatch = pointRegex.exec(sectionHtml)) !== null) {
      points.push({ anchor: pMatch[1], num: pMatch[2], startPos: pMatch.index + pMatch[0].length });
    }

    for (let i = 0; i < points.length; i++) {
      const point = points[i];
      const endPos = i + 1 < points.length ? points[i + 1].startPos - 50 : sectionHtml.length;
      const pointHtml = sectionHtml.slice(point.startPos, endPos);

      // Strip HTML tags for plain text using cheerio parser
      const $point = cheerio.load(pointHtml, { xml: false });
      const pointAmendmentNotes: string[] = [];
      $point('em').each((_i, el) => {
        const emText = $point(el).text().replace(/\s+/g, ' ').trim();
        if (/редакції|доповнено|виключено|втратила|набрала/i.test(emText) && emText.length > 5) {
          const cleaned = emText.replace(/^\{|\}$/g, '').trim();
          if (cleaned) pointAmendmentNotes.push(`[${cleaned}]`);
        }
      });
      $point('script, style, em').remove();
      const pointBodyText = $point.text()
        .replace(/\{[^}]*\}/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      const fullText = pointAmendmentNotes.length > 0
        ? `${pointBodyText} ${pointAmendmentNotes.join(' ')}`
        : pointBodyText;

      if (fullText.length < 10) continue;

      // Determine which subsection/section this point belongs to
      for (const sh of sectionHeaders) {
        if (sh.pos < point.startPos) {
          if (sh.type === 'subsection') {
            currentSubsection = `Підрозділ ${sh.number}${sh.title ? ' ' + sh.title : ''}`;
          } else {
            currentSection = `Розділ ${sh.number}${sh.title ? ' ' + sh.title : ''}`;
            currentSubsection = '';
          }
        }
      }

      const articleNumber = `п.${point.num}`;
      const title = fullText.slice(0, Math.min(fullText.indexOf('.', 10) + 1 || 150, 150)).trim();

      articles.push({
        article_number: articleNumber,
        section_number: undefined,
        section_title: sectionTitle,
        chapter_number: undefined,
        chapter_title: currentSubsection || currentSection,
        title,
        full_text: `${point.num}. ${fullText}`,
        full_text_html: pointHtml.substring(0, 10000),
        byte_size: Buffer.byteLength(fullText, 'utf8'),
        metadata: {
          rada_id: radaId,
          extraction_date: new Date().toISOString(),
          extraction_method: 'transitional_provisions',
          is_transitional: true,
          subsection: currentSubsection || undefined,
        },
      });
    }

    return articles;
  }

  private extractArticlesFallback($: cheerio.CheerioAPI, radaId: string): LegislationArticle[] {
    const articles: LegislationArticle[] = [];
    // Strip RADA's print-page chrome so we don't capture "Друкувати"/"Допомога"/
    // keyboard hints when falling back to whole-document extraction.
    $('#prnpanel, script, style, noscript, header, footer, nav').remove();
    // Cheerio .text() strips newlines between block elements (p, div, br),
    // so we inject newlines before extracting text to preserve paragraph boundaries
    $('p, div, br').each((_i, el) => {
      $(el).before('\n');
    });
    const bodyText = $('body').text();

    // Try Стаття pattern first (laws, codes)
    const articlePattern = /Стаття\s+(\d+(?:-\d+)?)\.\s*([^\n]+)/gi;
    let match;

    while ((match = articlePattern.exec(bodyText)) !== null) {
      const articleNumber = match[1];
      const title = match[2].trim();

      const startIndex = match.index;
      const nextMatch = articlePattern.exec(bodyText);
      const endIndex = nextMatch ? nextMatch.index : bodyText.length;
      articlePattern.lastIndex = nextMatch ? nextMatch.index : bodyText.length;

      const fullText = bodyText.substring(startIndex, endIndex).trim();

      if (fullText.length > 20) {
        articles.push({
          article_number: articleNumber,
          title,
          full_text: fullText,
          byte_size: Buffer.byteLength(fullText, 'utf8'),
          metadata: {
            rada_id: radaId,
            extraction_method: 'fallback',
          },
        });
      }
    }

    // If no articles found, try пункт pattern (КМУ постанови, порядки, правила)
    // Format: "1. Text..." at line start, numbered sequentially
    if (articles.length === 0) {
      const punktPattern = /(?:^|\n)\s*(\d+)\.\s+([А-ЯІЇЄҐ][^\n]{10,})/g;
      const punktMatches: Array<{ number: string; title: string; index: number }> = [];

      while ((match = punktPattern.exec(bodyText)) !== null) {
        const num = parseInt(match[1], 10);
        // Only consider reasonable punkt numbers (1-999) and skip footnotes/references
        if (num > 0 && num < 1000) {
          punktMatches.push({
            number: match[1],
            title: match[2].trim().substring(0, 200),
            index: match.index,
          });
        }
      }

      // Extract text between consecutive punkts
      for (let i = 0; i < punktMatches.length; i++) {
        const startIdx = punktMatches[i].index;
        const endIdx = i + 1 < punktMatches.length ? punktMatches[i + 1].index : bodyText.length;
        const fullText = bodyText.substring(startIdx, endIdx).trim();

        if (fullText.length > 20) {
          articles.push({
            article_number: punktMatches[i].number,
            title: punktMatches[i].title.split(/[.;]/)[0].trim(),
            full_text: fullText,
            byte_size: Buffer.byteLength(fullText, 'utf8'),
            metadata: {
              rada_id: radaId,
              extraction_method: 'fallback_punkt',
            },
          });
        }
      }

      if (articles.length > 0) {
        logger.info(`Extracted ${articles.length} punkts (not articles) from ${radaId} via fallback`);
      }
    }

    // Last-resort fallback: short documents without Стаття/numbered punkts
    // (КМУ розпорядження, накази, короткі постанови з додатками-таблицями).
    // Store the whole document body as a single "article" so the text is at
    // least retrievable instead of yielding total_articles = 0.
    if (articles.length === 0) {
      const wholeText = bodyText
        .replace(/ /g, ' ')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

      if (wholeText.length > 50) {
        articles.push({
          article_number: '1',
          full_text: wholeText,
          byte_size: Buffer.byteLength(wholeText, 'utf8'),
          metadata: {
            rada_id: radaId,
            extraction_method: 'fallback_whole_document',
          },
        });
        logger.info(`Extracted whole document as single article for ${radaId} via fallback_whole_document (${wholeText.length} chars)`);
      }
    }

    return articles;
  }

  private extractArticleNumber($el: cheerio.Cheerio<any>): string | null {
    const numberElement = $el.find('.article-number, .number, [class*="num"]').first();
    let numberText = numberElement.text().trim();
    
    if (!numberText) {
      const fullText = $el.text();
      const match = fullText.match(/Стаття\s+(\d+(?:-\d+)?)/i);
      if (match) {
        numberText = match[1];
      }
    }
    
    numberText = numberText.replace(/[^\d-]/g, '');
    return numberText || null;
  }

  private extractArticleText($el: cheerio.Cheerio<any>): string {
    const clone = $el.clone();
    clone.find('script, style, .article-number, .number').remove();
    return clone.text().trim().replace(/\s+/g, ' ');
  }

  private extractShortTitle(fullTitle: string): string | undefined {
    const patterns = [
      /\(([А-ЯІЇЄҐ]{2,}(?:\s+України)?)\)/,
      /([А-ЯІЇЄҐ]{2,}\s+України)/,
    ];
    
    for (const pattern of patterns) {
      const match = fullTitle.match(pattern);
      if (match) return match[1];
    }
    
    return undefined;
  }

  private determineDocumentType(title: string, radaId: string): 'code' | 'law' | 'regulation' {
    if (title.includes('Кодекс') || radaId.includes('кодекс')) return 'code';
    if (title.includes('Закон') || radaId.match(/^\d+-\d+$/)) return 'law';
    return 'regulation';
  }

  private parseDate(text: string): Date | undefined {
    const match = text.match(/(\d{2})\.(\d{2})\.(\d{4})/);
    if (match) {
      return new Date(`${match[3]}-${match[2]}-${match[1]}`);
    }
    return undefined;
  }

  async saveLegislationToDatabase(
    metadata: LegislationMetadata,
    articles: LegislationArticle[]
  ): Promise<{ legislationId: string; articleIds: string[] }> {
    try {
      const result = await this.db.transaction(async (client) => {
        const legislationResult = await client.query(
          `INSERT INTO legislation (rada_id, type, title, short_title, full_url, adoption_date,
            effective_date, last_amended_date, status, total_articles, structure_metadata)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           ON CONFLICT (rada_id) DO UPDATE SET
             title = EXCLUDED.title,
             short_title = EXCLUDED.short_title,
             last_amended_date = EXCLUDED.last_amended_date,
             total_articles = EXCLUDED.total_articles,
             updated_at = NOW()
           RETURNING id`,
          [
            metadata.rada_id,
            metadata.type,
            metadata.title,
            metadata.short_title,
            metadata.full_url,
            metadata.adoption_date,
            metadata.effective_date,
            metadata.last_amended_date,
            metadata.status,
            articles.length,
            metadata.structure_metadata || {},
          ]
        );

        const legislationId = legislationResult.rows[0].id;
        const articleIds: string[] = [];

        for (const article of articles) {
          const articleResult = await client.query(
            `INSERT INTO legislation_articles
             (legislation_id, article_number, section_number, section_title, chapter_number, chapter_title, title,
              full_text, full_text_html, part_number, paragraph_number, notes,
              version_date, is_current, byte_size, metadata)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
             ON CONFLICT (legislation_id, article_number, version_date) DO UPDATE SET
               full_text = EXCLUDED.full_text,
               full_text_html = EXCLUDED.full_text_html,
               section_number = EXCLUDED.section_number,
               section_title = EXCLUDED.section_title,
               chapter_number = EXCLUDED.chapter_number,
               chapter_title = EXCLUDED.chapter_title,
               byte_size = EXCLUDED.byte_size,
               updated_at = NOW()
             RETURNING id`,
            [
              legislationId,
              article.article_number,
              article.section_number,
              article.section_title,
              article.chapter_number,
              article.chapter_title,
              article.title,
              article.full_text,
              article.full_text_html,
              article.part_number,
              article.paragraph_number,
              article.notes,
              article.version_date || new Date('2000-01-01T00:00:00Z'),
              true,
              article.byte_size,
              article.metadata || {},
            ]
          );

          articleIds.push(articleResult.rows[0].id);
        }

        logger.info(`Saved legislation ${metadata.rada_id} with ${articles.length} articles`);
        return { legislationId, articleIds };
      });

      return result;
    } catch (error: any) {
      logger.error(`Failed to save legislation to database: ${error.message}`);
      throw error;
    }
  }

  createArticleChunks(article: LegislationArticle): ArticleChunk[] {
    const chunks: ArticleChunk[] = [];
    const text = article.full_text;
    
    if (text.length <= this.CHUNK_SIZE) {
      chunks.push({
        chunk_index: 0,
        text,
        metadata: {
          article_number: article.article_number,
          section_number: article.section_number,
          chapter_number: article.chapter_number,
          title: article.title,
        },
      });
      return chunks;
    }

    let startIndex = 0;
    let chunkIndex = 0;

    while (startIndex < text.length) {
      const endIndex = Math.min(startIndex + this.CHUNK_SIZE, text.length);
      const chunkText = text.substring(startIndex, endIndex);

      const contextBefore = startIndex > 0 
        ? text.substring(Math.max(0, startIndex - this.CHUNK_OVERLAP), startIndex)
        : undefined;

      const contextAfter = endIndex < text.length
        ? text.substring(endIndex, Math.min(text.length, endIndex + this.CHUNK_OVERLAP))
        : undefined;

      chunks.push({
        chunk_index: chunkIndex,
        text: chunkText,
        context_before: contextBefore,
        context_after: contextAfter,
        metadata: {
          article_number: article.article_number,
          section_number: article.section_number,
          chapter_number: article.chapter_number,
          title: article.title,
          chunk_position: `${chunkIndex + 1}/${Math.ceil(text.length / this.CHUNK_SIZE)}`,
        },
      });

      startIndex += this.CHUNK_SIZE - this.CHUNK_OVERLAP;
      chunkIndex++;
    }

    return chunks;
  }

  async getArticleByNumber(radaId: string, articleNumber: string, asOfDate?: string): Promise<LegislationArticle | null> {
    let result;
    if (asOfDate) {
      result = await this.db.query(
        `SELECT la.*
         FROM legislation_articles la
         JOIN legislation l ON la.legislation_id = l.id
         WHERE LOWER(l.rada_id) = LOWER($1) AND la.article_number = $2 AND la.version_date <= $3
         ORDER BY la.version_date DESC
         LIMIT 1`,
        [radaId, articleNumber, asOfDate]
      );
    } else {
      result = await this.db.query(
        `SELECT la.*
         FROM legislation_articles la
         JOIN legislation l ON la.legislation_id = l.id
         WHERE LOWER(l.rada_id) = LOWER($1) AND la.article_number = $2 AND la.is_current = true
         ORDER BY la.version_date DESC NULLS LAST, la.id DESC
         LIMIT 1`,
        [radaId, articleNumber]
      );
    }

    if (result.rows.length === 0) return null;

    return result.rows[0];
  }

  async searchArticles(query: string, radaId?: string, limit: number = 10): Promise<any[]> {
    let sql = `
      SELECT la.*, l.rada_id, l.title as legislation_title, l.short_title
      FROM legislation_articles la
      JOIN legislation l ON la.legislation_id = l.id
      WHERE la.is_current = true
        AND (
          to_tsvector('simple', la.full_text) @@ plainto_tsquery('simple', $1)
          OR la.article_number ILIKE $2
        )
    `;

    const params: any[] = [query, `%${query}%`];

    if (radaId) {
      sql += ` AND LOWER(l.rada_id) = LOWER($3)`;
      params.push(radaId);
    }

    sql += ` ORDER BY ts_rank(to_tsvector('simple', la.full_text), plainto_tsquery('simple', $1)) DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await this.db.query(sql, params);
    return result.rows;
  }

  async fetchEditionDates(radaId: string): Promise<string[]> {
    if (/[^\p{L}\p{N}\-_\/\.]/u.test(radaId) || radaId.includes('..')) {
      throw new Error(`Invalid legislation ID: ${radaId}`);
    }
    const url = `${this.BASE_URL}/laws/show/${radaId}/card4`;
    logger.info(`Fetching edition dates from ${url}`);

    const response = await this.httpClient.get(url);
    const html = response.data as string;
    const edRegex = /\/ed(\d{8})/g;
    const dates = new Set<string>();
    let match;
    while ((match = edRegex.exec(html)) !== null) {
      dates.add(match[1]);
    }
    const sorted = [...dates].sort();
    logger.info(`Found ${sorted.length} editions for ${radaId}`);
    return sorted;
  }

  async fetchEdition(radaId: string, editionDate: string): Promise<{ metadata: LegislationMetadata; articles: LegislationArticle[] }> {
    if (/[^\p{L}\p{N}\-_\/\.]/u.test(radaId) || radaId.includes('..')) {
      throw new Error(`Invalid legislation ID: ${radaId}`);
    }
    if (!/^\d{8}$/.test(editionDate)) {
      throw new Error(`Invalid edition date format: ${editionDate}, expected YYYYMMDD`);
    }

    const url = `${this.BASE_URL}/laws/show/${radaId}/ed${editionDate}/print`;
    logger.info(`Fetching edition ${editionDate} from ${url}`);

    const callStart = Date.now();
    try {
      const response = await this.httpClient.get(url, { timeout: 60000 });
      const callDuration = (Date.now() - callStart) / 1000;
      this.externalApiMetrics?.('zakon_rada', 'success', callDuration);

      const html = response.data as string;
      const $ = cheerio.load(html);
      const metadata = this.extractMetadata($, radaId, url);

      const versionDate = new Date(
        parseInt(editionDate.substring(0, 4)),
        parseInt(editionDate.substring(4, 6)) - 1,
        parseInt(editionDate.substring(6, 8)),
      );

      // Edition pages use <pre><b> format
      let articles = this.extractArticlesPreBold(html);

      // Fallback to rvts9 format if pre/bold found nothing
      if (articles.length < 3) {
        articles = this.extractArticles($, radaId);
      }

      for (const art of articles) {
        art.version_date = versionDate;
        art.metadata = { ...art.metadata, edition_date: editionDate, extraction_method: 'edition_endpoint' };
      }

      logger.info(`Edition ${editionDate} of ${radaId}: ${articles.length} articles`);
      return { metadata, articles };
    } catch (error: any) {
      const callDuration = (Date.now() - callStart) / 1000;
      this.externalApiMetrics?.('zakon_rada', 'error', callDuration);
      logger.error(`Failed to fetch edition ${editionDate} of ${radaId}:`, error.message);
      throw error;
    }
  }

  private extractArticlesPreBold(html: string): LegislationArticle[] {
    const articles: LegislationArticle[] = [];
    // Edition pages wrap text in <pre> blocks with <b>Стаття N.</b> headers
    const articleRegex = /<b>Стаття\s+(\d+(?:-\d+)?)\.?<\/b>\s*(.*?)(?=<b>Стаття\s+\d|<\/pre>\s*$|$)/gs;

    const seen = new Set<string>();
    let match;
    while ((match = articleRegex.exec(html)) !== null) {
      const articleNumber = match[1].trim();
      if (seen.has(articleNumber)) continue;
      seen.add(articleNumber);

      let body = match[2];
      // Clean HTML tags but preserve line breaks
      body = body.replace(/<br\s*\/?>/gi, '\n');
      body = body.replace(/<b>([^<]*)<\/b>/g, '$1');
      body = body.replace(/<[^>]+>/g, ' ');
      body = body.replace(/&nbsp;/g, ' ');
      body = body.replace(/&mdash;/g, '—');
      body = body.replace(/&laquo;/g, '«');
      body = body.replace(/&raquo;/g, '»');
      body = body.replace(/&amp;/g, '&');
      body = body.replace(/\{[^}]*\}/g, '');
      body = body.replace(/[ \t]+/g, ' ');
      body = body.replace(/\n\s*\n/g, '\n');
      body = body.trim();

      if (body.length < 5) continue;

      const firstLine = body.split('\n')[0].trim();
      const title = firstLine.length < 200 ? firstLine : undefined;

      articles.push({
        article_number: articleNumber,
        title,
        full_text: body,
        byte_size: Buffer.byteLength(body, 'utf8'),
        metadata: { extraction_method: 'edition_pre_bold' },
      });
    }

    return articles;
  }

  setExternalApiMetrics(callback: (service: string, status: string, durationSec: number) => void) {
    this.externalApiMetrics = callback;
  }
}
