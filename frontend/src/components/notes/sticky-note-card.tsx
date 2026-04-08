'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Pin, Trash2, Palette, GripVertical } from 'lucide-react';
import type { StickyNote, NoteColor } from '@/types';
import { ColorPicker } from './color-picker';
import { NoteEditor } from './note-editor';

const COLOR_STYLES: Record<NoteColor, { bg: string; header: string; text: string }> = {
  yellow: { bg: 'bg-yellow-900/40', header: 'bg-yellow-800/50', text: 'text-yellow-300' },
  green: { bg: 'bg-green-900/40', header: 'bg-green-800/50', text: 'text-green-300' },
  pink: { bg: 'bg-pink-900/40', header: 'bg-pink-800/50', text: 'text-pink-300' },
  blue: { bg: 'bg-blue-900/40', header: 'bg-blue-800/50', text: 'text-blue-300' },
  purple: { bg: 'bg-purple-900/40', header: 'bg-purple-800/50', text: 'text-purple-300' },
  orange: { bg: 'bg-orange-900/40', header: 'bg-orange-800/50', text: 'text-orange-300' },
  gray: { bg: 'bg-gray-800', header: 'bg-gray-700', text: 'text-gray-300' },
};

interface StickyNoteCardProps {
  note: StickyNote;
  isSelected: boolean;
  onSelect: () => void;
  onUpdate: (data: Partial<StickyNote>) => void;
  onDelete: () => void;
  onBringToFront: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}

export function StickyNoteCard({
  note,
  isSelected,
  onSelect,
  onUpdate,
  onDelete,
  onBringToFront,
  onContextMenu,
}: StickyNoteCardProps) {
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef({ x: 0, y: 0, posX: 0, posY: 0 });
  const resizeStart = useRef({ x: 0, y: 0, w: 0, h: 0 });

  const colors = COLOR_STYLES[note.color] || COLOR_STYLES.yellow;

  const SNAP = 50;
  const snap = (v: number) => Math.round(v / SNAP) * SNAP;

  // Drag handling
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button, input')) return;
    e.preventDefault();
    setIsDragging(true);
    onBringToFront();
    onSelect();
    dragStart.current = {
      x: e.clientX,
      y: e.clientY,
      posX: note.position_x,
      posY: note.position_y,
    };
  }, [note.position_x, note.position_y, onBringToFront, onSelect]);

  useEffect(() => {
    if (!isDragging) return;
    const handleMove = (e: MouseEvent) => {
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      onUpdate({
        position_x: Math.max(0, snap(dragStart.current.posX + dx)),
        position_y: Math.max(0, snap(dragStart.current.posY + dy)),
      });
    };
    const handleUp = () => setIsDragging(false);
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
    return () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };
  }, [isDragging, onUpdate]);

  // Resize handling
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    onBringToFront();
    resizeStart.current = {
      x: e.clientX,
      y: e.clientY,
      w: note.width,
      h: note.height,
    };
  }, [note.width, note.height, onBringToFront]);

  useEffect(() => {
    if (!isResizing) return;
    const handleMove = (e: MouseEvent) => {
      const dx = e.clientX - resizeStart.current.x;
      const dy = e.clientY - resizeStart.current.y;
      onUpdate({
        width: Math.max(200, snap(resizeStart.current.w + dx)),
        height: Math.max(150, snap(resizeStart.current.h + dy)),
      });
    };
    const handleUp = () => setIsResizing(false);
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
    return () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };
  }, [isResizing, onUpdate]);

  const handleClick = useCallback(() => {
    onSelect();
    onBringToFront();
  }, [onSelect, onBringToFront]);

  return (
    <div
      ref={cardRef}
      className={`absolute rounded-lg shadow-md flex flex-col overflow-hidden
        ${colors.bg} ${isSelected ? 'ring-2 ring-blue-400' : ''}
        ${isDragging ? 'shadow-xl cursor-grabbing' : ''}
        transition-shadow`}
      style={{
        left: note.position_x,
        top: note.position_y,
        width: note.width,
        height: note.height,
        zIndex: note.z_index,
      }}
      onClick={handleClick}
      onContextMenu={onContextMenu}
    >
      {/* Header */}
      <div
        className={`flex items-center gap-1 px-2 py-1.5 ${colors.header} cursor-grab select-none`}
        onMouseDown={handleDragStart}
      >
        <GripVertical className={`w-3.5 h-3.5 ${colors.text} opacity-40`} />
        <input
          type="text"
          value={note.title}
          onChange={(e) => onUpdate({ title: e.target.value })}
          placeholder="제목 없음"
          className={`flex-1 bg-transparent text-sm font-medium ${colors.text}
            placeholder:opacity-40 outline-none min-w-0`}
        />
        <div className="flex items-center gap-0.5">
          <div className="relative">
            <button
              onClick={(e) => { e.stopPropagation(); setShowColorPicker(!showColorPicker); }}
              className={`p-1 rounded hover:bg-white/10 transition-colors ${colors.text} opacity-60 hover:opacity-100`}
            >
              <Palette className="w-3.5 h-3.5" />
            </button>
            {showColorPicker && (
              <div className="absolute right-0 top-full mt-1 bg-gray-800 rounded-lg shadow-lg border border-gray-700 p-1 z-50">
                <ColorPicker
                  current={note.color}
                  onChange={(color) => {
                    onUpdate({ color });
                    setShowColorPicker(false);
                  }}
                />
              </div>
            )}
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onUpdate({ is_pinned: !note.is_pinned }); }}
            className={`p-1 rounded hover:bg-white/10 transition-colors
              ${note.is_pinned ? colors.text + ' opacity-100' : colors.text + ' opacity-40 hover:opacity-80'}`}
          >
            <Pin className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className={`p-1 rounded hover:bg-red-500/20 transition-colors ${colors.text} opacity-40 hover:opacity-100 hover:text-red-400`}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Editor Body */}
      <div className="flex-1 min-h-0 flex flex-col">
        <NoteEditor
          content={note.content}
          onChange={(html) => onUpdate({ content: html })}
          accentColor={colors.text}
        />
      </div>

      {/* Resize Handle */}
      <div
        className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize"
        onMouseDown={handleResizeStart}
      >
        <svg className={`w-4 h-4 ${colors.text} opacity-30`} viewBox="0 0 16 16">
          <path d="M14 14L8 14L14 8Z" fill="currentColor" />
          <path d="M14 14L11 14L14 11Z" fill="currentColor" opacity="0.5" />
        </svg>
      </div>
    </div>
  );
}
