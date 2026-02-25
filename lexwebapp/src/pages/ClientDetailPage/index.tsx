/**
 * Client Detail Page
 * Fetches client by URL param, no longer depends on location.state
 */

import { useParams, useNavigate } from 'react-router-dom';
import { ClientDetailPage as ClientDetailPageComponent } from '../../components/ClientDetailPage';
import { useClient } from '../../hooks/queries/useClients';
import { Spinner } from '../../components/ui/Spinner';
import { ROUTES } from '../../router/routes';

export function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: client, isLoading, error } = useClient(id || '');

  const handleBack = () => {
    navigate(ROUTES.CLIENTS);
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error || !client) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <p className="text-claude-subtext font-sans">Клієнта не знайдено</p>
          <button
            onClick={handleBack}
            className="mt-4 px-4 py-2 bg-claude-accent text-white rounded-lg font-sans text-sm"
          >
            Повернутися до списку
          </button>
        </div>
      </div>
    );
  }

  return <ClientDetailPageComponent client={client} onBack={handleBack} />;
}
