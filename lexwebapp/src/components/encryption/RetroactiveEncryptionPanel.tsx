/**
 * RetroactiveEncryptionPanel
 * Panel for batch-encrypting existing unencrypted documents in the user's vault.
 * Shows stats, progress, and allows the user to start batch encryption.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Shield, Lock, Loader2, CheckCircle, AlertTriangle } from 'lucide-react';
import { encryptionService } from '../../services/api/EncryptionService';
import { useEncryptionStore } from '../../stores/encryptionStore';
import { encryptUploadedDocument } from '../../services/crypto/PostUploadEncryptor';
import { EncryptionSetupDialog } from './EncryptionSetupDialog';

interface VaultStats {
  total: number;
  encrypted: number;
  unencrypted: number;
}

export function RetroactiveEncryptionPanel() {
  const [stats, setStats] = useState<VaultStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [encrypting, setEncrypting] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, failed: 0 });
  const [showSetup, setShowSetup] = useState(false);
  const cancelRef = useRef(false);

  const { hasEncryption, isUnlocked, publicKey } = useEncryptionStore();

  const loadStats = useCallback(async () => {
    try {
      const s = await encryptionService.getVaultStats();
      setStats(s);
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const handleEncryptAll = async () => {
    if (!isUnlocked || !publicKey) {
      setShowSetup(true);
      return;
    }

    setEncrypting(true);
    cancelRef.current = false;

    let done = 0;
    let failed = 0;
    let offset = 0;
    const batchSize = 20;

    // First, get total count
    const totalUnencrypted = stats?.unencrypted || 0;
    setProgress({ done: 0, total: totalUnencrypted, failed: 0 });

    while (!cancelRef.current) {
      try {
        const { documents } = await encryptionService.getUnencryptedDocuments(batchSize, offset);
        if (documents.length === 0) break;

        for (const doc of documents) {
          if (cancelRef.current) break;

          const result = await encryptUploadedDocument(doc.id, publicKey);
          if (result.success) {
            done++;
          } else {
            failed++;
          }
          setProgress({ done, total: totalUnencrypted, failed });
        }

        // Don't increment offset — we're consuming from the front since encrypted docs drop off
      } catch {
        failed++;
        setProgress(p => ({ ...p, failed }));
        break;
      }
    }

    setEncrypting(false);
    loadStats(); // Refresh stats
  };

  const handleCancel = () => {
    cancelRef.current = true;
  };

  if (loading) {
    return (
      <div className="bg-white border rounded-xl p-5">
        <div className="flex items-center gap-2 text-sm text-claude-subtext">
          <Loader2 size={14} className="animate-spin" />
          Завантаження статистики...
        </div>
      </div>
    );
  }

  if (!stats || stats.total === 0) return null;

  const encryptionPercent = stats.total > 0 ? Math.round((stats.encrypted / stats.total) * 100) : 0;
  const allEncrypted = stats.unencrypted === 0;

  return (
    <>
      <EncryptionSetupDialog
        isOpen={showSetup}
        onClose={() => {
          setShowSetup(false);
          const state = useEncryptionStore.getState();
          if (state.isUnlocked && state.publicKey) {
            handleEncryptAll();
          }
        }}
        mode={hasEncryption ? 'unlock' : 'setup'}
      />

      <div className="bg-white border rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Shield size={18} className="text-claude-text" />
          <h3 className="text-sm font-semibold text-claude-text">Шифрування сейфу</h3>
        </div>

        {/* Stats bar */}
        <div>
          <div className="flex justify-between text-xs text-claude-subtext mb-1.5">
            <span>{stats.encrypted} з {stats.total} зашифровано</span>
            <span>{encryptionPercent}%</span>
          </div>
          <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                allEncrypted ? 'bg-green-500' : 'bg-claude-accent'
              }`}
              style={{ width: `${encryptionPercent}%` }}
            />
          </div>
        </div>

        {allEncrypted ? (
          <div className="flex items-center gap-2 text-sm text-green-700">
            <CheckCircle size={16} />
            Всі документи зашифровані
          </div>
        ) : encrypting ? (
          /* Encryption in progress */
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-claude-text">
              <Loader2 size={14} className="animate-spin" />
              Шифрування: {progress.done} / {progress.total}
              {progress.failed > 0 && (
                <span className="text-red-500 text-xs">({progress.failed} помилок)</span>
              )}
            </div>
            <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-claude-accent rounded-full transition-all"
                style={{ width: `${progress.total > 0 ? (progress.done / progress.total) * 100 : 0}%` }}
              />
            </div>
            <button
              onClick={handleCancel}
              className="text-xs text-red-500 hover:text-red-700"
            >
              Зупинити
            </button>
          </div>
        ) : (
          /* Start encryption */
          <div className="space-y-3">
            <p className="text-xs text-claude-subtext">
              {stats.unencrypted} документів без шифрування. Зашифруйте їх для максимального захисту.
              Embeddings та метадані залишаться для пошуку.
            </p>

            {!hasEncryption && (
              <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
                <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                Спочатку потрібно налаштувати шифрування (створити пароль та ключі).
              </div>
            )}

            <button
              onClick={handleEncryptAll}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-claude-text text-white rounded-xl text-sm font-medium hover:bg-claude-text/90 transition-all"
            >
              <Lock size={14} />
              Зашифрувати мій сейф
            </button>
          </div>
        )}
      </div>
    </>
  );
}
