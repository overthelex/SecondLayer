/**
 * Main Layout
 * Common layout structure with sidebar, header, and content area
 */

import { useState, useEffect, useCallback } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { X, Menu, PanelRightOpen } from 'lucide-react';
import { Sidebar } from '../components/sidebar';
import { RightPanel } from '../components/right-panel';
import { TimeTrackerWidget } from '../components/time/TimeTrackerWidget';
import { OnboardingTour } from '../components/onboarding/OnboardingTour';
import { PendingInvitationsModal } from '../components/attorney/PendingInvitationsModal';
import { SupportWidget } from '../components/support';
import { useAuth } from '../contexts/AuthContext';
import { useUIStore, useConsultationStore } from '../stores';
import { ROUTES } from '../router/routes';
import { consultationService } from '../services/api/ConsultationService';
import showToast from '../utils/toast';
import { toastTDynamic } from '../i18n/toast-i18n';
import { useSessionRecorder } from '../hooks/useSessionRecorder';

// Map routes to page titles
const PAGE_TITLES: Record<string, string> = {
  [ROUTES.CHAT]: 'Чат',
  [ROUTES.PROFILE]: 'Профіль',
  [ROUTES.BILLING]: 'Білінг',
  [ROUTES.MY_CONTRACTS]: 'Мої договори',
  [ROUTES.JUDGES]: 'Судді',
  [ROUTES.LAWYERS]: 'Адвокати',
  [ROUTES.CLIENTS]: 'Клієнти',
  [ROUTES.DOCUMENTS]: 'Документи',
  [ROUTES.MATTERS]: 'Справи (юридичні)',
  [ROUTES.NEWS]: 'Новини КМУ',
  [ROUTES.HISTORY]: 'Історія запитів',
  [ROUTES.DECISIONS_SEARCH]: 'Пошук судових рішень',
  [ROUTES.CASE_ANALYSIS]: 'Аналіз справи',
  [ROUTES.LEGISLATION_MONITORING]: 'База законодавства',
  [ROUTES.COURT_PRACTICE_ANALYSIS]: 'Аналіз судової практики',
  [ROUTES.LEGAL_CODES_LIBRARY]: 'Кодекси та закони',
  [ROUTES.CLIENT_MESSAGING]: 'Відправити повідомлення',
  [ROUTES.TIME_ENTRIES]: 'Облік часу',
  [ROUTES.INVOICES]: 'Рахунки',
  [ROUTES.CALENDAR]: 'Календар',
  [ROUTES.ADMIN_OVERVIEW]: 'Огляд системи',
  [ROUTES.ADMIN_MONITORING]: 'Моніторинг джерел даних',
  [ROUTES.ADMIN_USERS]: 'Управління користувачами',
  [ROUTES.ADMIN_COSTS]: 'Витрати API та аналітика',
  [ROUTES.ADMIN_DATA_SOURCES]: 'Джерела даних',
  [ROUTES.ADMIN_BILLING]: 'Управління білінгом',
  [ROUTES.ADMIN_INFRASTRUCTURE]: 'Інфраструктура',
  [ROUTES.ADMIN_CONTAINERS]: 'Контейнери',
  [ROUTES.ADMIN_CONFIG]: 'Конфігурація системи',
  [ROUTES.ADMIN_TERMINAL]: 'Термінал адміністратора',
  [ROUTES.ADMIN_BULK_SCRAPE]: 'Пайплайн збору даних',
  [ROUTES.ADMIN_OPEN_DATA_CATALOG]: 'Каталог OpenData',
  [ROUTES.ADMIN_PG_MONITORING]: 'PG Моніторинг',
  [ROUTES.ADMIN_LIMITS]: 'Ліміти системи',
  [ROUTES.ADMIN_SESSION_REPLAY]: 'Запис сесій',
  [ROUTES.ATTORNEY_CLIENTS]: 'Мої клієнти',
};

const SESSION_KEY = 'pending_invitations_dismissed';

export function MainLayout() {
  const location = useLocation();
  const { logout, user } = useAuth();
  const [showInvitationsModal, setShowInvitationsModal] = useState(false);

  // rrweb session recording — starts on login, stops on logout
  useSessionRecorder();
  const pendingConsultations = useConsultationStore(s => s.pendingConsultations);
  const connect = useConsultationStore(s => s.connect);
  const disconnect = useConsultationStore(s => s.disconnect);
  const fetchInitialCounts = useConsultationStore(s => s.fetchInitialCounts);

  // Connect SSE + fetch initial counts on auth
  useEffect(() => {
    if (!user?.id) return;

    connect();
    fetchInitialCounts().then(() => {
      const pending = useConsultationStore.getState().pendingConsultations;
      if (pending.length > 0 && !sessionStorage.getItem(SESSION_KEY)) {
        setShowInvitationsModal(true);
        const count = pending.length;
        const word = count === 1 ? 'новий запит' : count < 5 ? 'нових запити' : 'нових запитів';
        showToast.info(toastTDynamic('pendingConsultationRequests', count, word));
      }
    });

    // Listen for new pending requests arriving via SSE
    const handleNewPending = (e: Event) => {
      const consultation = (e as CustomEvent).detail;
      if (consultation?.status === 'pending') {
        showToast.info(toastTDynamic('newConsultationRequest', consultation.request_title || ''));
      }
    };
    window.addEventListener('consultation-updated', handleNewPending);

    return () => {
      disconnect();
      window.removeEventListener('consultation-updated', handleNewPending);
    };
  }, [user?.id]);

  const handleInvitationsClose = useCallback((remainingIds: string[]) => {
    if (remainingIds.length > 0) {
      consultationService.markViewed(remainingIds).catch(() => {});
    }
    setShowInvitationsModal(false);
    sessionStorage.setItem(SESSION_KEY, '1');
  }, []);

  // Use UI store for sidebar and panel state — individual selectors
  const isSidebarOpen = useUIStore(s => s.isSidebarOpen);
  const isRightPanelOpen = useUIStore(s => s.isRightPanelOpen);
  const rightPanelWidth = useUIStore(s => s.rightPanelWidth);
  const toggleSidebar = useUIStore(s => s.toggleSidebar);
  const toggleRightPanel = useUIStore(s => s.toggleRightPanel);
  const setSidebarOpen = useUIStore(s => s.setSidebarOpen);

  const handleLogout = () => {
    logout();
  };

  // Get current page title based on route
  const getPageTitle = () => {
    // Check for exact match
    if (PAGE_TITLES[location.pathname]) {
      return PAGE_TITLES[location.pathname];
    }

    // Check for dynamic routes
    if (location.pathname.startsWith('/judges/')) {
      return 'Деталі судді';
    }
    if (location.pathname.startsWith('/lawyers/')) {
      return 'Деталі адвоката';
    }
    if (location.pathname.startsWith('/clients/')) {
      if (location.pathname === ROUTES.CLIENT_MESSAGING) {
        return PAGE_TITLES[ROUTES.CLIENT_MESSAGING];
      }
      return 'Деталі клієнта';
    }
    if (location.pathname.startsWith('/matters/')) {
      return 'Деталі справи';
    }
    if (location.pathname.startsWith('/documents/folders/')) {
      const folderPath = location.pathname.replace('/documents/folders/', '');
      const segments = folderPath.split('/').filter(Boolean);
      const decoded = segments.map(s => { try { return decodeURIComponent(s); } catch { return s; } });
      return decoded.length > 0 ? `Документи / ${decoded.join(' / ')}` : 'Документи';
    }

    return 'SecondLayer';
  };

  const pageTitle = getPageTitle();

  return (
    <div className="flex h-screen bg-claude-bg overflow-hidden">
      {/* Sidebar */}
      <div className={`${isSidebarOpen ? 'block' : 'hidden'} h-full`}>
        <Sidebar
          isOpen={isSidebarOpen}
          onClose={() => setSidebarOpen(false)}
          onLogout={handleLogout}
        />
      </div>

      <main className="flex-1 flex flex-col min-w-0 relative h-full">
        {/* Desktop Header */}
        <header className="hidden lg:flex items-center justify-between px-4 py-2 border-b border-claude-border/70 bg-claude-bg/95 backdrop-blur-sm sticky top-0 z-30">
          {/* Left: Toggle button */}
          <div className="flex items-center gap-2 w-[200px]">
            <button
              onClick={toggleSidebar}
              className="p-1.5 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded-md transition-colors duration-150"
              title={isSidebarOpen ? 'Сховати меню' : 'Показати меню'}
            >
              {isSidebarOpen ? (
                <X size={15} strokeWidth={1.75} />
              ) : (
                <Menu size={15} strokeWidth={1.75} />
              )}
            </button>
          </div>

          {/* Center: Page title */}
          <div className="flex-1 flex items-center justify-center">
            <h1 className="font-sans text-[11px] text-zinc-400 font-medium tracking-[0.12em] uppercase select-none">
              {pageTitle}
            </h1>
          </div>

          {/* Right: Toggle right panel button */}
          <div className="flex items-center justify-end gap-2 w-[200px]">
            <button
              onClick={toggleRightPanel}
              className="p-1.5 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded-md transition-colors duration-150"
              title={isRightPanelOpen ? 'Сховати панель' : 'Показати панель'}
            >
              {isRightPanelOpen ? (
                <X size={15} strokeWidth={1.75} />
              ) : (
                <PanelRightOpen size={15} strokeWidth={1.75} />
              )}
            </button>
          </div>
        </header>

        {/* Mobile Header */}
        <header className="lg:hidden flex items-center justify-between px-4 py-2 border-b border-claude-border bg-claude-bg sticky top-0 z-30">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 text-claude-subtext hover:text-claude-text hover:bg-zinc-100 rounded-md transition-colors duration-150"
          >
            <img
              src="/Image_1.jpg"
              alt="Menu"
              className="w-5 h-5 object-contain"
            />
          </button>
          <div className="flex items-center">
            {pageTitle ? (
              <h1 className="text-xs font-sans text-claude-subtext font-medium tracking-widest uppercase">
                {pageTitle}
              </h1>
            ) : (
              <img
                src="/Image.jpg"
                alt="Lex"
                className="h-9 w-auto object-contain"
              />
            )}
          </div>
          <button
            onClick={() => useUIStore.getState().setRightPanelOpen(true)}
            className="p-2 text-claude-subtext hover:text-claude-text hover:bg-zinc-100 rounded-md transition-colors duration-150"
          >
            <PanelRightOpen size={18} strokeWidth={2} />
          </button>
        </header>

        {/* Main Content Area - Outlet renders child routes */}
        <div className="flex-1 flex flex-col relative overflow-hidden">
          <Outlet />
        </div>
      </main>

      {/* Right Panel */}
      <div className={`${isRightPanelOpen ? 'block' : 'hidden'} h-full`} style={{ width: isRightPanelOpen ? rightPanelWidth : 0 }}>
        <RightPanel
          isOpen={isRightPanelOpen}
          onClose={() => useUIStore.getState().setRightPanelOpen(false)}
        />
      </div>

      {/* Time Tracker Widget */}
      <TimeTrackerWidget />

      {/* Onboarding Tour */}
      <OnboardingTour />

      {/* Support Widget — floating help/feedback FAB (LEXAI-869) */}
      <SupportWidget />

      {/* Pending Invitations Modal for attorneys */}
      <PendingInvitationsModal
        open={showInvitationsModal}
        consultations={pendingConsultations}
        onClose={handleInvitationsClose}
      />
    </div>
  );
}
