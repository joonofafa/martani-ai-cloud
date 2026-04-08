'use client';

import Link from 'next/link';
import { LandingFooter } from '@/components/landing-footer';
import { useI18nStore } from '@/lib/i18n';

function PrivacyKo() {
  return (
    <>
      <h1 className="text-3xl font-bold text-gray-50 mb-2">개인정보처리방침</h1>
      <p className="text-gray-500 text-sm mb-12">최종 수정일: 2026년 2월 19일</p>

      <div className="prose-policy">
        <p className="text-gray-400 text-sm leading-relaxed mb-10">
          Martani(이하 &quot;서비스&quot;)는 이용자의 개인정보를 중요시하며, 「개인정보 보호법」을 준수합니다. 본 방침을 통해 이용자의 개인정보가 어떻게 수집·이용·보호되는지 안내합니다.
        </p>

        <section className="mb-10">
          <h2 className="text-lg font-semibold text-gray-200 mb-4">1. 수집하는 개인정보 항목</h2>
          <div className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-5 mb-3">
            <h3 className="text-sm font-semibold text-gray-300 mb-2">필수 항목</h3>
            <p className="text-gray-400 text-sm leading-relaxed">이메일 주소, 비밀번호(암호화 저장), 이름</p>
          </div>
          <div className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-5">
            <h3 className="text-sm font-semibold text-gray-300 mb-2">자동 수집 항목</h3>
            <p className="text-gray-400 text-sm leading-relaxed">접속 IP 주소, 접속 시간, 브라우저 유형, 서비스 이용 기록, 토큰 사용량</p>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-semibold text-gray-200 mb-4">2. 개인정보의 이용 목적</h2>
          <ul className="text-gray-400 text-sm leading-relaxed space-y-2 list-disc list-inside">
            <li>회원 가입 및 본인 확인, 이메일 인증</li>
            <li>서비스 제공 및 운영 (AI 분석, 클라우드 스토리지, AI 비서)</li>
            <li>사용량 추적 및 요금 정산 (토큰 사용량, 스토리지 용량)</li>
            <li>서비스 개선 및 신규 기능 개발을 위한 통계 분석</li>
            <li>보안 위협 탐지 및 부정 이용 방지</li>
          </ul>
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-semibold text-gray-200 mb-4">3. 개인정보의 보유 및 이용 기간</h2>
          <ul className="text-gray-400 text-sm leading-relaxed space-y-2 list-disc list-inside">
            <li>회원 탈퇴 시까지 보유하며, 탈퇴 후 30일 이내에 파기합니다.</li>
            <li>관계 법령에 의해 보존이 필요한 경우 해당 법률에서 정한 기간 동안 보유합니다.
              <ul className="mt-1 ml-4 space-y-1 list-disc list-inside">
                <li>계약 또는 청약철회 기록: 5년 (전자상거래법)</li>
                <li>로그인 기록: 3개월 (통신비밀보호법)</li>
              </ul>
            </li>
          </ul>
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-semibold text-gray-200 mb-4">4. 개인정보의 제3자 제공</h2>
          <p className="text-gray-400 text-sm leading-relaxed">
            서비스는 원칙적으로 이용자의 개인정보를 제3자에게 제공하지 않습니다. 다만, 다음의 경우에는 예외로 합니다:
          </p>
          <ul className="text-gray-400 text-sm leading-relaxed space-y-2 list-disc list-inside mt-3">
            <li>이용자가 사전에 동의한 경우</li>
            <li>법령에 의한 요청이 있는 경우</li>
          </ul>
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-semibold text-gray-200 mb-4">5. 개인정보의 파기</h2>
          <ul className="text-gray-400 text-sm leading-relaxed space-y-2 list-disc list-inside">
            <li>보유 기간이 경과하거나 처리 목적이 달성된 개인정보는 지체 없이 파기합니다.</li>
            <li>전자적 파일 형태: 기술적 방법을 사용하여 복원할 수 없도록 삭제합니다.</li>
            <li>업로드된 파일: MinIO 스토리지에서 완전히 삭제합니다.</li>
            <li>벡터 임베딩 데이터: PostgreSQL(pgvector)에서 삭제합니다.</li>
          </ul>
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-semibold text-gray-200 mb-4">6. 이용자의 권리</h2>
          <p className="text-gray-400 text-sm leading-relaxed mb-3">이용자는 언제든지 다음의 권리를 행사할 수 있습니다:</p>
          <ul className="text-gray-400 text-sm leading-relaxed space-y-2 list-disc list-inside">
            <li>개인정보 열람, 정정, 삭제 요청</li>
            <li>개인정보 처리 정지 요청</li>
            <li>회원 탈퇴 및 데이터 삭제 요청</li>
          </ul>
          <p className="text-gray-400 text-sm leading-relaxed mt-3">
            위 권리 행사는 서비스 관리자 이메일(support@martani.cloud)을 통해 요청할 수 있으며, 지체 없이 조치하겠습니다.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-semibold text-gray-200 mb-4">7. 쿠키의 사용</h2>
          <p className="text-gray-400 text-sm leading-relaxed">
            서비스는 로그인 인증 및 사용자 설정 유지를 위해 쿠키를 사용합니다. 자세한 사항은{' '}
            <Link href="/cookies" className="text-primary-400 hover:text-primary-300 underline">쿠키 정책</Link>을 참고하시기 바랍니다.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-semibold text-gray-200 mb-4">8. 개인정보 보호 조치</h2>
          <ul className="text-gray-400 text-sm leading-relaxed space-y-2 list-disc list-inside">
            <li>비밀번호 bcrypt 솔트 해싱</li>
            <li>JWT 토큰 기반 인증 (Access Token + Refresh Token)</li>
            <li>HTTPS 전송 구간 암호화</li>
            <li>사용자별 데이터 격리 (User-scoped queries)</li>
            <li>API 키 등 민감 정보 마스킹 처리</li>
          </ul>
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-semibold text-gray-200 mb-4">9. 개인정보 보호 책임자</h2>
          <div className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-5">
            <ul className="text-gray-400 text-sm leading-relaxed space-y-1">
              <li>담당: Martani 개인정보 보호 담당</li>
              <li>이메일: support@martani.cloud</li>
            </ul>
          </div>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-200 mb-4">10. 방침 변경</h2>
          <p className="text-gray-400 text-sm leading-relaxed">
            본 개인정보처리방침이 변경되는 경우 서비스 내 공지를 통해 변경 사항을 안내하며, 변경된 방침은 공지일로부터 7일 후에 효력이 발생합니다.
          </p>
        </section>
      </div>
    </>
  );
}

function PrivacyEn() {
  return (
    <>
      <h1 className="text-3xl font-bold text-gray-50 mb-2">Privacy Policy</h1>
      <p className="text-gray-500 text-sm mb-12">Last updated: February 19, 2026</p>

      <div className="prose-policy">
        <p className="text-gray-400 text-sm leading-relaxed mb-10">
          Martani (&quot;Service&quot;) values the privacy of its users and complies with applicable data protection laws. This policy explains how personal information is collected, used, and protected.
        </p>

        <section className="mb-10">
          <h2 className="text-lg font-semibold text-gray-200 mb-4">1. Personal Information Collected</h2>
          <div className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-5 mb-3">
            <h3 className="text-sm font-semibold text-gray-300 mb-2">Required</h3>
            <p className="text-gray-400 text-sm leading-relaxed">Email address, password (stored encrypted), name</p>
          </div>
          <div className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-5">
            <h3 className="text-sm font-semibold text-gray-300 mb-2">Automatically Collected</h3>
            <p className="text-gray-400 text-sm leading-relaxed">IP address, access time, browser type, service usage records, token usage</p>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-semibold text-gray-200 mb-4">2. Purpose of Use</h2>
          <ul className="text-gray-400 text-sm leading-relaxed space-y-2 list-disc list-inside">
            <li>User registration, identity verification, and email authentication</li>
            <li>Service provision and operation (AI analytics, cloud storage, AI assistant)</li>
            <li>Usage tracking and billing (token usage, storage capacity)</li>
            <li>Statistical analysis for service improvement and new feature development</li>
            <li>Security threat detection and fraud prevention</li>
          </ul>
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-semibold text-gray-200 mb-4">3. Retention Period</h2>
          <ul className="text-gray-400 text-sm leading-relaxed space-y-2 list-disc list-inside">
            <li>Personal information is retained until account deletion and destroyed within 30 days of termination.</li>
            <li>Where required by law, information may be retained for the legally mandated period:
              <ul className="mt-1 ml-4 space-y-1 list-disc list-inside">
                <li>Contract or subscription records: 5 years (E-Commerce Act)</li>
                <li>Login records: 3 months (Telecommunications Privacy Act)</li>
              </ul>
            </li>
          </ul>
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-semibold text-gray-200 mb-4">4. Third-Party Disclosure</h2>
          <p className="text-gray-400 text-sm leading-relaxed">
            The Service does not share personal information with third parties as a general rule. Exceptions include:
          </p>
          <ul className="text-gray-400 text-sm leading-relaxed space-y-2 list-disc list-inside mt-3">
            <li>When the User has given prior consent</li>
            <li>When required by law or legal process</li>
          </ul>
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-semibold text-gray-200 mb-4">5. Data Destruction</h2>
          <ul className="text-gray-400 text-sm leading-relaxed space-y-2 list-disc list-inside">
            <li>Personal information is destroyed without delay when the retention period expires or the purpose of processing is achieved.</li>
            <li>Electronic files: deleted using technical methods that prevent recovery.</li>
            <li>Uploaded files: permanently deleted from MinIO storage.</li>
            <li>Vector embedding data: deleted from PostgreSQL (pgvector).</li>
          </ul>
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-semibold text-gray-200 mb-4">6. User Rights</h2>
          <p className="text-gray-400 text-sm leading-relaxed mb-3">Users may exercise the following rights at any time:</p>
          <ul className="text-gray-400 text-sm leading-relaxed space-y-2 list-disc list-inside">
            <li>Request to view, correct, or delete personal information</li>
            <li>Request to suspend processing of personal information</li>
            <li>Request account deletion and data removal</li>
          </ul>
          <p className="text-gray-400 text-sm leading-relaxed mt-3">
            These rights can be exercised by contacting support@martani.cloud. We will take action without delay.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-semibold text-gray-200 mb-4">7. Use of Cookies</h2>
          <p className="text-gray-400 text-sm leading-relaxed">
            The Service uses cookies for login authentication and maintaining user preferences. For details, please refer to our{' '}
            <Link href="/cookies" className="text-primary-400 hover:text-primary-300 underline">Cookie Policy</Link>.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-semibold text-gray-200 mb-4">8. Security Measures</h2>
          <ul className="text-gray-400 text-sm leading-relaxed space-y-2 list-disc list-inside">
            <li>Password hashing with bcrypt salt</li>
            <li>JWT token-based authentication (Access Token + Refresh Token)</li>
            <li>HTTPS encryption for data in transit</li>
            <li>User-scoped data isolation</li>
            <li>Masking of sensitive information such as API keys</li>
          </ul>
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-semibold text-gray-200 mb-4">9. Data Protection Officer</h2>
          <div className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-5">
            <ul className="text-gray-400 text-sm leading-relaxed space-y-1">
              <li>Contact: Martani Privacy Team</li>
              <li>Email: support@martani.cloud</li>
            </ul>
          </div>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-200 mb-4">10. Policy Changes</h2>
          <p className="text-gray-400 text-sm leading-relaxed">
            Any changes to this Privacy Policy will be announced through the Service, and the updated policy will take effect 7 days after the announcement.
          </p>
        </section>
      </div>
    </>
  );
}

export default function PrivacyPage() {
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
        {locale === 'ko' ? <PrivacyKo /> : <PrivacyEn />}
      </article>

      <LandingFooter />
    </div>
  );
}
