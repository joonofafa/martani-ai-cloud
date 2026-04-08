'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { useAuthStore, useAiProcessingStore } from '@/lib/store';
import { getFreshToken } from '@/lib/api';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

export interface AgentNotification {
  type: 'notification';
  source: 'schedule' | 'trigger' | 'collection' | 'messenger';
  name: string;
  status: string;
  session_id: string | null;
  timestamp: string;
}

export interface AiStatusEvent {
  type: 'ai_status';
  status: 'done' | 'error';
  session_id: string;
}

export function useNotifications(onNotification?: (n: AgentNotification) => void) {
  const { user } = useAuthStore();
  const wsRef = useRef<WebSocket | null>(null);
  const [notifications, setNotifications] = useState<AgentNotification[]>([]);
  const reconnectTimeout = useRef<ReturnType<typeof setTimeout>>();
  const failCount = useRef(0);

  const connect = useCallback(async () => {
    if (!user) return;

    const token = await getFreshToken();
    if (!token) {
      // Token refresh failed — don't spam reconnects
      failCount.current++;
      const delay = Math.min(30000, 10000 * failCount.current);
      reconnectTimeout.current = setTimeout(connect, delay);
      return;
    }

    const wsUrl = API_URL.replace(/^http/, 'ws');
    const ws = new WebSocket(`${wsUrl}/api/v1/ws/notifications?token=${encodeURIComponent(token)}`);

    ws.onopen = () => {
      // Connected successfully — reset fail counter
      failCount.current = 0;
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'notification') {
          setNotifications((prev) => [data as AgentNotification, ...prev].slice(0, 20));
          onNotification?.(data as AgentNotification);
        } else if (data.type === 'ai_status') {
          // AI processing finished or errored — clear global indicator
          useAiProcessingStore.getState().clearProcessing();
        }
      } catch (err: unknown) {
        console.warn('Notification parse error:', err);
      }
    };

    ws.onclose = (event) => {
      wsRef.current = null;
      // Auth failure (4001 = Invalid token) — use exponential backoff
      if (event.code === 4001) {
        failCount.current++;
        const delay = Math.min(60000, 10000 * failCount.current);
        reconnectTimeout.current = setTimeout(connect, delay);
      } else {
        // Normal reconnect
        reconnectTimeout.current = setTimeout(connect, 10000);
      }
    };

    ws.onerror = () => {
      ws.close();
    };

    wsRef.current = ws;
  }, [user, onNotification]);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimeout.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return { notifications };
}
