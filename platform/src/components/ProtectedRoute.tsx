import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Loader2 } from 'lucide-react';
import { DeveloperOfferModal } from './DeveloperOfferModal';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, loading, revalidate } = useAuth();
  const [offerJustAccepted, setOfferJustAccepted] = useState(false);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (user && !user.developerOfferAccepted && !offerJustAccepted) {
    return (
      <DeveloperOfferModal
        onAccepted={() => {
          setOfferJustAccepted(true);
          revalidate();
        }}
      />
    );
  }

  return <>{children}</>;
}
