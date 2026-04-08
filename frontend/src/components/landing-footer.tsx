'use client';

import Link from 'next/link';
import { MartaniLogo } from '@/components/martani-logo';
import { LanguageSwitcher } from '@/components/language-switcher';
import { useTranslation } from '@/hooks/use-translation';

export function LandingFooter() {
  const { t } = useTranslation('landing');

  const columns = [
    {
      title: t('footer.product._title'),
      links: [
        { label: t('footer.product.aiAnalytics'), href: '/features/ai-analytics' },
        { label: t('footer.product.cloudStorage'), href: '/features/cloud-architecture' },
        { label: t('footer.product.dataSecurity'), href: '/features/secure-data' },
        { label: t('footer.product.aiAssistant'), href: '/features/ai-analytics' },
      ],
    },
    {
      title: t('footer.resources._title'),
      links: [
        { label: t('footer.resources.getStarted'), href: '/register' },
        { label: t('footer.resources.login'), href: '/login' },
        { label: t('footer.resources.billing'), href: '/billing' },
      ],
    },
    {
      title: t('footer.policies._title'),
      links: [
        { label: t('footer.policies.terms'), href: '/terms' },
        { label: t('footer.policies.privacy'), href: '/privacy' },
        { label: t('footer.policies.cookies'), href: '/cookies' },
      ],
    },
    {
      title: t('footer.company._title'),
      links: [
        { label: t('footer.company.about'), href: '/about' },
        { label: t('footer.company.contact'), href: 'mailto:support@martani.cloud', external: true },
      ],
    },
  ];

  return (
    <footer className="border-t border-gray-800">
      {/* Sitemap columns */}
      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {columns.map((col) => (
            <div key={col.title}>
              <h3 className="text-sm font-semibold text-gray-300 mb-4">{col.title}</h3>
              <ul className="space-y-2.5">
                {col.links.map((link) => (
                  <li key={link.href}>
                    {(link as { external?: boolean }).external ? (
                      <a
                        href={link.href}
                        className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
                      >
                        {link.label}
                      </a>
                    ) : (
                      <Link
                        href={link.href}
                        className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
                      >
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-gray-800">
        <div className="max-w-7xl mx-auto px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-gray-500 text-sm">
            <MartaniLogo size={20} />
            <span>{t('footer.copyright')}</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-gray-600 text-xs">{t('footer.tagline')}</span>
            <LanguageSwitcher />
          </div>
        </div>
      </div>
    </footer>
  );
}
