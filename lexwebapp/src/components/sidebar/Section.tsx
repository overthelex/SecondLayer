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
    <div className="mb-5" data-tour={id}>
      <button
        onClick={() => onToggle(id)}
        className="w-full flex items-center justify-between px-2 py-1 group cursor-pointer rounded transition-colors duration-150"
      >
        <h3 className="text-[9.5px] font-semibold text-zinc-600 uppercase tracking-[1.1px] font-sans select-none">
          {title}
        </h3>
        <ChevronDown
          size={10}
          strokeWidth={2.5}
          className={`text-zinc-700 group-hover:text-zinc-500 transition-all duration-200 ${collapsed ? '-rotate-90' : ''}`}
        />
      </button>
      {!collapsed && (
        <div className="space-y-0.5 mt-1">{children}</div>
      )}
    </div>
  );
}
