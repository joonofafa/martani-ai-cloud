'use client';

import Link from 'next/link';
import { LandingFooter } from '@/components/landing-footer';
import { useI18nStore } from '@/lib/i18n';

/* ─── Animated Icons ─── */
function NetworkIcon() {
  const nodes = [
    { cx: 24, cy: 12, r: 3 }, { cx: 10, cy: 24, r: 2.5 }, { cx: 38, cy: 24, r: 2.5 },
    { cx: 16, cy: 38, r: 2.5 }, { cx: 32, cy: 38, r: 2.5 },
  ];
  const edges: [number, number][] = [[0,1],[0,2],[0,3],[0,4],[1,3],[2,4],[3,4]];
  return (
    <svg width="56" height="56" viewBox="0 0 48 48" fill="none">
      {edges.map(([a, b], i) => (
        <line key={i} x1={nodes[a].cx} y1={nodes[a].cy} x2={nodes[b].cx} y2={nodes[b].cy}
          stroke={i % 2 === 0 ? '#F97316' : '#14B8A6'} strokeWidth="0.8" strokeDasharray="4 6" opacity="0.5">
          <animate attributeName="stroke-dashoffset" values="0;-20" dur="2s" repeatCount="indefinite" />
        </line>
      ))}
      {nodes.map((n, i) => (
        <circle key={i} cx={n.cx} cy={n.cy} r={n.r}
          fill={i === 0 ? '#F97316' : '#14B8A6'} opacity="0.8">
          <animate attributeName="opacity" values="0.4;1;0.4" dur="3s" repeatCount="indefinite" begin={`${i * 0.4}s`} />
        </circle>
      ))}
    </svg>
  );
}

function DocumentSearchIcon() {
  return (
    <svg width="56" height="56" viewBox="0 0 48 48" fill="none">
      <rect x="8" y="6" width="24" height="32" rx="3" stroke="#F97316" strokeWidth="1.5" fill="none" opacity="0.6" />
      <line x1="14" y1="14" x2="26" y2="14" stroke="#FB923C" strokeWidth="1" opacity="0.4" />
      <line x1="14" y1="19" x2="24" y2="19" stroke="#FB923C" strokeWidth="1" opacity="0.3" />
      <line x1="14" y1="24" x2="26" y2="24" stroke="#FB923C" strokeWidth="1" opacity="0.4" />
      <line x1="14" y1="29" x2="22" y2="29" stroke="#FB923C" strokeWidth="1" opacity="0.3" />
      <circle cx="34" cy="34" r="8" stroke="#14B8A6" strokeWidth="1.5" fill="none" opacity="0.7" />
      <line x1="40" y1="40" x2="44" y2="44" stroke="#14B8A6" strokeWidth="2" strokeLinecap="round" opacity="0.7" />
      <circle cx="34" cy="34" r="3" fill="#14B8A6" opacity="0.15">
        <animate attributeName="r" values="2;5;2" dur="2s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.3;0.05;0.3" dur="2s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}

function ToolsIcon() {
  return (
    <svg width="56" height="56" viewBox="0 0 48 48" fill="none">
      <rect x="6" y="10" width="16" height="12" rx="2" stroke="#F97316" strokeWidth="1.2" fill="none" opacity="0.5" />
      <rect x="26" y="10" width="16" height="12" rx="2" stroke="#14B8A6" strokeWidth="1.2" fill="none" opacity="0.5" />
      <rect x="6" y="26" width="16" height="12" rx="2" stroke="#14B8A6" strokeWidth="1.2" fill="none" opacity="0.5" />
      <rect x="26" y="26" width="16" height="12" rx="2" stroke="#F97316" strokeWidth="1.2" fill="none" opacity="0.5" />
      <path d="M14 15L12 17L14 19" stroke="#FB923C" strokeWidth="1" strokeLinecap="round" opacity="0.7" />
      <path d="M18 15L20 17L18 19" stroke="#FB923C" strokeWidth="1" strokeLinecap="round" opacity="0.7" />
      <circle cx="34" cy="16" r="2" fill="#14B8A6" opacity="0.6">
        <animate attributeName="opacity" values="0.3;0.8;0.3" dur="2s" repeatCount="indefinite" />
      </circle>
      <path d="M12 31L16 31" stroke="#14B8A6" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
      <path d="M12 34L18 34" stroke="#14B8A6" strokeWidth="1" strokeLinecap="round" opacity="0.4" />
      <circle cx="34" cy="32" r="2.5" stroke="#FB923C" strokeWidth="1" fill="none" opacity="0.6">
        <animate attributeName="r" values="2;3.5;2" dur="3s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}

function SystemPromptIcon() {
  return (
    <svg width="56" height="56" viewBox="0 0 48 48" fill="none">
      <path d="M8 36V16L24 8L40 16V36L24 44L8 36Z" stroke="#F97316" strokeWidth="1.2" fill="none" opacity="0.4" />
      <path d="M8 16L24 24L40 16" stroke="#F97316" strokeWidth="1" fill="none" opacity="0.3" />
      <path d="M24 24V44" stroke="#F97316" strokeWidth="1" opacity="0.3" />
      <circle cx="24" cy="24" r="4" fill="#14B8A6" opacity="0.6">
        <animate attributeName="r" values="3;5;3" dur="3s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.3;0.7;0.3" dur="3s" repeatCount="indefinite" />
      </circle>
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
    heroTitle: ['데이터와 대화하는 ', '지능형 분석'],
    heroDesc: '문서를 업로드하면 AI가 내용을 이해합니다. 단순 키워드 검색이 아닌, 벡터 임베딩 기반의 의미적 검색으로 문서 간 숨겨진 연결을 발견하세요. LLM이 당신의 데이터를 읽고, 분석하고, 새로운 인사이트를 제공합니다.',
    features: [
      { title: 'Intelligent AI Chat', desc: 'AI와 자연스럽게 대화하며 질문하고 답변을 받으세요. 실시간 스트리밍 응답으로 빠른 피드백을 받고, 모든 대화 내용은 세션별로 안전하게 저장됩니다.' },
      { title: 'RAG Document Intelligence', desc: 'PDF, DOCX, TXT, Markdown 파일을 벡터 임베딩으로 인덱싱합니다. 코사인 유사도 기반 시맨틱 검색으로 관련 문서 청크를 찾아 AI 대화에 컨텍스트로 제공합니다.' },
      { title: 'AI Tool Integration', desc: 'AI가 파일을 읽고, 메모를 작성하고, 데이터를 검색할 수 있습니다. 관리자가 파일 읽기/생성/삭제, 메모 관리, 검색 등 각 도구의 활성화를 세밀하게 제어합니다.' },
      { title: 'Customizable System Prompts', desc: 'AI가 당신의 업무 스타일에 맞춰 답변합니다. 창의적인 아이디어가 필요할 땐 더 자유롭게, 정확한 정보가 필요할 땐 더 정밀하게—당신이 원하는 대로 AI 응답 스타일을 조절하세요.' },
    ],
    pipelineDesc: '문서가 AI의 컨텍스트가 되기까지의 과정을 소개합니다.',
    pipeline: [
      { step: '01', title: 'Upload', desc: '파일 관리자에서 PDF, DOCX, TXT, Markdown 문서를 업로드합니다.' },
      { step: '02', title: 'Index', desc: '문서를 청크로 분할하고 임베딩 모델로 벡터화합니다.' },
      { step: '03', title: 'Search', desc: 'AI 대화 시 관련 문서 청크를 코사인 유사도로 검색합니다.' },
      { step: '04', title: 'Respond', desc: 'LLM이 검색된 컨텍스트를 참조하여 정확한 답변을 생성합니다.' },
    ],
    ctaTitle: '당신의 데이터에 지능을 더하세요',
    ctaDesc: 'Martani의 AI 분석 기능으로 문서의 가치를 극대화하세요.',
  },
  en: {
    heroTitle: ['Converse with your data — ', 'Intelligent Analytics'],
    heroDesc: 'Upload documents and let AI understand the content. Go beyond keyword search — discover hidden connections between documents through vector embedding-based semantic search. LLMs read, analyze, and deliver new insights from your data.',
    features: [
      { title: 'Intelligent AI Chat', desc: 'Have natural conversations with AI to ask questions and get answers. Get rapid feedback through real-time streaming responses, with all conversations safely saved by session.' },
      { title: 'RAG Document Intelligence', desc: 'Index PDF, DOCX, TXT, and Markdown files as vector embeddings. Find relevant document chunks via cosine similarity-based semantic search and provide them as context in AI conversations.' },
      { title: 'AI Tool Integration', desc: 'AI can read files, write notes, and search data. Administrators can granularly control the activation of each tool — file read/create/delete, note management, search, and more.' },
      { title: 'Customizable System Prompts', desc: 'AI adapts to your workflow style. Need creative ideas? Get more imaginative responses. Need precise information? Get more accurate answers—customize AI response style exactly the way you want.' },
    ],
    pipelineDesc: 'How your documents become AI context.',
    pipeline: [
      { step: '01', title: 'Upload', desc: 'Upload PDF, DOCX, TXT, and Markdown documents from the file manager.' },
      { step: '02', title: 'Index', desc: 'Split documents into chunks and vectorize them with an embedding model.' },
      { step: '03', title: 'Search', desc: 'During AI chat, search for relevant document chunks using cosine similarity.' },
      { step: '04', title: 'Respond', desc: 'The LLM references retrieved context to generate accurate responses.' },
    ],
    ctaTitle: 'Add intelligence to your data',
    ctaDesc: 'Maximize the value of your documents with Martani\'s AI analytics.',
  },
};

/* ─── Page ─── */
export default function AiAnalyticsPage() {
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
              AI-Powered Analytics
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

      {/* Capabilities */}
      <section className="border-t border-gray-800">
        <div className="max-w-5xl mx-auto px-6 py-20">
          <h2 className="text-2xl font-bold text-gray-50 mb-12">Core Capabilities</h2>

          <div className="grid md:grid-cols-2 gap-12">
            <div className="space-y-10">
              <FeatureItem icon={<NetworkIcon />} title={t.features[0].title} desc={t.features[0].desc} />
              <FeatureItem icon={<DocumentSearchIcon />} title={t.features[1].title} desc={t.features[1].desc} />
            </div>
            <div className="space-y-10">
              <FeatureItem icon={<ToolsIcon />} title={t.features[2].title} desc={t.features[2].desc} />
              <FeatureItem icon={<SystemPromptIcon />} title={t.features[3].title} desc={t.features[3].desc} />
            </div>
          </div>
        </div>
      </section>

      {/* Pipeline */}
      <section className="border-t border-gray-800">
        <div className="max-w-5xl mx-auto px-6 py-20">
          <h2 className="text-2xl font-bold text-gray-50 mb-4">RAG Pipeline</h2>
          <p className="text-gray-400 mb-12 max-w-lg">{t.pipelineDesc}</p>

          <div className="grid md:grid-cols-4 gap-6">
            {t.pipeline.map((item, i) => (
              <div key={i} className="bg-gray-800 border border-gray-700 rounded-xl p-6 relative">
                <div className="text-primary-500/30 text-4xl font-bold mb-3">{item.step}</div>
                <h3 className="text-gray-50 font-semibold mb-2">{item.title}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{item.desc}</p>
                {i < 3 && (
                  <div className="hidden md:block absolute top-1/2 -right-3 w-6 h-px bg-gray-600"></div>
                )}
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
