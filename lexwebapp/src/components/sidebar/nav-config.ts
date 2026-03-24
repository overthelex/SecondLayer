import {
  Gavel, BookOpen, TrendingUp, CheckCircle, Scale, Briefcase,
  BarChart3, Newspaper,
  Clock, FileText, Search, Activity, Database, Users, DollarSign,
  Server, Boxes, Globe, CreditCard, Settings, Terminal, Tag, Zap,
  Layers, HardDrive, Gauge, Code,
} from 'lucide-react';
import { ROUTES } from '../../router/routes';
import { appT } from '../../i18n/app-i18n';

export const getResearchSections = () => [
  { id: 'decisions', label: appT('nav.decisions'), icon: Gavel, route: ROUTES.DECISIONS_SEARCH },
  { id: 'regulations', label: appT('nav.regulations'), icon: BookOpen, route: ROUTES.LEGAL_CODES_LIBRARY },
  { id: 'commentary', label: appT('nav.commentary'), icon: TrendingUp, route: ROUTES.COURT_PRACTICE_ANALYSIS },
  { id: 'verification', label: appT('nav.verification'), icon: CheckCircle, route: ROUTES.LEGISLATION_MONITORING },
  { id: 'judges', label: appT('nav.judges'), icon: Scale, route: ROUTES.JUDGES },
  { id: 'lawyers', label: appT('nav.lawyers'), icon: Briefcase, route: ROUTES.LAWYERS },
];

export const getLegislationSections = () => [
  { id: 'legislation-db', label: appT('nav.legislationDb'), icon: BookOpen, route: ROUTES.LEGISLATION_MONITORING },
  { id: 'codes', label: appT('nav.codes'), icon: Scale, route: ROUTES.LEGAL_CODES_LIBRARY },
  { id: 'news', label: appT('nav.newsKmu'), icon: Newspaper, route: ROUTES.NEWS },
  { id: 'lex-news', label: appT('nav.newsLex'), icon: Globe, route: ROUTES.LEX_NEWS },
];

export function getMattersSections(isAttorney: boolean) {
  return [
    { id: 'matters', label: appT('nav.matters'), icon: Briefcase, route: ROUTES.MATTERS },
    ...(isAttorney ? [
      { id: 'time-entries', label: appT('nav.timeEntries'), icon: Clock, route: ROUTES.TIME_ENTRIES },
      { id: 'invoices', label: appT('nav.invoices'), icon: FileText, route: ROUTES.INVOICES },
    ] : []),
    { id: 'case-analysis', label: appT('nav.caseAnalysis'), icon: Search, route: ROUTES.CASE_ANALYSIS },
  ];
}

export const getAttorneyClientSections = () => [
  { id: 'attorney-search', label: appT('nav.findAttorney'), icon: Search, route: ROUTES.ATTORNEYS },
  { id: 'my-consultations', label: appT('nav.myConsultations'), icon: Briefcase, route: ROUTES.CONSULTATIONS },
];

export const getDeveloperSections = () => [
  { id: 'dev-docs', label: appT('nav.apiDocs'), icon: Code, route: ROUTES.DEVELOPER_DOCS },
];

export const getExternalSourcesSections = () => [
  { id: 'ext-monitoring', label: appT('nav.extMonitoring'), icon: Database, route: ROUTES.ADMIN_MONITORING },
  { id: 'ext-data-sources', label: appT('nav.extDataSources'), icon: Globe, route: ROUTES.ADMIN_DATA_SOURCES },
  { id: 'ext-open-data-catalog', label: appT('nav.extOpenData'), icon: Layers, route: ROUTES.ADMIN_OPEN_DATA_CATALOG },
];

export const getMonitoringSections = () => [
  { id: 'system-overview', label: appT('nav.systemOverview'), icon: Activity, route: ROUTES.ADMIN_OVERVIEW },
  { id: 'admin-users', label: appT('nav.users'), icon: Users, route: ROUTES.ADMIN_USERS },
  { id: 'api-costs', label: appT('nav.apiCosts'), icon: DollarSign, route: ROUTES.ADMIN_COSTS },
  { id: 'infrastructure', label: appT('nav.infrastructure'), icon: Server, route: ROUTES.ADMIN_INFRASTRUCTURE },
  { id: 'containers', label: appT('nav.containers'), icon: Boxes, route: ROUTES.ADMIN_CONTAINERS },
  { id: 'admin-billing', label: appT('nav.billing'), icon: CreditCard, route: ROUTES.ADMIN_BILLING },
  { id: 'system-config', label: appT('nav.config'), icon: Settings, route: ROUTES.ADMIN_CONFIG },
  { id: 'db-compare', label: appT('nav.dbCompare'), icon: Database, route: ROUTES.ADMIN_DB_COMPARE },
  { id: 'service-pricing', label: appT('nav.servicePricing'), icon: Tag, route: ROUTES.ADMIN_SERVICE_PRICING },
  { id: 'terminal', label: appT('nav.terminal'), icon: Terminal, route: ROUTES.ADMIN_TERMINAL },
  { id: 'zo-stats', label: appT('nav.zoStats'), icon: BarChart3, route: ROUTES.ADMIN_ZO_STATS },
  { id: 'user-activity', label: appT('nav.userActivity'), icon: Zap, route: ROUTES.ADMIN_USER_ACTIVITY },
  { id: 'bulk-scrape', label: appT('nav.bulkScrape'), icon: Database, route: ROUTES.ADMIN_BULK_SCRAPE },
  { id: 'pg-monitoring', label: appT('nav.pgMonitoring'), icon: HardDrive, route: ROUTES.ADMIN_PG_MONITORING },
  { id: 'limits', label: appT('nav.limits'), icon: Gauge, route: ROUTES.ADMIN_LIMITS },
];

// Legacy static exports for backward compatibility
export const researchSections = getResearchSections();
export const legislationSections = getLegislationSections();
export const attorneyClientSections = getAttorneyClientSections();
export const developerSections = getDeveloperSections();
export const externalSourcesSections = getExternalSourcesSections();
export const monitoringSections = getMonitoringSections();
