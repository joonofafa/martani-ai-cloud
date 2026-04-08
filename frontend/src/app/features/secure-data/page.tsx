'use client';

import Link from 'next/link';
import { LandingFooter } from '@/components/landing-footer';
import { useI18nStore } from '@/lib/i18n';

/* ─── Animated Icons ─── */
function VaultIcon() {
  return (
    <svg width="56" height="56" viewBox="0 0 48 48" fill="none">
      <rect x="8" y="10" width="32" height="28" rx="4" stroke="#F97316" strokeWidth="1.5" fill="none" opacity="0.5" />
      <rect x="8" y="10" width="32" height="28" rx="4" fill="#F97316" opacity="0.03" />
      <circle cx="24" cy="24" r="7" stroke="#14B8A6" strokeWidth="1.5" fill="none" opacity="0.6" />
      <circle cx="24" cy="24" r="2" fill="#14B8A6" opacity="0.8">
        <animate attributeName="opacity" values="0.4;1;0.4" dur="2s" repeatCount="indefinite" />
      </circle>
      <line x1="24" y1="17" x2="24" y2="20" stroke="#14B8A6" strokeWidth="1" opacity="0.5" />
      <line x1="24" y1="28" x2="24" y2="31" stroke="#14B8A6" strokeWidth="1" opacity="0.5" />
      <line x1="17" y1="24" x2="20" y2="24" stroke="#14B8A6" strokeWidth="1" opacity="0.5" />
      <line x1="28" y1="24" x2="31" y2="24" stroke="#14B8A6" strokeWidth="1" opacity="0.5" />
    </svg>
  );
}

function KeyIcon() {
  return (
    <svg width="56" height="56" viewBox="0 0 48 48" fill="none">
      <circle cx="18" cy="20" r="8" stroke="#F97316" strokeWidth="1.5" fill="none" opacity="0.5" />
      <circle cx="18" cy="20" r="3" fill="#F97316" opacity="0.15">
        <animate attributeName="r" values="2;4;2" dur="3s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.3;0.08;0.3" dur="3s" repeatCount="indefinite" />
      </circle>
      <path d="M24 24L38 38" stroke="#14B8A6" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
      <path d="M34 34L38 30" stroke="#14B8A6" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
      <path d="M30 30L34 26" stroke="#14B8A6" strokeWidth="1.5" strokeLinecap="round" opacity="0.4" />
    </svg>
  );
}

function FileLockIcon() {
  return (
    <svg width="56" height="56" viewBox="0 0 48 48" fill="none">
      <rect x="10" y="6" width="20" height="28" rx="3" stroke="#F97316" strokeWidth="1.5" fill="none" opacity="0.5" />
      <line x1="16" y1="14" x2="24" y2="14" stroke="#FB923C" strokeWidth="1" opacity="0.3" />
      <line x1="16" y1="19" x2="26" y2="19" stroke="#FB923C" strokeWidth="1" opacity="0.3" />
      <line x1="16" y1="24" x2="22" y2="24" stroke="#FB923C" strokeWidth="1" opacity="0.3" />
      <rect x="28" y="22" width="14" height="16" rx="3" stroke="#14B8A6" strokeWidth="1.5" fill="none" opacity="0.6" />
      <path d="M31 22V18Q31 12 35 12Q39 12 39 18V22" stroke="#14B8A6" strokeWidth="1.2" fill="none" opacity="0.5" />
      <circle cx="35" cy="30" r="2" fill="#14B8A6" opacity="0.7">
        <animate attributeName="opacity" values="0.4;1;0.4" dur="2s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}

function AgentLoginIcon() {
  return (
    <svg width="56" height="56" viewBox="0 0 48 48" fill="none">
      <rect x="6" y="8" width="36" height="24" rx="3" stroke="#14B8A6" strokeWidth="1.5" fill="none" opacity="0.5" />
      <rect x="14" y="18" width="20" height="8" rx="2" stroke="#FB923C" strokeWidth="1" fill="none" opacity="0.4" />
      <circle cx="18" cy="22" r="1.5" fill="#F97316" opacity="0.6">
        <animate attributeName="cx" values="18;30;18" dur="2s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.3;0.8;0.3" dur="2s" repeatCount="indefinite" />
      </circle>
      <circle cx="24" cy="40" r="5" stroke="#F97316" strokeWidth="1.2" fill="none" opacity="0.4" />
      <path d="M22 40L23.5 41.5L26 38" stroke="#14B8A6" strokeWidth="1" strokeLinecap="round" opacity="0.7">
        <animate attributeName="opacity" values="0.3;0.9;0.3" dur="3s" repeatCount="indefinite" />
      </path>
      <line x1="24" y1="32" x2="24" y2="35" stroke="#FB923C" strokeWidth="1" opacity="0.3" strokeDasharray="2 2">
        <animate attributeName="stroke-dashoffset" values="0;-8" dur="1.5s" repeatCount="indefinite" />
      </line>
    </svg>
  );
}

function CookieIcon() {
  return (
    <svg width="56" height="56" viewBox="0 0 48 48" fill="none">
      <circle cx="24" cy="24" r="14" stroke="#F97316" strokeWidth="1.5" fill="none" opacity="0.5" />
      <circle cx="24" cy="24" r="14" fill="#F97316" opacity="0.03" />
      <circle cx="20" cy="18" r="2" fill="#14B8A6" opacity="0.6" />
      <circle cx="28" cy="22" r="1.5" fill="#FB923C" opacity="0.5" />
      <circle cx="18" cy="28" r="1.5" fill="#14B8A6" opacity="0.5" />
      <circle cx="28" cy="30" r="2" fill="#F97316" opacity="0.4" />
      <path d="M30 14Q34 14 36 18" stroke="#14B8A6" strokeWidth="1" fill="none" opacity="0.3" strokeDasharray="2 3">
        <animate attributeName="stroke-dashoffset" values="0;-10" dur="2s" repeatCount="indefinite" />
      </path>
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
    heroTitle: ['AES-256 암호화 ', '보안관'],
    heroDesc: '비밀번호, 파일, 브라우저 세션을 AES-256-CBC로 암호화하여 보관합니다. AI Agent가 저장된 자격증명으로 웹사이트에 자동 로그인하고, MFA 인증까지 처리합니다. 당신의 디지털 자산을 금고처럼 보호하세요.',
    features: [
      { title: '키 금고 (Credential Vault)', desc: '사이트명, 아이디, 비밀번호, 메모를 AES-256-CBC로 암호화하여 저장합니다. 매 암호화마다 랜덤 16바이트 IV를 생성하고, PKCS7 패딩을 적용합니다. 비밀번호는 목록에서 마스킹되며, 눈 아이콘 클릭 시에만 복호화하여 표시합니다.' },
      { title: '파일 금고 (File Vault)', desc: '파일 탐색기에서 우클릭 → "금고에 보관"으로 파일을 AES-256-CBC로 암호화합니다. 원본 파일은 소프트 삭제되고, 암호화된 파일이 MinIO에 .enc 형태로 저장됩니다. 잠금 해제 시 원래 폴더로 복원됩니다.' },
      { title: 'Agent 자동 로그인', desc: 'AI Agent가 키 금고의 자격증명으로 웹사이트에 자동 로그인합니다. 로그인 폼을 자동 감지하고, 사람처럼 100ms 간격으로 키를 입력합니다. 2단계 인증(MFA/OTP) 감지 시 WebSocket으로 사용자에게 코드를 요청하여 처리합니다.' },
      { title: '쿠키 금고 (Cookie Vault)', desc: 'AI Agent가 로그인한 브라우저 세션의 쿠키를 AES-256으로 암호화하여 저장합니다. 다음 방문 시 저장된 쿠키를 자동으로 불러와 재로그인 없이 세션을 유지합니다. 도메인별로 관리되며 수동 가져오기도 지원합니다.' },
    ],
    encTitle: 'AES-256-CBC 암호화',
    encDesc: '모든 민감 데이터에 동일한 군사급 암호화 표준을 적용합니다.',
    encSteps: [
      { step: '01', title: 'Key', desc: '32바이트(256비트) 마스터 키를 시스템 설정에 안전하게 보관합니다. 최초 사용 시 os.urandom()으로 자동 생성됩니다.' },
      { step: '02', title: 'IV', desc: '매 암호화 연산마다 16바이트 랜덤 초기화 벡터(IV)를 생성합니다. 동일한 평문도 매번 다른 암호문을 생성합니다.' },
      { step: '03', title: 'Encrypt', desc: 'PKCS7 패딩 후 AES-256-CBC 모드로 암호화합니다. IV + 암호문을 결합하여 Base64로 인코딩합니다.' },
      { step: '04', title: 'Store', desc: '자격증명은 DB에, 파일은 MinIO에 .enc 형태로 안전하게 저장됩니다. 복호화는 필요한 순간에만 수행합니다.' },
    ],
    agentTitle: 'Agent가 할 수 있는 것',
    agentDesc: '저장된 자격증명으로 AI Agent가 수행할 수 있는 자동화 작업입니다.',
    agentCards: [
      { title: '자동 로그인', items: ['키 금고에서 자격증명 조회', 'CSS 셀렉터로 로그인 폼 자동 감지', '사람처럼 키 입력 (100ms 딜레이)', '다단계 로그인 폼 지원 (아이디 → 비밀번호 분리)'], color: 'primary' },
      { title: 'MFA/OTP 처리', items: ['OTP 입력 필드 자동 감지', 'WebSocket으로 사용자에게 코드 요청', '인증 코드 자동 입력 및 제출', '네이버 등 특수 로그인 폼 지원'], color: 'accent' },
      { title: '세션 관리', items: ['로그인 후 쿠키 자동 암호화 저장', '다음 방문 시 쿠키 자동 로드', '도메인별 쿠키 분리 관리', '수동 쿠키 가져오기/삭제'], color: 'primary' },
    ],
    isoDesc: '사용자 데이터는 완벽하게 격리되고 보호됩니다.',
    isolation: [
      { title: '사용자별 데이터 격리', desc: '모든 Vault API에 사용자 ID 필터가 적용됩니다. 다른 사용자의 자격증명, 파일, 쿠키에 절대 접근할 수 없습니다.' },
      { title: '비밀번호 온디맨드 복호화', desc: '자격증명 목록에서 비밀번호는 항상 마스킹(••••••••)됩니다. 개별 조회 시에만 서버에서 복호화하여 전달합니다.' },
      { title: '파일 원본 소프트 삭제', desc: '파일을 금고에 보관하면 원본은 소프트 삭제되고 암호화된 사본만 남습니다. 잠금 해제 시 원래 폴더에 복원됩니다.' },
      { title: 'API 키 마스킹', desc: '관리자 화면에서도 Vault 마스터 키와 API 키는 마스킹 처리됩니다. 시스템 설정에 is_secret 플래그로 관리됩니다.' },
    ],
    ctaTitle: '디지털 자산을 안전하게 보호하세요',
    ctaDesc: 'Martani 보안관으로 비밀번호, 파일, 세션을 군사급 암호화로 관리하세요.',
  },
  en: {
    heroTitle: ['AES-256 Encrypted ', 'Security Vault'],
    heroDesc: 'Store passwords, files, and browser sessions encrypted with AES-256-CBC. Your AI Agent auto-logs into websites using stored credentials and handles MFA authentication. Protect your digital assets like a vault.',
    features: [
      { title: 'Credential Vault', desc: 'Store site names, usernames, passwords, and notes encrypted with AES-256-CBC. A random 16-byte IV is generated for each encryption operation with PKCS7 padding. Passwords are masked in lists and decrypted on-demand only when you click the reveal icon.' },
      { title: 'File Vault', desc: 'Right-click any file in the file explorer → "Lock to Vault" to encrypt it with AES-256-CBC. The original file is soft-deleted and the encrypted version is stored in MinIO as .enc. Unlocking restores it to the original folder.' },
      { title: 'Agent Auto-Login', desc: 'The AI Agent automatically logs into websites using credentials from the vault. It auto-detects login forms via CSS selectors and types keystrokes with human-like 100ms delays. When MFA/OTP is detected, it requests the code from you via WebSocket.' },
      { title: 'Cookie Vault', desc: 'The AI Agent encrypts and stores browser session cookies with AES-256 after login. On the next visit, stored cookies are automatically loaded to maintain the session without re-authentication. Managed per domain with manual import support.' },
    ],
    encTitle: 'AES-256-CBC Encryption',
    encDesc: 'Military-grade encryption standard applied to all sensitive data.',
    encSteps: [
      { step: '01', title: 'Key', desc: 'A 32-byte (256-bit) master key is securely stored in system settings. Auto-generated via os.urandom() on first use.' },
      { step: '02', title: 'IV', desc: 'A random 16-byte initialization vector (IV) is generated for every encryption operation. The same plaintext produces different ciphertext each time.' },
      { step: '03', title: 'Encrypt', desc: 'PKCS7 padding followed by AES-256-CBC encryption. The IV and ciphertext are concatenated and Base64-encoded.' },
      { step: '04', title: 'Store', desc: 'Credentials are stored in the database, files in MinIO as .enc. Decryption is performed only when needed.' },
    ],
    agentTitle: 'What the Agent Can Do',
    agentDesc: 'Automation tasks the AI Agent performs using your stored credentials.',
    agentCards: [
      { title: 'Auto Login', items: ['Retrieve credentials from the vault', 'Auto-detect login forms via CSS selectors', 'Type keystrokes with human-like delays (100ms)', 'Support multi-step login flows (username → password)'], color: 'primary' },
      { title: 'MFA/OTP Handling', items: ['Auto-detect OTP input fields', 'Request verification codes from you via WebSocket', 'Auto-fill and submit authentication codes', 'Support special login forms (Naver, etc.)'], color: 'accent' },
      { title: 'Session Management', items: ['Auto-encrypt and save cookies after login', 'Auto-load cookies on next visit', 'Per-domain cookie isolation', 'Manual cookie import/delete support'], color: 'primary' },
    ],
    isoDesc: 'User data is completely isolated and protected.',
    isolation: [
      { title: 'Per-User Data Isolation', desc: 'All Vault APIs are filtered by user ID. No access to other users\' credentials, files, or cookies is possible.' },
      { title: 'On-Demand Password Decryption', desc: 'Passwords are always masked (••••••••) in credential lists. Decryption happens server-side only when individually requested.' },
      { title: 'Original File Soft Delete', desc: 'When a file is locked to the vault, the original is soft-deleted and only the encrypted copy remains. Unlocking restores it to the original folder.' },
      { title: 'API Key Masking', desc: 'Vault master keys and API keys are masked even in the admin panel. Managed with is_secret flags in system settings.' },
    ],
    ctaTitle: 'Protect your digital assets',
    ctaDesc: 'Manage passwords, files, and sessions with military-grade encryption using Martani Vault.',
  },
};

/* ─── Page ─── */
export default function SecureDataPage() {
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
        <div className="absolute top-10 left-1/3 w-96 h-96 bg-primary-500/6 rounded-full blur-3xl"></div>
        <div className="absolute bottom-10 right-1/3 w-72 h-72 bg-accent-500/8 rounded-full blur-3xl"></div>

        <div className="max-w-5xl mx-auto px-6 py-20 lg:py-28">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-primary-500/10 border border-primary-500/20 rounded-full text-primary-400 text-xs font-medium mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-primary-400 animate-pulse"></span>
              Secure Data Foundry
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

      {/* Vault Capabilities */}
      <section className="border-t border-gray-800">
        <div className="max-w-5xl mx-auto px-6 py-20">
          <h2 className="text-2xl font-bold text-gray-50 mb-12">Vault Capabilities</h2>

          <div className="grid md:grid-cols-2 gap-12">
            <div className="space-y-10">
              <FeatureItem icon={<KeyIcon />} title={t.features[0].title} desc={t.features[0].desc} />
              <FeatureItem icon={<FileLockIcon />} title={t.features[1].title} desc={t.features[1].desc} />
            </div>
            <div className="space-y-10">
              <FeatureItem icon={<AgentLoginIcon />} title={t.features[2].title} desc={t.features[2].desc} />
              <FeatureItem icon={<CookieIcon />} title={t.features[3].title} desc={t.features[3].desc} />
            </div>
          </div>
        </div>
      </section>

      {/* Encryption Pipeline */}
      <section className="border-t border-gray-800">
        <div className="max-w-5xl mx-auto px-6 py-20">
          <h2 className="text-2xl font-bold text-gray-50 mb-4">{t.encTitle}</h2>
          <p className="text-gray-400 mb-12 max-w-lg">{t.encDesc}</p>

          <div className="grid md:grid-cols-4 gap-6">
            {t.encSteps.map((item, i) => (
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

      {/* Agent Capabilities */}
      <section className="border-t border-gray-800">
        <div className="max-w-5xl mx-auto px-6 py-20">
          <h2 className="text-2xl font-bold text-gray-50 mb-4">{t.agentTitle}</h2>
          <p className="text-gray-400 mb-12 max-w-lg">{t.agentDesc}</p>

          <div className="grid md:grid-cols-3 gap-6">
            {t.agentCards.map((card, i) => (
              <div key={i} className="bg-gray-800 border border-gray-700 rounded-xl p-6">
                <div className={`w-10 h-10 rounded-lg bg-${card.color}-500/15 flex items-center justify-center mb-4`}>
                  <div className={`w-3 h-3 rounded-full bg-${card.color}-500`}></div>
                </div>
                <h3 className="text-gray-50 font-semibold mb-4">{card.title}</h3>
                <ul className="space-y-2">
                  {card.items.map((item, j) => (
                    <li key={j} className="flex items-start gap-2 text-gray-400 text-sm">
                      <span className={`w-1 h-1 rounded-full bg-${card.color}-500 mt-2 flex-shrink-0`}></span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Data Protection */}
      <section className="border-t border-gray-800">
        <div className="max-w-5xl mx-auto px-6 py-20">
          <h2 className="text-2xl font-bold text-gray-50 mb-4">Data Protection</h2>
          <p className="text-gray-400 mb-12 max-w-lg">{t.isoDesc}</p>

          <div className="grid md:grid-cols-2 gap-4">
            {t.isolation.map((item, i) => (
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
