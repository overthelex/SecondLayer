import React from 'react';
import { ChevronDown } from 'lucide-react';

interface SectionProps {
  id: string;
  title: string;
  collapsed: boolean;
  onToggle: (id: string) => void;
  children: React.ReactNode;
}

export function Section({ id, title, collapsed, onToggle, children }: SectionProps) {
  return (
    <div className="mb-6" data-tour={id}>
      <button
        onClick={() => onToggle(id)}
        className="w-full flex items-center justify-between px-3 py-2 group cursor-pointer"
      >
        <h3 className="text-[11px] font-semibold text-claude-subtext/70 uppercase tracking-[0.5px] font-sans">
          {title}
        </h3>
        <ChevronDown
          size={12}
          strokeWidth={2.5}
          className={`text-claude-subtext/40 group-hover:text-claude-subtext/70 transition-transform duration-200 ${collapsed ? '-rotate-90' : ''}`}
        />
      </button>
      {!collapsed && (
        <div className="space-y-0.5">{children}</div>
      )}
    </div>
  );
}
