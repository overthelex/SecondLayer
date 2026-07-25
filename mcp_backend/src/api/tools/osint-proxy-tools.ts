import { BaseToolHandler, ToolDefinition, ToolResult } from '../base-tool-handler.js';
import { OsintProxyAdapter } from '../../adapters/osint-proxy-adapter.js';

const OSINT_PREFIX = 'osint_';

const TOOL_DEFS: Array<{ name: string; description: string; inputSchema: ToolDefinition['inputSchema'] }> = [
  {
    name: 'search_credentials',
    description: 'Пошук витоків облікових даних та зламів баз даних за email або доменом. Повертає джерела зламу, дати, типи даних та серйозність.',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Email або домен для пошуку' } },
      required: ['query'],
    },
  },
  {
    name: 'search_ransomware_victims',
    description: 'Пошук у базі жертв ransomware за назвою компанії. Повертає групу-вимагач, типи даних, дати та URL у darknet.',
    inputSchema: {
      type: 'object',
      properties: { company: { type: 'string', description: 'Назва компанії' } },
      required: ['company'],
    },
  },
  {
    name: 'search_forum_subjects',
    description: 'Пошук публікацій на форумах darknet за ключовим словом, категорією, рівнем ризику або релевантністю для України.',
    inputSchema: {
      type: 'object',
      properties: {
        category: { type: 'string', description: 'Фільтр: data_leak, credentials, malware, exploit, carding, fraud, services, other' },
        risk: { type: 'string', description: 'Фільтр: critical, high, medium, low' },
        ukraine: { type: 'boolean', description: 'Тільки пов\'язані з Україною' },
        limit: { type: 'integer', description: 'Макс. результатів (за замовч. 20)' },
      },
    },
  },
  {
    name: 'search_sanctions',
    description: 'Перевірка особи або організації за глобальними санкційними списками (OFAC, EU, UN, UA РНБО) та базами PEP через OpenSanctions.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Ім\'я особи або назва організації' },
        schema_type: { type: 'string', description: 'Person або Organization (за замовч.: Person)' },
        country: { type: 'string', description: 'Код країни (необов\'язково, напр. UA, RU)' },
      },
      required: ['name'],
    },
  },
  {
    name: 'search_interpol',
    description: 'Пошук у червоних повідомленнях ІНТЕРПОЛУ за іменем особи. Повертає розшукуваних з обвинуваченнями та громадянством.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Ім\'я та прізвище особи' },
        nationality: { type: 'string', description: 'Фільтр за громадянством (необов\'язково)' },
      },
      required: ['name'],
    },
  },
  {
    name: 'search_worldbank_debarment',
    description: 'Пошук у списку дебарменту Світового банку санкціонованих фірм та осіб.',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Ім\'я або назва компанії' } },
      required: ['name'],
    },
  },
  {
    name: 'search_cve',
    description: 'Пошук у базі вразливостей CVE (NVD) за ключовим словом або CVE ID. Повертає CVSS score, опис, статус CISA KEV та ймовірність експлойту EPSS.',
    inputSchema: {
      type: 'object',
      properties: {
        keyword: { type: 'string', description: 'Ключове слово (напр. log4j, apache)' },
        cve_id: { type: 'string', description: 'Конкретний CVE ID (напр. CVE-2021-44228)' },
      },
    },
  },
  {
    name: 'check_ip_reputation',
    description: 'Перевірка репутації IP-адреси через AbuseIPDB та GreyNoise. Повертає рівень зловживань, ISP, тип використання, класифікацію noise/riot.',
    inputSchema: {
      type: 'object',
      properties: { ip: { type: 'string', description: 'IP-адреса для перевірки' } },
      required: ['ip'],
    },
  },
  {
    name: 'check_domain_reputation',
    description: 'Перевірка репутації домену через VirusTotal та URLScan.io. Повертає вердикти щодо шкідливості, сертифікати, технології та результати сканування.',
    inputSchema: {
      type: 'object',
      properties: { domain: { type: 'string', description: 'Домен для перевірки (напр. example.com)' } },
      required: ['domain'],
    },
  },
  {
    name: 'search_corporate_registry',
    description: 'Пошук у корпоративних реєстрах — GLEIF (ідентифікатори юридичних осіб) та ICIJ Offshore Leaks (Panama/Paradise/Pandora Papers). Повертає деталі компаній, ланцюги власності, офшорні зв\'язки.',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Назва компанії або ім\'я особи' } },
      required: ['name'],
    },
  },
  {
    name: 'search_media_mentions',
    description: 'Пошук у глобальній медіа-базі GDELT за згадками в новинах. Повертає статті, джерела, тональність та медіа-покриття на тему.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Пошуковий запит (особа, компанія, тема)' },
        domain: { type: 'string', description: 'Домен для пошуку субдоменів через crt.sh (необов\'язково)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'search_github_leaks',
    description: 'Пошук витоків облікових даних, API-ключів та конфіденційних даних, розміщених у репозиторіях GitHub за доменом.',
    inputSchema: {
      type: 'object',
      properties: { domain: { type: 'string', description: 'Домен для пошуку (напр. company.com)' } },
      required: ['domain'],
    },
  },
];

const TOOL_NAMES = new Set(TOOL_DEFS.map(t => `${OSINT_PREFIX}${t.name}`));

export class OsintProxyTools extends BaseToolHandler {
  constructor(private adapter: OsintProxyAdapter) {
    super();
  }

  getToolDefinitions(): ToolDefinition[] {
    return TOOL_DEFS.map(t => ({
      name: `${OSINT_PREFIX}${t.name}`,
      description: `[OSINT] ${t.description}`,
      inputSchema: t.inputSchema,
      annotations: { title: `OSINT: ${t.name}`, readOnlyHint: true, openWorldHint: true },
    }));
  }

  async executeTool(name: string, args: any): Promise<ToolResult | null> {
    if (!TOOL_NAMES.has(name)) return null;

    const remoteName = name.slice(OSINT_PREFIX.length);
    const result = await this.adapter.executeTool(remoteName, args);

    if (result.error) {
      return this.wrapError(String(result.error));
    }

    return this.wrapResponse(result);
  }
}
