'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/lib/store';
import { bridgeApi } from '@/lib/api';
import { Sidebar } from '@/components/sidebar';
import { formatDate } from '@/lib/utils';
import {
  Cable, Plus, Play, Trash2, Pencil, X, Loader2,
  CheckCircle2, AlertCircle, Clock, Zap,
  Globe, Mail, FolderOutput, Send,
} from 'lucide-react';
import { useConfirmDialog } from '@/components/confirm-dialog';
import type { BridgeConfig, BridgeSource } from '@/types';

export default function BridgePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading: authLoading } = useAuthStore();
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const [showModal, setShowModal] = useState(false);
  const [editingConfig, setEditingConfig] = useState<BridgeConfig | null>(null);
  const [runningIds, setRunningIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, authLoading, router]);

  const hasRunning = runningIds.size > 0;

  const { data: configs, isLoading } = useQuery({
    queryKey: ['bridge-configs'],
    queryFn: bridgeApi.listConfigs,
    refetchInterval: hasRunning ? 5000 : false,
  });

  const deleteMutation = useMutation({
    mutationFn: bridgeApi.deleteConfig,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bridge-configs'] }),
  });

  const runMutation = useMutation({
    mutationFn: bridgeApi.runConfig,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bridge-configs'] }),
  });

  // Auto-clear runningIds when polled data shows task is no longer running
  useEffect(() => {
    if (!configs || runningIds.size === 0) return;
    const doneIds = new Set<string>();
    for (const id of Array.from(runningIds)) {
      const cfg = configs.find((c) => c.id === id);
      if (cfg && cfg.last_run_status !== 'running') {
        doneIds.add(id);
      }
    }
    if (doneIds.size > 0) {
      setRunningIds((prev) => {
        const next = new Set(prev);
        doneIds.forEach((id) => next.delete(id));
        return next;
      });
    }
  }, [configs, runningIds]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500" />
      </div>
    );
  }

  const handleRun = (id: string) => {
    setRunningIds((prev) => new Set(prev).add(id));
    runMutation.mutate(id);
  };

  const getStatusIcon = (cfg: BridgeConfig) => {
    if (runningIds.has(cfg.id) || cfg.last_run_status === 'running') {
      return <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />;
    }
    if (cfg.last_run_status === 'success') {
      return <CheckCircle2 className="w-4 h-4 text-green-400" />;
    }
    if (cfg.last_run_status === 'no_results') {
      return <AlertCircle className="w-4 h-4 text-yellow-400" />;
    }
    if (cfg.last_run_status === 'failed' || cfg.last_run_status === 'timeout') {
      return <AlertCircle className="w-4 h-4 text-red-400" />;
    }
    return <Clock className="w-4 h-4 text-gray-500" />;
  };

  const getDestIcon = (type: string) => {
    if (type === 'webhook') return <Globe className="w-3.5 h-3.5" />;
    if (type === 'email') return <Mail className="w-3.5 h-3.5" />;
    return <FolderOutput className="w-3.5 h-3.5" />;
  };

  const getDestLabel = (type: string) => {
    if (type === 'webhook') return 'Webhook';
    if (type === 'email') return 'Email';
    return 'Cloud Folder';
  };

  return (
    <div className="flex h-screen bg-surface overflow-hidden">
      <Sidebar />
      <main className="flex-1 p-4 md:p-8 overflow-y-auto">
        <div className="max-w-[96rem] mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <Cable className="w-8 h-8 text-blue-400" />
              <h1 className="text-2xl font-bold text-gray-100">브릿지</h1>
            </div>
            <button
              onClick={() => { setEditingConfig(null); setShowModal(true); }}
              className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors text-sm"
            >
              <Plus className="w-4 h-4" />
              새 브릿지
            </button>
          </div>

          {/* Configs List */}
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-primary-400" />
            </div>
          ) : !configs || configs.length === 0 ? (
            <div className="bg-gray-800 rounded-xl p-12 text-center border border-gray-700">
              <Cable className="w-16 h-16 mx-auto mb-4 text-gray-600" />
              <p className="text-gray-400 text-lg">브릿지 연결이 없습니다</p>
              <p className="text-gray-500 text-sm mt-2">정제된 데이터를 외부로 전달하는 브릿지를 설정해보세요</p>
              <button
                onClick={() => { setEditingConfig(null); setShowModal(true); }}
                className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors text-sm"
              >
                <Plus className="w-4 h-4" />
                새 브릿지
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {configs.map((cfg) => (
                <div
                  key={cfg.id}
                  className="bg-gray-800 rounded-xl border border-gray-700 p-4 hover:border-gray-600 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {getStatusIcon(cfg)}
                        <h3 className="text-sm font-semibold text-gray-100 truncate">{cfg.name}</h3>
                        <span className="flex items-center gap-1 px-2 py-0.5 text-xs bg-gray-700 text-gray-300 rounded-full">
                          {getDestIcon(cfg.destination_type)} {getDestLabel(cfg.destination_type)}
                        </span>
                        {cfg.auto_trigger && (
                          <span className="px-2 py-0.5 text-xs bg-primary-500/10 text-primary-400 rounded-full flex items-center gap-1">
                            <Zap className="w-3 h-3" />
                            자동
                          </span>
                        )}
                        {cfg.last_run_status === 'failed' && cfg.last_run_message && (
                          <span className="px-2 py-0.5 text-xs bg-red-500/10 text-red-400 rounded-full">
                            실패: {cfg.last_run_message}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-xs text-gray-500">
                        {cfg.source_rule_name && (
                          <span>소스: {cfg.source_rule_name}</span>
                        )}
                        <span>전달 {cfg.delivery_count}회</span>
                        {cfg.last_run_at && (
                          <span>최근 {formatDate(cfg.last_run_at)}</span>
                        )}
                        {cfg.last_run_status === 'success' && cfg.last_run_message && (
                          <span className="text-green-400">{cfg.last_run_message}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => handleRun(cfg.id)}
                        disabled={runningIds.has(cfg.id) || cfg.last_run_status === 'running'}
                        className="p-1.5 text-gray-400 hover:text-green-400 hover:bg-green-900/20 rounded transition-colors disabled:opacity-30"
                        title="지금 실행"
                      >
                        {runningIds.has(cfg.id) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={() => { setEditingConfig(cfg); setShowModal(true); }}
                        className="p-1.5 text-gray-400 hover:text-blue-400 hover:bg-blue-900/20 rounded transition-colors"
                        title="수정"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={async () => { if (await confirm('정말 삭제하시겠습니까?')) deleteMutation.mutate(cfg.id); }}
                        disabled={deleteMutation.isPending}
                        className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-900/20 rounded transition-colors"
                        title="삭제"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {showModal && (
        <BridgeModal
          config={editingConfig}
          onClose={() => { setShowModal(false); setEditingConfig(null); }}
        />
      )}
      {ConfirmDialog}
    </div>
  );
}


// ── Create/Edit Modal ──

function BridgeModal({ config, onClose }: { config: BridgeConfig | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const isEdit = !!config;

  const [name, setName] = useState(config?.name || '');
  const [sourceRuleId, setSourceRuleId] = useState(config?.source_rule_id || '');
  const [destType, setDestType] = useState(config?.destination_type || 'webhook');
  const [autoTrigger, setAutoTrigger] = useState(config?.auto_trigger || false);

  // Webhook fields
  const [webhookUrl, setWebhookUrl] = useState(String(config?.destination_config?.url || ''));
  // Email fields
  const [emailTo, setEmailTo] = useState(String(config?.destination_config?.email || ''));
  const [emailSubject, setEmailSubject] = useState(String(config?.destination_config?.subject || ''));

  const { data: sources } = useQuery({
    queryKey: ['bridge-sources'],
    queryFn: bridgeApi.getSources,
  });

  const createMutation = useMutation({
    mutationFn: bridgeApi.createConfig,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bridge-configs'] });
      onClose();
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: Parameters<typeof bridgeApi.updateConfig>[1]) =>
      bridgeApi.updateConfig(config!.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bridge-configs'] });
      onClose();
    },
  });

  const handleSubmit = () => {
    if (!name.trim()) return;

    const destConfig: Record<string, string> = {};
    if (destType === 'webhook') {
      if (!webhookUrl.trim()) return;
      destConfig.url = webhookUrl.trim();
    } else if (destType === 'email') {
      if (!emailTo.trim()) return;
      destConfig.email = emailTo.trim();
      if (emailSubject.trim()) destConfig.subject = emailSubject.trim();
    }

    const payload = {
      name,
      source_rule_id: sourceRuleId || undefined,
      destination_type: destType,
      destination_config: Object.keys(destConfig).length > 0 ? destConfig : undefined,
      auto_trigger: autoTrigger,
    };

    if (isEdit) {
      updateMutation.mutate(payload);
    } else {
      createMutation.mutate(payload);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg shadow-lg border border-gray-700 w-full max-w-[600px] max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700 flex-shrink-0">
          <h3 className="text-lg font-semibold text-gray-100">
            {isEdit ? '브릿지 수정' : '새 브릿지'}
          </h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 p-6 overflow-y-auto space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">브릿지명</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 일일 리포트 전송"
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 text-white placeholder-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          {/* Source Rule */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">소스 (정제 규칙)</label>
            <select
              value={sourceRuleId}
              onChange={(e) => setSourceRuleId(e.target.value)}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">선택하세요</option>
              {sources?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.result_count}건, {s.output_format.toUpperCase()})
                </option>
              ))}
            </select>
          </div>

          {/* Destination Type */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">전달 방식</label>
            <div className="flex gap-2">
              {[
                { key: 'webhook', icon: <Globe className="w-4 h-4" />, label: 'Webhook' },
                { key: 'email', icon: <Mail className="w-4 h-4" />, label: 'Email' },
                { key: 'cloud_folder', icon: <FolderOutput className="w-4 h-4" />, label: 'Cloud Folder' },
              ].map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setDestType(opt.key)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    destType === opt.key
                      ? 'bg-primary-500 text-white'
                      : 'bg-gray-700 text-gray-400 hover:text-gray-200'
                  }`}
                >
                  {opt.icon} {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Destination Config */}
          {destType === 'webhook' && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Webhook URL</label>
              <input
                type="url"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://example.com/webhook"
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 text-white placeholder-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              <p className="text-xs text-gray-500 mt-1">정제 결과가 JSON POST로 전송됩니다</p>
            </div>
          )}

          {destType === 'email' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">받는 사람</label>
                <input
                  type="email"
                  value={emailTo}
                  onChange={(e) => setEmailTo(e.target.value)}
                  placeholder="user@example.com"
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 text-white placeholder-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  제목 <span className="text-gray-500 font-normal">(선택)</span>
                </label>
                <input
                  type="text"
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  placeholder="기본: [Martani] 브릿지 전달: {브릿지명}"
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 text-white placeholder-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
            </>
          )}

          {destType === 'cloud_folder' && (
            <div className="bg-gray-900 rounded-lg border border-gray-700 p-4">
              <div className="flex items-center gap-2 text-sm text-gray-300">
                <FolderOutput className="w-4 h-4 text-blue-400" />
                <span>/AI Workspace/Exports/ 폴더에 자동 저장됩니다</span>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                브릿지 실행 시 정제 결과가 JSON 파일로 클라우드 탐색기의 AI Workspace/Exports 폴더에 저장됩니다
              </p>
            </div>
          )}

          {/* Auto Trigger */}
          <div>
            <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-300">
              <input
                type="checkbox"
                checked={autoTrigger}
                onChange={(e) => setAutoTrigger(e.target.checked)}
                className="rounded border-gray-600 text-primary-500 focus:ring-primary-500 bg-gray-700"
              />
              정제 완료 시 자동 실행
            </label>
            <p className="text-xs text-gray-500 mt-1 ml-6">소스 정제 규칙이 완료되면 자동으로 전달을 시작합니다</p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-700 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-300 border border-gray-600 rounded-lg hover:bg-gray-700 transition-colors"
          >
            취소
          </button>
          <button
            onClick={handleSubmit}
            disabled={isPending || !name.trim()}
            className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            <Send className="w-4 h-4" />
            {isEdit ? '수정' : '등록'}
          </button>
        </div>
      </div>
    </div>
  );
}
