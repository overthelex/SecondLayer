/**
 * BetaRestrictedModal
 *
 * Shown when the current user is not allowed to use chat / document upload
 * because they are not a beta tester and have not topped up their balance
 * via Monobank. The modal is opened by `useAccessGateStore` (proactively on
 * app load and reactively when chat/upload returns 403 BETA_RESTRICTED).
 */

import React from 'react';
import { Modal } from '../ui/Modal/Modal';
import { Button } from '../ui/Button';
import { useAccessGateStore } from '../../stores/accessGateStore';

export const BetaRestrictedModal: React.FC = () => {
  const { modalOpen, closeModal, isBetaTester, isAdministrator } = useAccessGateStore();

  // Defensive: never show the modal to users who are explicitly allowed.
  if (isBetaTester || isAdministrator) return null;

  const goToBilling = () => {
    closeModal();
    window.location.href = '/billing';
  };

  return (
    <Modal
      isOpen={modalOpen}
      onClose={closeModal}
      title="Доступ обмежено"
      size="md"
      closeOnBackdrop={false}
      showCloseButton={true}
    >
      <div className="space-y-4 text-sm text-gray-700 leading-relaxed">
        <p>
          Ця версія застосунку наразі доступна <strong>лише учасникам бета-тестування</strong>.
        </p>
        <p>
          Зовнішні користувачі можуть отримати доступ до чату та завантаження документів
          після <strong>поповнення балансу через Monobank</strong>. Без поповнення баланс
          не активовано, тому запити до чату та завантаження файлів заблоковано.
        </p>
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900">
          <p className="font-medium mb-1">Що робити:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Поповніть баланс через Monobank — доступ відкриється автоматично після зарахування платежу.</li>
            <li>Або зверніться до команди, щоб вас додали до групи бета-тестування.</li>
          </ul>
        </div>
        <p className="text-xs text-gray-500">
          Контакт для бета-тестерів: <a className="underline" href="mailto:beta@legal.org.ua">beta@legal.org.ua</a>
        </p>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={closeModal}>
            Закрити
          </Button>
          <Button variant="primary" onClick={goToBilling}>
            Поповнити баланс
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default BetaRestrictedModal;
