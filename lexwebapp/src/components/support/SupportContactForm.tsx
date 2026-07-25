/**
 * Shared contact form used by FeedbackModal and QuestionModal.
 * Posts to /api/support/contact and shows a success state on submit.
 */

import { useEffect, useState } from 'react';
import { Modal } from '../ui/Modal';
import { supportService, type SupportContactType } from '../../services/api/SupportService';
import { showToast } from '../../utils/toast';
import { getErrorMessage } from '../../utils/errors';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  type: SupportContactType;
  title: string;
  placeholder: string;
  helpText: string;
  submitLabel: string;
}

const MAX_LEN = 5000;

export function SupportContactForm({
  isOpen,
  onClose,
  type,
  title,
  placeholder,
  helpText,
  submitLabel,
}: Props) {
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Reset state whenever the modal opens fresh
  useEffect(() => {
    if (isOpen) {
      setMessage('');
      setSubmitted(false);
      setSubmitting(false);
    }
  }, [isOpen]);

  const handleSubmit = async () => {
    const trimmed = message.trim();
    if (trimmed.length < 3) {
      showToast.error('Будь ласка, опишіть детальніше');
      return;
    }
    if (trimmed.length > MAX_LEN) {
      showToast.error(`Повідомлення задовге (макс. ${MAX_LEN} символів)`);
      return;
    }

    setSubmitting(true);
    try {
      await supportService.sendContact(type, trimmed);
      setSubmitted(true);
      showToast.success('Повідомлення надіслано — дякуємо!');
    } catch (err) {
      showToast.error(getErrorMessage(err) || 'Не вдалося надіслати повідомлення');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="md">
      {submitted ? (
        <div className="py-4 text-center">
          <p className="text-base font-medium text-zinc-900">Дякуємо!</p>
          <p className="mt-1 text-sm text-zinc-600">
            Ми отримали ваше повідомлення і відповімо на email, вказаний у профілі.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="mt-5 px-5 py-2 rounded-lg bg-claude-text text-white text-sm font-medium hover:opacity-90"
          >
            Закрити
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-zinc-600">{helpText}</p>
          <textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder={placeholder}
            rows={6}
            maxLength={MAX_LEN}
            disabled={submitting}
            className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-claude-text/20 focus:border-claude-text/40 resize-none disabled:bg-zinc-50"
            autoFocus
          />
          <div className="flex items-center justify-between text-xs text-zinc-500">
            <span>{message.length} / {MAX_LEN}</span>
          </div>
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="flex-1 py-2.5 border border-zinc-300 rounded-lg text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
            >
              Скасувати
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || message.trim().length < 3}
              className="flex-1 py-2.5 bg-claude-text text-white rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {submitting ? 'Надсилаємо…' : submitLabel}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
