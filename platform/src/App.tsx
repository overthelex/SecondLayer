import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { ApiKeysPage } from './pages/ApiKeysPage';
import { UsagePage } from './pages/UsagePage';
import { PlaygroundPage } from './pages/PlaygroundPage';
import { DocsLayout } from './pages/docs/DocsLayout';
import { IntroductionPage } from './pages/docs/IntroductionPage';
import { AuthenticationPage } from './pages/docs/AuthenticationPage';
import { QuickStartPage } from './pages/docs/QuickStartPage';
import { McpToolsPage } from './pages/docs/McpToolsPage';
import { ApiReferencePage } from './pages/docs/ApiReferencePage';
import { RateLimitsPage } from './pages/docs/RateLimitsPage';
import { IntegrationsPage } from './pages/docs/IntegrationsPage';
import { ContractPage } from './pages/ContractPage';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="keys" element={<ApiKeysPage />} />
          <Route path="usage" element={<UsagePage />} />
          <Route path="playground" element={<PlaygroundPage />} />
          <Route path="contract" element={<ContractPage />} />

          <Route path="docs" element={<DocsLayout />}>
            <Route index element={<IntroductionPage />} />
            <Route path="authentication" element={<AuthenticationPage />} />
            <Route path="quickstart" element={<QuickStartPage />} />
            <Route path="tools" element={<McpToolsPage />} />
            <Route path="api" element={<ApiReferencePage />} />
            <Route path="rate-limits" element={<RateLimitsPage />} />
            <Route path="integrations" element={<IntegrationsPage />} />
          </Route>
        </Route>
      </Routes>
      <Toaster position="top-right" />
    </BrowserRouter>
  );
}
