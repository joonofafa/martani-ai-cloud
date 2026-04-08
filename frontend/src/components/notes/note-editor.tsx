'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Image from '@tiptap/extension-image';
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  List, ListOrdered,
} from 'lucide-react';
import { useCallback, useRef } from 'react';

interface NoteEditorProps {
  content: string;
  onChange: (html: string) => void;
  accentColor?: string;
}

export function NoteEditor({ content, onChange, accentColor = 'text-gray-400' }: NoteEditorProps) {
  const contentRef = useRef(content);
  contentRef.current = content;

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        blockquote: false,
        horizontalRule: false,
      }),
      Underline,
      Image,
    ],
    immediatelyRender: false,
    content,
    onCreate: ({ editor }) => {
      // Explicitly set content after editor creation (fixes immediatelyRender: false timing)
      const c = contentRef.current;
      if (c && editor.isEmpty) {
        editor.commands.setContent(c, { emitUpdate: false });
      }
    },
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: 'outline-none min-h-[60px] text-sm leading-relaxed prose prose-sm prose-invert max-w-none',
      },
    },
  });

  const ToolButton = useCallback(({ active, onClick, children }: {
    active: boolean;
    onClick: () => void;
    children: React.ReactNode;
  }) => (
    <button
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      className={`p-1 rounded transition-colors ${
        active ? 'bg-white/10 ' + accentColor : 'opacity-50 hover:opacity-100'
      }`}
    >
      {children}
    </button>
  ), [accentColor]);

  if (!editor) return null;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex gap-0.5 px-2 py-1 border-b border-white/10">
        <ToolButton active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>
          <Bold className="w-3.5 h-3.5" />
        </ToolButton>
        <ToolButton active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <Italic className="w-3.5 h-3.5" />
        </ToolButton>
        <ToolButton active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()}>
          <UnderlineIcon className="w-3.5 h-3.5" />
        </ToolButton>
        <ToolButton active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()}>
          <Strikethrough className="w-3.5 h-3.5" />
        </ToolButton>
        <div className="w-px bg-white/10 mx-1" />
        <ToolButton active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}>
          <List className="w-3.5 h-3.5" />
        </ToolButton>
        <ToolButton active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          <ListOrdered className="w-3.5 h-3.5" />
        </ToolButton>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-2">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
