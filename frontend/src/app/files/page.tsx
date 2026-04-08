'use client';

import { useEffect, useLayoutEffect, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useDropzone } from 'react-dropzone';
import { useAuthStore } from '@/lib/store';
import { filesApi, indexingApi, vaultApi, sharesApi } from '@/lib/api';
import { Sidebar } from '@/components/sidebar';
import { formatBytes, formatDate, getFileIcon } from '@/lib/utils';
import { ContextMenuPortal, type ContextMenuItem } from '@/components/context-menu';
import { FilePropertiesModal } from '@/components/file-properties-modal';
import { FilePreviewModal } from '@/components/file-preview-modal';
import { ProgressModal, useProgressModal } from '@/components/progress-modal';
import {
  Upload, Trash2, Download, Search, RefreshCw, Grid3x3, List,
  FolderOpen, FolderPlus, ChevronRight, ChevronLeft, ArrowUpDown, ArrowUp, ArrowDown,
  Pencil, Info, Share2, Database, Check, AlertCircle, Loader2, RotateCcw,
  FolderInput, Mail, HardDrive, Archive, Lock, Link2, Tag, X
} from 'lucide-react';
import { useTranslation } from '@/hooks/use-translation';
import { getErrorMessage } from '@/lib/errors';
import type { FileItem, IndexStatus, IndexCategory } from '@/types';

const CATEGORY_COLORS: Record<string, string> = {
  blue: 'bg-blue-500', red: 'bg-red-500', green: 'bg-green-500',
  yellow: 'bg-yellow-500', purple: 'bg-purple-500', pink: 'bg-pink-500',
  orange: 'bg-orange-500', teal: 'bg-teal-500', gray: 'bg-gray-500',
};

function IndexStatusBadge({ file }: { file: FileItem }) {
  const { t } = useTranslation('files');
  const status = file.index_status || (file.is_indexed ? 'completed' : 'pending');

  switch (status) {
    case 'completed':
      return (
        <span className="inline-flex items-center gap-1 px-3 py-1 text-xs rounded-full bg-green-500/20 text-green-400 font-medium">
          <Check className="w-3 h-3" />
          {t('status.completed')}
        </span>
      );
    case 'processing':
      return (
        <span className="inline-flex items-center gap-1 px-3 py-1 text-xs rounded-full bg-blue-500/20 text-blue-400 font-medium">
          <Loader2 className="w-3 h-3 animate-spin" />
          {file.index_progress > 0 ? `${file.index_progress}%` : t('status.processing')}
        </span>
      );
    case 'failed':
      return (
        <span
          className="inline-flex items-center gap-1 px-3 py-1 text-xs rounded-full bg-red-500/20 text-red-400 font-medium cursor-help"
          title={file.index_error || t('status.indexingFailed')}
        >
          <AlertCircle className="w-3 h-3" />
          {t('status.failed')}
        </span>
      );
    case 'skipped':
      return (
        <span className="px-3 py-1 text-xs rounded-full bg-gray-600/30 text-gray-500">{t('status.skipped')}</span>
      );
    default:
      return (
        <span className="px-3 py-1 text-xs rounded-full bg-gray-700 text-gray-400">{t('status.notIndexed')}</span>
      );
  }
}

export default function FilesPage() {
  const { t } = useTranslation('files');
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { user, isAuthenticated, isLoading: authLoading } = useAuthStore();
  const [uploading, setUploading] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentFolder, setCurrentFolder] = useState('/');
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; file: FileItem } | null>(null);

  // Rename state
  const [renamingFileId, setRenamingFileId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Properties modal state
  const [propertiesFile, setPropertiesFile] = useState<FileItem | null>(null);

  // Preview modal state
  const [previewFile, setPreviewFile] = useState<FileItem | null>(null);


  // Progress modal
  const { tasks, addTask, updateTask, clearTasks } = useProgressModal();

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Share success message
  const [shareMessage, setShareMessage] = useState<string | null>(null);

  // Move modal state
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [moveFileIds, setMoveFileIds] = useState<string[]>([]);
  const [moveBrowseFolder, setMoveBrowseFolder] = useState('/');

  // Category picker state
  const [categoryPickerFile, setCategoryPickerFile] = useState<FileItem | null>(null);
  const [categoryPickerPos, setCategoryPickerPos] = useState({ x: 0, y: 0 });

  // Sort state
  const [sortField, setSortField] = useState<'name' | 'size' | 'date' | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Pending highlight from search navigation
  const pendingHighlight = useRef<string | null>(null);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, authLoading, router]);

  // Handle URL params from search navigation
  useEffect(() => {
    const folderParam = searchParams.get('folder');
    const highlightParam = searchParams.get('highlight');
    if (folderParam !== null) {
      setCurrentFolder(folderParam || '/');
    }
    if (highlightParam) {
      pendingHighlight.current = highlightParam;
    }
  }, [searchParams]);

  // Focus rename input when it appears
  useEffect(() => {
    if (renamingFileId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingFileId]);

  // Auto-hide share message
  useEffect(() => {
    if (shareMessage) {
      const timer = setTimeout(() => setShareMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [shareMessage]);

  const { data: files, isLoading } = useQuery({
    queryKey: ['files', currentFolder],
    queryFn: () => filesApi.list(currentFolder),
    enabled: isAuthenticated,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data && data.some((f: FileItem) => f.index_status === 'processing')) {
        return 3000;
      }
      return false;
    },
  });

  const { data: categories } = useQuery({
    queryKey: ['index-categories'],
    queryFn: indexingApi.listCategories,
    enabled: isAuthenticated,
  });

  const categoryMap = new Map((categories || []).map(c => [c.id, c]));

  const setCategoryMutation = useMutation({
    mutationFn: ({ fileId, categoryIds }: { fileId: string; categoryIds: string[] }) =>
      indexingApi.setFileCategories(fileId, categoryIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files'] });
      queryClient.invalidateQueries({ queryKey: ['index-categories'] });
      setCategoryPickerFile(null);
    },
  });

  // Scroll to highlighted file after data loads
  useEffect(() => {
    if (pendingHighlight.current && files && files.length > 0) {
      const fileId = pendingHighlight.current;
      pendingHighlight.current = null;
      setSelectedIds(new Set([fileId]));
      setTimeout(() => {
        const el = document.getElementById(`file-${fileId}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
    }
  }, [files]);

  const uploadMutation = useMutation({
    mutationFn: (file: File) => filesApi.upload(file, currentFolder),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files', currentFolder] });
    },
  });

  const createFolderMutation = useMutation({
    mutationFn: (name: string) => filesApi.createFolder(name, currentFolder),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files', currentFolder] });
      setShowCreateFolder(false);
      setNewFolderName('');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (fileId: string) => filesApi.delete(fileId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files', currentFolder] });
    },
  });

  const indexMutation = useMutation({
    mutationFn: (fileId: string) => filesApi.index(fileId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files', currentFolder] });
    },
  });

  const retryMutation = useMutation({
    mutationFn: (fileId: string) => indexingApi.retry(fileId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files', currentFolder] });
    },
  });

  const decompressMutation = useMutation({
    mutationFn: async (fileId: string) => {
      // Find file name from files data
      const file = files?.find((f: FileItem) => f.id === fileId);
      const filename = file?.original_filename || '알 수 없는 파일';
      
      const taskId = addTask('decompress', filename);
      try {
        await filesApi.decompress(fileId);
        updateTask(taskId, 'completed', '압축 해제 완료');
      } catch (error: unknown) {
        updateTask(taskId, 'failed', getErrorMessage(error, '압축 해제 실패'));
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files', currentFolder] });
    },
  });

  const lockFileMutation = useMutation({
    mutationFn: async ({ fileId, filename }: { fileId: string; filename: string }) => {
      const taskId = addTask('vault', filename);
      try {
        await vaultApi.lockFile(fileId);
        updateTask(taskId, 'completed', '금고 보관 완료');
      } catch (error: unknown) {
        updateTask(taskId, 'failed', getErrorMessage(error, '금고 보관 실패'));
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files', currentFolder] });
      queryClient.invalidateQueries({ queryKey: ['vault-files'] });
    },
  });

  const renameMutation = useMutation({
    mutationFn: ({ fileId, newName }: { fileId: string; newName: string }) =>
      filesApi.rename(fileId, newName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files', currentFolder] });
      setRenamingFileId(null);
    },
  });

  const moveMutation = useMutation({
    mutationFn: ({ fileId, targetFolder }: { fileId: string; targetFolder: string }) =>
      filesApi.move(fileId, targetFolder),
    onSuccess: (_, { targetFolder }) => {
      queryClient.invalidateQueries({ queryKey: ['files', currentFolder] });
      queryClient.invalidateQueries({ queryKey: ['files', targetFolder] });
    },
  });

  // Folder list for move modal
  const { data: moveFolderList } = useQuery({
    queryKey: ['files', moveBrowseFolder],
    queryFn: () => filesApi.list(moveBrowseFolder),
    enabled: showMoveModal,
    select: (data) => data.filter((f: FileItem) => f.mime_type === 'application/x-folder'),
  });

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    setUploading(true);
    setUploadError(null);
    try {
      for (const file of acceptedFiles) {
        await uploadMutation.mutateAsync(file);
      }
    } catch (error: unknown) {
      console.error('Upload failed:', error);
      setUploadError(getErrorMessage(error, t('uploadFailed')));
    } finally {
      setUploading(false);
    }
  }, [uploadMutation]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
  });

  const handleDownload = async (file: FileItem) => {
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
    } catch (error: unknown) {
      console.error('Download failed:', error);
      setUploadError(getErrorMessage(error, t('downloadFailed')));
    }
  };

  const handleShare = async (file: FileItem) => {
    try {
      const share = await sharesApi.create(file.id, { expires_in: '7d' });
      await navigator.clipboard.writeText(share.url);
      setShareMessage(t('shareCopied', { name: file.original_filename }));
    } catch (error: unknown) {
      console.error('Share failed:', error);
      setUploadError(getErrorMessage(error, t('shareFailed')));
    }
  };

  const openMoveModal = (fileIds: string[]) => {
    setMoveFileIds(fileIds);
    setMoveBrowseFolder('/');
    setShowMoveModal(true);
  };

  const handleMoveConfirm = async () => {
    const taskId = addTask('move', `${moveFileIds.length}개 파일`);
    try {
      for (const id of moveFileIds) {
        await moveMutation.mutateAsync({ fileId: id, targetFolder: moveBrowseFolder });
      }
      updateTask(taskId, 'completed', `${moveFileIds.length}개 파일 이동 완료`);
    } catch (error: unknown) {
      updateTask(taskId, 'failed', getErrorMessage(error, '이동 실패'));
    } finally {
      setShowMoveModal(false);
      setMoveFileIds([]);
      setSelectedIds(new Set());
    }
  };


  const handleSendToMail = (file: FileItem) => {
    router.push(`/mail?compose=true&attachment_id=${file.id}&attachment_name=${encodeURIComponent(file.original_filename)}`);
  };

  const handleContextMenu = (e: React.MouseEvent, file: FileItem) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, file });
  };

  const handleRenameSubmit = () => {
    if (renamingFileId && renameValue.trim()) {
      renameMutation.mutate({ fileId: renamingFileId, newName: renameValue.trim() });
    } else {
      setRenamingFileId(null);
    }
  };

  const getContextMenuItems = (item: FileItem): ContextMenuItem[] => {
    const isFolder = item.mime_type === 'application/x-folder';
    const isSystem = item.is_system;
    const isFailed = item.index_status === 'failed';
    const isIndexed = item.index_status === 'completed';
    const isZip = item.mime_type === 'application/zip' || item.mime_type === 'application/x-zip-compressed';
    return [
      {
        label: t('ctx.rename'),
        icon: Pencil,
        onClick: () => { setRenamingFileId(item.id); setRenameValue(item.original_filename); },
        hidden: isSystem,
      },
      {
        label: t('ctx.move'),
        icon: FolderInput,
        onClick: () => openMoveModal([item.id]),
        hidden: isSystem,
      },
      {
        label: t('ctx.properties'),
        icon: Info,
        onClick: () => setPropertiesFile(item),
      },
      {
        label: t('ctx.share'),
        icon: Share2,
        onClick: () => handleShare(item),
        hidden: isFolder,
      },
      {
        label: t('ctx.download'),
        icon: Download,
        onClick: () => handleDownload(item),
        hidden: isFolder,
      },
      {
        label: t('ctx.decompress'),
        icon: Archive,
        onClick: () => decompressMutation.mutate(item.id),
        hidden: !isZip,
        disabled: decompressMutation.isPending,
      },
      {
        label: t('ctx.sendToMail'),
        separator: true,
        icon: Mail,
        onClick: () => handleSendToMail(item),
        hidden: isFolder,
      },
      {
        label: t('ctx.indexing'),
        icon: Database,
        onClick: () => indexMutation.mutate(item.id),
        hidden: isFolder || isIndexed,
        separator: true,
      },
      {
        label: '카테고리 지정',
        icon: Tag,
        onClick: () => {
          setCategoryPickerFile(item);
          setCategoryPickerPos({ x: contextMenu?.x ?? 0, y: contextMenu?.y ?? 0 });
        },
        hidden: isFolder,
      },
      {
        label: t('ctx.retry'),
        icon: RotateCcw,
        onClick: () => retryMutation.mutate(item.id),
        hidden: !isFailed,
      },
      {
        label: t('ctx.lockToVault'),
        icon: Lock,
        onClick: () => lockFileMutation.mutate({ fileId: item.id, filename: item.original_filename }),
        hidden: isFolder,
        disabled: lockFileMutation.isPending,
        separator: true,
      },
      {
        label: t('ctx.delete'),
        icon: Trash2,
        onClick: () => deleteMutation.mutate(item.id),
        danger: true,
        hidden: isSystem,
      },
    ];
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  const allItems = files || [];
  const folders = allItems.filter(f => f.mime_type === 'application/x-folder');
  const realFiles = allItems.filter(f => f.mime_type !== 'application/x-folder');
  const filteredFolders = folders.filter(f =>
    f.original_filename.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const filteredFiles = realFiles.filter(file =>
    file.original_filename.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const toggleSort = (field: 'name' | 'size' | 'date') => {
    if (sortField === field) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const sortIcon = (field: 'name' | 'size' | 'date') => {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3 opacity-40" />;
    return sortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />;
  };

  const sortItems = <T extends FileItem>(items: T[]): T[] => {
    if (!sortField) return items;
    return [...items].sort((a, b) => {
      let cmp = 0;
      if (sortField === 'name') cmp = a.original_filename.localeCompare(b.original_filename, 'ko');
      else if (sortField === 'size') cmp = (a.size ?? 0) - (b.size ?? 0);
      else if (sortField === 'date') cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      return sortDirection === 'desc' ? -cmp : cmp;
    });
  };

  const sortedFolders = sortItems(filteredFolders);
  const sortedFiles = sortItems(filteredFiles);

  const allVisibleIds = [...filteredFolders, ...filteredFiles].map((f) => f.id);
  const allSelected = allVisibleIds.length > 0 && allVisibleIds.every((id) => selectedIds.has(id));

  const toggleSelect = (id: string, e: React.MouseEvent | React.ChangeEvent) => {
    e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allVisibleIds));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    for (const id of Array.from(selectedIds)) {
      await deleteMutation.mutateAsync(id);
    }
    setSelectedIds(new Set());
  };

  const navigateToFolder = (folderName: string) => {
    const newPath = currentFolder === '/'
      ? `/${folderName}`
      : `${currentFolder}/${folderName}`;
    setCurrentFolder(newPath);
    setSelectedIds(new Set());
  };

  // Render file/folder name (or rename input)
  const renderName = (item: FileItem) => {
    if (renamingFileId === item.id) {
      return (
        <input
          ref={renameInputRef}
          type="text"
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleRenameSubmit();
            if (e.key === 'Escape') setRenamingFileId(null);
          }}
          onBlur={handleRenameSubmit}
          onClick={(e) => e.stopPropagation()}
          className="text-sm font-medium text-gray-100 bg-gray-700 border border-primary-500 rounded px-1 py-0.5 focus:outline-none focus:ring-2 focus:ring-primary-500 w-full"
        />
      );
    }
    return (
      <span className="text-sm font-medium text-gray-100 truncate">
        {item.original_filename}
      </span>
    );
  };

  return (
    <div className="h-screen flex overflow-hidden bg-surface">
      <Sidebar />

      <main className="flex-1 p-4 md:p-8 overflow-y-auto">
        <div className="max-w-[96rem] mx-auto">
          {/* Header */}
          <div className="mb-4 md:mb-8">
            <div className="flex items-center gap-3 mb-4">
              <FolderOpen className="w-8 h-8 text-primary-400" />
              <h1 className="text-2xl font-bold text-gray-100">{t('title')}</h1>
            </div>

            {/* Breadcrumb */}
            <div className="flex items-center gap-1 text-sm mb-6">
              <button
                onClick={() => setCurrentFolder('/')}
                className={`px-2 py-1 rounded hover:bg-gray-700 transition-colors ${
                  currentFolder === '/' ? 'font-semibold text-primary-400' : 'text-gray-400'
                }`}
              >
                {t('home')}
              </button>
              {currentFolder !== '/' && currentFolder.split('/').filter(Boolean).map((part, idx, arr) => {
                const path = '/' + arr.slice(0, idx + 1).join('/');
                return (
                  <span key={path} className="flex items-center gap-1">
                    <ChevronRight className="w-4 h-4 text-gray-500" />
                    <button
                      onClick={() => setCurrentFolder(path)}
                      className={`px-2 py-1 rounded hover:bg-gray-700 transition-colors ${
                        idx === arr.length - 1 ? 'font-semibold text-primary-400' : 'text-gray-400'
                      }`}
                    >
                      {part}
                    </button>
                  </span>
                );
              })}
            </div>

            {/* Toolbar */}
            <div className="bg-gray-800 rounded-xl shadow-sm p-3 md:p-4 border border-gray-700">
              <div className="flex items-center justify-between gap-2 md:gap-4 flex-wrap">
                <div className="flex items-center gap-1 sm:gap-3">
                  <label className="flex items-center gap-2 px-2 sm:px-4 py-1.5 sm:py-2 bg-gradient-to-r from-primary-500 to-primary-600 text-white rounded-lg hover:shadow-lg transition-all cursor-pointer hover:scale-105">
                    <Upload className="w-3.5 sm:w-4 h-3.5 sm:h-4" />
                    <span className="font-medium hidden sm:inline">{t('upload')}</span>
                    <input
                      type="file"
                      multiple
                      onChange={(e) => {
                        if (e.target.files) {
                          onDrop(Array.from(e.target.files));
                        }
                      }}
                      className="hidden"
                      accept="*/*"
                    />
                  </label>
                  <button
                    onClick={() => setShowCreateFolder(true)}
                    className="flex items-center gap-2 px-2 sm:px-4 py-1.5 sm:py-2 bg-gray-800 border border-gray-700 text-gray-300 rounded-lg hover:bg-gray-700 transition-colors"
                  >
                    <FolderPlus className="w-3.5 sm:w-4 h-3.5 sm:h-4" />
                    <span className="font-medium hidden sm:inline">{t('folder')}</span>
                  </button>
                  <button
                    onClick={() => openMoveModal(Array.from(selectedIds))}
                    disabled={selectedIds.size === 0 || moveMutation.isPending}
                    className="flex items-center gap-2 px-2 sm:px-4 py-1.5 sm:py-2 bg-gray-800 border border-gray-700 text-gray-300 rounded-lg hover:bg-primary-900/20 hover:text-primary-400 hover:border-primary-800/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <FolderInput className="w-3.5 sm:w-4 h-3.5 sm:h-4" />
                    <span className="font-medium hidden sm:inline">{t('move')}{selectedIds.size > 0 && ` (${selectedIds.size})`}</span>
                  </button>
                  <button
                    onClick={handleBulkDelete}
                    disabled={selectedIds.size === 0 || deleteMutation.isPending}
                    className="flex items-center gap-2 px-2 sm:px-4 py-1.5 sm:py-2 bg-gray-800 border border-gray-700 text-gray-300 rounded-lg hover:bg-red-900/20 hover:text-red-400 hover:border-red-800/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Trash2 className="w-3.5 sm:w-4 h-3.5 sm:h-4" />
                    <span className="font-medium hidden sm:inline">{t('delete')}{selectedIds.size > 0 && ` (${selectedIds.size})`}</span>
                  </button>
                  <button
                    onClick={() => queryClient.invalidateQueries({ queryKey: ['files', currentFolder] })}
                    className="flex items-center gap-2 px-2 sm:px-4 py-1.5 sm:py-2 bg-gray-800 border border-gray-700 text-gray-300 rounded-lg hover:bg-gray-700 transition-colors"
                  >
                    <RefreshCw className="w-3.5 sm:w-4 h-3.5 sm:h-4" />
                    <span className="font-medium hidden sm:inline">{t('refresh')}</span>
                  </button>
                </div>

                <div className="w-full md:flex-1 md:max-w-md order-first md:order-none">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder={t('searchPlaceholder')}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 bg-gray-700 border border-gray-600 text-white placeholder-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 border border-gray-700 rounded-lg p-1">
                  <button
                    onClick={() => setViewMode('grid')}
                    className={`p-2 rounded transition-colors ${
                      viewMode === 'grid' ? 'bg-gray-800 text-primary-400' : 'text-gray-400 hover:text-gray-100'
                    }`}
                  >
                    <Grid3x3 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setViewMode('list')}
                    className={`p-2 rounded transition-colors ${
                      viewMode === 'list' ? 'bg-gray-800 text-primary-400' : 'text-gray-400 hover:text-gray-100'
                    }`}
                  >
                    <List className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Storage Usage */}
              {user && (
                <div className="flex items-center gap-3 mt-3 pt-3 border-t border-gray-700">
                  <HardDrive className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <span className="text-sm text-gray-400 whitespace-nowrap">
                    {formatBytes(user.storage_used)} / {formatBytes(user.storage_quota)}
                  </span>
                  <div className="flex-1 bg-gray-700 rounded-full h-1.5 min-w-[80px]">
                    <div
                      className="bg-primary-500 h-1.5 rounded-full transition-all"
                      style={{ width: `${Math.min((user.storage_used / user.storage_quota) * 100, 100)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Create Folder Modal */}
            {showCreateFolder && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                <div className="bg-gray-800 rounded-lg shadow-lg p-6 w-96">
                  <h3 className="text-lg font-semibold text-gray-100 mb-4">{t('newFolder')}</h3>
                  <input
                    type="text"
                    placeholder={t('folderName')}
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 text-white placeholder-gray-400 rounded-lg mb-4 focus:outline-none focus:ring-2 focus:ring-primary-500"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newFolderName.trim()) {
                        createFolderMutation.mutate(newFolderName);
                      }
                    }}
                    autoFocus
                  />
                  <div className="flex justify-end gap-3">
                    <button
                      onClick={() => { setShowCreateFolder(false); setNewFolderName(''); }}
                      className="px-4 py-2 text-gray-300 border border-gray-600 rounded-lg hover:bg-gray-700"
                    >
                      {t('cancel')}
                    </button>
                    <button
                      onClick={() => { if (newFolderName.trim()) createFolderMutation.mutate(newFolderName); }}
                      disabled={createFolderMutation.isPending || !newFolderName.trim()}
                      className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50"
                    >
                      {t('create')}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Status Messages */}
          {uploading && (
            <div className="mb-4 bg-primary-500/10 border border-primary-500/20 rounded-lg p-4 flex items-center gap-3">
              <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-primary-400"></div>
              <span className="text-primary-300 font-medium">{t('uploading')}</span>
            </div>
          )}
          {uploadError && (
            <div className="mb-4 bg-red-900/30 border border-red-800/50 rounded-lg p-4 flex items-center justify-between">
              <span className="text-red-400">{uploadError}</span>
              <button onClick={() => setUploadError(null)} className="text-red-400 hover:text-red-300 font-bold">✕</button>
            </div>
          )}
          {shareMessage && (
            <div className="mb-4 bg-green-900/30 border border-green-800/50 rounded-lg p-4 flex items-center gap-3">
              <Check className="w-5 h-5 text-green-400" />
              <span className="text-green-400">{shareMessage}</span>
            </div>
          )}

          {/* File Content */}
          {isLoading ? (
            <div className="flex justify-center items-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary-500"></div>
            </div>
          ) : filteredFolders.length === 0 && filteredFiles.length === 0 ? (
            <div className="bg-gray-800 rounded-xl shadow-sm p-12 text-center">
              <FolderOpen className="w-16 h-16 mx-auto mb-4 text-gray-600" />
              <p className="text-gray-400 text-lg">
                {searchQuery ? t('noSearchResults') : t('noFiles')}
              </p>
              <p className="text-gray-500 text-sm mt-2">{t('uploadHint')}</p>
            </div>
          ) : viewMode === 'grid' ? (
            /* Grid View */
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {sortedFolders.map((folder) => (
                <div
                  key={folder.id}
                  id={`file-${folder.id}`}
                  onClick={() => navigateToFolder(folder.original_filename)}
                  onContextMenu={(e) => handleContextMenu(e, folder)}
                  className={`bg-gray-800 rounded-lg shadow-sm hover:shadow-md transition-shadow border overflow-hidden group cursor-pointer relative ${selectedIds.has(folder.id) ? 'border-primary-500 ring-1 ring-primary-500/30' : 'border-gray-700'}`}
                >
                  <div className="absolute top-2 left-2 z-10">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(folder.id)}
                      onChange={(e) => toggleSelect(folder.id, e)}
                      onClick={(e) => e.stopPropagation()}
                      className="toggle-check"
                    />
                  </div>
                  <div className="p-4 flex flex-col items-center justify-center h-32 bg-gradient-to-br from-yellow-900/20 to-orange-900/20 group-hover:from-yellow-900/30 group-hover:to-orange-900/30 transition-colors relative">
                    <FolderOpen className="w-12 h-12 text-yellow-500" />
                    {folder.is_system && <Lock className="w-3.5 h-3.5 text-gray-400 absolute bottom-2 right-2" />}
                  </div>
                  <div className="p-3 border-t border-gray-700 text-center">
                    {renderName(folder)}
                    <p className="text-xs text-gray-500 mt-1">{t('folder')}</p>
                  </div>
                </div>
              ))}
              {sortedFiles.map((file) => (
                <div
                  key={file.id}
                  id={`file-${file.id}`}
                  onClick={() => setPreviewFile(file)}
                  onContextMenu={(e) => handleContextMenu(e, file)}
                  className={`bg-gray-800 rounded-lg shadow-sm hover:shadow-md transition-shadow border overflow-hidden group relative cursor-pointer ${selectedIds.has(file.id) ? 'border-primary-500 ring-1 ring-primary-500/30' : 'border-gray-700'}`}
                >
                  <div className="absolute top-2 left-2 z-10">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(file.id)}
                      onChange={(e) => toggleSelect(file.id, e)}
                      onClick={(e) => e.stopPropagation()}
                      className="toggle-check"
                    />
                  </div>
                  <div className="p-4 flex flex-col items-center justify-center h-32 bg-gradient-to-br from-gray-800 to-gray-700 group-hover:from-primary-900/20 group-hover:to-primary-800/20 transition-colors relative">
                    <span className="text-5xl mb-2">{getFileIcon(file.mime_type)}</span>
                    {file.has_active_shares && (
                      <div className="absolute bottom-2 right-2 p-1 bg-emerald-500/90 rounded-full" title={t('shared')}>
                        <Link2 className="w-3 h-3 text-white" />
                      </div>
                    )}
                  </div>
                  <div className="p-3 border-t border-gray-700 text-center">
                    {renderName(file)}
                    <p className="text-xs text-gray-400 mt-1">{formatBytes(file.size)}</p>
                    <div className="flex items-center justify-center gap-2 mt-2">
                      <IndexStatusBadge file={file} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* List View */
            <div className="bg-gray-800 rounded-xl shadow-sm overflow-hidden border border-gray-700">
              <table className="w-full table-fixed">
                <thead className="bg-gray-900 border-b border-gray-700">
                  <tr>
                    <th className="w-10 pl-4 pr-2 py-3">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={toggleSelectAll}
                        className="toggle-check"
                      />
                    </th>
                    <th
                      onClick={() => toggleSort('name')}
                      className="px-4 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider cursor-pointer hover:text-gray-100 select-none"
                    >
                      <span className="inline-flex items-center gap-1">{t('name')} {sortIcon('name')}</span>
                    </th>
                    <th
                      onClick={() => toggleSort('size')}
                      className="hidden md:table-cell w-24 px-4 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider cursor-pointer hover:text-gray-100 select-none"
                    >
                      <span className="inline-flex items-center gap-1">{t('size')} {sortIcon('size')}</span>
                    </th>
                    <th
                      onClick={() => toggleSort('date')}
                      className="hidden md:table-cell w-36 px-4 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider cursor-pointer hover:text-gray-100 select-none"
                    >
                      <span className="inline-flex items-center gap-1">{t('date')} {sortIcon('date')}</span>
                    </th>
                    <th className="hidden sm:table-cell w-28 px-4 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">{t('indexing')}</th>
                    <th className="hidden lg:table-cell w-20 px-4 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">카테고리</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {sortedFolders.map((folder) => (
                    <tr
                      key={folder.id}
                      id={`file-${folder.id}`}
                      onClick={() => navigateToFolder(folder.original_filename)}
                      onContextMenu={(e) => handleContextMenu(e, folder)}
                      className={`hover:bg-yellow-900/10 transition-colors cursor-pointer ${selectedIds.has(folder.id) ? 'bg-gray-700' : ''}`}
                    >
                      <td className="pl-4 pr-2 py-4">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(folder.id)}
                          onChange={(e) => toggleSelect(folder.id, e)}
                          onClick={(e) => e.stopPropagation()}
                          className="toggle-check"
                        />
                      </td>
                      <td className="px-4 py-4 overflow-hidden max-w-0">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="relative flex-shrink-0">
                            <FolderOpen className="w-6 h-6 text-yellow-500" />
                            {folder.is_system && <Lock className="w-2.5 h-2.5 text-gray-400 absolute -bottom-0.5 -right-0.5" />}
                          </div>
                          <div className="min-w-0 truncate">{renderName(folder)}</div>
                        </div>
                      </td>
                      <td className="hidden md:table-cell px-4 py-4 whitespace-nowrap text-sm text-gray-500 truncate">-</td>
                      <td className="hidden md:table-cell px-4 py-4 whitespace-nowrap text-sm text-gray-400 truncate">{formatDate(folder.created_at)}</td>
                      <td className="hidden sm:table-cell px-4 py-4 whitespace-nowrap text-sm text-gray-500">-</td>
                      <td className="hidden lg:table-cell px-4 py-4">-</td>
                    </tr>
                  ))}
                  {sortedFiles.map((file) => (
                    <tr
                      key={file.id}
                      id={`file-${file.id}`}
                      onClick={() => setPreviewFile(file)}
                      onContextMenu={(e) => handleContextMenu(e, file)}
                      className={`hover:bg-gray-700 transition-colors cursor-pointer ${selectedIds.has(file.id) ? 'bg-gray-700' : ''}`}
                    >
                      <td className="pl-4 pr-2 py-4">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(file.id)}
                          onChange={(e) => toggleSelect(file.id, e)}
                          onClick={(e) => e.stopPropagation()}
                          className="toggle-check"
                        />
                      </td>
                      <td className="px-4 py-4 overflow-hidden max-w-0">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="text-2xl flex-shrink-0 relative">
                            {getFileIcon(file.mime_type)}
                            {file.has_active_shares && (
                              <span className="absolute -bottom-1 -right-1 p-0.5 bg-emerald-500/90 rounded-full" title={t('shared')}>
                                <Link2 className="w-2.5 h-2.5 text-white" />
                              </span>
                            )}
                          </span>
                          <div className="min-w-0 truncate">{renderName(file)}</div>
                        </div>
                      </td>
                      <td className="hidden md:table-cell px-4 py-4 whitespace-nowrap text-sm text-gray-400 truncate">{formatBytes(file.size)}</td>
                      <td className="hidden md:table-cell px-4 py-4 whitespace-nowrap text-sm text-gray-400 truncate">{formatDate(file.created_at)}</td>
                      <td className="hidden sm:table-cell px-4 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <IndexStatusBadge file={file} />
                          {file.index_status === 'failed' && (
                            <button
                              onClick={(e) => { e.stopPropagation(); retryMutation.mutate(file.id); }}
                              disabled={retryMutation.isPending}
                              className="p-1 text-yellow-400 hover:bg-yellow-900/20 rounded transition-colors"
                              title={t('ctx.retry')}
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="hidden lg:table-cell px-4 py-4">
                        <div className="flex gap-1 flex-wrap">
                          {(file.category_ids || []).map((cid) => {
                            const cat = categoryMap.get(cid);
                            if (!cat) return null;
                            return (
                              <span
                                key={cid}
                                className={`w-3 h-3 rounded-full ${CATEGORY_COLORS[cat.color] || 'bg-blue-500'}`}
                                title={cat.name}
                              />
                            );
                          })}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>


      {/* Context Menu */}
      {contextMenu && (
        <ContextMenuPortal
          x={contextMenu.x}
          y={contextMenu.y}
          items={getContextMenuItems(contextMenu.file)}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Category Picker Popup */}
      {categoryPickerFile && categories && (
        <CategoryPickerPopup
          x={categoryPickerPos.x}
          y={categoryPickerPos.y}
          categories={categories}
          selectedIds={categoryPickerFile.category_ids || []}
          onToggle={(catId) => {
            const current = categoryPickerFile.category_ids || [];
            const next = current.includes(catId)
              ? current.filter(id => id !== catId)
              : [...current, catId];
            setCategoryMutation.mutate({ fileId: categoryPickerFile.id, categoryIds: next });
          }}
          onClose={() => setCategoryPickerFile(null)}
        />
      )}

      {/* File Properties Modal */}
      {propertiesFile && (
        <FilePropertiesModal
          file={propertiesFile}
          onClose={() => setPropertiesFile(null)}
        />
      )}

      {/* File Preview Modal */}
      {previewFile && (
        <FilePreviewModal
          file={previewFile}
          onClose={() => setPreviewFile(null)}
        />
      )}

      {/* Move Folder Picker Modal */}
      {showMoveModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg shadow-lg border border-gray-700 w-[420px] max-h-[70vh] flex flex-col">
            <div className="px-5 py-4 border-b border-gray-700">
              <h3 className="text-lg font-semibold text-gray-100">{t('moveModal.title')}</h3>
              <p className="text-sm text-gray-400 mt-1">{t('moveModal.itemCount', { count: String(moveFileIds.length) })}</p>
            </div>

            {/* Browse breadcrumb */}
            <div className="px-5 py-3 border-b border-gray-700 flex items-center gap-1 text-sm overflow-x-auto">
              <button
                onClick={() => setMoveBrowseFolder('/')}
                className={`px-2 py-1 rounded hover:bg-gray-700 transition-colors flex-shrink-0 ${
                  moveBrowseFolder === '/' ? 'font-semibold text-primary-400' : 'text-gray-400'
                }`}
              >
                {t('home')}
              </button>
              {moveBrowseFolder !== '/' && moveBrowseFolder.split('/').filter(Boolean).map((part, idx, arr) => {
                const path = '/' + arr.slice(0, idx + 1).join('/');
                return (
                  <span key={path} className="flex items-center gap-1 flex-shrink-0">
                    <ChevronRight className="w-3 h-3 text-gray-500" />
                    <button
                      onClick={() => setMoveBrowseFolder(path)}
                      className={`px-2 py-1 rounded hover:bg-gray-700 transition-colors ${
                        idx === arr.length - 1 ? 'font-semibold text-primary-400' : 'text-gray-400'
                      }`}
                    >
                      {part}
                    </button>
                  </span>
                );
              })}
            </div>

            {/* Folder list */}
            <div className="flex-1 overflow-y-auto px-2 py-2 min-h-[200px]">
              {moveBrowseFolder !== '/' && (
                <button
                  onClick={() => {
                    const parts = moveBrowseFolder.split('/').filter(Boolean);
                    parts.pop();
                    setMoveBrowseFolder(parts.length > 0 ? '/' + parts.join('/') : '/');
                  }}
                  className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-gray-400 hover:bg-gray-700 transition-colors"
                >
                  <ChevronLeft className="w-5 h-5" />
                  {t('moveModal.parentFolder')}
                </button>
              )}
              {moveFolderList && moveFolderList.length > 0 ? (
                moveFolderList
                  .filter(f => !moveFileIds.includes(f.id))
                  .map((folder) => (
                    <button
                      key={folder.id}
                      onClick={() => {
                        const path = moveBrowseFolder === '/'
                          ? `/${folder.original_filename}`
                          : `${moveBrowseFolder}/${folder.original_filename}`;
                        setMoveBrowseFolder(path);
                      }}
                      className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-gray-200 hover:bg-gray-700 transition-colors"
                    >
                      <FolderOpen className="w-5 h-5 text-yellow-500" />
                      {folder.original_filename}
                    </button>
                  ))
              ) : (
                <div className="flex items-center justify-center h-20 text-sm text-gray-500">
                  {t('moveModal.noSubfolders')}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="px-5 py-4 border-t border-gray-700 flex items-center justify-between">
              <span className="text-sm text-gray-400 truncate max-w-[200px]">
                {t('moveModal.target')} <span className="text-gray-200 font-medium">{moveBrowseFolder === '/' ? t('home') : moveBrowseFolder}</span>
              </span>
              <div className="flex gap-3">
                <button
                  onClick={() => { setShowMoveModal(false); setMoveFileIds([]); }}
                  className="px-4 py-2 text-gray-300 border border-gray-600 rounded-lg hover:bg-gray-700 transition-colors"
                >
                  {t('cancel')}
                </button>
                <button
                  onClick={handleMoveConfirm}
                  disabled={moveMutation.isPending}
                  className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50 transition-colors flex items-center gap-2"
                >
                  {moveMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  {t('moveModal.moveHere')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Progress Modal */}
      <ProgressModal tasks={tasks} onClose={clearTasks} />
    </div>
  );
}


/* ─── Category Picker Popup (used by context menu) ─── */

function CategoryPickerPopup({
  x, y, categories, selectedIds, onToggle, onClose,
}: {
  x: number; y: number;
  categories: IndexCategory[];
  selectedIds: string[];
  onToggle: (catId: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });

  useLayoutEffect(() => {
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      const nx = x + rect.width > window.innerWidth ? x - rect.width : x;
      const ny = y + rect.height > window.innerHeight ? y - rect.height : y;
      setPos({ x: Math.max(0, nx), y: Math.max(0, ny) });
    }
  }, [x, y]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  if (categories.length === 0) return null;

  return createPortal(
    <div
      ref={ref}
      style={{ position: 'fixed', left: pos.x, top: pos.y }}
      className="bg-gray-800 rounded-lg shadow-lg border border-gray-700 py-1 min-w-[200px] z-[9999] animate-in fade-in duration-100"
    >
      <div className="px-3 py-1.5 text-xs text-gray-400 font-semibold">카테고리 선택</div>
      {categories.map((cat) => (
        <button
          key={cat.id}
          onClick={() => onToggle(cat.id)}
          className="flex items-center gap-3 w-full px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 transition-colors"
        >
          <span className={`w-3 h-3 rounded-full flex-shrink-0 ${CATEGORY_COLORS[cat.color] || 'bg-blue-500'}`} />
          <span className="flex-1 text-left">{cat.name}</span>
          {selectedIds.includes(cat.id) && <Check className="w-4 h-4 text-primary-400" />}
        </button>
      ))}
    </div>,
    document.body
  );
}
