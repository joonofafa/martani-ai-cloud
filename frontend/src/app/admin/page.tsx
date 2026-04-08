'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/lib/store';
import { useTranslation } from '@/hooks/use-translation';
import { adminApi } from '@/lib/api';
import { Sidebar } from '@/components/sidebar';
import { formatBytes } from '@/lib/utils';
import { Users, Files, HardDrive, Activity, UserCheck, Database, Cpu, Zap } from 'lucide-react';

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toString();
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const { t } = useTranslation('admin');
  const { user, isAuthenticated, isLoading } = useAuthStore();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
    if (!isLoading && user && user.role !== 'admin') {
      router.push('/files');
    }
  }, [isAuthenticated, isLoading, user, router]);

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: adminApi.getStats,
    enabled: isAuthenticated && user?.role === 'admin',
  });

  if (isLoading || !user || user.role !== 'admin') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  const storagePercentage = stats && stats.total_storage_quota > 0
    ? (stats.total_storage_used / stats.total_storage_quota) * 100
    : 0;

  const hwPercentage = stats && stats.hw_storage_total > 0
    ? (stats.hw_storage_used / stats.hw_storage_total) * 100
    : 0;

  const martaniPercentage = stats && stats.hw_storage_total > 0
    ? (stats.martani_storage_used / stats.hw_storage_total) * 100
    : 0;

  const tokenPercentage = stats && stats.total_tokens_quota > 0
    ? (stats.total_tokens_used / stats.total_tokens_quota) * 100
    : 0;

  return (
    <div className="min-h-screen flex bg-surface">
      <Sidebar />

      <main className="flex-1 p-8">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center gap-3 mb-8">
            <Activity className="w-8 h-8 text-primary-400" />
            <h1 className="text-2xl font-bold text-gray-100">{t('dashboard.title')}</h1>
          </div>

          {statsLoading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
            </div>
          ) : stats ? (
            <>
              {/* Stats Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                {/* Total Users */}
                <div className="bg-gray-800 rounded-xl shadow-sm p-6">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-primary-500/20 rounded-lg">
                      <Users className="w-6 h-6 text-primary-400" />
                    </div>
                    <div>
                      <p className="text-sm text-gray-400">{t('dashboard.totalUsers')}</p>
                      <p className="text-2xl font-bold text-gray-100">{stats.total_users}</p>
                    </div>
                  </div>
                </div>

                {/* Active Users */}
                <div className="bg-gray-800 rounded-xl shadow-sm p-6">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-accent-500/20 rounded-lg">
                      <UserCheck className="w-6 h-6 text-accent-400" />
                    </div>
                    <div>
                      <p className="text-sm text-gray-400">{t('dashboard.activeUsers')}</p>
                      <p className="text-2xl font-bold text-gray-100">{stats.active_users}</p>
                    </div>
                  </div>
                </div>

                {/* Total Files */}
                <div className="bg-gray-800 rounded-xl shadow-sm p-6">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-accent-500/20 rounded-lg">
                      <Files className="w-6 h-6 text-accent-400" />
                    </div>
                    <div>
                      <p className="text-sm text-gray-400">{t('dashboard.totalFiles')}</p>
                      <p className="text-2xl font-bold text-gray-100">{stats.total_files}</p>
                    </div>
                  </div>
                </div>

                {/* Total Tokens */}
                <div className="bg-gray-800 rounded-xl shadow-sm p-6">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-purple-500/20 rounded-lg">
                      <Zap className="w-6 h-6 text-purple-400" />
                    </div>
                    <div>
                      <p className="text-sm text-gray-400">{t('dashboard.totalTokens')}</p>
                      <p className="text-lg font-bold text-gray-100">
                        {formatTokens(stats.total_tokens_used)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* H/W Storage */}
              {stats.hw_storage_total > 0 && (
                <div className="bg-gray-800 rounded-xl shadow-sm p-6 mb-6">
                  <h2 className="text-lg font-semibold text-gray-100 mb-4">{t('dashboard.hwStorage')}</h2>
                  <div className="flex items-center gap-4">
                    <Cpu className="w-8 h-8 text-gray-400" />
                    <div className="flex-1 space-y-4">
                      {/* Martani Cloud usage */}
                      <div>
                        <div className="flex justify-between text-sm mb-2">
                          <span className="text-primary-400 font-medium">
                            Martani Cloud: {formatBytes(stats.martani_storage_used)}
                          </span>
                          <span className="text-gray-400">
                            {t('dashboard.total')}: {formatBytes(stats.hw_storage_total)}
                          </span>
                        </div>
                        <div className="w-full bg-gray-700 rounded-full h-3 relative">
                          <div
                            className="h-3 rounded-full transition-all bg-primary-500"
                            style={{ width: `${Math.min(martaniPercentage, 100)}%` }}
                          />
                        </div>
                        <p className="text-sm text-gray-400 mt-1">
                          {martaniPercentage.toFixed(1)}% {t('dashboard.inUse')}
                        </p>
                      </div>
                      {/* Overall disk usage */}
                      <div>
                        <div className="flex justify-between text-sm mb-2">
                          <span className="text-gray-400">
                            {t('dashboard.diskUsed')}: {formatBytes(stats.hw_storage_used)}
                          </span>
                          <span className="text-gray-400">
                            {hwPercentage.toFixed(1)}%
                          </span>
                        </div>
                        <div className="w-full bg-gray-700 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full transition-all ${
                              hwPercentage > 90
                                ? 'bg-red-500'
                                : hwPercentage > 70
                                ? 'bg-yellow-500'
                                : 'bg-gray-500'
                            }`}
                            style={{ width: `${Math.min(hwPercentage, 100)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* User Quota Storage + Token Usage side by side */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                {/* User Quota Storage */}
                <div className="bg-gray-800 rounded-xl shadow-sm p-6">
                  <h2 className="text-lg font-semibold text-gray-100 mb-4">{t('dashboard.totalStorage')}</h2>
                  <div className="flex items-center gap-4">
                    <HardDrive className="w-8 h-8 text-gray-400" />
                    <div className="flex-1">
                      <div className="flex justify-between text-sm mb-2">
                        <span className="text-gray-400">
                          {formatBytes(stats.total_storage_used)}
                        </span>
                        <span className="text-gray-400">
                          {formatBytes(stats.total_storage_quota)}
                        </span>
                      </div>
                      <div className="w-full bg-gray-700 rounded-full h-3">
                        <div
                          className={`h-3 rounded-full transition-all ${
                            storagePercentage > 90
                              ? 'bg-red-500'
                              : storagePercentage > 70
                              ? 'bg-yellow-500'
                              : 'bg-green-500'
                          }`}
                          style={{ width: `${Math.min(storagePercentage, 100)}%` }}
                        />
                      </div>
                      <p className="text-sm text-gray-400 mt-2">
                        {storagePercentage.toFixed(1)}% {t('dashboard.inUse')}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Token Usage */}
                <div className="bg-gray-800 rounded-xl shadow-sm p-6">
                  <h2 className="text-lg font-semibold text-gray-100 mb-4">{t('dashboard.tokenUsage')}</h2>
                  <div className="flex items-center gap-4">
                    <Zap className="w-8 h-8 text-purple-400" />
                    <div className="flex-1">
                      <div className="flex justify-between text-sm mb-2">
                        <span className="text-gray-400">
                          {formatTokens(stats.total_tokens_used)}
                        </span>
                        <span className="text-gray-400">
                          {formatTokens(stats.total_tokens_quota)}
                        </span>
                      </div>
                      <div className="w-full bg-gray-700 rounded-full h-3">
                        <div
                          className={`h-3 rounded-full transition-all ${
                            tokenPercentage > 90
                              ? 'bg-red-500'
                              : tokenPercentage > 70
                              ? 'bg-yellow-500'
                              : 'bg-purple-500'
                          }`}
                          style={{ width: `${Math.min(tokenPercentage, 100)}%` }}
                        />
                      </div>
                      <p className="text-sm text-gray-400 mt-2">
                        {tokenPercentage.toFixed(1)}% {t('dashboard.inUse')}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Quick Links */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <a
                  href="/admin/users"
                  className="bg-gray-800 rounded-xl shadow-sm p-6 hover:border-gray-600 transition-shadow"
                >
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-primary-500/20 rounded-lg">
                      <Users className="w-6 h-6 text-primary-400" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-100">{t('dashboard.userManagement')}</h3>
                      <p className="text-sm text-gray-400">
                        {t('dashboard.userManagementDesc')}
                      </p>
                    </div>
                  </div>
                </a>

                <a
                  href="/admin/settings"
                  className="bg-gray-800 rounded-xl shadow-sm p-6 hover:border-gray-600 transition-shadow"
                >
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-accent-500/20 rounded-lg">
                      <Activity className="w-6 h-6 text-accent-400" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-100">{t('dashboard.systemSettings')}</h3>
                      <p className="text-sm text-gray-400">
                        {t('dashboard.systemSettingsDesc')}
                      </p>
                    </div>
                  </div>
                </a>

                <a
                  href="/admin/token-usage"
                  className="bg-gray-800 rounded-xl shadow-sm p-6 hover:border-gray-600 transition-shadow"
                >
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-purple-500/20 rounded-lg">
                      <Zap className="w-6 h-6 text-purple-400" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-100">토큰 사용 내역</h3>
                      <p className="text-sm text-gray-400">
                        API 호출별 세부 토큰 사용량 조회
                      </p>
                    </div>
                  </div>
                </a>
              </div>
            </>
          ) : (
            <div className="text-center text-gray-400">
              {t('dashboard.statsError')}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
