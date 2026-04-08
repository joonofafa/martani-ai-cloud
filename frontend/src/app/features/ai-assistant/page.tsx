'use client';

import Link from 'next/link';
import { LandingFooter } from '@/components/landing-footer';
import { useI18nStore } from '@/lib/i18n';

/* ─── Animated Icons ─── */
function BrainIcon() {
  const nodes = [
    { cx: 24, cy: 14, r: 4 },
    { cx: 12, cy: 10, r: 2 }, { cx: 36, cy: 10, r: 2 },
    { cx: 8, cy: 24, r: 2 }, { cx: 40, cy: 24, r: 2 },
    { cx: 14, cy: 36, r: 2 }, { cx: 34, cy: 36, r: 2 },
  ];
  const edges: [number, number][] = [[0,1],[0,2],[0,3],[0,4],[0,5],[0,6],[1,3],[2,4],[3,5],[4,6]];
  return (
    <svg width="56" height="56" viewBox="0 0 48 48" fill="none">
      {edges.map(([a, b], i) => (
        <line key={i} x1={nodes[a].cx} y1={nodes[a].cy} x2={nodes[b].cx} y2={nodes[b].cy}
          stroke={i % 2 === 0 ? '#F97316' : '#14B8A6'} strokeWidth="0.8" strokeDasharray="4 6" opacity="0.4">
          <animate attributeName="stroke-dashoffset" values="0;-20" dur="2s" repeatCount="indefinite" />
        </line>
      ))}
      {nodes.map((n, i) => (
        <circle key={i} cx={n.cx} cy={n.cy} r={n.r}
          fill={i === 0 ? '#F97316' : i % 2 === 0 ? '#14B8A6' : '#FB923C'} opacity="0.7">
          <animate attributeName="opacity" values="0.4;0.9;0.4" dur="3s" repeatCount="indefinite" begin={`${i * 0.3}s`} />
        </circle>
      ))}
    </svg>
  );
}

function BrowserIcon() {
  return (
    <svg width="56" height="56" viewBox="0 0 48 48" fill="none">
      <rect x="6" y="8" width="36" height="28" rx="3" stroke="#14B8A6" strokeWidth="1.5" fill="none" opacity="0.5" />
      <line x1="6" y1="16" x2="42" y2="16" stroke="#14B8A6" strokeWidth="1" opacity="0.3" />
      <circle cx="12" cy="12" r="1.5" fill="#F97316" opacity="0.5" />
      <circle cx="17" cy="12" r="1.5" fill="#FB923C" opacity="0.4" />
      <circle cx="22" cy="12" r="1.5" fill="#14B8A6" opacity="0.4" />
      <rect x="12" y="22" width="24" height="3" rx="1" fill="#FB923C" opacity="0.15">
        <animate attributeName="width" values="8;24;8" dur="2s" repeatCount="indefinite" />
      </rect>
      <rect x="12" y="28" width="16" height="3" rx="1" fill="#14B8A6" opacity="0.1" />
    </svg>
  );
}

function MemoryIcon() {
  return (
    <svg width="56" height="56" viewBox="0 0 48 48" fill="none">
      <circle cx="24" cy="24" r="14" stroke="#F97316" strokeWidth="1.5" fill="none" opacity="0.4" />
      <circle cx="24" cy="24" r="8" stroke="#14B8A6" strokeWidth="1" fill="none" opacity="0.3" />
      <circle cx="24" cy="24" r="3" fill="#F97316" opacity="0.6">
        <animate attributeName="r" values="2;4;2" dur="3s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.3;0.7;0.3" dur="3s" repeatCount="indefinite" />
      </circle>
      <line x1="24" y1="10" x2="24" y2="16" stroke="#14B8A6" strokeWidth="0.8" opacity="0.4" />
      <line x1="24" y1="32" x2="24" y2="38" stroke="#14B8A6" strokeWidth="0.8" opacity="0.4" />
      <line x1="10" y1="24" x2="16" y2="24" stroke="#14B8A6" strokeWidth="0.8" opacity="0.4" />
      <line x1="32" y1="24" x2="38" y2="24" stroke="#14B8A6" strokeWidth="0.8" opacity="0.4" />
    </svg>
  );
}

function ScheduleIcon() {
  return (
    <svg width="56" height="56" viewBox="0 0 48 48" fill="none">
      <rect x="8" y="10" width="32" height="28" rx="3" stroke="#14B8A6" strokeWidth="1.5" fill="none" opacity="0.5" />
      <line x1="8" y1="18" x2="40" y2="18" stroke="#14B8A6" strokeWidth="1" opacity="0.3" />
      <line x1="16" y1="10" x2="16" y2="14" stroke="#F97316" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
      <line x1="32" y1="10" x2="32" y2="14" stroke="#F97316" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
      <circle cx="20" cy="26" r="2" fill="#F97316" opacity="0.5">
        <animate attributeName="opacity" values="0.3;0.7;0.3" dur="2s" repeatCount="indefinite" />
      </circle>
      <circle cx="28" cy="26" r="2" fill="#14B8A6" opacity="0.5">
        <animate attributeName="opacity" values="0.3;0.7;0.3" dur="2s" repeatCount="indefinite" begin="0.5s" />
      </circle>
      <circle cx="20" cy="32" r="2" fill="#14B8A6" opacity="0.4" />
      <circle cx="28" cy="32" r="2" fill="#FB923C" opacity="0.4" />
    </svg>
  );
}

/* ─── Feature Detail Item ─── */
function FeatureItem({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="flex gap-5">
      <div className="flex-shrink-0 w-14 h-14 rounded-xl bg-gray-800 border border-gray-700 flex items-center justify-center">
        {icon}
      </div>
      <div>
        <h3 className="text-gray-50 font-semibold mb-1">{title}</h3>
        <p className="text-gray-400 text-sm leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}

const content = {
  ko: {
    heroTitle: ['스마트한 개인 ', 'AI 비서'],
    heroDesc: '파일 관리, 캘린더, 이메일, 메모, 웹 검색, 브라우저 자동화까지 — AI 비서가 당신의 업무를 도와드립니다. 대화 맥락을 기억하는 메모리 기능과 신뢰할 수 있는 결과를 제공합니다.',
    features: [
      { title: '다양한 작업 도구', desc: '파일 읽기/생성/관리, 메모 작성, 캘린더 일정 관리, 이메일 작성, 웹 검색 등 다양한 작업을 AI가 도와드립니다. 필요한 작업을 말씀만 하면 AI가 자율적으로 처리합니다.' },
      { title: '스텔스 브라우저 자동화', desc: '안티봇 탐지를 우회하는 Patchright 기반 스텔스 브라우저로 웹을 자동화합니다. 페이지 탐색, 클릭, 폼 입력(사람처럼 80~100ms 딜레이), 스크롤, JavaScript 실행, AI 비전 스크린샷 분석까지 — 보안관의 자격증명으로 자동 로그인하고 MFA까지 처리합니다.' },
      { title: '영구 메모리', desc: '사용자의 선호, 습관, 연락처, 지시사항을 장기 메모리에 저장합니다. 대화 중 언급된 개인 정보를 자동 기억하고, 최대 50개 메모리를 시스템 프롬프트에 주입하여 맥락 있는 대화를 이어갑니다. 카테고리별 관리와 키워드 검색을 지원합니다.' },
      { title: '자동화 스케줄링', desc: 'Cron 기반으로 반복 작업을 예약합니다. "매일 오전 9시 캘린더 요약", "평일 오전 8시 뉴스 브리핑" 등 자연어로 스케줄을 설정하면, Celery 워커가 정해진 시간에 AI를 자율적으로 실행합니다. 일시정지, 재개, 삭제도 가능합니다.' },
    ],
    toolsTitle: '도구 카테고리',
    toolsDesc: '파일, 메모, 캘린더, 메일, 웹 검색 등 다양한 작업을 AI가 도와드립니다.',
    tools: [
      { title: '파일 관리', desc: '탐색, 읽기, 생성, 삭제, 다운로드, 공유 링크 생성', count: '8' },
      { title: '메모/스티커', desc: '생성, 읽기, 수정, 삭제, 키워드 검색', count: '4' },
      { title: '캘린더', desc: '일정 조회, 생성, 수정, 삭제', count: '4' },
      { title: '이메일', desc: '메일 작성, 조회, 전송', count: '3' },
      { title: '웹 검색', desc: '실시간 인터넷 검색, URL 텍스트 추출', count: '2' },
      { title: '브라우저 자동화', desc: '탐색, 클릭, 입력, 스크롤, JS 실행, 스크린샷', count: '6' },
    ],
    reliabilityTitle: '신뢰성 보장',
    reliabilityDesc: 'AI가 말뿐인 결과가 아닌, 실제 결과를 보장하는 메커니즘입니다.',
    reliability: [
      { title: '할루시네이션 검증', desc: 'AI가 작업 완료를 주장하면, 별도 LLM 호출로 실제 도구 호출 결과(성공/실패)와 대조 검증합니다. 불일치 감지 시 최대 2회 재시도합니다.' },
      { title: '조기 종료 방지', desc: 'AI가 작업 도중 요약하고 멈추려 할 때, "작업을 계속하세요"로 nudge하여 완료까지 이끕니다. 첫 10회 반복 내에서 최대 2회 적용됩니다.' },
      { title: '빈 응답 복구', desc: 'AI가 빈 응답을 반환하면 자동으로 "계속" 요청을 보내 작업을 이어갑니다. 최대 2회 재시도합니다.' },
      { title: '응답 정제', desc: '모델별 아티팩트, JSON 도구 인자 유출, 내부 마커, 프롬프트 누출을 최종 응답에서 자동 제거합니다.' },
    ],
    ctaTitle: 'AI 비서와 함께 시작하세요',
    ctaDesc: '파일 관리, 캘린더, 이메일, 웹 검색 등 다양한 작업을 AI가 도와드립니다.',
  },
  en: {
    heroTitle: ['Smart Personal ', 'AI Assistant'],
    heroDesc: 'File management, calendar, email, notes, web search, browser automation — your AI assistant helps with your daily tasks. Memory features remember conversation context for reliable results.',
    features: [
      { title: 'Versatile Task Tools', desc: 'AI helps with file read/create/manage, note writing, calendar scheduling, email composition, web search, and more. Just tell AI what you need, and it handles it autonomously.' },
      { title: 'Stealth Browser Automation', desc: 'Automate the web with a Patchright-based stealth browser that bypasses anti-bot detection. Navigate pages, click, fill forms (human-like 80-100ms delay), scroll, execute JavaScript, and analyze screenshots with AI vision — auto-login with vault credentials and handle MFA.' },
      { title: 'Persistent Memory', desc: 'Stores your preferences, habits, contacts, and instructions in long-term memory. Auto-remembers personal info mentioned in conversations, injecting up to 50 memories into the system prompt for contextual interactions. Supports category management and keyword search.' },
      { title: 'Scheduled Automation', desc: 'Schedule recurring tasks with cron expressions. Set schedules in natural language like "summarize my calendar daily at 9 AM" or "news briefing on weekdays at 8 AM". Celery workers execute the AI autonomously on schedule. Pause, resume, and delete supported.' },
    ],
    toolsTitle: 'Tool Categories',
    toolsDesc: 'File, notes, calendar, mail, web search and more — AI helps with various tasks.',
    tools: [
      { title: 'File Management', desc: 'Browse, read, create, delete, download, share links', count: '8' },
      { title: 'Sticky Notes', desc: 'Create, read, update, delete, keyword search', count: '4' },
      { title: 'Calendar', desc: 'List, create, update, delete events', count: '4' },
      { title: 'Email', desc: 'Compose, view, send emails', count: '3' },
      { title: 'Web Search', desc: 'Real-time internet search, URL text extraction', count: '2' },
      { title: 'Browser Automation', desc: 'Navigate, click, fill, scroll, JS execute, screenshot', count: '6' },
    ],
    reliabilityTitle: 'Reliability Guarantees',
    reliabilityDesc: 'Mechanisms that ensure actual results, not just AI claims.',
    reliability: [
      { title: 'Hallucination Verification', desc: 'When the AI claims task completion, a separate LLM call cross-checks against actual tool call outcomes (success/failure). Retries up to 2 times if inconsistencies are detected.' },
      { title: 'Premature Completion Guard', desc: 'When the AI tries to summarize and stop mid-task, it gets nudged with "continue working" to drive the task to completion. Applied up to 2 times within the first 10 iterations.' },
      { title: 'Empty Response Recovery', desc: 'If the AI returns an empty response, an automatic "continue" request resumes the work. Retries up to 2 times.' },
      { title: 'Response Cleaning', desc: 'Automatically strips model-specific artifacts, leaked JSON tool arguments, internal markers, and prompt leakage from final responses.' },
    ],
    ctaTitle: 'Get started with your AI Assistant',
    ctaDesc: 'File management, calendar, email, web search — AI helps with your daily tasks.',
  },
};

/* ─── Page ─── */
export default function AiAssistantPage() {
  const locale = useI18nStore((s) => s.locale);
  const t = content[locale];

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
        <div className="absolute top-20 left-1/4 w-96 h-96 bg-primary-500/8 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 right-1/4 w-72 h-72 bg-accent-500/6 rounded-full blur-3xl"></div>

        <div className="max-w-5xl mx-auto px-6 py-20 lg:py-28">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-primary-500/10 border border-primary-500/20 rounded-full text-primary-400 text-xs font-medium mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-primary-400 animate-pulse"></span>
              AI Personal Assistant
            </div>
            <h1 className="text-4xl lg:text-5xl font-bold text-gray-50 leading-tight mb-6">
              {t.heroTitle[0]}
              <span className="bg-gradient-to-r from-primary-400 to-primary-600 bg-clip-text text-transparent">
                {t.heroTitle[1]}
              </span>
            </h1>
            <p className="text-lg text-gray-400 leading-relaxed mb-8">{t.heroDesc}</p>
            <div className="flex items-center gap-4">
              <Link href="/register"
                className="inline-flex items-center gap-2 px-7 py-3 bg-primary-500 hover:bg-primary-600 text-white rounded-lg font-semibold transition-all shadow-lg shadow-primary-500/25">
                Start Building
              </Link>
              <Link href="/"
                className="text-sm text-gray-400 hover:text-gray-200 transition-colors font-medium">
                Back to Home
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Core Capabilities */}
      <section className="border-t border-gray-800">
        <div className="max-w-5xl mx-auto px-6 py-20">
          <h2 className="text-2xl font-bold text-gray-50 mb-12">Core Capabilities</h2>

          <div className="grid md:grid-cols-2 gap-12">
            <div className="space-y-10">
              <FeatureItem icon={<BrainIcon />} title={t.features[0].title} desc={t.features[0].desc} />
              <FeatureItem icon={<BrowserIcon />} title={t.features[1].title} desc={t.features[1].desc} />
            </div>
            <div className="space-y-10">
              <FeatureItem icon={<MemoryIcon />} title={t.features[2].title} desc={t.features[2].desc} />
              <FeatureItem icon={<ScheduleIcon />} title={t.features[3].title} desc={t.features[3].desc} />
            </div>
          </div>
        </div>
      </section>

      {/* Tool Categories */}
      <section className="border-t border-gray-800">
        <div className="max-w-5xl mx-auto px-6 py-20">
          <h2 className="text-2xl font-bold text-gray-50 mb-4">{t.toolsTitle}</h2>
          <p className="text-gray-400 mb-12 max-w-lg">{t.toolsDesc}</p>

          <div className="grid md:grid-cols-3 gap-4">
            {t.tools.map((tool, i) => (
              <div key={i} className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-5">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-gray-50 text-sm font-semibold">{tool.title}</h3>
                  <span className="text-xs font-mono text-primary-400 bg-primary-500/10 px-2 py-0.5 rounded">{tool.count}</span>
                </div>
                <p className="text-gray-400 text-xs leading-relaxed">{tool.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Reliability */}
      <section className="border-t border-gray-800">
        <div className="max-w-5xl mx-auto px-6 py-20">
          <h2 className="text-2xl font-bold text-gray-50 mb-4">{t.reliabilityTitle}</h2>
          <p className="text-gray-400 mb-12 max-w-lg">{t.reliabilityDesc}</p>

          <div className="grid md:grid-cols-2 gap-4">
            {t.reliability.map((item, i) => (
              <div key={i} className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-5">
                <h3 className="text-gray-50 text-sm font-semibold mb-1">{item.title}</h3>
                <p className="text-gray-400 text-xs leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-gray-800">
        <div className="max-w-5xl mx-auto px-6 py-16 text-center">
          <h2 className="text-2xl font-bold text-gray-50 mb-4">{t.ctaTitle}</h2>
          <p className="text-gray-400 mb-8 max-w-md mx-auto">{t.ctaDesc}</p>
          <Link href="/register"
            className="inline-flex items-center gap-2 px-8 py-3 bg-primary-500 hover:bg-primary-600 text-white rounded-lg font-semibold transition-all shadow-lg shadow-primary-500/25">
            The Terraforming
          </Link>
        </div>
      </section>

      <LandingFooter />
    </div>
  );
}
