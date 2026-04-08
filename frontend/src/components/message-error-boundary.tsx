'use client';

import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props {
  content: string;
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
}

export class MessageErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[MessageErrorBoundary] Render failed:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-start gap-2 text-yellow-400/80 text-sm">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p>메시지를 표시할 수 없습니다.</p>
            <details className="mt-1">
              <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-400">
                원본 보기
              </summary>
              <pre className="mt-1 text-xs text-gray-400 whitespace-pre-wrap break-all max-h-40 overflow-auto bg-gray-900/50 rounded p-2">
                {this.props.content}
              </pre>
            </details>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
