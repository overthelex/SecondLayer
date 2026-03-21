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
    <div className="mb-4" data-tour={id}>
      <button
        onClick={() => onToggle(id)}
        className="w-full flex items-center justify-between px-2 py-1.5 group cursor-pointer rounded-md hover:bg-zinc-200/30 transition-colors duration-150"
      >
        <h3 className="text-[10px] font-semibold text-zinc-400 uppercase tracking-[0.8px] font-sans">
          {title}
        </h3>
        <ChevronDown
          size={11}
          strokeWidth={2.5}
          className={`text-zinc-300 group-hover:text-zinc-500 transition-all duration-200 ${collapsed ? '-rotate-90' : ''}`}
        />
      </button>
      {!collapsed && (
        <div className="space-y-0.5 mt-0.5">{children}</div>
      )}
    </div>
  );
}
