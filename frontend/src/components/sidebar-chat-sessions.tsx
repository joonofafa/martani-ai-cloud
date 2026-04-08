'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/lib/store';
import { chatApi } from '@/lib/api';
import { MessageSquare, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SidebarChatSessionsProps {
  isExpanded: boolean;
}

export function SidebarChatSessions({ isExpanded }: SidebarChatSessionsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuthStore();

  const activeSessionId = searchParams.get('session');

  const { data: sessions, isLoading } = useQuery({
    queryKey: ['chat-sessions'],
    queryFn: chatApi.listSessions,
    enabled: isAuthenticated && isExpanded,
    staleTime: 10000,
  });

  const createSessionMutation = useMutation({
    mutationFn: chatApi.createSession,
    onSuccess: (session) => {
      queryClient.invalidateQueries({ queryKey: ['chat-sessions'] });
      router.push(`/chat?session=${session.id}`);
    },
  });

  const deleteSessionMutation = useMutation({
    mutationFn: chatApi.deleteSession,
    onSuccess: (_, deletedId) => {
      queryClient.invalidateQueries({ queryKey: ['chat-sessions'] });
      if (activeSessionId === deletedId) {
        router.push('/chat');
      }
    },
  });

  if (!isExpanded) return null;

  return (
    <div className="ml-4 mt-1 space-y-0.5">
      {/* New Chat Button */}
      <button
        onClick={() => createSessionMutation.mutate({ title: 'New Chat' })}
        disabled={createSessionMutation.isPending}
        className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-primary-400 hover:bg-gray-800 rounded-lg transition-colors"
      >
        <Plus className="w-3.5 h-3.5" />
        새 대화
      </button>

      {/* Loading */}
      {isLoading && (
        <div className="px-3 py-2">
          <div className="animate-pulse space-y-2">
            <div className="h-3 bg-gray-700 rounded w-3/4"></div>
            <div className="h-3 bg-gray-700 rounded w-1/2"></div>
          </div>
        </div>
      )}

      {/* Session List */}
      {sessions?.slice(0, 20).map((session) => (
        <div
          key={session.id}
          onClick={() => router.push(`/chat?session=${session.id}`)}
          className={cn(
            'group flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs cursor-pointer transition-colors',
            activeSessionId === session.id
              ? 'bg-gray-800 text-primary-400'
              : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
          )}
        >
          <MessageSquare className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="flex-1 truncate">{session.title}</span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              deleteSessionMutation.mutate(session.id);
            }}
            className="opacity-0 group-hover:opacity-100 p-0.5 text-gray-500 hover:text-red-400 transition-all"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      ))}

      {/* Empty state */}
      {!isLoading && sessions?.length === 0 && (
        <p className="px-3 py-2 text-xs text-gray-500">대화 내역이 없습니다</p>
      )}
    </div>
  );
}
