'use client';

export function MartaniLogo({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className="logo-glow">
      <defs>
        <linearGradient id="logoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FB923C" />
          <stop offset="100%" stopColor="#EA580C" />
        </linearGradient>
      </defs>
      <path
        d="M24 4L42 14V34L24 44L6 34V14L24 4Z"
        stroke="url(#logoGrad)"
        strokeWidth="1.5"
        fill="none"
        opacity="0.4"
        className="logo-draw-outer"
      />
      <path
        d="M14 34V18L24 26L34 18V34"
        stroke="url(#logoGrad)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        className="logo-draw-m"
      />
      <path
        d="M24 22L27 26L24 30L21 26Z"
        fill="#F97316"
        className="logo-draw-diamond"
      />
    </svg>
  );
}
