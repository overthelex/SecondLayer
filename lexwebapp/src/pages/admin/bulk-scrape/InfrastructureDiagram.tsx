import React, { useMemo, useCallback, useEffect, useState } from 'react';
import {
  ReactFlow,
  Background,
  type Node,
  type Edge,
  type NodeProps,
  Position,
  Handle,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  Database, Globe, Code2, FileText, Layers, Cpu, HardDrive, Server,
} from 'lucide-react';
import { api } from '../../../utils/api-client';
import type { InfraHealthResponse, InfraHealthCheck } from './types';

/* ------------------------------------------------------------------ */
/*  Status dot                                                         */
/* ------------------------------------------------------------------ */
function StatusDot({ ok, error }: { ok: boolean; error?: string }) {
  return (
    <span
      title={ok ? 'OK' : error || 'Error'}
      className={`inline-block w-2 h-2 rounded-full ${ok ? 'bg-emerald-500' : 'bg-red-500'}`}
    />
  );
}

/* ------------------------------------------------------------------ */
/*  Custom pipeline node                                               */
/* ------------------------------------------------------------------ */
type PipelineNodeData = {
  label: string;
  icon: React.ElementType;
  status?: InfraHealthCheck;
  metric?: string;
};

function PipelineNode({ data }: NodeProps<Node<PipelineNodeData>>) {
  const Icon = data.icon;
  const hasStatus = data.status !== undefined;
  return (
    <>
      <Handle type="target" position={Position.Left} className="!bg-transparent !border-0 !w-0 !h-0" />
      <div className="bg-white border border-claude-border rounded-lg px-3 py-2 shadow-sm min-w-[130px] select-none">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-claude-bg rounded-md">
            <Icon size={14} className="text-claude-text" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              {hasStatus && <StatusDot ok={data.status!.ok} error={data.status?.error} />}
              <span className="text-xs font-medium text-claude-text truncate">{data.label}</span>
            </div>
            {data.metric && (
              <span className="text-[10px] text-claude-subtext font-mono">{data.metric}</span>
            )}
          </div>
        </div>
      </div>
      <Handle type="source" position={Position.Right} className="!bg-transparent !border-0 !w-0 !h-0" />
    </>
  );
}

const nodeTypes = { pipeline: PipelineNode };

/* ------------------------------------------------------------------ */
/*  Layout constants                                                   */
/* ------------------------------------------------------------------ */
const X_GAP = 180;
const Y_GAP = 80;
const START_X = 40;
const START_Y = 40;

/* ------------------------------------------------------------------ */
/*  Build graph from health data                                       */
/* ------------------------------------------------------------------ */
function buildGraph(health: InfraHealthResponse | null, hasRunningJob: boolean) {
  const h = health;

  const nodes: Node<PipelineNodeData>[] = [
    {
      id: 'zo',
      type: 'pipeline',
      position: { x: START_X, y: START_Y },
      data: { label: 'ZakonOnline API', icon: Globe, status: { ok: true } },
    },
    {
      id: 'scraper',
      type: 'pipeline',
      position: { x: START_X + X_GAP, y: START_Y },
      data: {
        label: 'ScrapeWorker',
        icon: Server,
        status: { ok: true },
        metric: h ? `${h.scrapeWorker.in_flight}/${h.scrapeWorker.max_concurrent} slots` : '—',
      },
    },
    {
      id: 'parser',
      type: 'pipeline',
      position: { x: START_X + X_GAP * 2, y: START_Y },
      data: { label: 'HTML Parser', icon: Code2, status: { ok: true } },
    },
    {
      id: 'postgres',
      type: 'pipeline',
      position: { x: START_X + X_GAP * 3, y: START_Y },
      data: {
        label: 'PostgreSQL',
        icon: Database,
        status: h?.postgres ?? { ok: true },
      },
    },
    {
      id: 'sectionizer',
      type: 'pipeline',
      position: { x: START_X + X_GAP * 2, y: START_Y + Y_GAP },
      data: { label: 'Sectionizer', icon: FileText, status: { ok: true } },
    },
    {
      id: 'embeddings',
      type: 'pipeline',
      position: { x: START_X + X_GAP * 3, y: START_Y + Y_GAP },
      data: { label: 'Embeddings', icon: Cpu, status: { ok: true } },
    },
    {
      id: 'qdrant',
      type: 'pipeline',
      position: { x: START_X + X_GAP * 4, y: START_Y + Y_GAP },
      data: {
        label: 'Qdrant',
        icon: Layers,
        status: h?.qdrant ?? { ok: true },
      },
    },
    {
      id: 'redis',
      type: 'pipeline',
      position: { x: START_X + X_GAP * 4, y: START_Y },
      data: {
        label: 'Redis Cache',
        icon: HardDrive,
        status: h?.redis ?? { ok: true },
      },
    },
  ];

  const animated = hasRunningJob;
  const edgeStyle = { stroke: '#94a3b8', strokeWidth: 1.5 };

  const edges: Edge[] = [
    { id: 'e-zo-scraper', source: 'zo', target: 'scraper', animated, style: edgeStyle },
    { id: 'e-scraper-parser', source: 'scraper', target: 'parser', animated, style: edgeStyle },
    { id: 'e-parser-pg', source: 'parser', target: 'postgres', animated, style: edgeStyle },
    { id: 'e-pg-section', source: 'postgres', target: 'sectionizer', animated, style: edgeStyle },
    { id: 'e-section-embed', source: 'sectionizer', target: 'embeddings', animated, style: edgeStyle },
    { id: 'e-embed-qdrant', source: 'embeddings', target: 'qdrant', animated, style: edgeStyle },
    { id: 'e-pg-redis', source: 'postgres', target: 'redis', style: edgeStyle },
  ];

  return { nodes, edges };
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */
export function InfrastructureDiagram({ hasRunningJob }: { hasRunningJob: boolean }) {
  const [health, setHealth] = useState<InfraHealthResponse | null>(null);

  const fetchHealth = useCallback(async () => {
    try {
      const resp = await api.admin.getInfrastructureHealth();
      setHealth(resp.data as InfraHealthResponse);
    } catch {
      // silently ignore — diagram still shows with default statuses
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    const iv = setInterval(fetchHealth, 15_000);
    return () => clearInterval(iv);
  }, [fetchHealth]);

  const { nodes, edges } = useMemo(
    () => buildGraph(health, hasRunningJob),
    [health, hasRunningJob],
  );

  return (
    <div className="bg-white rounded-xl border border-claude-border shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-claude-border bg-gray-50 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-claude-text">Pipeline Infrastructure</h2>
        {health && (
          <div className="flex items-center gap-3 text-[10px] text-claude-subtext">
            <span className="flex items-center gap-1">
              <StatusDot ok={health.postgres.ok} /> PG
            </span>
            <span className="flex items-center gap-1">
              <StatusDot ok={health.redis.ok} /> Redis
            </span>
            <span className="flex items-center gap-1">
              <StatusDot ok={health.qdrant.ok} /> Qdrant
            </span>
            <span className="flex items-center gap-1">
              <StatusDot ok={health.minio.ok} /> MinIO
            </span>
          </div>
        )}
      </div>
      <div style={{ height: 220 }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          proOptions={{ hideAttribution: true }}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          panOnDrag={false}
          zoomOnScroll={false}
          zoomOnPinch={false}
          zoomOnDoubleClick={false}
          preventScrolling={false}
        >
          <Background gap={16} size={0.5} color="#e2e8f0" />
        </ReactFlow>
      </div>
    </div>
  );
}
