import { useState, useEffect } from 'react';
import { Loader2, Save, User } from 'lucide-react';
import { attorneyService, type AttorneyProfile } from '../../services/api/AttorneyService';

const SPECIALIZATIONS = [
  { value: 'criminal', label: 'Кримінальне' },
  { value: 'civil', label: 'Цивільне' },
  { value: 'administrative', label: 'Адміністративне' },
  { value: 'commercial', label: 'Господарське' },
  { value: 'family', label: 'Сімейне' },
  { value: 'labor', label: 'Трудове' },
  { value: 'tax', label: 'Податкове' },
  { value: 'ip', label: 'Інтелектуальна власність' },
  { value: 'real_estate', label: 'Нерухомість' },
];

const COURT_TYPES = [
  { value: 'district', label: 'Районний' },
  { value: 'appellate', label: 'Апеляційний' },
  { value: 'cassation', label: 'Касаційний' },
  { value: 'constitutional', label: 'Конституційний' },
  { value: 'echr', label: 'ЄСПЛ' },
];

export function AttorneyProfilePage() {
  const [profile, setProfile] = useState<Partial<AttorneyProfile>>({
    specializations: [],
    court_types: [],
    languages: ['ukrainian'],
    serves_remotely: true,
    is_available: true,
    is_public: true,
    free_initial_consultation: false,
  });
  const [isNew, setIsNew] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    attorneyService.getMyProfile()
      .then(p => { setProfile(p); setIsNew(false); })
      .catch(() => setIsNew(true))
      .finally(() => setLoading(false));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      if (isNew) {
        const created = await attorneyService.createProfile(profile);
        setProfile(created);
        setIsNew(false);
        setSuccess('Профіль створено');
      } else {
        const updated = await attorneyService.updateProfile(profile);
        setProfile(updated);
        setSuccess('Профіль оновлено');
      }
    } catch (err: any) {
      setError(err.message || 'Помилка збереження');
    } finally {
      setSaving(false);
    }
  };

  const toggleArrayValue = (field: 'specializations' | 'court_types', value: string) => {
    setProfile(prev => {
      const arr = prev[field] || [];
      return {
        ...prev,
        [field]: arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value],
      };
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <div className="flex items-center gap-3 mb-8">
        <User className="w-7 h-7 text-indigo-600" />
        <h1 className="text-2xl font-bold text-gray-900">
          {isNew ? 'Створити профіль адвоката' : 'Мій профіль адвоката'}
        </h1>
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}
      {success && <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">{success}</div>}

      <form onSubmit={handleSubmit} className="space-y-6">
        <section className="bg-white border rounded-lg p-5">
          <h3 className="font-semibold mb-4">Облікові дані</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Номер свідоцтва</label>
              <input type="text" className="w-full px-3 py-2 border rounded-md text-sm" value={profile.bar_license_number || ''} onChange={e => setProfile(p => ({ ...p, bar_license_number: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Дата допуску</label>
              <input type="date" className="w-full px-3 py-2 border rounded-md text-sm" value={profile.bar_admission_date || ''} onChange={e => setProfile(p => ({ ...p, bar_admission_date: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Років досвіду</label>
              <input type="number" className="w-full px-3 py-2 border rounded-md text-sm" value={profile.years_experience || ''} onChange={e => setProfile(p => ({ ...p, years_experience: parseInt(e.target.value) || undefined }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Освіта</label>
              <input type="text" className="w-full px-3 py-2 border rounded-md text-sm" value={profile.education || ''} onChange={e => setProfile(p => ({ ...p, education: e.target.value }))} />
            </div>
          </div>
        </section>

        <section className="bg-white border rounded-lg p-5">
          <h3 className="font-semibold mb-4">Спеціалізації</h3>
          <div className="flex flex-wrap gap-2">
            {SPECIALIZATIONS.map(s => (
              <button key={s.value} type="button"
                onClick={() => toggleArrayValue('specializations', s.value)}
                className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                  (profile.specializations || []).includes(s.value)
                    ? 'bg-indigo-100 border-indigo-300 text-indigo-700'
                    : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </section>

        <section className="bg-white border rounded-lg p-5">
          <h3 className="font-semibold mb-4">Суди</h3>
          <div className="flex flex-wrap gap-2">
            {COURT_TYPES.map(c => (
              <button key={c.value} type="button"
                onClick={() => toggleArrayValue('court_types', c.value)}
                className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                  (profile.court_types || []).includes(c.value)
                    ? 'bg-indigo-100 border-indigo-300 text-indigo-700'
                    : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </section>

        <section className="bg-white border rounded-lg p-5">
          <h3 className="font-semibold mb-4">Локація</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Регіон</label>
              <input type="text" className="w-full px-3 py-2 border rounded-md text-sm" value={profile.region || ''} onChange={e => setProfile(p => ({ ...p, region: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Місто</label>
              <input type="text" className="w-full px-3 py-2 border rounded-md text-sm" value={profile.city || ''} onChange={e => setProfile(p => ({ ...p, city: e.target.value }))} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm mt-3">
            <input type="checkbox" className="rounded" checked={profile.serves_remotely || false} onChange={e => setProfile(p => ({ ...p, serves_remotely: e.target.checked }))} />
            Працюю дистанційно
          </label>
        </section>

        <section className="bg-white border rounded-lg p-5">
          <h3 className="font-semibold mb-4">Вартість послуг (грн)</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Консультація</label>
              <input type="number" className="w-full px-3 py-2 border rounded-md text-sm" value={profile.consultation_fee_uah || ''} onChange={e => setProfile(p => ({ ...p, consultation_fee_uah: parseFloat(e.target.value) || undefined }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Погодинна ставка</label>
              <input type="number" className="w-full px-3 py-2 border rounded-md text-sm" value={profile.hourly_rate_uah || ''} onChange={e => setProfile(p => ({ ...p, hourly_rate_uah: parseFloat(e.target.value) || undefined }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Представництво</label>
              <input type="number" className="w-full px-3 py-2 border rounded-md text-sm" value={profile.representation_fee_uah || ''} onChange={e => setProfile(p => ({ ...p, representation_fee_uah: parseFloat(e.target.value) || undefined }))} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm mt-3">
            <input type="checkbox" className="rounded" checked={profile.free_initial_consultation || false} onChange={e => setProfile(p => ({ ...p, free_initial_consultation: e.target.checked }))} />
            Перша консультація безкоштовна
          </label>
        </section>

        <section className="bg-white border rounded-lg p-5">
          <h3 className="font-semibold mb-4">Про себе</h3>
          <textarea
            rows={4}
            className="w-full px-3 py-2 border rounded-md text-sm"
            placeholder="Розкажіть про себе, свій досвід та підхід до роботи..."
            value={profile.bio || ''}
            onChange={e => setProfile(p => ({ ...p, bio: e.target.value }))}
          />
        </section>

        <section className="bg-white border rounded-lg p-5">
          <h3 className="font-semibold mb-4">Налаштування</h3>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="rounded" checked={profile.is_available || false} onChange={e => setProfile(p => ({ ...p, is_available: e.target.checked }))} />
              Доступний для консультацій
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="rounded" checked={profile.is_public || false} onChange={e => setProfile(p => ({ ...p, is_public: e.target.checked }))} />
              Публічний профіль (видимий в пошуку)
            </label>
          </div>
        </section>

        <button
          type="submit"
          disabled={saving}
          className="w-full py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {isNew ? 'Створити профіль' : 'Зберегти зміни'}
        </button>
      </form>
    </div>
  );
}
