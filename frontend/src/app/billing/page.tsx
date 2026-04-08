'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/lib/store';
import { useTranslation } from '@/hooks/use-translation';
import { billingApi, authApi } from '@/lib/api';
import type { PlanInfo } from '@/lib/api';
import { Sidebar } from '@/components/sidebar';
import { AssistantPanel } from '@/components/assistant-panel';
import { formatBytes } from '@/lib/utils';
import { CreditCard, Check, ArrowRight, Loader2, X } from 'lucide-react';

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toString();
}

export default function BillingPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading: authLoading, user, setUser } = useAuthStore();
  const { t } = useTranslation('billing');

  const [confirmPlan, setConfirmPlan] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, authLoading, router]);

  const { data: plansData, isLoading: plansLoading } = useQuery({
    queryKey: ['billing-plans'],
    queryFn: billingApi.getPlans,
    enabled: !!user,
  });

  const changePlanMutation = useMutation({
    mutationFn: (plan: string) => billingApi.changePlan(plan),
    onSuccess: async () => {
      // Refetch user to update store
      const updatedUser = await authApi.me();
      setUser(updatedUser);
      queryClient.invalidateQueries({ queryKey: ['billing-plans'] });
      setConfirmPlan(null);
      setToast({ message: t('changeSuccess'), type: 'success' });
      setTimeout(() => setToast(null), 3000);
    },
    onError: () => {
      setConfirmPlan(null);
      setToast({ message: t('changeError'), type: 'error' });
      setTimeout(() => setToast(null), 3000);
    },
  });

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500" />
      </div>
    );
  }

  const tokenUsagePercent = user ? Math.min(100, (user.tokens_used_month / user.token_quota) * 100) : 0;
  const storageUsagePercent = user ? Math.min(100, (user.storage_used / user.storage_quota) * 100) : 0;

  const plans = plansData?.plans ?? [];
  const getPlan = (name: string): PlanInfo | undefined => plans.find((p) => p.name === name);

  return (
    <div className="h-screen flex overflow-hidden bg-surface">
      <Sidebar />
      <main className="flex-1 p-4 md:p-8 overflow-y-auto">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="flex items-center gap-3 mb-8">
            <CreditCard className="w-8 h-8 text-primary-400" />
            <h1 className="text-2xl font-bold text-gray-100">{t('title')}</h1>
          </div>

          {/* Current Plan Status */}
          {user && (
            <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-6 mb-8">
              <div className="flex items-center gap-3 mb-6">
                <h2 className="text-lg font-semibold text-gray-200">{t('currentPlan')}</h2>
                <span className="px-3 py-1 bg-primary-500/20 text-primary-400 text-sm font-medium rounded-full uppercase">
                  {user.plan}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Token Usage */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm text-gray-400">{t('tokenUsage')}</span>
                    <span className="text-sm text-gray-300">
                      {formatTokens(user.tokens_used_month)} {t('of')} {formatTokens(user.token_quota)}
                    </span>
                  </div>
                  <div className="w-full bg-gray-700 rounded-full h-3">
                    <div
                      className={`h-3 rounded-full transition-all duration-500 ${
                        tokenUsagePercent >= 90 ? 'bg-red-500' : tokenUsagePercent >= 70 ? 'bg-yellow-500' : 'bg-primary-500'
                      }`}
                      style={{ width: `${tokenUsagePercent}%` }}
                    />
                  </div>
                  {user.token_reset_date && (
                    <p className="text-xs text-gray-500 mt-1.5">
                      {t('resetDate')}: {user.token_reset_date}
                    </p>
                  )}
                </div>

                {/* Storage Usage */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm text-gray-400">{t('storageUsage')}</span>
                    <span className="text-sm text-gray-300">
                      {formatBytes(user.storage_used)} {t('of')} {formatBytes(user.storage_quota)}
                    </span>
                  </div>
                  <div className="w-full bg-gray-700 rounded-full h-3">
                    <div
                      className={`h-3 rounded-full transition-all duration-500 ${
                        storageUsagePercent >= 90 ? 'bg-red-500' : storageUsagePercent >= 70 ? 'bg-yellow-500' : 'bg-primary-500'
                      }`}
                      style={{ width: `${storageUsagePercent}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Plan Cards */}
          {plansLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-gray-500" />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {(['basic', 'pro'] as const).map((planName) => {
                const plan = getPlan(planName);
                const isCurrent = user?.plan === planName;

                return (
                  <div
                    key={planName}
                    className={`relative rounded-xl border p-6 transition-all ${
                      isCurrent
                        ? 'border-primary-500 bg-primary-500/5'
                        : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
                    }`}
                  >
                    {isCurrent && (
                      <div className="absolute -top-3 left-4">
                        <span className="px-3 py-1 bg-primary-500 text-white text-xs font-semibold rounded-full">
                          {t('currentBadge')}
                        </span>
                      </div>
                    )}

                    <h3 className="text-xl font-bold text-gray-100 mb-4 mt-1">
                      {t(`plans.${planName}`)}
                    </h3>

                    <div className="space-y-3 mb-6">
                      <div className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-primary-400 flex-shrink-0" />
                        <span className="text-sm text-gray-300">
                          {plan ? formatTokens(plan.token_quota) : '—'} {t('tokensPerMonth')}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-primary-400 flex-shrink-0" />
                        <span className="text-sm text-gray-300">
                          {t('storage')}: {plan ? formatBytes(plan.storage_quota) : '—'}
                        </span>
                      </div>
                    </div>

                    {isCurrent ? (
                      <button
                        disabled
                        className="w-full py-2.5 px-4 rounded-lg bg-gray-700 text-gray-500 text-sm font-medium cursor-not-allowed"
                      >
                        {t('currentBadge')}
                      </button>
                    ) : (
                      <button
                        onClick={() => setConfirmPlan(planName)}
                        className="w-full py-2.5 px-4 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium transition-colors flex items-center justify-center gap-2"
                      >
                        {t('changePlan')}
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
      <AssistantPanel />

      {/* Confirm Dialog */}
      {confirmPlan && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-800 rounded-xl border border-gray-700 p-6 max-w-md w-full shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-100">
                {t('confirmChange', { plan: t(`plans.${confirmPlan}`) })}
              </h3>
              <button
                onClick={() => setConfirmPlan(null)}
                className="text-gray-500 hover:text-gray-300 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-gray-400 mb-6">{t('confirmChangeDesc')}</p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmPlan(null)}
                className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 transition-colors"
              >
                {t('cancel')}
              </button>
              <button
                onClick={() => changePlanMutation.mutate(confirmPlan)}
                disabled={changePlanMutation.isPending}
                className="px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                {changePlanMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                {t('confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 text-sm px-4 py-2 rounded-lg shadow-lg border z-50 animate-in fade-in slide-in-from-bottom-2 ${
          toast.type === 'success'
            ? 'bg-gray-800 text-gray-200 border-gray-700'
            : 'bg-red-900/80 text-red-200 border-red-800'
        }`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}
