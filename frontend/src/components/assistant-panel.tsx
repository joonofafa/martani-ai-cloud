'use client';

import { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore, useAiProcessingStore } from '@/lib/store';
import { chatApi, filesApi, getFreshToken } from '@/lib/api';
import { Bot, Send, X, ChevronLeft, FolderOpen, ShieldCheck, Wrench } from 'lucide-react';
import { ToolsBadges } from '@/components/tools-badges';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { getFileIcon } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { useTranslation } from '@/hooks/use-translation';
import { MessageErrorBoundary } from '@/components/message-error-boundary';
import type { ChatMessage } from '@/types';

export interface FileReference {
  id: string;
  name: string;
  type: 'file' | 'folder';
  mimeType?: string | null;
}

export interface AssistantPanelRef {
  sendMessage: (content: string) => void;
  addFileReferences: (refs: FileReference[]) => void;
  open: () => void;
}

/* ─── Image block (rendered from ```image code blocks) ─── */
function ImageBlock({ json }: { json: string }) {
  let data: { id?: string; name?: string; url?: string };
  try {
    data = JSON.parse(json);
  } catch {
    return <code className="text-[11px] text-gray-400">{json}</code>;
  }

  const fileId = data.id;
  const streamUrl = fileId ? filesApi.getStreamUrl(fileId) : null;

  if (!streamUrl) return null;

  return (
    <div className="my-1.5">
      <div className="border border-gray-600/50 rounded-lg overflow-hidden bg-gray-800/40">
        <img
          src={streamUrl}
          alt={data.name || 'image'}
          className="w-full max-w-full rounded-t-lg cursor-pointer"
          onClick={() => window.open(streamUrl, '_blank')}
          loading="lazy"
        />
        {data.name && (
          <div className="px-2 py-1.5 bg-gray-800/60 border-t border-gray-700/50">
            <span className="text-[10px] text-gray-400 truncate">{data.name}</span>
          </div>
        )}
      </div>
    </div>
  );
}

const panelMarkdownComponents = {
  p({ children }: { children?: React.ReactNode }) {
    return <p className="mb-1.5 last:mb-0 leading-relaxed text-[13px]">{children}</p>;
  },
  ul({ children }: { children?: React.ReactNode }) {
    return <ul className="list-disc list-inside mb-1.5 space-y-0.5 text-[13px]">{children}</ul>;
  },
  ol({ children }: { children?: React.ReactNode }) {
    return <ol className="list-decimal list-inside mb-1.5 space-y-0.5 text-[13px]">{children}</ol>;
  },
  li({ children }: { children?: React.ReactNode }) {
    return <li className="text-gray-200 text-[13px]">{children}</li>;
  },
  code({ className, children }: { className?: string; children?: React.ReactNode; node?: unknown }) {
    const match = /language-(\w+)/.exec(className || '');
    const lang = match ? match[1] : '';
    const content = String(children).replace(/\n$/, '');
    if (lang === 'image') {
      if (!content.trim()) return null;
      return <ImageBlock json={content} />;
    }
    if (lang === 'tools') {
      try {
        const tools = JSON.parse(content);
        if (!Array.isArray(tools)) throw 0;
        return <ToolsBadges tools={tools} compact />;
      } catch {
        return <code>{content}</code>;
      }
    }
    if (match || content.includes('\n')) {
      return (
        <pre className="bg-gray-900/60 rounded p-2 my-1.5 overflow-x-auto text-[12px] leading-relaxed">
          <code className="text-gray-200">{content}</code>
        </pre>
      );
    }
    return (
      <code className="bg-gray-900/60 px-1 py-0.5 rounded text-[12px] text-primary-300">
        {children}
      </code>
    );
  },
  pre({ children }: { children?: React.ReactNode }) {
    return <div className="my-1.5">{children}</div>;
  },
  strong({ children }: { children?: React.ReactNode }) {
    return <strong className="font-semibold text-gray-100">{children}</strong>;
  },
  em({ children }: { children?: React.ReactNode }) {
    return <em className="italic text-gray-300">{children}</em>;
  },
  a({ href, children }: { href?: string; children?: React.ReactNode }) {
    return <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary-400 hover:text-primary-300 underline underline-offset-2 text-[13px]">{children}</a>;
  },
  h1({ children }: { children?: React.ReactNode }) {
    return <h1 className="text-base font-bold text-gray-100 mt-3 mb-1.5">{children}</h1>;
  },
  h2({ children }: { children?: React.ReactNode }) {
    return <h2 className="text-[14px] font-bold text-gray-100 mt-2.5 mb-1">{children}</h2>;
  },
  h3({ children }: { children?: React.ReactNode }) {
    return <h3 className="text-[13px] font-semibold text-gray-100 mt-2 mb-1">{children}</h3>;
  },
  h4({ children }: { children?: React.ReactNode }) {
    return <h4 className="text-[13px] font-semibold text-gray-200 mt-1.5 mb-0.5">{children}</h4>;
  },
  blockquote({ children }: { children?: React.ReactNode }) {
    return <blockquote className="border-l-2 border-primary-500 pl-2.5 my-1.5 text-gray-300 italic text-[13px]">{children}</blockquote>;
  },
  hr() {
    return <hr className="border-gray-600 my-2" />;
  },
  table({ children }: { children?: React.ReactNode }) {
    return (
      <div className="my-1.5 overflow-x-auto rounded-lg border border-gray-600/50">
        <table className="w-full text-[12px]">{children}</table>
      </div>
    );
  },
  thead({ children }: { children?: React.ReactNode }) {
    return <thead className="bg-gray-800/80 text-gray-300 text-[11px] uppercase tracking-wider">{children}</thead>;
  },
  th({ children }: { children?: React.ReactNode }) {
    return <th className="px-2.5 py-1.5 text-left font-semibold whitespace-nowrap">{children}</th>;
  },
  tr({ children }: { children?: React.ReactNode }) {
    return <tr className="hover:bg-gray-700/20 transition-colors">{children}</tr>;
  },
  td({ children }: { children?: React.ReactNode }) {
    return <td className="px-2.5 py-1.5 text-gray-200 border-t border-gray-700/30">{children}</td>;
  },
  img({ src, alt }: { src?: string; alt?: string }) {
    return (
      <img
        src={src}
        alt={alt || ''}
        className="max-w-full rounded-lg my-2 border border-gray-600/50"
        loading="lazy"
      />
    );
  },
};

function getWsUrl(sessionId: string, token: string): string {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
  const base = apiUrl ? apiUrl.replace(/^http/, 'ws') : '';
  return `${base}/api/v1/ws/chat/${sessionId}?token=${encodeURIComponent(token)}`;
}

export const AssistantPanel = forwardRef<AssistantPanelRef>(function AssistantPanel(_, ref) {
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuthStore();
  const isMobile = useIsMobile();
  const { t } = useTranslation(['common', 'tools']);
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState('');

  // Desktop: open by default, Mobile: closed by default
  const initializedRef = useRef(false);
  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true;
      if (!isMobile) setIsOpen(true);
    }
  }, [isMobile]);

  const [sending, setSending] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [progressItems, setProgressItems] = useState<Array<{type: 'text' | 'tool', content: string}>>([]);
  const [streamingText, setStreamingText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileRefs, setFileRefs] = useState<FileReference[]>([]);
  const [inputRequest, setInputRequest] = useState<{ prompt: string } | null>(null);
  const [inputResponse, setInputResponse] = useState('');
  const wsRef = useRef<WebSocket | null>(null);
  const aiProcessing = useAiProcessingStore((s) => s.isProcessing);
  const activeSessionId = useAiProcessingStore((s) => s.activeSessionId);
  const setAiProcessing = useAiProcessingStore((s) => s.setProcessing);
  const clearAiProcessing = useAiProcessingStore((s) => s.clearProcessing);

  // Load file-manager agent session
  const { data: session } = useQuery({
    queryKey: ['assistant-panel-session'],
    queryFn: () => chatApi.getAgentSession('file-manager'),
    enabled: isAuthenticated,
  });

  useEffect(() => {
    if (session?.id) {
      setSessionId(session.id);
    }
  }, [session]);

  // Load messages
  const { data: messages, refetch: refetchMessages } = useQuery({
    queryKey: ['assistant-panel-messages', sessionId],
    queryFn: () => (sessionId ? chatApi.getMessages(sessionId) : Promise.resolve([])),
    enabled: !!sessionId,
  });

  // Cleanup WebSocket on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, []);

  // Reconnect to active task when panel opens and AI is processing for this session
  useEffect(() => {
    if (!isOpen || !sessionId || !aiProcessing || sending) return;
    if (activeSessionId !== sessionId) return;
    if (wsRef.current) return; // already connected

    let cancelled = false;

    (async () => {
      const wsToken = await getFreshToken();
      if (!wsToken || cancelled) return;

      setSending(true);
      setProgressItems([]);
      setStreamingText('');

      const ws = new WebSocket(getWsUrl(sessionId, wsToken));
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'reconnect' }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          switch (data.type) {
            case 'task_started':
              break;
            case 'progress_replay': {
              const replayTools = (data.tools || []).map((name: string) => {
                const fnResolved = t(`fn.${name}`);
                return (fnResolved && fnResolved !== `fn.${name}`) ? fnResolved : name;
              });
              setProgressItems(replayTools.map((label: string) => ({ type: 'tool' as const, content: label })));
              if (data.last_text) {
                setStreamingText(data.last_text);
              }
              break;
            }
            case 'token':
              setStreamingText(prev => prev + (data.content ?? ''));
              break;
            case 'tool_call': {
              setStreamingText(prev => {
                if (prev.trim()) {
                  setProgressItems(items => [...items, { type: 'text', content: prev.trim() }]);
                }
                return '';
              });
              const fnResolved = data.name ? t(`fn.${data.name}`) : '';
              const toolLabel = (fnResolved && fnResolved !== `fn.${data.name}`) ? fnResolved : (data.display_name || data.name || 'Tool');
              setProgressItems(items => [...items, { type: 'tool', content: toolLabel }]);
              break;
            }
            case 'done':
              setProgressItems([]);
              setStreamingText('');
              setInputRequest(null);
              setSending(false);
              clearAiProcessing();
              refetchMessages();
              queryClient.invalidateQueries({ queryKey: ['files'] });
              queryClient.invalidateQueries({ queryKey: ['notes'] });
              queryClient.invalidateQueries({ queryKey: ['schedule-tasks'] });
              ws.close();
              wsRef.current = null;
              break;
            case 'error':
              setProgressItems([]);
              setStreamingText('');
              setInputRequest(null);
              setSending(false);
              clearAiProcessing();
              ws.close();
              wsRef.current = null;
              break;
          }
        } catch (e) {
          console.warn('WS reconnect parse error:', e);
        }
      };

      ws.onerror = () => {
        setSending(false);
        clearAiProcessing();
        wsRef.current = null;
      };

      ws.onclose = () => {
        if (wsRef.current === ws) {
          setSending(false);
          clearAiProcessing();
          wsRef.current = null;
          refetchMessages();
        }
      };
    })();

    return () => { cancelled = true; };
  }, [isOpen, sessionId, aiProcessing, activeSessionId, sending]);

  const doSend = useCallback(async (content: string, refs?: FileReference[]) => {
    const sid = sessionId || session?.id;
    if (!sid || sending) return;
    const wsToken = await getFreshToken();
    if (!wsToken) return;

    const activeRefs = refs || [];
    const trimmed = content.trim();
    if (!trimmed && activeRefs.length === 0) return;

    let finalContent: string;
    if (activeRefs.length > 0) {
      const refLines = activeRefs.map(r => `- 파일ID: ${r.id}, 파일명: ${r.name}, 타입: ${r.type}`).join('\n');
      const userMsg = trimmed || '이 파일들을 확인해 주세요.';
      finalContent = `[파일 참조]\n${refLines}\n\n${userMsg}`;
    } else {
      finalContent = trimmed;
    }

    setSending(true);
    setProgressItems([]);
    setStreamingText('');

    // Add user message to cache optimistically
    const tempMsg: ChatMessage = {
      id: `temp-${Date.now()}`,
      session_id: sid,
      role: 'user',
      content: finalContent,
      created_at: new Date().toISOString(),
    };
    queryClient.setQueryData<ChatMessage[]>(
      ['assistant-panel-messages', sid],
      (old) => [...(old || []), tempMsg]
    );

    // Connect WebSocket and send
    try {
      const ws = new WebSocket(getWsUrl(sid, wsToken));
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'message', content: finalContent }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          switch (data.type) {
            case 'task_started':
              // Celery task dispatched — set global indicator
              if (data.message_id && sid) {
                setAiProcessing(sid, data.message_id);
              }
              break;

            case 'progress_replay': {
              const replayTools = (data.tools || []).map((name: string) => {
                const fnResolved = t(`fn.${name}`);
                return (fnResolved && fnResolved !== `fn.${name}`) ? fnResolved : name;
              });
              setProgressItems(replayTools.map((label: string) => ({ type: 'tool' as const, content: label })));
              if (data.last_text) {
                setStreamingText(data.last_text);
              }
              break;
            }

            case 'token':
              setStreamingText(prev => prev + (data.content ?? ''));
              break;

            case 'tool_call': {
              setStreamingText(prev => {
                if (prev.trim()) {
                  setProgressItems(items => [...items, { type: 'text', content: prev.trim() }]);
                }
                return '';
              });
              const fnResolved = data.name ? t(`fn.${data.name}`) : '';
              const toolLabel = (fnResolved && fnResolved !== `fn.${data.name}`) ? fnResolved : (data.display_name || data.name || 'Tool');
              setProgressItems(items => [...items, { type: 'tool', content: toolLabel }]);
              break;
            }

            case 'tool_result':
              break;

            case 'input_request':
              setInputRequest({ prompt: data.prompt });
              setInputResponse('');
              break;

            case 'done':
              // Clear progress items — tool usage is saved in DB response via ```tools block
              setProgressItems([]);
              setStreamingText('');
              setInputRequest(null);
              setSending(false);
              clearAiProcessing();
              refetchMessages();
              queryClient.invalidateQueries({ queryKey: ['files'] });
              queryClient.invalidateQueries({ queryKey: ['notes'] });
              queryClient.invalidateQueries({ queryKey: ['schedule-tasks'] });
              ws.close();
              wsRef.current = null;
              break;

            case 'error': {
              setProgressItems([]);
              setStreamingText('');
              setInputRequest(null);
              clearAiProcessing();
              // Show error as temporary assistant message
              if (data.message && sid) {
                const errorMsg: ChatMessage = {
                  id: `error-${Date.now()}`,
                  session_id: sid,
                  role: 'assistant',
                  content: `**오류:** ${data.message}`,
                  created_at: new Date().toISOString(),
                };
                queryClient.setQueryData<ChatMessage[]>(
                  ['assistant-panel-messages', sid],
                  (old) => [...(old || []), errorMsg]
                );
              }
              setSending(false);
              ws.close();
              wsRef.current = null;
              break;
            }
          }
        } catch (e) {
          console.warn('WS message parse error:', e);
        }
      };

      ws.onerror = () => {
        // Fallback to HTTP — keep sending=true for loading indicator
        setProgressItems([]);
        setStreamingText('');
        wsRef.current = null;
        chatApi.sendMessage(sid, finalContent).then(() => {
          refetchMessages();
          queryClient.invalidateQueries({ queryKey: ['files'] });
          queryClient.invalidateQueries({ queryKey: ['notes'] });
          queryClient.invalidateQueries({ queryKey: ['schedule-tasks'] });
        }).finally(() => {
          setSending(false);
          setProgressItems([]);
          setStreamingText('');
        });
      };

      ws.onclose = () => {
        // Unexpected close (not from done/error handlers which set wsRef to null)
        if (wsRef.current === ws) {
          setSending(false);
          clearAiProcessing();
          setProgressItems([]);
          setStreamingText('');
          wsRef.current = null;
          // Refetch messages — celery task may have completed and saved to DB
          refetchMessages();
        }
      };

    } catch {
      // Fallback to HTTP — keep sending=true for loading indicator
      try {
        await chatApi.sendMessage(sid, finalContent);
        refetchMessages();
        queryClient.invalidateQueries({ queryKey: ['files'] });
        queryClient.invalidateQueries({ queryKey: ['notes'] });
        queryClient.invalidateQueries({ queryKey: ['schedule-tasks'] });
      } finally {
        setSending(false);
        setProgressItems([]);
        setStreamingText('');
      }
    }
  }, [sessionId, session, sending, queryClient, refetchMessages, setAiProcessing, clearAiProcessing]);

  useImperativeHandle(ref, () => ({
    sendMessage: (content: string) => {
      setIsOpen(true);
      setTimeout(() => {
        doSend(content);
        inputRef.current?.focus();
      }, 50);
    },
    addFileReferences: (refs: FileReference[]) => {
      setIsOpen(true);
      setFileRefs(prev => {
        const existingIds = new Set(prev.map(r => r.id));
        const newRefs = refs.filter(r => !existingIds.has(r.id));
        return [...prev, ...newRefs];
      });
      setTimeout(() => inputRef.current?.focus(), 50);
    },
    open: () => {
      setIsOpen(true);
      setTimeout(() => inputRef.current?.focus(), 50);
    },
  }), [doSend]);

  // Restore focus to input when sending finishes
  const prevSendingRef = useRef(false);
  useEffect(() => {
    if (prevSendingRef.current && !sending && isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
    prevSendingRef.current = sending;
  }, [sending, isOpen]);

  // Scroll to bottom when messages or streaming text changes
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen, streamingText, progressItems]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() && fileRefs.length === 0) return;
    const content = message.trim();
    const refs = [...fileRefs];
    setMessage('');
    setFileRefs([]);
    await doSend(content, refs);
  };

  // Collapsed state
  if (!isOpen) {
    // Mobile: floating action button
    if (isMobile) {
      return (
        <button
          className="fixed bottom-4 right-4 z-40 w-12 h-12 bg-primary-500 rounded-full shadow-lg flex items-center justify-center hover:bg-primary-600 transition-colors"
          onClick={() => setIsOpen(true)}
          title={t('nav.assistantDesc')}
        >
          <Bot className="w-6 h-6 text-white" />
          {aiProcessing && (
            <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-primary-300 rounded-full animate-ping" />
          )}
        </button>
      );
    }
    // Desktop: vertical tab bar
    return (
      <div
        className="w-[40px] flex-shrink-0 bg-gray-800/50 border-l border-gray-700 flex flex-col items-center py-4 cursor-pointer hover:bg-gray-800 transition-colors"
        onClick={() => setIsOpen(true)}
        title={t('nav.assistantDesc')}
      >
        <div className="relative w-8 h-8 flex items-center justify-center">
          <div className="absolute inset-0 rounded-full border-2 border-transparent"
            style={{
              background: 'linear-gradient(#1f2937, #1f2937) padding-box, conic-gradient(from 0deg, #FB923C, #EA580C, #F97316, #FB923C) border-box',
              animation: 'spin 4s linear infinite',
            }}
          />
          <Bot className="w-4 h-4 text-orange-400 relative z-10" />
          {aiProcessing && (
            <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-primary-400 rounded-full animate-ping" />
          )}
        </div>
      </div>
    );
  }

  // Expanded state
  return (
    <div className={
      isMobile
        ? "fixed inset-0 z-50 bg-gray-800 flex flex-col"
        : "w-[20%] min-w-[300px] flex-shrink-0 bg-gray-800/50 border-l border-gray-700 flex flex-col"
    }>
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-3 border-b border-gray-700 bg-gray-800/80">
        <div className="w-7 h-7 rounded-full bg-orange-500/20 flex items-center justify-center flex-shrink-0">
          <Bot className="w-4 h-4 text-orange-500" />
        </div>
        <span className="text-sm font-semibold text-gray-100 flex-1">{t('nav.assistantDesc')}</span>
        <button
          onClick={() => setIsOpen(false)}
          className="p-1 text-gray-400 hover:text-gray-200 transition-colors rounded"
        >
          {isMobile ? <X className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4 rotate-180" />}
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {messages?.map((msg) => {
          const timeStr = msg.created_at ? new Date(msg.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '';
          return (
          <div key={msg.id} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : ''}`}>
            {msg.role !== 'user' && (
              <div className="w-6 h-6 rounded-full bg-primary-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Bot className="w-3.5 h-3.5 text-primary-400" />
              </div>
            )}
            <div className="max-w-[85%] min-w-0">
              <div
                className={`rounded-xl px-3 py-2 ${
                  msg.role === 'user'
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-700/80 text-gray-100 border border-gray-600/50'
                }`}
              >
                <div className="overflow-hidden">
                  <MessageErrorBoundary content={msg.content || ''}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={panelMarkdownComponents}>
                      {msg.content || ''}
                    </ReactMarkdown>
                  </MessageErrorBoundary>
                </div>
              </div>
              {timeStr && (
                <div className={`mt-0.5 px-1 ${msg.role === 'user' ? 'text-right' : ''}`}>
                  <span className="text-[10px] text-gray-500">{timeStr}</span>
                </div>
              )}
            </div>
          </div>
          );
        })}

        {/* Progress: unified Thinking container (compact) */}
        {(progressItems.length > 0 || (sending && streamingText) || sending) && (() => {
          const toolItems = progressItems.filter(i => i.type === 'tool');
          const textItems = progressItems.filter(i => i.type === 'text');
          const hasTools = toolItems.length > 0;
          const hasText = textItems.length > 0 || streamingText;
          const showTyping = sending && !hasTools && !streamingText;

          return (
            <div className="flex gap-2">
              <div className="w-6 h-6 rounded-full bg-primary-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Bot className="w-3.5 h-3.5 text-primary-400" />
              </div>
              <div className="flex-1">
                {/* Thinking container — only when tools or text present */}
                {(hasTools || hasText) && (
                  <div className="bg-gray-700/40 rounded-lg px-3 py-2 border border-gray-600/20 space-y-1">
                    {/* Tool chain: single scrollable row */}
                    {hasTools && (
                      <div className="flex items-center gap-1 text-[11px] text-gray-400 overflow-hidden">
                        <Wrench className="w-3 h-3 flex-shrink-0 text-gray-500" />
                        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
                          {toolItems.map((item, idx) => (
                            <span key={idx} className="inline-flex items-center whitespace-nowrap">
                              {idx > 0 && <span className="text-gray-600 mx-0.5">›</span>}
                              {item.content}
                            </span>
                          ))}
                        </div>
                        {/* Bouncing dots (waiting for next tool) */}
                        {sending && !streamingText && (
                          <span className="flex gap-0.5 items-center flex-shrink-0 ml-1">
                            <span className="w-1 h-1 bg-primary-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                            <span className="w-1 h-1 bg-primary-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                            <span className="w-1 h-1 bg-primary-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                          </span>
                        )}
                      </div>
                    )}

                    {/* Status text: show only the last text item or current streaming */}
                    {hasText && (
                      <div className="text-[13px] text-gray-300/80 pl-3.5 ml-0.5 border-l-2 border-gray-500/40">
                        <div className="pl-2.5 overflow-hidden">
                          <MessageErrorBoundary content={streamingText || textItems[textItems.length - 1]?.content || ''}>
                            <ReactMarkdown remarkPlugins={[remarkGfm]} components={panelMarkdownComponents}>
                              {streamingText || textItems[textItems.length - 1]?.content || ''}
                            </ReactMarkdown>
                          </MessageErrorBoundary>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Typing indicator when no tools yet */}
                {showTyping && (
                  <div className="bg-gray-700/80 rounded-xl px-3 py-2 border border-gray-600/50 w-fit">
                    <div className="flex gap-1">
                      <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* MFA / OTP Input Request */}
        {inputRequest && (
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl px-3 py-2.5 mx-1">
            <div className="flex items-center gap-1.5 mb-2">
              <ShieldCheck className="w-4 h-4 text-yellow-400" />
              <p className="text-sm text-yellow-200">{inputRequest.prompt}</p>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const val = inputResponse.trim();
                if (!val || !wsRef.current) return;
                wsRef.current.send(JSON.stringify({ type: 'input_response', content: val }));
                setInputRequest(null);
                setInputResponse('');
                setProgressItems(items => [...items, { type: 'tool', content: '인증 코드 확인 중...' }]);
              }}
              className="flex gap-2"
            >
              <input
                autoFocus
                type="text"
                value={inputResponse}
                onChange={(e) => setInputResponse(e.target.value)}
                placeholder="인증 코드 입력..."
                className="flex-1 px-2.5 py-1.5 text-sm border border-yellow-500/30 rounded-lg focus:outline-none focus:ring-1 focus:ring-yellow-500/50 bg-gray-800 text-white placeholder-gray-500"
              />
              <button
                type="submit"
                disabled={!inputResponse.trim()}
                className="px-3 py-1.5 text-sm bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                전송
              </button>
            </form>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-700 px-3 py-2.5">
        {/* File reference chips */}
        {fileRefs.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {fileRefs.map((fRef) => (
              <span
                key={fRef.id}
                className="inline-flex items-center gap-1 px-2 py-1 bg-gray-700 border border-gray-600 rounded-full text-xs text-gray-200 max-w-[180px]"
              >
                {fRef.type === 'folder' ? (
                  <FolderOpen className="w-3 h-3 text-yellow-500 flex-shrink-0" />
                ) : (
                  <span className="text-xs flex-shrink-0">{getFileIcon(fRef.mimeType ?? null)}</span>
                )}
                <span className="truncate">{fRef.name}</span>
                <button
                  type="button"
                  onClick={() => setFileRefs(prev => prev.filter(r => r.id !== fRef.id))}
                  className="ml-0.5 p-0.5 text-gray-400 hover:text-gray-200 rounded-full hover:bg-gray-600 flex-shrink-0"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        <form onSubmit={handleSend} className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={fileRefs.length > 0 ? "메시지를 입력하거나 바로 전송하세요..." : "질문하세요..."}
            className="flex-1 px-3 py-2 text-sm border border-gray-600 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500/50 bg-gray-700 text-white placeholder-gray-500 transition-all"
            disabled={sending}
          />
          <button
            type="submit"            disabled={(!message.trim() && fileRefs.length === 0) || sending}
            className="p-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
});
