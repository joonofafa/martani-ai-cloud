'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/lib/store';
import { useTranslation } from '@/hooks/use-translation';
import { adminApi, AdminUser } from '@/lib/api';
import { Sidebar } from '@/components/sidebar';
import { useConfirmDialog } from '@/components/confirm-dialog';
import { formatBytes, formatDate } from '@/lib/utils';
import {
  Users, Plus, Edit2, Trash2, Key, Check, X,
  Shield, User as UserIcon, ChevronLeft, Zap
} from 'lucide-react';

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toString();
}

const PLAN_STORAGE_DEFAULTS: Record<string, number> = {
  free: 1,    // GB
  basic: 10,  // GB
  pro: 100,   // GB
};

export default function AdminUsersPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t } = useTranslation('admin');
  const { user, isAuthenticated, isLoading } = useAuthStore();
  const { confirm, ConfirmDialog } = useConfirmDialog();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [showPasswordModal, setShowPasswordModal] = useState<string | null>(null);

  // Form states
  const [formEmail, setFormEmail] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formName, setFormName] = useState('');
  const [formRole, setFormRole] = useState('user');
  const [formPlan, setFormPlan] = useState('free');
  const [formQuota, setFormQuota] = useState('5');
  const [formActive, setFormActive] = useState(true);
  const [newPassword, setNewPassword] = useState('');

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
    if (!isLoading && user && user.role !== 'admin') {
      router.push('/files');
    }
  }, [isAuthenticated, isLoading, user, router]);

  const { data: users, isLoading: usersLoading } = useQuery({
    queryKey: ['admin-users'],
    queryFn: adminApi.listUsers,
    enabled: isAuthenticated && user?.role === 'admin',
  });

  const createUserMutation = useMutation({
    mutationFn: adminApi.createUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      setShowCreateModal(false);
      resetForm();
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: ({ userId, data }: { userId: string; data: Parameters<typeof adminApi.updateUser>[1] }) =>
      adminApi.updateUser(userId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      setEditingUser(null);
      resetForm();
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: ({ userId, password }: { userId: string; password: string }) =>
      adminApi.changeUserPassword(userId, password),
    onSuccess: () => {
      setShowPasswordModal(null);
      setNewPassword('');
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: adminApi.deleteUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
  });

  const resetForm = () => {
    setFormEmail('');
    setFormPassword('');
    setFormName('');
    setFormRole('user');
    setFormPlan('free');
    setFormQuota('5');
    setFormActive(true);
  };

  const openEditModal = (u: AdminUser) => {
    setEditingUser(u);
    setFormName(u.name || '');
    setFormRole(u.role);
    setFormPlan(u.plan || 'basic');
    setFormQuota((u.storage_quota / 1024 / 1024 / 1024).toString());
    setFormActive(u.is_active);
  };

  const handlePlanChange = (plan: string) => {
    setFormPlan(plan);
    const defaultGB = PLAN_STORAGE_DEFAULTS[plan] || 5;
    setFormQuota(defaultGB.toString());
  };

  const handleCreateUser = (e: React.FormEvent) => {
    e.preventDefault();
    createUserMutation.mutate({
      email: formEmail,
      password: formPassword,
      name: formName || undefined,
      role: formRole,
      plan: formPlan,
      storage_quota: parseFloat(formQuota) * 1024 * 1024 * 1024,
    });
  };

  const handleUpdateUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    updateUserMutation.mutate({
      userId: editingUser.id,
      data: {
        name: formName || undefined,
        role: formRole,
        is_active: formActive,
        plan: formPlan,
        storage_quota: parseFloat(formQuota) * 1024 * 1024 * 1024,
      },
    });
  };

  const handleChangePassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!showPasswordModal) return;
    changePasswordMutation.mutate({
      userId: showPasswordModal,
      password: newPassword,
    });
  };

  if (isLoading || !user || user.role !== 'admin') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-surface">
      <Sidebar />

      <main className="flex-1 p-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <a href="/admin" className="p-2 hover:bg-gray-700 rounded-lg transition-colors">
                <ChevronLeft className="w-5 h-5 text-gray-400" />
              </a>
              <Users className="w-8 h-8 text-primary-400" />
              <h1 className="text-2xl font-bold text-gray-100">{t('users.title')}</h1>
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors"
            >
              <Plus className="w-4 h-4" />
              {t('users.addUser')}
            </button>
          </div>

          {/* Users Table */}
          <div className="bg-gray-800 rounded-xl shadow-sm overflow-hidden">
            {usersLoading ? (
              <div className="p-8 text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary-500 mx-auto"></div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-900">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                        {t('users.user')}
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                        {t('users.plan')}
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                        {t('users.role')}
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                        {t('users.status')}
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                        {t('users.storage')}
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                        {t('users.tokenUsage')}
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                        {t('users.joinDate')}
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase">
                        {t('users.actions')}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700">
                    {users?.map((u) => {
                      const tokenPct = u.token_quota > 0 ? (u.tokens_used_month / u.token_quota) * 100 : 0;
                      return (
                        <tr key={u.id} className="hover:bg-gray-700">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-primary-500/20 flex items-center justify-center">
                                {u.role === 'admin' ? (
                                  <Shield className="w-5 h-5 text-primary-400" />
                                ) : (
                                  <UserIcon className="w-5 h-5 text-primary-400" />
                                )}
                              </div>
                              <div>
                                <p className="text-sm font-medium text-gray-100">{u.name || '-'}</p>
                                <p className="text-sm text-gray-400">{u.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap">
                            <span
                              className={`px-2 py-1 text-xs font-medium rounded-full ${
                                u.plan === 'pro'
                                  ? 'bg-purple-500/20 text-purple-400'
                                  : u.plan === 'basic'
                                    ? 'bg-blue-500/20 text-blue-400'
                                    : 'bg-gray-700 text-gray-300'
                              }`}
                            >
                              {u.plan === 'pro' ? 'Pro' : u.plan === 'basic' ? 'Basic' : 'Free'}
                            </span>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap">
                            <span
                              className={`px-2 py-1 text-xs rounded-full ${
                                u.role === 'admin'
                                  ? 'bg-accent-500/20 text-accent-400'
                                  : 'bg-gray-700 text-gray-300'
                              }`}
                            >
                              {u.role === 'admin' ? t('users.admin') : t('users.user')}
                            </span>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap">
                            {u.is_active ? (
                              <span className="flex items-center gap-1 text-green-400 text-sm">
                                <Check className="w-4 h-4" /> {t('users.active')}
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-red-400 text-sm">
                                <X className="w-4 h-4" /> {t('users.inactive')}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap">
                            <div className="text-sm">
                              <p className="text-gray-100">
                                {formatBytes(u.storage_used)} / {formatBytes(u.storage_quota)}
                              </p>
                              <div className="w-24 bg-gray-700 rounded-full h-1.5 mt-1">
                                <div
                                  className="bg-primary-500 h-1.5 rounded-full"
                                  style={{
                                    width: `${Math.min(
                                      (u.storage_used / u.storage_quota) * 100,
                                      100
                                    )}%`,
                                  }}
                                />
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap">
                            <div className="text-sm">
                              <div className="flex items-center gap-1 text-gray-100">
                                <Zap className="w-3 h-3 text-purple-400" />
                                {formatTokens(u.tokens_used_month)} / {formatTokens(u.token_quota)}
                              </div>
                              <div className="w-24 bg-gray-700 rounded-full h-1.5 mt-1">
                                <div
                                  className={`h-1.5 rounded-full ${
                                    tokenPct > 90 ? 'bg-red-500' : 'bg-purple-500'
                                  }`}
                                  style={{
                                    width: `${Math.min(tokenPct, 100)}%`,
                                  }}
                                />
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-400">
                            {formatDate(u.created_at)}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => openEditModal(u)}
                                className="p-2 text-gray-400 hover:text-primary-400 transition-colors"
                                title={t('users.edit')}
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => setShowPasswordModal(u.id)}
                                className="p-2 text-gray-400 hover:text-yellow-400 transition-colors"
                                title={t('users.changePassword')}
                              >
                                <Key className="w-4 h-4" />
                              </button>
                              {u.id !== user.id && (
                                <button
                                  onClick={async () => {
                                    if (await confirm(t('users.confirmDelete'))) {
                                      deleteUserMutation.mutate(u.id);
                                    }
                                  }}
                                  className="p-2 text-gray-400 hover:text-red-400 transition-colors"
                                  title={t('users.delete')}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Create User Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold text-gray-100 mb-4">{t('users.newUser')}</h2>
            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">{t('users.email')}</label>
                <input
                  type="email"
                  required
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-600 rounded-lg bg-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">{t('users.password')}</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={formPassword}
                  onChange={(e) => setFormPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-600 rounded-lg bg-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">{t('users.nameOptional')}</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-600 rounded-lg bg-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">{t('users.plan')}</label>
                <select
                  value={formPlan}
                  onChange={(e) => handlePlanChange(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-600 rounded-lg bg-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="free">Free (1GB)</option>
                  <option value="basic">Basic (10GB)</option>
                  <option value="pro">Pro (100GB)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">{t('users.role')}</label>
                <select
                  value={formRole}
                  onChange={(e) => setFormRole(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-600 rounded-lg bg-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="user">{t('users.user')}</option>
                  <option value="admin">{t('users.admin')}</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">{t('users.storageGB')}</label>
                <input
                  type="number"
                  min="1"
                  step="0.1"
                  value={formQuota}
                  onChange={(e) => setFormQuota(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-600 rounded-lg bg-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    resetForm();
                  }}
                  className="px-4 py-2 text-gray-300 hover:bg-gray-700 rounded-lg transition-colors"
                >
                  {t('users.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={createUserMutation.isPending}
                  className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50 transition-colors"
                >
                  {createUserMutation.isPending ? t('users.creating') : t('users.create')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {editingUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold text-gray-100 mb-4">{t('users.editUser')}</h2>
            <form onSubmit={handleUpdateUser} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">{t('users.email')}</label>
                <input
                  type="email"
                  value={editingUser.email}
                  disabled
                  className="w-full px-3 py-2 border border-gray-600 rounded-lg bg-gray-700 text-gray-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">{t('users.name')}</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-600 rounded-lg bg-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">{t('users.plan')}</label>
                <select
                  value={formPlan}
                  onChange={(e) => handlePlanChange(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-600 rounded-lg bg-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="free">Free (1GB)</option>
                  <option value="basic">Basic (10GB)</option>
                  <option value="pro">Pro (100GB)</option>
                </select>
              </div>
              {editingUser.id !== user.id && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">{t('users.role')}</label>
                    <select
                      value={formRole}
                      onChange={(e) => setFormRole(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-600 rounded-lg bg-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                    >
                      <option value="user">{t('users.user')}</option>
                      <option value="admin">{t('users.admin')}</option>
                    </select>
                  </div>
                  <div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formActive}
                        onChange={(e) => setFormActive(e.target.checked)}
                        className="toggle-check"
                      />
                      <span className="text-sm text-gray-300">{t('users.accountActive')}</span>
                    </label>
                  </div>
                </>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">{t('users.storageGB')}</label>
                <input
                  type="number"
                  min="1"
                  step="0.1"
                  value={formQuota}
                  onChange={(e) => setFormQuota(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-600 rounded-lg bg-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              {/* Token usage read-only */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">{t('users.tokenUsage')}</label>
                <div className="flex items-center gap-2 px-3 py-2 bg-gray-700 rounded-lg">
                  <Zap className="w-4 h-4 text-purple-400" />
                  <span className="text-sm text-gray-300">
                    {formatTokens(editingUser.tokens_used_month)} / {formatTokens(editingUser.token_quota)}
                  </span>
                  <div className="flex-1 bg-gray-600 rounded-full h-1.5 ml-2">
                    <div
                      className="bg-purple-500 h-1.5 rounded-full"
                      style={{
                        width: `${Math.min(
                          editingUser.token_quota > 0
                            ? (editingUser.tokens_used_month / editingUser.token_quota) * 100
                            : 0,
                          100
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setEditingUser(null);
                    resetForm();
                  }}
                  className="px-4 py-2 text-gray-300 hover:bg-gray-700 rounded-lg transition-colors"
                >
                  {t('users.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={updateUserMutation.isPending}
                  className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50 transition-colors"
                >
                  {updateUserMutation.isPending ? t('users.saving') : t('users.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Change Password Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold text-gray-100 mb-4">{t('users.changePassword')}</h2>
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  {t('users.newPassword')}
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-600 rounded-lg bg-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowPasswordModal(null);
                    setNewPassword('');
                  }}
                  className="px-4 py-2 text-gray-300 hover:bg-gray-700 rounded-lg transition-colors"
                >
                  {t('users.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={changePasswordMutation.isPending}
                  className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50 transition-colors"
                >
                  {changePasswordMutation.isPending ? t('users.changing') : t('users.change')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {ConfirmDialog}
    </div>
  );
}
