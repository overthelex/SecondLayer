/**
 * India Court Tools
 *
 * 3 tools for searching Indian court judgments:
 * - search_india_supreme_court — Supreme Court of India (38K+ judgments, 1950-2026)
 * - search_india_high_courts   — 25 High Courts (16M+ judgments, 1950-2025)
 * - india_court_stats          — Aggregate statistics across both courts
 *
 * Data source: AWS Open Data Registry (CC-BY-4.0, Dattam Labs)
 */

import { BaseToolHandler, ToolDefinition, ToolResult } from '../base-tool-handler.js';
import { logger } from '../../utils/logger.js';

export class IndiaCourtTools extends BaseToolHandler {
  constructor(private db: any) {
    super();
  }

  getToolDefinitions(): ToolDefinition[] {
    return [
      {
        name: 'search_india_supreme_court',
        annotations: { title: 'Supreme Court of India', readOnlyHint: true },
        description: `Search Indian Supreme Court judgments (38K+ decisions, 1950-2026).

Search by case title, petitioner, respondent, judge, citation, CNR number, disposal type, or year range.
Available fields: title, petitioner, respondent, judge, author_judge, citation, case_id, cnr, decision_date, disposal_nature, court, available_languages, year.

Examples:
- Search by petitioner: {"petitioner": "State of Maharashtra"}
- Search by judge: {"judge": "Chandrachud"}
- Search by year: {"year_from": 2020, "year_to": 2024}
- Search by citation: {"citation": "2024 INSC"}
- Combined: {"judge": "Misra", "disposal_nature": "Dismissed", "year_from": 2015}

Data: CC-BY-4.0 via AWS Open Data (Dattam Labs).`,
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Free text search across title, petitioner, respondent, and description' },
            petitioner: { type: 'string', description: 'Petitioner name (partial match)' },
            respondent: { type: 'string', description: 'Respondent name (partial match)' },
            judge: { type: 'string', description: 'Judge name (partial match)' },
            citation: { type: 'string', description: 'Citation reference (e.g. "2024 INSC 735")' },
            case_id: { type: 'string', description: 'Case ID (e.g. "2024 INSC 735")' },
            cnr: { type: 'string', description: 'CNR number (exact match)' },
            disposal_nature: { type: 'string', description: 'Disposal type: Dismissed, Appeal(s) allowed, Disposed off, etc.' },
            year_from: { type: 'number', description: 'Start year (inclusive)' },
            year_to: { type: 'number', description: 'End year (inclusive)' },
            limit: { type: 'number', default: 50, maximum: 200, description: 'Max results (default 50)' },
            offset: { type: 'number', default: 0, description: 'Offset for pagination' },
          },
        },
      },
      {
        name: 'search_india_high_courts',
        annotations: { title: 'Indian High Courts', readOnlyHint: true },
        description: `Search Indian High Courts judgments (16M+ decisions across 25 courts, 1950-2025).

25 High Courts: Bombay, Madras, Calcutta, Delhi, Karnataka, Kerala, Allahabad, Patna, Punjab & Haryana, Rajasthan, Gujarat, Madhya Pradesh, Chhattisgarh, Orissa, Jharkhand, Gauhati, Himachal Pradesh, Uttarakhand, Telangana, Andhra Pradesh, Jammu & Kashmir, Tripura, Manipur, Meghalaya, Sikkim.

Search by case title, judge, court name, CNR, disposal type, or year range.

Examples:
- Search Bombay HC: {"court": "Bombay"}
- Search by judge in Kerala: {"judge": "Justice Kumar", "court": "Kerala"}
- Search by year range: {"year_from": 2020, "year_to": 2024, "court": "Delhi"}
- Combined: {"query": "land acquisition", "court": "Madras", "year_from": 2018}

Data: CC-BY-4.0 via AWS Open Data (Dattam Labs).`,
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Free text search across title and description' },
            court: { type: 'string', description: 'Court name (partial match, e.g. "Bombay", "Delhi")' },
            court_code: { type: 'string', description: 'Court code (e.g. "27~1" for Bombay)' },
            judge: { type: 'string', description: 'Judge name (partial match)' },
            cnr: { type: 'string', description: 'CNR number (exact match)' },
            disposal_nature: { type: 'string', description: 'Disposal type (e.g. "DISPOSED OFF", "ALLOWED")' },
            bench: { type: 'string', description: 'Bench identifier' },
            year_from: { type: 'number', description: 'Start year (inclusive)' },
            year_to: { type: 'number', description: 'End year (inclusive)' },
            limit: { type: 'number', default: 50, maximum: 200, description: 'Max results (default 50)' },
            offset: { type: 'number', default: 0, description: 'Offset for pagination' },
          },
        },
      },
      {
        name: 'india_court_stats',
        annotations: { title: 'India Courts Statistics', readOnlyHint: true },
        description: `Get aggregate statistics for Indian courts: total cases, breakdown by year, court, judge, disposal type.

Use without parameters for a full overview, or filter by court/year for specific stats.

Examples:
- Full overview: {}
- Stats for Bombay HC: {"court": "Bombay", "source": "high-courts"}
- SC stats for 2020-2024: {"source": "supreme-court", "year_from": 2020, "year_to": 2024}`,
        inputSchema: {
          type: 'object',
          properties: {
            source: { type: 'string', enum: ['supreme-court', 'high-courts', 'all'], default: 'all', description: 'Which court system' },
            court: { type: 'string', description: 'Filter HC stats by court name (partial match)' },
            year_from: { type: 'number', description: 'Start year' },
            year_to: { type: 'number', description: 'End year' },
            group_by: { type: 'string', enum: ['year', 'court', 'judge', 'disposal'], default: 'year', description: 'Group results by field' },
            limit: { type: 'number', default: 30, maximum: 100, description: 'Max groups to return' },
          },
        },
      },
    ];
  }

  async executeTool(name: string, args: Record<string, unknown>): Promise<ToolResult | null> {
    switch (name) {
      case 'search_india_supreme_court':
        return this.searchSupremeCourt(args);
      case 'search_india_high_courts':
        return this.searchHighCourts(args);
      case 'india_court_stats':
        return this.getStats(args);
      default:
        return null;
    }
  }

  private async searchSupremeCourt(args: Record<string, unknown>): Promise<ToolResult> {
    const { query, petitioner, respondent, judge, citation, case_id, cnr, disposal_nature, year_from, year_to, limit = 50, offset = 0 } = args as any;

    const conditions: string[] = [];
    const values: any[] = [];
    let pi = 1;

    if (query) {
      conditions.push(`(title ILIKE $${pi} OR petitioner ILIKE $${pi} OR respondent ILIKE $${pi} OR description ILIKE $${pi})`);
      values.push(`%${query}%`);
      pi++;
    }
    if (petitioner) {
      conditions.push(`petitioner ILIKE $${pi}`);
      values.push(`%${petitioner}%`);
      pi++;
    }
    if (respondent) {
      conditions.push(`respondent ILIKE $${pi}`);
      values.push(`%${respondent}%`);
      pi++;
    }
    if (judge) {
      conditions.push(`judge ILIKE $${pi}`);
      values.push(`%${judge}%`);
      pi++;
    }
    if (citation) {
      conditions.push(`citation ILIKE $${pi}`);
      values.push(`%${citation}%`);
      pi++;
    }
    if (case_id) {
      conditions.push(`case_id ILIKE $${pi}`);
      values.push(`%${case_id}%`);
      pi++;
    }
    if (cnr) {
      conditions.push(`cnr = $${pi}`);
      values.push(cnr);
      pi++;
    }
    if (disposal_nature) {
      conditions.push(`disposal_nature ILIKE $${pi}`);
      values.push(`%${disposal_nature}%`);
      pi++;
    }
    if (year_from) {
      conditions.push(`year >= $${pi}`);
      values.push(Number(year_from));
      pi++;
    }
    if (year_to) {
      conditions.push(`year <= $${pi}`);
      values.push(Number(year_to));
      pi++;
    }

    if (conditions.length === 0) {
      return this.wrapResponse('Specify at least one search parameter: query, petitioner, respondent, judge, citation, case_id, cnr, disposal_nature, or year range');
    }

    const lim = Math.min(Number(limit) || 50, 200);
    const off = Number(offset) || 0;
    values.push(lim, off);

    const sql = `
      SELECT title, petitioner, respondent, judge, author_judge, citation, case_id, cnr,
             decision_date, disposal_nature, available_languages, year,
             COUNT(*) OVER() AS _total_count
      FROM indian_sc_judgments
      WHERE ${conditions.join(' AND ')}
      ORDER BY decision_date DESC NULLS LAST
      LIMIT $${pi} OFFSET $${pi + 1}`;

    try {
      const result = await this.db.query(sql, values);
      if (result.rows.length === 0) {
        return this.wrapResponse('No Supreme Court judgments found matching your query');
      }
      return this.wrapSearchResults(result.rows, lim, off);
    } catch (error: any) {
      logger.error('search_india_supreme_court error', { error: error.message });
      return this.wrapError(`Search error: ${error.message}`);
    }
  }

  private async searchHighCourts(args: Record<string, unknown>): Promise<ToolResult> {
    const { query, court, court_code, judge, cnr, disposal_nature, bench, year_from, year_to, limit = 50, offset = 0 } = args as any;

    const conditions: string[] = [];
    const values: any[] = [];
    let pi = 1;

    if (query) {
      conditions.push(`(title ILIKE $${pi} OR description ILIKE $${pi})`);
      values.push(`%${query}%`);
      pi++;
    }
    if (court) {
      conditions.push(`court ILIKE $${pi}`);
      values.push(`%${court}%`);
      pi++;
    }
    if (court_code) {
      conditions.push(`court_code = $${pi}`);
      values.push(court_code);
      pi++;
    }
    if (judge) {
      conditions.push(`judge ILIKE $${pi}`);
      values.push(`%${judge}%`);
      pi++;
    }
    if (cnr) {
      conditions.push(`cnr = $${pi}`);
      values.push(cnr);
      pi++;
    }
    if (disposal_nature) {
      conditions.push(`disposal_nature ILIKE $${pi}`);
      values.push(`%${disposal_nature}%`);
      pi++;
    }
    if (bench) {
      conditions.push(`bench = $${pi}`);
      values.push(bench);
      pi++;
    }
    if (year_from) {
      conditions.push(`year >= $${pi}`);
      values.push(Number(year_from));
      pi++;
    }
    if (year_to) {
      conditions.push(`year <= $${pi}`);
      values.push(Number(year_to));
      pi++;
    }

    if (conditions.length === 0) {
      return this.wrapResponse('Specify at least one search parameter: query, court, judge, cnr, disposal_nature, bench, or year range');
    }

    const lim = Math.min(Number(limit) || 50, 200);
    const off = Number(offset) || 0;
    values.push(lim, off);

    const sql = `
      SELECT title, court, court_code, judge, cnr, bench,
             decision_date, disposal_nature, pdf_link, year,
             COUNT(*) OVER() AS _total_count
      FROM indian_hc_judgments
      WHERE ${conditions.join(' AND ')}
      ORDER BY decision_date DESC NULLS LAST
      LIMIT $${pi} OFFSET $${pi + 1}`;

    try {
      const result = await this.db.query(sql, values);
      if (result.rows.length === 0) {
        return this.wrapResponse('No High Court judgments found matching your query');
      }
      return this.wrapSearchResults(result.rows, lim, off);
    } catch (error: any) {
      logger.error('search_india_high_courts error', { error: error.message });
      return this.wrapError(`Search error: ${error.message}`);
    }
  }

  private async getStats(args: Record<string, unknown>): Promise<ToolResult> {
    const { source = 'all', court, year_from, year_to, group_by = 'year', limit = 30 } = args as any;
    const lim = Math.min(Number(limit) || 30, 100);
    const stats: any = {};

    try {
      if (source === 'all' || source === 'supreme-court') {
        const scConditions: string[] = [];
        const scValues: any[] = [];
        let pi = 1;
        if (year_from) { scConditions.push(`year >= $${pi}`); scValues.push(Number(year_from)); pi++; }
        if (year_to) { scConditions.push(`year <= $${pi}`); scValues.push(Number(year_to)); pi++; }
        const where = scConditions.length > 0 ? `WHERE ${scConditions.join(' AND ')}` : '';

        const scTotal = await this.db.query(`SELECT count(*) as total, min(year) as min_year, max(year) as max_year FROM indian_sc_judgments ${where}`, scValues);

        let groupCol = 'year';
        if (group_by === 'judge') groupCol = 'judge';
        else if (group_by === 'disposal') groupCol = 'disposal_nature';

        const scGroup = await this.db.query(
          `SELECT ${groupCol} as group_key, count(*) as cases FROM indian_sc_judgments ${where} GROUP BY ${groupCol} ORDER BY cases DESC LIMIT $${pi}`,
          [...scValues, lim]
        );

        stats.supreme_court = {
          total: Number(scTotal.rows[0].total),
          year_range: `${scTotal.rows[0].min_year}-${scTotal.rows[0].max_year}`,
          [`by_${group_by}`]: scGroup.rows,
        };
      }

      if (source === 'all' || source === 'high-courts') {
        const hcConditions: string[] = [];
        const hcValues: any[] = [];
        let pi = 1;
        if (court) { hcConditions.push(`court ILIKE $${pi}`); hcValues.push(`%${court}%`); pi++; }
        if (year_from) { hcConditions.push(`year >= $${pi}`); hcValues.push(Number(year_from)); pi++; }
        if (year_to) { hcConditions.push(`year <= $${pi}`); hcValues.push(Number(year_to)); pi++; }
        const where = hcConditions.length > 0 ? `WHERE ${hcConditions.join(' AND ')}` : '';

        const hcTotal = await this.db.query(`SELECT count(*) as total, count(DISTINCT court) as courts, min(year) as min_year, max(year) as max_year FROM indian_hc_judgments ${where}`, hcValues);

        let groupCol = 'year';
        if (group_by === 'court') groupCol = 'court';
        else if (group_by === 'judge') groupCol = 'judge';
        else if (group_by === 'disposal') groupCol = 'disposal_nature';

        const hcGroup = await this.db.query(
          `SELECT ${groupCol} as group_key, count(*) as cases FROM indian_hc_judgments ${where} GROUP BY ${groupCol} ORDER BY cases DESC LIMIT $${pi}`,
          [...hcValues, lim]
        );

        stats.high_courts = {
          total: Number(hcTotal.rows[0].total),
          distinct_courts: Number(hcTotal.rows[0].courts),
          year_range: `${hcTotal.rows[0].min_year}-${hcTotal.rows[0].max_year}`,
          [`by_${group_by}`]: hcGroup.rows,
        };
      }

      return this.wrapResponse(stats);
    } catch (error: any) {
      logger.error('india_court_stats error', { error: error.message });
      return this.wrapError(`Stats error: ${error.message}`);
    }
  }
}
