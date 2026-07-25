/**
 * ConsultationE2eeStatus
 * Shows E2EE lock icon and Safety Number for consultation verification.
 */

import { useState, useEffect } from 'react';
import { Lock, Shield, Copy, Check } from 'lucide-react';
import { generateSafetyNumber } from '../../services/crypto/CallVerification';
import { useEncryptionStore } from '../../stores/encryptionStore';
import { encryptionService } from '../../services/api/EncryptionService';

interface ConsultationE2eeStatusProps {
  isEstablished: boolean;
  peerId?: string;
}

export function ConsultationE2eeStatus({ isEstablished, peerId }: ConsultationE2eeStatusProps) {
  const [showSafetyNumber, setShowSafetyNumber] = useState(false);
  const [safetyNumber, setSafetyNumber] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const { publicKey } = useEncryptionStore();

  useEffect(() => {
    if (!showSafetyNumber || !publicKey || !peerId) return;

    let cancelled = false;

    (async () => {
      try {
        const peerKey = await encryptionService.getPublicKey(peerId);
        const number = await generateSafetyNumber(publicKey, peerKey.public_key);
        if (!cancelled) setSafetyNumber(number);
      } catch {
        if (!cancelled) setSafetyNumber(null);
      }
    })();

    return () => { cancelled = true; };
  }, [showSafetyNumber, publicKey, peerId]);

  if (!isEstablished) return null;

  const handleCopy = async () => {
    if (safetyNumber) {
      await navigator.clipboard.writeText(safetyNumber);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setShowSafetyNumber(!showSafetyNumber)}
        className="flex items-center gap-1 text-[10px] text-green-600 hover:text-green-700 transition-colors"
        title="Перевірити шифрування"
      >
        <Lock size={10} />
        <span>E2EE</span>
      </button>

      {showSafetyNumber && (
        <div className="absolute top-6 right-0 z-50 w-64 bg-white border border-claude-border rounded-lg shadow-lg p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <Shield size={14} className="text-green-600" />
            <span className="text-xs font-medium text-claude-text">Код безпеки</span>
          </div>
          <p className="text-[10px] text-claude-subtext mb-2">
            Порівняйте цей код зі співрозмовником для підтвердження шифрування
          </p>
          {safetyNumber ? (
            <div className="bg-gray-50 rounded p-2 font-mono text-xs text-center tracking-wider leading-relaxed">
              {safetyNumber}
            </div>
          ) : (
            <div className="text-[10px] text-claude-subtext text-center py-2">
              Завантаження...
            </div>
          )}
          <button
            onClick={handleCopy}
            className="mt-2 flex items-center gap-1 text-[10px] text-claude-accent hover:underline mx-auto"
          >
            {copied ? <Check size={10} /> : <Copy size={10} />}
            {copied ? 'Скопійовано' : 'Копіювати'}
          </button>
        </div>
      )}
    </div>
  );
}
