/**
 * Question modal — "Написати питання".
 */

import { SupportContactForm } from './SupportContactForm';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function QuestionModal({ isOpen, onClose }: Props) {
  return (
    <SupportContactForm
      isOpen={isOpen}
      onClose={onClose}
      type="question"
      title="Написати питання"
      helpText="Поставте питання нашій команді — про функціонал, тарифи, інтеграції чи юридичні нюанси платформи. Відповімо на email вашого профілю."
      placeholder="Наприклад: чи можна підключити мою колегію до спільного робочого простору?"
      submitLabel="Надіслати питання"
    />
  );
}
