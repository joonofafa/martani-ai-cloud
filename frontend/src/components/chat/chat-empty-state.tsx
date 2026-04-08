'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { chatApi, indexingApi } from '@/lib/api';
import { useConfirmDialog } from '@/components/confirm-dialog';
import { MartaniLogo } from '@/components/martani-logo';
import { FolderOpen, X, Loader2, Plus, MessageSquare, List, Trash2 as Trash2Icon } from 'lucide-react';

/* ─── ChatTwinkle animation ─── */
export function ChatTwinkle() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    const GAP = 20;
    const MAX_DOTS = 12;
    const DOT_LIFETIME = [1500, 3500];

    interface Dot { x: number; y: number; born: number; life: number; maxR: number }
    let dots: Dot[] = [];

    const resize = () => { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight; };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const spawnDot = () => {
      const cols = Math.floor(canvas.width / GAP);
      const rows = Math.floor(canvas.height / GAP);
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

/* ─── Empty state (no session selected) ─── */
export function ChatEmptyState() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { confirm, ConfirmDialog } = useConfirmDialog();

  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [showEmptyHistory, setShowEmptyHistory] = useState(false);
  const [emptyStarting, setEmptyStarting] = useState(false);
  const [emptyLoadingId, setEmptyLoadingId] = useState<string | null>(null);

  const { data: emptyCategories } = useQuery({
    queryKey: ['index-categories'],
    queryFn: indexingApi.listCategories,
    enabled: showNewChatModal,
  });

  const { data: emptyAllSessions } = useQuery({
    queryKey: ['chat-sessions-history', 'file-manager'],
    queryFn: () => chatApi.listSessions(),
    enabled: showEmptyHistory,
  });

  const emptySavedSessions = emptyAllSessions?.filter(
    (s) => s.agent_type === 'file-manager' && ((s.message_count ?? 0) > 0 || (s.file_size ?? 0) > 0)
  )?.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()) || [];

  const handleEmptyLoadSession = useCallback(async (sessionId: string) => {
    setEmptyLoadingId(sessionId);
    try {
      await chatApi.loadSession(sessionId);
      queryClient.invalidateQueries({ queryKey: ['chat-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['chat-messages'] });
      queryClient.invalidateQueries({ queryKey: ['chat-session'] });
      router.replace(`/chat?session=${sessionId}`, { scroll: false });
      setShowEmptyHistory(false);
    } catch { /* ignore */ } finally {
      setEmptyLoadingId(null);
    }
  }, [queryClient, router]);

  const handleEmptyDeleteSession = useCallback(async (sessionId: string) => {
    if (!(await confirm('이 대화를 삭제하시겠습니까?'))) return;
    try {
      await chatApi.deleteSession(sessionId);
      queryClient.invalidateQueries({ queryKey: ['chat-sessions-history'] });
    } catch { /* ignore */ }
  }, [queryClient, confirm]);

  const handleEmptyNewChat = useCallback(async (categoryId?: string) => {
    setShowNewChatModal(false);
    setEmptyStarting(true);
    try {
      const session = await chatApi.getAgentSession('file-manager');
      if (categoryId) {
        const newSession = await chatApi.createSession({ agent_type: 'file-manager', category_id: categoryId });
        queryClient.invalidateQueries({ queryKey: ['chat-sessions'] });
        queryClient.invalidateQueries({ queryKey: ['agent-unread'] });
        router.replace(`/chat?session=${newSession.id}`, { scroll: false });
      } else {
        queryClient.invalidateQueries({ queryKey: ['agent-unread'] });
        router.replace(`/chat?session=${session.id}`, { scroll: false });
      }
    } catch {
      setEmptyStarting(false);
    }
  }, [queryClient, router]);

  return (
    <>
      {/* Page header */}
      <div className="flex items-center gap-3 mb-6 flex-shrink-0">
        <MessageSquare className="w-8 h-8 text-primary-400" />
        <h1 className="text-2xl font-bold text-gray-100">메신저</h1>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-1.5 sm:gap-2 mb-3 flex-shrink-0 flex-wrap">
        <button
          onClick={() => setShowNewChatModal(true)}
          disabled={emptyStarting}
          className="flex items-center gap-1.5 px-2.5 sm:px-4 py-1.5 sm:py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors text-xs sm:text-sm font-medium shadow-sm"
        >
          {emptyStarting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          새 대화
        </button>
        <button
          onClick={() => setShowEmptyHistory(true)}
          className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-1.5 sm:py-2 bg-gray-800 text-gray-300 hover:text-white border border-gray-700 hover:border-gray-600 rounded-lg transition-colors text-xs sm:text-sm font-medium"
        >
          <List className="w-4 h-4" />
          대화 목록
        </button>
      </div>

      {/* Dark card */}
      <div className="flex-1 flex flex-col bg-gray-950 rounded-xl border border-gray-700 overflow-hidden relative min-h-0">
        <ChatTwinkle />
        <div className="flex-1 flex items-center justify-center relative z-10">
          <div className="text-center space-y-5 max-w-md w-full px-4">
            <div className="w-16 h-16 rounded-2xl bg-orange-500/10 flex items-center justify-center mx-auto">
              <MartaniLogo size={32} />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-200">마티니와 대화를 시작하세요</h3>
              <p className="text-sm text-gray-500 mt-1.5 leading-relaxed">전체 파일들 또는 사용자가 카테고리로 분류된 파일들을<br />참조하여 답변합니다.</p>
            </div>
            <button
              onClick={() => setShowNewChatModal(true)}
              disabled={emptyStarting}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors shadow-lg shadow-orange-500/20"
            >
              {emptyStarting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              새 대화 시작하기
            </button>
          </div>
        </div>
      </div>

      {/* Category selection modal */}
      {showNewChatModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-800 rounded-xl border border-gray-700 p-6 max-w-sm w-full mx-4 shadow-2xl">
            <h3 className="text-lg font-semibold text-gray-100 mb-1">새 대화 시작</h3>
            <p className="text-sm text-gray-400 mb-4">
              {emptyCategories && emptyCategories.length > 0
                ? '카테고리를 선택하면 해당 파일들로 검색 범위가 제한됩니다.'
                : '마티니와 새 대화를 시작합니다.'}
            </p>

            <div className="space-y-1.5 mb-4 max-h-[240px] overflow-y-auto">
              <button
                onClick={() => handleEmptyNewChat()}
                className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-left bg-gray-900 hover:bg-gray-700 border border-gray-700 transition-colors"
              >
                <FolderOpen className="w-4 h-4 text-gray-400" />
                <span className="text-gray-200">전체 (카테고리 없음)</span>
              </button>
              {emptyCategories?.map((cat) => {
                const colorMap: Record<string, string> = { blue: 'bg-blue-500', red: 'bg-red-500', green: 'bg-green-500', yellow: 'bg-yellow-500', purple: 'bg-purple-500', orange: 'bg-orange-500', pink: 'bg-pink-500', gray: 'bg-gray-500' };
                return (
                  <button
                    key={cat.id}
                    onClick={() => handleEmptyNewChat(cat.id)}
                    className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-left bg-gray-900 hover:bg-gray-700 border border-gray-700 transition-colors"
                  >
                    <span className={`w-3 h-3 rounded-full flex-shrink-0 ${colorMap[cat.color] || 'bg-blue-500'}`} />
                    <span className="text-gray-200 flex-1">{cat.name}</span>
                    <span className="text-xs text-gray-500">{cat.file_count}개 파일</span>
                  </button>
                );
              })}
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setShowNewChatModal(false)}
                className="px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 rounded-lg transition-colors"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      {/* History modal */}
      {showEmptyHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-800 rounded-xl border border-gray-700 p-6 max-w-md w-full mx-4 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-100">대화 목록</h3>
              <button onClick={() => setShowEmptyHistory(false)} className="p-1 text-gray-400 hover:text-gray-200">
                <X className="w-5 h-5" />
              </button>
            </div>

            {emptySavedSessions.length === 0 ? (
              <p className="text-sm text-gray-400 py-8 text-center">저장된 대화가 없습니다</p>
            ) : (
              <div className="space-y-1.5 max-h-[360px] overflow-y-auto">
                {emptySavedSessions.map((s) => {
                  const colorMap: Record<string, string> = { blue: 'bg-blue-500', red: 'bg-red-500', green: 'bg-green-500', yellow: 'bg-yellow-500', purple: 'bg-purple-500', orange: 'bg-orange-500', pink: 'bg-pink-500', gray: 'bg-gray-500' };
                  return (
                    <div key={s.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-gray-900 border border-gray-700 hover:bg-gray-700 transition-colors group">
                      <button
                        onClick={() => handleEmptyLoadSession(s.id)}
                        disabled={emptyLoadingId === s.id}
                        className="flex-1 min-w-0 text-left"
                      >
                        <div className="flex items-center gap-2">
                          {s.category_name && (
                            <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${colorMap[s.category_name] || 'bg-blue-500'}`} />
                          )}
                          <span className="text-sm text-gray-200 truncate">
                            {emptyLoadingId === s.id ? (
                              <span className="flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" />불러오는 중...</span>
                            ) : (
                              s.title || '제목 없음'
                            )}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="text-xs text-gray-500">{new Date(s.updated_at).toLocaleDateString('ko-KR')}</span>
                          {s.category_name && <span className="text-xs text-gray-500">{s.category_name}</span>}
                        </div>
                      </button>
                      <button
                        onClick={() => handleEmptyDeleteSession(s.id)}
                        className="p-1.5 text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                        title="삭제"
                      >
                        <Trash2Icon className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {ConfirmDialog}
    </>
  );
}
