/**
 * Error state with retry button used across billing tabs.
 * Renders a centered AlertCircle icon, message, and retry button.
 */

import { AlertCircle } from 'lucide-react';

interface BillingErrorStateProps {
  /** Error message to display */
  message?: string;
  /** Callback for the retry button */
  onRetry: () => void;
  /** Container height class. Defaults to "h-64". */
  height?: string;
}

export function BillingErrorState({
  message = 'Дані недоступні',
  onRetry,
  height = 'h-64',
}: BillingErrorStateProps) {
  return (
    <div className={`flex items-center justify-center ${height}`}>
      <div className="text-center">
        <AlertCircle size={48} className="text-claude-subtext mx-auto mb-4" />
        <p className="text-claude-text mb-2">{message}</p>
        <button
          onClick={onRetry}
          className="mt-4 px-4 py-2 bg-claude-accent text-white rounded-lg hover:bg-opacity-90">
          Повторити
        </button>
      </div>
    </div>
  );
}
