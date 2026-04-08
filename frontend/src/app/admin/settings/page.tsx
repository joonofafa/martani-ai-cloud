'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/lib/store';
import { useTranslation } from '@/hooks/use-translation';
import { adminApi, SystemSetting, ToolGroupData } from '@/lib/api';
import { getErrorMessage } from '@/lib/errors';
import { Sidebar } from '@/components/sidebar';
import {
  Settings, ChevronLeft, Bot, Database,
  Lock, Eye, EyeOff, Save, RefreshCw, Zap, Layers,
} from 'lucide-react';

// LLM Tools config
// Tool categories and groups are now loaded from DB via /admin/tool-registry API
// Map backend category strings → i18n keys (tools.category.*)
const CATEGORY_I18N_KEY: Record<string, string> = {
  'File Management': 'file_management', 'File Search': 'file_search',
  'Notes': 'notes', 'Schedule': 'schedule', 'Email': 'email',
  'Messenger': 'messenger', 'Vault': 'vault', 'Agent': 'agent',
  'Indexing': 'indexing', 'Data Collection': 'data_collection', 'Code Execution': 'code_execution',
};


// Agent definitions
const AGENTS = [
  { key: 'file_manager', agentType: 'file-manager',
    promptKey: 'agent_prompt_file_manager', toolsKey: 'agent_tools_file_manager' },
];

export default function AdminSettingsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t } = useTranslation(['admin', 'tools']);
  const { user, isAuthenticated, isLoading } = useAuthStore();

  const SETTING_GROUPS = {
    llm: {
      title: t('settings.llm.title'),
      icon: Bot,
      description: t('settings.llm.description'),
      keys: ['llm_provider', 'openrouter_api_key', 'openrouter_model', 'openrouter_vision_api_key', 'openrouter_vision_model'],
    },
    embedding: {
      title: t('settings.embedding.title'),
      icon: Database,
      description: t('settings.embedding.description'),
      keys: ['embedding_provider', 'embedding_model', 'embedding_endpoint'],
    },
    system: {
      title: t('settings.system.title'),
      icon: Settings,
      description: t('settings.system.description'),
      keys: ['max_upload_size', 'allow_registration'],
    },
    plans: {
      title: t('settings.plans.title'),
      icon: Zap,
      description: t('settings.plans.description'),
      keys: ['free_storage_quota', 'free_token_quota', 'basic_storage_quota', 'basic_token_quota', 'pro_storage_quota', 'pro_token_quota', 'token_price_per_million'],
    },
    collection: {
      title: t('settings.collection.title'),
      icon: Layers,
      description: t('settings.collection.description'),
      keys: ['agent_orchestrator_model', 'agent_worker_model', 'agent_parser_model'],
    },
  };

  const SETTING_LABELS: Record<string, string> = {
    llm_provider: t('settings.labels.llm_provider'),
    openrouter_api_key: t('settings.labels.openrouter_api_key'),
    openrouter_model: t('settings.labels.openrouter_model'),
    openrouter_vision_api_key: 'Vision API Key (OpenRouter)',
    openrouter_vision_model: t('settings.labels.openrouter_vision_model'),
    embedding_provider: t('settings.labels.embedding_provider'),
    embedding_model: t('settings.labels.embedding_model'),
    embedding_endpoint: t('settings.labels.embedding_endpoint'),
    default_user_quota: t('settings.labels.default_user_quota'),
    max_upload_size: t('settings.labels.max_upload_size'),
    allow_registration: t('settings.labels.allow_registration'),
    free_storage_quota: 'Free 스토리지 쿼터',
    free_token_quota: 'Free 토큰 쿼터',
    basic_storage_quota: t('settings.labels.basic_storage_quota'),
    pro_storage_quota: t('settings.labels.pro_storage_quota'),
    basic_token_quota: t('settings.labels.basic_token_quota'),
    pro_token_quota: t('settings.labels.pro_token_quota'),
    token_price_per_million: t('settings.labels.token_price_per_million'),
    agent_orchestrator_model: t('settings.labels.agent_orchestrator_model'),
    agent_worker_model: t('settings.labels.agent_worker_model'),
    agent_parser_model: t('settings.labels.agent_parser_model'),
  };

  const SETTING_HELP: Record<string, string> = {
    llm_provider: t('settings.help.llm_provider'),
    embedding_provider: t('settings.help.embedding_provider'),
    embedding_model: t('settings.help.embedding_model'),
    embedding_endpoint: t('settings.help.embedding_endpoint'),
    openrouter_api_key: t('settings.help.openrouter_api_key'),
    openrouter_model: t('settings.help.openrouter_model'),
    openrouter_vision_api_key: '비전(이미지 분석)용 별도 OpenRouter API 키. 미설정 시 채팅 API 키를 공용으로 사용합니다.',
    openrouter_vision_model: t('settings.help.openrouter_vision_model'),
    free_storage_quota: 'Free 요금제 스토리지 한도 (바이트). 기본값: 1073741824 (1GB)',
    free_token_quota: 'Free 요금제 월 토큰 한도. 기본값: 500000 (500K)',
    basic_storage_quota: t('settings.help.basic_storage_quota'),
    pro_storage_quota: t('settings.help.pro_storage_quota'),
    basic_token_quota: t('settings.help.basic_token_quota'),
    pro_token_quota: t('settings.help.pro_token_quota'),
    token_price_per_million: t('settings.help.token_price_per_million'),
    agent_orchestrator_model: t('settings.help.agent_orchestrator_model'),
    agent_worker_model: t('settings.help.agent_worker_model'),
    agent_parser_model: t('settings.help.agent_parser_model'),
  };

  // Default values shown as placeholder & fallback display
  const SETTING_DEFAULTS: Record<string, string> = {
    free_storage_quota: '1073741824',
    free_token_quota: '500000',
    basic_storage_quota: '10737418240',
    pro_storage_quota: '107374182400',
    basic_token_quota: '5000000',
    pro_token_quota: '50000000',
    token_price_per_million: '0.50',
    default_user_quota: '5368709120',
    max_upload_size: '104857600',
    agent_orchestrator_model: '',
    agent_worker_model: 'meta-llama/llama-3.1-8b-instruct',
    agent_parser_model: 'anthropic/claude-3.5-haiku',
  };

  // Placeholder text for the edit input
  const SETTING_PLACEHOLDERS: Record<string, string> = {
    free_storage_quota: '1073741824 (1 GB)',
    free_token_quota: '500000 (500K)',
    basic_storage_quota: '10737418240 (10 GB)',
    pro_storage_quota: '107374182400 (100 GB)',
    basic_token_quota: '5000000 (5M)',
    pro_token_quota: '50000000 (50M)',
    token_price_per_million: '0.50',
    default_user_quota: '5368709120 (5 GB)',
    max_upload_size: '104857600 (100 MB)',
    openrouter_model: 'openai/gpt-4o-mini',
    openrouter_vision_model: 'google/gemini-2.5-flash',
    agent_orchestrator_model: '(기본 LLM 모델 사용)',
    agent_worker_model: 'meta-llama/llama-3.1-8b-instruct',
    agent_parser_model: 'anthropic/claude-3.5-haiku',
  };

  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});

  // Agent state
  const [agentPrompts, setAgentPrompts] = useState<Record<string, string>>({});
  const [agentDefaults, setAgentDefaults] = useState<Record<string, string>>({});
  const [agentDirty, setAgentDirty] = useState<Record<string, boolean>>({});

  // Tool registry from DB
  const { data: toolRegistry, refetch: refetchToolRegistry } = useQuery({
    queryKey: ['tool-registry'],
    queryFn: adminApi.getToolRegistry,
    enabled: isAuthenticated && user?.role === 'admin',
  });

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
    if (!isLoading && user && user.role !== 'admin') {
      router.push('/files');
    }
  }, [isAuthenticated, isLoading, user, router]);

  const { data: settings, isLoading: settingsLoading, refetch } = useQuery({
    queryKey: ['admin-settings'],
    queryFn: adminApi.listSettings,
    enabled: isAuthenticated && user?.role === 'admin',
  });

  // Load agent prompts from settings + fetch defaults from backend
  useEffect(() => {
    if (!settings) return;

    const loadPrompts = async () => {
      const prompts: Record<string, string> = {};
      const defaults: Record<string, string> = {};
      for (const agent of AGENTS) {
        const promptSetting = settings.find((s) => s.key === agent.promptKey);
        // Fetch the built-in default from backend
        try {
          defaults[agent.key] = await adminApi.getAgentDefaultPrompt(agent.agentType);
        } catch (err: unknown) {
          console.warn('Failed to fetch agent default prompt:', err);
          defaults[agent.key] = '';
        }
        // Use DB value if set, otherwise use backend default
        prompts[agent.key] = promptSetting?.value || defaults[agent.key];
      }
      setAgentDefaults(defaults);
      setAgentPrompts(prompts);
      setAgentDirty({});
    };
    loadPrompts();
  }, [settings]);

  // Initialize edit values from settings
  useEffect(() => {
    if (settings) {
      const vals: Record<string, string> = {};
      for (const s of settings) {
        if (!s.is_secret) vals[s.key] = s.value || '';
      }
      setEditValues(vals);
    }
  }, [settings]);

  const updateSettingMutation = useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) =>
      adminApi.updateSetting(key, value),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-settings'] });
      queryClient.invalidateQueries({ queryKey: ['available-models'] });
    },
    onError: (error: Error) => {
      const msg = getErrorMessage(error, t('settings.saveFailed'));
      alert(`${t('settings.saveError')} ${msg}`);
    },
  });

  const getSettingValue = (key: string): SystemSetting | undefined => {
    return settings?.find((s) => s.key === key);
  };

  const getEditValue = (key: string): string => {
    return editValues[key] ?? getSettingValue(key)?.value ?? SETTING_DEFAULTS[key] ?? '';
  };

  const setEditValue = (key: string, value: string) => {
    setEditValues((prev) => ({ ...prev, [key]: value }));
  };

  const isChanged = (key: string): boolean => {
    const setting = getSettingValue(key);
    const current = setting?.value ?? SETTING_DEFAULTS[key] ?? '';
    const edit = editValues[key];
    if (edit === undefined) return false;
    if (setting?.is_secret && edit) return true;
    return edit !== current;
  };

  const handleSave = (key: string) => {
    updateSettingMutation.mutate({ key, value: getEditValue(key) });
  };

  const toggleSecretVisibility = (key: string) => {
    setShowSecrets((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Per-agent handlers
  const handleAgentPromptChange = (agentKey: string, value: string) => {
    setAgentPrompts((prev) => ({ ...prev, [agentKey]: value }));
    setAgentDirty((prev) => ({ ...prev, [agentKey]: true }));
  };

  const handleToolGroupToggle = async (groupKey: string) => {
    const group = toolRegistry?.find(g => g.key === groupKey);
    if (!group) return;
    try {
      await adminApi.updateToolGroup(groupKey, { enabled: !group.enabled });
      refetchToolRegistry();
    } catch (error: unknown) {
      const msg = getErrorMessage(error, t('settings.toolError'));
      alert(`${t('settings.toolErrorTitle')} ${msg}`);
    }
  };

  const handleSaveAgent = async (agent: typeof AGENTS[number]) => {
    try {
      await adminApi.updateSetting(agent.promptKey, agentPrompts[agent.key] || '');
      queryClient.invalidateQueries({ queryKey: ['admin-settings'] });
      setAgentDirty((prev) => ({ ...prev, [agent.key]: false }));
    } catch (error: unknown) {
      const msg = getErrorMessage(error, t('settings.saveFailed'));
      alert(`${t('settings.agentError')} ${msg}`);
    }
  };

  if (isLoading || !user || user.role !== 'admin') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-surface">
      <Sidebar />

      <main className="flex-1 p-8">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <a href="/admin" className="p-2 hover:bg-gray-700 rounded-lg transition-colors">
                <ChevronLeft className="w-5 h-5 text-gray-400" />
              </a>
              <Settings className="w-8 h-8 text-primary-400" />
              <h1 className="text-2xl font-bold text-gray-100">{t('settings.title')}</h1>
            </div>
            <button
              onClick={() => refetch()}
              className="flex items-center gap-2 px-4 py-2 text-gray-400 hover:bg-gray-700 rounded-lg transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              {t('settings.refresh')}
            </button>
          </div>

          {settingsLoading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
            </div>
          ) : (
            <div className="space-y-8">
              {Object.entries(SETTING_GROUPS).map(([groupKey, group]) => {
                const Icon = group.icon;
                const currentProvider = groupKey === 'llm' ? (getSettingValue('llm_provider')?.value || 'openrouter') : '';
                const visibleKeys = group.keys.filter((key) => {
                  if (groupKey !== 'llm' || key === 'llm_provider') return true;
                  if (key.startsWith('openrouter_')) return currentProvider === 'openrouter';
                  return true;
                });
                return (
                  <div key={groupKey} className="bg-gray-800 rounded-xl shadow-sm overflow-hidden">
                    {/* Group Header */}
                    <div className="p-6 border-b border-gray-700">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-primary-500/20 rounded-lg">
                          <Icon className="w-5 h-5 text-primary-400" />
                        </div>
                        <div>
                          <h2 className="text-lg font-semibold text-gray-100">{group.title}</h2>
                          <p className="text-sm text-gray-400">{group.description}</p>
                        </div>
                      </div>
                    </div>

                    {/* Settings List */}
                    <div className="divide-y divide-gray-700">
                      {visibleKeys.map((key) => {
                        const setting = getSettingValue(key);
                        const selectClass = "flex-1 px-3 py-2 border border-gray-600 rounded-lg bg-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-primary-500";

                        return (
                          <div key={key} className="p-6">
                            <div className="flex items-center gap-2 mb-1">
                              <label className="text-sm font-medium text-gray-100">
                                {SETTING_LABELS[key] || key}
                              </label>
                              {setting?.is_secret && (
                                <Lock className="w-3 h-3 text-gray-400" />
                              )}
                            </div>
                            {(SETTING_HELP[key] || setting?.description) && (
                              <p className="text-xs text-gray-400 mb-2">
                                {SETTING_HELP[key] || setting?.description}
                              </p>
                            )}

                            <div className="flex items-center gap-2">
                              {key === 'allow_registration' ? (
                                <select
                                  value={getEditValue(key)}
                                  onChange={(e) => setEditValue(key, e.target.value)}
                                  className={selectClass}
                                >
                                  <option value="true">{t('settings.allowed')}</option>
                                  <option value="false">{t('settings.notAllowed')}</option>
                                </select>
                              ) : key === 'llm_provider' ? (
                                <select
                                  value={getEditValue(key)}
                                  onChange={(e) => setEditValue(key, e.target.value)}
                                  className={selectClass}
                                >
                                  <option value="openrouter">OpenRouter</option>
                                  <option value="ollama">{t('settings.ollamaLocal')}</option>
                                </select>
                              ) : key === 'embedding_provider' ? (
                                <select
                                  value={getEditValue(key)}
                                  onChange={(e) => setEditValue(key, e.target.value)}
                                  className={selectClass}
                                >
                                  <option value="ollama">{t('settings.ollamaLocal')}</option>
                                  <option value="openrouter">OpenRouter</option>
                                </select>
                              ) : (
                                <div className="flex-1 flex items-center gap-2">
                                  <input
                                    type={setting?.is_secret && !showSecrets[key] ? 'password' : 'text'}
                                    value={setting?.is_secret ? (editValues[key] ?? '') : getEditValue(key)}
                                    onChange={(e) => setEditValue(key, e.target.value)}
                                    placeholder={
                                      setting?.is_secret
                                        ? t('settings.enterNewValue')
                                        : SETTING_PLACEHOLDERS[key] || undefined
                                    }
                                    className="flex-1 px-3 py-2 border border-gray-600 rounded-lg bg-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-primary-500 placeholder:text-gray-500"
                                  />
                                  {setting?.is_secret && (
                                    <button
                                      onClick={() => toggleSecretVisibility(key)}
                                      className="p-2 text-gray-400 hover:text-gray-300"
                                    >
                                      {showSecrets[key] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                  )}
                                </div>
                              )}
                              <button
                                onClick={() => handleSave(key)}
                                disabled={updateSettingMutation.isPending || !isChanged(key)}
                                className="p-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                              >
                                <Save className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {/* AI Agent Settings */}
              <div className="bg-gray-800 rounded-xl shadow-sm overflow-hidden">
                <div className="p-6 border-b border-gray-700">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary-500/20 rounded-lg">
                      <Bot className="w-5 h-5 text-primary-400" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-gray-100">{t('settings.agentSettings')}</h2>
                      <p className="text-sm text-gray-400">{t('settings.agentSettingsDesc')}</p>
                    </div>
                    {agentDirty[AGENTS[0].key] && (
                      <span className="px-2 py-0.5 text-xs bg-yellow-500/20 text-yellow-400 rounded-full">
                        {t('settings.changed')}
                      </span>
                    )}
                  </div>
                </div>

                <div className="p-6 space-y-5">
                  {/* System Prompt */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-medium text-gray-400">
                        {t('settings.systemPrompt')}
                      </label>
                      {agentDefaults[AGENTS[0].key] && (
                        <button
                          onClick={() => {
                            handleAgentPromptChange(AGENTS[0].key, agentDefaults[AGENTS[0].key]);
                          }}
                          className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
                        >
                          {t('settings.resetDefault')}
                        </button>
                      )}
                    </div>
                    <textarea
                      value={agentPrompts[AGENTS[0].key] || ''}
                      onChange={(e) => handleAgentPromptChange(AGENTS[0].key, e.target.value)}
                      rows={12}
                      className="w-full px-3 py-2 border border-gray-600 rounded-lg bg-gray-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-y font-mono leading-relaxed"
                    />
                  </div>

                  {/* Tools — loaded from DB tool registry */}
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-3">
                      {t('settings.availableTools')}
                    </label>
                    {toolRegistry ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                        {/* Group by category */}
                        {Array.from(new Set(toolRegistry.map(g => g.category))).map((category) => {
                          const catKey = CATEGORY_I18N_KEY[category];
                          const catLabel = catKey ? t(`category.${catKey}`) : category;
                          return (
                            <div key={category} className="space-y-2">
                              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                                {catLabel}
                              </h4>
                              {toolRegistry
                                .filter(g => g.category === category)
                                .map((group) => {
                                  const groupResolved = t(`group.${group.key}`);
                                  const groupLabel = groupResolved !== `group.${group.key}` ? groupResolved : group.display_name;
                                  return (
                                    <label key={group.key} className="flex items-center gap-2.5 cursor-pointer group">
                                      <input
                                        type="checkbox"
                                        checked={group.enabled}
                                        onChange={() => handleToolGroupToggle(group.key)}
                                        className="toggle-check"
                                      />
                                      <span className="text-sm text-gray-400 group-hover:text-gray-100 select-none">
                                        {groupLabel}
                                      </span>
                                    </label>
                                  );
                                })}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-sm text-gray-500">{t('settings.loadingTools')}</div>
                    )}
                  </div>

                  {/* Save Button */}
                  <div className="flex justify-end">
                    <button
                      onClick={() => handleSaveAgent(AGENTS[0])}
                      disabled={!agentDirty[AGENTS[0].key]}
                      className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                    >
                      <Save className="w-4 h-4" />
                      {t('settings.save')}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
