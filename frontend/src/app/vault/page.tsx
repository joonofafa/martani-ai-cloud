'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/lib/store';
import { useTranslation } from '@/hooks/use-translation';
import { vaultApi } from '@/lib/api';
import { Sidebar } from '@/components/sidebar';
import { formatBytes, formatDate, getFileIcon } from '@/lib/utils';
import { ProgressModal, useProgressModal } from '@/components/progress-modal';
import { useConfirmDialog } from '@/components/confirm-dialog';
import {
  Shield, Key, FolderLock, Plus, Eye, EyeOff,
  Pencil, Trash2, X, Loader2, FolderOpen, Lock, Unlock,
  KeyRound, Calendar,
} from 'lucide-react';
import { getErrorMessage } from '@/lib/errors';
import type { VaultCredential, VaultFile, VaultApiKey } from '@/types';

type TabType = 'credentials' | 'files';

export default function VaultPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading: authLoading } = useAuthStore();
  const { t } = useTranslation('vault');
  const [activeTab, setActiveTab] = useState<TabType>('credentials');

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, authLoading, router]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500" />
      </div>
    );
  }

  return (
    <div className="h-screen flex overflow-hidden bg-surface">
      <Sidebar />
      <main className="flex-1 p-4 md:p-8 overflow-y-auto">
        <div className="max-w-[96rem] mx-auto">
          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <Shield className="w-8 h-8 text-primary-400" />
            <h1 className="text-2xl font-bold text-gray-100">{t('title')}</h1>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mb-6 bg-gray-800 rounded-lg p-1 w-fit border border-gray-700">
            <button
              onClick={() => setActiveTab('credentials')}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'credentials'
                  ? 'bg-primary-500 text-white'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'
              }`}
            >
              <Key className="w-4 h-4" />
              {t('credentials.tab')}
            </button>
            <button
              onClick={() => setActiveTab('files')}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'files'
                  ? 'bg-primary-500 text-white'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'
              }`}
            >
              <FolderLock className="w-4 h-4" />
              {t('files.tab')}
            </button>
          </div>

          {activeTab === 'credentials' ? <CredentialVaultTab /> : <FileVaultTab />}
        </div>
      </main>
    </div>
  );
}


// ── Credential Vault Tab ────────────────────────────────

function CredentialVaultTab() {
  const queryClient = useQueryClient();
  const { t } = useTranslation('vault');
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const [showModal, setShowModal] = useState(false);
  const [editingCred, setEditingCred] = useState<VaultCredential | null>(null);
  const [visiblePasswords, setVisiblePasswords] = useState<Set<string>>(new Set());
  const [revealedPasswords, setRevealedPasswords] = useState<Record<string, string>>({});

  const { data: credentials, isLoading } = useQuery({
    queryKey: ['vault-credentials'],
    queryFn: vaultApi.listCredentials,
  });

  const deleteMutation = useMutation({
    mutationFn: vaultApi.deleteCredential,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['vault-credentials'] }),
  });

  const togglePassword = async (id: string) => {
    const next = new Set(visiblePasswords);
    if (next.has(id)) {
      next.delete(id);
      setVisiblePasswords(next);
      return;
    }
    // Fetch real password
    if (!revealedPasswords[id]) {
      try {
        const detail = await vaultApi.getCredential(id);
        setRevealedPasswords((prev) => ({ ...prev, [id]: detail.password }));
      } catch (err: unknown) {
        console.warn('Failed to reveal password:', err);
        return;
      }
    }
    next.add(id);
    setVisiblePasswords(next);
  };

  const openEdit = async (cred: VaultCredential) => {
    // Get decrypted values for editing
    try {
      const detail = await vaultApi.getCredential(cred.id);
      setEditingCred(detail);
      setShowModal(true);
    } catch (err: unknown) {
      console.warn('Failed to fetch credential details, using cached:', err);
      setEditingCred(cred);
      setShowModal(true);
    }
  };

  return (
    <>
      {/* Section header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Key className="w-5 h-5 text-primary-400" />
          <h2 className="text-lg font-semibold text-gray-100">{t('credentials.sectionTitle')}</h2>
        </div>
        <button
          onClick={() => { setEditingCred(null); setShowModal(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors text-sm"
        >
          <Plus className="w-4 h-4" />
          {t('credentials.add')}
        </button>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary-400" />
        </div>
      ) : !credentials || credentials.length === 0 ? (
        <div className="bg-gray-800 rounded-xl p-12 text-center border border-gray-700">
          <Key className="w-16 h-16 mx-auto mb-4 text-gray-600" />
          <p className="text-gray-400 text-lg">{t('credentials.empty')}</p>
          <p className="text-gray-500 text-sm mt-2">{t('credentials.emptyHint')}</p>
        </div>
      ) : (
        <div className="bg-gray-800 rounded-xl shadow-sm overflow-hidden border border-gray-700">
          <table className="w-full">
            <thead className="bg-gray-900 border-b border-gray-700">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">{t('credentials.website')}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">ID</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">PASSWORD</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">{t('credentials.notes')}</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-300 uppercase tracking-wider">{t('credentials.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {credentials.map((cred) => (
                <tr key={cred.id} className="hover:bg-gray-700/50 transition-colors">
                  <td className="px-4 py-3 text-sm text-gray-200 max-w-[200px] truncate">{cred.site_name}</td>
                  <td className="px-4 py-3 text-sm text-gray-300 font-mono max-w-[150px] truncate">{cred.username}</td>
                  <td className="px-4 py-3 text-sm text-gray-300">
                    <div className="flex items-center gap-2">
                      <span className="font-mono">
                        {visiblePasswords.has(cred.id) ? (revealedPasswords[cred.id] || '...') : '••••••••'}
                      </span>
                      <button
                        onClick={() => togglePassword(cred.id)}
                        className="p-1 text-gray-400 hover:text-gray-200 transition-colors"
                        title={visiblePasswords.has(cred.id) ? t('credentials.hide') : t('credentials.show')}
                      >
                        {visiblePasswords.has(cred.id) ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-400 max-w-[150px] truncate">{cred.notes || '-'}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => openEdit(cred)}
                        className="p-1.5 text-gray-400 hover:text-blue-400 hover:bg-blue-900/20 rounded transition-colors"
                        title={t('credentials.edit')}
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={async () => { if (await confirm(t('credentials.confirmDelete'))) deleteMutation.mutate(cred.id); }}
                        disabled={deleteMutation.isPending}
                        className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-900/20 rounded transition-colors"
                        title={t('credentials.delete')}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <CredentialModal
          credential={editingCred}
          onClose={() => { setShowModal(false); setEditingCred(null); }}
        />
      )}

      {/* ── API Keys Section ── */}
      <ApiKeySection />
      {ConfirmDialog}
    </>
  );
}


// ── API Key Section ────────────────────────────────────

function ApiKeySection() {
  const queryClient = useQueryClient();
  const { t } = useTranslation('vault');
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const [showModal, setShowModal] = useState(false);
  const [editingKey, setEditingKey] = useState<VaultApiKey | null>(null);
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());
  const [revealedKeys, setRevealedKeys] = useState<Record<string, string>>({});

  const { data: apiKeys, isLoading } = useQuery({
    queryKey: ['vault-api-keys'],
    queryFn: vaultApi.listApiKeys,
  });

  const deleteMutation = useMutation({
    mutationFn: vaultApi.deleteApiKey,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['vault-api-keys'] }),
  });

  const toggleKey = async (id: string) => {
    const next = new Set(visibleKeys);
    if (next.has(id)) {
      next.delete(id);
      setVisibleKeys(next);
      return;
    }
    if (!revealedKeys[id]) {
      try {
        const detail = await vaultApi.getApiKey(id);
        setRevealedKeys((prev) => ({ ...prev, [id]: detail.api_key }));
      } catch (err: unknown) {
        console.warn('Failed to reveal API key:', err);
        return;
      }
    }
    next.add(id);
    setVisibleKeys(next);
  };

  const openEdit = async (ak: VaultApiKey) => {
    try {
      const detail = await vaultApi.getApiKey(ak.id);
      setEditingKey(detail);
      setShowModal(true);
    } catch (err: unknown) {
      console.warn('Failed to fetch API key details, using cached:', err);
      setEditingKey(ak);
      setShowModal(true);
    }
  };

  const isExpired = (expiresAt: string | null) => {
    if (!expiresAt) return false;
    return new Date(expiresAt) < new Date();
  };

  return (
    <>
      {/* Section header */}
      <div className="mt-10 mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <KeyRound className="w-5 h-5 text-primary-400" />
          <h2 className="text-lg font-semibold text-gray-100">{t('apiKeys.title')}</h2>
        </div>
        <button
          onClick={() => { setEditingKey(null); setShowModal(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors text-sm"
        >
          <Plus className="w-4 h-4" />
          {t('apiKeys.add')}
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary-400" />
        </div>
      ) : !apiKeys || apiKeys.length === 0 ? (
        <div className="bg-gray-800 rounded-xl p-12 text-center border border-gray-700">
          <KeyRound className="w-16 h-16 mx-auto mb-4 text-gray-600" />
          <p className="text-gray-400 text-lg">{t('apiKeys.empty')}</p>
          <p className="text-gray-500 text-sm mt-2">{t('apiKeys.emptyHint')}</p>
        </div>
      ) : (
        <div className="bg-gray-800 rounded-xl shadow-sm overflow-hidden border border-gray-700">
          <table className="w-full">
            <thead className="bg-gray-900 border-b border-gray-700">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">{t('apiKeys.website')}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">{t('apiKeys.apiKey')}</th>
                <th className="hidden md:table-cell px-4 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">{t('apiKeys.expiresAt')}</th>
                <th className="hidden lg:table-cell px-4 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">{t('apiKeys.notes')}</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-300 uppercase tracking-wider">{t('apiKeys.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {apiKeys.map((ak) => (
                <tr key={ak.id} className="hover:bg-gray-700/50 transition-colors">
                  <td className="px-4 py-3 text-sm text-gray-200 max-w-[200px] truncate">{ak.site_name}</td>
                  <td className="px-4 py-3 text-sm text-gray-300">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs">
                        {visibleKeys.has(ak.id) ? (revealedKeys[ak.id] || '...') : ak.api_key}
                      </span>
                      <button
                        onClick={() => toggleKey(ak.id)}
                        className="p-1 text-gray-400 hover:text-gray-200 transition-colors"
                        title={visibleKeys.has(ak.id) ? t('apiKeys.hide') : t('apiKeys.show')}
                      >
                        {visibleKeys.has(ak.id) ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </td>
                  <td className="hidden md:table-cell px-4 py-3 text-sm">
                    {ak.expires_at ? (
                      <span className={isExpired(ak.expires_at) ? 'text-red-400' : 'text-gray-400'}>
                        {isExpired(ak.expires_at) && <span className="mr-1">⚠</span>}
                        {new Date(ak.expires_at).toLocaleDateString()}
                      </span>
                    ) : (
                      <span className="text-gray-500">{t('apiKeys.noExpiry')}</span>
                    )}
                  </td>
                  <td className="hidden lg:table-cell px-4 py-3 text-sm text-gray-400 max-w-[150px] truncate">{ak.notes || '-'}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => openEdit(ak)}
                        className="p-1.5 text-gray-400 hover:text-blue-400 hover:bg-blue-900/20 rounded transition-colors"
                        title={t('apiKeys.edit')}
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={async () => { if (await confirm(t('apiKeys.confirmDelete'))) deleteMutation.mutate(ak.id); }}
                        disabled={deleteMutation.isPending}
                        className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-900/20 rounded transition-colors"
                        title={t('apiKeys.delete')}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <ApiKeyModal
          apiKey={editingKey}
          onClose={() => { setShowModal(false); setEditingKey(null); }}
        />
      )}
      {ConfirmDialog}
    </>
  );
}


function ApiKeyModal({ apiKey, onClose }: { apiKey: VaultApiKey | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { t } = useTranslation('vault');
  const isEdit = !!apiKey;

  const [siteName, setSiteName] = useState(apiKey?.site_name || '');
  const [key, setKey] = useState(apiKey?.api_key && !apiKey.api_key.includes('••••') ? apiKey.api_key : '');
  const [expiresAt, setExpiresAt] = useState(apiKey?.expires_at ? apiKey.expires_at.slice(0, 10) : '');
  const [notes, setNotes] = useState(apiKey?.notes || '');
  const [showKey, setShowKey] = useState(false);

  const createMutation = useMutation({
    mutationFn: vaultApi.createApiKey,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vault-api-keys'] });
      onClose();
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: Parameters<typeof vaultApi.updateApiKey>[1]) =>
      vaultApi.updateApiKey(apiKey!.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vault-api-keys'] });
      onClose();
    },
  });

  const handleSubmit = () => {
    if (!siteName.trim()) return;
    if (isEdit) {
      const data: Parameters<typeof vaultApi.updateApiKey>[1] = { site_name: siteName, notes: notes || undefined, expires_at: expiresAt || undefined };
      if (key) data.api_key = key;
      updateMutation.mutate(data);
    } else {
      if (!key.trim()) return;
      createMutation.mutate({
        site_name: siteName,
        api_key: key,
        expires_at: expiresAt || undefined,
        notes: notes || undefined,
      });
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg shadow-lg border border-gray-700 w-full max-w-[440px] mx-4 p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-semibold text-gray-100">
            {isEdit ? t('apiKeys.editTitle') : t('apiKeys.addTitle')}
          </h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">{t('apiKeys.website')}</label>
            <input
              type="text"
              value={siteName}
              onChange={(e) => setSiteName(e.target.value)}
              placeholder={t('apiKeys.websitePlaceholder')}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 text-white placeholder-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">{t('apiKeys.apiKey')}</label>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder={t('apiKeys.apiKeyPlaceholder')}
                className="w-full px-3 py-2 pr-10 bg-gray-700 border border-gray-600 text-white placeholder-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono text-sm"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-200"
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">{t('apiKeys.expiresAtOptional')}</label>
            <input
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 text-white placeholder-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">{t('apiKeys.notesOptional')}</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('apiKeys.notesPlaceholder')}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 text-white placeholder-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-300 border border-gray-600 rounded-lg hover:bg-gray-700 transition-colors"
          >
            {t('apiKeys.cancel')}
          </button>
          <button
            onClick={handleSubmit}
            disabled={isPending || !siteName.trim() || (!isEdit && !key.trim())}
            className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            {isEdit ? t('apiKeys.edit') : t('apiKeys.add')}
          </button>
        </div>
      </div>
    </div>
  );
}


function CredentialModal({ credential, onClose }: { credential: VaultCredential | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { t } = useTranslation('vault');
  const isEdit = !!credential;

  const [siteName, setSiteName] = useState(credential?.site_name || '');
  const [username, setUsername] = useState(credential?.username || '');
  const [password, setPassword] = useState(credential?.password === '••••••••' ? '' : credential?.password || '');
  const [notes, setNotes] = useState(credential?.notes || '');
  const [showPw, setShowPw] = useState(false);

  const createMutation = useMutation({
    mutationFn: vaultApi.createCredential,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vault-credentials'] });
      onClose();
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: Parameters<typeof vaultApi.updateCredential>[1]) =>
      vaultApi.updateCredential(credential!.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vault-credentials'] });
      onClose();
    },
  });

  const handleSubmit = () => {
    if (!siteName.trim() || !username.trim()) return;
    if (isEdit) {
      const data: Parameters<typeof vaultApi.updateCredential>[1] = { site_name: siteName, username, notes: notes || undefined };
      if (password) data.password = password;
      updateMutation.mutate(data);
    } else {
      if (!password.trim()) return;
      createMutation.mutate({ site_name: siteName, username, password, notes: notes || undefined });
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg shadow-lg border border-gray-700 w-full max-w-[440px] mx-4 p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-semibold text-gray-100">
            {isEdit ? t('credentials.editTitle') : t('credentials.addTitle')}
          </h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">{t('credentials.website')}</label>
            <input
              type="text"
              value={siteName}
              onChange={(e) => setSiteName(e.target.value)}
              placeholder={t('credentials.websitePlaceholder')}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 text-white placeholder-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">{t('credentials.username')}</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={t('credentials.usernamePlaceholder')}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 text-white placeholder-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              {isEdit ? t('credentials.passwordEditHint') : t('credentials.password')}
            </label>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={isEdit ? t('credentials.passwordPlaceholderEdit') : t('credentials.password')}
                className="w-full px-3 py-2 pr-10 bg-gray-700 border border-gray-600 text-white placeholder-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              <button
                type="button"
                onClick={() => setShowPw(!showPw)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-200"
              >
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">{t('credentials.notesOptional')}</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('credentials.notesPlaceholder')}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 text-white placeholder-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-300 border border-gray-600 rounded-lg hover:bg-gray-700 transition-colors"
          >
            {t('credentials.cancel')}
          </button>
          <button
            onClick={handleSubmit}
            disabled={isPending || !siteName.trim() || !username.trim() || (!isEdit && !password.trim())}
            className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            {isEdit ? t('credentials.edit') : t('credentials.add')}
          </button>
        </div>
      </div>
    </div>
  );
}


// ── File Vault Tab ──────────────────────────────────────

function FileVaultTab() {
  const queryClient = useQueryClient();
  const { t } = useTranslation('vault');
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; file: VaultFile } | null>(null);
  const { tasks, addTask, updateTask, clearTasks } = useProgressModal();

  const { data: vaultFiles, isLoading } = useQuery({
    queryKey: ['vault-files'],
    queryFn: vaultApi.listFiles,
  });

  const unlockMutation = useMutation({
    mutationFn: async ({ vaultId, filename }: { vaultId: string; filename: string }) => {
      const taskId = addTask('vault-unlock', filename);
      try {
        const result = await vaultApi.unlockFile(vaultId);
        updateTask(taskId, 'completed', '꺼내기 완료');
        return result;
      } catch (error: unknown) {
        updateTask(taskId, 'failed', getErrorMessage(error, '꺼내기 실패'));
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vault-files'] });
      queryClient.invalidateQueries({ queryKey: ['files'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: vaultApi.deleteFile,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['vault-files'] }),
  });

  const handleContextMenu = (e: React.MouseEvent, file: VaultFile) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, file });
  };

  // Close context menu on click outside
  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => setContextMenu(null);
    window.addEventListener('click', handler);
    return () => window.removeEventListener('click', handler);
  }, [contextMenu]);

  return (
    <>
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary-400" />
        </div>
      ) : !vaultFiles || vaultFiles.length === 0 ? (
        <div className="bg-gray-800 rounded-xl p-12 text-center border border-gray-700">
          <FolderLock className="w-16 h-16 mx-auto mb-4 text-gray-600" />
          <p className="text-gray-400 text-lg">{t('files.empty')}</p>
          <p className="text-gray-500 text-sm mt-2">{t('files.emptyHint')}</p>
        </div>
      ) : (
        <div className="bg-gray-800 rounded-xl shadow-sm overflow-hidden border border-gray-700">
          <table className="w-full">
            <thead className="bg-gray-900 border-b border-gray-700">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">{t('files.filename')}</th>
                <th className="hidden md:table-cell px-4 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">{t('files.originalSize')}</th>
                <th className="hidden md:table-cell px-4 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">{t('files.originalFolder')}</th>
                <th className="hidden sm:table-cell px-4 py-3 text-left text-xs font-semibold text-gray-300 uppercase tracking-wider">{t('files.storedDate')}</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-300 uppercase tracking-wider">{t('files.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {vaultFiles.map((file) => (
                <tr
                  key={file.id}
                  onContextMenu={(e) => handleContextMenu(e, file)}
                  className="hover:bg-gray-700/50 transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <span className="text-2xl">{getFileIcon(file.original_mime_type)}</span>
                        <Lock className="w-3 h-3 text-yellow-400 absolute -bottom-0.5 -right-0.5" />
                      </div>
                      <span className="text-sm text-gray-200 truncate max-w-[200px]">{file.original_filename}</span>
                    </div>
                  </td>
                  <td className="hidden md:table-cell px-4 py-3 text-sm text-gray-400">{formatBytes(file.original_size)}</td>
                  <td className="hidden md:table-cell px-4 py-3 text-sm text-gray-400">{file.original_folder}</td>
                  <td className="hidden sm:table-cell px-4 py-3 text-sm text-gray-400">{formatDate(file.created_at)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => unlockMutation.mutate({ vaultId: file.id, filename: file.original_filename })}
                        disabled={unlockMutation.isPending}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-green-400 hover:bg-green-900/20 rounded transition-colors"
                        title={t('files.unlock')}
                      >
                        <Unlock className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">{t('files.unlockShort')}</span>
                      </button>
                      <button
                        onClick={async () => { if (await confirm(t('files.confirmDelete'))) deleteMutation.mutate(file.id); }}
                        disabled={deleteMutation.isPending}
                        className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-900/20 rounded transition-colors"
                        title={t('files.delete')}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Context menu */}
      {contextMenu && (
        <div
          className="fixed bg-gray-800 rounded-lg shadow-xl border border-gray-700 py-1 z-50 min-w-[160px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            onClick={() => { unlockMutation.mutate({ vaultId: contextMenu.file.id, filename: contextMenu.file.original_filename }); setContextMenu(null); }}
            className="flex items-center gap-3 w-full px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 transition-colors"
          >
            <Unlock className="w-4 h-4 text-green-400" />
            {t('files.unlock')}
          </button>
          <button
            onClick={async () => {
              if (await confirm(t('files.confirmDelete'))) deleteMutation.mutate(contextMenu.file.id);
              setContextMenu(null);
            }}
            className="flex items-center gap-3 w-full px-3 py-2 text-sm text-red-400 hover:bg-gray-700 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            {t('files.delete')}
          </button>
        </div>
      )}

      <ProgressModal tasks={tasks} onClose={clearTasks} />
      {ConfirmDialog}
    </>
  );
}
