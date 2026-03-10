/**
 * Workflow domain models for institutional analysis.
 */

export interface WorkflowSet {
  id: string;
  user_id: string;
  conversation_id: string | null;
  title: string;
  description: string | null;
  source_query: string;
  status: 'pending' | 'running' | 'completed' | 'partial' | 'failed';
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
  workflow_count?: number;
  completed_count?: number;
  workflows?: Workflow[];
}

export interface WorkflowPlanStep {
  id: number;
  tool: string;
  params: Record<string, any>;
  purpose: string;
  depends_on?: number[];
}

export interface WorkflowPlan {
  goal: string;
  steps: WorkflowPlanStep[];
}

export interface Workflow {
  id: string;
  workflow_set_id: string;
  sequence_number: number;
  title: string;
  description: string | null;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: {
    currentStep?: number;
    totalSteps?: number;
    currentTool?: string;
  };
  plan: WorkflowPlan;
  results: Record<string, any> | null;
  error_message: string | null;
  cost_usd: number;
  created_at: string;
  updated_at: string;
}

export interface WorkflowSSEEvent {
  type: 'step_start' | 'step_complete' | 'step_error' | 'workflow_complete' | 'heartbeat' | 'done' | 'error';
  data: Record<string, unknown>;
}
