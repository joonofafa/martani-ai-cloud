'use client';

import { useEffect, useLayoutEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/lib/store';
import { useTranslation } from '@/hooks/use-translation';
import { indexingApi } from '@/lib/api';
import { getErrorMessage } from '@/lib/errors';
import { Sidebar } from '@/components/sidebar';
import { formatBytes } from '@/lib/utils';
import {
  Database, Search, Loader2, Check,
  FileText, Image, Music, Video, Files, ChevronDown,
  Plus, Pencil, Trash2, X, Tag, Unlink,
} from 'lucide-react';
import { useConfirmDialog } from '@/components/confirm-dialog';
import type { SearchResult, IndexingFile, IndexCategory } from '@/types';

const CATEGORY_COLORS = [
  { value: 'blue', label: '파랑', class: 'bg-blue-500' },
  { value: 'red', label: '빨강', class: 'bg-red-500' },
  { value: 'green', label: '초록', class: 'bg-green-500' },
  { value: 'yellow', label: '노랑', class: 'bg-yellow-500' },
  { value: 'purple', label: '보라', class: 'bg-purple-500' },
  { value: 'pink', label: '분홍', class: 'bg-pink-500' },
  { value: 'orange', label: '주황', class: 'bg-orange-500' },
  { value: 'teal', label: '청록', class: 'bg-teal-500' },
];

export default function IndexingPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading: authLoading } = useAuthStore();
  const { t } = useTranslation('indexing');

  const TYPE_TABS = [
    { value: '', label: t('types.all'), icon: Files },
    { value: 'text', label: t('types.document'), icon: FileText },
    { value: 'image', label: t('types.image'), icon: Image },
    { value: 'audio', label: t('types.audio'), icon: Music },
    { value: 'video', label: t('types.video'), icon: Video },
  ];

  const [searchMode, setSearchMode] = useState<'semantic' | 'filename'>('semantic');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchTypeFilter, setSearchTypeFilter] = useState('');
  const [semanticResults, setSemanticResults] = useState<SearchResult[]>([]);
  const [filenameResults, setFilenameResults] = useState<IndexingFile[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Selected category for file listing
  const [selectedCategory, setSelectedCategory] = useState<IndexCategory | null>(null);

  // Selection state for search results
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set());
  const [categoryPopup, setCategoryPopup] = useState<{ x: number; y: number } | null>(null);

  const { data: allCategories } = useQuery({
    queryKey: ['index-categories'],
    queryFn: indexingApi.listCategories,
    enabled: isAuthenticated,
  });

  const { data: categoryFiles, isLoading: categoryFilesLoading } = useQuery({
    queryKey: ['indexing-category-files', selectedCategory?.id],
    queryFn: () => indexingApi.listFiles({ category_id: selectedCategory!.id, limit: 100 }),
    enabled: !!selectedCategory,
  });

  const bulkCategoryMutation = useMutation({
    mutationFn: ({ fileIds, categoryIds }: { fileIds: string[]; categoryIds: string[] }) =>
      indexingApi.bulkSetFileCategories(fileIds, categoryIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['index-categories'] });
      queryClient.invalidateQueries({ queryKey: ['files'] });
      setCategoryPopup(null);
    },
  });

  const removeFromCategoryMutation = useMutation({
    mutationFn: ({ categoryId, fileId }: { categoryId: string; fileId: string }) =>
      indexingApi.removeFileFromCategory(categoryId, fileId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['indexing-category-files'] });
      queryClient.invalidateQueries({ queryKey: ['index-categories'] });
      queryClient.invalidateQueries({ queryKey: ['files'] });
    },
  });

  const toggleFileSelect = (fileId: string) => {
    setSelectedFileIds(prev => {
      const next = new Set(prev);
      if (next.has(fileId)) next.delete(fileId);
      else next.add(fileId);
      return next;
    });
  };

  const handleResultContextMenu = (e: React.MouseEvent) => {
    if (selectedFileIds.size === 0) return;
    e.preventDefault();
    setCategoryPopup({ x: e.clientX, y: e.clientY });
  };

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, authLoading, router]);

  const { data: stats } = useQuery({
    queryKey: ['indexing-stats'],
    queryFn: indexingApi.getStats,
    enabled: isAuthenticated,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data && data.processing > 0) return 3000;
      return 10000;
    },
  });

  const semanticMutation = useMutation({
    mutationFn: (query: string) => indexingApi.search(query, 10, searchTypeFilter || undefined),
    onSuccess: (data) => {
      setSemanticResults(data.results);
      setFilenameResults([]);
      setHasSearched(true);
      setSearchError(null);
    },
    onError: (error: Error) => {
      setSearchError(getErrorMessage(error, t('searchError')));
      setHasSearched(true);
    },
  });

  const filenameMutation = useMutation({
    mutationFn: (query: string) => indexingApi.listFiles({
      search: query,
      type: searchTypeFilter || undefined,
      limit: 20,
    }),
    onSuccess: (data) => {
      setFilenameResults(data.items);
      setSemanticResults([]);
      setHasSearched(true);
      setSearchError(null);
    },
    onError: (error: Error) => {
      setSearchError(getErrorMessage(error, t('searchError')));
      setHasSearched(true);
    },
  });

  const handleSearch = () => {
    if (searchQuery.trim()) {
      if (searchMode === 'semantic') {
        semanticMutation.mutate(searchQuery.trim());
      } else {
        filenameMutation.mutate(searchQuery.trim());
      }
    }
  };

  const handleModeChange = (mode: 'semantic' | 'filename') => {
    setSearchMode(mode);
    setSemanticResults([]);
    setFilenameResults([]);
    setHasSearched(false);
    setSelectedFileIds(new Set());
  };

  const isSearching = semanticMutation.isPending || filenameMutation.isPending;
  const totalResults = semanticResults.length + filenameResults.length;

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  return (
    <div className="h-screen flex overflow-hidden bg-surface">
      <Sidebar />

      <main className="flex-1 p-4 md:p-8 overflow-y-auto">
        <div className="max-w-[96rem] mx-auto">
          {/* Header */}
          <div className="flex items-center gap-3 mb-4 md:mb-8">
            <Database className="w-7 h-7 text-primary-400" />
            <h1 className="text-2xl font-bold text-gray-100">{t('title')}</h1>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4 md:mb-8">
            <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
              <p className="text-sm text-gray-400 mb-1">{t('stats.totalFiles')}</p>
              <p className="text-2xl font-bold text-gray-100">{stats?.total ?? '-'}</p>
            </div>
            <div className="bg-gray-800 rounded-xl p-4 border border-green-800/30">
              <p className="text-sm text-green-400 mb-1">{t('stats.completed')}</p>
              <p className="text-2xl font-bold text-green-400">{stats?.indexed ?? '-'}</p>
            </div>
            <div className="bg-gray-800 rounded-xl p-4 border border-blue-800/30">
              <p className="text-sm text-blue-400 mb-1">{t('stats.processing')}</p>
              <p className="text-2xl font-bold text-blue-400">{stats?.processing ?? '-'}</p>
            </div>
            <div className="bg-gray-800 rounded-xl p-4 border border-red-800/30">
              <p className="text-sm text-red-400 mb-1">{t('stats.failed')}</p>
              <p className="text-2xl font-bold text-red-400">{stats?.failed ?? '-'}</p>
            </div>
            <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
              <p className="text-sm text-gray-400 mb-1">{t('stats.pending')}</p>
              <p className="text-2xl font-bold text-gray-300">{stats?.pending ?? '-'}</p>
            </div>
          </div>

          {/* Categories */}
          <CategorySection
            selectedCategory={selectedCategory}
            onSelectCategory={(cat) => setSelectedCategory(cat?.id === selectedCategory?.id ? null : cat)}
          />

          {/* Category file listing */}
          {selectedCategory && (
            <div className="bg-gray-800 rounded-xl p-6 border border-gray-700 mb-4 md:mb-8">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-100 flex items-center gap-2">
                  <span className={`w-3 h-3 rounded-full ${CATEGORY_COLORS.find(c => c.value === selectedCategory.color)?.class || 'bg-blue-500'}`} />
                  {selectedCategory.name}
                  <span className="text-sm font-normal text-gray-400">({selectedCategory.file_count}개 파일)</span>
                </h2>
                <button
                  onClick={() => setSelectedCategory(null)}
                  className="p-1.5 text-gray-400 hover:text-gray-200 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              {categoryFilesLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                </div>
              ) : !categoryFiles || categoryFiles.items.length === 0 ? (
                <p className="text-sm text-gray-500 py-4 text-center">이 카테고리에 파일이 없습니다.</p>
              ) : (
                <div className="space-y-2">
                  {categoryFiles.items.map((file) => (
                    <div
                      key={file.id}
                      onClick={() => router.push(`/files?folder=${encodeURIComponent(file.folder)}&highlight=${file.id}`)}
                      className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 sm:py-3 bg-gray-700/50 rounded-lg border border-gray-600 cursor-pointer hover:border-primary-500/50 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs sm:text-sm font-medium text-primary-400 truncate max-w-[55%] sm:max-w-none">{file.original_filename}</span>
                          <span className="text-[10px] sm:text-xs text-gray-400 flex-shrink-0">{formatBytes(file.size)}</span>
                          <span className={`text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 rounded-full flex-shrink-0 ${
                            file.index_status === 'completed' ? 'bg-green-500/20 text-green-400'
                              : file.index_status === 'processing' ? 'bg-blue-500/20 text-blue-400'
                              : file.index_status === 'failed' ? 'bg-red-500/20 text-red-400'
                              : 'bg-gray-600/50 text-gray-400'
                          }`}>{file.index_status}</span>
                        </div>
                        <p className="text-[10px] sm:text-xs text-gray-500 truncate mt-0.5">{file.folder === '/' ? t('home') : file.folder}</p>
                      </div>
                      <div className="flex items-center flex-shrink-0">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeFromCategoryMutation.mutate({
                              categoryId: selectedCategory.id,
                              fileId: file.id,
                            });
                          }}
                          disabled={removeFromCategoryMutation.isPending}
                          className="p-1 text-gray-500 hover:text-red-400 transition-colors"
                          title="카테고리에서 제거"
                        >
                          <Unlink className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Search */}
          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
            <h2 className="text-lg font-semibold text-gray-100 mb-4 flex items-center gap-2">
              <Search className="w-5 h-5 text-primary-400" />
              {t('search')}
            </h2>

            {/* Type filter */}
            <div className="flex flex-wrap items-center gap-1 mb-4">
              {TYPE_TABS.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.value}
                    onClick={() => setSearchTypeFilter(tab.value)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-colors ${
                      searchTypeFilter === tab.value
                        ? 'bg-primary-500/20 text-primary-400 font-medium'
                        : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {tab.label}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              {/* Search mode select */}
              <div className="relative flex-shrink-0">
                <select
                  value={searchMode}
                  onChange={(e) => handleModeChange(e.target.value as 'semantic' | 'filename')}
                  className="h-full px-3 pr-8 py-2.5 bg-gray-700 border border-gray-600 text-sm text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 appearance-none cursor-pointer"
                >
                  <option value="filename" className="bg-gray-700">{t('searchModes.filename')}</option>
                  <option value="semantic" className="bg-gray-700">{t('searchModes.semantic')}</option>
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              </div>

              <input
                type="text"
                placeholder={searchMode === 'semantic' ? t('searchPlaceholder.semantic') : t('searchPlaceholder.filename')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
                className="flex-1 px-4 py-2.5 bg-gray-700 border border-gray-600 text-white placeholder-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              <button
                onClick={handleSearch}
                disabled={isSearching || !searchQuery.trim()}
                className="px-6 py-2.5 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50 transition-colors flex items-center gap-2"
              >
                {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                {t('searchButton')}
              </button>
            </div>

            {/* Semantic Search Results */}
            {semanticResults.length > 0 && (
              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-400">{t('resultCount', { count: String(semanticResults.length) })}</p>
                  {selectedFileIds.size > 0 && (
                    <span className="text-xs text-primary-400">{selectedFileIds.size}개 선택 — 우클릭으로 카테고리 지정</span>
                  )}
                </div>
                {semanticResults.map((result, idx) => (
                  <div
                    key={idx}
                    onContextMenu={handleResultContextMenu}
                    onClick={() => router.push(`/files?folder=${encodeURIComponent(result.folder)}&highlight=${result.file_id}`)}
                    className={`bg-gray-700/50 rounded-lg p-4 border cursor-pointer hover:border-primary-500/50 transition-colors ${
                      selectedFileIds.has(result.file_id) ? 'border-primary-500/70 bg-primary-500/5' : 'border-gray-600'
                    }`}
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <input
                        type="checkbox"
                        checked={selectedFileIds.has(result.file_id)}
                        onChange={(e) => { e.stopPropagation(); toggleFileSelect(result.file_id); }}
                        onClick={(e) => e.stopPropagation()}
                        className="toggle-check flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1 flex-wrap">
                          <span className="text-sm font-medium text-primary-400 truncate max-w-[60%]">{result.filename}</span>
                          <span className="text-xs text-gray-400 flex-shrink-0">{t('similarity', { value: (result.similarity * 100).toFixed(1) })}</span>
                        </div>
                        <p className="text-xs text-gray-500 truncate mt-0.5">{result.folder === '/' ? t('home') : result.folder}</p>
                      </div>
                    </div>
                    <p className="text-sm text-gray-300 line-clamp-3 pl-7">{result.chunk_text}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Filename Search Results */}
            {filenameResults.length > 0 && (
              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-400">{t('resultCount', { count: String(filenameResults.length) })}</p>
                  {selectedFileIds.size > 0 && (
                    <span className="text-xs text-primary-400">{selectedFileIds.size}개 선택 — 우클릭으로 카테고리 지정</span>
                  )}
                </div>
                {filenameResults.map((file) => (
                  <div
                    key={file.id}
                    onContextMenu={handleResultContextMenu}
                    onClick={() => router.push(`/files?folder=${encodeURIComponent(file.folder)}&highlight=${file.id}`)}
                    className={`bg-gray-700/50 rounded-lg p-4 border cursor-pointer hover:border-primary-500/50 transition-colors ${
                      selectedFileIds.has(file.id) ? 'border-primary-500/70 bg-primary-500/5' : 'border-gray-600'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={selectedFileIds.has(file.id)}
                        onChange={(e) => { e.stopPropagation(); toggleFileSelect(file.id); }}
                        onClick={(e) => e.stopPropagation()}
                        className="toggle-check flex-shrink-0"
                      />
                      <div className="flex items-center justify-between flex-1 min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-sm font-medium text-primary-400 truncate">{file.original_filename}</span>
                          <span className="text-xs text-gray-500 flex-shrink-0">{file.folder === '/' ? t('home') : file.folder}</span>
                        </div>
                        <span className="text-xs text-gray-400 flex-shrink-0 ml-2">{formatBytes(file.size)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Search Error */}
            {searchError && (
              <div className="mt-4 bg-red-900/20 border border-red-700/50 rounded-lg p-4">
                <p className="text-sm text-red-400">{searchError}</p>
              </div>
            )}

            {/* No results */}
            {hasSearched && !searchError && totalResults === 0 && !isSearching && (
              <div className="mt-4 flex flex-col items-center justify-center py-8 text-gray-400">
                <Search className="w-10 h-10 mb-2 opacity-40" />
                <p className="text-sm font-medium">{t('noResults')}</p>
                <p className="text-xs text-gray-500 mt-1">{t('tryAnother')}</p>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Category assignment popup for selected search results */}
      {categoryPopup && allCategories && allCategories.length > 0 && (
        <CategoryAssignPopup
          x={categoryPopup.x}
          y={categoryPopup.y}
          categories={allCategories}
          onSelect={(catId) => {
            bulkCategoryMutation.mutate({
              fileIds: Array.from(selectedFileIds),
              categoryIds: [catId],
            });
            setSelectedFileIds(new Set());
          }}
          onClose={() => setCategoryPopup(null)}
        />
      )}
    </div>
  );
}


/* ─── Category Assignment Popup ─── */

function CategoryAssignPopup({
  x, y, categories, onSelect, onClose,
}: {
  x: number; y: number;
  categories: IndexCategory[];
  onSelect: (catId: string) => void;
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

  const colorClass = (c: string) =>
    CATEGORY_COLORS.find((cc) => cc.value === c)?.class || 'bg-blue-500';

  return createPortal(
    <div
      ref={ref}
      style={{ position: 'fixed', left: pos.x, top: pos.y }}
      className="bg-gray-800 rounded-lg shadow-lg border border-gray-700 py-1 min-w-[200px] z-[9999] animate-in fade-in duration-100"
    >
      <div className="px-3 py-1.5 text-xs text-gray-400 font-semibold">카테고리 지정</div>
      {categories.map((cat) => (
        <button
          key={cat.id}
          onClick={() => onSelect(cat.id)}
          className="flex items-center gap-3 w-full px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 transition-colors"
        >
          <span className={`w-3 h-3 rounded-full flex-shrink-0 ${colorClass(cat.color)}`} />
          <span className="flex-1 text-left">{cat.name}</span>
          <span className="text-xs text-gray-500">{cat.file_count}</span>
        </button>
      ))}
    </div>,
    document.body
  );
}


/* ─── Category Management Section ─── */

function CategorySection({
  selectedCategory,
  onSelectCategory,
}: {
  selectedCategory: IndexCategory | null;
  onSelectCategory: (cat: IndexCategory) => void;
}) {
  const queryClient = useQueryClient();
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const [showForm, setShowForm] = useState(false);
  const [editingCat, setEditingCat] = useState<IndexCategory | null>(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState('blue');

  const { data: categories, isLoading } = useQuery({
    queryKey: ['index-categories'],
    queryFn: indexingApi.listCategories,
  });

  const createMutation = useMutation({
    mutationFn: indexingApi.createCategory,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['index-categories'] });
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { name?: string; color?: string } }) =>
      indexingApi.updateCategory(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['index-categories'] });
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: indexingApi.deleteCategory,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['index-categories'] }),
  });

  const resetForm = () => {
    setShowForm(false);
    setEditingCat(null);
    setName('');
    setColor('blue');
  };

  const openEdit = (cat: IndexCategory) => {
    setEditingCat(cat);
    setName(cat.name);
    setColor(cat.color);
    setShowForm(true);
  };

  const handleSubmit = () => {
    if (!name.trim() || createMutation.isPending || updateMutation.isPending) return;
    if (editingCat) {
      updateMutation.mutate({ id: editingCat.id, data: { name, color } });
    } else {
      createMutation.mutate({ name, color });
    }
  };

  const colorClass = (c: string) =>
    CATEGORY_COLORS.find((cc) => cc.value === c)?.class || 'bg-blue-500';

  return (
    <div className="bg-gray-800 rounded-xl p-4 md:p-6 border border-gray-700 mb-4 md:mb-8">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-gray-100 flex items-center gap-2">
          <Tag className="w-5 h-5 text-primary-400" />
          카테고리
        </h2>
        <button
          onClick={() => { resetForm(); setShowForm(true); }}
          className="flex items-center gap-2 px-6 py-2.5 bg-primary-500 text-white text-sm rounded-lg hover:bg-primary-600 transition-colors"
        >
          <Plus className="w-4 h-4" />
          추가
        </button>
      </div>

      {/* Category list */}
      {isLoading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
        </div>
      ) : !categories || categories.length === 0 ? (
        <p className="text-sm text-gray-500 py-2">카테고리가 없습니다. 만들어서 파일을 분류하세요.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {categories.map((cat) => (
            <div
              key={cat.id}
              onClick={() => onSelectCategory(cat)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg group cursor-pointer transition-colors ${
                selectedCategory?.id === cat.id
                  ? 'bg-primary-500/15 border border-primary-500/50'
                  : 'bg-gray-900 border border-gray-700 hover:border-gray-600'
              }`}
            >
              <span className={`w-2.5 h-2.5 rounded-full ${colorClass(cat.color)}`} />
              <span className="text-sm text-gray-200">{cat.name}</span>
              <span className="text-xs text-gray-500">{cat.file_count}</span>
              <button
                onClick={(e) => { e.stopPropagation(); openEdit(cat); }}
                className="p-0.5 text-gray-500 hover:text-blue-400 opacity-0 group-hover:opacity-100 transition-all"
              >
                <Pencil className="w-3 h-3" />
              </button>
              <button
                onClick={async (e) => {
                  e.stopPropagation();
                  if (await confirm(`"${cat.name}" 카테고리를 삭제하시겠습니까?`)) deleteMutation.mutate(cat.id);
                }}
                className="p-0.5 text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit form (inline) */}
      {showForm && (
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
            placeholder="카테고리 이름"
            className="px-3 py-1.5 bg-gray-700 border border-gray-600 text-white placeholder-gray-400 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 w-40"
            autoFocus
          />
          <div className="flex gap-1">
            {CATEGORY_COLORS.map((c) => (
              <button
                key={c.value}
                onClick={() => setColor(c.value)}
                className={`w-5 h-5 rounded-full ${c.class} transition-all ${
                  color === c.value ? 'ring-2 ring-white ring-offset-1 ring-offset-gray-800' : 'opacity-50 hover:opacity-100'
                }`}
                title={c.label}
              />
            ))}
          </div>
          <button
            onClick={handleSubmit}
            disabled={!name.trim() || createMutation.isPending || updateMutation.isPending}
            className="px-3 py-1.5 bg-primary-500 text-white text-sm rounded-lg hover:bg-primary-600 disabled:opacity-50 transition-colors"
          >
            {editingCat ? '수정' : '생성'}
          </button>
          <button
            onClick={resetForm}
            className="p-1.5 text-gray-400 hover:text-gray-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {ConfirmDialog}
    </div>
  );
}
