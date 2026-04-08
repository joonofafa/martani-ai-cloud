'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/lib/store';
import { authApi } from '@/lib/api';
import { getErrorMessage } from '@/lib/errors';
import { useTranslation } from '@/hooks/use-translation';
import { AxiosError } from 'axios';

export default function LoginPage() {
  const router = useRouter();
  const login = useAuthStore((state) => state.login);
  const { t } = useTranslation('auth');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showResend, setShowResend] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendMessage, setResendMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setShowResend(false);
    setResendMessage('');
    setLoading(true);

    try {
      await login(email, password);
      router.push('/files');
    } catch (err: unknown) {
      const detail = getErrorMessage(err, t('loginFailed'));
      setError(detail);
      if (err instanceof AxiosError && err.response?.status === 403 && (detail.includes('이메일 인증') || detail.includes('email verif'))) {
        setShowResend(true);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResendLoading(true);
    setResendMessage('');
    try {
      const result = await authApi.resendVerification(email);
      setResendMessage(result.message);
    } catch (err: unknown) {
      setResendMessage(t('resendFailed'));
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Decorative background elements */}
      <div className="absolute top-0 left-0 w-96 h-96 bg-gradient-to-br from-primary-500/15 to-primary-700/10 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2"></div>
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-gradient-to-br from-accent-500/10 to-accent-700/10 rounded-full blur-3xl translate-x-1/2 translate-y-1/2"></div>

      <div className="max-w-md w-full space-y-8 relative">
        <div className="text-center">
          <h1 className="text-5xl font-extrabold bg-gradient-to-r from-primary-400 to-primary-600 bg-clip-text text-transparent">
            Martani
          </h1>
          <h2 className="mt-4 text-2xl font-semibold text-gray-200">
            {t('login')}
          </h2>
          <p className="mt-2 text-sm text-gray-500">
            {t('loginSubtitle')}
          </p>
        </div>

        <form className="mt-8 space-y-6 bg-gray-800/70 backdrop-blur-xl rounded-2xl shadow-2xl border border-gray-700/50 p-8" onSubmit={handleSubmit}>
          <div className="space-y-6">
          {error && (
            <div className="bg-red-900/30 text-red-400 p-4 rounded-xl text-sm border border-red-800/50">
              {error}
              {showResend && (
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={resendLoading}
                    className="text-sm font-medium text-primary-400 hover:text-primary-300 underline disabled:opacity-50"
                  >
                    {resendLoading ? t('sending') : t('resendEmail')}
                  </button>
                  {resendMessage && (
                    <p className="mt-2 text-accent-400">{resendMessage}</p>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="space-y-5">
            <div>
              <label htmlFor="email" className="block text-sm font-semibold text-gray-300 mb-2">
                {t('email')}
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="block w-full px-4 py-3 border border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-gray-700 text-white placeholder-gray-400 transition-all duration-200"
                placeholder="email@example.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-semibold text-gray-300 mb-2">
                {t('password')}
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="block w-full px-4 py-3 border border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-gray-700 text-white placeholder-gray-400 transition-all duration-200"
                placeholder="••••••••"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex justify-center py-3.5 px-4 border border-transparent rounded-xl shadow-lg text-base font-semibold text-white bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 focus:ring-offset-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
          >
            {loading ? t('loggingIn') : t('login')}
          </button>

          <p className="text-center text-sm text-gray-400">
            {t('noAccount')}{' '}
            <Link href="/register" className="font-semibold text-primary-400 hover:text-primary-300 transition-colors">
              {t('register')}
            </Link>
          </p>
          </div>
        </form>
      </div>
    </div>
  );
}
