import { useState } from 'react';
import { Award, MapPin, Calendar, User } from 'lucide-react';
import type { ERAULawyer } from '../../../services/api/ERAUService';
import type { AttorneyProfile } from '../../../services/api/AttorneyService';

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

interface Step3ConfirmProps {
  lawyer: ERAULawyer | null;
  onSubmit: (data: Partial<AttorneyProfile>) => void;
  onBack: () => void;
}

export function Step3Confirm({ lawyer, onSubmit, onBack }: Step3ConfirmProps) {
  const [specializations, setSpecializations] = useState<string[]>([]);
  const [city, setCity] = useState('');
  const [bio, setBio] = useState('');

  const toggleSpec = (value: string) => {
    setSpecializations((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );
  };

  const handleSubmit = () => {
    const data: Partial<AttorneyProfile> = {
      specializations,
      city: city || undefined,
      bio: bio || undefined,
    };
    if (lawyer) {
      data.bar_license_number = lawyer.certnum;
      data.bar_admission_date = lawyer.certat;
      data.region = lawyer.racalc;
    }
    onSubmit(data);
  };

  return (
    <div className="px-6 py-4">
      <h2 className="text-lg font-bold text-gray-900 mb-1">
        Підтвердіть дані
      </h2>
      <p className="text-sm text-gray-500 mb-5">
        {lawyer
          ? 'Перевірте дані з ЄРАУ та додайте інформацію.'
          : 'Заповніть основну інформацію для профілю.'}
      </p>

      {lawyer && (
        <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-lg mb-5">
          <div className="flex items-center gap-2 mb-3">
            <User className="w-4 h-4 text-indigo-600" />
            <span className="font-semibold text-sm text-indigo-900">
              {lawyer.surname} {lawyer.firstname} {lawyer.middlename}
            </span>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <span className="flex items-center gap-1.5 text-xs text-indigo-700">
              <Award className="w-3.5 h-3.5" />
              Свідоцтво: {lawyer.certnum}
            </span>
            <span className="flex items-center gap-1.5 text-xs text-indigo-700">
              <Calendar className="w-3.5 h-3.5" />
              Видано: {lawyer.certat}
            </span>
            <span className="flex items-center gap-1.5 text-xs text-indigo-700">
              <MapPin className="w-3.5 h-3.5" />
              {lawyer.racalc}
            </span>
          </div>
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Спеціалізації
          </label>
          <div className="flex flex-wrap gap-2">
            {SPECIALIZATIONS.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => toggleSpec(s.value)}
                className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                  specializations.includes(s.value)
                    ? 'bg-indigo-100 border-indigo-300 text-indigo-700'
                    : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Місто
          </label>
          <input
            type="text"
            placeholder="Наприклад, Київ"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-claude-accent/30 focus:border-claude-accent"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Про себе
          </label>
          <textarea
            rows={3}
            placeholder="Коротко про ваш досвід та підхід до роботи..."
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-claude-accent/30 focus:border-claude-accent"
          />
        </div>
      </div>

      <div className="flex items-center justify-between pt-5">
        <button
          onClick={onBack}
          className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
        >
          Назад
        </button>
        <button
          onClick={handleSubmit}
          className="px-6 py-2.5 bg-gradient-to-r from-claude-accent to-orange-600 text-white rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
        >
          Почати роботу
        </button>
      </div>
    </div>
  );
}
