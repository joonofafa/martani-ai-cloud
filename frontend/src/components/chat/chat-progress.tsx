'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Wrench } from 'lucide-react';
import { MartaniLogo } from '@/components/martani-logo';
import { markdownComponents } from './chat-markdown';

/* ─── Progress display: tool chain + streaming text ─── */
interface ChatProgressProps {
  progressTools: string[];
  progressTexts: string[];
  streamingText: string;
  sending: boolean;
}

export function ChatProgress({ progressTools, progressTexts, streamingText, sending }: ChatProgressProps) {
  if (progressTools.length === 0 && progressTexts.length === 0 && !streamingText) {
    return null;
  }

  return (
    <div className="flex gap-3 py-4">
      <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
        <MartaniLogo size={18} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-semibold text-gray-400">MARTANI</span>
        </div>
        <div className="space-y-1.5 overflow-hidden">
          {/* Tool chain: single scrollable row */}
          {progressTools.length > 0 && (
            <div className="flex items-center gap-1 text-xs text-gray-400 overflow-hidden">
              <Wrench className="w-3.5 h-3.5 flex-shrink-0 text-gray-500" />
              <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
                {progressTools.map((tool, idx) => (
                  <span key={idx} className="inline-flex items-center whitespace-nowrap">
                    {idx > 0 && <span className="text-gray-600 mx-0.5">›</span>}
                    {tool}
                  </span>
                ))}
              </div>
              {/* Bouncing dots (waiting for next tool) */}
              {sending && !streamingText && (
                <span className="flex gap-0.5 items-center flex-shrink-0 ml-1">
                  <span className="w-1.5 h-1.5 bg-primary-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 bg-primary-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 bg-primary-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </span>
              )}
            </div>
          )}

          {/* Status text: show only the last progressText or current streamingText */}
          {(progressTexts.length > 0 || streamingText) && (
            <div className="text-sm text-gray-300/80 pl-5 ml-0.5 border-l-2 border-gray-500/40 min-w-0">
              <div className="pl-3 prose prose-sm prose-invert max-w-none overflow-hidden break-words">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                  {streamingText || progressTexts[progressTexts.length - 1]}
                </ReactMarkdown>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Typing indicator (bouncing dots, shown when no tool chain) ─── */
interface TypingIndicatorProps {
  sending: boolean;
  hasProgressTools: boolean;
  hasStreamingText: boolean;
}

export function TypingIndicator({ sending, hasProgressTools, hasStreamingText }: TypingIndicatorProps) {
  if (!sending || hasProgressTools || hasStreamingText) {
    return null;
  }

  return (
    <div className="flex gap-3 py-4">
      <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
        <MartaniLogo size={18} />
      </div>
      <div className="pt-2">
        <div className="flex gap-1">
          <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  );
}
