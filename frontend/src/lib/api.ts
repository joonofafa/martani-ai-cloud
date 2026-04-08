import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import type { User, FileItem, ChatSession, ChatMessage, Token, StickyNote, AgentType, IndexingStats, IndexingFilesResponse, SearchResult, AgentSummary, VaultCredential, VaultFile, VaultApiKey, ScheduleTask, AnalyzeResult, MiningTask, MiningTaskDetail, MiningResult, MiningStats, PipelineItem, RefineryRule, RefineryResult, RefineryStats, RefinerySource, BridgeConfig, BridgeStats, BridgeSource, IndexCategory } from '@/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

/** Check if a JWT token is expired (with 60s buffer). */
function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp * 1000 < Date.now() - 60_000;
  } catch {
    return true;
  }
}

/**
 * Get a fresh access token, refreshing if expired.
 * Used by WebSocket connections which can't use the axios interceptor.
 */
export async function getFreshToken(): Promise<string | null> {
  let token = localStorage.getItem('access_token');
  if (token && !isTokenExpired(token)) return token;

  // Token expired — try refresh
  const refreshToken = localStorage.getItem('refresh_token');
  if (!refreshToken) return null;

  try {
    const response = await axios.post(`${API_URL}/api/v1/auth/refresh`, {
      refresh_token: refreshToken,
    });
    const { access_token, refresh_token } = response.data;
    localStorage.setItem('access_token', access_token);
    localStorage.setItem('refresh_token', refresh_token);
    return access_token;
  } catch {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    return null;
  }
}

const api = axios.create({
  baseURL: `${API_URL}/api/v1`,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor for auth token and FormData handling
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  // Remove Content-Type for FormData so browser sets it with boundary
  if (config.data instanceof FormData) {
    delete config.headers['Content-Type'];
  }
  return config;
});

// Response interceptor for token refresh
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const refreshToken = localStorage.getItem('refresh_token');
        if (refreshToken) {
          const response = await axios.post(`${API_URL}/api/v1/auth/refresh`, {
            refresh_token: refreshToken,
          });
          const { access_token, refresh_token } = response.data;
          localStorage.setItem('access_token', access_token);
          localStorage.setItem('refresh_token', refresh_token);
          originalRequest.headers.Authorization = `Bearer ${access_token}`;
          return api(originalRequest);
        }
      } catch (refreshError) {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        window.location.href = '/login';
      }
    }

    return Promise.reject(error);
  }
);

// Auth API
export const authApi = {
  login: async (email: string, password: string): Promise<Token> => {
    const response = await api.post('/auth/login', { email, password });
    return response.data;
  },

  register: async (email: string, password: string, name?: string, agreed_to_terms?: boolean, turnstile_token?: string): Promise<{ message: string; auto_verified?: boolean }> => {
    const response = await api.post('/auth/register', { email, password, name, agreed_to_terms, turnstile_token });
    return response.data;
  },

  verifyEmail: async (token: string): Promise<{ message: string }> => {
    const response = await api.post('/auth/verify-email', { token });
    return response.data;
  },

  resendVerification: async (email: string): Promise<{ message: string }> => {
    const response = await api.post('/auth/resend-verification', { email });
    return response.data;
  },

  me: async (): Promise<User> => {
    const response = await api.get('/auth/me');
    return response.data;
  },
};

// Files API
export const filesApi = {
  list: async (folder: string = '/'): Promise<FileItem[]> => {
    const response = await api.get('/files', { params: { folder } });
    return response.data;
  },

  upload: async (file: File, folder: string = '/'): Promise<FileItem> => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post('/files/upload', formData, {
      params: { folder },
    });
    return response.data;
  },

  createFolder: async (name: string, parentPath: string = '/'): Promise<{ message: string }> => {
    const response = await api.post('/files/folders', {
      name,
      parent_path: parentPath,
    });
    return response.data;
  },

  download: async (fileId: string): Promise<Blob> => {
    const response = await api.get(`/files/${fileId}/download`, {
      responseType: 'blob',
    });
    return response.data;
  },

  delete: async (fileId: string): Promise<void> => {
    await api.delete(`/files/${fileId}`);
  },

  index: async (fileId: string): Promise<FileItem> => {
    const response = await api.post(`/files/${fileId}/index`);
    return response.data;
  },

  rename: async (fileId: string, newName: string): Promise<FileItem> => {
    const response = await api.patch(`/files/${fileId}`, { original_filename: newName });
    return response.data;
  },

  move: async (fileId: string, targetFolder: string): Promise<FileItem> => {
    const response = await api.post(`/files/${fileId}/move`, { target_folder: targetFolder });
    return response.data;
  },

  decompress: async (fileId: string): Promise<{ message: string; folder: string; files: string[]; count: number }> => {
    const response = await api.post(`/files/${fileId}/decompress`);
    return response.data;
  },

  getStreamUrl: (fileId: string): string => {
    const token = localStorage.getItem('access_token') || '';
    return `${API_URL}/api/v1/files/${fileId}/stream?token=${encodeURIComponent(token)}`;
  },
};

// Shares API (authenticated)
export interface FileShareInfo {
  id: string;
  token: string;
  url: string;
  has_password: boolean;
  expires_at: string | null;
  download_count: number;
  created_at: string;
}

export const sharesApi = {
  create: async (fileId: string, data: { password?: string; expires_in?: string }): Promise<FileShareInfo> => {
    const response = await api.post(`/files/${fileId}/shares`, data);
    return response.data;
  },

  list: async (fileId: string): Promise<FileShareInfo[]> => {
    const response = await api.get(`/files/${fileId}/shares`);
    return response.data;
  },

  revoke: async (fileId: string, shareId: string): Promise<void> => {
    await api.delete(`/files/${fileId}/shares/${shareId}`);
  },
};

// Public Shares API (no auth)
export interface PublicShareInfo {
  filename: string;
  size: number;
  mime_type: string | null;
  has_password: boolean;
  expires_at: string | null;
  download_count: number;
}

export const publicSharesApi = {
  getInfo: async (token: string): Promise<PublicShareInfo> => {
    const response = await axios.get(`${API_URL}/api/v1/public/shares/${token}/info`);
    return response.data;
  },

  download: async (token: string, password?: string): Promise<Blob> => {
    const response = await axios.post(
      `${API_URL}/api/v1/public/shares/${token}/download`,
      { password: password || null },
      { responseType: 'blob' },
    );
    return response.data;
  },
};

// Chat API
export const chatApi = {
  listSessions: async (): Promise<ChatSession[]> => {
    const response = await api.get('/chat/sessions');
    return response.data;
  },

  createSession: async (data: {
    title?: string;
    model?: string;
    use_rag?: boolean;
    rag_file_ids?: string[];
    category_id?: string;
    agent_type?: string;
  }): Promise<ChatSession> => {
    const response = await api.post('/chat/sessions', data);
    return response.data;
  },

  getSession: async (sessionId: string): Promise<ChatSession> => {
    const response = await api.get(`/chat/sessions/${sessionId}`);
    return response.data;
  },

  getMessages: async (sessionId: string): Promise<ChatMessage[]> => {
    const response = await api.get(`/chat/sessions/${sessionId}/messages`);
    return response.data;
  },

  sendMessage: async (sessionId: string, content: string): Promise<ChatMessage> => {
    const response = await api.post(`/chat/sessions/${sessionId}/messages`, { content });
    return response.data;
  },

  deleteSession: async (sessionId: string): Promise<void> => {
    await api.delete(`/chat/sessions/${sessionId}`);
  },

  saveSession: async (sessionId: string): Promise<{ file_size: number }> => {
    const response = await api.post(`/chat/sessions/${sessionId}/save`);
    return response.data;
  },

  loadSession: async (sessionId: string): Promise<{ message_count: number }> => {
    const response = await api.post(`/chat/sessions/${sessionId}/load`);
    return response.data;
  },

  listModels: async (): Promise<{ models: { id: string; name: string }[] }> => {
    const response = await api.get('/chat/models');
    return response.data;
  },

  // Agent messenger
  getAgentSession: async (agentType: AgentType): Promise<ChatSession> => {
    const response = await api.get(`/chat/agents/${agentType}/session`);
    return response.data;
  },

  markAgentRead: async (agentType: AgentType): Promise<void> => {
    await api.post(`/chat/agents/${agentType}/read`);
  },

  getAgentUnread: async (): Promise<Record<AgentType, number>> => {
    const response = await api.get('/chat/agents/unread');
    return response.data;
  },

  getAgentSummary: async (): Promise<AgentSummary> => {
    const response = await api.get('/chat/agents/summary');
    return response.data;
  },

  getProcessingStatus: async (): Promise<{ session_id: string; message_id: string }[]> => {
    const response = await api.get('/chat/agents/processing');
    return response.data;
  },
};

// Notes API
export const notesApi = {
  list: async (): Promise<StickyNote[]> => {
    const response = await api.get('/notes');
    return response.data;
  },

  create: async (data: {
    title?: string;
    content?: string;
    color?: string;
    position_x?: number;
    position_y?: number;
  }): Promise<StickyNote> => {
    const response = await api.post('/notes', data);
    return response.data;
  },

  update: async (noteId: string, data: {
    title?: string;
    content?: string;
    color?: string;
    position_x?: number;
    position_y?: number;
    width?: number;
    height?: number;
    z_index?: number;
    is_pinned?: boolean;
  }): Promise<StickyNote> => {
    const response = await api.patch(`/notes/${noteId}`, data);
    return response.data;
  },

  delete: async (noteId: string): Promise<void> => {
    await api.delete(`/notes/${noteId}`);
  },

  search: async (q: string): Promise<StickyNote[]> => {
    const response = await api.get('/notes/search', { params: { q } });
    return response.data;
  },
};

// Schedule API
export const scheduleApi = {
  listTasks: async (weekStart?: string): Promise<ScheduleTask[]> => {
    const response = await api.get('/schedule/tasks', { params: { week_start: weekStart } });
    return response.data;
  },

  createTask: async (data: {
    name?: string;
    prompt: string;
    scheduled_at: string;
    repeat_type?: string | null;
    cron_expression?: string | null;
    summary?: string | null;
    tools_predicted?: string[] | null;
  }): Promise<ScheduleTask> => {
    const response = await api.post('/schedule/tasks', data);
    return response.data;
  },

  getTask: async (id: string): Promise<ScheduleTask> => {
    const response = await api.get(`/schedule/tasks/${id}`);
    return response.data;
  },

  updateTask: async (id: string, data: {
    name?: string;
    prompt?: string;
    scheduled_at?: string;
    repeat_type?: string | null;
    cron_expression?: string | null;
    is_enabled?: boolean;
  }): Promise<ScheduleTask> => {
    const response = await api.patch(`/schedule/tasks/${id}`, data);
    return response.data;
  },

  deleteTask: async (id: string): Promise<void> => {
    await api.delete(`/schedule/tasks/${id}`);
  },

  analyze: async (prompt: string): Promise<AnalyzeResult> => {
    const response = await api.post('/schedule/analyze', { prompt });
    return response.data;
  },
};

// Indexing API
export const indexingApi = {
  getStats: async (): Promise<IndexingStats> => {
    const response = await api.get('/indexing/stats');
    return response.data;
  },

  listFiles: async (params?: {
    status?: string;
    type?: string;
    search?: string;
    category_id?: string;
    page?: number;
    limit?: number;
  }): Promise<IndexingFilesResponse> => {
    const response = await api.get('/indexing/files', { params });
    return response.data;
  },

  search: async (query: string, limit: number = 10, fileType?: string): Promise<{ results: SearchResult[] }> => {
    const response = await api.post('/indexing/search', { query, limit, file_type: fileType || undefined });
    return response.data;
  },

  retry: async (fileId: string): Promise<FileItem> => {
    const response = await api.post(`/indexing/${fileId}/retry`);
    return response.data;
  },

  batchIndex: async (fileIds: string[]): Promise<{ dispatched: number; skipped: number }> => {
    const response = await api.post('/files/batch-index', { file_ids: fileIds });
    return response.data;
  },

  indexFile: async (fileId: string): Promise<FileItem> => {
    const response = await api.post(`/files/${fileId}/index`);
    return response.data;
  },

  indexAll: async (batchSize: number = 100): Promise<{
    dispatched: number;
    skipped: number;
    remaining_pending: number;
    message: string;
  }> => {
    const response = await api.post(`/indexing/index-all?batch_size=${batchSize}`);
    return response.data;
  },

  // Categories
  listCategories: async (): Promise<IndexCategory[]> => {
    const response = await api.get('/indexing/categories');
    return response.data;
  },

  createCategory: async (data: { name: string; color: string }): Promise<IndexCategory> => {
    const response = await api.post('/indexing/categories', data);
    return response.data;
  },

  updateCategory: async (id: string, data: { name?: string; color?: string }): Promise<IndexCategory> => {
    const response = await api.put(`/indexing/categories/${id}`, data);
    return response.data;
  },

  deleteCategory: async (id: string): Promise<void> => {
    await api.delete(`/indexing/categories/${id}`);
  },

  removeFileFromCategory: async (categoryId: string, fileId: string): Promise<void> => {
    await api.delete(`/indexing/categories/${categoryId}/files/${fileId}`);
  },

  setFileCategories: async (fileId: string, categoryIds: string[]): Promise<void> => {
    await api.put(`/indexing/files/${fileId}/categories`, { category_ids: categoryIds });
  },

  bulkSetFileCategories: async (fileIds: string[], categoryIds: string[]): Promise<void> => {
    await api.put('/indexing/files/bulk-categories', { file_ids: fileIds, category_ids: categoryIds });
  },
};


// Billing API
export interface PlanInfo {
  name: string;
  token_quota: number;
  storage_quota: number;
}

export const billingApi = {
  getPlans: async (): Promise<{ plans: PlanInfo[] }> => {
    const response = await api.get('/billing/plans');
    return response.data;
  },

  changePlan: async (plan: string): Promise<User> => {
    const response = await api.post('/billing/change-plan', { plan });
    return response.data;
  },
};

// Admin API
export interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
  is_active: boolean;
  storage_quota: number;
  storage_used: number;
  plan: string;
  token_quota: number;
  tokens_used_month: number;
  created_at: string;
}

export interface SystemStats {
  total_users: number;
  active_users: number;
  total_files: number;
  total_storage_used: number;
  total_storage_quota: number;
  hw_storage_total: number;
  hw_storage_used: number;
  martani_storage_used: number;
  total_tokens_used: number;
  total_tokens_quota: number;
}

export interface SystemSetting {
  key: string;
  value: string | null;
  description: string | null;
  is_secret: boolean;
}

export interface ToolFunctionData {
  name: string;
  display_name: string;
  sort_order: number;
}

export interface ToolGroupData {
  key: string;
  category: string;
  display_name: string;
  enabled: boolean;
  sort_order: number;
  functions: ToolFunctionData[];
}

// Audit Log types
export interface AuditLogEntry {
  id: string;
  user_id: string | null;
  user_email: string | null;
  user_name: string | null;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  detail: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export interface AuditLogPage {
  items: AuditLogEntry[];
  total: number;
  page: number;
  limit: number;
}

export interface DailyUsageStats {
  date: string;
  dau: number;
  file_uploads: number;
  file_upload_bytes: number;
  file_downloads: number;
  chat_messages: number;
  chat_tokens: number;
  webdav_ops: number;
}

export const adminApi = {
  // Stats
  getStats: async (): Promise<SystemStats> => {
    const response = await api.get('/admin/stats');
    return response.data;
  },

  // Users
  listUsers: async (): Promise<AdminUser[]> => {
    const response = await api.get('/admin/users');
    return response.data;
  },

  getUser: async (userId: string): Promise<AdminUser> => {
    const response = await api.get(`/admin/users/${userId}`);
    return response.data;
  },

  createUser: async (data: {
    email: string;
    password: string;
    name?: string;
    role?: string;
    plan?: string;
    storage_quota?: number;
  }): Promise<AdminUser> => {
    const response = await api.post('/admin/users', data);
    return response.data;
  },

  updateUser: async (userId: string, data: {
    name?: string;
    role?: string;
    is_active?: boolean;
    storage_quota?: number;
    plan?: string;
  }): Promise<AdminUser> => {
    const response = await api.patch(`/admin/users/${userId}`, data);
    return response.data;
  },

  changeUserPassword: async (userId: string, newPassword: string): Promise<void> => {
    await api.post(`/admin/users/${userId}/password`, { new_password: newPassword });
  },

  deleteUser: async (userId: string): Promise<void> => {
    await api.delete(`/admin/users/${userId}`);
  },

  // Settings
  listSettings: async (): Promise<SystemSetting[]> => {
    const response = await api.get('/admin/settings');
    return response.data;
  },

  getSetting: async (key: string): Promise<SystemSetting> => {
    const response = await api.get(`/admin/settings/${key}`);
    return response.data;
  },

  updateSetting: async (key: string, value: string): Promise<SystemSetting> => {
    const response = await api.put(`/admin/settings/${key}`, { value });
    return response.data;
  },

  // Agent default prompt
  getAgentDefaultPrompt: async (agentType: string): Promise<string> => {
    const response = await api.get(`/admin/agent-default-prompt/${agentType}`);
    return response.data.default_prompt;
  },

  // Tool Registry
  getToolRegistry: async (): Promise<ToolGroupData[]> => {
    const response = await api.get('/admin/tool-registry');
    return response.data;
  },

  updateToolGroup: async (groupKey: string, data: { enabled?: boolean; display_name?: string; category?: string }): Promise<ToolGroupData> => {
    const response = await api.put(`/admin/tool-registry/${groupKey}`, data);
    return response.data;
  },

  batchUpdateToolGroups: async (updates: Record<string, boolean>): Promise<ToolGroupData[]> => {
    const response = await api.put('/admin/tool-registry/batch-update', updates);
    return response.data;
  },

  // Activity Logs
  getActivityLogs: async (params?: {
    page?: number;
    limit?: number;
    action?: string;
    user_id?: string;
    date_from?: string;
    date_to?: string;
  }): Promise<AuditLogPage> => {
    const response = await api.get('/admin/logs/activity', { params });
    return response.data;
  },

  getUsageStats: async (days?: number): Promise<DailyUsageStats[]> => {
    const response = await api.get('/admin/logs/stats', { params: { days: days || 30 } });
    return response.data;
  },

  getUserActivity: async (userId: string, page?: number, limit?: number): Promise<AuditLogPage> => {
    const response = await api.get(`/admin/logs/users/${userId}/activity`, { params: { page, limit } });
    return response.data;
  },

  getTokenUsage: async (params?: { user_id?: string; days?: number; limit?: number; offset?: number }) => {
    const response = await api.get('/admin/token-usage', { params });
    return response.data as {
      items: Array<{
        id: string; user_email: string; user_name: string | null;
        action: string; input_tokens: number; output_tokens: number;
        tools_called: string[]; agent_type: string | null;
        session_title: string | null; created_at: string;
      }>;
      total_count: number; total_input_tokens: number; total_output_tokens: number;
    };
  },

  getTokenStats: async (days?: number) => {
    const response = await api.get('/admin/token-stats', { params: { days: days || 30 } });
    return response.data as Array<{
      user_id: string; email: string; name: string | null; plan: string;
      tokens_used_month: number; token_quota: number;
      chat_input: number; chat_output: number;
      schedule_input: number; schedule_output: number;
      vision_input: number; vision_output: number;
      audio_input: number; audio_output: number;
      mining_input: number; mining_output: number;
    }>;
  },
};

// Vault API
export const vaultApi = {
  // Credentials
  listCredentials: async (): Promise<VaultCredential[]> => {
    const response = await api.get('/vault/credentials');
    return response.data;
  },

  createCredential: async (data: {
    site_name: string;
    username: string;
    password: string;
    notes?: string;
  }): Promise<VaultCredential> => {
    const response = await api.post('/vault/credentials', data);
    return response.data;
  },

  getCredential: async (id: string): Promise<VaultCredential> => {
    const response = await api.get(`/vault/credentials/${id}`);
    return response.data;
  },

  updateCredential: async (id: string, data: {
    site_name?: string;
    username?: string;
    password?: string;
    notes?: string;
  }): Promise<VaultCredential> => {
    const response = await api.put(`/vault/credentials/${id}`, data);
    return response.data;
  },

  deleteCredential: async (id: string): Promise<void> => {
    await api.delete(`/vault/credentials/${id}`);
  },

  // File Vault
  listFiles: async (): Promise<VaultFile[]> => {
    const response = await api.get('/vault/files');
    return response.data;
  },

  lockFile: async (fileId: string): Promise<VaultFile> => {
    const response = await api.post(`/vault/files/${fileId}/lock`);
    return response.data;
  },

  unlockFile: async (vaultId: string): Promise<{ message: string; file_id: string; filename: string; folder: string }> => {
    const response = await api.post(`/vault/files/${vaultId}/unlock`);
    return response.data;
  },

  deleteFile: async (vaultId: string): Promise<void> => {
    await api.delete(`/vault/files/${vaultId}`);
  },

  // API Keys
  listApiKeys: async (): Promise<VaultApiKey[]> => {
    const response = await api.get('/vault/api-keys');
    return response.data;
  },

  createApiKey: async (data: {
    site_name: string;
    api_key: string;
    expires_at?: string;
    notes?: string;
  }): Promise<VaultApiKey> => {
    const response = await api.post('/vault/api-keys', data);
    return response.data;
  },

  getApiKey: async (id: string): Promise<VaultApiKey> => {
    const response = await api.get(`/vault/api-keys/${id}`);
    return response.data;
  },

  updateApiKey: async (id: string, data: {
    site_name?: string;
    api_key?: string;
    expires_at?: string;
    notes?: string;
  }): Promise<VaultApiKey> => {
    const response = await api.put(`/vault/api-keys/${id}`, data);
    return response.data;
  },

  deleteApiKey: async (id: string): Promise<void> => {
    await api.delete(`/vault/api-keys/${id}`);
  },
};

// ── Mining API ──

export const miningApi = {
  listTasks: async (): Promise<MiningTask[]> => {
    const response = await api.get('/mining/tasks');
    return response.data;
  },

  createTask: async (data: {
    name: string;
    description: string;
    keywords?: string[];
    target_urls?: string[];
    schedule_cron?: string;
    vault_credential_ids?: string[];
    vault_api_key_ids?: string[];
    scraping_engine?: string;
    post_actions?: object;
  }): Promise<MiningTaskDetail> => {
    const response = await api.post('/mining/tasks', data);
    return response.data;
  },

  getTask: async (id: string): Promise<MiningTaskDetail> => {
    const response = await api.get(`/mining/tasks/${id}`);
    return response.data;
  },

  updateTask: async (id: string, data: {
    name?: string;
    description?: string;
    keywords?: string[];
    target_urls?: string[];
    schedule_cron?: string;
    vault_credential_ids?: string[];
    vault_api_key_ids?: string[];
    scraping_engine?: string;
    post_actions?: object;
    status?: string;
  }): Promise<MiningTaskDetail> => {
    const response = await api.put(`/mining/tasks/${id}`, data);
    return response.data;
  },

  deleteTask: async (id: string): Promise<void> => {
    await api.delete(`/mining/tasks/${id}`);
  },

  runTask: async (id: string): Promise<{ ok: boolean }> => {
    const response = await api.post(`/mining/tasks/${id}/run`);
    return response.data;
  },

  getResults: async (taskId: string, limit = 50, offset = 0): Promise<MiningResult[]> => {
    const response = await api.get(`/mining/tasks/${taskId}/results`, { params: { limit, offset } });
    return response.data;
  },

  getStats: async (): Promise<MiningStats> => {
    const response = await api.get('/mining/stats');
    return response.data;
  },
};

// ── Pipeline API ──

export const pipelineApi = {
  list: async (): Promise<PipelineItem[]> => {
    const response = await api.get('/pipelines/');
    return response.data;
  },

  create: async (data: {
    name: string;
    description?: string;
    mining_task_id?: string;
    schedule_cron?: string | null;
    workflow_data?: { nodes: unknown[]; edges: unknown[] } | null;
  }): Promise<PipelineItem> => {
    const response = await api.post('/pipelines/', data);
    return response.data;
  },

  update: async (id: string, data: {
    name?: string;
    description?: string;
    mining_task_id?: string;
    refinery_rule_id?: string;
    bridge_config_id?: string;
    schedule_cron?: string | null;
    status?: string;
    workflow_data?: { nodes: unknown[]; edges: unknown[] } | null;
  }): Promise<PipelineItem> => {
    const response = await api.put(`/pipelines/${id}`, data);
    return response.data;
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/pipelines/${id}`);
  },
};

// ── Refinery API ──

export const refineryApi = {
  listRules: async (): Promise<RefineryRule[]> => {
    const response = await api.get('/refinery/rules');
    return response.data;
  },

  createRule: async (data: {
    name: string;
    source_task_id?: string;
    pipeline_id?: string;
    prompt: string;
    filter_rules?: object;
    output_format?: string;
    auto_trigger?: boolean;
  }): Promise<RefineryRule> => {
    const response = await api.post('/refinery/rules', data);
    return response.data;
  },

  getRule: async (id: string): Promise<RefineryRule> => {
    const response = await api.get(`/refinery/rules/${id}`);
    return response.data;
  },

  updateRule: async (id: string, data: {
    name?: string;
    source_task_id?: string;
    prompt?: string;
    filter_rules?: object;
    output_format?: string;
    auto_trigger?: boolean;
    status?: string;
  }): Promise<RefineryRule> => {
    const response = await api.put(`/refinery/rules/${id}`, data);
    return response.data;
  },

  deleteRule: async (id: string): Promise<void> => {
    await api.delete(`/refinery/rules/${id}`);
  },

  runRule: async (id: string): Promise<{ ok: boolean }> => {
    const response = await api.post(`/refinery/rules/${id}/run`);
    return response.data;
  },

  getResults: async (ruleId: string, limit = 50, offset = 0): Promise<RefineryResult[]> => {
    const response = await api.get(`/refinery/rules/${ruleId}/results`, { params: { limit, offset } });
    return response.data;
  },

  getStats: async (): Promise<RefineryStats> => {
    const response = await api.get('/refinery/stats');
    return response.data;
  },

  getSources: async (): Promise<RefinerySource[]> => {
    const response = await api.get('/refinery/sources');
    return response.data;
  },

  previewSource: async (taskId: string, limit = 20): Promise<MiningResult[]> => {
    const response = await api.get(`/refinery/sources/${taskId}/preview`, { params: { limit } });
    return response.data;
  },
};

// ── Bridge API ──

export const bridgeApi = {
  listConfigs: async (): Promise<BridgeConfig[]> => {
    const response = await api.get('/bridge/configs');
    return response.data;
  },

  createConfig: async (data: {
    name: string;
    source_rule_id?: string;
    pipeline_id?: string;
    destination_type: string;
    destination_config?: object;
    auto_trigger?: boolean;
  }): Promise<BridgeConfig> => {
    const response = await api.post('/bridge/configs', data);
    return response.data;
  },

  getConfig: async (id: string): Promise<BridgeConfig> => {
    const response = await api.get(`/bridge/configs/${id}`);
    return response.data;
  },

  updateConfig: async (id: string, data: {
    name?: string;
    source_rule_id?: string;
    destination_type?: string;
    destination_config?: object;
    auto_trigger?: boolean;
    status?: string;
  }): Promise<BridgeConfig> => {
    const response = await api.put(`/bridge/configs/${id}`, data);
    return response.data;
  },

  deleteConfig: async (id: string): Promise<void> => {
    await api.delete(`/bridge/configs/${id}`);
  },

  runConfig: async (id: string): Promise<{ ok: boolean }> => {
    const response = await api.post(`/bridge/configs/${id}/run`);
    return response.data;
  },

  getStats: async (): Promise<BridgeStats> => {
    const response = await api.get('/bridge/stats');
    return response.data;
  },

  getSources: async (): Promise<BridgeSource[]> => {
    const response = await api.get('/bridge/sources');
    return response.data;
  },
};

export default api;
