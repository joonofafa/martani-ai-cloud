'use client';

import { useState, useCallback } from 'react';
import { Clock, Zap, Database, X } from 'lucide-react';
import { useNotifications, type AgentNotification } from '@/hooks/use-notifications';
import { cn } from '@/lib/utils';

interface ToastItem {
  id: number;
  notification: AgentNotification;
}

let toastId = 0;

export function NotificationToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const handleNotification = useCallback((n: AgentNotification) => {
    const id = ++toastId;
    setToasts((prev) => [...prev, { id, notification: n }]);
    // Auto-dismiss after 5 seconds
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  useNotifications(handleNotification);

  const dismiss = (id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[100] space-y-2 max-w-sm">
      {toasts.map(({ id, notification }) => {
        const isSchedule = notification.source === 'schedule';
        const isCollection = notification.source === 'collection';
        return (
          <div
            key={id}
            className={cn(
              'flex items-start gap-3 p-4 rounded-xl border shadow-xl animate-in slide-in-from-right-5',
              'bg-gray-900 border-gray-700/50'
            )}
          >
            <div className={cn(
              'p-1.5 rounded-lg flex-shrink-0',
              isCollection ? 'bg-emerald-500/20' : isSchedule ? 'bg-primary-500/20' : 'bg-yellow-500/20'
            )}>
              {isCollection ? (
                <Database className="w-4 h-4 text-emerald-400" />
              ) : isSchedule ? (
                <Clock className="w-4 h-4 text-primary-400" />
              ) : (
                <Zap className="w-4 h-4 text-yellow-400" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-200 truncate">
                {notification.name}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                {isCollection ? 'Data Collection' : isSchedule ? 'Scheduled' : 'Triggered'} {notification.status === 'success' ? 'complete' : 'failed'}
              </p>
            </div>
            <button
              onClick={() => dismiss(id)}
              className="p-1 text-gray-500 hover:text-gray-300 flex-shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
