import type { LucideIcon } from 'lucide-react';

export type TabId = 'decisions' | 'regulations' | 'documents';

export interface TabDef {
  id: TabId;
  label: string;
  icon: LucideIcon;
  count: number;
}

interface TabsHeaderProps {
  tabs: TabDef[];
  activeTab: TabId;
  onTabChange: (id: TabId) => void;
}

export function TabsHeader({ tabs, activeTab, onTabChange }: TabsHeaderProps) {
  return (
    <div className="border-b border-zinc-200/60 flex-shrink-0">
      <div className="flex overflow-x-auto scrollbar-hide px-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`flex-1 min-w-0 px-2 py-3 text-[10px] font-semibold uppercase tracking-[0.08em] transition-all duration-150 border-b-[1.5px] -mb-px ${
              activeTab === tab.id
                ? 'border-zinc-900 text-zinc-900'
                : 'border-transparent text-zinc-400 hover:text-zinc-600 hover:border-zinc-300'
            }`}
          >
            <div className="flex items-center justify-center gap-1.5">
              <tab.icon size={10} strokeWidth={2.5} />
              <span className="truncate">{tab.label}</span>
              {tab.count > 0 && (
                <span className={`text-[9px] min-w-[16px] h-4 flex items-center justify-center rounded-sm px-1 font-semibold tabular-nums ${
                  activeTab === tab.id
                    ? 'bg-zinc-900 text-white'
                    : 'bg-zinc-200/80 text-zinc-500'
                }`}>
                  {tab.count}
                </span>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
