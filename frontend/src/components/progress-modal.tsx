'use client';

import { useEffect, useState } from 'react';
import { Loader2, CheckCircle, XCircle, AlertCircle, X } from 'lucide-react';

export type ProgressStatus = 'processing' | 'completed' | 'failed' | 'cancelled';

export interface ProgressTask {
  id: string;
  type: 'decompress' | 'move' | 'vault' | 'vault-unlock';
  filename: string;
  status: ProgressStatus;
  message?: string;
  timestamp: number;
}

interface ProgressModalProps {
  tasks: ProgressTask[];
  onClose?: () => void;
}

export function ProgressModal({ tasks, onClose }: ProgressModalProps) {
  const [isMinimized, setIsMinimized] = useState(false);
  
  // Auto-save to localStorage for persistence across page refresh
  useEffect(() => {
    if (tasks.length === 0) {
      localStorage.removeItem('file-progress-tasks');
      return;
    }
    
    localStorage.setItem('file-progress-tasks', JSON.stringify(tasks));
    
    return () => {
      if (tasks.length === 0) {
        localStorage.removeItem('file-progress-tasks');
      }
    };
  }, [tasks]);

  const processingCount = tasks.filter(t => t.status === 'processing').length;
  const completedCount = tasks.filter(t => t.status === 'completed').length;
  const failedCount = tasks.filter(t => t.status === 'failed').length;

  if (tasks.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-96 bg-gray-800 rounded-xl shadow-2xl border border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 bg-gray-900 border-b border-gray-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {processingCount > 0 ? (
            <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
          ) : completedCount > 0 && failedCount === 0 ? (
            <CheckCircle className="w-5 h-5 text-green-400" />
          ) : (
            <XCircle className="w-5 h-5 text-red-400" />
          )}
          <span className="font-semibold text-gray-100">
            {processingCount > 0 ? '작업 진행 중' : '작업 완료'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-400">
            {completedCount}/{tasks.length}
          </span>
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            className="p-1 hover:bg-gray-700 rounded transition-colors text-gray-400 hover:text-gray-100"
          >
            {isMinimized ? (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
              </svg>
            )}
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 hover:bg-gray-700 rounded transition-colors text-gray-400 hover:text-gray-100"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="px-4 py-2 bg-gray-900/50">
        <div className="flex items-center gap-2 text-xs text-gray-400 mb-1">
          <span>{processingCount} 진행 중</span>
          {failedCount > 0 && <span>• {failedCount} 실패</span>}
        </div>
        <div className="w-full bg-gray-700 rounded-full h-2 overflow-hidden">
          {processingCount > 0 ? (
            <div
              className="bg-primary-500 h-2 rounded-full animate-progress-indeterminate"
            />
          ) : (
            <div
              className="bg-primary-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${(completedCount / tasks.length) * 100}%` }}
            />
          )}
        </div>
      </div>

      {/* Task List */}
      {!isMinimized && (
        <div className="max-h-80 overflow-y-auto p-2 space-y-2">
          {tasks.map((task) => (
            <div
              key={task.id}
              className={`p-3 rounded-lg border ${
                task.status === 'processing'
                  ? 'bg-blue-900/20 border-blue-800/50'
                  : task.status === 'completed'
                  ? 'bg-green-900/20 border-green-800/50'
                  : task.status === 'failed'
                  ? 'bg-red-900/20 border-red-800/50'
                  : 'bg-gray-700/50 border-gray-600/50'
              }`}
            >
              <div className="flex items-start gap-2">
                {task.status === 'processing' && (
                  <Loader2 className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0 animate-spin" />
                )}
                {task.status === 'completed' && (
                  <CheckCircle className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                )}
                {task.status === 'failed' && (
                  <XCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-100 truncate">
                    {task.type === 'decompress' ? '압축 해제' : task.type === 'vault' ? '금고 암호화' : task.type === 'vault-unlock' ? '금고 꺼내기' : '이동'}: {task.filename}
                  </p>
                  {task.message && (
                    <p className="text-xs text-gray-400 mt-1 truncate">{task.message}</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Close Button */}
      {!isMinimized && processingCount === 0 && (
        <div className="px-4 py-3 bg-gray-900/50 border-t border-gray-700">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors font-medium"
          >
            닫기
          </button>
        </div>
      )}
    </div>
  );
}

export function useProgressModal() {
  const [tasks, setTasks] = useState<ProgressTask[]>([]);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('file-progress-tasks');
      if (saved) {
        const parsedTasks = JSON.parse(saved) as ProgressTask[];
        // Filter out completed tasks that are older than 1 hour
        const oneHourAgo = Date.now() - 60 * 60 * 1000;
        const validTasks = parsedTasks.filter(
          t => t.status === 'processing' || t.timestamp > oneHourAgo
        );
        setTasks(validTasks);
      }
    } catch (error) {
      console.error('Failed to load progress tasks:', error);
    }
  }, []);

  const addTask = (type: 'decompress' | 'move' | 'vault' | 'vault-unlock', filename: string) => {
    const id = `${type}-${filename}-${Date.now()}`;
    const newTask: ProgressTask = {
      id,
      type,
      filename,
      status: 'processing',
      timestamp: Date.now(),
    };
    setTasks(prev => [...prev, newTask]);
    return id;
  };

  const updateTask = (id: string, status: ProgressStatus, message?: string) => {
    setTasks(prev =>
      prev.map(task =>
        task.id === id ? { ...task, status, message, timestamp: Date.now() } : task
      )
    );
  };

  const clearTasks = () => {
    setTasks([]);
  };

  const removeTask = (id: string) => {
    setTasks(prev => prev.filter(task => task.id !== id));
  };

  return {
    tasks,
    addTask,
    updateTask,
    clearTasks,
    removeTask,
  };
}