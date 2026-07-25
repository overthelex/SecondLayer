import {
  X, KeyRound, AlertTriangle, Briefcase, Trash2, RefreshCw,
} from 'lucide-react';
import {
  AttorneyFormData, TIERS, SPECIALIZATIONS, COURT_TYPES,
} from './types';

// ── Tier Modal ────────────────────────────────────────────

interface TierModalProps {
  tierAction: { userId: string; tier: string };
  setTierAction: (v: null) => void;
  handleTierChange: () => void;
  onChange: (v: { userId: string; tier: string }) => void;
}

export function TierModal({ tierAction, setTierAction, handleTierChange, onChange }: TierModalProps) {
  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setTierAction(null)}>
      <div className="bg-white rounded-xl border border-claude-border shadow-xl p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-claude-text">Change Pricing Tier</h3>
          <button onClick={() => setTierAction(null)} className="p-1 hover:bg-gray-100 rounded"><X size={16} /></button>
        </div>
        <select
          value={tierAction.tier}
          onChange={(e) => onChange({ ...tierAction, tier: e.target.value })}
          className="w-full px-3 py-2 border border-claude-border rounded-lg text-sm mb-4"
        >
          {TIERS.map((t) => (
            <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
          ))}
        </select>
        <button onClick={handleTierChange} className="w-full px-4 py-2 bg-claude-text text-white rounded-lg text-sm">
          Update Tier
        </button>
      </div>
    </div>
  );
}

// ── Balance Modal ─────────────────────────────────────────

interface BalanceModalProps {
  balanceAction: { userId: string; amount: string; reason: string };
  setBalanceAction: (v: null) => void;
  handleAdjustBalance: () => void;
  onChange: (v: { userId: string; amount: string; reason: string }) => void;
}

export function BalanceModal({ balanceAction, setBalanceAction, handleAdjustBalance, onChange }: BalanceModalProps) {
  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setBalanceAction(null)}>
      <div className="bg-white rounded-xl border border-claude-border shadow-xl p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-claude-text">Adjust Balance</h3>
          <button onClick={() => setBalanceAction(null)} className="p-1 hover:bg-gray-100 rounded"><X size={16} /></button>
        </div>
        <input
          type="number" step="0.01" placeholder="Amount (negative to deduct)"
          value={balanceAction.amount}
          onChange={(e) => onChange({ ...balanceAction, amount: e.target.value })}
          className="w-full px-3 py-2 border border-claude-border rounded-lg text-sm mb-3"
        />
        <input
          type="text" placeholder="Reason"
          value={balanceAction.reason}
          onChange={(e) => onChange({ ...balanceAction, reason: e.target.value })}
          className="w-full px-3 py-2 border border-claude-border rounded-lg text-sm mb-4"
        />
        <button onClick={handleAdjustBalance} className="w-full px-4 py-2 bg-claude-text text-white rounded-lg text-sm">
          Adjust Balance
        </button>
      </div>
    </div>
  );
}

// ── Limits Modal ──────────────────────────────────────────

interface LimitsModalProps {
  limitsAction: { userId: string; daily: string; monthly: string };
  setLimitsAction: (v: null) => void;
  handleUpdateLimits: () => void;
  onChange: (v: { userId: string; daily: string; monthly: string }) => void;
}

export function LimitsModal({ limitsAction, setLimitsAction, handleUpdateLimits, onChange }: LimitsModalProps) {
  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setLimitsAction(null)}>
      <div className="bg-white rounded-xl border border-claude-border shadow-xl p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-claude-text">Update Limits</h3>
          <button onClick={() => setLimitsAction(null)} className="p-1 hover:bg-gray-100 rounded"><X size={16} /></button>
        </div>
        <label className="block text-xs text-claude-subtext mb-1">Daily Limit (USD)</label>
        <input
          type="number" step="0.01" placeholder="Leave empty to keep current"
          value={limitsAction.daily}
          onChange={(e) => onChange({ ...limitsAction, daily: e.target.value })}
          className="w-full px-3 py-2 border border-claude-border rounded-lg text-sm mb-3"
        />
        <label className="block text-xs text-claude-subtext mb-1">Monthly Limit (USD)</label>
        <input
          type="number" step="0.01" placeholder="Leave empty to keep current"
          value={limitsAction.monthly}
          onChange={(e) => onChange({ ...limitsAction, monthly: e.target.value })}
          className="w-full px-3 py-2 border border-claude-border rounded-lg text-sm mb-4"
        />
        <button onClick={handleUpdateLimits} className="w-full px-4 py-2 bg-claude-text text-white rounded-lg text-sm">
          Update Limits
        </button>
      </div>
    </div>
  );
}

// ── Reset Password Modals ─────────────────────────────────

interface ResetPasswordConfirmProps {
  data: { userId: string; email: string };
  onClose: () => void;
  onConfirm: () => void;
  loading: boolean;
}

export function ResetPasswordConfirmModal({ data, onClose, onConfirm, loading }: ResetPasswordConfirmProps) {
  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl border border-claude-border shadow-xl p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-claude-text">Reset Password</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><X size={16} /></button>
        </div>
        <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg mb-4">
          <AlertTriangle size={16} className="text-amber-600 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-800">
            A new secure password will be generated for <strong>{data.email}</strong>. The password will be shown <strong>only once</strong> — copy it immediately.
          </p>
        </div>
        <button
          onClick={onConfirm}
          disabled={loading}
          className="w-full px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 transition-colors disabled:opacity-50"
        >
          {loading ? 'Generating...' : 'Generate New Password'}
        </button>
      </div>
    </div>
  );
}

interface ResetPasswordResultProps {
  password: string;
  onClose: () => void;
}

export function ResetPasswordResultModal({ password, onClose }: ResetPasswordResultProps) {
  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl border border-claude-border shadow-xl p-6 w-full max-w-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-claude-text flex items-center gap-2">
            <KeyRound size={16} className="text-green-600" />
            New Password Generated
          </h3>
        </div>
        <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-lg mb-4">
          <AlertTriangle size={16} className="text-red-600 mt-0.5 shrink-0" />
          <p className="text-xs text-red-800">
            <strong>Save this password now.</strong> It will not be shown again — only the hash is stored.
          </p>
        </div>
        <div className="bg-gray-900 text-green-400 font-mono text-sm px-4 py-3 rounded-lg mb-4 tracking-widest select-all text-center">
          {password}
        </div>
        <button onClick={onClose} className="w-full px-4 py-2 bg-claude-text text-white rounded-lg text-sm">
          I have saved the password
        </button>
      </div>
    </div>
  );
}

// ── Create Test User Modal ────────────────────────────────

interface CreateTestUserModalProps {
  data: { email: string; name: string; password: string; credits: string };
  onChange: (v: { email: string; name: string; password: string; credits: string }) => void;
  onClose: () => void;
  onSubmit: () => void;
  loading: boolean;
}

export function CreateTestUserModal({ data, onChange, onClose, onSubmit, loading }: CreateTestUserModalProps) {
  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl border border-claude-border shadow-xl p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-claude-text">Create Test User</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><X size={16} /></button>
        </div>
        <label className="block text-xs text-claude-subtext mb-1">Email *</label>
        <input type="email" placeholder="user@example.com" value={data.email}
          onChange={(e) => onChange({ ...data, email: e.target.value })}
          className="w-full px-3 py-2 border border-claude-border rounded-lg text-sm mb-3" />
        <label className="block text-xs text-claude-subtext mb-1">Name</label>
        <input type="text" placeholder="Display name (optional)" value={data.name}
          onChange={(e) => onChange({ ...data, name: e.target.value })}
          className="w-full px-3 py-2 border border-claude-border rounded-lg text-sm mb-3" />
        <label className="block text-xs text-claude-subtext mb-1">Password * (min 8 chars)</label>
        <input type="password" placeholder="Password" value={data.password}
          onChange={(e) => onChange({ ...data, password: e.target.value })}
          className="w-full px-3 py-2 border border-claude-border rounded-lg text-sm mb-3" />
        <label className="block text-xs text-claude-subtext mb-1">Credits</label>
        <input type="number" min="0" step="1" placeholder="100" value={data.credits}
          onChange={(e) => onChange({ ...data, credits: e.target.value })}
          className="w-full px-3 py-2 border border-claude-border rounded-lg text-sm mb-4" />
        <button onClick={onSubmit} disabled={loading}
          className="w-full px-4 py-2 bg-amber-500 text-white rounded-lg text-sm hover:bg-amber-600 transition-colors disabled:opacity-50">
          {loading ? 'Creating...' : 'Create Test User'}
        </button>
      </div>
    </div>
  );
}

// ── Attorney Profile Modal ────────────────────────────────

interface AttorneyModalProps {
  data: { userId: string; email: string };
  form: AttorneyFormData;
  setForm: (fn: (prev: AttorneyFormData) => AttorneyFormData) => void;
  isEdit: boolean;
  loading: boolean;
  saving: boolean;
  onClose: () => void;
  onSave: () => void;
  onDelete: () => void;
  toggleArray: (field: 'specializations' | 'court_types', value: string) => void;
}

export function AttorneyModal({
  data, form, setForm, isEdit, loading, saving,
  onClose, onSave, onDelete, toggleArray,
}: AttorneyModalProps) {
  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 overflow-y-auto py-8" onClick={onClose}>
      <div className="bg-white rounded-xl border border-claude-border shadow-xl p-6 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-claude-text flex items-center gap-2">
            <Briefcase size={16} className="text-indigo-600" />
            {isEdit ? 'Редагувати профіль адвоката' : 'Створити профіль адвоката'}
          </h3>
          <div className="flex items-center gap-2">
            {isEdit && (
              <button onClick={onDelete} className="p-1 hover:bg-red-100 rounded text-red-500" title="Видалити профіль">
                <Trash2 size={16} />
              </button>
            )}
            <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><X size={16} /></button>
          </div>
        </div>

        <p className="text-xs text-claude-subtext mb-4">Користувач: <strong>{data.email}</strong></p>

        {loading ? (
          <div className="text-center py-8 text-claude-subtext">
            <RefreshCw size={20} className="animate-spin inline-block mr-2" />
            Завантаження...
          </div>
        ) : (
          <div className="space-y-5">
            {/* Credentials */}
            <div>
              <h4 className="text-sm font-medium text-claude-text mb-3">Облікові дані</h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-claude-subtext mb-1">Номер свідоцтва</label>
                  <input type="text" value={form.bar_license_number} onChange={e => setForm(p => ({ ...p, bar_license_number: e.target.value }))} className="w-full px-3 py-2 border border-claude-border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-claude-subtext mb-1">Дата допуску</label>
                  <input type="date" value={form.bar_admission_date} onChange={e => setForm(p => ({ ...p, bar_admission_date: e.target.value }))} className="w-full px-3 py-2 border border-claude-border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-claude-subtext mb-1">Років досвіду</label>
                  <input type="number" value={form.years_experience} onChange={e => setForm(p => ({ ...p, years_experience: e.target.value }))} className="w-full px-3 py-2 border border-claude-border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-claude-subtext mb-1">Освіта</label>
                  <input type="text" value={form.education} onChange={e => setForm(p => ({ ...p, education: e.target.value }))} className="w-full px-3 py-2 border border-claude-border rounded-lg text-sm" />
                </div>
              </div>
            </div>

            {/* Specializations */}
            <div>
              <h4 className="text-sm font-medium text-claude-text mb-2">Спеціалізації</h4>
              <div className="flex flex-wrap gap-2">
                {SPECIALIZATIONS.map(s => (
                  <button key={s.value} type="button" onClick={() => toggleArray('specializations', s.value)}
                    className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                      form.specializations.includes(s.value)
                        ? 'bg-indigo-100 border-indigo-300 text-indigo-700'
                        : 'bg-white border-claude-border text-claude-subtext hover:border-gray-300'
                    }`}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Court types */}
            <div>
              <h4 className="text-sm font-medium text-claude-text mb-2">Суди</h4>
              <div className="flex flex-wrap gap-2">
                {COURT_TYPES.map(c => (
                  <button key={c.value} type="button" onClick={() => toggleArray('court_types', c.value)}
                    className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                      form.court_types.includes(c.value)
                        ? 'bg-indigo-100 border-indigo-300 text-indigo-700'
                        : 'bg-white border-claude-border text-claude-subtext hover:border-gray-300'
                    }`}>
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Location */}
            <div>
              <h4 className="text-sm font-medium text-claude-text mb-3">Локація</h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-claude-subtext mb-1">Регіон</label>
                  <input type="text" value={form.region} onChange={e => setForm(p => ({ ...p, region: e.target.value }))} className="w-full px-3 py-2 border border-claude-border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-claude-subtext mb-1">Місто</label>
                  <input type="text" value={form.city} onChange={e => setForm(p => ({ ...p, city: e.target.value }))} className="w-full px-3 py-2 border border-claude-border rounded-lg text-sm" />
                </div>
              </div>
              <label className="flex items-center gap-2 text-xs mt-2">
                <input type="checkbox" className="rounded" checked={form.serves_remotely} onChange={e => setForm(p => ({ ...p, serves_remotely: e.target.checked }))} />
                Працює дистанційно
              </label>
            </div>

            {/* Pricing */}
            <div>
              <h4 className="text-sm font-medium text-claude-text mb-3">Вартість послуг (грн)</h4>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-claude-subtext mb-1">Консультація</label>
                  <input type="number" value={form.consultation_fee_uah} onChange={e => setForm(p => ({ ...p, consultation_fee_uah: e.target.value }))} className="w-full px-3 py-2 border border-claude-border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-claude-subtext mb-1">Погодинна ставка</label>
                  <input type="number" value={form.hourly_rate_uah} onChange={e => setForm(p => ({ ...p, hourly_rate_uah: e.target.value }))} className="w-full px-3 py-2 border border-claude-border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-claude-subtext mb-1">Представництво</label>
                  <input type="number" value={form.representation_fee_uah} onChange={e => setForm(p => ({ ...p, representation_fee_uah: e.target.value }))} className="w-full px-3 py-2 border border-claude-border rounded-lg text-sm" />
                </div>
              </div>
              <label className="flex items-center gap-2 text-xs mt-2">
                <input type="checkbox" className="rounded" checked={form.free_initial_consultation} onChange={e => setForm(p => ({ ...p, free_initial_consultation: e.target.checked }))} />
                Перша консультація безкоштовна
              </label>
            </div>

            {/* Bio */}
            <div>
              <h4 className="text-sm font-medium text-claude-text mb-2">Про адвоката</h4>
              <textarea rows={3} value={form.bio} onChange={e => setForm(p => ({ ...p, bio: e.target.value }))} placeholder="Досвід, підхід до роботи..." className="w-full px-3 py-2 border border-claude-border rounded-lg text-sm" />
            </div>

            {/* Settings */}
            <div>
              <h4 className="text-sm font-medium text-claude-text mb-2">Налаштування</h4>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-xs">
                  <input type="checkbox" className="rounded" checked={form.is_available} onChange={e => setForm(p => ({ ...p, is_available: e.target.checked }))} />
                  Доступний
                </label>
                <label className="flex items-center gap-2 text-xs">
                  <input type="checkbox" className="rounded" checked={form.is_public} onChange={e => setForm(p => ({ ...p, is_public: e.target.checked }))} />
                  Публічний профіль
                </label>
              </div>
            </div>

            <button onClick={onSave} disabled={saving}
              className="w-full px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 transition-colors disabled:opacity-50">
              {saving ? 'Збереження...' : isEdit ? 'Оновити профіль' : 'Створити профіль'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
