/**
 * Person Detail Page
 * Displays details for a judge or lawyer
 */

import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { LawyerProfilePage } from '../../components/LawyerProfilePage';
import { JudgeProfilePage } from '../../components/JudgeProfilePage';
import { erauService, ERAUProfile } from '../../services/api/ERAUService';
import { judgesService, JudgeProfile } from '../../services/api/JudgesService';
import { ROUTES } from '../../router/routes';

interface PersonDetailPageProps {
  type: 'judge' | 'lawyer';
}

export function PersonDetailPage({ type }: PersonDetailPageProps) {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const [lawyerProfile, setLawyerProfile] = useState<ERAUProfile | null>(null);
  const [judgeProfile, setJudgeProfile] = useState<JudgeProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        setLawyerProfile(data);
      })
      .catch((err) => {
        setError(err.message || 'Не вдалося завантажити профіль адвоката');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [type, id]);

  // Fetch judge profile
  useEffect(() => {
    if (type !== 'judge' || !id) return;

    setLoading(true);
    setError(null);

    judgesService.getJudgeProfile(id)
      .then((data) => {
        setJudgeProfile(data);
      })
      .catch((err) => {
        setError(err.message || 'Не вдалося завантажити профіль судді');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [type, id]);

  // Loading state
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

  // Error state
  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <p className="text-claude-subtext">{error}</p>
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

  // Lawyer view
  if (type === 'lawyer') {
    if (!lawyerProfile) {
      return (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-claude-subtext">Профіль не знайдено</p>
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

    return <LawyerProfilePage profile={lawyerProfile} onBack={handleBack} />;
  }

  // Judge view
  if (!judgeProfile) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <p className="text-claude-subtext">Профіль не знайдено</p>
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

  return <JudgeProfilePage profile={judgeProfile} onBack={handleBack} />;
}
