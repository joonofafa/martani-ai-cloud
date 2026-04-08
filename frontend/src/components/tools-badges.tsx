'use client';

import { useState } from 'react';
import { Wrench, ChevronRight } from 'lucide-react';
import { useTranslation } from '@/hooks/use-translation';
import { cn } from '@/lib/utils';

interface ToolsBadgesProps {
  tools: string[];
  compact?: boolean;
}

export function ToolsBadges({ tools, compact }: ToolsBadgesProps) {
  const { t } = useTranslation('tools');
  const [expanded, setExpanded] = useState(false);

  const resolveLabel = (key: string) => {
    const resolved = t(`fn.${key}`);
    return resolved === `fn.${key}` ? key : resolved;
  };

  return (
    <div className="my-1">
      {/* Collapsed: clickable summary */}
      <button
        onClick={() => setExpanded(!expanded)}
        className={cn(
          'inline-flex items-center gap-1.5 text-gray-400 hover:text-gray-300 transition-colors',
          compact ? 'text-[11px]' : 'text-xs'
        )}
      >
        <Wrench className={compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
        <span>{tools.length}개 도구 사용</span>
        <ChevronRight className={cn(
          'transition-transform',
          compact ? 'w-2.5 h-2.5' : 'w-3 h-3',
          expanded && 'rotate-90'
        )} />
      </button>

      {/* Expanded: tool chain */}
      {expanded && (
        <div className={cn(
          'mt-1 flex flex-wrap items-center gap-1 text-gray-500 overflow-hidden',
          compact ? 'ml-4 text-[11px]' : 'ml-5 text-xs'
        )}>
          {tools.map((key, i) => (
            <span key={i} className="inline-flex items-center whitespace-nowrap">
              {i > 0 && <span className="text-gray-600 mx-0.5">›</span>}
              {resolveLabel(key)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
