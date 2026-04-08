'use client';

import { useCallback, useRef, useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAiProcessingStore } from '@/lib/store';
import { chatApi, getFreshToken } from '@/lib/api';
import { useTranslation } from '@/hooks/use-translation';
import type { ChatMessage } from '@/types';

/* ─── WebSocket message shape ─── */
interface WsMessageData {
  type: string;
  message_id?: string;
  tools?: string[];
  last_text?: string;
  content?: string;
  name?: string;
  display_name?: string;
  prompt?: string;
  message?: string;
  items?: unknown[];
}

/* ─── WebSocket URL helper ─── */
function getWsUrl(sessionId: string, token: string): string {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
  const base = apiUrl ? apiUrl.replace(/^http/, 'ws') : '';
  return `${base}/api/v1/ws/chat/${sessionId}?token=${encodeURIComponent(token)}`;
}

export interface UseChatWebSocketParams {
  sessionId: string | null;
  onMessageComplete: () => void;
  onError: (msg: string) => void;
}

export interface UseChatWebSocketReturn {
  send: (content: string) => void;
  sending: boolean;
  progressTools: string[];
  progressTexts: string[];
  streamingText: string;
  inputRequest: { prompt: string } | null;
  inputResponse: string;
  setInputResponse: (value: string) => void;
  submitInputResponse: (code: string) => void;
  disconnect: () => void;
  clearProgress: () => void;
}

export function useChatWebSocket({
  sessionId,
  onMessageComplete,
  onError,
}: UseChatWebSocketParams): UseChatWebSocketReturn {
  const queryClient = useQueryClient();
  const { t } = useTranslation(['chat', 'tools']);
  const aiProcessing = useAiProcessingStore((s) => s.isProcessing);
  const activeProcessingSession = useAiProcessingStore((s) => s.activeSessionId);
  const setAiProcessing = useAiProcessingStore((s) => s.setProcessing);
  const clearAiProcessing = useAiProcessingStore((s) => s.clearProcessing);

  const [sending, setSending] = useState(false);
  const [progressTools, setProgressTools] = useState<string[]>([]);
  const [progressTexts, setProgressTexts] = useState<string[]>([]);
  const [streamingText, setStreamingText] = useState('');
  const [inputRequest, setInputRequest] = useState<{ prompt: string } | null>(null);
  const [inputResponse, setInputResponse] = useState('');

  const wsRef = useRef<WebSocket | null>(null);
  const sendingRef = useRef(false);
  const reconnectAttempted = useRef(false);

  // Shared handler for WS messages (used by both send and reconnect)
  const handleWsMessage = useCallback((data: WsMessageData, ws: WebSocket, sid: string, isReconnect: boolean) => {
    switch (data.type) {
      case 'task_started':
        if (!isReconnect && data.message_id) {
          setAiProcessing(sid, data.message_id);
        }
        break;
      case 'progress_replay': {
        const replayTools = (data.tools || []).map((name: string) => {
          const fnResolved = t(`fn.${name}`);
          return (fnResolved && fnResolved !== `fn.${name}`) ? fnResolved : name;
        });
        setProgressTools(replayTools);
        if (data.last_text) {
          setStreamingText(data.last_text!);
        }
        break;
      }
      case 'token': {
        const tokenContent = data.content ?? '';
        if (tokenContent) setStreamingText(prev => prev + tokenContent);
        break;
      }
      case 'tool_call': {
        setStreamingText(prev => {
          if (prev.trim()) setProgressTexts(texts => [...texts, prev.trim()]);
          return '';
        });
        const fnResolved = data.name ? t(`fn.${data.name}`) : '';
        const toolLabel = (fnResolved && fnResolved !== `fn.${data.name}`) ? fnResolved : (data.display_name || data.name || t('tool'));
        setProgressTools(tools => [...tools, toolLabel]);
        break;
      }
      case 'tool_result':
        break;
      case 'filelist': {
        // Inject filelist block into streaming text for the markdown renderer
        const filelistJson = JSON.stringify(data.items || []);
        setStreamingText(prev => prev + `\n\`\`\`filelist\n${filelistJson}\n\`\`\`\n`);
        break;
      }
      case 'input_request':
        setInputRequest({ prompt: data.prompt || '' });
        setInputResponse('');
        break;
      case 'done': {
        setStreamingText(prev => {
          if (prev.trim()) setProgressTexts(texts => [...texts, prev.trim()]);
          return '';
        });
        setInputRequest(null);
        sendingRef.current = false;
        setSending(false);
        clearAiProcessing();
        onMessageComplete();
        // Delay clearing progress until messages are refetched (handled by caller)
        queryClient.invalidateQueries({ queryKey: ['chat-sessions'] });
        queryClient.invalidateQueries({ queryKey: ['files'] });
        queryClient.invalidateQueries({ queryKey: ['notes'] });
        queryClient.invalidateQueries({ queryKey: ['schedule-tasks'] });
        ws.close();
        wsRef.current = null;
        break;
      }
      case 'error': {
        setProgressTools([]);
        setProgressTexts([]);
        setStreamingText('');
        setInputRequest(null);
        clearAiProcessing();
        if (data.message) {
          onError(data.message);
        }
        sendingRef.current = false;
        setSending(false);
        ws.close();
        wsRef.current = null;
        break;
      }
    }
  }, [t, queryClient, setAiProcessing, clearAiProcessing, onMessageComplete, onError]);

  // Cleanup WebSocket on unmount or session change
  useEffect(() => {
    reconnectAttempted.current = false;
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [sessionId]);

  // Reconnect to active Celery task when returning to a processing session
  useEffect(() => {
    if (!sessionId || !aiProcessing || sendingRef.current || reconnectAttempted.current) return;
    if (activeProcessingSession !== sessionId) return;
    if (wsRef.current) return;
    reconnectAttempted.current = true;

    let cancelled = false;

    (async () => {
      const wsToken = await getFreshToken();
      if (!wsToken || cancelled) return;

      sendingRef.current = true;
      setSending(true);
      setProgressTools([]);
      setProgressTexts([]);
      setStreamingText('');

      const ws = new WebSocket(getWsUrl(sessionId, wsToken));
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'reconnect' }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          handleWsMessage(data, ws, sessionId, true);
        } catch (e) {
          console.warn('WS reconnect parse error:', e);
        }
      };

      ws.onerror = () => {
        sendingRef.current = false;
        setSending(false);
        clearAiProcessing();
        wsRef.current = null;
      };

      ws.onclose = () => {
        if (wsRef.current === ws) {
          sendingRef.current = false;
          setSending(false);
          clearAiProcessing();
          setProgressTools([]);
          setProgressTexts([]);
          setStreamingText('');
          wsRef.current = null;
          onMessageComplete();
        }
      };
    })();

    return () => { cancelled = true; };
  }, [sessionId, aiProcessing, activeProcessingSession, handleWsMessage, clearAiProcessing, onMessageComplete]);

  // Clear progress items when session changes
  useEffect(() => {
    setProgressTools([]);
    setProgressTexts([]);
    setStreamingText('');
  }, [sessionId]);

  const send = useCallback(async (content: string) => {
    if (!sessionId || sendingRef.current) return;
    const wsToken = await getFreshToken();
    if (!wsToken) return;

    sendingRef.current = true;
    setSending(true);
    setProgressTools([]);
    setProgressTexts([]);
    setStreamingText('');

    // Add user message optimistically
    const tempUserMessage: ChatMessage = {
      id: `temp-${Date.now()}`,
      session_id: sessionId,
      role: 'user',
      content,
      created_at: new Date().toISOString(),
    };
    queryClient.setQueryData<ChatMessage[]>(
      ['chat-messages', sessionId],
      (old) => [...(old || []), tempUserMessage]
    );

    try {
      const ws = new WebSocket(getWsUrl(sessionId, wsToken));
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'message', content }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          handleWsMessage(data, ws, sessionId, false);
        } catch (e) {
          console.warn('WS message parse error:', e);
        }
      };

      ws.onerror = () => {
        // Fallback to HTTP
        setProgressTools([]); setProgressTexts([]);
        setStreamingText('');
        wsRef.current = null;
        chatApi.sendMessage(sessionId, content).then(() => {
          onMessageComplete();
          queryClient.invalidateQueries({ queryKey: ['chat-sessions'] });
          queryClient.invalidateQueries({ queryKey: ['files'] });
          queryClient.invalidateQueries({ queryKey: ['notes'] });
        }).finally(() => {
          sendingRef.current = false;
          setSending(false);
          setProgressTools([]); setProgressTexts([]);
          setStreamingText('');
        });
      };

      ws.onclose = () => {
        // Unexpected close (not from done/error handlers which set wsRef to null)
        if (wsRef.current === ws) {
          sendingRef.current = false;
          setSending(false);
          clearAiProcessing();
          setProgressTools([]); setProgressTexts([]);
          setStreamingText('');
          wsRef.current = null;
          onMessageComplete();
        }
      };
    } catch {
      // Fallback to HTTP
      chatApi.sendMessage(sessionId, content).then(() => {
        onMessageComplete();
        queryClient.invalidateQueries({ queryKey: ['chat-sessions'] });
      }).finally(() => {
        sendingRef.current = false;
        setSending(false);
        setProgressTools([]); setProgressTexts([]);
        setStreamingText('');
      });
    }
  }, [sessionId, queryClient, handleWsMessage, clearAiProcessing, onMessageComplete]);

  const submitInputResponse = useCallback((code: string) => {
    if (!wsRef.current) return;
    wsRef.current.send(JSON.stringify({ type: 'input_response', content: code }));
    setInputRequest(null);
    setInputResponse('');
    setProgressTools(tools => [...tools, t('verifyingCode')]);
  }, [t]);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const clearProgress = useCallback(() => {
    setProgressTools([]);
    setProgressTexts([]);
  }, []);

  return {
    send,
    sending,
    progressTools,
    progressTexts,
    streamingText,
    inputRequest,
    inputResponse,
    setInputResponse,
    submitInputResponse,
    disconnect,
    clearProgress,
  };
}
