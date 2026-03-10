import {
  Gavel, BookOpen, TrendingUp, CheckCircle, Scale, Briefcase,
  Bell, FileCode, BarChart3, Vote, History, Newspaper,
  Clock, FileText, Search, Activity, Database, Users, DollarSign,
  Server, Boxes, Globe, CreditCard, Settings, Terminal, Tag, Zap,
  Layers, HardDrive,
} from 'lucide-react';
import { ROUTES } from '../../router/routes';

export const researchSections = [
  { id: 'decisions', label: 'Судові рішення', icon: Gavel, route: ROUTES.DECISIONS_SEARCH },
  { id: 'regulations', label: 'Нормативні акти', icon: BookOpen, route: ROUTES.LEGAL_CODES_LIBRARY },
  { id: 'commentary', label: 'Коментарі та практика', icon: TrendingUp, route: ROUTES.COURT_PRACTICE_ANALYSIS },
  { id: 'verification', label: 'Перевірка актуальності', icon: CheckCircle, route: ROUTES.LEGISLATION_MONITORING },
  { id: 'judges', label: 'Судді', icon: Scale, route: ROUTES.JUDGES },
  { id: 'lawyers', label: 'Адвокати', icon: Briefcase, route: ROUTES.LAWYERS },
];

export const legislationSections = [
  { id: 'monitoring', label: 'Моніторинг змін', icon: Bell, route: ROUTES.LEGISLATION_MONITORING },
  { id: 'initiatives', label: 'Відстеження ініціатив', icon: FileCode, route: ROUTES.LEGAL_INITIATIVES },
  { id: 'statistics', label: 'Статистика прийняття законів', icon: BarChart3, route: ROUTES.LEGISLATION_STATISTICS },
  { id: 'voting', label: 'Аналіз голосувань', icon: Vote, route: ROUTES.VOTING_ANALYSIS },
  { id: 'historical', label: 'Історичний аналіз', icon: History, route: ROUTES.HISTORICAL_ANALYSIS },
  { id: 'news', label: 'Новини КМУ', icon: Newspaper, route: ROUTES.NEWS },
];

export function getMattersSections(isAttorney: boolean) {
  return [
    { id: 'matters', label: 'Справи', icon: Briefcase, route: ROUTES.MATTERS },
    ...(isAttorney ? [
      { id: 'time-entries', label: 'Time Entries', icon: Clock, route: ROUTES.TIME_ENTRIES },
      { id: 'invoices', label: 'Invoices', icon: FileText, route: ROUTES.INVOICES },
    ] : []),
    { id: 'case-analysis', label: 'Аналіз справ', icon: Search, route: ROUTES.CASE_ANALYSIS },
  ];
}

export const externalSourcesSections = [
  { id: 'ext-monitoring', label: 'Моніторинг', icon: Database, route: ROUTES.ADMIN_MONITORING },
  { id: 'ext-data-sources', label: 'Джерела даних', icon: Globe, route: ROUTES.ADMIN_DATA_SOURCES },
  { id: 'ext-open-data-catalog', label: 'Каталог OpenData', icon: Layers, route: ROUTES.ADMIN_OPEN_DATA_CATALOG },
];

export const monitoringSections = [
  { id: 'system-overview', label: 'Огляд системи', icon: Activity, route: ROUTES.ADMIN_OVERVIEW },
  { id: 'admin-users', label: 'Користувачі', icon: Users, route: ROUTES.ADMIN_USERS },
  { id: 'api-costs', label: 'Витрати API', icon: DollarSign, route: ROUTES.ADMIN_COSTS },
  { id: 'infrastructure', label: 'Інфраструктура', icon: Server, route: ROUTES.ADMIN_INFRASTRUCTURE },
  { id: 'containers', label: 'Контейнери', icon: Boxes, route: ROUTES.ADMIN_CONTAINERS },
  { id: 'admin-billing', label: 'Біллінг', icon: CreditCard, route: ROUTES.ADMIN_BILLING },
  { id: 'system-config', label: 'Конфігурація', icon: Settings, route: ROUTES.ADMIN_CONFIG },
  { id: 'db-compare', label: 'Порівняння БД', icon: Database, route: ROUTES.ADMIN_DB_COMPARE },
  { id: 'service-pricing', label: 'Собівартість сервісів', icon: Tag, route: ROUTES.ADMIN_SERVICE_PRICING },
  { id: 'terminal', label: 'Термінал', icon: Terminal, route: ROUTES.ADMIN_TERMINAL },
  { id: 'zo-stats', label: 'Статистика рішень', icon: BarChart3, route: ROUTES.ADMIN_ZO_STATS },
  { id: 'user-activity', label: 'Активність юзерів', icon: Zap, route: ROUTES.ADMIN_USER_ACTIVITY },
  { id: 'bulk-scrape', label: 'Пайплайн збору', icon: Database, route: ROUTES.ADMIN_BULK_SCRAPE },
  { id: 'pg-monitoring', label: 'PG Моніторинг', icon: HardDrive, route: ROUTES.ADMIN_PG_MONITORING },
];
