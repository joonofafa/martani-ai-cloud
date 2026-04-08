'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/lib/store';
import { useI18nStore } from '@/lib/i18n';
import { NotificationToast } from '@/components/notification-toast';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      retry: 1,
    },
  },
});

export function Providers({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const checkAuth = useAuthStore((state) => state.checkAuth);

  useEffect(() => {
    setMounted(true);
    checkAuth();
  }, [checkAuth]);

  // Sync document lang attribute with locale
  useEffect(() => {
    document.documentElement.lang = useI18nStore.getState().locale;
    return useI18nStore.subscribe((s) => {
      document.documentElement.lang = s.locale;
    });
  }, []);

  if (!mounted) {
    return null;
  }

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <NotificationToast />
    </QueryClientProvider>
  );
}
