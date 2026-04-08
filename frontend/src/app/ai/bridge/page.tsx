'use client';

import { useAuthStore } from '@/lib/store';
import { useTranslation } from '@/hooks/use-translation';
import { Sidebar } from '@/components/sidebar';
import { Cable } from 'lucide-react';

export default function BridgePage() {
  const { user, isLoading } = useAuthStore();
  const { t } = useTranslation('common');

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500" />
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-surface overflow-hidden">
      <Sidebar />
      <main className="flex-1 flex flex-col items-center justify-center text-center p-8">
        <Cable className="w-16 h-16 text-gray-600 mb-4" />
        <h1 className="text-2xl font-bold text-gray-200 mb-2">{t('nav.bridge')}</h1>
        <p className="text-gray-500 max-w-md">
          API 커넥터. 폴더를 외부에서 호출 가능한 REST API로 변환하고 트래픽을 모니터링합니다.
        </p>
      </main>
    </div>
  );
}
