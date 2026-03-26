/**
 * ToolSelector — Internet ON/OFF toggle for chat mode.
 * When OFF: search only among user documents and legal.org.ua databases.
 * When ON: allows broader internet search.
 */

import { Globe } from 'lucide-react';
import { useSettingsStore } from '../../stores';

export function ToolSelector() {
  const internetEnabled = useSettingsStore(s => s.internetEnabled);
  const setInternetEnabled = useSettingsStore(s => s.setInternetEnabled);

  return (
    <div className="mb-2.5 pb-0.5">
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => setInternetEnabled(!internetEnabled)}
          className={`flex-shrink-0 px-3 py-1 rounded-full text-[12px] font-medium transition-colors duration-150 border flex items-center gap-1.5 ${
            internetEnabled
              ? 'bg-zinc-900 text-white border-zinc-900'
              : 'bg-white text-zinc-500 border-zinc-200 hover:border-zinc-300 hover:text-zinc-700'
          }`}
        >
          <Globe size={11} />
          Internet {internetEnabled ? 'ON' : 'OFF'}
        </button>
      </div>
    </div>
  );
}
