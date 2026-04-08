'use client';

import { useRef, useCallback, useEffect } from 'react';
import { notesApi } from '@/lib/api';
import { getErrorMessage } from '@/lib/errors';

export function useAutoSave() {
  const timers = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const pending = useRef<Map<string, Parameters<typeof notesApi.update>[1]>>(new Map());
  const saving = useRef(false);

  const save = useCallback((noteId: string, data: Parameters<typeof notesApi.update>[1]) => {
    const existing = pending.current.get(noteId) || {};
    const merged = { ...existing, ...data };
    pending.current.set(noteId, merged);

    const existingTimer = timers.current.get(noteId);
    if (existingTimer) clearTimeout(existingTimer);

    const timer = setTimeout(async () => {
      const toSave = pending.current.get(noteId);
      if (toSave) {
        pending.current.delete(noteId);
        timers.current.delete(noteId);
        saving.current = true;
        try {
          await notesApi.update(noteId, toSave);
        } catch (err: unknown) {
          console.error('Auto-save failed:', getErrorMessage(err));
        } finally {
          saving.current = false;
        }
      }
    }, 800);

    timers.current.set(noteId, timer);
  }, []);

  const flushAll = useCallback(() => {
    timers.current.forEach((timer) => clearTimeout(timer));
    timers.current.clear();

    pending.current.forEach(async (data, noteId) => {
      try {
        await notesApi.update(noteId, data);
      } catch (err: unknown) {
        console.error('Auto-save flush failed:', getErrorMessage(err));
      }
    });
    pending.current.clear();
  }, []);

  // Flush all pending saves on unmount and before page unload
  useEffect(() => {
    const handleBeforeUnload = () => {
      flushAll();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      flushAll();
    };
  }, [flushAll]);

  const hasPending = useCallback((noteId: string) => {
    return pending.current.has(noteId);
  }, []);

  return { save, flushAll, hasPending };
}
