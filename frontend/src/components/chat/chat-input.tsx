'use client';

import { useRef } from 'react';
import { Send, FileText, X, ShieldCheck, AlertTriangle } from 'lucide-react';
import { useTranslation } from '@/hooks/use-translation';

export interface AttachedFile {
  id: string;
  name: string;
  path: string;
  type: string;
  size: number;
}

interface ChatInputProps {
  message: string;
  onMessageChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  sending: boolean;
  attachedFile: AttachedFile | null;
  onClearAttachment: () => void;
  categoryMissing: boolean;
  autoFocusInput?: boolean;
}

export function ChatInput({
  message,
  onMessageChange,
  onSubmit,
  sending,
  attachedFile,
  onClearAttachment,
  categoryMissing,
  autoFocusInput,
}: ChatInputProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { t } = useTranslation('chat');

  if (categoryMissing) {
    return (
      <div className="border-t border-gray-700 px-4 py-3 flex-shrink-0">
        <div className="flex items-center gap-2 px-4 py-3 bg-yellow-500/10 border border-yellow-500/30 rounded-2xl text-yellow-400 text-sm">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          대화에 필요한 카테고리가 삭제되었습니다.
        </div>
      </div>
    );
  }

  return (
    <div className="border-t border-gray-700 px-4 py-3 flex-shrink-0">
      <div>
        {/* Attached file chip */}
        {attachedFile && (
          <div className="flex items-center gap-2 mb-2">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-primary-500/10 border border-primary-500/30 rounded-lg">
              <FileText className="w-4 h-4 text-primary-400" />
              <span className="text-sm text-primary-300 font-medium truncate max-w-[300px]">{attachedFile.path}</span>
              <button
                onClick={onClearAttachment}
                className="p-0.5 text-primary-400/60 hover:text-primary-300 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
        <form onSubmit={onSubmit} className="flex items-end gap-2 bg-gray-900/50 border border-gray-700 rounded-2xl p-2">
          <textarea
            ref={inputRef}
            value={message}
            onChange={(e) => onMessageChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                onSubmit(e);
              }
            }}
            onInput={(e) => {
              const el = e.currentTarget;
              el.style.height = 'auto';
              el.style.height = Math.min(el.scrollHeight, 160) + 'px';
            }}
            placeholder={attachedFile ? t('placeholderFile') : t('placeholder')}
            rows={1}
            className="flex-1 px-3 py-2 bg-transparent text-white placeholder-gray-500 focus:outline-none resize-none max-h-40 overflow-y-auto"
            style={{ minHeight: '40px' }}
            autoFocus={!!autoFocusInput}
          />
          <button
            type="submit"
            disabled={(!message.trim() && !attachedFile) || sending}
            className="p-2.5 bg-primary-500 text-white rounded-xl hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}

/* ─── MFA/OTP Input Request Modal ─── */
interface MfaInputProps {
  prompt: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit: (code: string) => void;
}

export function MfaInput({ prompt, value, onChange, onSubmit }: MfaInputProps) {
  const { t } = useTranslation('chat');

  return (
    <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl px-4 py-3 max-w-xl">
      <div className="flex items-center gap-2 mb-2">
        <ShieldCheck className="w-4 h-4 text-yellow-400" />
        <p className="text-sm text-yellow-200">{prompt}</p>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const val = value.trim();
          if (!val) return;
          onSubmit(val);
        }}
        className="flex gap-2"
      >
        <input
          autoFocus
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t('enterCode')}
          className="flex-1 px-3 py-2 text-sm border border-yellow-500/30 rounded-lg focus:outline-none focus:ring-1 focus:ring-yellow-500/50 bg-gray-800 text-white placeholder-gray-500"
        />
        <button
          type="submit"
          disabled={!value.trim()}
          className="px-4 py-2 text-sm bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {t('send')}
        </button>
      </form>
    </div>
  );
}
