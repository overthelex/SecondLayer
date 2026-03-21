/**
 * ToolSelector — AI Chat / Manual tool mode picker with category navigation.
 */

import { useState } from 'react';
import { Sparkles, ChevronDown } from 'lucide-react';
import { TOOL_CATEGORIES, AI_CHAT_MODE } from '../../hooks/chat/tool-categories';

interface ToolSelectorProps {
  selectedTool: string;
  onToolChange: (tool: string) => void;
}

export function ToolSelector({ selectedTool, onToolChange }: ToolSelectorProps) {
  const [showManualTools, setShowManualTools] = useState(false);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  const isAIChat = selectedTool === AI_CHAT_MODE;

  const activeCategory = TOOL_CATEGORIES.find(cat =>
    cat.tools.some(t => t.name === selectedTool)
  );

  return (
    <div className="mb-2.5 pb-0.5">
      <div className="flex flex-wrap gap-1.5">
        {/* AI Chat pill (default) */}
        <button
          onClick={() => {
            onToolChange(AI_CHAT_MODE);
            setShowManualTools(false);
            setExpandedCategory(null);
          }}
          className={`flex-shrink-0 px-3 py-1 rounded-full text-[12px] font-medium transition-colors duration-150 border flex items-center gap-1.5 ${
            isAIChat
              ? 'bg-zinc-900 text-white border-zinc-900'
              : 'bg-white text-zinc-500 border-zinc-200 hover:border-zinc-300 hover:text-zinc-700'
          }`}
        >
          <Sparkles size={11} />
          AI Чат
        </button>

        {/* Manual tools toggle */}
        <button
          onClick={() => {
            setShowManualTools(!showManualTools);
            if (showManualTools) setExpandedCategory(null);
          }}
          className={`flex-shrink-0 px-3 py-1 rounded-full text-[12px] font-medium transition-colors duration-150 border flex items-center gap-1 ${
            !isAIChat
              ? 'bg-zinc-100 text-zinc-700 border-zinc-200'
              : 'bg-white text-zinc-500 border-zinc-200 hover:border-zinc-300 hover:text-zinc-700'
          }`}
        >
          Інструменти
          <ChevronDown size={11} className={`transition-transform duration-150 ${showManualTools ? 'rotate-180' : ''}`} />
        </button>

        {/* Active tool indicator (when tools panel is collapsed) */}
        {!isAIChat && !showManualTools && activeCategory && (
          <span className="flex-shrink-0 px-3 py-1 rounded-full text-[12px] font-medium bg-zinc-900 text-white border border-zinc-900">
            {activeCategory.tools.find(t => t.name === selectedTool)?.label}
          </span>
        )}
      </div>

      {/* Category pills */}
      {showManualTools && (
        <div className="mt-2 space-y-1.5">
          <div className="flex flex-wrap gap-1">
            {TOOL_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setExpandedCategory(expandedCategory === cat.id ? null : cat.id)}
                className={`flex-shrink-0 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors duration-150 border flex items-center gap-1 ${
                  expandedCategory === cat.id || activeCategory?.id === cat.id
                    ? 'bg-zinc-100 text-zinc-800 border-zinc-300'
                    : 'bg-white text-zinc-500 border-zinc-200 hover:border-zinc-300 hover:text-zinc-700'
                }`}
              >
                {cat.label}
                <ChevronDown size={10} className={`transition-transform duration-150 ${expandedCategory === cat.id ? 'rotate-180' : ''}`} />
              </button>
            ))}
          </div>

          {/* Tools in selected category */}
          {expandedCategory && (
            <div className="flex flex-wrap gap-1 pl-0.5">
              {TOOL_CATEGORIES.find(c => c.id === expandedCategory)?.tools.map((tool) => (
                <button
                  key={tool.name}
                  onClick={() => onToolChange(tool.name)}
                  className={`flex-shrink-0 px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors duration-150 border ${
                    selectedTool === tool.name
                      ? 'bg-zinc-900 text-white border-zinc-900'
                      : 'bg-white text-zinc-500 border-zinc-200 hover:border-zinc-300 hover:text-zinc-700'
                  }`}
                >
                  {tool.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
