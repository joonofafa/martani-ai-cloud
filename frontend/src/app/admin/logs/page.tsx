'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  ScrollText, BarChart3, RefreshCw, ChevronLeft, ChevronRight,
  LogIn, Upload, Download, Trash2, Move, Copy, MessageSquare, Shield, X as XIcon,
} from 'lucide-react';
import { useAuthStore } from '@/lib/store';
import { useTranslation } from '@/hooks/use-translation';
import { adminApi } from '@/lib/api';
import type { AuditLogEntry, DailyUsageStats } from '@/lib/api';
import { Sidebar } from '@/components/sidebar';
import { cn } from '@/lib/utils';

const ACTION_TYPES = [
  'login_success', 'login_failure',
  'file_upload', 'file_download', 'file_delete', 'file_move',
  'webdav_upload', 'webdav_download', 'webdav_delete', 'webdav_copy', 'webdav_move',
  'chat_message', 'admin_action',
] as const;

const ACTION_ICONS: Record<string, typeof LogIn> = {
  login_success: LogIn,
  login_failure: LogIn,
  file_upload: Upload,
  file_download: Download,
  file_delete: Trash2,
  file_move: Move,
  webdav_upload: Upload,
  webdav_download: Download,
  webdav_delete: Trash2,
  webdav_copy: Copy,
  webdav_move: Move,
  chat_message: MessageSquare,
  admin_action: Shield,
};

const ACTION_COLORS: Record<string, string> = {
  login_success: 'text-green-400 bg-green-400/10',
  login_failure: 'text-red-400 bg-red-400/10',
  file_upload: 'text-blue-400 bg-blue-400/10',
  file_download: 'text-blue-400 bg-blue-400/10',
  file_delete: 'text-red-400 bg-red-400/10',
  file_move: 'text-yellow-400 bg-yellow-400/10',
  webdav_upload: 'text-cyan-400 bg-cyan-400/10',
  webdav_download: 'text-cyan-400 bg-cyan-400/10',
  webdav_delete: 'text-red-400 bg-red-400/10',
  webdav_copy: 'text-cyan-400 bg-cyan-400/10',
  webdav_move: 'text-cyan-400 bg-cyan-400/10',
  chat_message: 'text-purple-400 bg-purple-400/10',
  admin_action: 'text-amber-400 bg-amber-400/10',
};

function formatDetail(detail: Record<string, unknown> | null): string {
  if (!detail) return '-';
  const parts: string[] = [];
  if (detail.filename) parts.push(String(detail.filename));
  if (detail.email) parts.push(String(detail.email));
  if (detail.action) parts.push(String(detail.action));
  if (detail.agent_type) parts.push(String(detail.agent_type));
  if (detail.size) {
    const kb = Number(detail.size) / 1024;
    parts.push(kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb.toFixed(0)} KB`);
  }
  if (detail.input_tokens || detail.output_tokens) {
    const total = (Number(detail.input_tokens) || 0) + (Number(detail.output_tokens) || 0);
    parts.push(`${(total / 1000).toFixed(1)}K tokens`);
  }
  return parts.join(' | ') || '-';
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

// ─── Stats bar chart (pure CSS) ───
function StatsChart({ data, metricKey, label, color }: {
  data: DailyUsageStats[];
  metricKey: keyof DailyUsageStats;
  label: string;
  color: string;
}) {
  const values = data.map((d) => Number(d[metricKey]) || 0);
  const max = Math.max(...values, 1);
  return (
    <div className="bg-surface-dark rounded-lg border border-gray-800 p-4">
      <h4 className="text-sm font-medium text-gray-300 mb-3">{label}</h4>
      <div className="flex items-end gap-[2px] h-24">
        {data.map((d, i) => {
          const v = values[i];
          const pct = (v / max) * 100;
          return (
            <div
              key={d.date}
              className="flex-1 min-w-0 group relative"
              title={`${d.date}: ${v.toLocaleString()}`}
            >
              <div
                className={cn('w-full rounded-t transition-all', color)}
                style={{ height: `${Math.max(pct, 2)}%` }}
              />
            </div>
          );
        })}
      </div>
      <div className="flex justify-between mt-2 text-xs text-gray-500">
        <span>{data.length > 0 ? data[0].date.slice(5) : ''}</span>
        <span>{data.length > 0 ? data[data.length - 1].date.slice(5) : ''}</span>
      </div>
    </div>
  );
}

export default function AdminLogsPage() {
  const router = useRouter();
  const { t } = useTranslation(['admin', 'common']);
  const { user, isAuthenticated, isLoading } = useAuthStore();

  const [tab, setTab] = useState<'activity' | 'stats'>('activity');
  const [page, setPage] = useState(1);
  const [filterAction, setFilterAction] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.push('/login');
    if (!isLoading && user && user.role !== 'admin') router.push('/files');
  }, [isAuthenticated, isLoading, user, router]);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [filterAction, filterDateFrom, filterDateTo]);

  const logsQuery = useQuery({
    queryKey: ['admin-logs', page, filterAction, filterDateFrom, filterDateTo],
    queryFn: () => adminApi.getActivityLogs({
      page,
      limit: 50,
      action: filterAction || undefined,
      date_from: filterDateFrom || undefined,
      date_to: filterDateTo || undefined,
    }),
    enabled: tab === 'activity' && isAuthenticated && user?.role === 'admin',
    refetchInterval: 30000,
  });

  const statsQuery = useQuery({
    queryKey: ['admin-usage-stats'],
    queryFn: () => adminApi.getUsageStats(30),
    enabled: tab === 'stats' && isAuthenticated && user?.role === 'admin',
  });

  const handleRefresh = useCallback(() => {
    if (tab === 'activity') logsQuery.refetch();
    else statsQuery.refetch();
  }, [tab, logsQuery, statsQuery]);

  if (isLoading || !user || user.role !== 'admin') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500" />
      </div>
    );
  }

  const logs = logsQuery.data;
  const stats = statsQuery.data || [];
  const totalPages = logs ? Math.ceil(logs.total / logs.limit) : 0;

  return (
    <div className="flex h-screen bg-surface overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <ScrollText className="w-6 h-6 text-primary-400" />
              <h1 className="text-2xl font-bold text-white">{t('logs.title')}</h1>
            </div>
            <button
              onClick={handleRefresh}
              className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm transition-colors"
            >
              <RefreshCw className={cn('w-4 h-4', (logsQuery.isFetching || statsQuery.isFetching) && 'animate-spin')} />
              {t('logs.refresh')}
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mb-6 bg-gray-800/50 rounded-lg p-1 w-fit">
            <button
              onClick={() => setTab('activity')}
              className={cn(
                'px-4 py-2 rounded-md text-sm font-medium transition-colors',
                tab === 'activity'
                  ? 'bg-primary-500/20 text-primary-400'
                  : 'text-gray-400 hover:text-gray-200'
              )}
            >
              <ScrollText className="w-4 h-4 inline mr-2" />
              {t('logs.activityTab')}
            </button>
            <button
              onClick={() => setTab('stats')}
              className={cn(
                'px-4 py-2 rounded-md text-sm font-medium transition-colors',
                tab === 'stats'
                  ? 'bg-primary-500/20 text-primary-400'
                  : 'text-gray-400 hover:text-gray-200'
              )}
            >
              <BarChart3 className="w-4 h-4 inline mr-2" />
              {t('logs.statsTab')}
            </button>
          </div>

          {/* Activity Logs Tab */}
          {tab === 'activity' && (
            <>
              {/* Filters */}
              <div className="flex flex-wrap gap-3 mb-4">
                <select
                  value={filterAction}
                  onChange={(e) => setFilterAction(e.target.value)}
                  className="bg-gray-800 text-gray-200 border border-gray-700 rounded-lg px-3 py-1.5 text-sm"
                >
                  <option value="">{t('logs.filterAction')}: {t('logs.all')}</option>
                  {ACTION_TYPES.map((a) => (
                    <option key={a} value={a}>{t(`logs.actions.${a}`)}</option>
                  ))}
                </select>
                <input
                  type="date"
                  value={filterDateFrom}
                  onChange={(e) => setFilterDateFrom(e.target.value)}
                  placeholder={t('logs.filterDateFrom')}
                  className="bg-gray-800 text-gray-200 border border-gray-700 rounded-lg px-3 py-1.5 text-sm"
                />
                <input
                  type="date"
                  value={filterDateTo}
                  onChange={(e) => setFilterDateTo(e.target.value)}
                  placeholder={t('logs.filterDateTo')}
                  className="bg-gray-800 text-gray-200 border border-gray-700 rounded-lg px-3 py-1.5 text-sm"
                />
                {(filterAction || filterDateFrom || filterDateTo) && (
                  <button
                    onClick={() => { setFilterAction(''); setFilterDateFrom(''); setFilterDateTo(''); }}
                    className="flex items-center gap-1 px-2 py-1.5 text-gray-400 hover:text-gray-200 text-sm"
                  >
                    <XIcon className="w-3 h-3" />
                  </button>
                )}
              </div>

              {/* Table */}
              <div className="bg-surface-dark rounded-lg border border-gray-800 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-800 text-gray-400 text-left">
                        <th className="px-4 py-3 font-medium">{t('logs.action')}</th>
                        <th className="px-4 py-3 font-medium">{t('logs.user')}</th>
                        <th className="px-4 py-3 font-medium">{t('logs.detail')}</th>
                        <th className="px-4 py-3 font-medium">{t('logs.ip')}</th>
                        <th className="px-4 py-3 font-medium">{t('logs.time')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logs?.items.map((log: AuditLogEntry) => {
                        const Icon = ACTION_ICONS[log.action] || ScrollText;
                        const color = ACTION_COLORS[log.action] || 'text-gray-400 bg-gray-400/10';
                        return (
                          <tr key={log.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                            <td className="px-4 py-3">
                              <span className={cn('inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium', color)}>
                                <Icon className="w-3.5 h-3.5" />
                                {t(`logs.actions.${log.action}`) || log.action}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-gray-300 truncate max-w-[180px]">
                              {log.user_email || log.user_name || '-'}
                            </td>
                            <td className="px-4 py-3 text-gray-400 truncate max-w-[250px]">
                              {formatDetail(log.detail)}
                            </td>
                            <td className="px-4 py-3 text-gray-500 font-mono text-xs">
                              {log.ip_address || '-'}
                            </td>
                            <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                              {formatTime(log.created_at)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {(!logs || logs.items.length === 0) && !logsQuery.isLoading && (
                  <div className="text-center py-12 text-gray-500">
                    {t('logs.noLogs')}
                  </div>
                )}

                {logsQuery.isLoading && (
                  <div className="flex justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary-500" />
                  </div>
                )}
              </div>

              {/* Pagination */}
              {logs && totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 text-sm text-gray-400">
                  <span>{t('logs.total')}: {logs.total}</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPage(Math.max(1, page - 1))}
                      disabled={page <= 1}
                      className="px-3 py-1 bg-gray-800 rounded hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span>{t('logs.page')} {page} / {totalPages}</span>
                    <button
                      onClick={() => setPage(Math.min(totalPages, page + 1))}
                      disabled={page >= totalPages}
                      className="px-3 py-1 bg-gray-800 rounded hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Stats Tab */}
          {tab === 'stats' && (
            <>
              <p className="text-gray-400 text-sm mb-4">{t('logs.stats.last30days')}</p>

              {statsQuery.isLoading ? (
                <div className="flex justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary-500" />
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <StatsChart data={stats} metricKey="dau" label={t('logs.stats.dau')} color="bg-green-500" />
                  <StatsChart data={stats} metricKey="file_uploads" label={t('logs.stats.fileUploads')} color="bg-blue-500" />
                  <StatsChart data={stats} metricKey="file_downloads" label={t('logs.stats.fileDownloads')} color="bg-cyan-500" />
                  <StatsChart data={stats} metricKey="chat_messages" label={t('logs.stats.chatMessages')} color="bg-purple-500" />
                  <StatsChart data={stats} metricKey="webdav_ops" label={t('logs.stats.webdavOps')} color="bg-amber-500" />
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
