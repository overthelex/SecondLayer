import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Copy, Check, Loader2, Key } from 'lucide-react';
import { api } from '@/utils/api-client';
import toast from 'react-hot-toast';

interface ApiKey {
  id: string;
  name: string;
  key: string;
  created_at: string;
  last_used_at: string | null;
  usage_count: number;
  is_active: boolean;
}

export function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const loadKeys = useCallback(async () => {
    try {
      const { data } = await api.get('/keys');
      setKeys(data.keys || []);
    } catch {
      toast.error('Не вдалося завантажити ключі');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadKeys(); }, [loadKeys]);

  const handleCreate = async () => {
    if (!newKeyName.trim()) return;
    setCreating(true);
    try {
      const { data } = await api.post('/keys', { name: newKeyName.trim() });
      setRevealedKey(data.key.key);
      setShowModal(false);
      setNewKeyName('');
      toast.success('API ключ створено');
      loadKeys();
    } catch {
      toast.error('Не вдалося створити ключ');
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (keyId: string) => {
    if (!confirm('Відкликати цей API ключ? Цю дію не можна скасувати.')) return;
    setDeletingId(keyId);
    try {
      await api.delete(`/keys/${keyId}`);
      toast.success('Ключ відкликано');
      loadKeys();
    } catch {
      toast.error('Не вдалося відкликати ключ');
    } finally {
      setDeletingId(null);
    }
  };

  const handleCopy = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-txt-primary">API Keys</h1>
          <p className="text-sm text-txt-muted mt-1">
            Керуйте ключами для доступу до SecondLayer API
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 transition-colors"
        >
          <Plus size={16} />
          Створити ключ
        </button>
      </div>

      {/* Revealed key banner */}
      {revealedKey && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-green-800">
              Збережіть ваш API ключ — він більше не буде показаний
            </span>
            <button onClick={() => setRevealedKey(null)} className="text-green-600 text-sm hover:underline">
              Приховати
            </button>
          </div>
          <div className="flex items-center gap-2 bg-white border border-green-200 rounded-lg px-3 py-2">
            <code className="text-sm font-mono text-txt-primary flex-1 break-all">{revealedKey}</code>
            <button
              onClick={() => handleCopy(revealedKey, 'revealed')}
              className="text-txt-muted hover:text-txt-primary"
            >
              {copiedId === 'revealed' ? <Check size={16} className="text-green-600" /> : <Copy size={16} />}
            </button>
          </div>
        </div>
      )}

      {/* Keys table */}
      <div className="bg-white rounded-xl border border-border overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <Loader2 className="w-6 h-6 animate-spin text-brand-600 mx-auto" />
          </div>
        ) : keys.length === 0 ? (
          <div className="p-8 text-center">
            <Key className="w-10 h-10 text-txt-muted mx-auto mb-3" />
            <p className="text-sm text-txt-muted">У вас ще немає API ключів</p>
            <button
              onClick={() => setShowModal(true)}
              className="mt-3 text-sm text-brand-600 hover:text-brand-700 font-medium"
            >
              Створити перший ключ
            </button>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border-light bg-surface-secondary">
                <th className="text-left text-xs font-medium text-txt-muted px-4 py-3">Назва</th>
                <th className="text-left text-xs font-medium text-txt-muted px-4 py-3">Ключ</th>
                <th className="text-left text-xs font-medium text-txt-muted px-4 py-3">Створено</th>
                <th className="text-left text-xs font-medium text-txt-muted px-4 py-3">Останнє використання</th>
                <th className="text-right text-xs font-medium text-txt-muted px-4 py-3">Запити</th>
                <th className="text-right text-xs font-medium text-txt-muted px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {keys.map((key) => (
                <tr key={key.id} className="border-b border-border-light last:border-0 hover:bg-surface-secondary/50">
                  <td className="px-4 py-3 text-sm font-medium text-txt-primary">{key.name}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <code className="text-xs font-mono text-txt-muted">{key.key}</code>
                      <button
                        onClick={() => handleCopy(key.key, key.id)}
                        className="text-txt-muted hover:text-txt-primary"
                      >
                        {copiedId === key.id ? <Check size={12} className="text-green-600" /> : <Copy size={12} />}
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-txt-muted">
                    {new Date(key.created_at).toLocaleDateString('uk-UA')}
                  </td>
                  <td className="px-4 py-3 text-xs text-txt-muted">
                    {key.last_used_at ? new Date(key.last_used_at).toLocaleDateString('uk-UA') : '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-txt-muted text-right">
                    {key.usage_count.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleRevoke(key.id)}
                      disabled={deletingId === key.id}
                      className="p-1.5 text-txt-muted hover:text-red-500 transition-colors disabled:opacity-50"
                      title="Відкликати"
                    >
                      {deletingId === key.id ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Trash2 size={14} />
                      )}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-semibold text-txt-primary mb-4">Створити API ключ</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-txt-secondary mb-1">Назва</label>
                <input
                  type="text"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  placeholder="напр. Claude Code, Production"
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => { setShowModal(false); setNewKeyName(''); }}
                className="px-4 py-2 text-sm font-medium text-txt-secondary hover:text-txt-primary transition-colors"
              >
                Скасувати
              </button>
              <button
                onClick={handleCreate}
                disabled={creating || !newKeyName.trim()}
                className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 transition-colors disabled:opacity-50"
              >
                {creating ? <Loader2 size={16} className="animate-spin" /> : 'Створити'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
