'use client';

import Link from 'next/link';
import { LandingFooter } from '@/components/landing-footer';
import { useI18nStore } from '@/lib/i18n';

function TermsKo() {
  return (
    <>
      <h1 className="text-3xl font-bold text-gray-50 mb-2">이용약관</h1>
      <p className="text-gray-500 text-sm mb-12">최종 수정일: 2026년 2월 19일</p>

      <div className="prose-policy">
        <section className="mb-10">
          <h2 className="text-lg font-semibold text-gray-200 mb-4">제1조 (목적)</h2>
          <p className="text-gray-400 text-sm leading-relaxed">
            본 약관은 Martani(이하 &quot;서비스&quot;)가 제공하는 클라우드 AI 인프라 서비스의 이용 조건 및 절차, 회사와 이용자 간의 권리·의무·책임 사항 및 기타 필요한 사항을 규정함을 목적으로 합니다.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-semibold text-gray-200 mb-4">제2조 (용어의 정의)</h2>
          <ul className="text-gray-400 text-sm leading-relaxed space-y-2 list-disc list-inside">
            <li>&quot;서비스&quot;란 Martani 플랫폼에서 제공하는 AI 분석, 클라우드 스토리지, AI 비서 등 모든 관련 서비스를 의미합니다.</li>
            <li>&quot;이용자&quot;란 본 약관에 따라 서비스에 가입하여 서비스를 이용하는 자를 의미합니다.</li>
            <li>&quot;계정&quot;이란 이용자가 서비스에 접속하기 위해 등록한 이메일 주소와 비밀번호의 조합을 의미합니다.</li>
            <li>&quot;콘텐츠&quot;란 이용자가 서비스에 업로드하거나 생성한 파일, 문서, 대화 기록 등 모든 데이터를 의미합니다.</li>
          </ul>
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-semibold text-gray-200 mb-4">제3조 (서비스 내용)</h2>
          <p className="text-gray-400 text-sm leading-relaxed mb-3">서비스는 다음의 기능을 제공합니다:</p>
          <ul className="text-gray-400 text-sm leading-relaxed space-y-2 list-disc list-inside">
            <li>AI 기반 문서 분석 및 대화 (RAG, LLM 챗봇)</li>
            <li>클라우드 파일 스토리지 및 관리 (MinIO 기반)</li>
            <li>AI 개인 비서 기능 (메모 관리, 웹 브라우징, 도구 실행)</li>
            <li>파일 공유 및 협업 기능</li>
          </ul>
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-semibold text-gray-200 mb-4">제4조 (계정)</h2>
          <ul className="text-gray-400 text-sm leading-relaxed space-y-2 list-disc list-inside">
            <li>이용자는 정확한 정보를 제공하여 계정을 생성해야 합니다.</li>
            <li>이메일 인증을 완료해야 서비스를 정상적으로 이용할 수 있습니다.</li>
            <li>이용자는 자신의 계정 정보를 안전하게 관리할 책임이 있으며, 제3자에게 계정 접근 권한을 양도할 수 없습니다.</li>
            <li>계정 보안에 문제가 발생한 경우 즉시 서비스 관리자에게 통보해야 합니다.</li>
          </ul>
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-semibold text-gray-200 mb-4">제5조 (요금 및 결제)</h2>
          <ul className="text-gray-400 text-sm leading-relaxed space-y-2 list-disc list-inside">
            <li>서비스는 무료 플랜과 유료 플랜을 제공할 수 있습니다.</li>
            <li>각 플랜의 스토리지 용량, 토큰 사용량 등 세부 사항은 요금제 페이지에서 확인할 수 있습니다.</li>
            <li>유료 서비스의 요금은 사전에 공지되며, 변경 시 30일 전에 통보합니다.</li>
          </ul>
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-semibold text-gray-200 mb-4">제6조 (콘텐츠)</h2>
          <ul className="text-gray-400 text-sm leading-relaxed space-y-2 list-disc list-inside">
            <li>이용자가 업로드한 콘텐츠의 저작권은 이용자에게 있습니다.</li>
            <li>서비스는 이용자의 콘텐츠를 서비스 제공 목적(AI 분석, 인덱싱 등)으로만 사용합니다.</li>
            <li>이용자는 법률에 위반되는 콘텐츠를 업로드해서는 안 됩니다.</li>
            <li>서비스는 위법 콘텐츠가 발견된 경우 사전 통보 없이 삭제할 수 있습니다.</li>
          </ul>
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-semibold text-gray-200 mb-4">제7조 (금지 행위)</h2>
          <p className="text-gray-400 text-sm leading-relaxed mb-3">이용자는 다음 행위를 해서는 안 됩니다:</p>
          <ul className="text-gray-400 text-sm leading-relaxed space-y-2 list-disc list-inside">
            <li>서비스의 정상적인 운영을 방해하는 행위</li>
            <li>다른 이용자의 개인정보를 무단으로 수집하는 행위</li>
            <li>서비스를 이용하여 불법적인 활동을 수행하는 행위</li>
            <li>서비스의 보안 취약점을 악용하거나 시스템에 무단 접근하는 행위</li>
            <li>자동화 도구를 이용한 과도한 API 호출 또는 스크래핑</li>
          </ul>
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-semibold text-gray-200 mb-4">제8조 (책임 제한)</h2>
          <ul className="text-gray-400 text-sm leading-relaxed space-y-2 list-disc list-inside">
            <li>서비스는 천재지변, 시스템 장애 등 불가항력으로 인한 서비스 중단에 대해 책임을 지지 않습니다.</li>
            <li>AI가 생성한 응답의 정확성은 보장되지 않으며, 이용자는 AI 응답을 참고 자료로만 활용해야 합니다.</li>
            <li>이용자의 부주의로 인한 데이터 손실에 대해 서비스는 책임을 지지 않습니다.</li>
          </ul>
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-semibold text-gray-200 mb-4">제9조 (서비스 해지)</h2>
          <ul className="text-gray-400 text-sm leading-relaxed space-y-2 list-disc list-inside">
            <li>이용자는 언제든지 계정 삭제를 요청하여 서비스를 해지할 수 있습니다.</li>
            <li>서비스 해지 시 이용자의 데이터는 30일 이내에 완전히 삭제됩니다.</li>
            <li>서비스는 약관을 위반한 이용자의 계정을 사전 통보 후 정지하거나 삭제할 수 있습니다.</li>
          </ul>
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-semibold text-gray-200 mb-4">제10조 (준거법 및 관할)</h2>
          <p className="text-gray-400 text-sm leading-relaxed">
            본 약관의 해석 및 적용에 관하여는 대한민국법을 준거법으로 합니다. 서비스 이용과 관련하여 발생한 분쟁은 서울중앙지방법원을 제1심 관할 법원으로 합니다.
          </p>
        </section>
      </div>
    </>
  );
}

function TermsEn() {
  return (
    <>
      <h1 className="text-3xl font-bold text-gray-50 mb-2">Terms of Service</h1>
      <p className="text-gray-500 text-sm mb-12">Last updated: February 19, 2026</p>

      <div className="prose-policy">
        <section className="mb-10">
          <h2 className="text-lg font-semibold text-gray-200 mb-4">1. Purpose</h2>
          <p className="text-gray-400 text-sm leading-relaxed">
            These Terms of Service (&quot;Terms&quot;) govern the use of the cloud AI infrastructure services provided by Martani (&quot;Service&quot;), including the conditions, procedures, rights, obligations, and responsibilities between the Service and its users.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-semibold text-gray-200 mb-4">2. Definitions</h2>
          <ul className="text-gray-400 text-sm leading-relaxed space-y-2 list-disc list-inside">
            <li>&quot;Service&quot; refers to all services provided through the Martani platform, including AI analytics, cloud storage, and AI assistant features.</li>
            <li>&quot;User&quot; refers to any person who registers for and uses the Service in accordance with these Terms.</li>
            <li>&quot;Account&quot; refers to the combination of email address and password registered by the User to access the Service.</li>
            <li>&quot;Content&quot; refers to all data uploaded or created by the User on the Service, including files, documents, and chat histories.</li>
          </ul>
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-semibold text-gray-200 mb-4">3. Service Description</h2>
          <p className="text-gray-400 text-sm leading-relaxed mb-3">The Service provides the following features:</p>
          <ul className="text-gray-400 text-sm leading-relaxed space-y-2 list-disc list-inside">
            <li>AI-powered document analysis and chat (RAG, LLM chatbot)</li>
            <li>Cloud file storage and management (MinIO-based)</li>
            <li>AI personal assistant (note management, web browsing, tool execution)</li>
            <li>File sharing and collaboration</li>
          </ul>
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-semibold text-gray-200 mb-4">4. Accounts</h2>
          <ul className="text-gray-400 text-sm leading-relaxed space-y-2 list-disc list-inside">
            <li>Users must provide accurate information when creating an account.</li>
            <li>Email verification must be completed to fully access the Service.</li>
            <li>Users are responsible for maintaining the security of their account credentials and may not transfer account access to third parties.</li>
            <li>Users must immediately notify the Service administrator if any security breach is detected.</li>
          </ul>
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-semibold text-gray-200 mb-4">5. Fees and Payment</h2>
          <ul className="text-gray-400 text-sm leading-relaxed space-y-2 list-disc list-inside">
            <li>The Service may offer free and paid plans.</li>
            <li>Details of each plan, including storage capacity and token usage, can be found on the pricing page.</li>
            <li>Fees for paid services are announced in advance and users will be notified at least 30 days prior to any changes.</li>
          </ul>
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-semibold text-gray-200 mb-4">6. Content</h2>
          <ul className="text-gray-400 text-sm leading-relaxed space-y-2 list-disc list-inside">
            <li>Users retain ownership of all Content they upload.</li>
            <li>The Service uses User Content solely for the purpose of providing the Service (AI analysis, indexing, etc.).</li>
            <li>Users must not upload Content that violates applicable laws.</li>
            <li>The Service may remove illegal Content without prior notice.</li>
          </ul>
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-semibold text-gray-200 mb-4">7. Prohibited Activities</h2>
          <p className="text-gray-400 text-sm leading-relaxed mb-3">Users must not engage in the following:</p>
          <ul className="text-gray-400 text-sm leading-relaxed space-y-2 list-disc list-inside">
            <li>Interfering with the normal operation of the Service</li>
            <li>Unauthorized collection of other users&apos; personal information</li>
            <li>Using the Service for illegal activities</li>
            <li>Exploiting security vulnerabilities or gaining unauthorized access to systems</li>
            <li>Excessive API calls or scraping through automated tools</li>
          </ul>
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-semibold text-gray-200 mb-4">8. Limitation of Liability</h2>
          <ul className="text-gray-400 text-sm leading-relaxed space-y-2 list-disc list-inside">
            <li>The Service is not liable for service interruptions caused by force majeure, including natural disasters and system failures.</li>
            <li>The accuracy of AI-generated responses is not guaranteed. Users should treat AI responses as reference material only.</li>
            <li>The Service is not liable for data loss caused by User negligence.</li>
          </ul>
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-semibold text-gray-200 mb-4">9. Termination</h2>
          <ul className="text-gray-400 text-sm leading-relaxed space-y-2 list-disc list-inside">
            <li>Users may terminate the Service at any time by requesting account deletion.</li>
            <li>Upon termination, User data will be permanently deleted within 30 days.</li>
            <li>The Service may suspend or delete accounts of Users who violate these Terms after prior notice.</li>
          </ul>
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-semibold text-gray-200 mb-4">10. Governing Law and Jurisdiction</h2>
          <p className="text-gray-400 text-sm leading-relaxed">
            These Terms shall be governed by and construed in accordance with the laws of the Republic of Korea. Any disputes arising from the use of the Service shall be subject to the exclusive jurisdiction of the Seoul Central District Court.
          </p>
        </section>
      </div>
    </>
  );
}

export default function TermsPage() {
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
        {locale === 'ko' ? <TermsKo /> : <TermsEn />}
      </article>

      <LandingFooter />
    </div>
  );
}
