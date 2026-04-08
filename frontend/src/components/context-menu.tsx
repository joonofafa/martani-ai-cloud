'use client';

import { useEffect, useRef, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export interface ContextMenuItem {
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  separator?: boolean;
  hidden?: boolean;
}

interface ContextMenuPortalProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export function ContextMenuPortal({ x, y, items, onClose }: ContextMenuPortalProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x, y });

  // Adjust position if menu would overflow viewport
  useLayoutEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const newX = x + rect.width > window.innerWidth ? x - rect.width : x;
      const newY = y + rect.height > window.innerHeight ? y - rect.height : y;
      setPosition({ x: Math.max(0, newX), y: Math.max(0, newY) });
    }
  }, [x, y]);

  // Close on outside click, escape, or scroll
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const handleScroll = () => onClose();

    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleScroll, true);

    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [onClose]);

  const visibleItems = items.filter(item => !item.hidden);

  return createPortal(
    <div
      ref={menuRef}
      style={{ position: 'fixed', left: position.x, top: position.y }}
      className="bg-gray-800 rounded-lg shadow-lg border border-gray-700 py-1 min-w-[180px] z-[9999] animate-in fade-in duration-100"
    >
      {visibleItems.map((item, idx) => (
        <div key={idx}>
          {item.separator && idx > 0 && (
            <div className="border-t border-gray-700 my-1" />
          )}
          <button
            onClick={() => {
              if (!item.disabled) {
                item.onClick();
                onClose();
              }
            }}
            disabled={item.disabled}
            className={`flex items-center gap-3 w-full px-3 py-2 text-sm transition-colors ${
              item.disabled
                ? 'text-gray-500 cursor-not-allowed'
                : item.danger
                  ? 'text-red-400 hover:bg-red-500/10'
                  : 'text-gray-300 hover:bg-gray-700'
            }`}
          >
            {item.icon && <item.icon className="w-4 h-4" />}
            {item.label}
          </button>
        </div>
      ))}
    </div>,
    document.body
  );
}
