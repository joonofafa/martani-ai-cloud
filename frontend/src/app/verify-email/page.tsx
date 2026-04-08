'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { authApi } from '@/lib/api';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { useTranslation } from '@/hooks/use-translation';

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const { t } = useTranslation('auth');
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage(t('noToken'));
      return;
    }

    authApi.verifyEmail(token)
      .then((res) => {
        setStatus('success');
        setMessage(res.message);
      })
      .catch((err) => {
        setStatus('error');
        setMessage(err.response?.data?.detail || t('verificationFailed'));
      });
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-96 h-96 bg-gradient-to-br from-primary-500/15 to-primary-700/10 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2"></div>
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-gradient-to-br from-accent-500/10 to-accent-700/10 rounded-full blur-3xl translate-x-1/2 translate-y-1/2"></div>

      <div className="max-w-md w-full space-y-8 relative">
        <div className="text-center">
          <h1 className="text-5xl font-extrabold bg-gradient-to-r from-primary-400 to-primary-600 bg-clip-text text-transparent">
            Martani
          </h1>
        </div>

        <div className="bg-gray-800/70 backdrop-blur-xl rounded-2xl shadow-2xl border border-gray-700/50 p-8">
          <div className="text-center space-y-6">
            {status === 'loading' && (
              <>
                <div className="mx-auto w-16 h-16 bg-primary-500/20 rounded-full flex items-center justify-center">
                  <Loader2 className="w-8 h-8 text-primary-400 animate-spin" />
                </div>
                <h2 className="text-xl font-semibold text-gray-100">{t('verifying')}</h2>
                <p className="text-gray-500 text-sm">{t('pleaseWait')}</p>
              </>
            )}

            {status === 'success' && (
              <>
                <div className="mx-auto w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center">
                  <CheckCircle className="w-8 h-8 text-green-400" />
                </div>
                <h2 className="text-xl font-semibold text-gray-100">{t('verificationComplete')}</h2>
                <p className="text-gray-400 text-sm">{message}</p>
                <Link
                  href="/login"
                  className="inline-block w-full py-3 px-4 text-center border border-transparent rounded-xl shadow-lg text-base font-semibold text-white bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 transition-all duration-200"
                >
                  {t('loginAction')}
                </Link>
              </>
            )}

            {status === 'error' && (
              <>
                <div className="mx-auto w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center">
                  <XCircle className="w-8 h-8 text-red-400" />
                </div>
                <h2 className="text-xl font-semibold text-gray-100">{t('verificationFailedTitle')}</h2>
                <p className="text-gray-400 text-sm">{message}</p>
                <Link
                  href="/login"
                  className="inline-block w-full py-3 px-4 text-center border border-gray-600 rounded-xl text-base font-semibold text-gray-300 hover:bg-gray-700 transition-all duration-200"
                >
                  {t('goToLogin')}
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
      </div>
    }>
      <VerifyEmailContent />
    </Suspense>
  );
}
