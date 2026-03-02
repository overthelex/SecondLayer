import React from 'react';
import { ResponsiveContainer } from 'recharts';

interface ChartContainerProps {
  title: string;
  height?: number;
  actions?: React.ReactNode;
  children: React.ReactNode;
}

export function ChartContainer({
  title,
  height = 300,
  actions,
  children,
}: ChartContainerProps) {
  return (
    <div className="bg-white rounded-xl border border-claude-border p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-claude-text">{title}</h3>
        {actions}
      </div>
      <ResponsiveContainer width="100%" height={height}>
        {children as React.ReactElement}
      </ResponsiveContainer>
    </div>
  );
}
