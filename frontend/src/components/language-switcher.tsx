'use client';

import { Globe } from 'lucide-react';
import { useI18nStore, type Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';

export function LanguageSwitcher({ className }: { className?: string }) {
  const locale = useI18nStore((s) => s.locale);
  const setLocale = useI18nStore((s) => s.setLocale);

  const toggle = () => {
    const next: Locale = locale === 'ko' ? 'en' : 'ko';
    setLocale(next);
  };

  return (
    <button
      onClick={toggle}
      className={cn(
        'flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-200 transition-colors',
        className
      )}
      title={locale === 'ko' ? 'English' : '한국어'}
    >
      <Globe className="w-4 h-4" />
      <span className="uppercase text-xs font-medium">{locale === 'ko' ? 'EN' : 'KO'}</span>
    </button>
  );
}
