/**
 * Person Detail Page
 * Displays details for a judge or lawyer
 */

import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { LawyerProfilePage } from './LawyerProfile';
import { JudgeProfilePage } from './JudgeProfile';
import { JudgeDossier } from './JudgeDossier';
import { erauService, ERAUProfile } from '../../services/api/ERAUService';
import { judgesService, JudgeProfile } from '../../services/api/JudgesService';
import { judgeAnalyticsService, JudgeAnalyticsRecord, PeerJudge } from '../../services/api/JudgeAnalyticsService';
import { ROUTES } from '../../router/routes';

interface PersonDetailPageProps {
  type: 'judge' | 'lawyer';
}

export function PersonDetailPage({ type }: PersonDetailPageProps) {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const [lawyerProfile, setLawyerProfile] = useState<ERAUProfile | null>(null);
  const [judgeProfile, setJudgeProfile] = useState<JudgeProfile | null>(null);
  const [judgeAnalytics, setJudgeAnalytics] = useState<JudgeAnalyticsRecord | null>(null);
  const [judgePeers, setJudgePeers] = useState<PeerJudge[]>([]);
  const [judgePeersTotalInCourt, setJudgePeersTotalInCourt] = useState(0);
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

  // Fetch judge profile + analytics
  useEffect(() => {
    if (type !== 'judge' || !id) return;

    setLoading(true);
    setError(null);

    Promise.all([
      judgesService.getJudgeProfile(id).catch((err) => {
        if (err.status === 404) return null;
        throw err;
      }),
      judgeAnalyticsService.getAnalyticsDetail(id).catch(() => null),
      judgeAnalyticsService.getAnalyticsPeers(id).catch(() => null),
    ])
      .then(([profile, analytics, peersResult]) => {
        if (!profile && !analytics) {
          setError('Суддю не знайдено');
          return;
        }
        if (profile) {
          setJudgeProfile(profile);
        } else if (analytics) {
          // Build minimal profile from analytics data
          setJudgeProfile({
            basic: {
              id: analytics.id,
              dossier_number: analytics.dossier_number,
              full_name: analytics.judge_name,
              gender: null,
              court_name: analytics.court_name,
              first_seen: null,
              last_seen: null,
              snapshot_count: 0,
            },
            court_history: [],
            zo_id: null,
            stats: null,
          });
        }
        setJudgeAnalytics(analytics);
        if (peersResult) {
          setJudgePeers(peersResult.peers);
          setJudgePeersTotalInCourt(peersResult.total_in_court);
        }
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

  return (
    <JudgeProfilePage profile={judgeProfile} onBack={handleBack}>
      {judgeAnalytics && (
        <JudgeDossier
          analytics={judgeAnalytics}
          peers={judgePeers}
          totalInCourt={judgePeersTotalInCourt}
        />
      )}
    </JudgeProfilePage>
  );
}
