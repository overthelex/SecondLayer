/**
 * Registry Search Tool — single meta-tool replacing 22 parametric SQL search tools.
 *
 * One tool `search_registry` with a `registry` enum and dynamic `filters` object.
 * The catalog in registry-catalog.ts declares table, columns, match types, descriptions.
 */

import { BaseToolHandler, ToolDefinition, ToolResult } from '../base-tool-handler.js';
import { REGISTRY_CATALOG, RegistryDef, FieldDef } from './registry-catalog.js';
import { logger } from '../../utils/logger.js';

const REGISTRY_KEYS = Object.keys(REGISTRY_CATALOG);

export class RegistrySearchTool extends BaseToolHandler {
  constructor(private db: any) {
    super();
  }

  getToolDefinitions(): ToolDefinition[] {
    const registryDescriptions = REGISTRY_KEYS
      .map(k => `• **${k}** — ${REGISTRY_CATALOG[k].title}`)
      .join('\n');

    return [{
      name: 'search_registry',
      annotations: { title: 'Пошук у реєстрах відкритих даних', readOnlyHint: true },
      description: `Єдиний інструмент для пошуку в ${REGISTRY_KEYS.length} реєстрах відкритих даних України.

Обов'язковий параметр: registry (назва реєстру).
Фільтри передаються в об'єкті filters — набір полів залежить від реєстру.

Доступні реєстри:
${registryDescriptions}

Приклад: registry="sanctions", filters={"name": "Путін"}
Приклад: registry="lawyers", filters={"last_name": "Іваненко", "ra_name": "Київська"}
Приклад: registry="vehicle_registrations", filters={"vin": "WVWZZZ3CZWE123456"}`,
      inputSchema: {
        type: 'object',
        properties: {
          registry: {
            type: 'string',
            enum: REGISTRY_KEYS,
            description: 'Назва реєстру для пошуку',
          },
          filters: {
            type: 'object',
            description: 'Фільтри пошуку (набір полів залежить від реєстру). Передайте registry без filters щоб побачити доступні поля.',
          },
          limit: {
            type: 'number',
            description: 'Макс. результатів (за замовч. 50, макс. 100)',
          },
        },
        required: ['registry'],
      },
    }];
  }

  async executeTool(name: string, args: any): Promise<ToolResult | null> {
    if (name !== 'search_registry') return null;

    const { registry, filters = {}, limit } = args;
    const def = REGISTRY_CATALOG[registry];
    if (!def) {
      return this.wrapError(`Невідомий реєстр "${registry}". Доступні: ${REGISTRY_KEYS.join(', ')}`);
    }

    if (!filters || Object.keys(filters).length === 0) {
      return this.wrapResponse(this.describeRegistry(registry, def));
    }

    for (const req of (def.requiredFields ?? [])) {
      if (!filters[req]) {
        return this.wrapResponse(`Обов'язковий параметр: ${req}. ${this.describeRegistry(registry, def)}`);
      }
    }

    const { whereClause, values, paramIndex } = this.buildWhereClause(def.fields, filters);
    if (!whereClause) {
      return this.wrapResponse(`Вкажіть хоча б один фільтр для пошуку. ${this.describeRegistry(registry, def)}`);
    }

    const maxLimit = def.maxLimit ?? 100;
    const defaultLimit = def.defaultLimit ?? 50;
    const lim = Math.max(1, Math.min(Number(limit) || defaultLimit, maxLimit));

    const countValues = [...values];
    values.push(lim);

    const dataSql = `SELECT ${def.selectColumns}
      FROM ${def.table}
      WHERE ${whereClause}
      ORDER BY ${def.orderBy}
      LIMIT $${paramIndex}`;

    const countSql = `SELECT COUNT(*) AS total FROM ${def.table} WHERE ${whereClause}`;

    try {
      const [dataResult, countResult] = await Promise.all([
        this.db.query(dataSql, values),
        this.db.query(countSql, countValues),
      ]);
      if (dataResult.rows.length === 0) return this.wrapResponse(def.emptyMessage);
      const totalCount = parseInt(countResult.rows[0]?.total ?? '0', 10);
      dataResult.rows.forEach((r: any) => { r._total_count = totalCount; });
      return this.wrapSearchResults(dataResult.rows, lim);
    } catch (error: any) {
      logger.error(`search_registry[${registry}] error`, { error: error.message });
      return this.wrapError(`Помилка пошуку: ${error.message}`);
    }
  }

  private buildWhereClause(
    fields: FieldDef[],
    filters: Record<string, any>
  ): { whereClause: string | null; values: any[]; paramIndex: number } {
    const conditions: string[] = [];
    const values: any[] = [];
    let pi = 1;

    for (const field of fields) {
      let val = filters[field.name];
      if (val === undefined || val === null || val === '') continue;

      if (field.type === 'number') val = Number(val);
      if (field.transform === 'uppercase' && typeof val === 'string') val = val.toUpperCase();

      switch (field.match) {
        case 'ilike':
          conditions.push(`${field.columns[0]} ILIKE $${pi}`);
          values.push(`%${val}%`);
          pi++;
          break;

        case 'exact':
          conditions.push(`${field.columns[0]} = $${pi}`);
          values.push(val);
          pi++;
          break;

        case 'ilike_multi':
          conditions.push(`(${field.columns.map(c => `${c} ILIKE $${pi}`).join(' OR ')})`);
          values.push(`%${val}%`);
          pi++;
          break;

        case 'exact_multi':
          conditions.push(`(${field.columns.map(c => `${c} = $${pi}`).join(' OR ')})`);
          values.push(val);
          pi++;
          break;

        case 'gte':
          conditions.push(`${field.columns[0]} >= $${pi}`);
          values.push(val);
          pi++;
          break;

        case 'lte':
          conditions.push(`${field.columns[0]} <= $${pi}`);
          values.push(val);
          pi++;
          break;

        case 'array_contains':
          conditions.push(`$${pi} = ANY(${field.columns[0]})`);
          values.push(val);
          pi++;
          break;

        case 'ilike_cast':
          conditions.push(`${field.columns[0]}::text ILIKE $${pi}`);
          values.push(`%${val}%`);
          pi++;
          break;

        case 'fts':
          conditions.push(`to_tsvector('english', ${field.columns[0]}) @@ plainto_tsquery('english', $${pi})`);
          values.push(val);
          pi++;
          break;

        case 'fts_simple':
          conditions.push(`to_tsvector('simple', ${field.columns[0]}) @@ plainto_tsquery('simple', $${pi})`);
          values.push(val);
          pi++;
          break;
      }
    }

    return {
      whereClause: conditions.length > 0 ? conditions.join(' AND ') : null,
      values,
      paramIndex: pi,
    };
  }

  private describeRegistry(key: string, def: RegistryDef): string {
    const fieldDescs = def.fields.map(f => `  • ${f.name} — ${f.description}`).join('\n');
    return `Реєстр "${key}" (${def.title}):\n${def.description}\n\nДоступні фільтри:\n${fieldDescs}`;
  }
}
