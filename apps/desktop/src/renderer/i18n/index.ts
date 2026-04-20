import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import koCommon from './locales/ko/common.json';
import koSidebar from './locales/ko/sidebar.json';
import koSettings from './locales/ko/settings.json';
import koInbox from './locales/ko/inbox.json';

import enCommon from './locales/en/common.json';
import enSidebar from './locales/en/sidebar.json';
import enSettings from './locales/en/settings.json';
import enInbox from './locales/en/inbox.json';

export const SUPPORTED_LOCALES = ['ko', 'en'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: SupportedLocale = 'ko';

const LOCAL_STORAGE_KEY = 'estate-erp:locale';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      ko: {
        common: koCommon,
        sidebar: koSidebar,
        settings: koSettings,
        inbox: koInbox,
      },
      en: {
        common: enCommon,
        sidebar: enSidebar,
        settings: enSettings,
        inbox: enInbox,
      },
    },
    fallbackLng: DEFAULT_LOCALE,
    supportedLngs: SUPPORTED_LOCALES as unknown as string[],
    defaultNS: 'common',
    ns: ['common', 'sidebar', 'settings', 'inbox'],
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: LOCAL_STORAGE_KEY,
    },
  });

export function changeLocale(locale: SupportedLocale) {
  i18n.changeLanguage(locale);
  localStorage.setItem(LOCAL_STORAGE_KEY, locale);
}

export function currentLocale(): SupportedLocale {
  const lang = i18n.language.split('-')[0];
  return (SUPPORTED_LOCALES as readonly string[]).includes(lang)
    ? (lang as SupportedLocale)
    : DEFAULT_LOCALE;
}

export default i18n;
