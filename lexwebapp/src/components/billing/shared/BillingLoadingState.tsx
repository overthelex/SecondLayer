/**
 * Loading spinner state used across billing tabs.
 * Renders a centered spinning RefreshCw icon with optional loading text.
 */

import { RefreshCw } from 'lucide-react';

interface BillingLoadingStateProps {
  /** Container height class, e.g. "h-64" or "h-96". Defaults to "h-64". */
  height?: string;
  /** Optional text below the spinner */
  text?: string;
}

export function BillingLoadingState({ height = 'h-64', text }: BillingLoadingStateProps) {
  return (
    <div className={`flex items-center justify-center ${height}`}>
      <div className="text-center">
        <RefreshCw size={32} className="text-claude-accent animate-spin mx-auto mb-3" />
        {text && <p className="text-sm text-claude-subtext">{text}</p>}
      </div>
    </div>
  );
}
