'use client';

import Link from 'next/link';
import { LandingFooter } from '@/components/landing-footer';
import { useI18nStore } from '@/lib/i18n';

function CookiesKo() {
  return (
    <>
      <h1 className="text-3xl font-bold text-gray-50 mb-2">쿠키 정책</h1>
      <p className="text-gray-500 text-sm mb-12">최종 수정일: 2026년 2월 19일</p>

      <div className="prose-policy">
        <p className="text-gray-400 text-sm leading-relaxed mb-10">
          Martani(이하 &quot;서비스&quot;)는 서비스 운영 및 이용자 경험 향상을 위해 쿠키를 사용합니다. 본 쿠키 정책은 쿠키의 유형, 사용 목적, 관리 방법을 안내합니다.
        </p>

        <section className="mb-10">
          <h2 className="text-lg font-semibold text-gray-200 mb-4">1. 쿠키란?</h2>
          <p className="text-gray-400 text-sm leading-relaxed">
            쿠키는 웹사이트가 이용자의 브라우저에 저장하는 작은 텍스트 파일입니다. 쿠키를 통해 서비스는 이용자를 식별하고, 로그인 상태를 유지하며, 사용자 설정을 기억할 수 있습니다.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-semibold text-gray-200 mb-4">2. 쿠키 유형</h2>
          <div className="space-y-4">
            <div className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-5">
              <h3 className="text-sm font-semibold text-gray-300 mb-2">필수 쿠키</h3>
              <p className="text-gray-400 text-sm leading-relaxed mb-2">서비스의 기본 기능에 필수적인 쿠키입니다. 비활성화할 수 없습니다.</p>
              <ul className="text-gray-500 text-xs space-y-1 list-disc list-inside">
                <li>인증 토큰 (Access Token, Refresh Token) — 로그인 상태 유지</li>
                <li>세션 식별자 — 사용자 세션 관리</li>
              </ul>
            </div>
            <div className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-5">
              <h3 className="text-sm font-semibold text-gray-300 mb-2">기능 쿠키</h3>
              <p className="text-gray-400 text-sm leading-relaxed mb-2">이용자의 설정 및 선호를 기억하기 위한 쿠키입니다.</p>
              <ul className="text-gray-500 text-xs space-y-1 list-disc list-inside">
                <li>언어 설정 (ko/en) — UI 언어 유지</li>
                <li>테마 설정 — 사용자 인터페이스 환경 설정</li>
                <li>사이드바 상태 — 사이드바 열림/닫힘 상태 기억</li>
              </ul>
            </div>
            <div className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-5">
              <h3 className="text-sm font-semibold text-gray-300 mb-2">분석 쿠키</h3>
              <p className="text-gray-400 text-sm leading-relaxed">
                서비스 이용 현황을 분석하기 위한 쿠키입니다. 현재 서비스는 외부 분석 도구를 사용하지 않으며, 향후 도입 시 본 정책을 업데이트합니다.
              </p>
            </div>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-semibold text-gray-200 mb-4">3. 쿠키 사용 목적</h2>
          <ul className="text-gray-400 text-sm leading-relaxed space-y-2 list-disc list-inside">
            <li>로그인 인증 및 보안 유지</li>
            <li>이용자의 언어 및 인터페이스 설정 유지</li>
            <li>서비스 이용 편의성 향상</li>
          </ul>
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-semibold text-gray-200 mb-4">4. 쿠키 관리 방법</h2>
          <p className="text-gray-400 text-sm leading-relaxed mb-3">
            이용자는 브라우저 설정을 통해 쿠키를 관리할 수 있습니다. 다만, 필수 쿠키를 비활성화하면 서비스 이용이 제한될 수 있습니다.
          </p>
          <ul className="text-gray-400 text-sm leading-relaxed space-y-2 list-disc list-inside">
            <li><strong className="text-gray-300">Chrome:</strong> 설정 → 개인정보 및 보안 → 쿠키 및 기타 사이트 데이터</li>
            <li><strong className="text-gray-300">Firefox:</strong> 설정 → 개인 정보 및 보안 → 쿠키 및 사이트 데이터</li>
            <li><strong className="text-gray-300">Safari:</strong> 환경설정 → 개인 정보 보호 → 쿠키 및 웹사이트 데이터</li>
            <li><strong className="text-gray-300">Edge:</strong> 설정 → 쿠키 및 사이트 권한 → 쿠키 및 사이트 데이터</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-200 mb-4">5. 정책 변경</h2>
          <p className="text-gray-400 text-sm leading-relaxed">
            본 쿠키 정책이 변경되는 경우 서비스 내 공지를 통해 안내하며, 변경된 정책은 공지일로부터 7일 후에 효력이 발생합니다. 쿠키 관련 문의는 support@martani.cloud로 연락해 주시기 바랍니다.
          </p>
        </section>
      </div>
    </>
  );
}

function CookiesEn() {
  return (
    <>
      <h1 className="text-3xl font-bold text-gray-50 mb-2">Cookie Policy</h1>
      <p className="text-gray-500 text-sm mb-12">Last updated: February 19, 2026</p>

      <div className="prose-policy">
        <p className="text-gray-400 text-sm leading-relaxed mb-10">
          Martani (&quot;Service&quot;) uses cookies to operate the Service and enhance user experience. This Cookie Policy explains the types of cookies used, their purposes, and how to manage them.
        </p>

        <section className="mb-10">
          <h2 className="text-lg font-semibold text-gray-200 mb-4">1. What Are Cookies?</h2>
          <p className="text-gray-400 text-sm leading-relaxed">
            Cookies are small text files stored in your browser by websites. Through cookies, the Service can identify users, maintain login status, and remember user preferences.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-semibold text-gray-200 mb-4">2. Types of Cookies</h2>
          <div className="space-y-4">
            <div className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-5">
              <h3 className="text-sm font-semibold text-gray-300 mb-2">Essential Cookies</h3>
              <p className="text-gray-400 text-sm leading-relaxed mb-2">Required for core Service functionality. These cannot be disabled.</p>
              <ul className="text-gray-500 text-xs space-y-1 list-disc list-inside">
                <li>Authentication tokens (Access Token, Refresh Token) — maintaining login state</li>
                <li>Session identifiers — user session management</li>
              </ul>
            </div>
            <div className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-5">
              <h3 className="text-sm font-semibold text-gray-300 mb-2">Functional Cookies</h3>
              <p className="text-gray-400 text-sm leading-relaxed mb-2">Used to remember your settings and preferences.</p>
              <ul className="text-gray-500 text-xs space-y-1 list-disc list-inside">
                <li>Language setting (ko/en) — maintaining UI language</li>
                <li>Theme setting — user interface preferences</li>
                <li>Sidebar state — remembering sidebar open/closed state</li>
              </ul>
            </div>
            <div className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-5">
              <h3 className="text-sm font-semibold text-gray-300 mb-2">Analytics Cookies</h3>
              <p className="text-gray-400 text-sm leading-relaxed">
                Used to analyze Service usage patterns. The Service does not currently use external analytics tools. This policy will be updated if such tools are introduced in the future.
              </p>
            </div>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-semibold text-gray-200 mb-4">3. Purpose of Cookies</h2>
          <ul className="text-gray-400 text-sm leading-relaxed space-y-2 list-disc list-inside">
            <li>Login authentication and security</li>
            <li>Maintaining user language and interface preferences</li>
            <li>Improving service usability</li>
          </ul>
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-semibold text-gray-200 mb-4">4. Managing Cookies</h2>
          <p className="text-gray-400 text-sm leading-relaxed mb-3">
            You can manage cookies through your browser settings. However, disabling essential cookies may limit your ability to use the Service.
          </p>
          <ul className="text-gray-400 text-sm leading-relaxed space-y-2 list-disc list-inside">
            <li><strong className="text-gray-300">Chrome:</strong> Settings → Privacy and Security → Cookies and other site data</li>
            <li><strong className="text-gray-300">Firefox:</strong> Settings → Privacy & Security → Cookies and Site Data</li>
            <li><strong className="text-gray-300">Safari:</strong> Preferences → Privacy → Cookies and website data</li>
            <li><strong className="text-gray-300">Edge:</strong> Settings → Cookies and site permissions → Cookies and site data</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-200 mb-4">5. Policy Changes</h2>
          <p className="text-gray-400 text-sm leading-relaxed">
            Any changes to this Cookie Policy will be announced through the Service, and the updated policy will take effect 7 days after the announcement. For cookie-related inquiries, please contact support@martani.cloud.
          </p>
        </section>
      </div>
    </>
  );
}

export default function CookiesPage() {
  const locale = useI18nStore((s) => s.locale);

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Navbar */}
      <nav className="relative z-10 border-b border-gray-800">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-gray-50 hover:text-primary-400 transition-colors">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            <span className="text-sm font-medium">Martani</span>
          </Link>
          <Link href="/register"
            className="text-sm px-5 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg font-medium transition-all">
            Get Started
          </Link>
        </div>
      </nav>

      <article className="max-w-3xl mx-auto px-6 py-16">
        {locale === 'ko' ? <CookiesKo /> : <CookiesEn />}
      </article>

      <LandingFooter />
    </div>
  );
}
