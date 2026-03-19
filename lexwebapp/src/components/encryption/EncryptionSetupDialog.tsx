/**
 * EncryptionSetupDialog
 * Modal for first-time E2EE setup: password entry, key generation, key file download.
 * Also handles unlock flow for returning users.
 */

import { useState, useCallback } from 'react';
import { Modal } from '../ui/Modal/Modal';
import { Shield, Download, Eye, EyeOff, Loader2, KeyRound, Lock, RefreshCw, Copy, Check } from 'lucide-react';
import { useEncryptionStore, downloadKeyFile } from '../../stores/encryptionStore';
import type { EncryptedKeyBundle } from '../../services/crypto';

interface EncryptionSetupDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** 'setup' for first time, 'unlock' for returning users */
  mode: 'setup' | 'unlock';
}

/** Generate a cryptographically strong password: 4 random words + 2 digits + 1 symbol */
function generateStrongPassword(): string {
  const words = [
    'Право', 'Закон', 'Кодекс', 'Стаття', 'Суддя', 'Позов', 'Захист', 'Доказ',
    'Свідок', 'Вирок', 'Справа', 'Норма', 'Угода', 'Скарга', 'Апеляція', 'Касація',
    'Рішення', 'Ухвала', 'Постанова', 'Клопотання', 'Договір', 'Оренда', 'Спадок',
    'Довіреність', 'Реєстр', 'Ліцензія', 'Патент', 'Аудит', 'Експерт', 'Арбітр',
    'Медіація', 'Нотаріус', 'Адвокат', 'Прокурор', 'Юрист', 'Мандат',
  ];
  const symbols = '!@#$%&*';
  const arr = new Uint32Array(7);
  crypto.getRandomValues(arr);
  const w1 = words[arr[0] % words.length];
  const w2 = words[arr[1] % words.length];
  const w3 = words[arr[2] % words.length];
  const w4 = words[arr[3] % words.length];
  const d1 = arr[4] % 10;
  const d2 = arr[5] % 10;
  const sym = symbols[arr[6] % symbols.length];
  return `${w1}-${w2}-${w3}-${w4}${d1}${d2}${sym}`;
}

export function EncryptionSetupDialog({ isOpen, onClose, mode }: EncryptionSetupDialogProps) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [keyBundle, setKeyBundle] = useState<EncryptedKeyBundle | null>(null);
  const [keyDownloaded, setKeyDownloaded] = useState(false);
  const [copied, setCopied] = useState(false);

  const { setup, unlock, isLoading, error } = useEncryptionStore();

  const handleGeneratePassword = useCallback(() => {
    const pw = generateStrongPassword();
    setPassword(pw);
    setConfirmPassword(pw);
    setShowPassword(true);
    setCopied(false);
  }, []);

  const handleCopyPassword = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select input text
    }
  }, [password]);

  const handleSetup = async () => {
    if (password.length < 8) return;
    if (password !== confirmPassword) return;

    try {
      const bundle = await setup(password);
      setKeyBundle(bundle);
    } catch {
      // Error is handled in store
    }
  };

  const handleUnlock = async () => {
    if (!password) return;
    try {
      await unlock(password);
      handleClose();
    } catch {
      // Error is handled in store
    }
  };

  const handleDownloadKey = () => {
    if (keyBundle) {
      downloadKeyFile(keyBundle);
      setKeyDownloaded(true);
    }
  };

  const handleClose = () => {
    setPassword('');
    setConfirmPassword('');
    setShowPassword(false);
    setKeyBundle(null);
    setKeyDownloaded(false);
    setCopied(false);
    onClose();
  };

  const handleFinish = () => {
    handleClose();
  };

  const isSetupMode = mode === 'setup';
  const showKeyDownload = isSetupMode && keyBundle;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={isSetupMode ? 'Налаштування шифрування' : 'Розблокувати сейф'}
      size="md"
    >
      {showKeyDownload ? (
        /* Key download step */
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-xl">
            <Shield size={20} className="text-green-600 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-green-800">
                Ключі шифрування створено
              </p>
              <p className="text-xs text-green-600 mt-0.5">
                Завантажте резервний файл ключа. Без нього та пароля ви не зможете відновити доступ до зашифрованих документів.
              </p>
            </div>
          </div>

          <button
            onClick={handleDownloadKey}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-claude-text text-white rounded-xl text-sm font-medium hover:bg-claude-text/90 transition-all"
          >
            <Download size={16} />
            Завантажити файл ключа
          </button>

          {keyDownloaded && (
            <button
              onClick={handleFinish}
              className="w-full px-4 py-2.5 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 transition-all"
            >
              Готово
            </button>
          )}

          <p className="text-xs text-claude-subtext/60 text-center">
            Збережіть файл у надійному місці. Він потрібен для відновлення доступу.
          </p>
        </div>
      ) : (
        /* Password entry step — wrapped in <form> so browser offers to save credentials */
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (isSetupMode) handleSetup(); else handleUnlock();
          }}
          autoComplete="on"
        >
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-4 bg-blue-50 border border-blue-200 rounded-xl">
              {isSetupMode ? (
                <KeyRound size={20} className="text-blue-600 flex-shrink-0" />
              ) : (
                <Lock size={20} className="text-blue-600 flex-shrink-0" />
              )}
              <p className="text-sm text-blue-800">
                {isSetupMode
                  ? 'Створіть пароль для захисту ваших документів. Рекомендуємо використати згенерований пароль та зберегти його у менеджері паролів браузера.'
                  : 'Введіть пароль шифрування для доступу до зашифрованих документів.'
                }
              </p>
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {error}
              </div>
            )}

            {/* Hidden username field for browser password manager */}
            <input
              type="hidden"
              name="username"
              autoComplete="username"
              value="encryption-vault"
            />

            <div>
              <label className="block text-sm font-medium text-claude-text mb-1.5">
                {isSetupMode ? 'Пароль шифрування' : 'Пароль'}
              </label>

              {isSetupMode && (
                <div className="flex gap-2 mb-2">
                  <button
                    type="button"
                    onClick={handleGeneratePassword}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
                  >
                    <RefreshCw size={12} />
                    Згенерувати надійний пароль
                  </button>
                  {password.length >= 8 && (
                    <button
                      type="button"
                      onClick={handleCopyPassword}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-claude-subtext bg-claude-bg border border-claude-border rounded-lg hover:bg-claude-hover transition-colors"
                    >
                      {copied ? <Check size={12} className="text-green-600" /> : <Copy size={12} />}
                      {copied ? 'Скопійовано' : 'Копіювати'}
                    </button>
                  )}
                </div>
              )}

              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  autoComplete={isSetupMode ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={isSetupMode ? 'Мінімум 8 символів' : 'Введіть пароль'}
                  className="w-full px-3 py-2.5 pr-10 border border-claude-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-claude-accent/30 focus:border-claude-accent font-mono"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-claude-subtext/50 hover:text-claude-subtext"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {isSetupMode && (
              <div>
                <label className="block text-sm font-medium text-claude-text mb-1.5">
                  Підтвердження пароля
                </label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="confirm-password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Повторіть пароль"
                  className="w-full px-3 py-2.5 border border-claude-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-claude-accent/30 focus:border-claude-accent font-mono"
                />
                {confirmPassword && password !== confirmPassword && (
                  <p className="text-xs text-red-500 mt-1">Паролі не збігаються</p>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={
                isLoading ||
                !password ||
                (isSetupMode && (password.length < 8 || password !== confirmPassword))
              }
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-claude-text text-white rounded-xl text-sm font-medium hover:bg-claude-text/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  {isSetupMode ? 'Генерація ключів...' : 'Розблокування...'}
                </>
              ) : isSetupMode ? (
                <>
                  <Shield size={16} />
                  Створити ключі шифрування
                </>
              ) : (
                <>
                  <Lock size={16} />
                  Розблокувати
                </>
              )}
            </button>

            {isSetupMode && (
              <p className="text-xs text-claude-subtext/60 text-center">
                Сервер ніколи не бачить ваш пароль або приватний ключ. Шифрування відбувається у вашому браузері.
              </p>
            )}
          </div>
        </form>
      )}
    </Modal>
  );
}
