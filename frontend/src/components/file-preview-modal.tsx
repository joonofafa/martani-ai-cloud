'use client';

import { useEffect, useCallback } from 'react';
import { X, Download } from 'lucide-react';
import { getFileIcon } from '@/lib/utils';
import { filesApi } from '@/lib/api';
import type { FileItem } from '@/types';

interface FilePreviewModalProps {
  file: FileItem;
  onClose: () => void;
}

export function FilePreviewModal({ file, onClose }: FilePreviewModalProps) {
  const streamUrl = filesApi.getStreamUrl(file.id);
  const mime = file.mime_type || '';

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const handleDownload = async () => {
    try {
      const blob = await filesApi.download(file.id);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.original_filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Download failed:', error);
    }
  };

  const renderViewer = () => {
    if (mime.startsWith('video/')) {
      return (
        <video
          controls
          autoPlay
          className="max-w-full max-h-full rounded-lg"
          src={streamUrl}
        />
      );
    }

    if (mime.startsWith('audio/')) {
      return (
        <div className="flex flex-col items-center gap-6">
          <span className="text-8xl">{getFileIcon(mime)}</span>
          <p className="text-lg text-gray-200 font-medium">{file.original_filename}</p>
          <audio controls autoPlay src={streamUrl} className="w-[400px] max-w-full" />
        </div>
      );
    }

    if (mime === 'application/pdf') {
      return (
        <iframe
          src={streamUrl}
          className="w-full h-full rounded-lg"
          title={file.original_filename}
        />
      );
    }

    if (mime.startsWith('image/')) {
      return (
        <img
          src={streamUrl}
          alt={file.original_filename}
          className="max-w-full max-h-full object-contain rounded-lg cursor-pointer"
          onClick={onClose}
        />
      );
    }

    if (mime.startsWith('text/')) {
      return (
        <iframe
          src={streamUrl}
          className="w-full h-full rounded-lg bg-white"
          title={file.original_filename}
        />
      );
    }

    // Unsupported type
    return (
      <div className="flex flex-col items-center gap-6">
        <span className="text-8xl">{getFileIcon(mime)}</span>
        <p className="text-lg text-gray-200 font-medium">{file.original_filename}</p>
        <p className="text-gray-400">이 파일 형식은 미리보기를 지원하지 않습니다</p>
        <button
          onClick={handleDownload}
          className="flex items-center gap-2 px-6 py-3 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors"
        >
          <Download className="w-5 h-5" />
          다운로드
        </button>
      </div>
    );
  };

  // PDF and text need full-size container
  const isFullFrame = mime === 'application/pdf' || mime.startsWith('text/');

  return (
    <div
      className="fixed inset-0 bg-black/80 flex flex-col z-50"
      onClick={onClose}
    >
      {/* Top bar */}
      <div
        className="flex items-center justify-between px-3 md:px-6 py-3 bg-black/60 flex-shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-xl">{getFileIcon(mime)}</span>
          <span className="text-sm font-medium text-gray-200 truncate">{file.original_filename}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleDownload}
            className="p-2 text-gray-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            title="다운로드"
          >
            <Download className="w-5 h-5" />
          </button>
          <button
            onClick={onClose}
            className="p-2 text-gray-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            title="닫기 (ESC)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Content area */}
      <div
        className={`flex-1 flex items-center justify-center overflow-hidden ${isFullFrame ? 'p-2 md:p-4' : 'p-4 md:p-8'}`}
        onClick={(e) => {
          // Only close if clicking the backdrop, not the content
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div
          className={isFullFrame ? 'w-full h-full' : 'max-w-full max-h-full'}
          onClick={(e) => e.stopPropagation()}
        >
          {renderViewer()}
        </div>
      </div>
    </div>
  );
}
