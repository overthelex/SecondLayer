import React, { createContext, useContext, useState, useCallback, useId } from 'react';
import { motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';

interface TabsContextValue {
  activeTab: string;
  setActiveTab: (value: string) => void;
  layoutId: string;
}

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabsContext() {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error('Tabs components must be used within <Tabs>');
  return ctx;
}

// ─── Tabs Root ───────────────────────────────────────────

interface TabsProps {
  defaultTab: string;
  value?: string;
  onChange?: (value: string) => void;
  children: React.ReactNode;
}

export function Tabs({ defaultTab, value, onChange, children }: TabsProps) {
  const [internalTab, setInternalTab] = useState(defaultTab);
  const layoutId = useId();

  const activeTab = value ?? internalTab;
  const setActiveTab = useCallback(
    (tab: string) => {
      if (onChange) onChange(tab);
      else setInternalTab(tab);
    },
    [onChange]
  );

  return (
    <TabsContext.Provider value={{ activeTab, setActiveTab, layoutId }}>
      {children}
    </TabsContext.Provider>
  );
}

// ─── TabList ─────────────────────────────────────────────

interface TabListProps {
  children: React.ReactNode;
  className?: string;
}

export function TabList({ children, className }: TabListProps) {
  return (
    <div
      className={
        className ??
        'flex overflow-x-auto pb-2 md:pb-0 gap-1 border-b border-gray-200 scrollbar-hide'
      }
    >
      {children}
    </div>
  );
}

// ─── Tab ─────────────────────────────────────────────────

interface TabProps {
  value: string;
  icon?: LucideIcon;
  badge?: React.ReactNode;
  children: React.ReactNode;
}

export function Tab({ value, icon: Icon, badge, children }: TabProps) {
  const { activeTab, setActiveTab, layoutId } = useTabsContext();
  const isActive = activeTab === value;

  return (
    <motion.button
      onClick={() => setActiveTab(value)}
      className={`flex items-center gap-2 px-4 py-3 font-medium text-sm whitespace-nowrap transition-all duration-200 relative ${
        isActive ? 'text-blue-600' : 'text-gray-600 hover:text-gray-900'
      }`}
      whileHover={{ y: -2 }}
      whileTap={{ y: 0 }}
    >
      {Icon && <Icon size={18} />}
      {children}
      {badge}
      {isActive && (
        <motion.div
          layoutId={layoutId}
          className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600"
          initial={false}
          transition={{ type: 'spring', stiffness: 380, damping: 30 }}
        />
      )}
    </motion.button>
  );
}

// ─── TabPanel ────────────────────────────────────────────

interface TabPanelProps {
  value: string;
  children: React.ReactNode;
  className?: string;
}

export function TabPanel({ value, children, className }: TabPanelProps) {
  const { activeTab } = useTabsContext();

  if (activeTab !== value) return null;

  return (
    <motion.div
      key={value}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.3 }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
