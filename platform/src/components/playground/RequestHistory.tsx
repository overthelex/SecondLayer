import { useState, useCallback } from 'react';
import { ChevronDown, ChevronUp, Trash2, RotateCcw } from 'lucide-react';
import type { HistoryEntry } from '@/hooks/useRequestHistory';

interface Props {
  entries: HistoryEntry[];
  onReplay: (toolName: string, params: string) => void;
  onClear: () => void;
}

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function RequestHistory({ entries, onReplay, onClear }: Props) {
  const [expanded, setExpanded] = useState(false);
  const toggle = useCallback(() => setExpanded(e => !e), []);

  if (entries.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-border overflow-hidden">
      <button
        onClick={toggle}
        className="w-full px-4 py-2.5 flex items-center justify-between bg-surface-secondary border-b border-border-light hover:bg-surface-secondary/80 transition-colors"
      >
        <span className="text-sm font-semibold text-txt-primary">History ({entries.length})</span>
        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {expanded && (
        <div className="max-h-60 overflow-y-auto">
          {entries.map(e => (
            <button
              key={e.id}
              onClick={() => onReplay(e.toolName, e.params)}
              className="w-full text-left px-4 py-2 border-b border-border-light last:border-0 hover:bg-surface-secondary transition-colors flex items-center gap-3"
            >
              <span className={`w-2 h-2 rounded-full shrink-0 ${
                e.statusCode >= 200 && e.statusCode < 300 ? 'bg-green-500' : 'bg-red-500'
              }`} />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-mono font-medium text-txt-primary truncate">{e.toolName}</div>
                <div className="text-[10px] text-txt-muted">{e.duration}ms</div>
              </div>
              <span className="text-[10px] text-txt-muted shrink-0">{timeAgo(e.timestamp)}</span>
              <RotateCcw size={11} className="text-txt-muted shrink-0" />
            </button>
          ))}

          <div className="px-4 py-2 border-t border-border-light">
            <button
              onClick={(e) => { e.stopPropagation(); onClear(); }}
              className="flex items-center gap-1.5 text-[10px] text-red-500 hover:text-red-700 font-medium"
            >
              <Trash2 size={10} /> Clear History
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
