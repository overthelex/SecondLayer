/**
 * Application Routes
 * Centralized route path constants
 */

export const ROUTES = {
  // Auth
  LOGIN: '/login',

  // Main
  HOME: '/',
  CHAT: '/chat',

  // Profile & Settings
  PROFILE: '/profile',
  BILLING: '/billing',
  TEAM: '/team',
  MCP_CONNECT: '/mcp-connect',

  // Legal Entities
  JUDGES: '/judges',
  JUDGE_DETAIL: '/judges/:id',
  LAWYERS: '/lawyers',
  LAWYER_DETAIL: '/lawyers/:id',
  CLIENTS: '/clients',
  CLIENT_DETAIL: '/clients/:id',
  CLIENT_MESSAGING: '/clients/messaging',

  // Matters
  MATTERS: '/matters',
  MATTER_DETAIL: '/matters/:id',

  // Time Tracking & Billing
  TIME_ENTRIES: '/time-entries',
  INVOICES: '/invoices',
  CALENDAR: '/calendar',

  // Documents
  DOCUMENTS: '/documents',
  DOCUMENTS_FOLDER: '/documents/folders/*',

  // Cases & Decisions
  CASE_ANALYSIS: '/case-analysis',
  DECISIONS_SEARCH: '/decisions',

  // Payment Results (Monobank redirects)
  PAYMENT_SUCCESS: '/payment/success',
  PAYMENT_ERROR: '/payment/error',

  // Public Offer & Legal
  OFFER: '/:lang/offer',
  ATTORNEY_OFFER: '/:lang/attorney-offer',
  OFERTA: '/oferta',
  TERMS: '/:lang/terms',
  PRIVACY: '/:lang/privacy',
  DPA: '/:lang/dpa',
  AI_USAGE: '/:lang/ai-usage',
  AI_TRANSPARENCY: '/:lang/ai-transparency',

  // Blog
  BLOG: '/blog',

  // Country-specific public pages
  US_DATA_SOURCES: '/us/data-sources',
  UK_DATA_SOURCES: '/uk/data-sources',
  DE_DATA_SOURCES: '/de/data-sources',
  FR_DATA_SOURCES: '/fr/data-sources',
  NL_DATA_SOURCES: '/nl/data-sources',
  EE_DATA_SOURCES: '/ee/data-sources',
  UA_DATA_SOURCES: '/ua/data-sources',
  EU_COMPARISON: '/eu/comparison',

  // News
  NEWS: '/news',

  // History
  HISTORY: '/history',

  // Legislation & Analysis
  LEGISLATION_MONITORING: '/legislation/monitoring',
  LEGISLATION_STATISTICS: '/legislation/statistics',
  LEGAL_INITIATIVES: '/legislation/initiatives',
  LEGAL_CODES_LIBRARY: '/legislation/library',
  VOTING_ANALYSIS: '/legislation/voting',
  HISTORICAL_ANALYSIS: '/legislation/historical',
  COURT_PRACTICE_ANALYSIS: '/analysis/court-practice',

  // Attorney Consultations
  ATTORNEYS: '/attorneys',
  ATTORNEY_DETAIL: '/attorneys/:id',
  ATTORNEY_PROFILE_EDIT: '/attorney/profile',
  ATTORNEY_CLIENTS: '/attorney/clients',
  CONSULTATIONS: '/consultations',
  CONSULTATION_DETAIL: '/consultations/:id',

  // Workflows
  WORKFLOWS: '/workflows',
  WORKFLOW_SET_DETAIL: '/workflows/:id',

  // Admin
  ADMIN_OVERVIEW: '/admin/overview',
  ADMIN_MONITORING: '/admin/monitoring',
  ADMIN_USERS: '/admin/users',
  ADMIN_COSTS: '/admin/costs',
  ADMIN_DATA_SOURCES: '/admin/data-sources',
  ADMIN_BILLING: '/admin/billing',
  ADMIN_INFRASTRUCTURE: '/admin/infrastructure',
  ADMIN_CONTAINERS: '/admin/containers',
  ADMIN_CONFIG: '/admin/config',
  ADMIN_DB_COMPARE: '/admin/db-compare',
  ADMIN_SERVICE_PRICING: '/admin/service-pricing',
  ADMIN_TERMINAL: '/admin/terminal',
  ADMIN_USER_ACTIVITY: '/admin/user-activity',
  ADMIN_ZO_STATS: '/admin/zo-stats',
  ADMIN_BULK_SCRAPE: '/admin/bulk-scrape',
  ADMIN_OPEN_DATA_CATALOG: '/admin/open-data-catalog',
  ADMIN_PG_MONITORING: '/admin/pg-monitoring',
} as const;

// Helper function to generate dynamic routes
export const generateRoute = {
  judgeDetail: (id: string) => `/judges/${id}`,
  lawyerDetail: (id: string) => `/lawyers/${id}`,
  clientDetail: (id: string) => `/clients/${id}`,
  matterDetail: (id: string) => `/matters/${id}`,
  attorneyDetail: (id: string) => `/attorneys/${id}`,
  consultationDetail: (id: string) => `/consultations/${id}`,
};
