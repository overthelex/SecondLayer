/**
 * Feedback modal — "Написати зауваження".
 */

import { SupportContactForm } from './SupportContactForm';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function FeedbackModal({ isOpen, onClose }: Props) {
  return (
    <SupportContactForm
      isOpen={isOpen}
      onClose={onClose}
      type="feedback"
      title="Написати зауваження"
      helpText="Опишіть проблему або баг. Що сталося, на якій сторінці, що ви очікували побачити? Чим детальніше — тим швидше виправимо."
      placeholder="Наприклад: на сторінці «Адвокати» не відкривається фільтр за містом…"
      submitLabel="Надіслати зауваження"
    />
  );
}
