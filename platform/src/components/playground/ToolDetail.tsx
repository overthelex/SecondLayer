import { Sparkles } from 'lucide-react';
import type { Tool } from '@/utils/tools-data';
import { categoryColors } from '@/utils/tools-data';

interface Props {
  tool: Tool;
  onFillExample: () => void;
}

export function ToolDetail({ tool, onFillExample }: Props) {
  const color = categoryColors[tool.category] || 'bg-gray-50 text-gray-700';

  return (
    <div className="bg-white rounded-xl border border-border p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <h3 className="text-sm font-semibold text-txt-primary font-mono truncate">{tool.name}</h3>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${color}`}>{tool.category}</span>
          </div>
          <p className="text-xs text-txt-muted leading-relaxed">{tool.description}</p>
        </div>
        {tool.cost && (
          <span className="text-[10px] text-txt-muted whitespace-nowrap bg-surface-secondary px-2 py-1 rounded-md">
            {tool.cost}
          </span>
        )}
      </div>

      {tool.params && tool.params.length > 0 && (
        <div className="border-t border-border-light pt-3">
          <div className="text-[10px] font-semibold text-txt-muted uppercase tracking-wide mb-2">Parameters</div>
          <div className="space-y-1">
            {tool.params.map(p => (
              <div key={p.name} className="flex items-baseline gap-2 text-xs">
                <code className="text-brand-700 font-medium">{p.name}</code>
                <span className="text-txt-muted">({p.type})</span>
                {p.required && <span className="text-red-500 text-[10px]">required</span>}
                <span className="text-txt-muted flex-1 truncate">{p.description}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {tool.example?.request && (
        <button
          onClick={onFillExample}
          className="flex items-center gap-1.5 text-xs text-brand-600 hover:text-brand-700 font-medium"
        >
          <Sparkles size={12} />
          Fill Example
        </button>
      )}
    </div>
  );
}
