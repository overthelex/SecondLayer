/**
 * Consultation booking modal — "Записатись на консультацію".
 * Embeds the public Calendary booking page for legal-org-ua / 30-min.
 */

import { ExternalLink } from 'lucide-react';
import { Modal } from '../ui/Modal';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const CALENDARY_URL = 'https://calendary.biz/b/legal-org-ua/30-min';

export function ConsultationBookingModal({ isOpen, onClose }: Props) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Записатись на консультацію" size="xl">
      <div className="space-y-3">
        <p className="text-sm text-zinc-600">
          Оберіть зручний час для 30-хвилинної демо-консультації. Деталі зустрічі прийдуть на ваш email.
        </p>

        <div className="rounded-lg overflow-hidden border border-zinc-200 bg-zinc-50">
          <iframe
            src={CALENDARY_URL}
            title="Запис на консультацію через Calendary"
            className="w-full h-[640px] border-0 bg-white"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>

        <div className="flex items-center justify-between text-xs text-zinc-500">
          <span>Якщо віджет не завантажується — відкрийте сторінку в новій вкладці:</span>
          <a
            href={CALENDARY_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-claude-text hover:underline font-medium"
          >
            calendary.biz
            <ExternalLink size={12} />
          </a>
        </div>
      </div>
    </Modal>
  );
}
