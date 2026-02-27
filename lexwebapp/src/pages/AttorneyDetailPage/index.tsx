import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Star, MapPin, Briefcase, Globe, Clock, ArrowLeft, Loader2, MessageSquare, Scale } from 'lucide-react';
import { attorneyService, type AttorneyProfile, type AttorneyReview } from '../../services/api/AttorneyService';
import { ConsultationRequestModal } from '../../components/consultation/ConsultationRequestModal';

const SPECIALIZATION_LABELS: Record<string, string> = {
  criminal: 'Кримінальне', civil: 'Цивільне', administrative: 'Адміністративне',
  commercial: 'Господарське', family: 'Сімейне', labor: 'Трудове',
  tax: 'Податкове', ip: 'Інтелектуальна власність', real_estate: 'Нерухомість',
};

const COURT_TYPE_LABELS: Record<string, string> = {
  district: 'Районний', appellate: 'Апеляційний', cassation: 'Касаційний',
  constitutional: 'Конституційний', echr: 'ЄСПЛ',
};

export function AttorneyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [attorney, setAttorney] = useState<AttorneyProfile | null>(null);
  const [reviews, setReviews] = useState<AttorneyReview[]>([]);
  const [reviewsTotal, setReviewsTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showRequestModal, setShowRequestModal] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      attorneyService.getAttorney(id),
      attorneyService.getAttorneyReviews(id, { limit: 10 }),
    ])
      .then(([profile, reviewsData]) => {
        setAttorney(profile);
        setReviews(reviewsData.reviews);
        setReviewsTotal(reviewsData.total);
      })
      .catch(() => setAttorney(null))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  if (!attorney) {
    return (
      <div className="max-w-4xl mx-auto p-6 text-center py-20">
        <h2 className="text-xl text-gray-600">Адвоката не знайдено</h2>
        <button onClick={() => navigate(-1)} className="mt-4 text-indigo-600 hover:underline">Назад</button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6">
        <ArrowLeft className="w-4 h-4" /> Назад
      </button>

      <div className="bg-white border rounded-lg p-6 mb-6">
        <div className="flex items-start gap-4 mb-4">
          <div className="w-16 h-16 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-2xl shrink-0">
            {(attorney.user_name || '?')[0].toUpperCase()}
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-900">{attorney.user_name}</h1>
            {attorney.organization_name && (
              <p className="text-gray-500">{attorney.organization_name}</p>
            )}
            <div className="flex items-center gap-1 mt-1">
              {[1, 2, 3, 4, 5].map(i => (
                <Star key={i} className={`w-5 h-5 ${i <= Math.round(attorney.average_rating) ? 'text-yellow-400 fill-yellow-400' : 'text-gray-200'}`} />
              ))}
              <span className="text-sm text-gray-500 ml-2">
                {attorney.average_rating.toFixed(1)} ({attorney.rating_count} відгуків)
              </span>
            </div>
          </div>
          <button
            onClick={() => setShowRequestModal(true)}
            className="px-5 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium text-sm shrink-0"
          >
            <MessageSquare className="w-4 h-4 inline mr-1.5" />
            Замовити консультацію
          </button>
        </div>

        {attorney.bio && <p className="text-gray-700 mb-4">{attorney.bio}</p>}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          {attorney.city && (
            <div className="flex items-center gap-2 text-gray-600">
              <MapPin className="w-4 h-4 text-gray-400" />
              {attorney.city}{attorney.region ? `, ${attorney.region}` : ''}
            </div>
          )}
          {attorney.years_experience && (
            <div className="flex items-center gap-2 text-gray-600">
              <Briefcase className="w-4 h-4 text-gray-400" />
              {attorney.years_experience} років досвіду
            </div>
          )}
          {attorney.serves_remotely && (
            <div className="flex items-center gap-2 text-gray-600">
              <Globe className="w-4 h-4 text-gray-400" />
              Працює дистанційно
            </div>
          )}
          {attorney.total_consultations > 0 && (
            <div className="flex items-center gap-2 text-gray-600">
              <Clock className="w-4 h-4 text-gray-400" />
              {attorney.total_consultations} консультацій
            </div>
          )}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6 mb-6">
        <div className="bg-white border rounded-lg p-5">
          <h3 className="font-semibold text-gray-900 mb-3">Спеціалізації</h3>
          <div className="flex flex-wrap gap-2">
            {attorney.specializations.map(s => (
              <span key={s} className="px-3 py-1 bg-indigo-50 text-indigo-700 rounded-full text-sm">
                {SPECIALIZATION_LABELS[s] || s}
              </span>
            ))}
          </div>
        </div>

        <div className="bg-white border rounded-lg p-5">
          <h3 className="font-semibold text-gray-900 mb-3">Суди</h3>
          <div className="flex flex-wrap gap-2">
            {attorney.court_types.map(c => (
              <span key={c} className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm">
                {COURT_TYPE_LABELS[c] || c}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white border rounded-lg p-5 mb-6">
        <h3 className="font-semibold text-gray-900 mb-3">
          <Scale className="w-4 h-4 inline mr-1.5" />
          Вартість послуг
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-3 bg-gray-50 rounded-lg">
            <p className="text-xs text-gray-500 mb-1">Консультація</p>
            <p className="text-lg font-semibold">
              {attorney.consultation_fee_uah ? `${attorney.consultation_fee_uah} грн` : 'За домовленістю'}
            </p>
          </div>
          <div className="p-3 bg-gray-50 rounded-lg">
            <p className="text-xs text-gray-500 mb-1">Погодинна ставка</p>
            <p className="text-lg font-semibold">
              {attorney.hourly_rate_uah ? `${attorney.hourly_rate_uah} грн/год` : 'За домовленістю'}
            </p>
          </div>
          <div className="p-3 bg-gray-50 rounded-lg">
            <p className="text-xs text-gray-500 mb-1">Представництво</p>
            <p className="text-lg font-semibold">
              {attorney.representation_fee_uah ? `${attorney.representation_fee_uah} грн` : 'За домовленістю'}
            </p>
          </div>
        </div>
        {attorney.free_initial_consultation && (
          <p className="mt-3 text-sm text-green-600 font-medium">Перша консультація безкоштовна</p>
        )}
      </div>

      <div className="bg-white border rounded-lg p-5">
        <h3 className="font-semibold text-gray-900 mb-4">
          Відгуки ({reviewsTotal})
        </h3>
        {reviews.length === 0 ? (
          <p className="text-gray-400 text-sm">Відгуків поки немає</p>
        ) : (
          <div className="space-y-4">
            {reviews.map(review => (
              <div key={review.id} className="border-b pb-4 last:border-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-sm">{review.reviewer_name || 'Користувач'}</span>
                  <div className="flex items-center gap-0.5">
                    {[1, 2, 3, 4, 5].map(i => (
                      <Star key={i} className={`w-3.5 h-3.5 ${i <= review.rating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-200'}`} />
                    ))}
                  </div>
                  <span className="text-xs text-gray-400">
                    {new Date(review.created_at).toLocaleDateString('uk-UA')}
                  </span>
                </div>
                {review.review_text && <p className="text-sm text-gray-700">{review.review_text}</p>}
              </div>
            ))}
          </div>
        )}
      </div>

      {showRequestModal && (
        <ConsultationRequestModal
          attorneyId={attorney.user_id}
          attorneyName={attorney.user_name || ''}
          consultationFee={attorney.consultation_fee_uah}
          onClose={() => setShowRequestModal(false)}
        />
      )}
    </div>
  );
}
