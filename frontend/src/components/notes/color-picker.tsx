'use client';

import { Check } from 'lucide-react';
import type { NoteColor } from '@/types';

const COLORS: { value: NoteColor; bg: string; ring: string }[] = [
  { value: 'yellow', bg: 'bg-yellow-500', ring: 'ring-yellow-400' },
  { value: 'green', bg: 'bg-green-500', ring: 'ring-green-400' },
  { value: 'pink', bg: 'bg-pink-500', ring: 'ring-pink-400' },
  { value: 'blue', bg: 'bg-blue-500', ring: 'ring-blue-400' },
  { value: 'purple', bg: 'bg-purple-500', ring: 'ring-purple-400' },
  { value: 'orange', bg: 'bg-orange-500', ring: 'ring-orange-400' },
  { value: 'gray', bg: 'bg-gray-500', ring: 'ring-gray-400' },
];

interface ColorPickerProps {
  current: NoteColor;
  onChange: (color: NoteColor) => void;
}

export function ColorPicker({ current, onChange }: ColorPickerProps) {
  return (
    <div className="flex gap-1 p-1">
      {COLORS.map((c) => (
        <button
          key={c.value}
          onClick={() => onChange(c.value)}
          className={`w-5 h-5 rounded-full ${c.bg} flex items-center justify-center
            hover:ring-2 ${c.ring} transition-all ${current === c.value ? 'ring-2 ' + c.ring : ''}`}
        >
          {current === c.value && <Check className="w-3 h-3 text-white drop-shadow" />}
        </button>
      ))}
    </div>
  );
}
