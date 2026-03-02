import React from 'react';

interface AdminPageLayoutProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  kpiCards?: React.ReactNode;
  filters?: React.ReactNode;
  children: React.ReactNode;
}

export function AdminPageLayout({
  title,
  subtitle,
  actions,
  kpiCards,
  filters,
  children,
}: AdminPageLayoutProps) {
  return (
    <div className="flex-1 h-full overflow-y-auto bg-gray-50">
      <div className="max-w-7xl mx-auto p-6 md:p-8 lg:p-12 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-claude-text tracking-tight">
              {title}
            </h1>
            {subtitle && (
              <p className="text-sm text-claude-subtext mt-1">{subtitle}</p>
            )}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>

        {/* KPI Cards */}
        {kpiCards && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">{kpiCards}</div>
        )}

        {/* Filters */}
        {filters}

        {/* Main Content */}
        {children}
      </div>
    </div>
  );
}
