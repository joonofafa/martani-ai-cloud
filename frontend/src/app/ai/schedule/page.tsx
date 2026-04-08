'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/lib/store';
import { pipelineApi } from '@/lib/api';
import { Sidebar } from '@/components/sidebar';
import {
  Clock, Plus, Loader2, CheckCircle2, AlertCircle,
  Play, Pause, Trash2, Pencil, X, Workflow,
  Search, Factory, Cable, ChevronDown,
} from 'lucide-react';
import { useConfirmDialog } from '@/components/confirm-dialog';
import type { PipelineItem } from '@/types';

// ═══════════════════════════════════════════
// Cron presets
// ═══════════════════════════════════════════

const CRON_PRESETS = [
  { label: '매 시간', cron: '0 * * * *' },
  { label: '매 3시간', cron: '0 */3 * * *' },
  { label: '매 6시간', cron: '0 */6 * * *' },
  { label: '매일 오전 9시', cron: '0 9 * * *' },
  { label: '매일 오후 6시', cron: '0 18 * * *' },
  { label: '매주 월요일 오전 9시', cron: '0 9 * * 1' },
  { label: '매월 1일 오전 9시', cron: '0 9 1 * *' },
] as const;

function describeCron(cron: string): string {
  const presetMatch = CRON_PRESETS.find((p) => p.cron === cron);
  if (presetMatch) return presetMatch.label;

  const parts = cron.split(' ');
  if (parts.length !== 5) return cron;
  const [min, hour, dom, mon, dow] = parts;

  if (min === '0' && hour === '*') return '매 시간';
  if (min === '0' && hour.startsWith('*/')) return `매 ${hour.slice(2)}시간`;
  if (min === '0' && dom === '*' && mon === '*' && dow === '*') return `매일 ${hour}시`;
  if (min === '0' && dom === '*' && mon === '*' && dow !== '*') {
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    return `매주 ${days[parseInt(dow)] || dow}요일 ${hour}시`;
  }
  if (min === '0' && dom !== '*' && mon === '*' && dow === '*') return `매월 ${dom}일 ${hour}시`;
  return cron;
}

// ═══════════════════════════════════════════
// Twinkle effect (same as mining/chat)
// ═══════════════════════════════════════════

function GridTwinkle() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let animId: number;
    const GAP = 20, MAX_DOTS = 12, DOT_LIFETIME = [1500, 3500];
    interface Dot { x: number; y: number; born: number; life: number; maxR: number }
    let dots: Dot[] = [];
    const resize = () => { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight; };
    resize();
    const ro = new ResizeObserver(resize); ro.observe(canvas);
    const spawnDot = () => {
      const cols = Math.floor(canvas.width / GAP), rows = Math.floor(canvas.height / GAP);
      if (cols < 1 || rows < 1) return;
      dots.push({ x: Math.floor(Math.random() * cols) * GAP, y: Math.floor(Math.random() * rows) * GAP, born: performance.now(), life: DOT_LIFETIME[0] + Math.random() * (DOT_LIFETIME[1] - DOT_LIFETIME[0]), maxR: 1.5 + Math.random() * 1.5 });
    };
    for (let i = 0; i < 6; i++) spawnDot();
    const spawnInterval = setInterval(() => { if (dots.length < MAX_DOTS) spawnDot(); }, 400);
    const draw = (now: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      dots = dots.filter((d) => now - d.born < d.life);
      for (const d of dots) {
        const t = (now - d.born) / d.life;
        const alpha = t < 0.3 ? t / 0.3 : (1 - t) / 0.7;
        const r = d.maxR * (0.6 + 0.4 * Math.sin(t * Math.PI));
        ctx.beginPath(); ctx.arc(d.x, d.y, r, 0, Math.PI * 2); ctx.fillStyle = `rgba(251, 146, 60, ${alpha * 0.8})`; ctx.fill();
        ctx.beginPath(); ctx.arc(d.x, d.y, r * 3, 0, Math.PI * 2);
        const grad = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, r * 3);
        grad.addColorStop(0, `rgba(251, 146, 60, ${alpha * 0.25})`); grad.addColorStop(1, 'rgba(251, 146, 60, 0)');
        ctx.fillStyle = grad; ctx.fill();
      }
      animId = requestAnimationFrame(draw);
    };
    animId = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(animId); clearInterval(spawnInterval); ro.disconnect(); };
  }, []);
  return <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none z-[1]" style={{ width: '100%', height: '100%' }} />;
}

// ═══════════════════════════════════════════
// Schedule Editor Dialog
// ═══════════════════════════════════════════

function ScheduleDialog({
  pipeline,
  onSave,
  onClose,
}: {
  pipeline: PipelineItem;
  onSave: (id: string, cron: string | null) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<'preset' | 'custom'>(pipeline.schedule_cron && !CRON_PRESETS.find(p => p.cron === pipeline.schedule_cron) ? 'custom' : 'preset');
  const [selectedPreset, setSelectedPreset] = useState(pipeline.schedule_cron || '');
  const [customCron, setCustomCron] = useState(pipeline.schedule_cron || '');

  const currentCron = mode === 'preset' ? selectedPreset : customCron;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-gray-800 border border-gray-700 rounded-xl shadow-2xl w-[440px] overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-700">
          <h3 className="text-base font-semibold text-gray-100">스케줄 설정</h3>
          <p className="text-xs text-gray-500 mt-1">{pipeline.name}</p>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Mode toggle */}
          <div className="flex items-center bg-gray-900 rounded-lg p-0.5">
            <button
              onClick={() => setMode('preset')}
              className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-colors ${mode === 'preset' ? 'bg-gray-700 text-white' : 'text-gray-500'}`}
            >
              프리셋
            </button>
            <button
              onClick={() => setMode('custom')}
              className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-colors ${mode === 'custom' ? 'bg-gray-700 text-white' : 'text-gray-500'}`}
            >
              커스텀 (Cron)
            </button>
          </div>

          {mode === 'preset' ? (
            <div className="space-y-1.5 max-h-[240px] overflow-y-auto">
              {CRON_PRESETS.map((preset) => (
                <button
                  key={preset.cron}
                  onClick={() => setSelectedPreset(preset.cron)}
                  className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-left transition-colors ${
                    selectedPreset === preset.cron
                      ? 'bg-primary-500/15 border border-primary-500/30 text-primary-300'
                      : 'bg-gray-900 border border-gray-700 text-gray-300 hover:bg-gray-700'
                  }`}
                >
                  <Clock className="w-4 h-4 flex-shrink-0" />
                  <span>{preset.label}</span>
                  <span className="ml-auto text-xs text-gray-500 font-mono">{preset.cron}</span>
                </button>
              ))}
            </div>
          ) : (
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Cron 표현식</label>
              <input
                type="text"
                value={customCron}
                onChange={(e) => setCustomCron(e.target.value)}
                placeholder="분 시 일 월 요일 (예: 0 9 * * *)"
                className="w-full px-3 py-2.5 bg-gray-900 border border-gray-700 text-white rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              <p className="text-xs text-gray-600 mt-1.5">예: 0 */6 * * * (매 6시간), 30 8 * * 1-5 (평일 8:30)</p>
            </div>
          )}

          {currentCron && (
            <div className="flex items-center gap-2 px-3 py-2 bg-primary-500/10 border border-primary-500/20 rounded-lg">
              <Clock className="w-3.5 h-3.5 text-primary-400" />
              <span className="text-xs text-primary-300">{describeCron(currentCron)}</span>
              <span className="text-xs text-gray-500 font-mono ml-auto">{currentCron}</span>
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-gray-700 flex justify-between">
          <button
            onClick={() => onSave(pipeline.id, null)}
            className="px-4 py-2 text-sm text-red-400 hover:text-red-300 rounded-lg transition-colors"
          >
            스케줄 해제
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 rounded-lg transition-colors">취소</button>
            <button
              onClick={() => onSave(pipeline.id, currentCron || null)}
              disabled={!currentCron}
              className="px-4 py-2 bg-primary-500 hover:bg-primary-400 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
            >
              저장
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// Main Schedule Page
// ═══════════════════════════════════════════

export default function SchedulePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading: authLoading } = useAuthStore();
  const { confirm, ConfirmDialog } = useConfirmDialog();

  const [editingPipeline, setEditingPipeline] = useState<PipelineItem | null>(null);
  const [filter, setFilter] = useState<'all' | 'scheduled' | 'unscheduled'>('all');

  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.push('/login');
  }, [isAuthenticated, authLoading, router]);

  const { data: pipelines, isLoading } = useQuery({
    queryKey: ['pipelines'],
    queryFn: pipelineApi.list,
  });

  const filteredPipelines = pipelines?.filter((p) => {
    if (filter === 'scheduled') return !!p.schedule_cron;
    if (filter === 'unscheduled') return !p.schedule_cron;
    return true;
  }) || [];

  const scheduledCount = pipelines?.filter((p) => p.schedule_cron).length || 0;

  const handleSaveSchedule = useCallback(async (id: string, cron: string | null) => {
    setEditingPipeline(null);
    try {
      await pipelineApi.update(id, { schedule_cron: cron, status: cron ? 'active' : 'inactive' });
      queryClient.invalidateQueries({ queryKey: ['pipelines'] });
    } catch { /* noop */ }
  }, [queryClient]);

  const handleToggleActive = useCallback(async (p: PipelineItem) => {
    const newStatus = p.status === 'active' ? 'inactive' : 'active';
    try {
      await pipelineApi.update(p.id, { status: newStatus });
      queryClient.invalidateQueries({ queryKey: ['pipelines'] });
    } catch { /* noop */ }
  }, [queryClient]);

  const handleDelete = useCallback(async (id: string) => {
    if (!(await confirm('이 작업자를 삭제하시겠습니까?'))) return;
    try {
      await pipelineApi.delete(id);
      queryClient.invalidateQueries({ queryKey: ['pipelines'] });
    } catch { /* noop */ }
  }, [queryClient, confirm]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500" />
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-surface overflow-hidden">
      <Sidebar />
      <main className="flex-1 p-4 md:p-8 overflow-hidden">
        <div className="max-w-[96rem] mx-auto h-full flex flex-col">
          {/* Header */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <Clock className="w-8 h-8 text-primary-400" />
            <h1 className="text-2xl font-bold text-gray-100">스케줄</h1>
          </div>

          {/* Toolbar */}
          <div className="flex items-center gap-2 mt-4 mb-4 flex-shrink-0">
            {/* Filter */}
            <div className="flex items-center bg-gray-800 rounded-lg border border-gray-700 p-0.5">
              {(['all', 'scheduled', 'unscheduled'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    filter === f ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  {{ all: '전체', scheduled: '스케줄 설정됨', unscheduled: '미설정' }[f]}
                </button>
              ))}
            </div>
            {scheduledCount > 0 && (
              <span className="text-xs text-gray-500 ml-2">{scheduledCount}개 스케줄 활성</span>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-h-0">
            {isLoading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="w-8 h-8 animate-spin text-gray-500" />
              </div>
            ) : !pipelines || pipelines.length === 0 ? (
              /* Empty state */
              <div className="h-full flex flex-col bg-gray-950 rounded-xl border border-gray-700 overflow-hidden relative">
                <GridTwinkle />
                <div className="flex-1 flex items-center justify-center relative z-10">
                  <div className="text-center space-y-5">
                    <div className="w-16 h-16 rounded-2xl bg-orange-500/10 flex items-center justify-center mx-auto">
                      <Clock className="w-8 h-8 text-orange-400" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-gray-200">스케줄을 설정하세요</h3>
                      <p className="text-sm text-gray-500 mt-1">마이닝에서 작업자를 먼저 만든 후, 여기서 반복 실행 스케줄을 설정할 수 있습니다.</p>
                    </div>
                    <button
                      onClick={() => router.push('/ai/data/mining')}
                      className="inline-flex items-center gap-2 px-5 py-2.5 bg-orange-500 hover:bg-orange-400 text-white rounded-lg text-sm font-medium transition-colors shadow-lg shadow-orange-500/20"
                    >
                      <Workflow className="w-4 h-4" />
                      마이닝으로 이동
                    </button>
                  </div>
                </div>
              </div>
            ) : filteredPipelines.length === 0 ? (
              <div className="flex items-center justify-center h-64">
                <p className="text-gray-500 text-sm">
                  {filter === 'scheduled' ? '스케줄이 설정된 작업자가 없습니다.' : '스케줄이 미설정된 작업자가 없습니다.'}
                </p>
              </div>
            ) : (
              /* Pipeline list */
              <div className="space-y-2 overflow-y-auto max-h-full pb-4">
                {filteredPipelines.map((p) => (
                  <div
                    key={p.id}
                    className="bg-gray-800 rounded-xl border border-gray-700 hover:border-gray-600 transition-colors overflow-hidden"
                  >
                    <div className="px-3 sm:px-5 py-3 sm:py-4">
                      {/* Top row: name + status + actions */}
                      <div className="flex items-center gap-2 sm:gap-3">
                        <Workflow className={`w-4 sm:w-5 h-4 sm:h-5 flex-shrink-0 ${p.schedule_cron ? 'text-primary-400' : 'text-gray-500'}`} />
                        <h3 className="text-sm font-semibold text-gray-200 truncate">{p.name}</h3>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium flex-shrink-0 ${
                          p.status === 'active' ? 'bg-green-500/10 text-green-400' : 'bg-gray-700 text-gray-400'
                        }`}>
                          {p.status === 'active' ? '활성' : '비활성'}
                        </span>
                        <div className="flex items-center gap-0.5 ml-auto flex-shrink-0">
                          {p.schedule_cron && (
                            <button
                              onClick={() => handleToggleActive(p)}
                              className={`p-1.5 sm:p-2 rounded-lg transition-colors ${
                                p.status === 'active'
                                  ? 'text-green-400 hover:bg-green-500/10'
                                  : 'text-gray-500 hover:bg-gray-700'
                              }`}
                              title={p.status === 'active' ? '일시정지' : '활성화'}
                            >
                              {p.status === 'active' ? <Pause className="w-3.5 sm:w-4 h-3.5 sm:h-4" /> : <Play className="w-3.5 sm:w-4 h-3.5 sm:h-4" />}
                            </button>
                          )}
                          <button
                            onClick={() => setEditingPipeline(p)}
                            className="p-1.5 sm:p-2 text-gray-400 hover:text-primary-400 hover:bg-gray-700 rounded-lg transition-colors"
                            title="스케줄 설정"
                          >
                            <Clock className="w-3.5 sm:w-4 h-3.5 sm:h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(p.id)}
                            className="p-1.5 sm:p-2 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                            title="삭제"
                          >
                            <Trash2 className="w-3.5 sm:w-4 h-3.5 sm:h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Bottom row: schedule + stage info */}
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 pl-6 sm:pl-8">
                        {p.schedule_cron ? (
                          <span className="flex items-center gap-1.5 text-xs text-primary-400">
                            <Clock className="w-3 h-3 flex-shrink-0" />
                            {describeCron(p.schedule_cron)}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-600">스케줄 미설정</span>
                        )}
                        {p.mining_task_name && (
                          <span className="flex items-center gap-1 text-xs text-gray-500 truncate max-w-[160px] sm:max-w-none">
                            <Search className="w-3 h-3 flex-shrink-0" /> {p.mining_task_name}
                          </span>
                        )}
                        {p.refinery_rule_name && (
                          <span className="flex items-center gap-1 text-xs text-gray-500 truncate max-w-[160px] sm:max-w-none">
                            <Factory className="w-3 h-3 flex-shrink-0" /> {p.refinery_rule_name}
                          </span>
                        )}
                        {p.bridge_config_name && (
                          <span className="flex items-center gap-1 text-xs text-gray-500 truncate max-w-[160px] sm:max-w-none">
                            <Cable className="w-3 h-3 flex-shrink-0" /> {p.bridge_config_name}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Schedule editor dialog */}
      {editingPipeline && (
        <ScheduleDialog
          pipeline={editingPipeline}
          onSave={handleSaveSchedule}
          onClose={() => setEditingPipeline(null)}
        />
      )}

      {ConfirmDialog}
    </div>
  );
}
