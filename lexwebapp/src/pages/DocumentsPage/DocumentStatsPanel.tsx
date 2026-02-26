import React from 'react';
import {
  FileText,
  CheckCircle,
  AlertTriangle,
  HelpCircle,
  DollarSign,
  HardDrive,
} from 'lucide-react';
import type { DocumentStats } from './types';

const DOC_TYPE_LABELS: Record<string, string> = {
  contract: 'Договори',
  legislation: 'Законодавство',
  court_decision: 'Судові рішення',
  internal: 'Внутрішні',
  other: 'Інше',
};

const DOC_TYPE_COLORS: Record<string, string> = {
  contract: 'bg-blue-100 text-blue-700',
  legislation: 'bg-purple-100 text-purple-700',
  court_decision: 'bg-amber-100 text-amber-700',
  internal: 'bg-green-100 text-green-700',
  other: 'bg-gray-100 text-gray-600',
};

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
}

interface DocumentStatsPanelProps {
  stats: DocumentStats | null;
  loading: boolean;
}

export function DocumentStatsPanel({ stats, loading }: DocumentStatsPanelProps) {
  if (loading || !stats || stats.total === 0) return null;

  const classifiedPercent = stats.total > 0
    ? Math.round((stats.classified / stats.total) * 100)
    : 0;

  return (
    <div className="mb-5 rounded-xl border border-claude-border bg-white p-4">
      {/* Top row: key metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-3">
        <StatCard
          icon={<FileText size={14} />}
          label="Всього"
          value={stats.total}
          color="text-claude-text"
        />
        <StatCard
          icon={<CheckCircle size={14} />}
          label="Класифіковано"
          value={stats.classified}
          color="text-green-600"
          subtext={`${classifiedPercent}%`}
        />
        <StatCard
          icon={<AlertTriangle size={14} />}
          label="Потр. уваги"
          value={stats.needsReview}
          color="text-amber-600"
        />
        <StatCard
          icon={<HelpCircle size={14} />}
          label="Не класифіковано"
          value={stats.unclassified}
          color="text-gray-500"
        />
        <StatCard
          icon={<DollarSign size={14} />}
          label="Витрати"
          value={`$${stats.totalClassificationCostUsd.toFixed(4)}`}
          color="text-blue-600"
        />
        <StatCard
          icon={<HardDrive size={14} />}
          label="Обсяг"
          value={formatBytes(stats.totalStorageBytes)}
          color="text-purple-600"
        />
      </div>

      {/* Type distribution */}
      {stats.total > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(stats.byType)
            .filter(([, count]) => count > 0)
            .sort(([, a], [, b]) => b - a)
            .map(([type, count]) => (
              <span
                key={type}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-sans font-medium ${
                  DOC_TYPE_COLORS[type] || DOC_TYPE_COLORS.other
                }`}
              >
                {DOC_TYPE_LABELS[type] || type}
                <span className="opacity-70">{count}</span>
              </span>
            ))}
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  color,
  subtext,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  color: string;
  subtext?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className={`${color} opacity-60`}>{icon}</div>
      <div>
        <div className={`text-sm font-semibold font-sans ${color}`}>
          {value}
          {subtext && (
            <span className="text-xs font-normal text-claude-subtext/50 ml-1">{subtext}</span>
          )}
        </div>
        <div className="text-[10px] text-claude-subtext/50 font-sans leading-tight">{label}</div>
      </div>
    </div>
  );
}
