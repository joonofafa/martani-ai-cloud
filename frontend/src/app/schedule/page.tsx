'use client';

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ChevronLeft, ChevronRight, Plus, Trash2, X, Pencil, Bot,
  Search, Mail, Globe, FileText, StickyNote, Calendar, RefreshCw,
  Code, Database, Loader2, Clock, Play, CheckCircle2, XCircle,
} from 'lucide-react';
import {
  addDays, format, isSameDay, isToday, parseISO, startOfDay,
} from 'date-fns';
import { ko, enUS } from 'date-fns/locale';
import { scheduleApi } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import { useTranslation } from '@/hooks/use-translation';
import { useI18nStore } from '@/lib/i18n';
import { Sidebar } from '@/components/sidebar';
import { AssistantPanel, type AssistantPanelRef } from '@/components/assistant-panel';
import { ContextMenuPortal, type ContextMenuItem } from '@/components/context-menu';
import { cn } from '@/lib/utils';
import type { ScheduleTask, AnalyzeResult } from '@/types';

const TOOL_ICONS: Record<string, typeof Search> = {
  web_search: Search, web_fetch: Search, web_screenshot: Globe,
  send_mail: Mail,
  browser_navigate: Globe, browser_read_page: Globe, browser_click: Globe,
  browser_fill: Globe, browser_screenshot: Globe, browser_scroll: Globe,
  browser_execute_js: Globe, browser_wait: Globe, browser_login: Globe,
  browser_select: Globe, browser_save_cookies: Globe, browser_load_cookies: Globe,
  create_text_file: FileText, list_files: FileText, read_file_content: FileText,
  read_file_info: FileText, create_folder: FileText, delete_file: FileText,
  move_file: FileText, share_file: FileText,
  search_files_by_content: Search, search_files_by_name: Search,
  create_note: StickyNote, list_notes: StickyNote, search_notes: StickyNote,
  read_note: StickyNote, update_note: StickyNote, delete_note: StickyNote,
  create_event: Calendar, list_events: Calendar,
  execute_python: Code, execute_javascript: Code,
  create_collection_task: Database, run_collection_task: Database,
  list_collection_tasks: Database, get_collection_results: Database,
  save_memory: FileText, recall_memory: Search, get_current_time: Clock,
};

/** Resolve a tool function name to a human-readable label.
 *  Lookup order: tools.json fn.{tool} → schedule.json tools.{tool} → raw name */
function resolveToolLabel(tool: string, t: (k: string) => string): string {
  const fromFn = t(`fn.${tool}`);
  if (fromFn !== `fn.${tool}`) return fromFn;
  const fromSchedule = t(`tools.${tool}`);
  if (fromSchedule !== `tools.${tool}`) return fromSchedule;
  return tool;
}

const STATUS_CONFIG: Record<string, { icon: typeof Clock; color: string }> = {
  pending: { icon: Clock, color: 'text-yellow-400' },
  running: { icon: Play, color: 'text-blue-400 animate-pulse' },
  completed: { icon: CheckCircle2, color: 'text-green-400' },
  failed: { icon: XCircle, color: 'text-red-400' },
};

/** Format repeat info into a short human-readable label */
function formatRepeatLabel(task: ScheduleTask, t: (k: string) => string): string | null {
  if (task.cron_expression) {
    const c = task.cron_expression.trim();
    // Common cron patterns → friendly labels
    if (/^\*\/(\d+) \* \* \* \*$/.test(c)) {
      const mins = c.match(/^\*\/(\d+)/)?.[1];
      return `${mins}분마다`;
    }
    if (/^\d+ \* \* \* \*$/.test(c)) {
      const min = c.split(' ')[0];
      return `매시간 ${min}분`;
    }
    if (/^\d+ \d+ \* \* \*$/.test(c)) {
      const [min, hr] = c.split(' ');
      return `매일 ${hr}:${min.padStart(2, '0')}`;
    }
    // Fallback: show cron as-is
    return c;
  }
  if (task.repeat_type) {
    const key = `taskDialog.repeat${task.repeat_type.charAt(0).toUpperCase() + task.repeat_type.slice(1)}`;
    return t(key);
  }
  return null;
}

export default function SchedulePage() {
  const { t } = useTranslation(['schedule', 'tools']);
  const locale = useI18nStore((s) => s.locale);
  const dateLocale = locale === 'ko' ? ko : enUS;
  const queryClient = useQueryClient();
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useAuthStore();

  const assistantRef = useRef<AssistantPanelRef>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; task: ScheduleTask } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null);

  const requestDelete = (id: string, name: string) => setConfirmDelete({ id, name });
  const executeDelete = () => {
    if (confirmDelete) {
      deleteMutation.mutate(confirmDelete.id);
      setConfirmDelete(null);
    }
  };

  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.push('/login');
  }, [isAuthenticated, authLoading, router]);

  // Page offset: 0 = today + 6 days, -1 = 7 days before today, +1 = 7 days after default
  const [pageOffset, setPageOffset] = useState(0);

  const [selectedTask, setSelectedTask] = useState<ScheduleTask | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [addDate, setAddDate] = useState<Date | null>(null);

  // 7 days starting from today + pageOffset*7
  const pageStart = useMemo(() => {
    const today = startOfDay(new Date());
    return addDays(today, pageOffset * 7);
  }, [pageOffset]);

  const days = useMemo(() =>
    Array.from({ length: 7 }, (_, i) => addDays(pageStart, i)),
    [pageStart]
  );

  const weekStartStr = format(pageStart, 'yyyy-MM-dd');

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['schedule-tasks', weekStartStr],
    queryFn: () => scheduleApi.listTasks(weekStartStr),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => scheduleApi.deleteTask(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedule-tasks'] });
      setSelectedTask(null);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof scheduleApi.updateTask>[1] }) => scheduleApi.updateTask(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedule-tasks'] });
    },
  });

  // Group tasks by day
  const tasksByDay = useMemo(() => {
    const map = new Map<string, ScheduleTask[]>();
    days.forEach((d) => map.set(format(d, 'yyyy-MM-dd'), []));
    const todayKey = format(new Date(), 'yyyy-MM-dd');
    tasks.forEach((task) => {
      const isRecurring = task.cron_expression || task.repeat_type;
      if (isRecurring) {
        // Recurring tasks: show on today's column (or first day of visible range)
        const targetKey = map.has(todayKey) ? todayKey : days.length > 0 ? format(days[0], 'yyyy-MM-dd') : null;
        if (targetKey) {
          const arr = map.get(targetKey);
          if (arr) arr.push(task);
        }
      } else if (task.scheduled_at) {
        const key = format(parseISO(task.scheduled_at), 'yyyy-MM-dd');
        const arr = map.get(key);
        if (arr) arr.push(task);
      }
    });
    return map;
  }, [tasks, days]);

  const getUniqueToolIcons = (tools: string[]) => {
    const seen = new Set<string>();
    const icons: { key: string; Icon: typeof Search }[] = [];
    for (const tool of tools) {
      const Icon = TOOL_ICONS[tool];
      if (Icon) {
        const iconKey = Icon.displayName || tool;
        if (!seen.has(iconKey)) {
          seen.add(iconKey);
          icons.push({ key: tool, Icon });
        }
      }
    }
    return icons;
  };

  const handleSendToAI = useCallback((task: ScheduleTask) => {
    const msg = `${t('title')} "${task.name}":\n${task.prompt}\n\n${task.summary || ''}`;
    assistantRef.current?.sendMessage(msg);
  }, [t]);

  const getContextMenuItems = useCallback((task: ScheduleTask): ContextMenuItem[] => [
    {
      label: t('context.sendToAI'),
      icon: Bot,
      onClick: () => handleSendToAI(task),
    },
    {
      label: t('context.edit'),
      icon: Pencil,
      onClick: () => setSelectedTask(task),
    },
    {
      label: t('context.delete'),
      icon: Trash2,
      onClick: () => requestDelete(task.id, task.name),
      danger: true,
      separator: true,
    },
  ], [handleSendToAI, t]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500" />
      </div>
    );
  }

  return (
    <div className="h-screen flex overflow-hidden bg-surface">
      <Sidebar />

      <main className="flex-1 flex flex-col min-h-0 min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-gray-700 bg-gray-800/80 flex-shrink-0">
          <h1 className="text-sm font-semibold text-gray-100">{t('title')}</h1>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPageOffset((p) => p - 1)}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-gray-700 transition-colors"
              title={t('prevWeek')}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPageOffset(0)}
              className={cn(
                'px-3 py-1 rounded-lg text-sm font-medium transition-colors',
                pageOffset === 0
                  ? 'bg-primary-500/20 text-primary-400'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'
              )}
            >
              {t('today')}
            </button>
            <button
              onClick={() => setPageOffset((p) => p + 1)}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-gray-700 transition-colors"
              title={t('nextWeek')}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <div className="w-px h-5 bg-gray-700 mx-1" />
            <button
              onClick={() => { setAddDate(new Date()); setShowAddDialog(true); }}
              className="flex items-center gap-1.5 px-2.5 py-1 bg-primary-500 text-white text-sm rounded-lg hover:bg-primary-600 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              {t('addTask')}
            </button>
          </div>
        </div>

        {/* Day Columns */}
        <div className="flex-1 flex min-h-0 overflow-x-auto">
          {days.map((day) => {
            const dayKey = format(day, 'yyyy-MM-dd');
            const dayTasks = tasksByDay.get(dayKey) || [];
            const isCurrentDay = isToday(day);

            return (
              <div
                key={dayKey}
                className={cn(
                  'flex-1 min-w-[140px] flex flex-col border-r last:border-r-0',
                  isCurrentDay
                    ? 'border-r-primary-500/20 bg-primary-500/[0.03]'
                    : 'border-r-gray-800/60'
                )}
              >
                {/* Day header */}
                <div className={cn(
                  'flex items-center justify-between px-3 py-2.5 border-b flex-shrink-0',
                  isCurrentDay ? 'border-b-primary-500/30 bg-primary-500/10' : 'border-b-gray-800/60'
                )}>
                  <div className="flex items-baseline gap-1.5">
                    <span className={cn(
                      'text-lg font-bold',
                      isCurrentDay ? 'text-primary-300' : 'text-gray-300'
                    )}>
                      {format(day, 'd')}
                    </span>
                    <span className={cn(
                      'text-xs',
                      isCurrentDay ? 'text-primary-400' : 'text-gray-500'
                    )}>
                      {format(day, 'EEE', { locale: dateLocale })}
                    </span>
                    {isCurrentDay && (
                      <span className="text-[10px] text-primary-400 font-medium ml-1">{t('today')}</span>
                    )}
                  </div>
                  <button
                    onClick={() => { setAddDate(day); setShowAddDialog(true); }}
                    className="p-0.5 rounded text-gray-600 hover:text-gray-300 hover:bg-gray-800 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Task Cards */}
                <div className="flex-1 p-2 space-y-2 overflow-y-auto">
                  {dayTasks.map((task) => {
                    const statusCfg = STATUS_CONFIG[task.status] || STATUS_CONFIG.pending;
                    const StatusIcon = statusCfg.icon;
                    const toolIcons = getUniqueToolIcons(task.tools_predicted || []);

                    return (
                      <div
                        key={task.id}
                        onClick={() => setSelectedTask(task)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setContextMenu({ x: e.clientX, y: e.clientY, task });
                        }}
                        className="group relative p-2.5 rounded-lg bg-gray-800/60 hover:bg-gray-800 border border-gray-700/50 hover:border-gray-600 cursor-pointer transition-all"
                      >
                        <div className="flex items-start justify-between gap-1">
                          <h3 className="text-sm font-medium text-gray-200 line-clamp-2 flex-1">
                            {task.name}
                          </h3>
                          <StatusIcon className={cn('w-3.5 h-3.5 flex-shrink-0 mt-0.5', statusCfg.color)} />
                        </div>
                        {task.summary && (
                          <p className="text-xs text-gray-500 mt-1 line-clamp-2">{task.summary}</p>
                        )}
                        {toolIcons.length > 0 && (
                          <div className="flex items-center gap-1 mt-1.5">
                            {toolIcons.slice(0, 4).map(({ key, Icon }) => (
                              <Icon key={key} className="w-3 h-3 text-gray-500" />
                            ))}
                            {toolIcons.length > 4 && (
                              <span className="text-xs text-gray-600">+{toolIcons.length - 4}</span>
                            )}
                          </div>
                        )}
                        <div className="flex items-center justify-between mt-1.5">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-gray-600">
                              {task.scheduled_at && format(parseISO(task.scheduled_at), 'HH:mm')}
                            </span>
                            {(() => {
                              const label = formatRepeatLabel(task, t);
                              return label ? (
                                <span className="inline-flex items-center gap-0.5 text-[10px] text-primary-400/70 bg-primary-500/10 px-1.5 py-0.5 rounded-full">
                                  <RefreshCw className="w-2.5 h-2.5" />
                                  {label}
                                </span>
                              ) : null;
                            })()}
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              requestDelete(task.id, task.name);
                            }}
                            className="p-0.5 rounded text-gray-700 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {!isLoading && tasks.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none" style={{ left: '16rem' }}>
            <Clock className="w-12 h-12 mb-3 text-gray-700" />
            <p className="text-sm text-gray-500">{t('noTasks')}</p>
          </div>
        )}
      </main>

      <AssistantPanel ref={assistantRef} />

      {contextMenu && (
        <ContextMenuPortal
          x={contextMenu.x}
          y={contextMenu.y}
          items={getContextMenuItems(contextMenu.task)}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Task Detail Dialog */}
      {selectedTask && (
        <TaskDetailDialog
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onDelete={(id) => { setSelectedTask(null); requestDelete(id, selectedTask.name); }}
          onUpdate={(id, data) => updateMutation.mutate({ id, data })}
          t={t}
        />
      )}

      {/* Add Task Dialog */}
      {showAddDialog && addDate && (
        <AddTaskDialog
          initialDate={addDate}
          onClose={() => setShowAddDialog(false)}
          onSuccess={() => {
            setShowAddDialog(false);
            queryClient.invalidateQueries({ queryKey: ['schedule-tasks'] });
          }}
          t={t}
        />
      )}

      {/* Delete Confirm Dialog */}
      {confirmDelete && (
        <ConfirmDialog
          title={t('taskDialog.delete')}
          message={t('taskDialog.deleteConfirm', { name: confirmDelete.name })}
          onConfirm={executeDelete}
          onCancel={() => setConfirmDelete(null)}
          t={t}
        />
      )}
    </div>
  );
}

// ─── Task Detail Dialog ───

function TaskDetailDialog({
  task, onClose, onDelete, onUpdate, t,
}: {
  task: ScheduleTask;
  onClose: () => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, data: Parameters<typeof scheduleApi.updateTask>[1]) => void;
  t: (key: string) => string;
}) {
  const repeatLabel = formatRepeatLabel(task, t);
  const [repeatType, setRepeatType] = useState(task.repeat_type || '');
  const [isEnabled, setIsEnabled] = useState(task.is_enabled);
  const statusCfg = STATUS_CONFIG[task.status] || STATUS_CONFIG.pending;
  const StatusIcon = statusCfg.icon;
  const toolIcons = (task.tools_predicted || [])
    .map((tool) => ({ tool, Icon: TOOL_ICONS[tool] }))
    .filter(({ Icon }) => Icon);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-gray-100">{task.name}</h2>
            <StatusIcon className={cn('w-4 h-4', statusCfg.color)} />
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-gray-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">{t('taskDialog.prompt')}</label>
            <p className="mt-1 text-sm text-gray-300 whitespace-pre-wrap">{task.prompt}</p>
          </div>

          {toolIcons.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {toolIcons.map(({ tool, Icon }) => (
                <div key={tool} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-800 text-gray-400 text-xs">
                  <Icon className="w-3 h-3" />
                  <span>{resolveToolLabel(tool, t)}</span>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center gap-4">
            <div className="flex-1">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">{t('taskDialog.repeat')}</label>
              {task.cron_expression ? (
                <div className="mt-1 flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-800 border border-gray-700">
                  <RefreshCw className="w-3.5 h-3.5 text-primary-400" />
                  <span className="text-sm text-gray-200">{repeatLabel}</span>
                </div>
              ) : (
                <select
                  value={repeatType}
                  onChange={(e) => {
                    setRepeatType(e.target.value);
                    onUpdate(task.id, { repeat_type: e.target.value || null });
                  }}
                  className="mt-1 w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-200 text-sm focus:outline-none focus:border-primary-500"
                >
                  <option value="">{t('taskDialog.repeatNone')}</option>
                  <option value="daily">{t('taskDialog.repeatDaily')}</option>
                  <option value="weekly">{t('taskDialog.repeatWeekly')}</option>
                  <option value="monthly">{t('taskDialog.repeatMonthly')}</option>
                </select>
              )}
            </div>

            <div className="flex flex-col items-center gap-1 pt-4">
              <label className="text-xs font-medium text-gray-500">{t('taskDialog.enabled')}</label>
              <button
                onClick={() => {
                  const next = !isEnabled;
                  setIsEnabled(next);
                  onUpdate(task.id, { is_enabled: next });
                }}
                className={cn(
                  'relative w-11 h-6 rounded-full transition-colors',
                  isEnabled ? 'bg-primary-500' : 'bg-gray-700'
                )}
              >
                <span className={cn(
                  'absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform',
                  isEnabled ? 'left-[22px]' : 'left-0.5'
                )} />
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-800">
          <button
            onClick={() => onDelete(task.id)}
            className="px-3 py-1.5 rounded-lg text-sm text-red-400 hover:bg-red-500/10 transition-colors"
          >
            {t('taskDialog.delete')}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-sm text-gray-300 bg-gray-800 hover:bg-gray-700 transition-colors"
          >
            {t('taskDialog.close')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Add Task Dialog ───

function AddTaskDialog({
  initialDate, onClose, onSuccess, t, initialPrompt,
}: {
  initialDate: Date;
  onClose: () => void;
  onSuccess: () => void;
  t: (key: string) => string;
  initialPrompt?: string;
}) {
  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState(initialPrompt || '');
  const [scheduledDate, setScheduledDate] = useState(format(initialDate, "yyyy-MM-dd'T'HH:mm"));
  const [repeatType, setRepeatType] = useState('');
  const [analyzeResult, setAnalyzeResult] = useState<AnalyzeResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [notActionable, setNotActionable] = useState(false);

  const analyzeMutation = useMutation({
    mutationFn: (p: string) => scheduleApi.analyze(p),
    onSuccess: (result) => {
      setAnalyzeResult(result);
      if (!result.actionable) {
        setNotActionable(true);
      } else {
        setNotActionable(false);
        if (result.name && !name) setName(result.name);
      }
      setIsAnalyzing(false);
    },
    onError: () => setIsAnalyzing(false),
  });

  const createMutation = useMutation({
    mutationFn: (data: Parameters<typeof scheduleApi.createTask>[0]) => scheduleApi.createTask(data),
    onSuccess: onSuccess,
  });

  const handleAnalyze = () => {
    if (!prompt.trim()) return;
    setIsAnalyzing(true);
    setNotActionable(false);
    analyzeMutation.mutate(prompt);
  };

  const handleSubmit = () => {
    createMutation.mutate({
      name: name || analyzeResult?.name || prompt.slice(0, 50),
      prompt,
      scheduled_at: new Date(scheduledDate).toISOString(),
      repeat_type: repeatType || null,
      summary: analyzeResult?.summary || null,
      tools_predicted: analyzeResult?.tools || null,
    });
  };

  const isAnalyzed = !!analyzeResult && analyzeResult.actionable;
  const toolIcons = (analyzeResult?.tools || [])
    .map((tool) => ({ tool, Icon: TOOL_ICONS[tool] }))
    .filter(({ Icon }) => Icon);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <h2 className="text-lg font-semibold text-gray-100">{t('taskDialog.addTitle')}</h2>
          <button onClick={onClose} className="p-1 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-gray-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">{t('taskDialog.name')}</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('taskDialog.namePlaceholder')}
              className="mt-1 w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-200 text-sm placeholder-gray-600 focus:outline-none focus:border-primary-500"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">{t('taskDialog.prompt')}</label>
            <textarea
              value={prompt}
              onChange={(e) => { setPrompt(e.target.value); setAnalyzeResult(null); setNotActionable(false); }}
              placeholder={t('taskDialog.promptPlaceholder')}
              rows={3}
              className="mt-1 w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-200 text-sm placeholder-gray-600 focus:outline-none focus:border-primary-500 resize-none"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">{t('taskDialog.scheduledAt')}</label>
            <input
              type="datetime-local"
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-200 text-sm focus:outline-none focus:border-primary-500"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">{t('taskDialog.repeat')}</label>
            <select
              value={repeatType}
              onChange={(e) => setRepeatType(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-200 text-sm focus:outline-none focus:border-primary-500"
            >
              <option value="">{t('taskDialog.repeatNone')}</option>
              <option value="daily">{t('taskDialog.repeatDaily')}</option>
              <option value="weekly">{t('taskDialog.repeatWeekly')}</option>
              <option value="monthly">{t('taskDialog.repeatMonthly')}</option>
            </select>
          </div>

          {analyzeResult && analyzeResult.actionable && (
            <div className="p-3 rounded-lg bg-gray-800/60 border border-gray-700/50 space-y-2">
              {analyzeResult.summary && (
                <p className="text-sm text-gray-400">{analyzeResult.summary}</p>
              )}
              {toolIcons.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {toolIcons.map(({ tool, Icon }) => (
                    <div key={tool} className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-700/60 text-gray-400 text-xs">
                      <Icon className="w-3 h-3" />
                      <span>{resolveToolLabel(tool, t)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {notActionable && (
            <p className="text-sm text-red-400">{t('taskDialog.notActionable')}</p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-800">
          {!isAnalyzed ? (
            <>
              <button
                onClick={handleAnalyze}
                disabled={!prompt.trim() || isAnalyzing}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-gray-800 text-gray-200 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isAnalyzing ? (
                  <><Loader2 className="w-4 h-4 animate-spin" />{t('taskDialog.analyzing')}</>
                ) : (
                  t('taskDialog.analyze')
                )}
              </button>
              <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors">
                {t('taskDialog.close')}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleSubmit}
                disabled={createMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-primary-500 text-white hover:bg-primary-600 disabled:opacity-50 transition-colors"
              >
                {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {t('taskDialog.add')}
              </button>
              <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors">
                {t('taskDialog.close')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Confirm Dialog ───

function ConfirmDialog({
  title, message, onConfirm, onCancel, t,
}: {
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  t: (key: string) => string;
}) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4" onClick={onCancel}>
      <div
        className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-sm shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-gray-800">
          <h2 className="text-lg font-semibold text-gray-100">{title}</h2>
        </div>
        <div className="px-5 py-4">
          <p className="text-sm text-gray-300">{message}</p>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-800">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors"
          >
            {t('cancel')}
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
          >
            {t('taskDialog.delete')}
          </button>
        </div>
      </div>
    </div>
  );
}
