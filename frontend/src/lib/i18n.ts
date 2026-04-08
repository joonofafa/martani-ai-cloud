import { create } from 'zustand';

export type Locale = 'ko' | 'en';

const STORAGE_KEY = 'martani_locale';
const DEFAULT_LOCALE: Locale = 'ko';

// Static imports for locale files (avoids dynamic import issues with webpack)
import koCommon from '@/locales/ko/common.json';
import enCommon from '@/locales/en/common.json';
import koAuth from '@/locales/ko/auth.json';
import enAuth from '@/locales/en/auth.json';
import koLanding from '@/locales/ko/landing.json';
import enLanding from '@/locales/en/landing.json';
import koFiles from '@/locales/ko/files.json';
import enFiles from '@/locales/en/files.json';
import koChat from '@/locales/ko/chat.json';
import enChat from '@/locales/en/chat.json';
import koIndexing from '@/locales/ko/indexing.json';
import enIndexing from '@/locales/en/indexing.json';
import koVault from '@/locales/ko/vault.json';
import enVault from '@/locales/en/vault.json';
import koNotes from '@/locales/ko/notes.json';
import enNotes from '@/locales/en/notes.json';
import koAdmin from '@/locales/ko/admin.json';
import enAdmin from '@/locales/en/admin.json';
import koTools from '@/locales/ko/tools.json';
import enTools from '@/locales/en/tools.json';
import koBilling from '@/locales/ko/billing.json';
import enBilling from '@/locales/en/billing.json';
import koSchedule from '@/locales/ko/schedule.json';
import enSchedule from '@/locales/en/schedule.json';

const localeModules: Record<Locale, Record<string, Record<string, unknown>>> = {
  ko: {
    common: koCommon, auth: koAuth, landing: koLanding,
    files: koFiles, chat: koChat, indexing: koIndexing, vault: koVault,
    notes: koNotes, admin: koAdmin, tools: koTools, billing: koBilling,
    schedule: koSchedule,
  },
  en: {
    common: enCommon, auth: enAuth, landing: enLanding,
    files: enFiles, chat: enChat, indexing: enIndexing, vault: enVault,
    notes: enNotes, admin: enAdmin, tools: enTools, billing: enBilling,
    schedule: enSchedule,
  },
};

interface I18nState {
  locale: Locale;
  translations: Record<string, Record<string, unknown>>;
  setLocale: (locale: Locale) => void;
  loadNamespaces: (namespaces: string[]) => void;
}

function getInitialLocale(): Locale {
  if (typeof window === 'undefined') return DEFAULT_LOCALE;
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === 'ko' || saved === 'en') return saved;
  return DEFAULT_LOCALE;
}

export const useI18nStore = create<I18nState>((set, get) => ({
  locale: getInitialLocale(),
  translations: {},

  setLocale: (locale: Locale) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, locale);
    }
    // Reload all currently loaded namespaces for the new locale
    const loaded = Object.keys(get().translations);
    const newTranslations: Record<string, Record<string, unknown>> = {};
    for (const ns of loaded) {
      const mod = localeModules[locale]?.[ns];
      if (mod) newTranslations[ns] = mod;
    }
    set({ locale, translations: newTranslations });
  },

  loadNamespaces: (namespaces: string[]) => {
    const { locale, translations } = get();
    const newTranslations = { ...translations };
    let changed = false;
    for (const ns of namespaces) {
      if (newTranslations[ns]) continue;
      const mod = localeModules[locale]?.[ns];
      if (mod) {
        newTranslations[ns] = mod;
        changed = true;
      }
    }
    if (changed) set({ translations: newTranslations });
  },
}));
