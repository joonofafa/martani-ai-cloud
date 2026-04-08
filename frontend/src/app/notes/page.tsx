'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, LayoutGrid, Rows3, Columns3, Bot, Trash2, Clock, X, Loader2, AlertTriangle } from 'lucide-react';
import { useAuthStore } from '@/lib/store';
import { notesApi, scheduleApi } from '@/lib/api';
import type { StickyNote, AnalyzeResult } from '@/types';
import { Sidebar } from '@/components/sidebar';
import { AssistantPanel, type AssistantPanelRef } from '@/components/assistant-panel';
import { ContextMenuPortal, type ContextMenuItem } from '@/components/context-menu';
import { StickyNoteCard } from '@/components/notes/sticky-note-card';
import { useAutoSave } from '@/hooks/use-auto-save';
import { useTranslation } from '@/hooks/use-translation';
import { useConfirmDialog } from '@/components/confirm-dialog';

const NOTE_COLORS = ['yellow', 'green', 'pink', 'blue', 'purple', 'orange', 'gray'] as const;

export default function NotesPage() {
  const { t } = useTranslation('notes');
  const { t: tTools } = useTranslation('tools');
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading } = useAuthStore();
  const { save } = useAutoSave();
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [localNotes, setLocalNotes] = useState<StickyNote[]>([]);
  const [maxZ, setMaxZ] = useState(0);
  const [initialized, setInitialized] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; note: StickyNote } | null>(null);
  const assistantRef = useRef<AssistantPanelRef>(null);

  // Delete confirmation dialog state
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; noteId: string | null; noteTitle: string }>({ open: false, noteId: null, noteTitle: '' });

  // Schedule task dialog state
  const [taskDialog, setTaskDialog] = useState<{
    open: boolean;
    note: StickyNote | null;
    analyzing: boolean;
    analyzed: AnalyzeResult | null;
    scheduledAt: string;
    error: string | null;
  }>({ open: false, note: null, analyzing: false, analyzed: null, scheduledAt: '', error: null });

  const handleAddAsTask = useCallback(async (note: StickyNote) => {
    const prompt = `${note.title ? note.title + ': ' : ''}${note.content || ''}`.trim();
    if (!prompt) return;
    // Default to tomorrow 9:00 AM
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    const defaultTime = tomorrow.toISOString().slice(0, 16);
    setTaskDialog({ open: true, note, analyzing: true, analyzed: null, scheduledAt: defaultTime, error: null });
    try {
      const result = await scheduleApi.analyze(prompt);
      if (!result.actionable) {
        setTaskDialog((p) => ({ ...p, analyzing: false, error: t('notActionable') }));
      } else {
        setTaskDialog((p) => ({ ...p, analyzing: false, analyzed: result }));
      }
    } catch {
      setTaskDialog((p) => ({ ...p, analyzing: false, error: t('analyzeError') }));
    }
  }, []);

  const handleCreateTask = useCallback(async () => {
    if (!taskDialog.analyzed || !taskDialog.scheduledAt) return;
    try {
      await scheduleApi.createTask({
        name: taskDialog.analyzed.name,
        prompt: `${taskDialog.note?.title ? taskDialog.note.title + ': ' : ''}${taskDialog.note?.content || ''}`.trim(),
        scheduled_at: new Date(taskDialog.scheduledAt).toISOString(),
      });
      setTaskDialog({ open: false, note: null, analyzing: false, analyzed: null, scheduledAt: '', error: null });
    } catch {
      setTaskDialog((p) => ({ ...p, error: t('createError') }));
    }
  }, [taskDialog]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, isLoading, router]);

  const { data: serverNotes } = useQuery({
    queryKey: ['notes'],
    queryFn: notesApi.list,
    enabled: isAuthenticated,
  });

  // Sync server notes to local state on initial load
  useEffect(() => {
    if (serverNotes && !initialized) {
      setLocalNotes(serverNotes);
      const maxZIndex = serverNotes.reduce((max, n) => Math.max(max, n.z_index), 0);
      setMaxZ(maxZIndex);
      setInitialized(true);
    }
  }, [serverNotes, initialized]);

  const createMutation = useMutation({
    mutationFn: notesApi.create,
    onSuccess: (newNote) => {
      setLocalNotes((prev) => [...prev, newNote]);
      setSelectedNoteId(newNote.id);
      setMaxZ((prev) => Math.max(prev, newNote.z_index));
      queryClient.invalidateQueries({ queryKey: ['notes'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: notesApi.delete,
    onSuccess: (_, noteId) => {
      setLocalNotes((prev) => prev.filter((n) => n.id !== noteId));
      if (selectedNoteId === noteId) setSelectedNoteId(null);
      queryClient.invalidateQueries({ queryKey: ['notes'] });
    },
  });

  const handleCreate = useCallback(() => {
    if (createMutation.isPending) return;
    const offset = (localNotes.length % 5) * 30;
    const randomColor = NOTE_COLORS[Math.floor(Math.random() * NOTE_COLORS.length)];
    createMutation.mutate({
      title: '',
      content: '',
      color: randomColor,
      position_x: 50 + offset,
      position_y: 50 + offset,
    });
  }, [localNotes.length, createMutation]);

  const handleUpdate = useCallback((noteId: string, data: Partial<StickyNote>) => {
    setLocalNotes((prev) =>
      prev.map((n) => (n.id === noteId ? { ...n, ...data } : n))
    );
    save(noteId, data);
  }, [save]);

  const handleBringToFront = useCallback((noteId: string) => {
    const newZ = maxZ + 1;
    setMaxZ(newZ);
    setLocalNotes((prev) =>
      prev.map((n) => (n.id === noteId ? { ...n, z_index: newZ } : n))
    );
    save(noteId, { z_index: newZ });
  }, [maxZ, save]);

  const handleDelete = useCallback((noteId: string) => {
    const note = localNotes.find((n) => n.id === noteId);
    setDeleteDialog({ open: true, noteId, noteTitle: note?.title || '' });
  }, [localNotes]);

  const confirmDelete = useCallback(() => {
    if (deleteDialog.noteId) deleteMutation.mutate(deleteDialog.noteId);
    setDeleteDialog({ open: false, noteId: null, noteTitle: '' });
  }, [deleteDialog.noteId, deleteMutation]);

  const handleNoteContextMenu = useCallback((noteId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const note = localNotes.find((n) => n.id === noteId);
    if (note) setContextMenu({ x: e.clientX, y: e.clientY, note });
  }, [localNotes]);

  const handleSendNoteToAI = useCallback((note: StickyNote) => {
    const msg = `메모${note.title ? ` "${note.title}"` : ''}:\n${note.content || '(내용 없음)'}\n\n이 메모에 대해 도움을 주세요.`;
    assistantRef.current?.sendMessage(msg);
  }, []);

  const getNoteContextMenuItems = useCallback((note: StickyNote): ContextMenuItem[] => [
    {
      label: t('sendToAI'),
      icon: Bot,
      onClick: () => handleSendNoteToAI(note),
      disabled: !note.title && !note.content,
    },
    {
      label: t('addAsTask'),
      icon: Clock,
      onClick: () => handleAddAsTask(note),
      disabled: !note.title && !note.content,
    },
    {
      label: t('delete'),
      icon: Trash2,
      onClick: () => handleDelete(note.id),
      danger: true,
      separator: true,
    },
  ], [handleSendNoteToAI, handleAddAsTask, handleDelete]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'n' || e.key === 'N') {
          e.preventDefault();
          handleCreate();
        }
        if ((e.key === 'd' || e.key === 'D') && selectedNoteId) {
          e.preventDefault();
          handleDelete(selectedNoteId);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleCreate, handleDelete, selectedNoteId]);

  // Filter notes by search
  const filteredNotes = searchQuery
    ? localNotes.filter(
        (n) =>
          n.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          n.content.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : localNotes;

  // Sort: Grid layout
  const handleSortGrid = useCallback(async () => {
    if (localNotes.length === 0) return;
    if (!(await confirm(t('confirmSortGrid'), { danger: false, confirmLabel: '확인' }))) return;
    const cols = Math.ceil(Math.sqrt(localNotes.length));
    const gap = 20;
    const sorted = localNotes.map((note, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const pos = {
        position_x: 20 + col * (note.width + gap),
        position_y: 20 + row * (note.height + gap),
      };
      save(note.id, pos);
      return { ...note, ...pos };
    });
    setLocalNotes(sorted);
  }, [localNotes, save, confirm]);

  // Sort: Vertical (top to bottom)
  const handleSortVertical = useCallback(async () => {
    if (localNotes.length === 0) return;
    if (!(await confirm(t('confirmSortVertical'), { danger: false, confirmLabel: '확인' }))) return;
    const gap = 20;
    let y = 20;
    const sorted = localNotes.map((note) => {
      const pos = { position_x: 20, position_y: y };
      y += note.height + gap;
      save(note.id, pos);
      return { ...note, ...pos };
    });
    setLocalNotes(sorted);
  }, [localNotes, save, confirm]);

  // Sort: Horizontal (left to right)
  const handleSortHorizontal = useCallback(async () => {
    if (localNotes.length === 0) return;
    if (!(await confirm(t('confirmSortHorizontal'), { danger: false, confirmLabel: '확인' }))) return;
    const gap = 20;
    let x = 20;
    const sorted = localNotes.map((note) => {
      const pos = { position_x: x, position_y: 20 };
      x += note.width + gap;
      save(note.id, pos);
      return { ...note, ...pos };
    });
    setLocalNotes(sorted);
  }, [localNotes, save, confirm]);

  // Click on empty area to deselect
  const handleBoardClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      setSelectedNoteId(null);
    }
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  return (
    <div className="h-screen flex overflow-hidden bg-surface">
      <Sidebar />
      <main className="flex-1 flex flex-col min-h-0">
        {/* Toolbar */}
        <div className="flex items-center gap-2 px-3 py-3 border-b border-gray-700 bg-gray-800/80 flex-shrink-0">
          <h1 className="text-sm font-semibold text-gray-100">{t('title')}</h1>
          <button
            onClick={handleCreate}
            disabled={createMutation.isPending}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-primary-500 text-white text-sm
              rounded-lg hover:bg-primary-600 transition-colors disabled:opacity-50"
          >
            <Plus className="w-3.5 h-3.5" />
            {t('newNote')}
          </button>
          <div className="flex items-center gap-0.5 ml-1">
            <button
              onClick={handleSortGrid}
              title={t('sortGrid')}
              className="p-1 rounded text-gray-400 hover:bg-gray-700 hover:text-gray-300 transition-colors"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={handleSortVertical}
              title={t('sortVertical')}
              className="p-1 rounded text-gray-400 hover:bg-gray-700 hover:text-gray-300 transition-colors"
            >
              <Rows3 className="w-4 h-4" />
            </button>
            <button
              onClick={handleSortHorizontal}
              title={t('sortHorizontal')}
              className="p-1 rounded text-gray-400 hover:bg-gray-700 hover:text-gray-300 transition-colors"
            >
              <Columns3 className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1" />
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('searchPlaceholder')}
              className="pl-8 pr-3 py-0.5 text-sm border border-gray-600 rounded-lg bg-gray-700 text-white
                focus:outline-none focus:ring-2 focus:ring-primary-500 w-full sm:w-84"
            />
          </div>
        </div>

        {/* Board */}
        <div
          className="flex-1 relative overflow-auto"
          style={{
            backgroundColor: 'var(--color-surface)',
            backgroundImage:
              'radial-gradient(circle, rgba(255,255,255,0.03) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}
          onClick={handleBoardClick}
        >
          {filteredNotes.length === 0 && !searchQuery && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400">
              <div className="text-5xl mb-4">📝</div>
              <p className="text-lg font-medium">{t('noNotes')}</p>
              <p className="text-sm mt-1">{t('noNotesHint')}</p>
            </div>
          )}
          {filteredNotes.length === 0 && searchQuery && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400">
              <p className="text-lg font-medium">{t('noSearchResults')}</p>
            </div>
          )}
          {filteredNotes.map((note) => (
            <StickyNoteCard
              key={note.id}
              note={note}
              isSelected={selectedNoteId === note.id}
              onSelect={() => setSelectedNoteId(note.id)}
              onUpdate={(data) => handleUpdate(note.id, data)}
              onDelete={() => handleDelete(note.id)}
              onBringToFront={() => handleBringToFront(note.id)}
              onContextMenu={(e) => handleNoteContextMenu(note.id, e)}
            />
          ))}
        </div>
      </main>
      <AssistantPanel ref={assistantRef} />

      {contextMenu && (
        <ContextMenuPortal
          x={contextMenu.x}
          y={contextMenu.y}
          items={getNoteContextMenuItems(contextMenu.note)}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Delete Confirmation Dialog */}
      {deleteDialog.open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[10000]" onClick={() => setDeleteDialog({ open: false, noteId: null, noteTitle: '' })}>
          <div className="bg-gray-800 rounded-xl w-full max-w-sm p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-red-500/20 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-red-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-100">{t('delete')}</h3>
            </div>
            <p className="text-sm text-gray-300 mb-6">
              {deleteDialog.noteTitle
                ? `"${deleteDialog.noteTitle}" ${t('confirmDelete')}`
                : t('confirmDelete')}
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteDialog({ open: false, noteId: null, noteTitle: '' })}
                className="px-4 py-2 text-sm text-gray-400 hover:bg-gray-700 rounded-lg"
              >
                {t('cancel')}
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                {t('delete')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add as Task Dialog */}
      {taskDialog.open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[10000]" onClick={() => setTaskDialog((p) => ({ ...p, open: false }))}>
          <div className="bg-gray-800 rounded-xl w-full max-w-md p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-100">{t('addAsTask')}</h3>
              <button onClick={() => setTaskDialog((p) => ({ ...p, open: false }))} className="p-1 text-gray-400 hover:text-gray-200">
                <X className="w-5 h-5" />
              </button>
            </div>

            {taskDialog.analyzing && (
              <div className="flex items-center gap-3 py-8 justify-center text-gray-400">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>{t('analyzing')}</span>
              </div>
            )}

            {taskDialog.error && (
              <div className="py-4">
                <p className="text-sm text-red-400">{taskDialog.error}</p>
                <div className="flex justify-end mt-4">
                  <button
                    onClick={() => setTaskDialog((p) => ({ ...p, open: false }))}
                    className="px-4 py-2 text-sm text-gray-400 hover:bg-gray-700 rounded-lg"
                  >
                    {t('close')}
                  </button>
                </div>
              </div>
            )}

            {taskDialog.analyzed && !taskDialog.error && (
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">{t('taskName')}</label>
                  <p className="text-sm text-gray-100 font-medium">{taskDialog.analyzed.name}</p>
                </div>
                {taskDialog.analyzed.summary && (
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">{t('taskSummary')}</label>
                    <p className="text-sm text-gray-300">{taskDialog.analyzed.summary}</p>
                  </div>
                )}
                {taskDialog.analyzed.tools.length > 0 && (
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">{t('predictedTools')}</label>
                    <div className="flex flex-wrap gap-1.5">
                      {taskDialog.analyzed.tools.map((tool) => (
                        <span key={tool} className="px-2 py-0.5 text-xs bg-gray-700 text-gray-300 rounded-full">{(() => { const label = tTools(`fn.${tool}`); return label !== `fn.${tool}` ? label : tool; })()}</span>
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">{t('scheduledAt')}</label>
                  <input
                    type="datetime-local"
                    value={taskDialog.scheduledAt}
                    onChange={(e) => setTaskDialog((p) => ({ ...p, scheduledAt: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-600 rounded-lg bg-gray-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setTaskDialog((p) => ({ ...p, open: false }))}
                    className="px-4 py-2 text-sm text-gray-400 hover:bg-gray-700 rounded-lg"
                  >
                    {t('cancel')}
                  </button>
                  <button
                    onClick={handleCreateTask}
                    disabled={!taskDialog.scheduledAt}
                    className="px-4 py-2 text-sm bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50"
                  >
                    {t('addTask')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {ConfirmDialog}
    </div>
  );
}
