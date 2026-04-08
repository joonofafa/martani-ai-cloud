'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Script from 'next/script';
import { authApi } from '@/lib/api';
import { getErrorMessage } from '@/lib/errors';
import { Mail, ExternalLink } from 'lucide-react';
import { AxiosError } from 'axios';
import { useTranslation } from '@/hooks/use-translation';
import { useI18nStore } from '@/lib/i18n';

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '';

interface TurnstileInstance {
  render: (element: HTMLElement, options: Record<string, unknown>) => string;
  remove: (widgetId: string) => void;
  reset: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileInstance;
  }
}

export default function RegisterPage() {
  const router = useRouter();
  const { t } = useTranslation('auth');
  const locale = useI18nStore((s) => s.locale);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState('');
  const turnstileRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  const renderTurnstile = useCallback(() => {
    if (!TURNSTILE_SITE_KEY || !turnstileRef.current || widgetIdRef.current !== null) return;
    if (!window.turnstile) return;
    widgetIdRef.current = window.turnstile.render(turnstileRef.current, {
      sitekey: TURNSTILE_SITE_KEY,
      theme: 'dark',
      callback: (token: string) => setTurnstileToken(token),
      'expired-callback': () => setTurnstileToken(''),
    });
  }, []);

  useEffect(() => {
    // If script already loaded before component mounts
    if (window.turnstile && TURNSTILE_SITE_KEY) {
      renderTurnstile();
    }
    return () => {
      // Cleanup widget on unmount
      if (widgetIdRef.current !== null && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [renderTurnstile]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (!agreedToTerms) {
      setError(t('termsRequired'));
      setLoading(false);
      return;
    }

    if (TURNSTILE_SITE_KEY && !turnstileToken) {
      setError(t('captchaRequired'));
      setLoading(false);
      return;
    }

    try {
      const res = await authApi.register(email, password, name || undefined, true, turnstileToken || undefined);
      if (res.auto_verified) {
        router.push('/login');
      } else {
        setRegistered(true);
      }
    } catch (err: unknown) {
      const status = err instanceof AxiosError ? err.response?.status : undefined;
      if (status === 429) {
        setError(t('tooManyRequests'));
      } else {
        setError(getErrorMessage(err, t('registerFailed')));
      }
      // Reset Turnstile widget for retry
      if (widgetIdRef.current !== null && window.turnstile) {
        window.turnstile.reset(widgetIdRef.current);
        setTurnstileToken('');
      }
    } finally {
      setLoading(false);
    }
  };

  if (registered) {
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
              <div className="mx-auto w-16 h-16 bg-primary-500/20 rounded-full flex items-center justify-center">
                <Mail className="w-8 h-8 text-primary-400" />
              </div>
              <h2 className="text-xl font-semibold text-gray-100">{t('verificationRequired')}</h2>
              <p className="text-gray-400 text-sm leading-relaxed">
                {t('verificationSent', { email })}<br />
                {t('verificationClickLink')}
              </p>
              <div className="bg-gray-700/50 rounded-xl p-4 text-sm text-gray-300 border border-gray-600/30">
                {t('checkSpam')}
              </div>
              <Link
                href="/login"
                className="inline-block w-full py-3 px-4 text-center border border-transparent rounded-xl shadow-lg text-base font-semibold text-white bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 transition-all duration-200"
              >
                {t('goToLogin')}
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

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
            {t('register')}
          </h2>
          <p className="mt-2 text-sm text-gray-500">
            {t('registerSubtitle')}
          </p>
        </div>

        <form className="mt-8 space-y-6 bg-gray-800/70 backdrop-blur-xl rounded-2xl shadow-2xl border border-gray-700/50 p-8" onSubmit={handleSubmit}>
          <div className="space-y-6">
          {error && (
            <div className="bg-red-900/30 text-red-400 p-4 rounded-xl text-sm border border-red-800/50">
              {error}
            </div>
          )}

          <div className="space-y-5">
            <div>
              <label htmlFor="name" className="block text-sm font-semibold text-gray-300 mb-2">
                {t('nameOptional')}
              </label>
              <input
                id="name"
                name="name"
                type="text"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="block w-full px-4 py-3 border border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-gray-700 text-white placeholder-gray-400 transition-all duration-200"
                placeholder={t('namePlaceholder')}
              />
            </div>

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
                {t('passwordMinLength')}
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="block w-full px-4 py-3 border border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-gray-700 text-white placeholder-gray-400 transition-all duration-200"
                placeholder="••••••••"
              />
            </div>
          </div>

          {/* Terms of Service */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-semibold text-gray-300">
                {t('termsTitle')}
              </label>
              <Link href="/terms" target="_blank" className="flex items-center gap-1 text-xs text-primary-400 hover:text-primary-300 transition-colors">
                {t('termsViewFull')} <ExternalLink className="w-3 h-3" />
              </Link>
            </div>
            <div className="max-h-48 overflow-y-auto bg-gray-900/60 border border-gray-600 rounded-xl p-4 text-xs text-gray-400 leading-relaxed space-y-3 scrollbar-thin">
              {locale === 'ko' ? (
                <>
                  <p className="font-semibold text-gray-300">제1조 (목적)</p>
                  <p>본 약관은 마타니 컴퍼니(이하 &quot;회사&quot;)가 제공하는 클라우드 및 인공지능 관련 제반 서비스(이하 &quot;서비스&quot;)의 이용과 관련하여 회사와 회원의 권리, 의무 및 책임사항을 규정함을 목적으로 합니다.</p>
                  <p className="font-semibold text-gray-300">제2조 (AI 서비스의 특성 및 면책)</p>
                  <p>2.1 결과물의 비보장성: 회사가 제공하는 AI 기능은 확률적 모델에 기반합니다. 회사는 AI가 생성한 결과물(코드, 텍스트, 데이터 등)의 정확성, 완전성, 신뢰성, 최신성을 보증하지 않습니다. AI는 &quot;환각(Hallucination)&quot; 현상을 일으킬 수 있으며, 부정확하거나 편향된 정보를 제공할 수 있습니다.</p>
                  <p>2.2 전문적 조언 대체 불가: AI가 제공하는 정보는 참고용일 뿐이며, 법률, 의료, 금융 등 전문 지식이 필요한 분야의 전문가 조언을 대체할 수 없습니다. 사용자는 AI 결과물을 실무에 적용하기 전 반드시 스스로 검증해야 합니다.</p>
                  <p className="font-semibold text-gray-300">제3조 (사용자 데이터 및 콘텐츠)</p>
                  <p>3.1 데이터의 소유권: 사용자가 서비스에 업로드하거나 생성한 데이터의 소유권은 사용자에게 있습니다. 단, 사용자는 회사에게 서비스 제공, 운영, 및 AI 모델 개선을 위해 해당 데이터를 사용할 수 있는 비독점적 라이선스를 부여합니다.</p>
                  <p>3.2 데이터 보존 및 백업: 회사는 사용자 데이터를 보호하기 위해 노력하나, 천재지변, 기술적 결함, 해킹 등으로 인한 데이터의 유실, 손상, 삭제에 대해 책임을 지지 않습니다. 데이터의 백업 책임은 전적으로 사용자에게 있습니다.</p>
                  <p className="font-semibold text-gray-300">제4조 (책임의 제한)</p>
                  <p>4.1 회사는 법률이 허용하는 최대 범위 내에서, 서비스 이용과 관련하여 발생한 간접 손해, 특별 손해, 결과적 손해(이익 손실, 영업 중단, 데이터 유실 포함)에 대해 책임을 지지 않습니다.</p>
                  <p>4.2 어떠한 경우에도 회사의 총 배상 책임은 사용자가 해당 손해 발생 직전 3개월 동안 회사에 지불한 이용 요금의 총액을 초과하지 않습니다. (무료 사용자의 경우 책임은 0원으로 제한됩니다.)</p>
                  <p className="font-semibold text-gray-300">제5조 (준거법 및 관할)</p>
                  <p>본 약관은 대한민국 법률에 따라 해석되며, 서비스와 관련하여 발생한 분쟁은 서울중앙지방법원을 전속 관할 법원으로 합니다.</p>
                </>
              ) : (
                <>
                  <p className="font-semibold text-gray-300">Article 1 (Purpose)</p>
                  <p>The purpose of these Terms of Service is to define the rights, obligations, and responsibilities of Martani Company (the &quot;Company&quot;) and the user (the &quot;User&quot;) regarding the use of cloud and AI-related services provided by the Company (the &quot;Service&quot;).</p>
                  <p className="font-semibold text-gray-300">Article 2 (Disclaimer for AI Services)</p>
                  <p>2.1 No Warranty for AI Outputs: The AI features provided by the Company are based on probabilistic models. The Company does not warrant the accuracy, completeness, reliability, or timeliness of any output generated by the AI. The AI may produce &quot;hallucinations&quot; or generate inaccurate or biased information.</p>
                  <p>2.2 No Professional Advice: Information provided by the AI is for reference only and does not substitute for professional advice in fields such as law, medicine, or finance. The User must independently verify AI outputs before applying them to real-world scenarios.</p>
                  <p className="font-semibold text-gray-300">Article 3 (User Data and Content)</p>
                  <p>3.1 Ownership: The User retains ownership of any data or content uploaded or generated via the Service. However, the User grants the Company a non-exclusive license to use such data for operating the Service and improving AI models.</p>
                  <p>3.2 Data Retention and Backup: While the Company strives to protect User Data, it shall not be liable for any loss, corruption, or deletion of data caused by force majeure, technical failures, or hacking. The User is solely responsible for backing up their data.</p>
                  <p className="font-semibold text-gray-300">Article 4 (Limitation of Liability)</p>
                  <p>4.1 TO THE MAXIMUM EXTENT PERMITTED BY LAW, THE COMPANY SHALL NOT BE LIABLE FOR ANY INDIRECT, SPECIAL, INCIDENTAL, OR CONSEQUENTIAL DAMAGES ARISING OUT OF THE USE OF THE SERVICE.</p>
                  <p>4.2 THE COMPANY&apos;S TOTAL LIABILITY SHALL NOT EXCEED THE AMOUNT PAID BY THE USER IN THE THREE (3) MONTHS PRECEDING THE EVENT (OR ZERO FOR FREE USERS).</p>
                  <p className="font-semibold text-gray-300">Article 5 (Governing Law and Jurisdiction)</p>
                  <p>These Terms shall be governed by the laws of the Republic of Korea. Any disputes shall be subject to the exclusive jurisdiction of the Seoul Central District Court.</p>
                </>
              )}
            </div>
            <label className="flex items-center gap-2.5 mt-3 cursor-pointer select-none group">
              <input
                type="checkbox"
                checked={agreedToTerms}
                onChange={(e) => setAgreedToTerms(e.target.checked)}
                className="toggle-check"
              />
              <span className="text-sm text-gray-300 group-hover:text-gray-200 transition-colors">
                {t('termsAgree')}
              </span>
            </label>
          </div>

          {/* Turnstile CAPTCHA */}
          {TURNSTILE_SITE_KEY && (
            <>
              <Script
                src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
                onLoad={renderTurnstile}
              />
              <div className="flex justify-center">
                <div ref={turnstileRef} />
              </div>
            </>
          )}

          <button
            type="submit"
            disabled={loading || !agreedToTerms}
            className="w-full flex justify-center py-3.5 px-4 border border-transparent rounded-xl shadow-lg text-base font-semibold text-white bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 focus:ring-offset-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
          >
            {loading ? t('registering') : t('register')}
          </button>

          <p className="text-center text-sm text-gray-400">
            {t('hasAccount')}{' '}
            <Link href="/login" className="font-semibold text-primary-400 hover:text-primary-300 transition-colors">
              {t('login')}
            </Link>
          </p>
          </div>
        </form>
      </div>
    </div>
  );
}
