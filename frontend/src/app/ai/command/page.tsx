'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  Terminal, Radar, Factory, Cable, HardDrive, Zap,
  Shield, Send, Activity, FolderOpen, ChevronRight,
  Newspaper, FlaskConical, ShieldCheck, Plug, X,
  Clock, CheckCircle2, AlertCircle, Loader2,
} from 'lucide-react';
import { useAuthStore, useAiProcessingStore } from '@/lib/store';
import { chatApi, scheduleApi } from '@/lib/api';
import { formatBytes, cn } from '@/lib/utils';
import { Sidebar } from '@/components/sidebar';

/* --- Helpers --- */

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toString();
}

function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

/* --- Flow Connector --- */

function FlowConnector({ active, delay = 0 }: { active?: boolean; delay?: number }) {
  return (
    <div className="flex items-center w-12 sm:w-16 lg:w-20 relative flex-shrink-0">
      <div className="w-full h-[2px] bg-gray-700/60 rounded-full" />
      <div className="absolute inset-0 flex items-center overflow-hidden">
        <div
          className={cn('h-[2px] w-full rounded-full', active ? 'bg-accent-500/30' : 'bg-gray-700/30')}
        />
        {active && (
          <div
            className="absolute h-[2px] w-10 rounded-full animate-flow-dot"
            style={{
              background: 'linear-gradient(90deg, transparent, #14B8A6, #14B8A6, transparent)',
              animationDelay: `${delay}ms`,
            }}
          />
        )}
      </div>
      <ChevronRight className={cn(
        'absolute -right-1 w-3 h-3',
        active ? 'text-accent-500/70' : 'text-gray-700',
      )} />
    </div>
  );
}

/* --- Pipeline Node --- */

interface PipelineNodeProps {
  icon: React.ElementType;
  label: string;
  sublabel: string;
  href: string;
  active?: boolean;
  color: 'teal' | 'orange' | 'blue';
}

function PipelineNode({ icon: Icon, label, sublabel, href, active, color }: PipelineNodeProps) {
  const router = useRouter();
  const styles = {
    teal: {
      border: active ? 'border-accent-500/40 ring-1 ring-accent-500/20' : 'border-gray-700/60 hover:border-accent-500/30',
      icon: 'text-accent-400',
      bg: 'bg-accent-500/10',
      glow: active ? 'shadow-[0_0_24px_rgba(20,184,166,0.12)]' : '',
    },
    orange: {
      border: active ? 'border-primary-500/40 ring-1 ring-primary-500/20' : 'border-gray-700/60 hover:border-primary-500/30',
      icon: 'text-primary-400',
      bg: 'bg-primary-500/10',
      glow: active ? 'shadow-[0_0_24px_rgba(249,115,22,0.12)]' : '',
    },
    blue: {
      border: active ? 'border-blue-500/40 ring-1 ring-blue-500/20' : 'border-gray-700/60 hover:border-blue-500/30',
      icon: 'text-blue-400',
      bg: 'bg-blue-500/10',
      glow: active ? 'shadow-[0_0_24px_rgba(59,130,246,0.12)]' : '',
    },
  }[color];

  return (
    <button
      onClick={() => router.push(href)}
      className={cn(
        'group relative flex flex-col items-center gap-2.5 px-5 py-4 rounded-xl border',
        'bg-gray-800/60 backdrop-blur-sm transition-all duration-300',
        'hover:bg-gray-800/90 hover:scale-[1.03]',
        'w-[120px] sm:w-[130px]',
        styles.border,
        styles.glow,
      )}
    >
      {active && (
        <span className="absolute top-2 right-2 flex h-2 w-2">
          <span className="animate-ping absolute h-full w-full rounded-full bg-accent-400 opacity-60" />
          <span className="relative rounded-full h-2 w-2 bg-accent-500" />
        </span>
      )}
      <div className={cn('p-2.5 rounded-lg', styles.bg)}>
        <Icon className={cn('w-5 h-5', styles.icon)} />
      </div>
      <div className="text-center">
        <p className="text-xs font-semibold text-gray-200 group-hover:text-white">{label}</p>
        <p className="text-[10px] text-gray-500 mt-0.5">{sublabel}</p>
      </div>
    </button>
  );
}

/* --- Status Card --- */

function StatusCard({ icon: Icon, label, value, subvalue, percentage, color, barColor }: {
  icon: React.ElementType;
  label: string;
  value: string;
  subvalue?: string;
  percentage?: number;
  color: string;
  barColor: string;
}) {
  return (
    <div className="bg-gray-800/60 rounded-xl border border-gray-700/40 p-3.5 flex flex-col gap-2.5">
      <div className="flex items-center gap-2.5">
        <div className={cn('p-1.5 rounded-lg', color)}>
          <Icon className="w-3.5 h-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider font-medium leading-none mb-1">{label}</p>
          <div className="flex items-baseline gap-1">
            <span className="text-base font-bold text-gray-100 leading-none">{value}</span>
            {subvalue && <span className="text-[10px] text-gray-500">{subvalue}</span>}
          </div>
        </div>
      </div>
      {percentage !== undefined && (
        <div className="w-full bg-gray-700/40 rounded-full h-1 overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all duration-700', barColor)}
            style={{ width: `${Math.min(percentage, 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}

/* --- Task Status Icon --- */

function TaskStatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'running':
      return <Loader2 className="w-3.5 h-3.5 text-accent-400 animate-spin" />;
    case 'completed':
      return <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />;
    case 'failed':
      return <AlertCircle className="w-3.5 h-3.5 text-red-400" />;
    case 'pending':
      return <Clock className="w-3.5 h-3.5 text-yellow-400" />;
    default:
      return <Clock className="w-3.5 h-3.5 text-gray-500" />;
  }
}

/* --- Quick Action Chips (for Spotlight) --- */

const QUICK_ACTIONS = [
  { icon: Newspaper, label: '뉴스 수집', command: '최신 AI 뉴스를 수집해서 요약해줘' },
  { icon: FlaskConical, label: '데이터 정제', command: '수집된 데이터를 JSON 스키마로 정제해줘' },
  { icon: ShieldCheck, label: '보안 점검', command: '현재 시스템 보안 상태를 점검해줘' },
  { icon: Plug, label: 'API 연결', command: 'Workspace 폴더를 REST API로 공개해줘' },
];

/* --- Main Page --- */

export default function CommandPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuthStore();
  const aiProcessing = useAiProcessingStore((s) => s.isProcessing);
  const [spotlightOpen, setSpotlightOpen] = useState(false);
  const [command, setCommand] = useState('');
  const [commandSent, setCommandSent] = useState(false);
  const spotlightInputRef = useRef<HTMLInputElement>(null);

  const { data: processing } = useQuery({
    queryKey: ['agent-processing'],
    queryFn: chatApi.getProcessingStatus,
    refetchInterval: 10000,
    enabled: !!user,
  });

  const { data: tasks } = useQuery({
    queryKey: ['schedule-tasks-command'],
    queryFn: () => scheduleApi.listTasks(),
    enabled: !!user,
  });

  // Focus spotlight input when opened
  useEffect(() => {
    if (spotlightOpen) {
      setTimeout(() => spotlightInputRef.current?.focus(), 100);
    }
  }, [spotlightOpen]);

  // Close spotlight on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && spotlightOpen) {
        setSpotlightOpen(false);
        setCommand('');
      }
      // Ctrl+K to open spotlight
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSpotlightOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [spotlightOpen]);

  // Toast timer
  useEffect(() => {
    if (commandSent) {
      const timer = setTimeout(() => setCommandSent(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [commandSent]);

  const handleCommand = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!command.trim()) return;
    setCommandSent(true);
    setCommand('');
    setSpotlightOpen(false);
  }, [command]);

  const handleQuickAction = useCallback((cmd: string) => {
    setCommand(cmd);
    setTimeout(() => spotlightInputRef.current?.focus(), 50);
  }, []);

  const activeAgents = processing?.length ?? 0;
  const runningTasks = tasks?.filter((t) => t.status === 'running').length ?? 0;
  const pendingTasks = tasks?.filter((t) => t.status === 'pending' && t.is_enabled).length ?? 0;
  const storageUsed = user?.storage_used ?? 0;
  const storageQuota = user?.storage_quota ?? 1;
  const storagePercent = (storageUsed / storageQuota) * 100;
  const tokensUsed = user?.tokens_used_month ?? 0;
  const tokenQuota = user?.token_quota ?? 1;
  const tokenPercent = (tokensUsed / tokenQuota) * 100;
  const pipelineActive = runningTasks > 0 || aiProcessing;

  // Recent tasks for Active Tasks table (show up to 8)
  const recentTasks = (tasks ?? [])
    .sort((a, b) => new Date(b.scheduled_at || b.created_at).getTime() - new Date(a.scheduled_at || a.created_at).getTime())
    .slice(0, 8);

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

      <style jsx global>{`
        @keyframes flow-dot {
          0% { transform: translateX(-150%); opacity: 0; }
          20% { opacity: 1; }
          80% { opacity: 1; }
          100% { transform: translateX(500%); opacity: 0; }
        }
        .animate-flow-dot {
          animation: flow-dot 2s ease-in-out infinite;
        }
        @keyframes scanline {
          0% { transform: translateY(-100%); }
          100% { transform: translateY(100vh); }
        }
        .scanline {
          animation: scanline 8s linear infinite;
        }
        @keyframes grid-breathe {
          0%, 100% { opacity: 0.015; }
          50% { opacity: 0.04; }
        }
        .grid-bg {
          background-image:
            linear-gradient(rgba(20,184,166,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(20,184,166,0.03) 1px, transparent 1px);
          background-size: 40px 40px;
          animation: grid-breathe 6s ease-in-out infinite;
        }
        @keyframes spotlight-in {
          from { opacity: 0; transform: scale(0.95) translateY(-10px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        .spotlight-panel {
          animation: spotlight-in 0.2s ease-out;
        }
      `}</style>

      <main className="flex-1 flex flex-col relative overflow-y-auto overflow-x-hidden">
        {/* Background effects */}
        <div className="fixed inset-0 grid-bg pointer-events-none" />
        <div className="fixed inset-0 pointer-events-none overflow-hidden">
          <div
            className="scanline absolute left-0 right-0 h-px"
            style={{ background: 'linear-gradient(90deg, transparent, rgba(20,184,166,0.06), transparent)' }}
          />
        </div>

        {/* Content wrapper */}
        <div className="relative z-10 flex flex-col flex-1 w-full max-w-5xl mx-auto px-5 sm:px-6">

          {/* === HEADER === */}
          <div className="flex-shrink-0 py-4 flex items-center gap-3">
            <div className="p-1.5 rounded-lg bg-primary-500/10">
              <Terminal className="w-4 h-4 text-primary-400" />
            </div>
            <div className="flex-1">
              <h1 className="text-sm font-bold text-gray-200 tracking-wide">COMMAND CENTER</h1>
              <p className="text-[10px] text-gray-600 uppercase tracking-[0.15em]">Terraforming Operations</p>
            </div>
            <span className={cn(
              'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium tracking-wide border',
              pipelineActive
                ? 'bg-accent-500/10 border-accent-500/30 text-accent-400'
                : 'bg-gray-800/80 border-gray-700/60 text-gray-500',
            )}>
              <span className={cn(
                'w-1.5 h-1.5 rounded-full',
                pipelineActive ? 'bg-accent-400 animate-pulse' : 'bg-gray-600',
              )} />
              {pipelineActive ? 'ONLINE' : 'STANDBY'}
            </span>
          </div>

          {/* === STATUS DASHBOARD === */}
          <div className="flex-shrink-0 grid grid-cols-2 lg:grid-cols-4 gap-2.5 mb-5">
            <StatusCard
              icon={HardDrive}
              label="Storage"
              value={formatBytes(storageUsed)}
              subvalue={`/ ${formatBytes(storageQuota)}`}
              percentage={storagePercent}
              color="bg-primary-500/15 text-primary-400"
              barColor={storagePercent > 90 ? 'bg-red-500' : storagePercent > 70 ? 'bg-yellow-500' : 'bg-primary-500'}
            />
            <StatusCard
              icon={Zap}
              label="AI Tokens"
              value={formatTokens(tokensUsed)}
              subvalue={`/ ${formatTokens(tokenQuota)}`}
              percentage={tokenPercent}
              color="bg-purple-500/15 text-purple-400"
              barColor={tokenPercent > 90 ? 'bg-red-500' : tokenPercent > 70 ? 'bg-yellow-500' : 'bg-purple-500'}
            />
            <StatusCard
              icon={Activity}
              label="Agents"
              value={`${activeAgents} active`}
              subvalue={runningTasks > 0 ? `${runningTasks} running` : pendingTasks > 0 ? `${pendingTasks} queued` : undefined}
              color="bg-accent-500/15 text-accent-400"
              barColor="bg-accent-500"
            />
            <StatusCard
              icon={Shield}
              label="Security"
              value="Normal"
              subvalue="0 threats"
              color="bg-green-500/15 text-green-400"
              barColor="bg-green-500"
            />
          </div>

          {/* === PIPELINE NODE MAP === */}
          <div className="flex-shrink-0 flex flex-col items-center py-6 sm:py-8">
            <p className="text-[10px] text-gray-600 uppercase tracking-[0.2em] font-medium mb-5">
              Data Pipeline
            </p>

            <div className="flex items-center justify-center">
              <PipelineNode
                icon={Radar}
                label="Scouts"
                sublabel="데이터 수집"
                href="/ai/scouts"
                active={pipelineActive}
                color="teal"
              />
              <FlowConnector active={pipelineActive} delay={0} />
              <PipelineNode
                icon={Factory}
                label="Refinery"
                sublabel="정제 . 변환"
                href="/ai/refinery"
                active={pipelineActive}
                color="teal"
              />
              <FlowConnector active={pipelineActive} delay={400} />
              <PipelineNode
                icon={FolderOpen}
                label="Workspace"
                sublabel="AI 저장소"
                href="/files?folder=%2FAI%20Workspace"
                color="orange"
              />
              <FlowConnector active={pipelineActive} delay={800} />
              <PipelineNode
                icon={Cable}
                label="Bridge"
                sublabel="API 출력"
                href="/ai/bridge"
                color="blue"
              />
            </div>

            <p className="text-[10px] text-gray-600 mt-5 text-center max-w-md leading-relaxed">
              수집(Scouts) &rarr; 정제(Refinery) &rarr; 저장(Workspace) &rarr; 출력(Bridge)
            </p>
          </div>

          {/* === ACTIVE TASKS TABLE === */}
          <div className="flex-1 min-h-0 flex flex-col mb-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] text-gray-600 uppercase tracking-[0.2em] font-medium">
                Active Tasks
              </p>
              <span className="text-[10px] text-gray-600">
                {runningTasks > 0 && (
                  <span className="text-accent-400 font-medium">{runningTasks} running</span>
                )}
                {runningTasks > 0 && pendingTasks > 0 && ' / '}
                {pendingTasks > 0 && (
                  <span className="text-yellow-400/80">{pendingTasks} pending</span>
                )}
              </span>
            </div>

            <div className="flex-1 bg-gray-800/40 rounded-xl border border-gray-700/40 overflow-hidden">
              {recentTasks.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full min-h-[120px] text-gray-600">
                  <Activity className="w-5 h-5 mb-2 opacity-40" />
                  <p className="text-xs">No active tasks</p>
                  <p className="text-[10px] mt-0.5 text-gray-700">Use the command button to start a pipeline</p>
                </div>
              ) : (
                <div className="overflow-auto max-h-[280px]">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-700/40">
                        <th className="text-left text-[10px] text-gray-600 uppercase tracking-wider font-medium px-4 py-2.5">Status</th>
                        <th className="text-left text-[10px] text-gray-600 uppercase tracking-wider font-medium px-4 py-2.5">Task Name</th>
                        <th className="text-left text-[10px] text-gray-600 uppercase tracking-wider font-medium px-4 py-2.5 hidden sm:table-cell">Type</th>
                        <th className="text-right text-[10px] text-gray-600 uppercase tracking-wider font-medium px-4 py-2.5">Updated</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentTasks.map((task) => (
                        <tr
                          key={task.id}
                          className="border-b border-gray-700/20 hover:bg-gray-700/20 transition-colors"
                        >
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2">
                              <TaskStatusIcon status={task.status} />
                              <span className={cn(
                                'text-[10px] font-medium uppercase tracking-wide',
                                task.status === 'running' ? 'text-accent-400' :
                                task.status === 'completed' ? 'text-green-400' :
                                task.status === 'failed' ? 'text-red-400' :
                                task.status === 'pending' ? 'text-yellow-400' :
                                'text-gray-500',
                              )}>
                                {task.status}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-2.5">
                            <span className="text-gray-300 font-medium truncate block max-w-[200px]">
                              {task.name || 'Unnamed Task'}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 hidden sm:table-cell">
                            <span className="text-gray-500 text-[10px] bg-gray-700/40 px-2 py-0.5 rounded">
                              {'general'}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <span className="text-gray-500 text-[10px]">
                              {timeAgo(task.last_run_at || task.created_at)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* === FLOATING COMMAND BUTTON (FAB) === */}
      <div className="fixed bottom-6 right-6 z-40 group">
        <div className="absolute bottom-full right-0 mb-2 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <div className="bg-gray-800 border border-gray-700/60 text-gray-300 text-[11px] px-3 py-1.5 rounded-lg shadow-xl whitespace-nowrap">
            명령 내리기
            <span className="ml-2 text-gray-500 text-[10px]">Ctrl+K</span>
          </div>
        </div>
        <button
          onClick={() => setSpotlightOpen(true)}
          className={cn(
            'w-14 h-14 rounded-full flex items-center justify-center',
            'bg-gradient-to-br from-primary-500 to-primary-600',
            'shadow-lg shadow-primary-500/30 hover:shadow-primary-500/50',
            'hover:scale-110 active:scale-95',
            'transition-all duration-200',
          )}
        >
          <Terminal className="w-6 h-6 text-white" />
        </button>
      </div>

      {/* === SPOTLIGHT OVERLAY === */}
      {spotlightOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setSpotlightOpen(false);
              setCommand('');
            }
          }}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

          {/* Spotlight panel */}
          <div className="spotlight-panel relative w-full max-w-xl mx-4">
            {/* Toast */}
            {commandSent && (
              <div className="flex justify-center mb-3">
                <div className="px-4 py-1.5 bg-gray-800 border border-accent-500/30 rounded-lg text-[11px] text-accent-400 shadow-lg">
                  커맨드가 접수되었습니다. 파이프라인을 준비 중입니다...
                </div>
              </div>
            )}

            {/* Input card */}
            <div className="bg-gray-800/95 backdrop-blur-xl rounded-2xl border border-gray-700/50 shadow-2xl overflow-hidden">
              {/* Input row */}
              <form onSubmit={handleCommand} className="flex items-center gap-3 px-5 py-4">
                <Terminal className="w-5 h-5 text-primary-500 flex-shrink-0" />
                <input
                  ref={spotlightInputRef}
                  type="text"
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  placeholder="명령을 입력하세요, 사령관님."
                  className="flex-1 bg-transparent text-sm text-gray-200 placeholder-gray-600 outline-none border-none font-mono caret-primary-500"
                />
                {command.trim() ? (
                  <button
                    type="submit"
                    className="flex-shrink-0 p-2 rounded-lg bg-gradient-to-r from-primary-500 to-primary-600 text-white shadow-lg shadow-primary-500/20 hover:shadow-primary-500/30 hover:scale-105 transition-all duration-200"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => { setSpotlightOpen(false); setCommand(''); }}
                    className="flex-shrink-0 p-2 rounded-lg bg-gray-700/50 text-gray-500 hover:text-gray-300 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </form>

              {/* Divider */}
              <div className="h-px bg-gray-700/40" />

              {/* Quick action chips */}
              <div className="px-5 py-3 flex flex-wrap gap-2">
                {QUICK_ACTIONS.map((qa) => (
                  <button
                    key={qa.label}
                    onClick={() => handleQuickAction(qa.command)}
                    className={cn(
                      'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg',
                      'bg-gray-700/40 hover:bg-gray-700/70 border border-gray-700/40 hover:border-gray-600/60',
                      'text-[11px] text-gray-400 hover:text-gray-200',
                      'transition-all duration-150',
                    )}
                  >
                    <qa.icon className="w-3 h-3" />
                    {qa.label}
                  </button>
                ))}
              </div>

              {/* Keyboard hint */}
              <div className="px-5 py-2 border-t border-gray-700/30 flex items-center justify-between text-[10px] text-gray-600">
                <span>Enter to send</span>
                <span>ESC to close</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
