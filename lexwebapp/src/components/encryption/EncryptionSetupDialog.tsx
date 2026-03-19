/**
 * EncryptionSetupDialog
 * Modal for first-time E2EE setup: password entry, key generation, key file download.
 * Also handles unlock flow for returning users.
 */

import React, { useState } from 'react';
import { Modal } from '../ui/Modal/Modal';
import { Shield, Download, Eye, EyeOff, Loader2, KeyRound, Lock } from 'lucide-react';
import { useEncryptionStore, downloadKeyFile } from '../../stores/encryptionStore';
import type { EncryptedKeyBundle } from '../../services/crypto';

interface EncryptionSetupDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** 'setup' for first time, 'unlock' for returning users */
  mode: 'setup' | 'unlock';
}

export function EncryptionSetupDialog({ isOpen, onClose, mode }: EncryptionSetupDialogProps) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [keyBundle, setKeyBundle] = useState<EncryptedKeyBundle | null>(null);
  const [keyDownloaded, setKeyDownloaded] = useState(false);

  const { setup, unlock, isLoading, error } = useEncryptionStore();

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
        /* Password entry step */
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-4 bg-blue-50 border border-blue-200 rounded-xl">
            {isSetupMode ? (
              <KeyRound size={20} className="text-blue-600 flex-shrink-0" />
            ) : (
              <Lock size={20} className="text-blue-600 flex-shrink-0" />
            )}
            <p className="text-sm text-blue-800">
              {isSetupMode
                ? 'Створіть пароль для захисту ваших документів. Цей пароль використовується для шифрування ключів локально у вашому браузері.'
                : 'Введіть пароль шифрування для доступу до зашифрованих документів.'
              }
            </p>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-claude-text mb-1.5">
              {isSetupMode ? 'Пароль шифрування' : 'Пароль'}
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !isSetupMode) handleUnlock();
                }}
                placeholder={isSetupMode ? 'Мінімум 8 символів' : 'Введіть пароль'}
                className="w-full px-3 py-2.5 pr-10 border border-claude-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-claude-accent/30 focus:border-claude-accent"
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
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSetup();
                }}
                placeholder="Повторіть пароль"
                className="w-full px-3 py-2.5 border border-claude-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-claude-accent/30 focus:border-claude-accent"
              />
              {confirmPassword && password !== confirmPassword && (
                <p className="text-xs text-red-500 mt-1">Паролі не збігаються</p>
              )}
            </div>
          )}

          <button
            onClick={isSetupMode ? handleSetup : handleUnlock}
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
      )}
    </Modal>
  );
}
