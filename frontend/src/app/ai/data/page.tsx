'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/lib/store';
import { useTranslation } from '@/hooks/use-translation';
import { miningApi, refineryApi, bridgeApi } from '@/lib/api';
import { Sidebar } from '@/components/sidebar';
import {
  Workflow, Search, Factory, Cable,
  ArrowRight, Clock, CheckCircle2, AlertCircle, Loader2,
} from 'lucide-react';

export default function DataDashboardPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useAuthStore();
  const { t } = useTranslation('common');

  const { data: stats } = useQuery({
    queryKey: ['mining-stats'],
    queryFn: miningApi.getStats,
  });

  const { data: refineryStats } = useQuery({
    queryKey: ['refinery-stats'],
    queryFn: refineryApi.getStats,
  });

  const { data: bridgeStats } = useQuery({
    queryKey: ['bridge-stats'],
    queryFn: bridgeApi.getStats,
  });

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, authLoading, router]);

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
      <main className="flex-1 p-4 md:p-8 overflow-y-auto">
        <div className="max-w-[96rem] mx-auto">
          {/* Header */}
          <div className="flex items-center gap-3 mb-8">
            <Workflow className="w-8 h-8 text-primary-400" />
            <h1 className="text-2xl font-bold text-gray-100">데이터 파이프라인</h1>
          </div>

          {/* Pipeline Flow */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
            <Link href="/ai/data/mining" className="group">
              <div className="bg-gray-800 rounded-xl p-6 border border-gray-700 hover:border-primary-500/50 transition-all hover:shadow-lg hover:shadow-primary-500/5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-lg bg-teal-500/10 flex items-center justify-center">
                    <Search className="w-5 h-5 text-teal-400" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-gray-100">{t('nav.mining')}</h2>
                    <p className="text-xs text-gray-500">Collection</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-gray-600 ml-auto group-hover:text-primary-400 transition-colors" />
                </div>
                <p className="text-sm text-gray-400">외부 소스에서 데이터를 수집합니다</p>
                <div className="mt-4 flex items-center gap-4 text-xs text-gray-500">
                  <span className="flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5 text-green-400" /> {stats?.completed_runs ?? 0}회 실행</span>
                  <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5 text-yellow-400" /> {stats?.scheduled_tasks ?? 0}건 예약</span>
                </div>
              </div>
            </Link>

            <Link href="/ai/data/refinery" className="group">
              <div className="bg-gray-800 rounded-xl p-6 border border-gray-700 hover:border-primary-500/50 transition-all hover:shadow-lg hover:shadow-primary-500/5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center">
                    <Factory className="w-5 h-5 text-orange-400" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-gray-100">{t('nav.refinery')}</h2>
                    <p className="text-xs text-gray-500">Processing</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-gray-600 ml-auto group-hover:text-primary-400 transition-colors" />
                </div>
                <p className="text-sm text-gray-400">수집된 데이터를 정제하고 가공합니다</p>
                <div className="mt-4 flex items-center gap-4 text-xs text-gray-500">
                  <span className="flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5 text-green-400" /> {refineryStats?.completed_runs ?? 0}회 실행</span>
                  <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5 text-yellow-400" /> {refineryStats?.auto_rules ?? 0}건 자동</span>
                </div>
              </div>
            </Link>

            <Link href="/ai/data/bridge" className="group">
              <div className="bg-gray-800 rounded-xl p-6 border border-gray-700 hover:border-primary-500/50 transition-all hover:shadow-lg hover:shadow-primary-500/5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                    <Cable className="w-5 h-5 text-blue-400" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-gray-100">{t('nav.bridge')}</h2>
                    <p className="text-xs text-gray-500">Delivery</p>
                  </div>
                </div>
                <p className="text-sm text-gray-400">정제된 데이터를 외부로 전달합니다</p>
                <div className="mt-4 flex items-center gap-4 text-xs text-gray-500">
                  <span className="flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5 text-green-400" /> {bridgeStats?.total_deliveries ?? 0}회 전달</span>
                  <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5 text-yellow-400" /> {bridgeStats?.auto_configs ?? 0}건 자동</span>
                </div>
              </div>
            </Link>
          </div>

          {/* Pipeline Visual Flow */}
          <div className="hidden md:flex items-center justify-center gap-2 mb-10 -mt-6">
            <div className="flex items-center gap-1 text-xs text-gray-600">
              <span className="w-2 h-2 rounded-full bg-teal-400" />
              수집
            </div>
            <div className="w-16 h-px bg-gray-700" />
            <div className="flex items-center gap-1 text-xs text-gray-600">
              <span className="w-2 h-2 rounded-full bg-orange-400" />
              정제
            </div>
            <div className="w-16 h-px bg-gray-700" />
            <div className="flex items-center gap-1 text-xs text-gray-600">
              <span className="w-2 h-2 rounded-full bg-blue-400" />
              전달
            </div>
          </div>

          {/* Recent Activity */}
          <div className="bg-gray-800 rounded-xl border border-gray-700">
            <div className="px-5 py-4 border-b border-gray-700">
              <h3 className="text-sm font-semibold text-gray-200">최근 활동</h3>
            </div>
            <div className="p-12 text-center">
              <Workflow className="w-12 h-12 mx-auto mb-3 text-gray-700" />
              <p className="text-gray-500">아직 파이프라인 활동이 없습니다</p>
              <p className="text-gray-600 text-sm mt-1">수집소에서 첫 번째 작업을 만들어보세요</p>
              <Link
                href="/ai/data/mining"
                className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors text-sm"
              >
                <Search className="w-4 h-4" />
                수집소로 이동
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
