export interface CrowdSample {
  sample_id: string;
  llm_output: string;
  founder_edit: string;
  task_instruction: string;
  metadata: CrowdSampleMetadata;
}

export interface CrowdSampleMetadata {
  session_source: string;
  edit_class: string;
  edit_distance_norm: number;
  artifact_id: string;
  edit_id: string;
  session_id: string;
}

export interface CrowdPlatformRow {
  sample_id: string;
  llm_output: string;
  task_instruction: string;
}

export interface PopulationRow {
  artifact_id: string;
  session_id: string;
  llm_content: string;
  edit_content: string;
  edit_id: string;
  edit_distance_norm: number;
  semantic_change_class: string;
  session_source: string;
}
