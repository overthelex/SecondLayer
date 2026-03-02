import { Key, Smartphone, Loader2, Trash2 } from 'lucide-react';
import type { UseProfileReturn } from './types';

type SecuritySectionProps = Pick<
  UseProfileReturn,
  'webauthnCredentials' | 'isRegisteringKey' | 'isDeletingKey' | 'handleRegisterPasskey' | 'handleDeleteCredential'
>;

export function SecuritySection({
  webauthnCredentials,
  isRegisteringKey,
  isDeletingKey,
  handleRegisterPasskey,
  handleDeleteCredential,
}: SecuritySectionProps) {
  return (
    <section className="bg-white rounded-2xl border border-claude-border shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-claude-border/50 bg-claude-bg/30">
        <h3 className="text-sm font-semibold text-claude-subtext uppercase tracking-wider">
          Security Keys (Passkeys)
        </h3>
      </div>
      <div className="p-6 space-y-4">
        {/* Registered credentials */}
        {webauthnCredentials.length > 0 ? (
          <div className="space-y-3">
            {webauthnCredentials.map((cred) => (
              <div key={cred.id} className="flex items-center justify-between p-3 rounded-xl border border-claude-border/50 hover:bg-claude-bg/50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-claude-bg rounded-lg text-claude-subtext">
                    {cred.authenticatorAttachment === 'cross-platform' ? <Key size={18} /> : <Smartphone size={18} />}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-claude-text">
                      {cred.friendlyName || (cred.authenticatorAttachment === 'cross-platform' ? 'Hardware Key' : 'Phone Passkey')}
                    </div>
                    <div className="text-xs text-claude-subtext">
                      {cred.lastUsedAt
                        ? `Останнє використання: ${new Date(cred.lastUsedAt).toLocaleDateString('uk-UA')}`
                        : `Додано: ${new Date(cred.createdAt).toLocaleDateString('uk-UA')}`}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => handleDeleteCredential(cred.id)}
                  disabled={isDeletingKey === cred.id}
                  className="p-2 text-claude-subtext hover:text-red-500 transition-colors disabled:opacity-50"
                  title="Видалити ключ"
                >
                  {isDeletingKey === cred.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-claude-subtext text-center py-2">
            Немає зареєстрованих ключів безпеки
          </p>
        )}

        {/* Register buttons */}
        <div className="flex gap-3 pt-2">
          <button
            onClick={() => handleRegisterPasskey('cross-platform')}
            disabled={isRegisteringKey}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-claude-border text-claude-text rounded-xl font-medium text-sm hover:bg-claude-bg transition-colors disabled:opacity-50"
          >
            {isRegisteringKey ? <Loader2 size={16} className="animate-spin" /> : <Key size={16} />}
            USB / NFC ключ
          </button>
          <button
            onClick={() => handleRegisterPasskey()}
            disabled={isRegisteringKey}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-claude-border text-claude-text rounded-xl font-medium text-sm hover:bg-claude-bg transition-colors disabled:opacity-50"
          >
            {isRegisteringKey ? <Loader2 size={16} className="animate-spin" /> : <Smartphone size={16} />}
            Passkey (телефон)
          </button>
        </div>
      </div>
    </section>
  );
}
