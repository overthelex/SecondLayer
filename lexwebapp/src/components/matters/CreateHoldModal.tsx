/**
 * Create Hold Modal
 */

import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { useCreateHold } from '../../hooks/queries/useMatters';
import { useMattersT } from '../../i18n/matters-i18n';
import type { HoldType } from '../../types/models/Matter';

interface CreateHoldModalProps {
  isOpen: boolean;
  onClose: () => void;
  matterId: string;
}

const HOLD_TYPE_KEYS: { value: HoldType; key: string }[] = [
  { value: 'litigation', key: 'holdTypeLitigation' },
  { value: 'regulatory', key: 'holdTypeRegulatory' },
  { value: 'investigation', key: 'holdTypeInvestigation' },
  { value: 'preservation', key: 'holdTypePreservation' },
];

export function CreateHoldModal({ isOpen, onClose, matterId }: CreateHoldModalProps) {
  const createHold = useCreateHold();
  const t = useMattersT();

  const [name, setName] = useState('');
  const [type, setType] = useState<HoldType>('litigation');
  const [scope, setScope] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    try {
      await createHold.mutateAsync({
        matterId,
        data: {
          holdName: name.trim(),
          holdType: type,
          scopeDescription: scope.trim() || undefined,
        },
      });
      handleClose();
    } catch {
      // Error handled by mutation
    }
  };

  const handleClose = () => {
    setName('');
    setType('litigation');
    setScope('');
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={t('newHold')} size="md">
      <form onSubmit={handleSubmit} className="space-y-4 p-1">
        <div>
          <label className="block text-sm font-medium text-claude-text font-sans mb-1">
            {t('holdNameLabel')} <span className="text-red-500">*</span>
          </label>
          <input
            id="hold-name"
            name="holdName"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('holdNamePlaceholder')}
            className="w-full px-3 py-2.5 bg-white border border-claude-border rounded-xl text-claude-text placeholder-claude-subtext/50 focus:outline-none focus:ring-2 focus:ring-claude-accent/20 focus:border-claude-accent transition-all font-sans text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-claude-text font-sans mb-1">{t('holdTypeLabel')}</label>
          <div className="grid grid-cols-2 gap-2">
            {HOLD_TYPE_KEYS.map((ht) => (
              <button
                key={ht.value}
                type="button"
                onClick={() => setType(ht.value)}
                className={`px-3 py-2 rounded-xl text-xs font-sans font-medium transition-all ${
                  type === ht.value
                    ? 'bg-claude-accent text-white shadow-sm'
                    : 'bg-white text-claude-text border border-claude-border hover:bg-claude-bg'
                }`}
              >
                {t(ht.key)}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-claude-text font-sans mb-1">
            {t('scopeLabel')}
          </label>
          <textarea
            id="hold-scope"
            name="scopeDescription"
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            placeholder={t('scopePlaceholder')}
            rows={3}
            className="w-full px-3 py-2.5 bg-white border border-claude-border rounded-xl text-claude-text placeholder-claude-subtext/50 focus:outline-none focus:ring-2 focus:ring-claude-accent/20 focus:border-claude-accent transition-all resize-none font-sans text-sm"
          />
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={handleClose}
            className="flex-1 px-4 py-2.5 bg-white border border-claude-border text-claude-text rounded-xl font-medium text-sm font-sans hover:bg-claude-bg transition-colors"
          >
            {t('cancelButton')}
          </button>
          <button
            type="submit"
            disabled={createHold.isPending || !name.trim()}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-claude-accent text-white rounded-xl font-medium text-sm font-sans hover:bg-[#C66345] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {createHold.isPending && <Loader2 size={16} className="animate-spin" />}
            {t('createButton')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
