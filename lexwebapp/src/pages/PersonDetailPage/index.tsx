/**
 * Person Detail Page
 * Displays details for a judge or lawyer
 */

import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { PersonDetailPage as PersonDetailPageComponent } from '../../components/PersonDetailPage';
import { LawyerProfilePage } from '../../components/LawyerProfilePage';
import { erauService, ERAUProfile } from '../../services/api/ERAUService';
import { ROUTES } from '../../router/routes';

interface PersonDetailPageProps {
  type: 'judge' | 'lawyer';
}

export function PersonDetailPage({ type }: PersonDetailPageProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const [profile, setProfile] = useState<ERAUProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get person data from location state (for judges)
  const person = location.state?.person?.data;

  const handleBack = () => {
    if (type === 'judge') {
      navigate(ROUTES.JUDGES);
    } else {
      navigate(ROUTES.LAWYERS);
    }
  };

  // Fetch ERAU profile for lawyers
  useEffect(() => {
    if (type !== 'lawyer' || !id) return;

    setLoading(true);
    setError(null);

    erauService.getProfile(id)
      .then((data) => {
        setProfile(data);
      })
      .catch((err) => {
        setError(err.message || 'Не вдалося завантажити профіль адвоката');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [type, id]);

  // Lawyer view
  if (type === 'lawyer') {
    if (loading) {
      return (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-claude-accent border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-claude-subtext">Завантаження профілю...</p>
          </div>
        </div>
      );
    }

    if (error || !profile) {
      return (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-claude-subtext">{error || 'Профіль не знайдено'}</p>
            <button
              onClick={handleBack}
              className="mt-4 px-4 py-2 bg-claude-accent text-white rounded-lg"
            >
              Повернутися назад
            </button>
          </div>
        </div>
      );
    }

    return <LawyerProfilePage profile={profile} onBack={handleBack} />;
  }

  // Judge view (existing behavior)
  if (!person) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <p className="text-claude-subtext">Завантаження...</p>
          <button
            onClick={handleBack}
            className="mt-4 px-4 py-2 bg-claude-accent text-white rounded-lg"
          >
            Повернутися назад
          </button>
        </div>
      </div>
    );
  }

  return (
    <PersonDetailPageComponent
      type={type}
      person={person}
      onBack={handleBack}
    />
  );
}
