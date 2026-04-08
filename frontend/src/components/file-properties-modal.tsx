'use client';

import { useState, useEffect } from 'react';
import { X, Share2, Check, Copy, Trash2, Lock, Clock, Download } from 'lucide-react';
import { formatBytes, formatDate } from '@/lib/utils';
import { sharesApi, type FileShareInfo } from '@/lib/api';
import { getErrorMessage } from '@/lib/errors';
import { useTranslation } from '@/hooks/use-translation';
import type { FileItem } from '@/types';

interface FilePropertiesModalProps {
  file: FileItem;
  onClose: () => void;
}

const EXPIRY_OPTIONS = [
  { value: '1h', labelKey: 'share.expiry1h' },
  { value: '1d', labelKey: 'share.expiry1d' },
  { value: '7d', labelKey: 'share.expiry7d' },
  { value: '30d', labelKey: 'share.expiry30d' },
  { value: 'never', labelKey: 'share.expiryNever' },
];

export function FilePropertiesModal({ file, onClose }: FilePropertiesModalProps) {
  const { t } = useTranslation('files');
  const isFolder = file.mime_type === 'application/x-folder';

  // Share state
  const [shares, setShares] = useState<FileShareInfo[]>([]);
  const [sharesLoading, setSharesLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);

  // Create form state
  const [expiresIn, setExpiresIn] = useState('7d');
  const [password, setPassword] = useState('');

  // Load shares on mount
  useEffect(() => {
    if (!isFolder) {
      loadShares();
    }
  }, [file.id]);

  const loadShares = async () => {
    setSharesLoading(true);
    setShareError(null);
    try {
      const list = await sharesApi.list(file.id);
      setShares(list);
    } catch (error: unknown) {
      console.error('Failed to load shares:', error);
      setShareError(getErrorMessage(error, t('share.loadFailed')));
    } finally {
      setSharesLoading(false);
    }
  };

  const handleCreate = async () => {
    setCreating(true);
    setShareError(null);
    try {
      const share = await sharesApi.create(file.id, {
        expires_in: expiresIn,
        password: password || undefined,
      });
      setShares((prev) => [share, ...prev]);
      setPassword('');
    } catch (error: unknown) {
      console.error('Failed to create share:', error);
      setShareError(getErrorMessage(error, t('share.createFailed')));
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (shareId: string) => {
    setShareError(null);
    try {
      await sharesApi.revoke(file.id, shareId);
      setShares((prev) => prev.filter((s) => s.id !== shareId));
    } catch (error: unknown) {
      console.error('Failed to revoke share:', error);
      setShareError(getErrorMessage(error, t('share.revokeFailed')));
    }
  };

  const handleCopy = async (url: string, shareId: string) => {
    await navigator.clipboard.writeText(url);
    setCopiedId(shareId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const formatExpiry = (expiresAt: string | null) => {
    if (!expiresAt) return t('share.noExpiry');
    const d = new Date(expiresAt);
    const now = new Date();
    if (d < now) return t('share.expired');
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-gray-800 rounded-xl shadow-lg w-[480px] max-w-[90vw] max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <h3 className="text-lg font-semibold text-gray-100">{t('share.properties')}</h3>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-300 rounded transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-5 space-y-4">
          {/* File icon + name */}
          <div className="flex items-center gap-3 pb-4 border-b border-gray-700">
            <span className="text-3xl">
              {isFolder ? '\uD83D\uDCC1' : '\uD83D\uDCC4'}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-100 break-all">
                {file.original_filename}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                {isFolder ? t('folder') : (file.mime_type || t('share.unknownType'))}
              </p>
            </div>
          </div>

          {/* Properties table */}
          <div className="space-y-3">
            {!isFolder && (
              <PropertyRow label={t('size')} value={formatBytes(file.size)} />
            )}
            <PropertyRow label={t('share.location')} value={file.folder === '/' ? '/ (Root)' : file.folder} />
            <PropertyRow label={t('share.created')} value={formatDate(file.created_at)} />
            <PropertyRow label={t('share.modified')} value={formatDate(file.updated_at)} />
            {!isFolder && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400">{t('indexing')}</span>
                {file.is_indexed ? (
                  <span className="px-2 py-0.5 text-xs rounded-full bg-green-500/20 text-green-400 font-medium">
                    {t('status.completed')}
                  </span>
                ) : (
                  <span className="px-2 py-0.5 text-xs rounded-full bg-gray-700 text-gray-400">
                    {t('status.notIndexed')}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Share Section */}
          {!isFolder && (
            <div className="pt-4 border-t border-gray-700">
              <div className="flex items-center gap-2 mb-3">
                <Share2 className="w-4 h-4 text-primary-400" />
                <span className="text-sm font-medium text-gray-100">{t('share.title')}</span>
              </div>

              {shareError && (
                <div className="mb-3 px-3 py-2 bg-red-900/30 text-red-400 text-xs rounded-lg border border-red-800/50">
                  {shareError}
                </div>
              )}

              {/* Create form */}
              <div className="space-y-3 mb-4">
                <div className="flex gap-2">
                  <select
                    value={expiresIn}
                    onChange={(e) => setExpiresIn(e.target.value)}
                    className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-gray-200 focus:outline-none focus:border-primary-500"
                  >
                    {EXPIRY_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {t(opt.labelKey)}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t('share.passwordPlaceholder')}
                    className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-primary-500"
                  />
                </div>
                <button
                  onClick={handleCreate}
                  disabled={creating}
                  className="w-full px-4 py-2.5 bg-gradient-to-r from-primary-500 to-primary-600 text-white rounded-lg hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                >
                  {creating ? t('share.creating') : t('share.createLink')}
                </button>
              </div>

              {/* Shares list */}
              {sharesLoading ? (
                <p className="text-xs text-gray-500 text-center py-2">{t('share.loading')}</p>
              ) : shares.length === 0 ? (
                <p className="text-xs text-gray-500 text-center py-2">{t('share.noShares')}</p>
              ) : (
                <div className="space-y-2">
                  {shares.map((share) => (
                    <div
                      key={share.id}
                      className="flex items-center gap-2 px-3 py-2 bg-gray-700/50 border border-gray-600/50 rounded-lg"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-1">
                          <input
                            type="text"
                            value={share.url}
                            readOnly
                            className="flex-1 bg-transparent text-xs text-gray-300 truncate outline-none"
                          />
                        </div>
                        <div className="flex items-center gap-3 text-[10px] text-gray-500">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatExpiry(share.expires_at)}
                          </span>
                          {share.has_password && (
                            <span className="flex items-center gap-1">
                              <Lock className="w-3 h-3" />
                              {t('share.protected')}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <Download className="w-3 h-3" />
                            {share.download_count}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => handleCopy(share.url, share.id)}
                        className="p-1.5 text-gray-400 hover:text-gray-200 transition-colors"
                        title={t('share.copyLink')}
                      >
                        {copiedId === share.id ? (
                          <Check className="w-3.5 h-3.5 text-green-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                      <button
                        onClick={() => handleRevoke(share.id)}
                        className="p-1.5 text-gray-400 hover:text-red-400 transition-colors"
                        title={t('share.revoke')}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-700 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-300 border border-gray-600 rounded-lg hover:bg-gray-700 transition-colors"
          >
            {t('share.close')}
          </button>
        </div>
      </div>
    </div>
  );
}

function PropertyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-gray-400">{label}</span>
      <span className="text-sm text-gray-100 font-medium">{value}</span>
    </div>
  );
}
