'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/lib/store';
import { chatApi } from '@/lib/api';
import { Bot } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/hooks/use-translation';
import type { AgentType } from '@/types';

interface SidebarAiAgentsProps {
  isExpanded: boolean;
}

export function SidebarAiAgents({ isExpanded }: SidebarAiAgentsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated } = useAuthStore();
  const { t } = useTranslation('common');

  const agents: { type: AgentType; label: string; icon: typeof Bot }[] = [
    { type: 'file-manager', label: t('nav.assistantDesc'), icon: Bot },
  ];

  const activeAgent = searchParams.get('agent');

  const { data: unreadCounts } = useQuery({
    queryKey: ['agent-unread'],
    queryFn: chatApi.getAgentUnread,
    enabled: isAuthenticated && isExpanded,
    refetchInterval: 15000,
    staleTime: 10000,
  });

  if (!isExpanded) return null;

  return (
    <div className="ml-4 mt-1 space-y-0.5">
      {agents.map((agent) => {
        const Icon = agent.icon;
        const unread = unreadCounts?.[agent.type] || 0;
        const isActive = activeAgent === agent.type;

        return (
          <div
            key={agent.type}
            onClick={() => router.push(`/chat?agent=${agent.type}`)}
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs cursor-pointer transition-colors',
              isActive
                ? 'bg-gray-800 text-primary-400'
                : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
            )}
          >
            <Icon className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="flex-1 truncate">{agent.label}</span>
            {unread > 0 && (
              <span className="flex-shrink-0 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold leading-none px-1">
                {unread > 99 ? '99+' : unread}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
