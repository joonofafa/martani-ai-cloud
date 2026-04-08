'use client';

import Link from 'next/link';
import { MartaniLogo } from '@/components/martani-logo';
import { LandingFooter } from '@/components/landing-footer';
import { useI18nStore } from '@/lib/i18n';

function AboutKo() {
  return (
    <div className="prose-policy">
      <section className="mb-12">
        <h2 className="text-xl font-semibold text-gray-200 mb-4">서비스 소개</h2>
        <p className="text-gray-400 text-sm leading-relaxed mb-4">
          Martani는 AI 대화, 클라우드 스토리지, 문서 분석을 하나의 플랫폼으로 통합한 클라우드 AI 인프라 서비스입니다.
        </p>
        <p className="text-gray-400 text-sm leading-relaxed">
          다양한 LLM 모델(DeepSeek, Llama, Qwen 등)과 대화하고, RAG 기반 문서 분석으로 업로드한 파일의 맥락을 이해합니다. S3 호환 MinIO 오브젝트 스토리지로 파일을 안전하게 관리하며, AI 비서가 메모 관리, 웹 브라우징, 파일 처리 등 복잡한 업무를 자율적으로 수행합니다.
        </p>
      </section>

      <section className="mb-12">
        <h2 className="text-xl font-semibold text-gray-200 mb-4">비전</h2>
        <p className="text-gray-400 text-sm leading-relaxed">
          &quot;The Terraforming&quot; — 황무지를 생명이 살 수 있는 땅으로 바꾸는 테라포밍처럼, 데이터의 가치를 극대화하는 지능형 인프라를 누구나 쉽게 구축할 수 있도록 하는 것이 Martani의 비전입니다. 오픈소스 기술 위에 구축된 투명하고 확장 가능한 플랫폼으로, 개인과 팀이 AI의 힘을 일상 업무에 자연스럽게 통합할 수 있는 환경을 만들어 갑니다.
        </p>
      </section>

      <section className="mb-12">
        <h2 className="text-xl font-semibold text-gray-200 mb-6">핵심 기능</h2>
        <div className="grid md:grid-cols-2 gap-4">
          {[
            { title: 'AI 분석', desc: '다양한 LLM 모델로 대화하고, RAG 기반 문서 분석으로 데이터의 숨겨진 연결을 발견합니다.' },
            { title: '클라우드 스토리지', desc: 'S3 호환 스토리지로 파일을 안전하게 관리하고, 폴더 구조와 공유 기능을 제공합니다.' },
            { title: 'AI 비서', desc: '메모 관리, 웹 브라우징, 파일 처리 등 복잡한 업무를 자율적으로 수행하는 AI 비서입니다.' },
            { title: '데이터 보안', desc: 'JWT 인증, bcrypt 해싱, 사용자별 데이터 격리로 엔터프라이즈급 보안을 제공합니다.' },
          ].map((item, i) => (
            <div key={i} className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-5">
              <h3 className="text-gray-50 text-sm font-semibold mb-2">{item.title}</h3>
              <p className="text-gray-400 text-xs leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-gray-200 mb-4">연락처</h2>
        <div className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-5">
          <ul className="text-gray-400 text-sm leading-relaxed space-y-1">
            <li>서비스: Martani — Cloud + AI Infrastructure</li>
            <li>이메일: <a href="mailto:support@martani.cloud" className="text-primary-400 hover:text-primary-300">support@martani.cloud</a></li>
          </ul>
        </div>
      </section>
    </div>
  );
}

function AboutEn() {
  return (
    <div className="prose-policy">
      <section className="mb-12">
        <h2 className="text-xl font-semibold text-gray-200 mb-4">About the Service</h2>
        <p className="text-gray-400 text-sm leading-relaxed mb-4">
          Martani is a cloud AI infrastructure service that integrates AI conversations, cloud storage, and document analysis into a single platform.
        </p>
        <p className="text-gray-400 text-sm leading-relaxed">
          Chat with various LLM models (DeepSeek, Llama, Qwen, and more), understand uploaded file context through RAG-based document analysis, securely manage files with S3-compatible MinIO object storage, and let the AI assistant autonomously handle complex tasks like note management, web browsing, and file processing.
        </p>
      </section>

      <section className="mb-12">
        <h2 className="text-xl font-semibold text-gray-200 mb-4">Vision</h2>
        <p className="text-gray-400 text-sm leading-relaxed">
          &quot;The Terraforming&quot; — Just as terraforming transforms barren land into a habitable world, Martani&apos;s vision is to make it easy for anyone to build intelligent infrastructure that maximizes the value of their data. Built on open-source technologies, our transparent and scalable platform creates an environment where individuals and teams can naturally integrate the power of AI into their everyday workflows.
        </p>
      </section>

      <section className="mb-12">
        <h2 className="text-xl font-semibold text-gray-200 mb-6">Core Features</h2>
        <div className="grid md:grid-cols-2 gap-4">
          {[
            { title: 'AI Analytics', desc: 'Chat with various LLM models and discover hidden connections in your data through RAG-based document analysis.' },
            { title: 'Cloud Storage', desc: 'Securely manage files with S3-compatible storage, complete with folder structures and sharing capabilities.' },
            { title: 'AI Assistant', desc: 'An AI assistant that autonomously handles complex tasks including note management, web browsing, and file processing.' },
            { title: 'Data Security', desc: 'Enterprise-grade security with JWT authentication, bcrypt hashing, and per-user data isolation.' },
          ].map((item, i) => (
            <div key={i} className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-5">
              <h3 className="text-gray-50 text-sm font-semibold mb-2">{item.title}</h3>
              <p className="text-gray-400 text-xs leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-gray-200 mb-4">Contact</h2>
        <div className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-5">
          <ul className="text-gray-400 text-sm leading-relaxed space-y-1">
            <li>Service: Martani — Cloud + AI Infrastructure</li>
            <li>Email: <a href="mailto:support@martani.cloud" className="text-primary-400 hover:text-primary-300">support@martani.cloud</a></li>
          </ul>
        </div>
      </section>
    </div>
  );
}

export default function AboutPage() {
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

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute top-20 left-1/3 w-96 h-96 bg-primary-500/[0.07] rounded-full blur-[120px] pointer-events-none"></div>
        <div className="absolute bottom-0 right-1/4 w-72 h-72 bg-accent-500/[0.05] rounded-full blur-[100px] pointer-events-none"></div>

        <div className="max-w-3xl mx-auto px-6 py-20 lg:py-28 text-center">
          <div className="flex justify-center mb-8">
            <MartaniLogo size={72} />
          </div>
          <h1 className="text-4xl lg:text-5xl font-bold text-gray-50 leading-tight mb-6">
            Martani
          </h1>
          <p className="text-lg text-gray-400 leading-relaxed max-w-xl mx-auto">
            {locale === 'ko'
              ? '황무지 위에 문명을 세우듯 — 당신의 데이터 위에 지능형 인프라를 구축합니다.'
              : 'Like building civilization on barren land — build intelligent infrastructure on your data.'}
          </p>
        </div>
      </section>

      <article className="max-w-3xl mx-auto px-6 py-16">
        {locale === 'ko' ? <AboutKo /> : <AboutEn />}
      </article>

      <LandingFooter />
    </div>
  );
}
