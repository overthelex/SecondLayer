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
    <div className="mb-3 pb-1">
      <div className="flex flex-wrap gap-2">
        {/* AI Chat pill (default) */}
        <button
          onClick={() => {
            onToolChange(AI_CHAT_MODE);
            setShowManualTools(false);
            setExpandedCategory(null);
          }}
          className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[12px] font-medium transition-all duration-200 border flex items-center gap-1.5 ${
            isAIChat
              ? 'bg-claude-text text-white border-claude-text shadow-sm'
              : 'bg-white text-claude-subtext border-claude-border hover:border-claude-subtext/40 hover:text-claude-text'
          }`}
        >
          <Sparkles size={12} />
          AI Чат
        </button>

        {/* Manual tools toggle */}
        <button
          onClick={() => {
            setShowManualTools(!showManualTools);
            if (showManualTools) setExpandedCategory(null);
          }}
          className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[12px] font-medium transition-all duration-200 border flex items-center gap-1 ${
            !isAIChat
              ? 'bg-claude-text/10 text-claude-text border-claude-text/30'
              : 'bg-white text-claude-subtext border-claude-border hover:border-claude-subtext/40 hover:text-claude-text'
          }`}
        >
          Інструменти
          <ChevronDown size={12} className={`transition-transform ${showManualTools ? 'rotate-180' : ''}`} />
        </button>

        {/* Active tool indicator (when tools panel is collapsed) */}
        {!isAIChat && !showManualTools && activeCategory && (
          <span className="flex-shrink-0 px-3 py-1.5 rounded-full text-[12px] font-medium bg-claude-text text-white border border-claude-text shadow-sm">
            {activeCategory.tools.find(t => t.name === selectedTool)?.label}
          </span>
        )}
      </div>

      {/* Category pills */}
      {showManualTools && (
        <div className="mt-2 space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {TOOL_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setExpandedCategory(expandedCategory === cat.id ? null : cat.id)}
                className={`flex-shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all duration-200 border flex items-center gap-1 ${
                  expandedCategory === cat.id || activeCategory?.id === cat.id
                    ? 'bg-claude-text/10 text-claude-text border-claude-text/30'
                    : 'bg-white text-claude-subtext border-claude-border hover:border-claude-subtext/40 hover:text-claude-text'
                }`}
              >
                {cat.label}
                <ChevronDown size={10} className={`transition-transform ${expandedCategory === cat.id ? 'rotate-180' : ''}`} />
              </button>
            ))}
          </div>

          {/* Tools in selected category */}
          {expandedCategory && (
            <div className="flex flex-wrap gap-1.5 pl-1">
              {TOOL_CATEGORIES.find(c => c.id === expandedCategory)?.tools.map((tool) => (
                <button
                  key={tool.name}
                  onClick={() => onToolChange(tool.name)}
                  className={`flex-shrink-0 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all duration-200 border ${
                    selectedTool === tool.name
                      ? 'bg-claude-text text-white border-claude-text shadow-sm'
                      : 'bg-white text-claude-subtext border-claude-border hover:border-claude-subtext/40 hover:text-claude-text'
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
