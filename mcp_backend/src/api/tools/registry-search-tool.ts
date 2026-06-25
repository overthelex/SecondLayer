/**
 * Registry Search Tool — single meta-tool replacing 22 parametric SQL search tools.
 *
 * One tool `search_registry` with a `registry` enum and dynamic `filters` object.
 * The catalog in registry-catalog.ts declares table, columns, match types, descriptions.
 */

import { BaseToolHandler, ToolDefinition, ToolResult } from '../base-tool-handler.js';
import { REGISTRY_CATALOG, RegistryDef, FieldDef } from './registry-catalog.js';
import { buildWhere } from '@secondlayer/shared';
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
    // Delegates to the shared query-builder (single source of WHERE-building
    // logic for registry + EDRSR). `paramIndex` = next free $N for LIMIT.
    const { whereClause, values, nextParamIndex } = buildWhere(fields, filters);
    return { whereClause, values, paramIndex: nextParamIndex };
  }

  private describeRegistry(key: string, def: RegistryDef): string {
    const fieldDescs = def.fields.map(f => `  • ${f.name} — ${f.description}`).join('\n');
    return `Реєстр "${key}" (${def.title}):\n${def.description}\n\nДоступні фільтри:\n${fieldDescs}`;
  }
}
