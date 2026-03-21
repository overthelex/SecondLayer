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
    <div className="border-b border-claude-border">
      <div className="flex overflow-x-auto scrollbar-hide">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`flex-1 min-w-0 px-2 py-2.5 text-[10px] font-semibold uppercase tracking-[0.7px] transition-colors duration-150 border-b-2 ${
              activeTab === tab.id
                ? 'border-zinc-900 text-zinc-900'
                : 'border-transparent text-zinc-400 hover:text-zinc-600'
            }`}
          >
            <div className="flex items-center justify-center gap-1.5">
              <tab.icon size={11} strokeWidth={2} />
              <span className="truncate">{tab.label}</span>
              {tab.count > 0 && (
                <span className={`text-[9px] min-w-[15px] h-[15px] flex items-center justify-center rounded-full px-1 font-semibold ${
                  activeTab === tab.id ? 'bg-zinc-900 text-white' : 'bg-zinc-200 text-zinc-500'
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
