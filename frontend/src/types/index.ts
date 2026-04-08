export interface User {
  id: string;
  email: string;
  name: string | null;
  role: 'admin' | 'user';
  storage_quota: number;
  storage_used: number;
  plan: 'basic' | 'pro';
  token_quota: number;
  tokens_used_month: number;
  token_reset_date: string | null;
  is_active: boolean;
  email_verified: boolean;
  created_at: string;
}

export type IndexStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'skipped';

export interface FileItem {
  id: string;
  filename: string;
  original_filename: string;
  mime_type: string | null;
  size: number;
  folder: string;
  is_indexed: boolean;
  index_status: IndexStatus;
  index_progress: number;
  index_error: string | null;
  indexed_at: string | null;
  has_active_shares: boolean;
  is_system: boolean;
  category_ids: string[];
  created_at: string;
  updated_at: string;
}

export type AgentType = 'file-manager';

export interface ChatSession {
  id: string;
  title: string;
  model: string;
  use_rag: boolean;
  rag_file_ids: string[] | null;
  agent_type?: AgentType | null;
  category_id?: string | null;
  category_name?: string | null;
  file_path?: string | null;
  file_size?: number;
  last_read_at?: string | null;
  unread_count?: number;
  created_at: string;
  updated_at: string;
  message_count?: number;
}

export interface ChatMessage {
  id: string;
  session_id?: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  input_tokens?: number;
  output_tokens?: number;
  rag_context?: string;
  source?: 'schedule' | 'trigger' | 'chat' | null;
  source_id?: string | null;
  created_at: string;
}

export interface RagSource {
  file_id: string;
  file_name: string;
  similarity?: number;
}

export interface Token {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export type NoteColor = 'yellow' | 'green' | 'pink' | 'blue' | 'purple' | 'orange' | 'gray';

export interface StickyNote {
  id: string;
  title: string;
  content: string;
  color: NoteColor;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
  z_index: number;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
}


export interface ApiError {
  detail: string;
  status?: number;
  code?: string;
}

// Indexing types
export interface IndexingStats {
  total: number;
  indexed: number;
  processing: number;
  failed: number;
  pending: number;
}

export interface IndexingFile {
  id: string;
  original_filename: string;
  mime_type: string | null;
  size: number;
  folder: string;
  index_status: IndexStatus;
  index_progress: number;
  index_error: string | null;
  indexed_at: string | null;
  created_at: string;
}

export interface IndexingFilesResponse {
  items: IndexingFile[];
  total: number;
  page: number;
  limit: number;
}

export interface SearchResult {
  file_id: string;
  filename: string;
  folder: string;
  chunk_text: string;
  similarity: number;
}

export interface AgentSummaryItem {
  last_message: string | null;
  last_message_at: string | null;
  unread_count: number;
}

export type AgentSummary = Record<AgentType, AgentSummaryItem>;

// Schedule Task types
export interface ScheduleTask {
  id: string;
  name: string;
  prompt: string;
  summary: string | null;
  tools_predicted: string[];
  scheduled_at: string;
  repeat_type: 'daily' | 'weekly' | 'monthly' | null;
  cron_expression: string | null;
  is_enabled: boolean;
  status: 'pending' | 'running' | 'completed' | 'failed';
  last_run_at: string | null;
  session_id: string | null;
  created_at: string;
}

export interface AnalyzeResult {
  actionable: boolean;
  name: string;
  summary: string;
  tools: string[];
  reason?: string;
}

// Vault types
export interface VaultCredential {
  id: string;
  site_name: string;
  username: string;
  password: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface VaultFile {
  id: string;
  original_filename: string;
  original_mime_type: string | null;
  original_size: number;
  original_folder: string;
  encrypted_size: number;
  created_at: string;
}

// Mining types
export interface PostActions {
  wait_for_selector?: string;
  scroll_to_bottom?: boolean;
}

export interface MiningTask {
  id: string;
  name: string;
  description: string;
  keywords: string[] | null;
  target_urls: string[] | null;
  schedule_cron: string | null;
  scraping_engine: string;
  post_actions: PostActions | null;
  status: string;
  last_run_at: string | null;
  last_run_status: string | null;
  last_run_message: string | null;
  run_count: number;
  result_count: number;
  created_at: string;
  updated_at: string;
}

export interface MiningTaskDetail extends MiningTask {
  scraping_instructions: string | null;
  json_schema: object | null;
  vault_credential_ids: string[] | null;
  vault_api_key_ids: string[] | null;
}

export interface MiningResult {
  id: string;
  source_url: string | null;
  parsed_data: object | null;
  file_id: string | null;
  created_at: string;
}

export interface MiningStats {
  total_tasks: number;
  scheduled_tasks: number;
  total_results: number;
  completed_runs: number;
}

// Pipeline types
export interface PipelineItem {
  id: string;
  name: string;
  short_code: string;
  description: string | null;
  mining_task_id: string | null;
  refinery_rule_id: string | null;
  bridge_config_id: string | null;
  workflow_data: { nodes: unknown[]; edges: unknown[] } | null;
  schedule_cron: string | null;
  last_scheduled_at: string | null;
  status: string;
  mining_task_name: string | null;
  refinery_rule_name: string | null;
  bridge_config_name: string | null;
  created_at: string;
  updated_at: string;
}

// Refinery types
export interface RefineryRule {
  id: string;
  name: string;
  source_task_id: string | null;
  source_task_name: string | null;
  pipeline_id: string | null;
  prompt: string;
  filter_rules: object | null;
  output_format: string;
  auto_trigger: boolean;
  status: string;
  last_run_at: string | null;
  last_run_status: string | null;
  last_run_message: string | null;
  run_count: number;
  result_count: number;
  created_at: string;
  updated_at: string;
}

export interface RefineryResult {
  id: string;
  source_result_id: string | null;
  refined_data: object | null;
  output_text: string | null;
  file_id: string | null;
  created_at: string;
}

export interface RefineryStats {
  total_rules: number;
  auto_rules: number;
  total_results: number;
  completed_runs: number;
}

export interface RefinerySource {
  id: string;
  name: string;
  result_count: number;
  last_run_status: string | null;
  last_run_at: string | null;
}

// Bridge types
export interface BridgeConfig {
  id: string;
  name: string;
  pipeline_id: string | null;
  source_rule_id: string | null;
  source_rule_name: string | null;
  destination_type: string;
  destination_config: Record<string, unknown> | null;
  auto_trigger: boolean;
  status: string;
  last_run_at: string | null;
  last_run_status: string | null;
  last_run_message: string | null;
  delivery_count: number;
  created_at: string;
  updated_at: string;
}

export interface BridgeStats {
  total_configs: number;
  auto_configs: number;
  total_deliveries: number;
}

export interface BridgeSource {
  id: string;
  name: string;
  output_format: string;
  result_count: number;
  last_run_status: string | null;
  last_run_at: string | null;
}

// Index Category types
export interface IndexCategory {
  id: string;
  name: string;
  color: string;
  file_count: number;
  created_at: string;
}

export interface VaultApiKey {
  id: string;
  site_name: string;
  api_key: string;
  expires_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

