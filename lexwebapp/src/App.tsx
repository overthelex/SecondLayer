import { RouterProvider } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { QueryProvider } from './providers/QueryProvider';
import { AuthProvider } from './contexts/AuthContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { router } from './router';

export function App() {
  return (
    <ErrorBoundary>
      <QueryProvider>
        <AuthProvider>
          <RouterProvider router={router} />
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 3000,
            style: {
              fontFamily: 'Inter, sans-serif',
              fontSize: '14px',
              borderRadius: '12px',
              padding: '14px 16px',
              color: '#2D2D2D',
              background: '#FFFFFF',
              border: '1px solid #E5E5E0',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
            },
          }}
        />
      </AuthProvider>
    </QueryProvider>
    </ErrorBoundary>
  );
}