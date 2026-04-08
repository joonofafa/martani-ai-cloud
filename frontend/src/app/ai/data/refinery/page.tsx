'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/lib/store';
import { refineryApi } from '@/lib/api';
import { Sidebar } from '@/components/sidebar';
import { formatDate } from '@/lib/utils';
import {
  Factory, Plus, Play, Trash2, Pencil, X, Loader2,
  CheckCircle2, AlertCircle, Clock, Eye, Zap, FileJson, FileText, BarChart3,
  Database, ChevronRight,
} from 'lucide-react';
import { useConfirmDialog } from '@/components/confirm-dialog';
import type { RefineryRule, RefinerySource, MiningResult } from '@/types';

interface FilterRulesShape {
  include_keywords?: string[];
  exclude_keywords?: string[];
  dedup?: boolean;
}

export default function RefineryPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading: authLoading } = useAuthStore();
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const [showModal, setShowModal] = useState(false);
  const [editingRule, setEditingRule] = useState<RefineryRule | null>(null);
  const [viewingRule, setViewingRule] = useState<string | null>(null);
  const [runningIds, setRunningIds] = useState<Set<string>>(new Set());
  const [previewTaskId, setPreviewTaskId] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, authLoading, router]);

  const hasRunning = runningIds.size > 0;

  const { data: rules, isLoading } = useQuery({
    queryKey: ['refinery-rules'],
    queryFn: refineryApi.listRules,
    refetchInterval: hasRunning ? 5000 : false,
  });

  const { data: sources } = useQuery({
    queryKey: ['refinery-sources'],
    queryFn: refineryApi.getSources,
  });

  const deleteMutation = useMutation({
    mutationFn: refineryApi.deleteRule,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['refinery-rules'] }),
  });

  const runMutation = useMutation({
    mutationFn: refineryApi.runRule,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['refinery-rules'] }),
    onError: (error: Error, ruleId: string) => {
      // Remove from runningIds on error (e.g. "already running" 400)
      setRunningIds((prev) => {
        const next = new Set(prev);
        next.delete(ruleId);
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ['refinery-rules'] });
    },
  });

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500" />
      </div>
    );
  }

  // Auto-clear runningIds when polled data shows task is no longer running
  useEffect(() => {
    if (!rules || runningIds.size === 0) return;
    const doneIds = new Set<string>();
    for (const id of Array.from(runningIds)) {
      const rule = rules.find((r) => r.id === id);
      if (rule && rule.last_run_status !== 'running') {
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
  }, [rules, runningIds]);

  const handleRun = (ruleId: string) => {
    if (runningIds.has(ruleId)) return;
    setRunningIds((prev) => new Set(prev).add(ruleId));
    runMutation.mutate(ruleId);
  };

  const getStatusIcon = (rule: RefineryRule) => {
    if (runningIds.has(rule.id) || rule.last_run_status === 'running') {
      return <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />;
    }
    if (rule.last_run_status === 'success') {
      return <CheckCircle2 className="w-4 h-4 text-green-400" />;
    }
    if (rule.last_run_status === 'no_results') {
      return <span title="정제 결과 없음"><AlertCircle className="w-4 h-4 text-yellow-400" /></span>;
    }
    if (rule.last_run_status === 'failed' || rule.last_run_status === 'timeout') {
      return <AlertCircle className="w-4 h-4 text-red-400" />;
    }
    return <Clock className="w-4 h-4 text-gray-500" />;
  };

  const formatBadge = (fmt: string) => {
    const map: Record<string, { icon: React.ReactNode; label: string }> = {
      json: { icon: <FileJson className="w-3 h-3" />, label: 'JSON' },
      csv: { icon: <BarChart3 className="w-3 h-3" />, label: 'CSV' },
      summary: { icon: <FileText className="w-3 h-3" />, label: '요약' },
    };
    const info = map[fmt] || map.json;
    return (
      <span className="flex items-center gap-1 px-2 py-0.5 text-xs bg-gray-700 text-gray-300 rounded-full">
        {info.icon} {info.label}
      </span>
    );
  };

  const sourcesWithData = sources?.filter((s) => s.result_count > 0) || [];

  return (
    <div className="flex h-screen bg-surface overflow-hidden">
      <Sidebar />
      <main className="flex-1 p-4 md:p-8 overflow-y-auto">
        <div className="max-w-[96rem] mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <Factory className="w-8 h-8 text-orange-400" />
              <h1 className="text-2xl font-bold text-gray-100">정제소</h1>
            </div>
            <button
              onClick={() => { setEditingRule(null); setShowModal(true); }}
              className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors text-sm"
            >
              <Plus className="w-4 h-4" />
              새 규칙
            </button>
          </div>

          {/* Source Data Section */}
          <div className="mb-8">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">수집 데이터</h2>
            {!sources ? (
              <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-gray-500" /></div>
            ) : sourcesWithData.length === 0 ? (
              <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-6 text-center">
                <Database className="w-10 h-10 mx-auto mb-2 text-gray-600" />
                <p className="text-gray-500 text-sm">수집된 데이터가 없습니다</p>
                <p className="text-gray-600 text-xs mt-1">수집소에서 먼저 데이터를 수집하세요</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {sourcesWithData.map((src) => (
                  <button
                    key={src.id}
                    onClick={() => setPreviewTaskId(previewTaskId === src.id ? null : src.id)}
                    className={`text-left bg-gray-800 rounded-lg border p-4 transition-all ${
                      previewTaskId === src.id
                        ? 'border-orange-500/50 shadow-lg shadow-orange-500/5'
                        : 'border-gray-700 hover:border-gray-600'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="text-sm font-medium text-gray-200 truncate">{src.name}</h3>
                      <ChevronRight className={`w-4 h-4 text-gray-500 transition-transform ${previewTaskId === src.id ? 'rotate-90' : ''}`} />
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <Database className="w-3 h-3" />
                        {src.result_count}건
                      </span>
                      {src.last_run_at && (
                        <span>{formatDate(src.last_run_at)}</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Data Preview */}
          {previewTaskId && (
            <div className="mb-8">
              <SourceDataPreview
                taskId={previewTaskId}
                onCreateRule={(taskId) => {
                  setEditingRule(null);
                  setShowModal(true);
                  // Pass the source task ID via a small trick — store it for modal
                  setPreviewTaskId(taskId);
                }}
              />
            </div>
          )}

          {/* Refinery Rules Section */}
          <div>
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">정제 규칙</h2>
            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-primary-400" />
              </div>
            ) : !rules || rules.length === 0 ? (
              <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-6 text-center">
                <Factory className="w-10 h-10 mx-auto mb-2 text-gray-600" />
                <p className="text-gray-500 text-sm">정제 규칙이 없습니다</p>
                <p className="text-gray-600 text-xs mt-1">위 데이터를 선택하고 정제 규칙을 만들어보세요</p>
              </div>
            ) : (
              <div className="space-y-3">
                {rules.map((rule) => (
                  <div
                    key={rule.id}
                    className="bg-gray-800 rounded-xl border border-gray-700 p-4 hover:border-gray-600 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          {getStatusIcon(rule)}
                          <h3 className="text-sm font-semibold text-gray-100 truncate">{rule.name}</h3>
                          {formatBadge(rule.output_format)}
                          {rule.auto_trigger && (
                            <span className="px-2 py-0.5 text-xs bg-primary-500/10 text-primary-400 rounded-full flex items-center gap-1">
                              <Zap className="w-3 h-3" />
                              자동
                            </span>
                          )}
                          {rule.last_run_status === 'failed' && (
                            <span className="px-2 py-0.5 text-xs bg-red-500/10 text-red-400 rounded-full">
                              실패{rule.last_run_message ? `: ${rule.last_run_message}` : ''}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-400 line-clamp-1 mb-1">{rule.prompt}</p>
                        {rule.last_run_message && rule.last_run_status === 'no_results' && (
                          <p className="text-xs text-yellow-500/80 mb-1">{rule.last_run_message}</p>
                        )}
                        <div className="flex items-center gap-4 text-xs text-gray-500">
                          {rule.source_task_name && (
                            <span className="flex items-center gap-1">
                              소스: {rule.source_task_name}
                            </span>
                          )}
                          <span>실행 {rule.run_count}회</span>
                          <span>결과 {rule.result_count}건</span>
                          {rule.last_run_at && (
                            <span>최근 {formatDate(rule.last_run_at)}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={() => handleRun(rule.id)}
                          disabled={runningIds.has(rule.id) || rule.last_run_status === 'running'}
                          className="p-1.5 text-gray-400 hover:text-green-400 hover:bg-green-900/20 rounded transition-colors disabled:opacity-30"
                          title="지금 실행"
                        >
                          {runningIds.has(rule.id) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => setViewingRule(viewingRule === rule.id ? null : rule.id)}
                          className="p-1.5 text-gray-400 hover:text-blue-400 hover:bg-blue-900/20 rounded transition-colors"
                          title="결과 보기"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => { setEditingRule(rule); setShowModal(true); }}
                          className="p-1.5 text-gray-400 hover:text-blue-400 hover:bg-blue-900/20 rounded transition-colors"
                          title="수정"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={async () => { if (await confirm('정말 삭제하시겠습니까?')) deleteMutation.mutate(rule.id); }}
                          disabled={deleteMutation.isPending}
                          className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-900/20 rounded transition-colors"
                          title="삭제"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {viewingRule === rule.id && (
                      <RuleResults ruleId={rule.id} />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      {showModal && (
        <RefineryRuleModal
          rule={editingRule}
          defaultSourceTaskId={previewTaskId}
          onClose={() => { setShowModal(false); setEditingRule(null); }}
        />
      )}
      {ConfirmDialog}
    </div>
  );
}


// ── Source Data Preview ──

function SourceDataPreview({ taskId, onCreateRule }: { taskId: string; onCreateRule: (taskId: string) => void }) {
  const { data: items, isLoading } = useQuery({
    queryKey: ['refinery-source-preview', taskId],
    queryFn: () => refineryApi.previewSource(taskId),
  });

  if (isLoading) {
    return (
      <div className="bg-gray-800 rounded-xl border border-orange-500/30 p-4">
        <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-orange-400" /></div>
      </div>
    );
  }

  if (!items || items.length === 0) {
    return (
      <div className="bg-gray-800 rounded-xl border border-orange-500/30 p-6 text-center">
        <p className="text-gray-500 text-sm">수집 결과가 없습니다</p>
      </div>
    );
  }

  // Detect data fields from first item
  const sampleData = items[0]?.parsed_data;
  const fields = sampleData && typeof sampleData === 'object' ? Object.keys(sampleData) : [];

  return (
    <div className="bg-gray-800 rounded-xl border border-orange-500/30 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 bg-gray-800/80">
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4 text-orange-400" />
          <span className="text-sm font-medium text-gray-200">수집 데이터 미리보기</span>
          <span className="text-xs text-gray-500">({items.length}건)</span>
        </div>
        <button
          onClick={() => onCreateRule(taskId)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500/10 text-orange-400 rounded-lg hover:bg-orange-500/20 transition-colors text-xs font-medium"
        >
          <Factory className="w-3.5 h-3.5" />
          이 데이터로 정제 규칙 만들기
        </button>
      </div>

      {/* Table view if structured data */}
      {fields.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="px-3 py-2 text-left text-gray-500 font-medium">#</th>
                {fields.slice(0, 6).map((f) => (
                  <th key={f} className="px-3 py-2 text-left text-gray-500 font-medium truncate max-w-[200px]">{f}</th>
                ))}
                {fields.length > 6 && (
                  <th className="px-3 py-2 text-left text-gray-600">+{fields.length - 6}</th>
                )}
              </tr>
            </thead>
            <tbody>
              {items.slice(0, 10).map((item, i) => (
                <tr key={item.id} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                  <td className="px-3 py-2 text-gray-600">{i + 1}</td>
                  {fields.slice(0, 6).map((f) => {
                    const val = (item.parsed_data as Record<string, unknown> | null)?.[f];
                    const display = typeof val === 'object' ? JSON.stringify(val) : String(val ?? '');
                    return (
                      <td key={f} className="px-3 py-2 text-gray-300 truncate max-w-[200px]" title={display}>
                        {display}
                      </td>
                    );
                  })}
                  {fields.length > 6 && <td className="px-3 py-2 text-gray-600">...</td>}
                </tr>
              ))}
            </tbody>
          </table>
          {items.length > 10 && (
            <div className="px-3 py-2 text-xs text-gray-600 text-center border-t border-gray-700/50">
              외 {items.length - 10}건 더...
            </div>
          )}
        </div>
      ) : (
        /* Raw text fallback */
        <div className="p-3 space-y-2 max-h-[300px] overflow-y-auto">
          {items.slice(0, 5).map((item) => (
            <div key={item.id} className="bg-gray-900 rounded p-2 text-xs">
              {item.source_url && <div className="text-gray-500 mb-1 truncate">{item.source_url}</div>}
              <pre className="text-gray-300 whitespace-pre-wrap line-clamp-3">
                {item.parsed_data ? JSON.stringify(item.parsed_data, null, 2) : String((item as unknown as Record<string, unknown>).raw_text ?? '')}
              </pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


// ── Rule Results ──

function RuleResults({ ruleId }: { ruleId: string }) {
  const { data: results, isLoading } = useQuery({
    queryKey: ['refinery-results', ruleId],
    queryFn: () => refineryApi.getResults(ruleId),
  });

  if (isLoading) {
    return <div className="mt-3 pt-3 border-t border-gray-700 text-center py-4"><Loader2 className="w-5 h-5 animate-spin text-gray-400 mx-auto" /></div>;
  }

  if (!results || results.length === 0) {
    return <div className="mt-3 pt-3 border-t border-gray-700 text-center py-4 text-sm text-gray-500">아직 정제 결과가 없습니다</div>;
  }

  return (
    <div className="mt-3 pt-3 border-t border-gray-700">
      <div className="text-xs text-gray-400 mb-2">최근 결과 ({results.length}건)</div>
      <div className="space-y-1 max-h-[200px] overflow-y-auto">
        {results.map((r) => (
          <div key={r.id} className="text-xs bg-gray-900 rounded p-2">
            {r.output_text ? (
              <pre className="text-gray-300 whitespace-pre-wrap line-clamp-6">{r.output_text}</pre>
            ) : r.refined_data ? (
              <pre className="text-gray-300 whitespace-pre-wrap line-clamp-6">
                {JSON.stringify(r.refined_data, null, 2)}
              </pre>
            ) : (
              <span className="text-gray-500">데이터 없음</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}


// ── Create/Edit Modal ──

function RefineryRuleModal({ rule, defaultSourceTaskId, onClose }: { rule: RefineryRule | null; defaultSourceTaskId: string | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const isEdit = !!rule;

  const [name, setName] = useState(rule?.name || '');
  const [prompt, setPrompt] = useState(rule?.prompt || '');
  const [sourceTaskId, setSourceTaskId] = useState(rule?.source_task_id || defaultSourceTaskId || '');
  const [outputFormat, setOutputFormat] = useState(rule?.output_format || 'json');
  const [autoTrigger, setAutoTrigger] = useState(rule?.auto_trigger || false);
  const [includeKw, setIncludeKw] = useState<string[]>(
    (rule?.filter_rules as FilterRulesShape | null)?.include_keywords || []
  );
  const [excludeKw, setExcludeKw] = useState<string[]>(
    (rule?.filter_rules as FilterRulesShape | null)?.exclude_keywords || []
  );
  const [dedup, setDedup] = useState((rule?.filter_rules as FilterRulesShape | null)?.dedup || false);
  const [kwInput, setKwInput] = useState('');
  const [exKwInput, setExKwInput] = useState('');

  const { data: sources } = useQuery({
    queryKey: ['refinery-sources'],
    queryFn: refineryApi.getSources,
  });

  // Preview for selected source in modal
  const { data: previewItems } = useQuery({
    queryKey: ['refinery-source-preview', sourceTaskId],
    queryFn: () => refineryApi.previewSource(sourceTaskId, 5),
    enabled: !!sourceTaskId,
  });

  const createMutation = useMutation({
    mutationFn: refineryApi.createRule,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['refinery-rules'] });
      onClose();
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: Parameters<typeof refineryApi.updateRule>[1]) =>
      refineryApi.updateRule(rule!.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['refinery-rules'] });
      onClose();
    },
  });

  const handleSubmit = () => {
    if (!name.trim() || !prompt.trim()) return;

    const filterRules: FilterRulesShape = {};
    if (includeKw.length > 0) filterRules.include_keywords = includeKw;
    if (excludeKw.length > 0) filterRules.exclude_keywords = excludeKw;
    if (dedup) filterRules.dedup = true;

    const payload = {
      name,
      prompt,
      source_task_id: sourceTaskId || undefined,
      output_format: outputFormat,
      auto_trigger: autoTrigger,
      filter_rules: Object.keys(filterRules).length > 0 ? filterRules : undefined,
    };

    if (isEdit) {
      updateMutation.mutate(payload);
    } else {
      createMutation.mutate(payload);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  const addIncludeKw = () => {
    const kw = kwInput.trim();
    if (kw && !includeKw.includes(kw)) setIncludeKw([...includeKw, kw]);
    setKwInput('');
  };

  const addExcludeKw = () => {
    const kw = exKwInput.trim();
    if (kw && !excludeKw.includes(kw)) setExcludeKw([...excludeKw, kw]);
    setExKwInput('');
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg shadow-lg border border-gray-700 w-full max-w-[780px] max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700 flex-shrink-0">
          <h3 className="text-lg font-semibold text-gray-100">
            {isEdit ? '규칙 수정' : '새 정제 규칙'}
          </h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 p-6 overflow-y-auto space-y-4">
          {/* Source Task */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">소스 (수집 작업)</label>
            <select
              value={sourceTaskId}
              onChange={(e) => setSourceTaskId(e.target.value)}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">선택하세요</option>
              {sources?.map((s) => (
                <option key={s.id} value={s.id}>{s.name} ({s.result_count}건)</option>
              ))}
            </select>
          </div>

          {/* Source data preview inside modal */}
          {sourceTaskId && previewItems && previewItems.length > 0 && (
            <div className="bg-gray-900 rounded-lg border border-gray-700 overflow-hidden">
              <div className="px-3 py-2 border-b border-gray-700 flex items-center gap-2">
                <Database className="w-3.5 h-3.5 text-orange-400" />
                <span className="text-xs font-medium text-gray-400">소스 데이터 미리보기 ({previewItems.length}건)</span>
              </div>
              <div className="p-2 max-h-[120px] overflow-y-auto space-y-1">
                {previewItems.map((item: MiningResult, i: number) => (
                  <div key={item.id || i} className="text-xs bg-gray-800 rounded px-2 py-1.5">
                    <pre className="text-gray-300 whitespace-pre-wrap line-clamp-2">
                      {item.parsed_data ? JSON.stringify(item.parsed_data, null, 2) : String((item as unknown as Record<string, unknown>).raw_text ?? '').slice(0, 200)}
                    </pre>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">규칙명</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 채용공고 정제"
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 text-white placeholder-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          {/* Prompt */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">정제 프롬프트</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="AI에게 데이터 정제 방법을 지시하세요 (예: 종목명, 등락률, 핵심 요약만 추출하고 표로 정리해줘)"
              rows={3}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 text-white placeholder-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
            />
          </div>

          {/* Output Format */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">출력 형식</label>
            <div className="flex gap-2">
              {(['json', 'csv', 'summary'] as const).map((fmt) => (
                <button
                  key={fmt}
                  type="button"
                  onClick={() => setOutputFormat(fmt)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    outputFormat === fmt
                      ? 'bg-primary-500 text-white'
                      : 'bg-gray-700 text-gray-400 hover:text-gray-200'
                  }`}
                >
                  {{ json: 'JSON', csv: 'CSV', summary: 'TEXT' }[fmt]}
                </button>
              ))}
            </div>
          </div>

          {/* Filter Rules */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              필터 규칙 <span className="text-gray-500 font-normal">(선택)</span>
            </label>

            <div className="mb-2">
              <div className="flex gap-2 mb-1">
                <input
                  type="text"
                  value={kwInput}
                  onChange={(e) => setKwInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addIncludeKw(); } }}
                  placeholder="포함 키워드"
                  className="flex-1 px-3 py-1.5 bg-gray-700 border border-gray-600 text-white placeholder-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                />
                <button type="button" onClick={addIncludeKw} className="px-3 py-1.5 bg-gray-600 text-gray-300 rounded-lg hover:bg-gray-500 text-sm">추가</button>
              </div>
              {includeKw.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {includeKw.map((kw) => (
                    <span key={kw} className="flex items-center gap-1 px-2 py-0.5 bg-green-500/10 text-green-400 text-xs rounded-full">
                      +{kw}
                      <button onClick={() => setIncludeKw(includeKw.filter((k) => k !== kw))} className="hover:text-green-200"><X className="w-3 h-3" /></button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="mb-2">
              <div className="flex gap-2 mb-1">
                <input
                  type="text"
                  value={exKwInput}
                  onChange={(e) => setExKwInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addExcludeKw(); } }}
                  placeholder="제외 키워드"
                  className="flex-1 px-3 py-1.5 bg-gray-700 border border-gray-600 text-white placeholder-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                />
                <button type="button" onClick={addExcludeKw} className="px-3 py-1.5 bg-gray-600 text-gray-300 rounded-lg hover:bg-gray-500 text-sm">추가</button>
              </div>
              {excludeKw.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {excludeKw.map((kw) => (
                    <span key={kw} className="flex items-center gap-1 px-2 py-0.5 bg-red-500/10 text-red-400 text-xs rounded-full">
                      -{kw}
                      <button onClick={() => setExcludeKw(excludeKw.filter((k) => k !== kw))} className="hover:text-red-200"><X className="w-3 h-3" /></button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-300">
              <input
                type="checkbox"
                checked={dedup}
                onChange={(e) => setDedup(e.target.checked)}
                className="rounded border-gray-600 text-primary-500 focus:ring-primary-500 bg-gray-700"
              />
              중복 제거
            </label>
          </div>

          {/* Auto Trigger */}
          <div>
            <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-300">
              <input
                type="checkbox"
                checked={autoTrigger}
                onChange={(e) => setAutoTrigger(e.target.checked)}
                className="rounded border-gray-600 text-primary-500 focus:ring-primary-500 bg-gray-700"
              />
              수집 완료 시 자동 실행
            </label>
            <p className="text-xs text-gray-500 mt-1 ml-6">소스 수집 작업이 끝나면 자동으로 정제를 시작합니다</p>
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
            disabled={isPending || !name.trim() || !prompt.trim()}
            className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            {isEdit ? '수정' : '등록'}
          </button>
        </div>
      </div>
    </div>
  );
}
