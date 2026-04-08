'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/store';
import { Sidebar } from '@/components/sidebar';
import { MiningIcon } from '@/components/mining-icon';
import { WorkflowEditor } from '@/components/workflow-editor';

export default function MiningPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useAuthStore();

  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.push('/login');
  }, [isAuthenticated, authLoading, router]);

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
      <main className="flex-1 flex flex-col min-h-0 p-4 md:p-8">
        <div className="max-w-[96rem] mx-auto w-full flex flex-col flex-1 min-h-0">
          {/* Header — 메신저 빈 화면과 동일한 상단 타이포/간격 */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <MiningIcon className="w-8 h-8 text-teal-400" />
            <h1 className="text-2xl font-bold text-gray-100">마이닝</h1>
          </div>

          <WorkflowEditor />
        </div>
      </main>
    </div>
  );
}
