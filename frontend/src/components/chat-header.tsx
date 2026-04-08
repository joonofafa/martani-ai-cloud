'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { chatApi, indexingApi } from '@/lib/api';
import {
  MessageSquare, Search, Plus, Download, X,
  Bot, List, Loader2, Trash2, FolderOpen,
} from 'lucide-react';
import type { AgentType, ChatMessage, ChatSession, IndexCategory } from '@/types';
import { useTranslation } from '@/hooks/use-translation';
import { formatBytes } from '@/lib/utils';
import { pageActionToolbarRowClass } from '@/lib/page-toolbar';
import { useConfirmDialog } from '@/components/confirm-dialog';

/* ─── Agent metadata ─── */
export function useAgentMeta() {
  const { t } = useTranslation('common');
  return {
    'file-manager': { name: t('nav.assistantName'), desc: t('nav.assistantDesc'), color: 'text-orange-500', bgColor: 'bg-orange-500/20', icon: Bot },
  } as Record<AgentType, { name: string; desc: string; color: string; bgColor: string; icon: typeof Bot }>;
}

const CATEGORY_COLORS: Record<string, string> = {
  blue: 'bg-blue-500',
  red: 'bg-red-500',
  green: 'bg-green-500',
  yellow: 'bg-yellow-500',
  purple: 'bg-purple-500',
  pink: 'bg-pink-500',
  orange: 'bg-orange-500',
  teal: 'bg-teal-500',
  gray: 'bg-gray-500',
};

interface ChatHeaderProps {
  agentType: AgentType | null | undefined;
  sessionId: string;
  messages: ChatMessage[];
  searchTerm: string;
  onSearchTermChange: (term: string) => void;
  onSessionChange?: (sessionId: string) => void;
}

export function ChatHeader({
  agentType,
  sessionId,
  messages,
  searchTerm,
  onSearchTermChange,
  onSessionChange,
}: ChatHeaderProps) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [searchOpen, setSearchOpen] = useState(false);
  const [showNewChat, setShowNewChat] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [loadingSessionId, setLoadingSessionId] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { confirm, ConfirmDialog } = useConfirmDialog();

  const agentMeta = useAgentMeta();
  const meta = agentType ? agentMeta[agentType] : null;

  // Fetch categories for new chat modal
  const { data: categories } = useQuery({
    queryKey: ['index-categories'],
    queryFn: indexingApi.listCategories,
    enabled: showNewChat,
  });

  // Fetch session history for history modal
  const { data: allSessions } = useQuery({
    queryKey: ['chat-sessions-history', agentType],
    queryFn: () => chatApi.listSessions(),
    enabled: showHistory,
  });

  const savedSessions = allSessions?.filter(
    (s) => s.agent_type === (agentType || null) && s.id !== sessionId && (s.file_path || (s.message_count ?? 0) > 0 || (s.file_size ?? 0) > 0)
  )?.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()) || [];

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  const toggleSearch = () => {
    if (searchOpen) {
      setSearchOpen(false);
      onSearchTermChange('');
    } else {
      setSearchOpen(true);
    }
  };

  const handleNewChat = async (categoryId?: string) => {
    setShowNewChat(false);
    try {
      // Backend auto-saves active session on create — no need to save here

      if (agentType) {
        // Create new agent session (backend auto-saves old one)
        const newSession = await chatApi.createSession({
          agent_type: agentType,
          category_id: categoryId,
        });
        queryClient.invalidateQueries({ queryKey: ['chat-sessions'] });
        queryClient.invalidateQueries({ queryKey: ['chat-sessions-history'] });
        queryClient.invalidateQueries({ queryKey: ['chat-messages'] });
        queryClient.invalidateQueries({ queryKey: ['chat-session'] });
        router.replace(`/chat?session=${newSession.id}`, { scroll: false });
        onSessionChange?.(newSession.id);
      } else {
        router.replace('/chat');
      }
    } catch { /* ignore */ }
  };

  const handleLoadSession = async (session: ChatSession) => {
    setLoadingSessionId(session.id);
    try {
      // Save current active session
      if (messages.length > 0) {
        await chatApi.saveSession(sessionId);
      }

      // Load the selected session
      await chatApi.loadSession(session.id);
      queryClient.invalidateQueries({ queryKey: ['chat-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['chat-sessions-history'] });
      queryClient.invalidateQueries({ queryKey: ['chat-messages'] });
      queryClient.invalidateQueries({ queryKey: ['chat-session'] });
      router.replace(`/chat?session=${session.id}`, { scroll: false });
      onSessionChange?.(session.id);
      setShowHistory(false);
    } catch {
      /* ignore */
    } finally {
      setLoadingSessionId(null);
    }
  };

  const handleDeleteSession = async (sid: string) => {
    if (!(await confirm('이 대화를 삭제하시겠습니까?'))) return;
    try {
      await chatApi.deleteSession(sid);
      queryClient.invalidateQueries({ queryKey: ['chat-sessions-history'] });
    } catch { /* ignore */ }
  };

  const handleExport = () => {
    const agentName = meta?.name || 'Chat';
    const lines = messages.map((m) => {
      const role = m.role === 'user' ? '나' : agentName;
      const time = new Date(m.created_at).toLocaleString('ko-KR');
      return `**${role}** (${time})\n${m.content}`;
    });
    const md = `# ${agentName} 대화 내보내기\n\n${lines.join('\n\n---\n\n')}`;
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${agentName}-chat-${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      {/* Page header */}
      <div className="flex items-center gap-3 flex-shrink-0">
        <MessageSquare className="w-8 h-8 text-primary-400" />
        <h1 className="text-2xl font-bold text-gray-100">메신저</h1>
      </div>

      {/* Action cards */}
      <div className={pageActionToolbarRowClass}>
        <button
          onClick={() => setShowNewChat(true)}
          className="inline-flex h-[38px] min-h-[38px] max-h-[38px] items-center justify-center gap-2 px-4 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors text-sm font-medium leading-[1] whitespace-nowrap shadow-sm shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">새 대화</span>
        </button>
        <button
          onClick={() => setShowHistory(true)}
          className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-gray-300 hover:text-white border border-gray-700 hover:border-gray-600 rounded-lg transition-colors text-sm font-medium"
        >
          <List className="w-4 h-4" />
          <span className="hidden sm:inline">대화 목록</span>
        </button>
        <button
          onClick={toggleSearch}
          className={`flex items-center gap-2 px-4 py-2 border rounded-lg transition-colors text-sm font-medium ${
            searchOpen
              ? 'bg-primary-500/10 border-primary-500/50 text-primary-400'
              : 'bg-gray-800 border-gray-700 text-gray-300 hover:text-white hover:border-gray-600'
          }`}
        >
          <Search className="w-4 h-4" />
          <span className="hidden sm:inline">검색</span>
        </button>
        <button
          onClick={handleExport}
          disabled={!messages || messages.length === 0}
          className="flex items-center gap-2 px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg hover:border-gray-600 transition-colors text-sm font-medium text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Download className="w-4 h-4" />
          <span className="hidden sm:inline">내보내기</span>
        </button>
      </div>

      {/* Inline search bar */}
      {searchOpen && (
        <div className="flex items-center gap-2 mb-4 flex-shrink-0">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchTerm}
              onChange={(e) => onSearchTermChange(e.target.value)}
              placeholder="대화 검색..."
              className="w-full pl-9 pr-3 py-2 text-sm bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-primary-500/50"
            />
          </div>
          <button onClick={toggleSearch} className="p-1.5 text-gray-400 hover:text-gray-200 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* New Chat modal — category selection */}
      {showNewChat && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-gray-800 rounded-xl border border-gray-700 p-6 max-w-sm w-full mx-4 shadow-2xl">
            <h3 className="text-lg font-semibold text-gray-100 mb-1">새 대화 시작</h3>
            <p className="text-sm text-gray-400 mb-4">
              {categories && categories.length > 0
                ? '카테고리를 선택하면 해당 파일들로 검색 범위가 제한됩니다.'
                : '현재 대화를 저장하고 새 대화를 시작합니다.'}
            </p>

            {categories && categories.length > 0 && (
              <div className="space-y-1.5 mb-4 max-h-[240px] overflow-y-auto">
                <button
                  onClick={() => handleNewChat()}
                  className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-left bg-gray-900 hover:bg-gray-700 border border-gray-700 transition-colors"
                >
                  <FolderOpen className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-200">전체 (카테고리 없음)</span>
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => handleNewChat(cat.id)}
                    className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-left bg-gray-900 hover:bg-gray-700 border border-gray-700 transition-colors"
                  >
                    <span className={`w-3 h-3 rounded-full flex-shrink-0 ${CATEGORY_COLORS[cat.color] || 'bg-blue-500'}`} />
                    <span className="text-gray-200 flex-1">{cat.name}</span>
                    <span className="text-xs text-gray-500">{cat.file_count}개 파일</span>
                  </button>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowNewChat(false)}
                className="px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 rounded-lg transition-colors"
              >
                취소
              </button>
              {(!categories || categories.length === 0) && (
                <button
                  onClick={() => handleNewChat()}
                  className="px-4 py-2 text-sm bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors"
                >
                  시작
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Chat History modal */}
      {showHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-gray-800 rounded-xl border border-gray-700 p-6 max-w-md w-full mx-4 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-100">대화 목록</h3>
              <button onClick={() => setShowHistory(false)} className="p-1 text-gray-400 hover:text-gray-200">
                <X className="w-5 h-5" />
              </button>
            </div>

            {savedSessions.length === 0 ? (
              <p className="text-sm text-gray-400 py-8 text-center">저장된 대화가 없습니다</p>
            ) : (
              <div className="space-y-1.5 max-h-[360px] overflow-y-auto">
                {savedSessions.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-gray-900 border border-gray-700 hover:bg-gray-700 transition-colors group"
                  >
                    <button
                      onClick={() => handleLoadSession(s)}
                      disabled={loadingSessionId === s.id}
                      className="flex-1 min-w-0 text-left"
                    >
                      <div className="flex items-center gap-2">
                        {s.category_name && (
                          <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${CATEGORY_COLORS[s.category_name] || 'bg-blue-500'}`} />
                        )}
                        <span className="text-sm text-gray-200 truncate">
                          {loadingSessionId === s.id ? (
                            <span className="flex items-center gap-2">
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              불러오는 중...
                            </span>
                          ) : (
                            s.title || '제목 없음'
                          )}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-xs text-gray-500">
                          {new Date(s.updated_at).toLocaleDateString('ko-KR')}
                        </span>
                        {s.category_name && (
                          <span className="text-xs text-gray-500">{s.category_name}</span>
                        )}
                        {(s.file_size ?? 0) > 0 && (
                          <span className="text-xs text-gray-500">{formatBytes(s.file_size!)}</span>
                        )}
                      </div>
                    </button>
                    <button
                      onClick={() => handleDeleteSession(s.id)}
                      className="p-1.5 text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                      title="삭제"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      {ConfirmDialog}
    </>
  );
}
