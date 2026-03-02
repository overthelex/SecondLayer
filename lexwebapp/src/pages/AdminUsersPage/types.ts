export interface UserRow {
  id: string;
  email: string;
  name?: string;
  created_at: string;
  balance_usd: number;
  pricing_tier: string;
  total_requests: number;
  total_spent_usd?: number;
  last_request_at: string | null;
  has_crypto_tag?: boolean;
  has_test_tag?: boolean;
}

export interface UserDetail {
  user: any;
  transactions: any[];
  stats: {
    total_requests: number;
    total_spent: number;
    avg_cost: number;
    last_request: string | null;
  };
}

export interface Pagination {
  limit: number;
  offset: number;
  total: number;
}

export interface AttorneyFormData {
  bar_license_number: string;
  bar_admission_date: string;
  years_experience: string;
  education: string;
  specializations: string[];
  court_types: string[];
  region: string;
  city: string;
  serves_remotely: boolean;
  consultation_fee_uah: string;
  hourly_rate_uah: string;
  representation_fee_uah: string;
  free_initial_consultation: boolean;
  bio: string;
  is_available: boolean;
  is_public: boolean;
}

export const TIERS = ['free', 'startup', 'attorney', 'business', 'enterprise', 'internal'];
export const PAGE_SIZE = 50;

export const SPECIALIZATIONS = [
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

export const COURT_TYPES = [
  { value: 'district', label: 'Районний' },
  { value: 'appellate', label: 'Апеляційний' },
  { value: 'cassation', label: 'Касаційний' },
  { value: 'constitutional', label: 'Конституційний' },
  { value: 'echr', label: 'ЄСПЛ' },
];

export const DEFAULT_ATTORNEY_FORM: AttorneyFormData = {
  bar_license_number: '', bar_admission_date: '', years_experience: '', education: '',
  specializations: [], court_types: [], region: '', city: '', serves_remotely: true,
  consultation_fee_uah: '', hourly_rate_uah: '', representation_fee_uah: '',
  free_initial_consultation: false, bio: '', is_available: true, is_public: true,
};

export function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return 'N/A';
  return d.toLocaleDateString('uk-UA', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
