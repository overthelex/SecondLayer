/**
 * Router Configuration
 * Defines all application routes and their structure
 * Uses React.lazy() for code splitting — each page loads on demand
 */

import { Suspense, lazy } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { ROUTES } from './routes';
import { AuthGuard } from './guards/AuthGuard';

// Layouts
import { MainLayout } from '../layouts/MainLayout';

// Auth — static import (first page users see)
import { LoginPage } from '../pages/LoginPage';

// Loading spinner for lazy-loaded pages
const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-claude-bg">
    <div className="w-10 h-10 border-4 border-claude-accent border-t-transparent rounded-full animate-spin" />
  </div>
);

// Helper to wrap lazy component in Suspense
const S = (Component: React.LazyExoticComponent<React.ComponentType<any>>, props?: Record<string, any>) => (
  <Suspense fallback={<PageLoader />}>
    <Component {...props} />
  </Suspense>
);

// -- Public pages --
const VerifyEmailPage = lazy(() => import('../pages/VerifyEmailPage').then(m => ({ default: m.VerifyEmailPage })));
const ResetPasswordPage = lazy(() => import('../pages/ResetPasswordPage').then(m => ({ default: m.ResetPasswordPage })));
const PaymentSuccessPage = lazy(() => import('../pages/PaymentSuccessPage').then(m => ({ default: m.PaymentSuccessPage })));
const PaymentErrorPage = lazy(() => import('../pages/PaymentErrorPage').then(m => ({ default: m.PaymentErrorPage })));
const OfferPage = lazy(() => import('../pages/OfferPage').then(m => ({ default: m.OfferPage })));
const BlogPage = lazy(() => import('../pages/BlogPage').then(m => ({ default: m.BlogPage })));

// -- Data Sources (country pages) --
const USDataSourcesPage = lazy(() => import('../pages/USDataSourcesPage').then(m => ({ default: m.USDataSourcesPage })));
const UKDataSourcesPage = lazy(() => import('../pages/UKDataSourcesPage').then(m => ({ default: m.UKDataSourcesPage })));
const DEDataSourcesPage = lazy(() => import('../pages/DEDataSourcesPage').then(m => ({ default: m.DEDataSourcesPage })));
const FRDataSourcesPage = lazy(() => import('../pages/FRDataSourcesPage').then(m => ({ default: m.FRDataSourcesPage })));
const NLDataSourcesPage = lazy(() => import('../pages/NLDataSourcesPage').then(m => ({ default: m.NLDataSourcesPage })));
const EEDataSourcesPage = lazy(() => import('../pages/EEDataSourcesPage').then(m => ({ default: m.EEDataSourcesPage })));
const UADataSourcesPage = lazy(() => import('../pages/UADataSourcesPage').then(m => ({ default: m.UADataSourcesPage })));
const EUComparisonPage = lazy(() => import('../pages/EUComparisonPage').then(m => ({ default: m.EUComparisonPage })));

// -- Core app pages --
const ChatPage = lazy(() => import('../pages/ChatPage').then(m => ({ default: m.ChatPage })));
const ProfilePage = lazy(() => import('../pages/ProfilePage').then(m => ({ default: m.ProfilePage })));
const BillingDashboard = lazy(() => import('../pages/BillingDashboard').then(m => ({ default: m.BillingDashboard })));
const TeamPage = lazy(() => import('../pages/TeamPage').then(m => ({ default: m.TeamPage })));
const DocumentsPage = lazy(() => import('../pages/DocumentsPage').then(m => ({ default: m.DocumentsPage })));
const HistoryPage = lazy(() => import('../pages/HistoryPage').then(m => ({ default: m.HistoryPage })));

// -- Legal entities --
const JudgesPage = lazy(() => import('../pages/JudgesPage').then(m => ({ default: m.JudgesPage })));
const LawyersPage = lazy(() => import('../pages/LawyersPage').then(m => ({ default: m.LawyersPage })));
const ClientsPage = lazy(() => import('../pages/ClientsPage').then(m => ({ default: m.ClientsPage })));
const PersonDetailPage = lazy(() => import('../pages/PersonDetailPage').then(m => ({ default: m.PersonDetailPage })));
const ClientDetailPage = lazy(() => import('../pages/ClientDetailPage').then(m => ({ default: m.ClientDetailPage })));
const ClientMessagingPage = lazy(() => import('../pages/ClientMessagingPage').then(m => ({ default: m.ClientMessagingPage })));

// -- Matters & Time --
const MattersPage = lazy(() => import('../pages/MattersPage').then(m => ({ default: m.MattersPage })));
const MatterDetailPage = lazy(() => import('../pages/MatterDetailPage').then(m => ({ default: m.MatterDetailPage })));
const TimeEntriesPage = lazy(() => import('../pages/TimeEntriesPage').then(m => ({ default: m.TimeEntriesPage })));
const InvoicesPage = lazy(() => import('../pages/InvoicesPage').then(m => ({ default: m.InvoicesPage })));

// -- Legal analysis --
const CaseAnalysisPage = lazy(() => import('../pages/CaseAnalysisPage').then(m => ({ default: m.CaseAnalysisPage })));
const DecisionsSearchPage = lazy(() => import('../pages/DecisionsSearchPage').then(m => ({ default: m.DecisionsSearchPage })));
const LegislationMonitoringPage = lazy(() => import('../pages/LegislationMonitoringPage').then(m => ({ default: m.LegislationMonitoringPage })));
const CourtPracticeAnalysisPage = lazy(() => import('../pages/CourtPracticeAnalysisPage').then(m => ({ default: m.CourtPracticeAnalysisPage })));
const LegalInitiativesPage = lazy(() => import('../pages/LegalInitiativesPage').then(m => ({ default: m.LegalInitiativesPage })));
const LegislationStatisticsPage = lazy(() => import('../pages/LegislationStatisticsPage').then(m => ({ default: m.LegislationStatisticsPage })));
const VotingAnalysisPage = lazy(() => import('../pages/VotingAnalysisPage').then(m => ({ default: m.VotingAnalysisPage })));
const LegalCodesLibraryPage = lazy(() => import('../pages/LegalCodesLibraryPage').then(m => ({ default: m.LegalCodesLibraryPage })));
const HistoricalAnalysisPage = lazy(() => import('../pages/HistoricalAnalysisPage').then(m => ({ default: m.HistoricalAnalysisPage })));

// -- Attorney/Consultations --
const AttorneySearchPage = lazy(() => import('../pages/AttorneySearchPage').then(m => ({ default: m.AttorneySearchPage })));
const AttorneyDetailPage = lazy(() => import('../pages/AttorneyDetailPage').then(m => ({ default: m.AttorneyDetailPage })));
const AttorneyProfilePage = lazy(() => import('../pages/AttorneyProfilePage').then(m => ({ default: m.AttorneyProfilePage })));
const ConsultationsPage = lazy(() => import('../pages/ConsultationsPage').then(m => ({ default: m.ConsultationsPage })));
const ConsultationDetailPage = lazy(() => import('../pages/ConsultationDetailPage').then(m => ({ default: m.ConsultationDetailPage })));
const AttorneyClientsPage = lazy(() => import('../pages/AttorneyClientsPage').then(m => ({ default: m.AttorneyClientsPage })));

// -- Workflows --
const WorkflowsPage = lazy(() => import('../pages/WorkflowsPage').then(m => ({ default: m.WorkflowsPage })));
const WorkflowSetDetailPage = lazy(() => import('../pages/WorkflowSetDetailPage').then(m => ({ default: m.WorkflowSetDetailPage })));

// -- Admin --
const AdminOverviewPage = lazy(() => import('../pages/AdminOverviewPage').then(m => ({ default: m.AdminOverviewPage })));
const AdminMonitoringPage = lazy(() => import('../pages/AdminMonitoringPage').then(m => ({ default: m.AdminMonitoringPage })));
const AdminUsersPage = lazy(() => import('../pages/AdminUsersPage').then(m => ({ default: m.AdminUsersPage })));
const AdminCostsPage = lazy(() => import('../pages/AdminCostsPage').then(m => ({ default: m.AdminCostsPage })));
const AdminDataSourcesPage = lazy(() => import('../pages/AdminDataSourcesPage').then(m => ({ default: m.AdminDataSourcesPage })));
const AdminBillingPage = lazy(() => import('../pages/AdminBillingPage').then(m => ({ default: m.AdminBillingPage })));
const AdminInfrastructurePage = lazy(() => import('../pages/AdminInfrastructurePage').then(m => ({ default: m.AdminInfrastructurePage })));
const AdminContainersPage = lazy(() => import('../pages/AdminContainersPage').then(m => ({ default: m.AdminContainersPage })));
const AdminConfigPage = lazy(() => import('../pages/AdminConfigPage').then(m => ({ default: m.AdminConfigPage })));
const AdminDBComparePage = lazy(() => import('../pages/AdminDBComparePage').then(m => ({ default: m.AdminDBComparePage })));
const AdminServicePricingPage = lazy(() => import('../pages/AdminServicePricingPage').then(m => ({ default: m.AdminServicePricingPage })));
const AdminTerminalPage = lazy(() => import('../pages/AdminTerminalPage').then(m => ({ default: m.AdminTerminalPage })));
const AdminZOStatsPage = lazy(() => import('../pages/AdminZOStatsPage').then(m => ({ default: m.AdminZOStatsPage })));
const AdminUserActivityPage = lazy(() => import('../pages/AdminUserActivityPage').then(m => ({ default: m.AdminUserActivityPage })));
const AdminBulkScrapePage = lazy(() => import('../pages/AdminBulkScrapePage').then(m => ({ default: m.AdminBulkScrapePage })));
const AdminOpenDataCatalogPage = lazy(() => import('../pages/AdminOpenDataCatalogPage').then(m => ({ default: m.AdminOpenDataCatalogPage })));

export const router = createBrowserRouter([
  {
    path: ROUTES.LOGIN,
    element: <LoginPage />,
  },
  {
    path: '/verify-email',
    element: S(VerifyEmailPage),
  },
  {
    path: '/reset-password',
    element: S(ResetPasswordPage),
  },
  {
    path: ROUTES.PAYMENT_SUCCESS,
    element: S(PaymentSuccessPage),
  },
  {
    path: ROUTES.PAYMENT_ERROR,
    element: S(PaymentErrorPage),
  },
  {
    path: ROUTES.OFFER,
    element: S(OfferPage),
  },
  {
    path: ROUTES.US_DATA_SOURCES,
    element: S(USDataSourcesPage),
  },
  {
    path: ROUTES.UK_DATA_SOURCES,
    element: S(UKDataSourcesPage),
  },
  {
    path: ROUTES.DE_DATA_SOURCES,
    element: S(DEDataSourcesPage),
  },
  {
    path: ROUTES.FR_DATA_SOURCES,
    element: S(FRDataSourcesPage),
  },
  {
    path: ROUTES.NL_DATA_SOURCES,
    element: S(NLDataSourcesPage),
  },
  {
    path: ROUTES.EE_DATA_SOURCES,
    element: S(EEDataSourcesPage),
  },
  {
    path: ROUTES.UA_DATA_SOURCES,
    element: S(UADataSourcesPage),
  },
  {
    path: ROUTES.EU_COMPARISON,
    element: S(EUComparisonPage),
  },
  {
    path: ROUTES.BLOG,
    element: S(BlogPage),
  },
  {
    element: <AuthGuard />,
    children: [
      {
        element: <MainLayout />,
        children: [
          {
            path: ROUTES.HOME,
            element: <Navigate to={ROUTES.CHAT} replace />,
          },
          {
            path: ROUTES.CHAT,
            element: S(ChatPage),
          },
          {
            path: ROUTES.PROFILE,
            element: S(ProfilePage),
          },
          {
            path: ROUTES.BILLING,
            element: S(BillingDashboard),
          },
          {
            path: ROUTES.TEAM,
            element: S(TeamPage),
          },
          {
            path: ROUTES.JUDGES,
            element: S(JudgesPage),
          },
          {
            path: ROUTES.JUDGE_DETAIL,
            element: S(PersonDetailPage, { type: 'judge' }),
          },
          {
            path: ROUTES.LAWYERS,
            element: S(LawyersPage),
          },
          {
            path: ROUTES.LAWYER_DETAIL,
            element: S(PersonDetailPage, { type: 'lawyer' }),
          },
          {
            path: ROUTES.CLIENTS,
            element: S(ClientsPage),
          },
          {
            path: ROUTES.CLIENT_DETAIL,
            element: S(ClientDetailPage),
          },
          {
            path: ROUTES.CLIENT_MESSAGING,
            element: S(ClientMessagingPage),
          },
          {
            path: ROUTES.MATTERS,
            element: S(MattersPage),
          },
          {
            path: ROUTES.MATTER_DETAIL,
            element: S(MatterDetailPage),
          },
          {
            path: ROUTES.TIME_ENTRIES,
            element: S(TimeEntriesPage),
          },
          {
            path: ROUTES.INVOICES,
            element: S(InvoicesPage),
          },
          {
            path: ROUTES.DOCUMENTS,
            element: S(DocumentsPage),
          },
          {
            path: ROUTES.DOCUMENTS_FOLDER,
            element: S(DocumentsPage),
          },
          {
            path: ROUTES.CASE_ANALYSIS,
            element: S(CaseAnalysisPage),
          },
          {
            path: ROUTES.DECISIONS_SEARCH,
            element: S(DecisionsSearchPage),
          },
          {
            path: ROUTES.HISTORY,
            element: S(HistoryPage),
          },
          {
            path: ROUTES.LEGISLATION_MONITORING,
            element: S(LegislationMonitoringPage),
          },
          {
            path: ROUTES.LEGISLATION_STATISTICS,
            element: S(LegislationStatisticsPage),
          },
          {
            path: ROUTES.LEGAL_INITIATIVES,
            element: S(LegalInitiativesPage),
          },
          {
            path: ROUTES.LEGAL_CODES_LIBRARY,
            element: S(LegalCodesLibraryPage),
          },
          {
            path: ROUTES.VOTING_ANALYSIS,
            element: S(VotingAnalysisPage),
          },
          {
            path: ROUTES.HISTORICAL_ANALYSIS,
            element: S(HistoricalAnalysisPage),
          },
          {
            path: ROUTES.COURT_PRACTICE_ANALYSIS,
            element: S(CourtPracticeAnalysisPage),
          },
          {
            path: ROUTES.ATTORNEYS,
            element: S(AttorneySearchPage),
          },
          {
            path: ROUTES.ATTORNEY_DETAIL,
            element: S(AttorneyDetailPage),
          },
          {
            path: ROUTES.ATTORNEY_PROFILE_EDIT,
            element: S(AttorneyProfilePage),
          },
          {
            path: ROUTES.ATTORNEY_CLIENTS,
            element: S(AttorneyClientsPage),
          },
          {
            path: ROUTES.CONSULTATIONS,
            element: S(ConsultationsPage),
          },
          {
            path: ROUTES.CONSULTATION_DETAIL,
            element: S(ConsultationDetailPage),
          },
          {
            path: ROUTES.WORKFLOWS,
            element: S(WorkflowsPage),
          },
          {
            path: ROUTES.WORKFLOW_SET_DETAIL,
            element: S(WorkflowSetDetailPage),
          },
          {
            path: ROUTES.ADMIN_OVERVIEW,
            element: S(AdminOverviewPage),
          },
          {
            path: ROUTES.ADMIN_MONITORING,
            element: S(AdminMonitoringPage),
          },
          {
            path: ROUTES.ADMIN_USERS,
            element: S(AdminUsersPage),
          },
          {
            path: ROUTES.ADMIN_COSTS,
            element: S(AdminCostsPage),
          },
          {
            path: ROUTES.ADMIN_DATA_SOURCES,
            element: S(AdminDataSourcesPage),
          },
          {
            path: ROUTES.ADMIN_BILLING,
            element: S(AdminBillingPage),
          },
          {
            path: ROUTES.ADMIN_INFRASTRUCTURE,
            element: S(AdminInfrastructurePage),
          },
          {
            path: ROUTES.ADMIN_CONTAINERS,
            element: S(AdminContainersPage),
          },
          {
            path: ROUTES.ADMIN_CONFIG,
            element: S(AdminConfigPage),
          },
          {
            path: ROUTES.ADMIN_DB_COMPARE,
            element: S(AdminDBComparePage),
          },
          {
            path: ROUTES.ADMIN_SERVICE_PRICING,
            element: S(AdminServicePricingPage),
          },
          {
            path: ROUTES.ADMIN_TERMINAL,
            element: S(AdminTerminalPage),
          },
          {
            path: ROUTES.ADMIN_ZO_STATS,
            element: S(AdminZOStatsPage),
          },
          {
            path: ROUTES.ADMIN_USER_ACTIVITY,
            element: S(AdminUserActivityPage),
          },
          {
            path: ROUTES.ADMIN_BULK_SCRAPE,
            element: S(AdminBulkScrapePage),
          },
          {
            path: ROUTES.ADMIN_OPEN_DATA_CATALOG,
            element: S(AdminOpenDataCatalogPage),
          },
        ],
      },
    ],
  },
  {
    path: '*',
    element: <Navigate to={ROUTES.CHAT} replace />,
  },
]);
