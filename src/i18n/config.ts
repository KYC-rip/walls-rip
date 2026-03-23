import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

import en from './locales/en/common.json'
import zhTW from './locales/zh-TW/common.json'
import ru from './locales/ru/common.json'
import es from './locales/es/common.json'
import pt from './locales/pt/common.json'
import ja from './locales/ja/common.json'
import commsEn from '../../public/locales/en/comms.json'

export const SUPPORTED_LANGS = ['en', 'zh-TW', 'ru', 'es', 'pt', 'ja'] as const
export type SupportedLang = (typeof SUPPORTED_LANGS)[number]

const pathDetector = {
  name: 'path' as const,
  lookup(): string {
    const segments = window.location.pathname.split('/')
    const first = segments[1]
    if (first && (SUPPORTED_LANGS as readonly string[]).includes(first)) {
      return first
    }
    return 'en'
  },
  cacheUserLanguage() {
    // no-op: path is the source of truth
  },
}

const languageDetector = new LanguageDetector()
languageDetector.addDetector(pathDetector)

i18n
  .use(languageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { common: { ...en, ...commsEn } },
      'zh-TW': { common: { ...zhTW, ...commsEn } },
      ru: { common: { ...ru, ...commsEn } },
      es: { common: { ...es, ...commsEn } },
      pt: { common: { ...pt, ...commsEn } },
      ja: { common: { ...ja, ...commsEn } },
    },
    defaultNS: 'common',
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
    initImmediate: false,
    detection: {
      order: ['path'],
      caches: [],
    },
  })

export default i18n
