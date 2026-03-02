/**
 * Admin Infrastructure Page
 * Dashboards for Backend Performance, Upload Pipeline, API Cost Trends, and Infrastructure
 */

import { useState } from 'react';
import { RefreshCw, Server, Upload, DollarSign, Cpu } from 'lucide-react';
import type { TimeRange } from './types';
import { useInfrastructureData } from './useInfrastructureData';
import { SectionHeader, LoadingPlaceholder, ErrorPlaceholder, RecommendationsSection } from './SharedComponents';
import { BackendDetailSection } from './BackendDetailSection';
import { UploadPipelineSection } from './UploadPipelineSection';
import { CostRealtimeSection } from './CostRealtimeSection';
import { InfrastructureSection } from './InfrastructureSection';

export function AdminInfrastructurePage() {
  const [range, setRange] = useState<TimeRange>('1h');

  // Section open/close state
  const [openSections, setOpenSections] = useState({
    backend: true,
    upload: true,
    cost: true,
    infra: true,
  });

  const toggleSection = (key: keyof typeof openSections) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const { backendDetail, uploadPipeline, costRealtime, infrastructure, handleRefresh } =
    useInfrastructureData(range);

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-[1600px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-claude-text">Інфраструктура</h1>
          <p className="text-sm text-claude-subtext mt-1">
            Детальний моніторинг бекенду, черг та ресурсів
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Time range selector */}
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            {(['1h', '6h', '24h'] as TimeRange[]).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`px-3 py-1.5 rounded-md text-sm transition-all ${
                  range === r
                    ? 'bg-white shadow-sm text-claude-text font-medium'
                    : 'text-claude-subtext hover:text-claude-text'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
          <button
            onClick={handleRefresh}
            className="p-2 rounded-lg text-claude-subtext hover:text-claude-text hover:bg-gray-100 transition-colors"
            title="Оновити"
          >
            <RefreshCw size={18} />
          </button>
        </div>
      </div>

      {/* Section 1: Backend Performance */}
      <div className="border-b border-claude-border">
        <SectionHeader title="Backend Performance" icon={Server} open={openSections.backend} onToggle={() => toggleSection('backend')} />
        {openSections.backend && (
          <div className="pb-6">
            {backendDetail.loading ? (
              <LoadingPlaceholder />
            ) : backendDetail.error ? (
              <ErrorPlaceholder message={backendDetail.error} />
            ) : (
              <BackendDetailSection data={backendDetail.data} />
            )}
          </div>
        )}
      </div>

      {/* Section 2: Upload Pipeline */}
      <div className="border-b border-claude-border">
        <SectionHeader title="Upload Pipeline" icon={Upload} open={openSections.upload} onToggle={() => toggleSection('upload')} />
        {openSections.upload && (
          <div className="pb-6">
            {uploadPipeline.loading ? (
              <LoadingPlaceholder />
            ) : uploadPipeline.error ? (
              <ErrorPlaceholder message={uploadPipeline.error} />
            ) : (
              <UploadPipelineSection data={uploadPipeline.data} />
            )}
          </div>
        )}
      </div>

      {/* Section 3: API Cost Trends */}
      <div className="border-b border-claude-border">
        <SectionHeader title="API Cost Trends" icon={DollarSign} open={openSections.cost} onToggle={() => toggleSection('cost')} />
        {openSections.cost && (
          <div className="pb-6">
            {costRealtime.loading ? (
              <LoadingPlaceholder />
            ) : costRealtime.error ? (
              <ErrorPlaceholder message={costRealtime.error} />
            ) : (
              <CostRealtimeSection data={costRealtime.data} />
            )}
          </div>
        )}
      </div>

      {/* Section 4: Infrastructure */}
      <div>
        <SectionHeader title="Infrastructure" icon={Cpu} open={openSections.infra} onToggle={() => toggleSection('infra')} />
        {openSections.infra && (
          <div className="pb-6">
            {infrastructure.loading ? (
              <LoadingPlaceholder />
            ) : infrastructure.error ? (
              <ErrorPlaceholder message={infrastructure.error} />
            ) : (
              <>
                <InfrastructureSection data={infrastructure.data} />
                <div className="mt-6">
                  <h3 className="text-sm font-medium text-claude-text mb-3">Рекомендації</h3>
                  <RecommendationsSection data={infrastructure.data} />
                </div>
              </>
            )}
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
