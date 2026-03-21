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
    <div className="border-b border-claude-border/50 bg-claude-bg/30">
      <div className="flex overflow-x-auto no-scrollbar">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`flex-1 min-w-0 px-2 py-2.5 text-[10px] font-medium uppercase tracking-wider transition-all duration-200 border-b-2 ${
              activeTab === tab.id
                ? 'border-claude-text text-claude-text'
                : 'border-transparent text-claude-subtext hover:text-claude-text'
            }`}
          >
            <div className="flex items-center justify-center gap-1">
              <tab.icon size={12} strokeWidth={2} />
              <span className="truncate">{tab.label}</span>
              {tab.count > 0 && (
                <span className={`text-[9px] min-w-[16px] h-4 flex items-center justify-center rounded-full px-1 font-semibold ${
                  activeTab === tab.id ? 'bg-claude-text text-white' : 'bg-claude-subtext/15 text-claude-subtext'
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
