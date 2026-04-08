import { useEffect } from 'react';
import { useI18nStore, type Locale } from '@/lib/i18n';

function getNestedValue(obj: Record<string, unknown>, path: string): string | undefined {
  const keys = path.split('.');
  let current: unknown = obj;
  for (const key of keys) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === 'string' ? current : undefined;
}

function interpolate(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) =>
    params[key] != null ? String(params[key]) : `{{${key}}}`
  );
}

export function useTranslation(ns: string | string[]): {
  t: (key: string, params?: Record<string, string | number>) => string;
  locale: Locale;
} {
  const namespaces = Array.isArray(ns) ? ns : [ns];
  const locale = useI18nStore((s) => s.locale);
  const translations = useI18nStore((s) => s.translations);
  const loadNamespaces = useI18nStore((s) => s.loadNamespaces);

  useEffect(() => {
    loadNamespaces(namespaces);
  }, [locale]); // eslint-disable-line react-hooks/exhaustive-deps

  // Also load on first render (sync)
  const missing = namespaces.filter((n) => !translations[n]);
  if (missing.length > 0) {
    loadNamespaces(missing);
  }

  const t = (key: string, params?: Record<string, string | number>): string => {
    // Search across all requested namespaces
    for (const n of namespaces) {
      const nsData = translations[n];
      if (!nsData) continue;
      const value = getNestedValue(nsData, key);
      if (value !== undefined) {
        return params ? interpolate(value, params) : value;
      }
    }
    // Fallback: return the key itself
    return key;
  };

  return { t, locale };
}
