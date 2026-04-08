'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/store';
import Link from 'next/link';
import { MartaniLogo } from '@/components/martani-logo';
import { LanguageSwitcher } from '@/components/language-switcher';
import { LandingFooter } from '@/components/landing-footer';
import { useTranslation } from '@/hooks/use-translation';

/* ─── Feature Card Icons (Animated SVG) ─── */
function AiBrainIcon() {
  const nodes = [
    { cx: 24, cy: 14, r: 4 },
    { cx: 12, cy: 10, r: 2.5 },
    { cx: 36, cy: 10, r: 2.5 },
    { cx: 8, cy: 24, r: 2.5 },
    { cx: 40, cy: 24, r: 2.5 },
    { cx: 14, cy: 36, r: 2.5 },
    { cx: 34, cy: 36, r: 2.5 },
    { cx: 24, cy: 40, r: 2 },
  ];
  const edges: [number, number][] = [
    [0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [0, 6],
    [1, 3], [2, 4], [3, 5], [4, 6], [5, 7], [6, 7], [1, 2],
  ];
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
      <defs>
        <filter id="iconGlow">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      {edges.map(([a, b], i) => (
        <line key={i} x1={nodes[a].cx} y1={nodes[a].cy} x2={nodes[b].cx} y2={nodes[b].cy}
          stroke={i % 2 === 0 ? '#F97316' : '#14B8A6'} strokeWidth="0.8" className="hero-dash" opacity="0.5" />
      ))}
      {nodes.map((n, i) => (
        <circle key={i} cx={n.cx} cy={n.cy} r={n.r}
          fill={i === 0 ? '#F97316' : i % 2 === 0 ? '#14B8A6' : '#FB923C'}
          className="hero-pulse" filter="url(#iconGlow)"
          style={{ animationDelay: `${i * 0.3}s` }} opacity="0.8" />
      ))}
    </svg>
  );
}

function CloudScaleIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
      <defs>
        <filter id="iconGlow2">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      {/* Cloud shape */}
      <path d="M14,30 Q8,30 8,24 Q8,18 14,18 Q14,12 22,10 Q30,8 34,14 Q40,14 42,20 Q44,26 38,30 Z"
        stroke="#14B8A6" strokeWidth="1.5" fill="none" opacity="0.7" />
      <path d="M14,30 Q8,30 8,24 Q8,18 14,18 Q14,12 22,10 Q30,8 34,14 Q40,14 42,20 Q44,26 38,30 Z"
        fill="#14B8A6" opacity="0.08" />
      {/* Upload arrows */}
      <path d="M20,28 L20,20 M17,23 L20,20 L23,23" stroke="#F97316" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.8" />
      <path d="M28,30 L28,22 M25,25 L28,22 L31,25" stroke="#F97316" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.6" />
      {/* Data particles floating up */}
      <circle r="1.5" fill="#F97316" opacity="0.7" filter="url(#iconGlow2)">
        <animate attributeName="cx" values="18;22;18" dur="3s" repeatCount="indefinite" />
        <animate attributeName="cy" values="36;14;36" dur="3s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0;0.8;0" dur="3s" repeatCount="indefinite" />
      </circle>
      <circle r="1" fill="#14B8A6" opacity="0.6">
        <animate attributeName="cx" values="30;26;30" dur="2.5s" repeatCount="indefinite" begin="0.8s" />
        <animate attributeName="cy" values="38;16;38" dur="2.5s" repeatCount="indefinite" begin="0.8s" />
        <animate attributeName="opacity" values="0;0.7;0" dur="2.5s" repeatCount="indefinite" begin="0.8s" />
      </circle>
      <circle r="1" fill="#FB923C" opacity="0.5">
        <animate attributeName="cx" values="24;20;24" dur="3.2s" repeatCount="indefinite" begin="1.5s" />
        <animate attributeName="cy" values="40;12;40" dur="3.2s" repeatCount="indefinite" begin="1.5s" />
        <animate attributeName="opacity" values="0;0.6;0" dur="3.2s" repeatCount="indefinite" begin="1.5s" />
      </circle>
    </svg>
  );
}

function AssistantIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
      <defs>
        <filter id="iconGlow3">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      {/* Person silhouette */}
      <circle cx="24" cy="14" r="6" stroke="#F97316" strokeWidth="1.5" fill="none" opacity="0.7" />
      <path d="M12,38 Q12,26 24,26 Q36,26 36,38" stroke="#F97316" strokeWidth="1.5" fill="none" opacity="0.5" />
      <path d="M12,38 Q12,26 24,26 Q36,26 36,38" fill="#F97316" opacity="0.05" />
      {/* Chat bubble */}
      <rect x="28" y="8" width="14" height="10" rx="3" stroke="#14B8A6" strokeWidth="1.2" fill="none" opacity="0.7" />
      <path d="M32,18 L30,22 L34,18" stroke="#14B8A6" strokeWidth="1.2" fill="none" opacity="0.7" />
      {/* Sparkle dots orbiting */}
      <circle r="1.5" fill="#14B8A6" opacity="0.8" filter="url(#iconGlow3)">
        <animate attributeName="cx" values="33;37;33" dur="2s" repeatCount="indefinite" />
        <animate attributeName="cy" values="11;14;11" dur="2s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.4;0.9;0.4" dur="2s" repeatCount="indefinite" />
      </circle>
      <circle r="1" fill="#FB923C" opacity="0.6">
        <animate attributeName="cx" values="36;32;36" dur="2.5s" repeatCount="indefinite" begin="0.5s" />
        <animate attributeName="cy" values="15;11;15" dur="2.5s" repeatCount="indefinite" begin="0.5s" />
        <animate attributeName="opacity" values="0.3;0.7;0.3" dur="2.5s" repeatCount="indefinite" begin="0.5s" />
      </circle>
    </svg>
  );
}


/* ─── Hero Mesh Background ─── */
function HeroMesh() {
  const [blinkDots, setBlinkDots] = useState<Array<{ x: number; y: number; dur: number; delay: number }>>([]);

  useEffect(() => {
    const dots: typeof blinkDots = [];
    const used = new Set<string>();
    const count = 22;
    for (let i = 0; i < count; i++) {
      let x: number, y: number, key: string;
      do {
        x = Math.floor(Math.random() * 22) * 60;
        y = Math.floor(Math.random() * 10) * 60;
        key = `${x},${y}`;
      } while (used.has(key));
      used.add(key);
      dots.push({
        x,
        y,
        dur: 2.5 + Math.random() * 5,
        delay: Math.random() * 6,
      });
    }
    setBlinkDots(dots);
  }, []);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {/* Grid mesh SVG */}
      <svg className="absolute inset-0 w-full h-full" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="heroGrid" width="60" height="60" patternUnits="userSpaceOnUse">
            <path d="M 60 0 L 0 0 0 60" fill="none" stroke="#F97316" strokeWidth="0.5" />
            <circle cx="0" cy="0" r="1" fill="#F97316" opacity="0.6" />
            <circle cx="60" cy="0" r="1" fill="#F97316" opacity="0.6" />
            <circle cx="0" cy="60" r="1" fill="#F97316" opacity="0.6" />
            <circle cx="60" cy="60" r="1" fill="#F97316" opacity="0.6" />
          </pattern>
          <radialGradient id="meshFadeGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="white" stopOpacity="1" />
            <stop offset="50%" stopColor="white" stopOpacity="0.7" />
            <stop offset="80%" stopColor="white" stopOpacity="0.2" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </radialGradient>
          <mask id="meshFadeMask">
            <rect width="100%" height="100%" fill="url(#meshFadeGrad)" />
          </mask>
          <filter id="blinkGlow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <rect width="100%" height="100%" fill="url(#heroGrid)" mask="url(#meshFadeMask)" opacity="0.12" />

        {/* Blinking dots at grid intersections */}
        <g mask="url(#meshFadeMask)">
          {blinkDots.map((dot, i) => (
            <circle
              key={i}
              cx={dot.x}
              cy={dot.y}
              r="2"
              fill="#F97316"
              filter="url(#blinkGlow)"
              className="mesh-blink"
              style={{ animationDuration: `${dot.dur}s`, animationDelay: `${dot.delay}s` }}
            />
          ))}
        </g>
      </svg>

      {/* Animated floating glow orbs */}
      <div className="absolute w-[500px] h-[500px] rounded-full bg-orange-500/[0.07] blur-[100px] mesh-float-1" />
      <div className="absolute w-[400px] h-[400px] rounded-full bg-amber-400/[0.05] blur-[120px] mesh-float-2" />
      <div className="absolute w-[300px] h-[300px] rounded-full bg-orange-600/[0.04] blur-[80px] mesh-float-3" />
    </div>
  );
}

/* ─── Main Page ─── */
export default function Home() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuthStore();
  const { t } = useTranslation('landing');

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.push('/files');
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  if (isAuthenticated) return null;

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Navbar */}
      <nav className="relative z-10 border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-shrink-0">
            <MartaniLogo size={32} />
            <span className="text-lg sm:text-xl font-bold text-gray-50">Martani</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
            <LanguageSwitcher />
            <Link href="/login" className="text-xs sm:text-sm text-gray-400 hover:text-gray-200 transition-colors whitespace-nowrap">
              {t('nav.login')}
            </Link>
            <Link href="/register"
              className="text-xs sm:text-sm px-3 sm:px-5 py-1.5 sm:py-2 border border-primary-500 text-primary-400 hover:bg-primary-500 hover:text-white rounded-lg transition-all font-medium whitespace-nowrap">
              {t('nav.cta')}
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section — GitHub-style centered */}
      <section className="relative overflow-hidden border-b border-gray-800">
        {/* Background glows */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[500px] bg-primary-500/[0.07] rounded-full blur-[120px] pointer-events-none"></div>
        <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-accent-500/[0.05] rounded-full blur-[100px] pointer-events-none"></div>

        {/* Animated mesh grid */}
        <HeroMesh />

        <div className="relative max-w-4xl mx-auto px-6 pt-24 pb-20 lg:pt-36 lg:pb-28 text-center">
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold text-gray-50 leading-[1.1] tracking-tight mb-6">
            {t('hero.titlePre')}{' '}
            <span className="bg-gradient-to-r from-primary-400 via-primary-500 to-accent-400 bg-clip-text text-transparent">
              {t('hero.titleHighlight')}
            </span>{' '}
            {t('hero.titlePost')}
          </h1>
          <p className="text-xl text-gray-400 max-w-2xl mx-auto mb-10 leading-relaxed">
            {t('hero.subtitle')}
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/register"
              className="px-8 py-3.5 bg-primary-500 hover:bg-primary-600 text-white rounded-lg font-semibold text-base transition-all shadow-lg shadow-primary-500/25">
              {t('hero.getStarted')}
            </Link>
            <Link href="/login"
              className="px-8 py-3.5 border border-gray-600 text-gray-300 hover:border-gray-400 hover:text-white rounded-lg font-medium text-base transition-all">
              {t('hero.signIn')}
            </Link>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="relative">
        <div className="max-w-7xl mx-auto px-6 py-16">
          <div className="grid md:grid-cols-3 gap-8">
            {/* Card 1: AI-Powered Analytics */}
            <div className="bg-gray-800 border border-gray-700 rounded-2xl p-8 flex flex-col">
              <div className="mb-5">
                <AiBrainIcon />
              </div>
              <h3 className="text-lg font-bold text-gray-50 mb-3">{t('features.ai.title')}</h3>
              <p className="text-gray-400 text-sm leading-relaxed flex-1">
                {t('features.ai.description')}
              </p>
              <div className="mt-6">
                <Link href="/features/ai-analytics"
                  className="inline-block px-5 py-2.5 border border-primary-500 text-primary-400 hover:bg-primary-500 hover:text-white text-sm font-semibold rounded-lg transition-all">
                  {t('features.ai.learnMore')}
                </Link>
              </div>
            </div>

            {/* Card 2: Scalable Cloud Architecture */}
            <div className="bg-gray-800 border border-gray-700 rounded-2xl p-8 flex flex-col">
              <div className="mb-5">
                <CloudScaleIcon />
              </div>
              <h3 className="text-lg font-bold text-gray-50 mb-3">{t('features.cloud.title')}</h3>
              <p className="text-gray-400 text-sm leading-relaxed flex-1">
                {t('features.cloud.description')}
              </p>
              <div className="mt-6">
                <Link href="/features/cloud-architecture"
                  className="inline-block px-5 py-2.5 border border-accent-500 text-accent-400 hover:bg-accent-500 hover:text-white text-sm font-semibold rounded-lg transition-all">
                  {t('features.cloud.learnMore')}
                </Link>
              </div>
            </div>

            {/* Card 3: AI Personal Assistant */}
            <div className="bg-gray-800 border border-gray-700 rounded-2xl p-8 flex flex-col">
              <div className="mb-5">
                <AssistantIcon />
              </div>
              <h3 className="text-lg font-bold text-gray-50 mb-3">{t('features.assistant.title')}</h3>
              <p className="text-gray-400 text-sm leading-relaxed flex-1">
                {t('features.assistant.description')}
              </p>
              <div className="mt-6">
                <Link href="/features/ai-assistant"
                  className="inline-block px-5 py-2.5 border border-primary-500 text-primary-400 hover:bg-primary-500 hover:text-white text-sm font-semibold rounded-lg transition-all">
                  {t('features.assistant.learnMore')}
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <LandingFooter />
    </div>
  );
}
