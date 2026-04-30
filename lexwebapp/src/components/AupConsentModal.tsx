/**
 * AupConsentModal — modal dialog asking the user to accept the AUP
 * before uploading files in chat. Shown once per session.
 */

import { useState } from 'react';
import { Modal } from './ui/Modal';
import { ShieldCheck } from 'lucide-react';

interface AupConsentModalProps {
  isOpen: boolean;
  onAccept: () => void;
  onCancel: () => void;
}

export function AupConsentModal({ isOpen, onAccept, onCancel }: AupConsentModalProps) {
  const [checked, setChecked] = useState(false);

  return (
    <Modal isOpen={isOpen} onClose={onCancel} title="Завантаження файлів" size="md">
      <div className="space-y-4">
        <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
          <ShieldCheck size={20} className="text-amber-600 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-amber-800 leading-relaxed">
            Перед завантаженням файлів необхідно підтвердити дотримання правил платформи.
          </p>
        </div>

        <label className="flex items-start gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            className="mt-1 w-4 h-4 rounded border-gray-300 text-claude-accent focus:ring-claude-accent cursor-pointer"
          />
          <span className="text-sm text-gray-700 leading-relaxed">
            Я підтверджую, що маю правомірні підстави завантажувати ці документи та що вони
            не містять інформації з обмеженим доступом, державної таємниці, матеріалів
            досудового розслідування, персональних даних третіх осіб без їхньої згоди або
            іншого забороненого контенту згідно з{' '}
            <a
              href="/aup"
              target="_blank"
              rel="noopener noreferrer"
              className="text-claude-accent hover:underline font-medium"
            >
              Політикою допустимого використання
            </a>
          </span>
        </label>

        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-xl transition-colors"
          >
            Скасувати
          </button>
          <button
            onClick={onAccept}
            disabled={!checked}
            className={`px-4 py-2 text-sm font-medium rounded-xl transition-all ${
              checked
                ? 'bg-claude-text text-white hover:bg-claude-text/90 active:scale-[0.98]'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }`}
          >
            Підтвердити
          </button>
        </div>
      </div>
    </Modal>
  );
}
