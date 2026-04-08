'use client';

import Link from 'next/link';
import { LandingFooter } from '@/components/landing-footer';
import { useI18nStore } from '@/lib/i18n';

/* ─── Animated Icons ─── */
function StorageIcon() {
  return (
    <svg width="56" height="56" viewBox="0 0 48 48" fill="none">
      <rect x="8" y="8" width="32" height="10" rx="3" stroke="#14B8A6" strokeWidth="1.5" fill="none" opacity="0.6" />
      <rect x="8" y="20" width="32" height="10" rx="3" stroke="#14B8A6" strokeWidth="1.5" fill="none" opacity="0.5" />
      <rect x="8" y="32" width="32" height="10" rx="3" stroke="#14B8A6" strokeWidth="1.5" fill="none" opacity="0.4" />
      <circle cx="34" cy="13" r="2" fill="#14B8A6" opacity="0.8">
        <animate attributeName="opacity" values="0.3;1;0.3" dur="2s" repeatCount="indefinite" />
      </circle>
      <circle cx="34" cy="25" r="2" fill="#F97316" opacity="0.7">
        <animate attributeName="opacity" values="0.3;1;0.3" dur="2s" repeatCount="indefinite" begin="0.5s" />
      </circle>
      <circle cx="34" cy="37" r="2" fill="#14B8A6" opacity="0.6">
        <animate attributeName="opacity" values="0.3;1;0.3" dur="2s" repeatCount="indefinite" begin="1s" />
      </circle>
    </svg>
  );
}

function FolderTreeIcon() {
  return (
    <svg width="56" height="56" viewBox="0 0 48 48" fill="none">
      <path d="M8 12H20L24 8H40V38H8V12Z" stroke="#F97316" strokeWidth="1.5" fill="none" opacity="0.5" />
      <line x1="16" y1="20" x2="16" y2="34" stroke="#FB923C" strokeWidth="1" opacity="0.3" />
      <line x1="16" y1="24" x2="24" y2="24" stroke="#FB923C" strokeWidth="1" opacity="0.4" />
      <line x1="16" y1="30" x2="24" y2="30" stroke="#FB923C" strokeWidth="1" opacity="0.4" />
      <rect x="25" y="21" width="12" height="5" rx="1.5" stroke="#14B8A6" strokeWidth="0.8" fill="none" opacity="0.5" />
      <rect x="25" y="27" width="10" height="5" rx="1.5" stroke="#14B8A6" strokeWidth="0.8" fill="none" opacity="0.5" />
      <circle cx="14" cy="14" r="1.5" fill="#F97316" opacity="0.6">
        <animate attributeName="opacity" values="0.3;0.8;0.3" dur="3s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg width="56" height="56" viewBox="0 0 48 48" fill="none">
      <circle cx="36" cy="12" r="5" stroke="#14B8A6" strokeWidth="1.5" fill="none" opacity="0.6" />
      <circle cx="12" cy="24" r="5" stroke="#F97316" strokeWidth="1.5" fill="none" opacity="0.6" />
      <circle cx="36" cy="36" r="5" stroke="#14B8A6" strokeWidth="1.5" fill="none" opacity="0.6" />
      <line x1="16" y1="22" x2="32" y2="14" stroke="#FB923C" strokeWidth="1" opacity="0.4" strokeDasharray="3 4">
        <animate attributeName="stroke-dashoffset" values="0;-14" dur="2s" repeatCount="indefinite" />
      </line>
      <line x1="16" y1="26" x2="32" y2="34" stroke="#FB923C" strokeWidth="1" opacity="0.4" strokeDasharray="3 4">
        <animate attributeName="stroke-dashoffset" values="0;-14" dur="2s" repeatCount="indefinite" begin="0.5s" />
      </line>
    </svg>
  );
}

function QuotaIcon() {
  return (
    <svg width="56" height="56" viewBox="0 0 48 48" fill="none">
      <circle cx="24" cy="24" r="16" stroke="#14B8A6" strokeWidth="1.5" fill="none" opacity="0.3" />
      <path d="M24 8 A16 16 0 0 1 40 24" stroke="#F97316" strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.7">
        <animate attributeName="stroke-dasharray" values="0 100;25 75;0 100" dur="4s" repeatCount="indefinite" />
      </path>
      <text x="24" y="26" textAnchor="middle" fill="#F97316" fontSize="8" fontWeight="bold" opacity="0.7">GB</text>
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
    heroTitle: ['확장 가능한 ', '클라우드 스토리지'],
    heroDesc: 'S3 호환 MinIO 오브젝트 스토리지 위에 구축된 파일 관리 시스템입니다. 폴더 계층 구조로 파일을 정리하고, 공유 링크로 협업하며, 사용자별 스토리지 쿼터로 리소스를 효율적으로 관리하세요.',
    features: [
      { title: 'MinIO Object Storage', desc: 'Amazon S3 호환 오브젝트 스토리지로 파일을 안전하게 저장합니다. PDF, DOCX, TXT, Markdown 등 다양한 포맷을 지원하며, 드래그 앤 드롭으로 간편하게 업로드합니다.' },
      { title: 'Hierarchical Folder Structure', desc: '폴더를 생성하고 파일을 체계적으로 정리할 수 있습니다. 그리드 뷰와 리스트 뷰를 전환하며 탐색하고, 파일명 검색으로 원하는 파일을 빠르게 찾으세요.' },
      { title: 'File Sharing & Collaboration', desc: '공유 링크를 생성하여 파일을 외부에 안전하게 전달합니다. 원클릭 복사, 다운로드, 이름 변경, 삭제 등 컨텍스트 메뉴에서 모든 작업을 수행할 수 있습니다.' },
      { title: 'Storage Usage Overview', desc: '내 스토리지 사용량을 한눈에 확인하세요. 얼마나 사용했는지, 얼마나 남았는지 실시간으로 파악하여 파일 정리 계획을 세울 수 있습니다.' },
    ],
    techDesc: '검증된 오픈소스 기술로 구축된 안정적인 클라우드 인프라입니다.',
    techStack: [
      { title: 'MinIO', desc: 'S3 호환 고성능 오브젝트 스토리지. 온프레미스 또는 클라우드에 유연하게 배포할 수 있습니다.', color: 'primary' },
      { title: 'PostgreSQL', desc: 'pgvector 확장을 포함한 관계형 데이터베이스. 메타데이터와 벡터 임베딩을 함께 관리합니다.', color: 'accent' },
      { title: 'Docker', desc: '컨테이너 기반 배포로 개발 환경과 프로덕션 환경의 일관성을 보장합니다.', color: 'primary' },
    ],
    opsDesc: '직관적인 인터페이스로 모든 파일 작업을 수행하세요.',
    ops: [
      { title: 'Upload & Download', desc: '드래그 앤 드롭 또는 클릭으로 파일을 업로드하고, 원클릭으로 다운로드합니다.' },
      { title: 'Grid & List View', desc: '썸네일 스타일의 그리드 뷰와 상세한 리스트 뷰를 자유롭게 전환합니다.' },
      { title: 'Bulk Operations', desc: '여러 파일을 선택하여 일괄 삭제합니다. Ctrl/Cmd 클릭으로 다중 선택을 지원합니다.' },
      { title: 'File Properties', desc: '파일 크기, 타입, 생성일 등 상세 메타데이터를 확인합니다.' },
      { title: 'Context Menu', desc: '우클릭으로 다운로드, 공유, 이름 변경, 인덱싱, 삭제 등 모든 작업에 접근합니다.' },
      { title: 'RAG Indexing', desc: '파일 관리자에서 바로 AI 인덱싱을 실행하여 대화에 활용할 수 있습니다.' },
    ],
    ctaTitle: '클라우드 인프라를 시작하세요',
    ctaDesc: 'Martani의 클라우드 스토리지로 팀의 파일을 체계적으로 관리하세요.',
  },
  en: {
    heroTitle: ['Scalable ', 'Cloud Storage'],
    heroDesc: 'A file management system built on S3-compatible MinIO object storage. Organize files with hierarchical folders, collaborate via shared links, and efficiently manage resources with per-user storage quotas.',
    features: [
      { title: 'MinIO Object Storage', desc: 'Securely store files with Amazon S3-compatible object storage. Supports various formats including PDF, DOCX, TXT, and Markdown, with simple drag-and-drop uploads.' },
      { title: 'Hierarchical Folder Structure', desc: 'Create folders and organize files systematically. Switch between grid and list views for browsing, and quickly find files with filename search.' },
      { title: 'File Sharing & Collaboration', desc: 'Generate sharing links to securely distribute files externally. Perform all operations — copy, download, rename, delete — from the context menu with one click.' },
      { title: 'Storage Usage Overview', desc: 'Check your storage usage at a glance. See how much you\'ve used and how much remains in real-time, so you can plan your file cleanup accordingly.' },
    ],
    techDesc: 'Reliable cloud infrastructure built on proven open-source technologies.',
    techStack: [
      { title: 'MinIO', desc: 'High-performance S3-compatible object storage. Flexibly deploy on-premises or in the cloud.', color: 'primary' },
      { title: 'PostgreSQL', desc: 'Relational database with pgvector extension. Manages metadata and vector embeddings together.', color: 'accent' },
      { title: 'Docker', desc: 'Container-based deployment ensures consistency between development and production environments.', color: 'primary' },
    ],
    opsDesc: 'Perform all file operations through an intuitive interface.',
    ops: [
      { title: 'Upload & Download', desc: 'Upload files via drag-and-drop or click, and download with a single click.' },
      { title: 'Grid & List View', desc: 'Freely switch between thumbnail-style grid view and detailed list view.' },
      { title: 'Bulk Operations', desc: 'Select multiple files for batch deletion. Multi-select supported with Ctrl/Cmd click.' },
      { title: 'File Properties', desc: 'View detailed metadata including file size, type, and creation date.' },
      { title: 'Context Menu', desc: 'Right-click to access all operations — download, share, rename, index, delete.' },
      { title: 'RAG Indexing', desc: 'Run AI indexing directly from the file manager to use in conversations.' },
    ],
    ctaTitle: 'Start your cloud infrastructure',
    ctaDesc: 'Systematically manage your team\'s files with Martani cloud storage.',
  },
};

/* ─── Page ─── */
export default function CloudArchitecturePage() {
  const locale = useI18nStore((s) => s.locale);
  const t = content[locale];

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Navbar */}
      <nav className="relative z-10 border-b border-gray-800">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-gray-50 hover:text-accent-400 transition-colors">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            <span className="text-sm font-medium">Martani</span>
          </Link>
          <Link href="/register"
            className="text-sm px-5 py-2 bg-accent-500 hover:bg-accent-600 text-white rounded-lg font-medium transition-all">
            Get Started
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute top-20 right-1/4 w-96 h-96 bg-accent-500/8 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-1/4 w-72 h-72 bg-primary-500/6 rounded-full blur-3xl"></div>

        <div className="max-w-5xl mx-auto px-6 py-20 lg:py-28">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-accent-500/10 border border-accent-500/20 rounded-full text-accent-400 text-xs font-medium mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-accent-400 animate-pulse"></span>
              Scalable Cloud Architecture
            </div>
            <h1 className="text-4xl lg:text-5xl font-bold text-gray-50 leading-tight mb-6">
              {t.heroTitle[0]}
              <span className="bg-gradient-to-r from-accent-400 to-accent-600 bg-clip-text text-transparent">
                {t.heroTitle[1]}
              </span>
            </h1>
            <p className="text-lg text-gray-400 leading-relaxed mb-8">{t.heroDesc}</p>
            <div className="flex items-center gap-4">
              <Link href="/register"
                className="inline-flex items-center gap-2 px-7 py-3 bg-accent-500 hover:bg-accent-600 text-white rounded-lg font-semibold transition-all shadow-lg shadow-accent-500/25">
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
              <FeatureItem icon={<StorageIcon />} title={t.features[0].title} desc={t.features[0].desc} />
              <FeatureItem icon={<FolderTreeIcon />} title={t.features[1].title} desc={t.features[1].desc} />
            </div>
            <div className="space-y-10">
              <FeatureItem icon={<ShareIcon />} title={t.features[2].title} desc={t.features[2].desc} />
              <FeatureItem icon={<QuotaIcon />} title={t.features[3].title} desc={t.features[3].desc} />
            </div>
          </div>
        </div>
      </section>

      {/* Architecture */}
      <section className="border-t border-gray-800">
        <div className="max-w-5xl mx-auto px-6 py-20">
          <h2 className="text-2xl font-bold text-gray-50 mb-4">Tech Stack</h2>
          <p className="text-gray-400 mb-12 max-w-lg">{t.techDesc}</p>

          <div className="grid md:grid-cols-3 gap-6">
            {t.techStack.map((item, i) => (
              <div key={i} className="bg-gray-800 border border-gray-700 rounded-xl p-6">
                <div className={`w-10 h-10 rounded-lg bg-${item.color}-500/15 flex items-center justify-center mb-4`}>
                  <div className={`w-3 h-3 rounded-full bg-${item.color}-500`}></div>
                </div>
                <h3 className="text-gray-50 font-semibold mb-2">{item.title}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* File Operations */}
      <section className="border-t border-gray-800">
        <div className="max-w-5xl mx-auto px-6 py-20">
          <h2 className="text-2xl font-bold text-gray-50 mb-4">File Operations</h2>
          <p className="text-gray-400 mb-12 max-w-lg">{t.opsDesc}</p>

          <div className="grid md:grid-cols-2 gap-4">
            {t.ops.map((item, i) => (
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
            className="inline-flex items-center gap-2 px-8 py-3 bg-accent-500 hover:bg-accent-600 text-white rounded-lg font-semibold transition-all shadow-lg shadow-accent-500/25">
            The Terraforming
          </Link>
        </div>
      </section>

      <LandingFooter />
    </div>
  );
}
